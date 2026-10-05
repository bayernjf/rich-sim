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
| 托管 | Vercel（应用）+ Cloudflare（营销 / 边缘） | `technical-design.md` §9 |
| MVP 形态 | **无后端**、无账号，方案存 `localStorage` | `technical-design.md` §10 |

## 红线（合规与产品边界）

- **不做投资建议、不荐股、不推荐任何具体金融产品。** 只对用户自填的假设做算术。
- 测算结果必须**显式展示假设清单与免责声明**；只做静态推演，不做预测、不承诺结果。
- 「可达 / 不可达 / 无净储蓄」是**一等状态**，不是错误分支。
- 不做记账工具、不做社交攀比社区、MVP 不做 3D 与多剧本堆量。

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
