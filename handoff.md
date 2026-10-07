# Handoff · rich-sim（财富模拟 · 产品）

> 更新时间：2026-10-07
> 本仓库是**产品仓库：文档 + 应用代码一体**（M1 代码已并入，2026-10-04）。

---

## 这个仓库是什么

产品全部资产：构想 / 需求 / 架构文档（`docs/`）+ 产品应用代码（`apps/web`）+ 计算引擎（`packages/core`）+ 工程约定（`CONVENTIONS.md`）。

## 当前状态

- **文档**：13 份，见 `docs/`（下表）
- **分支**：`dev`。S1 已随 PR #31 合并进 main（2026-10-05），生产已上；体验项补源是其上的后续提交，**同步/领先状态不写死**（AGENTS.md「不要写死会变的结论」）——现测：`git fetch origin && git rev-list --count origin/dev..dev`（本地未推）与 `git rev-list --count origin/main..origin/dev`（未进 main）。
- **发布路径**：`dev → main` 的 PR 由 **pr-helper**（用户自建的 GitHub App）按 `ahead_by >= 1` 自动创建并自动合并，main 推送即触发 Cloudflare Pages 生产构建；见「下一步」与 `docs/DEPLOYMENT.md`。
- **默认分支**：`main`
- **远程**：`git@github.com:bayernjf/rich-sim.git`（public）

| 文档 | 内容 | 状态 |
|---|---|---|
| `docs/product-concept.md` | 原始构想 + 独立评估 + 验证计划 | 完成 |
| `docs/original-qa.md` | 发起时的完整问答存档 | 完成（存档，不再更新） |
| `docs/PRD.md` | 产品需求：功能分级、旅程、度量、里程碑 | Draft |
| `docs/technical-design.md` | 技术选型与架构 | Draft |
| `docs/wealth-lifestyle-framework.md` | 富豪生活方式内容框架（F5 富豪模拟的内容骨架） | Draft |
| `docs/simulation-gameplay.md` | 模拟玩法设计草案（购物 / 六通道体验 / 对比闭环 / 名人原型合规） | Draft |
| `docs/deferred-items.md` | 可边迭代边讨论的待决事项（每条带触发条件与阻塞性） | 活跃 |
| `docs/m1-task-breakdown.md` | M1 任务分解与并行执行规划（13 任务 × 4 Wave，多 agent 编排） | 活跃 |
| `docs/DEPLOYMENT.md` | Cloudflare Pages Git 集成部署配置、发布流程、冒烟清单与发布事故记录 | 活跃 |
| `docs/comparison-converter.md` | 对比换算器方案（把富人年成本翻译成用户的时间单位）：两种口径、币种/边界规则、红线对照、MVP 范围 | **草案 v1，未拍板未排期** |
| `docs/homepage-claim-experience.md` | 首页「领一百万」方案 **v2**：虚拟起始金走独立 `rich-sim:sim:v1`、两拍特效、SIM/REAL 两条账本单向桥、逐条红线对照、分期 P1-P3 | **P1 已实现（2026-10-05，切片 S4），生产入口已打开**（`PUBLIC_HOMEPAGE_CLAIM=1`，Preview 未配）；P2/P3 未做；临时取值见该文档 §7.1 |
| `docs/m2-decisions.md` | M2 决策包 D1–D5：F5 首个剧本、六通道取舍、F2 逐项支出、账号体系、投资线——每条一个可批选项 + 理由 + 翻转条件 | **已整包确认（2026-10-05）**，保留翻转条件备查 |
| `docs/m2-task-breakdown.md` | M2 实施分解 S1–S4：卡 A 看板 / 账单日 / 换算条 / 领钱入口，含两个必须先过的冻结契约闸门与内容取值规则 | **S1–S4 全部上线（2026-10-05）**；埋点管道同日接通并修掉 sendBeacon 静默丢事件缺陷，§5 已更新 |
| `docs/m3-task-breakdown.md` | M3 实施分解 S1–S5：购物机制 / 购物车 / 购物即记账 / 一键成目标（SIM→REAL 单向桥），含 G1–G4 四个契约闸门与体验项内容规则 | **已开工（2026-10-06）**：G4 拍板走方案 (a)（`goalOverride`）；**S1–S5 全部已上线**（S1 随 PR #31，S5 随 PR #36，均已合并 main） |

## 已做的决策

| 决策 | 结论 | 出处 |
|---|---|---|
| **产品名** | **rich-sim**，中文名「财富模拟」（2026-10-03 拍板） | `product-concept.md` §7.2 |
| 产品方向 | 双主线：富豪模拟做钩子，现实测算做落点 | `product-concept.md` §7.1 |
| 目标市场 | 先海外，后大陆 | `technical-design.md` §9 |
| 技术栈 | Astro + React 岛 + 独立纯函数计算引擎 | `technical-design.md` §3 |
| 数据库 / 账号 | Supabase（Postgres + Auth + Storage） | `technical-design.md` §3 |
| 托管 | 海外 MVP：应用 + 营销**全 Cloudflare**（一个平台管 DNS/CDN/WAF/部署）；Vercel 后置为触发选项（服务端变重时评估迁入） | `technical-design.md` §9 |
| MVP 形态 | **无后端**，方案存 `localStorage` | `technical-design.md` §10 |
| 产品形态节奏 | M1 响应式 Web（移动端达标）；M2 加 PWA；大陆做微信小程序（Taro）；原生 App 以付费+回访触发门驱动 | `technical-design.md` §10.1 |
| 币种与汇率 | 计算在本位币、换算只在展示层；汇率 = 假设的一部分（快照进 Assumptions 并参与版本化）；M1 实时汇率（SSR 代理），M2 历史汇率 | `technical-design.md` §4.2 |
| **M2 决策包 D1–D5** | **D1** F5 首个剧本 = 卡 A 科技独角兽创始人（年成本 $1,317,000，$1M 起始金只够 76%）；**D2** 六通道只做 看见 / 感受（账单日）/ 比较（换算器），购物与剧情与特权后置；**D3** F2 逐项支出移出 MVP 降 P2（撞 §3.2 Non-Goal）；**D4** 账号体系**暂不立项**，等同设备回访读数（≥15% 立项 / <5% 否）；**D5** 投资线、付费墙、支付渠道一起押后（2026-10-05 整包确认） | `docs/m2-decisions.md`、`docs/m2-task-breakdown.md` |
| **F5 排期** | **维持 P0，最小版从 M3 提到 M2**（1 个身份剧本 + 资产看板 + 持有成本 + 现金流波动，纯前端）；购物机制 / 六通道 / 原型卡 / 多剧本仍归 M3。M2 第一步是接度量而非写 F5（2026-10-05 拍板） | `docs/PRD.md` §13.7、§12 |
| **M3 桥口径 G4** | 走方案 **(a)**：`Draft` 增可选 `goalOverride?: { annualCost, from: 'sim-cart' }`，一键成目标**只携带年成本一个数字**进 REAL（不带起始金、不带资产占比）；`choices` 仍写「每维最贵项」作展示回显。过 `draft.ts` 冻结闸门（2026-10-06 拍板） | `docs/m3-task-breakdown.md` §0 G4、§3 S4 |
| **域名 / 英文名** | 产品 `app.rich-sim.bayjf.com`（2026-10-04 绑定，浏览器实测可达、canonical/robots/sitemap 同域、冒烟 15/15），落地页 `rich-sim.bayjf.com`；英文名沿用 `rich-sim`。**品牌视觉 / 商标仍 `待定`** | `docs/deferred-items.md` #2、`docs/DEPLOYMENT.md` |

## 下一步

**M1：核心闭环** —— 理想生活设计器 + 轻量财务录入 + 计算引擎。无后端、无账号。移动端响应式达标（PRD §12）。

任务分解与并行排期见 `docs/m1-task-breakdown.md`（13 任务 × 4 Wave：T01 建仓 → Wave1 三线并行 [core 链 / Catalog 内容 / UI 骨架] → Wave2 组装 → Wave3 达标 → Wave4 验收）。

落地页里已有一个可复用的测算器雏形，见 `rich-sim-landing/src/components/Calculator.astro`。

实施拆解（2026-10-03 规划）：
1. ~~建 `rich-sim-app` 仓库（Astro 5 + React 19 + TS + Tailwind v4，单仓库 + `packages/core`）~~ ✅ 已完成（T01，2026-10-03，`npm run dev`/`test`/`check`/`build` 实测通过）
2. ~~`@rich-sim/core` 类型契约~~ ✅ 已冻结（T02，`packages/core/src/types.ts`，TS 严格 0 错误）；函数实现与测试（T03–T04）✅ 37 条全绿，手算样例独立复核一致
3. ~~理想生活设计器（7 维度 × 3–5 选项，合理默认值）~~ ✅ T05 Catalog（7 维 × 23 选项，**23 项全部带可查证公开来源**，2026-10 校准，见 `26b4f4b`）✅ T06 设计器（2026-10-03）
4. ~~轻量财务录入（≤4 项）~~ ✅ T07（2026-10-03）
5. ~~测算输出：三状态 + 假设清单 + 免责声明（服务端渲染，不被 JS 关掉）~~ ✅ T08（三状态/阶梯目标，43 测试全绿）+ ✅ T09（纯 SSR 面板，2026-10-03）
6. ~~币种：本位币选择 + 实时汇率（SSR 代理）~~ ✅ T10（2026-10-03；实测 Frankfurter 已迁移至 api.frankfurter.dev/v1，base=CNY 可用）
7. ~~移动端响应式达标~~ ✅ T11（2026-10-04；生产口径 LCP<2.5s / INP<200ms / CLS<0.1 全达标）
8. ~~参照落地页 Calculator.astro 校验口径一致~~ ✅ T12（2026-10-04，五组样例双侧一致，无需回写）+ ✅ T13（E2E 15/15 + 完成率埋点可观测）
9. ~~M1 移动端指标~~ ✅ T11（2026-10-04）

**M1 状态：核心闭环完成（2026-10-04）**。**部署状态**：`rich-sim-landing`（落地页）→ https://rich-sim-landing.pages.dev（**Git 集成**：GitHub `bayernjf/rich-sim-landing`，push main 自动构建，另绑 `rich-sim.bayjf.com`）；产品应用 `rich-sim` → **https://rich-sim.pages.dev 已上线**（Git 集成：GitHub `bayernjf/rich-sim`，monorepo 根部署 + `.nvmrc` Node 22；首次构建因 main 缺 `package-lock.json` 报 EUSAGE，已修复推送；详见 `docs/DEPLOYMENT.md`）。线上冒烟全过（2026-10-04 实测）：首页 200「财富模拟 · rich-sim」、`/api/fx` 返回完整汇率快照（CNY base，Frankfurter ECB）、`/app/result` 假设清单+免责声明纯 SSR 源码可见——**M1 遗留风险（Cloudflare 环境冒烟）已关闭**。下一步（**2026-10-05 拍板 F5 后重排**）：① ~~配 `PUBLIC_CF_WEB_ANALYTICS_TOKEN`~~ **2026-10-05 决定暂缓**（发起人：现在先不搞）——配置步骤与验证命令见 `docs/DEPLOYMENT.md` 分析埋点节；暂缓期间 PV/会话不可读；**自定义事件管道已全通（2026-10-05 晚）：收集端部署 + Pages Production 变量 + beacon 修复均完成并端到端验证，见 M2 段**；② **F5 最小版**（1 个身份剧本 + 资产看板 + 年持有成本 + 现金流波动，纯前端），启动前须拍 gameplay §6 的「首个剧本身份」与「六通道取舍」；③ 账号体系是否立项（`待定`，会推翻「MVP 无后端」）。域名 `app.rich-sim.bayjf.com` 已绑定并复验通过。

**M2（F5 最小版 + 三通道）进度**（2026-10-05）：S1 卡 A 资产看板（`/app/sim`，纯 SSR）、S2 账单日（现金流波动 + 断裂负担率）、S3 换算条（轻量口径，挂设计器 sticky 与结果页）**均已上线**；**S4 领钱入口**代码完成——独立账本 `rich-sim:sim:v1`（第二个冻结 key，见 `CONVENTIONS.md`）、首页两拍受 `PUBLIC_HOMEPAGE_CLAIM` 控制、**2026-10-05 晚已在生产打开**（Pages Production 配 `PUBLIC_HOMEPAGE_CLAIM=1`；Preview 未配），A 线「够撑多久」挂在 `/app/sim`（`$1M ÷ 卡 A 年成本 = 9.1 个月`；加游艇后 1.8 个月；纯除法，不走 `project`——SIM 态没有收入，用法与 §8 验收 #8 的例外处理见 `homepage-claim-experience.md` §7.1）。
**M2 四片至此全部交付且埋点管道已通**（2026-10-05 晚）：Pages Production 配好 `PUBLIC_ANALYTICS_ENDPOINT=https://rich-sim-collect.jiangfengkxi.workers.dev/collect` 与 `PUBLIC_HOMEPAGE_CLAIM=1`，Retry deployment 让变量进构建后，线上冒烟 37/37、首页已见「领一百万」、analytics chunk 已内联端点。首日发现并修复一个**静默丢事件**缺陷：`sendBeacon` 固定 no-cors，原实现以 `application/json` Blob 发送被浏览器在发出前拦截（`net::ERR_FAILED`），而 beacon 仍返回 true、队列照常裁剪（`c6894a2` 改为纯字符串载荷，worker 无需改动）。修复后经 headless Chrome 真实 beacon + D1 console 双重确认入库；联调用的 3 条 `probe:*` 诊断事件验证后已删除，当前 D1 仅余真实漏斗事件。下一步不再是既定切片，需要重新排：账号体系 / 投资线等仍押后（D4、D5），判据依赖真实流量下的漏斗读数。PV/会话分母仍需另行配置 `PUBLIC_CF_WEB_ANALYTICS_TOKEN`（暂缓）。

**2026-10-07 补记（传输换了）**：上面那条 beacon 事故只修了一半——纯字符串载荷解决了 Content-Type 被拦，但 beacon 在卸载路径上仍会**随机丢**，而旧实现凭「beacon 返回 true」就裁剪队列。本地 sink 实测一次冒烟：约 15 个事件**只有 1 条到达收集端**（比全丢更危险，表面一切正常）。现改为 `fetch(..., { keepalive: true })` + **收到 2xx 才裁队列**，代价是至少一次语义：同一条冒烟 21 个事件落成 78 行、按 `(event, ts)` 去重得 20 个。收集端 `/summary` 计数已相应改成 `COUNT(DISTINCT event, ts)`，**代码改了、还没重新部署**。口径与验证纪律见 `docs/DEPLOYMENT.md`。

诚实边界：埋点管道已通但**真实流量读数尚为零**——当前 D1 里只有联调产生的事件；S1–S4 有没有效果仍要等真实访客积累，口径见 `m2-task-breakdown.md` §5、`docs/DEPLOYMENT.md` §分析埋点。

**M3（F5 完整化：购物机制 + 一键成目标）**：2026-10-05 晚产出分解草案 `docs/m3-task-breakdown.md`（S1–S5：core 玩法字段 + 2–3 个带来源的体验项 → `/app/sim` 购物车 → 购物即记账/负担率联动 → SIM→REAL 一键成目标 → 埋点冒烟），**2026-10-06 已开工**：发起人拍板 G4 走方案 (a)——`Draft` 增可选 `goalOverride`（只携带年成本一个数字进 REAL，不带起始金与资产占比）；备选「限制同维一件」与卡 A 事实冲突，已排除。**S1 已完成**：G1 类型扩展、catalog 字段标注、`shoppingPool()`（池 = 12 个 catalog 标注项）随 PR #31 合并上线；2 个纯体验项（私人喷气环球之旅 $189,500/人、Met Gala 门票 $100,000/张，均带已核验 http 来源）放在 **web 侧** `sim-content.ts` 而非 core catalog（不破坏每维 3–5 项/递增/单一默认档契约），购物池现为 14 项。**S2、S3 已上线**：`sim-draft.ts` 扩可选 `cart`（schemaVersion 维持 1、旧草稿空车兼容、幂等加删、坏数据收敛、与 `draft.ts` 仍零 import），新 `ShoppingArea.tsx` 岛挂 `/app/sim`（不新增路由 = G3），按资产/消费品/体验三组陈列，年成本与来源齐全，`aria-pressed`/`aria-live`/44px 触摸目标/`motion-reduce` 达标；SSR 首帧岛渲染 null、看板与免责声明完整。**S3 代码完成**：`sim-content.ts` 增 `cartAddedAnnualCost`/`cartKindCounts`/`cartBurdenSummary`（逐项求和、基线项不双算、阈值仍取 core 的 burdenStatus），购物区岛显示下一期账单预览（基线+加购、负担率色）、资产>体验时的 1:1 配比提示（明示只呈现算术、非消费建议）、红区 75% 折价变卖引导；空车基线负担率 ≈78% 即黄（与账单日一致）。本地 86 测试绿、check/构建通过。名人原型卡（路径 B）仍等 `deferred #5` 法务，不进本轮。**S4 代码完成（2026-10-06，待推送）**：过冻结闸门——`Draft` 增可选 `goalOverride`，`computeResults` 在 override 存在时直接取其年成本（choices 仍写每维最贵项作回显，非法 override 退回 choices）；新 `sim-bridge.ts` 的 `adoptCartAsGoal` 只写 `rich-sim:plan:v1`、不碰 sim，只带年成本一个数字，按 profile 完整性跳 `/app/result` 或 `/app/finance`；结构测试钉死 sim 账本不变、REAL 无起始金；购物区底部 CTA + 结果页「目标来自富豪模拟购物车」标签，关 JS 降级链接放 SSR 层（岛内 noscript 不渲染，已修正）。本地 95 测试绿。**S5 已上线（PR #36）**：购物区加购/移出埋 `sim:add`/`sim:remove`（`cart:to-goal` 已在 S4 埋），worker 事件名正则天然放行、零改动；`e2e-smoke.mjs` 加步骤 8–9（购物车加购/幂等/同维多件/账单预览变色/折价/一键成目标单向桥），断言 37→49 且实测全过；DEPLOYMENT 事件清单与断言数已同步。**冒烟抓出并修复一个 S2/S3 真实缺陷**：未领起始金（无 sim 账本）时连续加购会互相覆盖——`saveCartItem` 改为吃调用方当前车、有账本才持久化，无账本为纯内存会话态。M3 五片至此**全部上线**（PR #31–#36 已合并 main）。**剩余已关闭（2026-10-07）**：D1 实收 `smoke:sim:add` / `smoke:sim:remove` / `smoke:cart:to-goal` 各 1 行，worker 零改动。**证据分两半**：入库那三条是带系统代理的 POST 探针打 `/collect`（本机直连 `*.workers.dev` 的 DNS 被污染），「客户端会发这三个事件」则由本地冒烟的队列读数证明（`sim:add`×3 / `sim:remove`×2 / `cart:to-goal`×1）——合起来才算闭环。冒烟流量现自标记为 `smoke:` 前缀，真人流量查 `NOT LIKE 'smoke:%'`；口径与两个投递坑见 `docs/DEPLOYMENT.md`。**真实访客仍为 0**：D1 里裸名事件全部停在 2026-10-05。

### 候选一口气任务（2026-10-04 盘点，均不需拍板、本地可完成）

- **A 文档同步**（纯体力，各 ≤S）：~~① README 部署段过时~~ ✅ 4ca1bcd；~~② PRD §12 里程碑表 M1 仍标「待开发」~~ ✅ 2035316；~~③ 本表文档索引缺 DEPLOYMENT.md、文档计数过时~~ ✅ 462c23a；~~④ tech §12 残留旧托管决策（Vercel）~~ ✅ 5ea6abc；~~⑤ deferred #2 触发条件「M1 发布前」过期~~ ✅ 6c27880；~~⑥ 本表「相关」区 git 同步描述过时~~ ✅ fc2781b。
- **B 代码小功能**（各 S–M）：~~① PWA 增强（manifest + service worker，tech §10.1 定案「半天成本」）~~ ✅ 32ddb25；~~② 埋点接真实上报（现为 localStorage 队列，T13 遗留）~~ ✅ 629d53c（CF Web Analytics beacon + sendBeacon 自定义事件，均由环境变量开启，未配置零行为）；~~③ sitemap.xml + robots.txt（DEPLOYMENT.md 验证清单 #5 提到，疑未配置）~~ ✅ 584b53b；~~④ WCAG AA / 键盘可达 / 对比度检查修复（PRD §9 硬要求，M1 验收未实测）~~ ✅ 61610ad（danger token、skip link、radiogroup 语义、aria-live、44px 触摸目标、固定底条遮挡）；~~⑤ 深浅色自适应核对（PRD §9，tech §7 说沿用落地页策略，需核实）~~ ✅ 6a4115c（机制已具备：prefers-color-scheme + color-scheme + 全量 light token；仅浅色 accent 对比度 4.36→5.23 加深，双主题全部文本 token 按 WCAG 公式实测 ≥4.5:1）；~~⑥ 草稿恢复入口（方案已存 localStorage，T07，查 UI 是否有回访恢复）~~ ✅ a4dcec0（首页 client:load 岛，nextDraftStep 纯函数 + 4 测试，无草稿不渲染、SSR 空帧）。
- **C 内容**（各 M）：~~① 富豪模拟玩法细节整批（购物目录数值 / 爽痛比例 / 断裂阈值 / 账单日参数 / 首批原型卡 / 一键成目标入 PRD §7.2，deferred #6；名人原型合规除外）~~ ✅ f725218（simulation-gameplay v0.2：账单日 6 个建议默认、现金流负担率公式与阈值、爽痛 1:1、两张虚构原型卡、一键成目标入 PRD §7.2/F5；剩余为 M3 前拍板项，见 gameplay §6）；~~② Catalog 21 项「待校准」数值补公开来源（deferred #1）~~ ✅ 26b4f4b（盘点所写「21 项」实为 **20 项**；23 项现已全部附可查证来源：BLS CE 2024 / AAA / KFF / NAIS / Child Care Aware / Allianz / Zillow，富豪极端档为行业估算；统一为实际自付现金口径，移除设计器 mock、catalog 改必传，测试增至 10 条；deferred #1 的 USD 部分闭环）；~~③ PRD §2.3 市场时机论证补全（需外部检索，带来源）~~ ✅ 38eb2df（Deloitte / PwC / 美联储 SHED / TIAA-GFLEC 四来源，deferred #8 市场时机部分闭环）。
- **需拍板后才能动**：~~D1–D5~~ **2026-10-05 已整包确认**（见「已做的决策」与 `docs/m2-decisions.md`）。当前真正待拍的只剩：`deferred #5` 法务与 publicity rights 复核（M3 原型卡上线前）、`#3` 付费墙与 `#7` 支付渠道（D5 押后，等付费意愿读数）、品牌视觉 / 商标（deferred #2 剩余部分）。
  - **F2 逐项支出（PRD §8 明写、当前未实现）——我先前把它列进「不需拍板」的 B 组，是错的，已移出**：`Profile.expense` 是**单个数字**（`packages/core/src/types.ts:27`），而 `types.ts` 与 `draft.ts` 都是冻结契约（`CONVENTIONS.md`：改契约 = 过闸门）。两条路必须选一条：**(a)** 展示层拆解 + 独立 localStorage key、引擎不读——零契约改动，但「精细模型」只是看起来精细，不影响测算，**有误导用户以为它参与计算的风险**；**(b)** 扩 `Profile` 让逐项支出真正进引擎——要过契约闸门，且牵动 `project` / `gap` / `buildMilestones` 口径与 `assumptionsVersion`。

## 待决问题

详见 `docs/technical-design.md` §12 与 `docs/PRD.md` §13。关键几条：

1. ~~**托管分工**~~ **已定（2026-10-03）**：海外 MVP 应用 + 营销全 Cloudflare，Vercel 后置为触发选项，见 `docs/technical-design.md` §9
2. **支付渠道**：阶段一海外（Stripe / Paddle），阶段二大陆（微信 / 支付宝）。M4 才需要，倾向 Stripe（`待定`）
3. **仓库结构**：渐进式——M1 单仓库 + `packages/core`，小程序加入时转 pnpm workspaces（2026-10-03 建议，见 tech §11）
4. **框架终局**：维持 Astro，应用变重 / 大量客户端路由时再评估 Next.js（2026-10-03 建议，见 tech §3）
5. **首个付费场景**：建议 **买房 vs 租**，辞职 / 生娃 / 退休后置（2026-10-03 建议，`待定`，见 PRD §10）
6. **富豪模拟玩法设计**：购物机制、购物车一键成目标、名人原型合规路径——**2026-10-06 M3 已开工，G4 桥口径拍板走 (a)**；名人原型合规仍待 `deferred #5` 法务复核。见 `docs/simulation-gameplay.md` §6 与 `docs/m3-task-breakdown.md`
7. ~~**产品形态**~~ **已定（2026-10-03）**：M1 响应式 Web → M2 PWA → 大陆微信小程序（Taro），原生 App 以触发门驱动，见 `docs/technical-design.md` §10.1
8. ~~**F5 富豪模拟的优先级与里程碑自相矛盾**~~ **已定（2026-10-05）**：维持 P0，**最小版从 M3 提到 M2**，M3 只做完整化。§8 / §12 / technical-design §架构演进 / gameplay §5.1 / deferred #6 已同步。**新的阻塞点**：F5 最小版启动前须拍 gameplay §6 的「首个剧本身份」与「六通道取舍」。详见 `docs/PRD.md` §13.7。

## 相关

- 落地页仓库：`rich-sim-landing`（同级目录，独立 git 仓库）
- git 状态：见「当前状态」的现测命令；本仓库不再手工维护推送/合并节奏，`dev → main` 由 pr-helper 自动化。
- **若 `dev` 长时间没进 `main`**：优先查 pr-helper 的「合并后门禁」——它评的是上一个 PR 的 merge commit，那个提交上的红 check 不会自己变绿，会让自动创建停摆（2026-10-04 实测停摆 ≥44 分钟，靠详情页「创建 PR」按钮人工解套）。诊断全文见 pr-helper 仓库 `docs/auto-create-pr-remediation.md` 第十八节。
