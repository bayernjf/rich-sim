# AGENTS.md — rich-sim（财富模拟 · 产品文档）

供 AI coding agents（Claude Code / Codex / Cursor / Copilot 等）在本仓库工作时自动读取。
**动手前先读本节，尤其是「任务追踪与文档分层」和「红线」两条**——这是本项目最容易被违反的约定。

## 任务追踪与文档分层

**`handoff.md` 是任务与待办的主入口**（状态、已拍板决策、待决问题、下一步、文档索引）；
**方案 / 设计 / 规格的全文放 `docs/` 的独立文档**，handoff 只索引、不复制全文。

- 活跃待办 / 下一步 → `handoff.md`「下一步」区
- 待决问题 → `handoff.md`「待决问题」区（每条指向 `docs/` 的对应章节，handoff 不重复论证）
- 已拍板决策 → `handoff.md`「已做的决策」表 **与** 对应文档**两边同步**（拍板即划掉待决项）
- 缓做 / 低优项 → 暂记在 `PRD.md` 的 P1/P2 与「明确推迟」清单；若要单独登记表，再建 `docs/deferred-items.md`（每条带触发条件，handoff 只给索引）
- **一个主题一份文档 = 单一事实源**：概念归 `product-concept.md`，需求归 `PRD.md`，技术归 `technical-design.md`，同一件事不要在两处各写一份

**新增文档后**：在 `handoff.md` 的文档表补一行索引。

一句话：**handoff = 索引 + 状态 + 待办，docs = 方案 + 设计 + 明细**。接手先读 handoff，再按索引跳转。

## 项目概览

**产品名：rich-sim**（中文名「财富模拟」）。沉浸式财务模拟器。**双主线**——富豪模拟做钩子（让人看见财富的真实持有成本与风险），
现实测算做落点（用用户自己的收入算「够用线 / 差距 / 年限」）。
定位是**财商模拟教育工具**，不是投资顾问。

本仓库是**产品仓库：文档 + 应用代码一体**（2026-10-04 起，M1 代码已并入）。
- 营销落地页：同级目录 `rich-sim-landing`（独立 git 仓库）
- 产品应用：**在本仓库内**——`apps/web`（Astro 应用）+ `packages/core`（纯函数计算引擎）+ `workers/`（边缘侧服务）+ `scripts/`

## 仓库结构

| 位置 | 职责 |
|---|---|
| `docs/` | 方案 / 设计 / 规格全文（product-concept、PRD、technical-design、simulation-gameplay、m1-task-breakdown 等） |
| `apps/web/` | 产品应用（Astro 5 + React 19 岛） |
| `packages/core/` | 计算引擎 `@rich-sim/core`（纯函数 + 测试） |
| `workers/` | 边缘侧服务（Cloudflare Workers）；目前只有 `analytics-collector` 漏斗事件收集端 |
| `scripts/`、`CONVENTIONS.md` | 工程工具与口径冻结契约 |

## 工程契约与常用命令

**`CONVENTIONS.md` 是跨 Agent 工程契约**（冻结项、路由表、引擎公式口径、localStorage key、红线）——**改契约 = 过闸门，不要私自改**。核心冻结项：

- 类型以 `packages/core/src/types.ts` 为准；web 侧禁止重定义，一律 `import type ... from '@rich-sim/core'`
- 路由表：`/` · `/app/designer` · `/app/finance` · `/app/result` · `/app/sim` · `/api/fx`
- localStorage key：`rich-sim:plan:v1`（真实测算，走 `lib/draft.ts`）/ `rich-sim:sim:v1`（模拟态，走 `lib/sim-draft.ts`）——两本账互不读写，由测试钉住
- `packages/core/src/index.ts` barrel 由组织者在 Wave 闸门合并，**不要并发编辑**

```bash
npm install     # 安装全部 workspace
npm run dev     # 开发服务器（默认 :4321）
npm run test    # core + web 全部单测
npm run check   # TS 类型检查 + astro check
npm run build   # 构建
```

Node 22（`.nvmrc`）。

## CI 与发布

- **CI**：`.github/workflows/ci.yml`，PR 与 push `dev`/`main` 时跑 `npm test` + `npm run check`（Node 22）。**宁可慢，不要 flaky**——这个 check 与 pr-helper 的自动发布门禁耦合，红了会让自动创建/合并停摆。
- **发布**：`dev → main` 的 PR 由 **pr-helper**（用户自建的 GitHub App）自动创建并自动合并；push `main` 触发 Cloudflare Pages 生产构建。
- **线上**：Cloudflare Pages 项目 `rich-sim`（monorepo 根部署），域名 `https://app.rich-sim.bayjf.com`。详见 `docs/DEPLOYMENT.md`。

## 文档结构

| 文档 | 职责 |
|---|---|
| `handoff.md` | 索引 + 状态 + 已拍板决策 + 待决问题 |
| `docs/product-concept.md` | 原始构想（§2 存档）+ 独立评估 + 验证计划 + 待决问题（§7） |
| `docs/original-qa.md` | 发起时的完整问答，**存档，不再更新** |
| `docs/PRD.md` | 功能分级 P0/P1/P2、用户旅程、核心公式、度量、里程碑、开放问题 |
| `docs/technical-design.md` | 技术选型、计算引擎 `@rich-sim/core`、数据模型、托管与演进路线 |

## 已拍板的决策（不要再重新论证，也不要推翻后不回写）

| 项 | 结论 | 出处 |
|---|---|---|
| **产品名** | **rich-sim**，中文名「财富模拟」（2026-10-03 拍板） | `product-concept.md` §7.2 |
| 产品方向 | 双主线；**未采纳**「设计理想生活」全面替换的方案 | `product-concept.md` §7.1 |
| 目标市场 | 先海外、后大陆（两阶段） | `technical-design.md` §9 |
| 技术栈 | Astro 5 + React 19 岛 + 独立纯函数计算引擎 `@rich-sim/core` | `technical-design.md` §3 |
| 数据库 / 账号 | Supabase（Postgres + Auth + Storage） | `technical-design.md` §3 |
| 托管 | 海外 MVP：应用 + 营销**全 Cloudflare**（一个平台管 DNS/CDN/WAF/部署）；Vercel 后置为触发选项（服务端变重时评估迁入） | `technical-design.md` §9 |
| MVP 形态 | **无后端**、无账号，方案存 `localStorage` | `technical-design.md` §10 |

## 红线（合规与产品边界）

- **不做投资建议、不荐股、不推荐任何具体金融产品。** 只对用户自填的假设做算术。
- 测算结果必须**显式展示假设清单与免责声明**；只做静态推演，不做预测、不承诺结果。
- 「可达 / 不可达 / 无净储蓄」是**一等状态**，不是错误分支。
- 不做记账工具、不做社交攀比社区、MVP 不做 3D 与多剧本堆量。
- **用户自填的财务数据不得上传**：`workers/analytics-collector` 只存事件名与时间，丢弃 props、不存 IP/UA/任何标识符——这是红线的工程保证，改这里要连着理由一起看。
- **任何数值必须有来源或显式标注「待校准」**，禁止编造。

## 写作约定

- **未决策的事标 `待定`**（商业模式、首个付费场景、壁垒、支付渠道等），不要替发起人拍板。
- **不编造数据**：市场时机、用户量、转化率、竞品数字没有来源就不写。
- 文档互相引用：改 `PRD.md` 的概念/公式/数字要回查 `product-concept.md`，反之亦然；落地页文案与文档口径不一致时以本仓库文档为准，并提示去改落地页。
- **不要在文档里写死会变的结论**（分支/推送状态、部署状态、占位数字）——引用前先复核。

## Commit 规范

- 英文 `<type>[(<scope>)]: <subject>`，如 `docs: settle the product name`
- 原子提交：一次只做一件事（文档与配置分开提交）
- 不 push（除非用户明确说）
- 作者保持用户身份，不加 AI co-author
- 详见 [git-commit-message.md](git-commit-message.md)

## 不要做的事

- 不要把方案 / 设计的全文复制进 `handoff.md`（只放索引与结论）。
- 文档写 `docs/`，应用代码写 `apps/` 与 `packages/`，各归其位；不要在文档区堆代码，也不要在代码区写文档。
- 不要把占位内容（定价 ¥0/¥39/¥19、标注「示意」的成本数字）当成已定结论写进文档。
- 不要提交 `docs/` 之外的临时产物、密钥或个人敏感信息。
- 不要跳过 `git pull --rebase` 直接 push。
