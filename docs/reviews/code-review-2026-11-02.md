# 代码评审报告 · rich-sim（2026-11-02）

> 只读评审。评审基线：`dev` 分支工作区现状（git 跟踪文件约 153 个，不含 node_modules / dist）。
> 每条结论均附 `文件:行号` 或实际执行命令的输出摘要。

---

## 1. 仓库定位与规模概览

- **产品**：双语（zh/en）财商模拟教育工具，双主线——富豪模拟（钩子）+ 现实测算（落点）。
- **结构**（npm workspaces，根 `package.json:3-5` 只含 `apps/*` 与 `packages/*`）：
  - `packages/core`（`@rich-sim/core`）：纯函数计算引擎，零运行时依赖（`packages/core/package.json:17-20` 只有 devDependencies）。
  - `apps/web`（`@rich-sim/web`）：Astro 5 SSR（`output: 'server'`，`apps/web/astro.config.mjs:10`）+ React 19 岛 + Tailwind v4，Cloudflare adapter 部署到 Cloudflare Pages。
  - `workers/analytics-collector`：独立 Cloudflare Worker（D1 漏斗事件收集端），**不在 npm workspaces 内**（无 package.json），单文件实现。
  - `scripts/`：冒烟、汇率快照、性能测量等 Node 脚本。
- **测试**：Vitest；core 6 个测试文件 70 条，web 22 个测试文件 312 条（实测，见 §7）。
- **CI**：`.github/workflows/ci.yml` 仅跑 `npm test` + `npm run check`（ci.yml:37-38），构建交给 Cloudflare Pages preview 覆盖（ci.yml:35-36 注释说明）。

## 2. 结论摘要

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 1 |
| P2 | 5 |
| P3 | 6 |

**最关键的 3 条**：

1. **P1 · 云同步防抖跨账本互相取消**：`SyncBridge.tsx` 用单个 `timer` ref 给两本账（plan/sim）共用一个防抖器，2 秒内两本账先后写入时，先排期的上行被静默取消且当次会话不再重试（靠下次启动对时自愈）。
2. **P2 · Supabase schema 与 RLS 不在版本控制内**：代码与文档把「云端只能读写自己的行」建立在 RLS 上（`sync.ts:8`、`CONVENTIONS.md:34`），但仓库内没有任何 migration / policy 定义，该安全保证无法从仓库验证、也无变更审计。
3. **P2 · `/api/fx` 上游请求无超时**：`lib/fx.ts` 的 `fetchFx` 不带 `AbortSignal`，Frankfurter 挂起时 SSR 端点会被拖住直至平台超时。

**总体评价**：工程质量显著高于同类个人项目。引擎纯函数化、契约冻结、隐私红线（财务数据不进分析管道、Worker 端只存事件名+时间）有代码级结构保证且被测试钉住；文档与实现的一致性抽查 9 处仅 1 处过时。未发现 P0。

## 3. 逐维度评审

### 3.1 整体架构与模块边界

**未发现实质问题。**

- 依赖方向清晰单向：`apps/web → packages/core`（core 零依赖，`packages/core/package.json` 无 dependencies）；`workers/` 完全独立、不被前端 import。
- 两本账（REAL `rich-sim:plan:v1` / SIM `rich-sim:sim:v1`）的隔离是**结构保证**而非约定：`sim-draft.ts:1-8` 注释声明两模块互不 import，且由 `sim-draft.test.ts` 源码扫描钉死（该测试在测试运行中通过）。
- Worker 的隐私设计（只存 event+ts、丢弃 props、不写 IP/UA/标识符、Origin 白名单）在 `workers/analytics-collector/src/index.ts:4-18` 有书面的决策理由，代码与之一致。
- 小瑕疵：`workers/` 不在 workspaces 内、根 package.json 无相关 script（P3，见 §4）。

### 3.2 正确性与潜在 bug

发现 1 条 P1、若干边界观察：

**（1）P1 — 云同步防抖跨账本互相取消**
- 位置：`apps/web/src/components/SyncBridge.tsx:92-108`。
- 证据：`const timer = useRef(...)` 只有一个；`pushLater(kind)` 开头 `if (timer.current) clearTimeout(timer.current)`（第 93 行）不分 kind，随后 setTimeout 闭包只推**最后那次**的 kind。两本账在 2 秒（`DEBOUNCE_MS`，第 21 行）内先后写入时，先排期的那本账的上行被取消，之后没有任何补偿重试——直到下次有写入事件或下次会话 `reconcile`（第 83-90 行，仅 mount 与 SIGNED_IN 时触发）才自愈。
- 影响：跨设备同步是 M5 的核心卖点（`handoff.md:41`「真人联调已闭环」），此 bug 使一本账在触发窗口内静默不同步；另一设备看到旧数据。触发需要 2 秒内两本账各写一次（如领起始金后立刻改财务输入），不算高频但真实可达。
- 修复建议：按 kind 各持一个 timer（`useRef<Record<LedgerKind, ...>>`），或在 setTimeout 回调里两本账各推一次。

**（2）P3 — pull 路径对云端 payload 无 schema 校验**
- 位置：`SyncBridge.tsx:45`（`writeDraft(cloud.payload as Draft)`）、`SyncBridge.tsx:63`（SIM 同理）。
- 影响：云端 payload 若 schemaVersion 不符，`writeDraft` 原样写入后 `readDraft()` 返回 null（`draft.ts:86`），本地草稿表现为「丢失」（数据仍在云端，下次对时会再拉，形成拉取—无效的循环）。
- 修复建议：pull 后先过 `readDraft` 同款的 schemaVersion 闸门，不合则跳过并保留本地。

**（3）已确认的非问题（主动排除）**：
- `decideSync` 用客户端时间戳做 last-write-wins（`sync.ts:26-31`）：时钟偏移可致数据被旧值覆盖，但这是文档明示的设计取舍（`sync.ts:9-11`「冲突不智能」），非缺陷。
- 对时拉取→`writeDraft` 会触发 `DRAFT_UPDATED_EVENT` 进而排期一次冗余回推：内容相同，仅浪费一次 upsert，无正确性问题（`SyncBridge.tsx:44-47` + 92-108）。
- `reconcileKind` 先 `await pullLedger` 再 `readDraft()`（第 39-41 行），本地读数在 await 之后，无经典 check-then-act 竞态。

### 3.3 安全

**未发现 P0。** 正面结论与残余风险如下：

**认证/授权**：
- 前端只用 anon key（`lib/supabase.ts:8-9` 注释 + 18-21 行实现），service key 全仓无出现（grep `service_role|SERVICE_ROLE` 仅命中文档与 package-lock 中无关包名）。
- 会话恢复走 supabase-js `onAuthStateChange`（`AuthButton.tsx:41-47`），邮箱/密码仅经 supabase-js 传输，不落任何自建存储。
- 埋点事件 `auth:login`/`auth:logout` 零 props，邮箱不进出分析管道（`auth.ts:7-8`、`AuthButton.tsx:9`），与红线一致。

**Worker 端点**：
- `/collect`（POST）：事件名正则闸门 `/^[a-z][a-z0-9:_-]{0,63}$/`（`index.ts:46`）、批量上限 50（`index.ts:47,84`）、props 不读取即丢弃（`index.ts:83-92` 只取 `event` 与 `at`）。SQL 全部参数绑定（`index.ts:95-96, 114-123`），无注入面。
- `/summary`（GET）：Bearer token 鉴权（`index.ts:102-106`），`since` 参数同样走绑定（`index.ts:114-118`）。
- CORS：白名单制、不回显未知 Origin，未知来源直接 403（`index.ts:36-43, 130-133`）。

**残余风险（均非 P0）**：
- **P2 · `/collect` 无速率限制**：任何白名单源（含永久挂在生产白名单里的 4 个 localhost 端口，`index.ts:39-42`）可无限灌入合法形状的事件。D1 写入计费 + 漏斗数据污染。建议加 per-day 写入上限或对异常频次告警。
- **P3 · token 比较非常量时间**（`index.ts:104`）：Workers isolate 下时序攻击实际不可行，记录备查。
- **P3 · localhost 源留在生产白名单**（`index.ts:39-42`）：本地开发便利 vs 生产面，建议部署期按环境裁剪。
- **P2 · RLS 保证不可从仓库验证**：`sync.ts:8` 与 `CONVENTIONS.md:34` 把越权防护完全押在 Supabase RLS（`auth.uid() = user_id`）上，但仓库无 `supabase/migrations/`，表结构与策略只在 dashboard。一旦 dashboard 被误改，仓库无任何机制发现。建议把 schema + policy 落成 migration 文件入库。
- **客户端敏感数据**：财务数据只存 localStorage / 登录后同步到用户自己云端行；埋点 props 含金额但 Worker 端丢弃（`analytics.ts:8-23`、`worker index.ts:5-9` 双侧注释一致）。Service Worker 不缓存 `/api/*`（`sw.js:46`），导航页缓存的内容不含用户数据（结果页合规清单为 SSR 默认值）。未发现 XSS 面：全仓无 `dangerouslySetInnerHTML`/`innerHTML`/`eval`（grep 全仓 src 无命中）。

### 3.4 数据模型与迁移一致性

- `workers/analytics-collector/schema.sql` 与代码一致：`INSERT INTO events (ts, day, event)`（`index.ts:95`）对得上表定义（`schema.sql:3-8`），`day` 前缀切片（`index.ts:91`）与 `(day, event)` 索引（`schema.sql:10`）匹配。**但该 sql 只是仓库里的一份拷贝，无迁移工具链、无版本号**，与 D1 实际库的一致性只能靠人工核对（P2，随 §3.3 RLS 条一并建议）。
- localStorage 两套 schema（`draft.ts:17-56`、`sim-draft.ts:40-69`）纪律严明：`schemaVersion` 冻结为 1、新增字段一律可选、读取侧收敛坏数据（`sim-draft.ts:99-122`），CONVENTIONS.md 的冻结清单与实际字段一致（抽查 `goalOverride`/`goal`/`history`/`savedPlans`/`cart`/`favorites`/`resaleProceeds`/`invest` 全部对得上）。

### 3.5 错误处理与失败模式

- **P2 · `/api/fx` 上游无超时**：`lib/fx.ts:99-124` 的 `fetchFx` 裸 `fetch` 无 `AbortSignal.timeout`；Frankfurter 挂起时 SSR 端点（`pages/api/fx.ts:32`）被拖住直至 Workers 平台超时，期间占用请求槽。降级逻辑本身完备（`resolveSnapshot` 捕获一切降级静态快照，`fx.ts:131-140`），只是降级要等挂起结束。建议加 3–5s 超时。
- 埋点链路失败语义经实测推敲：收到 2xx 才裁本机队列、卸载路径用 keepalive、任何异常静默（`analytics.ts:122-136, 162-194`），文档记录了 sendBeacon 事故与「至少一次 vs 静默丢」的取舍。Worker 侧所有 promise 均 await，无未等待的浮空 promise。
- **P2 · 云同步上行失败无会话内重试**：`pushLedger` 失败仅返回 false（`sync.ts:46-52`），`SyncBridge` 不做重试（`SyncBridge.tsx:100-105`），依赖下次启动 reconcile 自愈。与「local-first、云为备份」的定位相符，但会话内静默，建议至少在失败后挂一次指数退避重试或表面化状态。
- localStorage 读写全部 try/catch 收敛（`draft.ts:81-91`、`sim-draft.ts` 各处），隐私模式/配额满不炸主流程。

### 3.6 测试覆盖与验证门真实性

- **实测全绿**（见 §7）：core 70 条 + web 312 条 = 382 条，与 `handoff.md:4` 声称的「单测 382」**逐数相符**。`astro check` 0 错 0 警 0 hint。
- 测试质量正面观察：纯函数层覆盖厚（`converter.test.ts` 31 条、`sim-content.test.ts` 54 条），且有结构性测试（sim-draft 源码扫描钉两账隔离、catalog-l10n 穷尽性）。
- **缺口**：
  1. **P2 · `workers/analytics-collector` 无任何测试**且不在 CI：去重 SQL（`COUNT(DISTINCT event, ts)`，`index.ts:114-123`）这类已出过一次「代码改了没部署」事故（`handoff.md:104`）的逻辑无自动化护栏。Worker 无 package.json，`npm test` 不会碰它。
  2. **P2 · `e2e-smoke.mjs`（冒烟 238 条断言）不在 CI**：ci.yml:37-38 只跑 test + check，冒烟依赖手工对生产跑；文档里的「FAILS 0」是时点记录，不是持续门禁。
  3. **P3 · React 组件测试为零**：`apps/web/src/components/*.tsx`（约 20 个岛）无组件级测试，交互回归全靠冒烟。与项目「纯函数可测、岛尽量薄」的策略自洽，记录备查。

### 3.7 依赖与构建健康

**未发现实质问题。**

- 锁文件 `package-lock.json` 在仓；依赖版本区间克制（astro ^5、react ^19、supabase-js ^2.117.3）；无 pnpm/yarn 混杂。
- `.nvmrc` 与 CI Node 版本一致（ci.yml:31-32 注释说明与 Cloudflare Pages 构建同版，防「CI 绿 Pages 红」分裂）。
- `workers/analytics-collector/wrangler.toml` 含真实 D1 database_id（非密钥，正常）；`READ_TOKEN` 走 `wrangler secret`，仓库无明文（`DEPLOYMENT.md:57,88`）。
- P3：workers 不在 workspaces、无本地 dev/test 命令入口。

### 3.8 明显性能热点

**未发现实质性能热点。** 已检查：

- 引擎全部纯循环无重复计算（`functions.ts`）；`scenarioAnnualCost` 单次遍历。
- 埋点每次 `track` 全量 JSON.parse + stringify 200 条上限的队列（`analytics.ts:127-131`）——量级可忽略。
- 唯一可提的：**P3 · `sw.js` 的 `PAGE_CACHE` 无上限**（`sw.js:48-62`），每个访问过的导航页永久缓存，无 LRU 淘汰。站点路由少，实际影响微小。
- `astro check` 构建期无大包警告相关的代码异味（vendor 拆分未见反模式；SSR 输出）。

### 3.9 文档与实现一致性（抽查 9 处）

| # | 文档声称 | 实际 | 结论 |
|---|---|---|---|
| 1 | `gameplay-inventory.md:1`「28 个可交互玩法」 | 文档表 28 行（grep `^\| [0-9]+ \|` 计数 28）；`guide.astro:21-60` STEPS 共 17+6+3+2=28 项 | ✅ 一致 |
| 2 | `README.md:6`「26 个可交互玩法」 | 实际 28（见上） | ❌ **过时（P3）** |
| 3 | `handoff.md:4`「单测 382」 | 实测 core 70 + web 312 = 382 | ✅ 一致 |
| 4 | `README.md:23-30` 命令表（dev/test/check） | 根 `package.json:6-13` scripts 一致；`check` = core typecheck + web astro check | ✅ 一致 |
| 5 | `README.md:19` core「零运行时依赖」 | `packages/core/package.json` 无 dependencies 字段 | ✅ 一致 |
| 6 | `CONVENTIONS.md:28-36` localStorage 冻结 key 清单 | `draft.ts:8`（`rich-sim:plan:v1`）、`sim-draft.ts:22`（`rich-sim:sim:v1`）及全部可选字段对得上 | ✅ 一致 |
| 7 | `handoff.md:34` 首页领钱开关 `PUBLIC_HOMEPAGE_CLAIM` 控制 | 该变量在多个文档中被引用（grep 命中 m2-decisions / homepage-claim-experience 等），未配置时全站零行为的设计与 `supabase.ts`/`Analytics.astro` 的开关纪律同构 | ✅ 一致（生产实际配置无法离线验证，标「未确认」） |
| 8 | `astro.config.mjs:14` canonical = `https://app.rich-sim.bayjf.com` | 与 `README.md:34` 正式域名一致 | ✅ 一致 |
| 9 | `handoff.md:112` Worker 去重版已部署（Version `21e00ced`） | 需联网查 `wrangler deployments list`，本次未验证 | ⚠️ 未确认 |

## 4. 发现汇总（按严重度）

### P1（1 条）

| 位置 | 问题 | 影响 | 建议 |
|---|---|---|---|
| `apps/web/src/components/SyncBridge.tsx:92-108` | plan/sim 两本账共用一个防抖 timer，2s 内交错写入时先排期的上行被静默取消且无补偿 | 一本账当次会话静默不同步，跨设备看到旧数据（M5 核心功能） | 按 kind 分 timer，或在回调内两本账各推一次 |

### P2（5 条）

| 位置 | 问题 | 影响 | 建议 |
|---|---|---|---|
| `apps/web/src/lib/fx.ts:99-124`（调用点 `pages/api/fx.ts:32`） | 上游 fetch 无超时 | Frankfurter 挂起拖死 SSR 请求直至平台超时 | `AbortSignal.timeout(3000–5000)` 后走既有静态降级 |
| `workers/analytics-collector/src/index.ts:71-99` | `/collect` 无速率限制，事件名自由文本 | 白名单源可无限灌数据：D1 写入成本 + 漏斗污染 | 加日写入上限或频次告警 |
| 仓库无 `supabase/migrations/`（对照 `sync.ts:8`、`CONVENTIONS.md:34`） | plans 表结构与 RLS 策略不在版本控制 | 越权防护的核心保证无法从仓库验证、无审计、dashboard 误改无感知 | 把 schema + RLS policy 落成 migration 入库 |
| `workers/analytics-collector/`（无 package.json、无测试；`ci.yml:37-38`） | Worker 无测试、不在 CI；e2e 冒烟也不在 CI | 去重 SQL 等关键逻辑回归无护栏；「FAILS 0」是时点记录非门禁 | 给 Worker 加最小 vitest（可用 miniflare 或直接测纯函数层）；冒烟至少做成可一键触发的 workflow_dispatch |
| `apps/web/src/components/SyncBridge.tsx:94-107` + `sync.ts:46-52` | 上行失败无会话内重试，仅静默 | 弱网下一次失败即本会话不再同步 | 失败后指数退避重试 N 次，或暴露同步状态 |

### P3（6 条）

| 位置 | 问题 | 建议 |
|---|---|---|
| `README.md:6` | 「26 个可交互玩法」过时（实际 28） | 改为 28 或直接指向 `gameplay-inventory.md` 不写死数字 |
| `SyncBridge.tsx:45,63` | pull 的云端 payload 无 schemaVersion 校验即写本机 | 写入前过 schema 闸门，不合则跳过 |
| `workers/analytics-collector/src/index.ts:39-42` | 生产白名单含 4 个 localhost 源 | 部署期按环境裁剪 |
| `workers/analytics-collector/src/index.ts:104` | token 非常量时间比较 | 可忽略级；要改用定时安全比较 |
| `apps/web/public/sw.js:48-62` | PAGE_CACHE 无上限 | 加条数上限/LRU |
| `apps/web/src/components/AuthButton.tsx:139-149` | 密码框缺 `autocomplete="current-password"/"new-password"`（随 mode 切换） | 补上以配合密码管理器 |

## 5. 验证门实际执行结果

在仓库根目录实机执行（2026-11-02，Node 以 .nvmrc 为准）：

| 命令 | 结果 |
|---|---|
| `npm test`（= core + web） | ✅ **core：6 文件 70 条全过**（0.6s）；**web：22 文件 312 条全过**（4.8s） |
| `npm run check`（= core `tsc --noEmit` + web `astro check`） | ✅ tsc 无输出；astro check「Result (77 files): 0 errors / 0 warnings / 0 hints」 |
| `npm run build` | 未执行——构建需拉完整 astro + cloudflare 适配链且 CI 策略本就交给 Pages preview 覆盖（ci.yml:35-36），评审时间预算内跳过；此项标记为「未验证」 |
| `scripts/e2e-smoke.mjs` | 未执行——需对生产站点发起真实请求，超出只读评审范围 |

## 6. 修复优先级建议

1. **先修 P1**（SyncBridge 防抖）：改动 <10 行，补一条「2s 内两账各写一次、两账都上行」的测试（现有 `sync.test.ts` 只覆盖 `decideSync` 纯函数，UI 侧需在组件或抽出的调度函数层测）。
2. **顺手修 fx 超时**（P2）：一行 `AbortSignal.timeout`，既有降级路径自动接管。
3. **把 Supabase schema + RLS 落成 migration**（P2）：这是唯一「安全保证完全在仓库之外」的点，优先级高于代码细节。
4. **Worker 测试与冒烟进门禁**（P2）：至少把 `e2e-smoke.mjs` 挂成可手动触发的 workflow。
5. P3 批次随下次功能迭代顺带清理（README 计数、localhost 白名单、autocomplete 等）。
