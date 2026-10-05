# CONVENTIONS.md — rich-sim 工程约定（跨 Agent 契约）

本仓库由多个并行 Agent 共同开发，以下为**冻结的公共契约**。产品口径、红线、任务分解以 `docs/`（产品文档）为准；本文件只定义工程层面的约定。改契约 = 过闸门，不要私自改。

## 仓库布局与归属

- `packages/core`（`@rich-sim/core`）：纯函数计算引擎，**零运行时依赖**。
  - `src/types.ts` — 类型契约（T02，已冻结，单一事实源）
  - `src/functions.ts` — 5 引擎函数 + convert 实现（T03，Agent A）
  - `src/catalog-data.ts` — Catalog 内容数据（T05，Agent B）
  - `src/index.ts` — barrel，**由组织者在 Wave 1 闸门处合并**，各 Agent 不要并发编辑
- `apps/web`：Astro 5 + React 19 + Tailwind v4，SSR（`output: 'server'` + Cloudflare adapter）。
- **不要把应用代码写进 `../rich-sim`（纯文档仓库）；不要改 `rich-sim-landing`**（除非 T12 口径不一致时按流程回写）。

## 路由表（冻结）

| 路由 | 页面 / 端点 | 归属 |
|---|---|---|
| `/` | 首页（落地入口） | T01 |
| `/app/designer` | 理想生活设计器（React 岛） | T06 |
| `/app/finance` | 财务录入（≤4 项） | T07 |
| `/app/result` | 测算输出（三状态 + 阶梯目标） | T08 |
| `/app/sim` | 富豪模拟 · 卡 A 资产看板与年持有成本（F5 最小版，SSR） | `docs/m2-task-breakdown.md` S1 |
| `/api/fx` | 汇率 SSR 代理端点（Frankfurter，静态快照兜底） | T10 |

## localStorage 方案 schema（冻结）

key：`rich-sim:plan:v1`；读写一律走 `apps/web/src/lib/draft.ts`（`readDraft` / `writeDraft` / `clearDraft`），任何页面不得绕过。结构见该文件 `Draft` 类型（`choices` / `profile` / `currency` / `assumptions` / `updatedAt`）。

## 类型契约（冻结）

- 一切类型以 `packages/core/src/types.ts` 为准（T02）。**禁止在 web 侧重新定义** core 已有类型，一律 `import type ... from '@rich-sim/core'`。
- Catalog 类型已含 `source?` / `note?` / `isDefault?` 字段，供 T05 标注来源与默认选项。

## 设计令牌与 UI 约定

- 令牌复制自 `rich-sim-landing/src/styles/global.css`（canvas/panel/panel-2/line/line-strong/ink/muted/accent/accent-soft/on-accent；dark-first，`prefers-color-scheme` 浅色自适应）。**禁止重靛/紫系配色。**
- UI 语言：中文优先（PRD §9）；移动端优先（PRD §12）。
- 金额数字用等宽呈现（`font-mono` 或 `tabular-nums`），可读性优先。
- 可访问性：标签在输入框上方、键盘可达、焦点可见（全局已设 `:focus-visible`）。

## 引擎公式口径（T03 已定，实现勿改）

- `enoughLine(annualCost, a)` = `annualCost / a.withdrawalRate`（例：40 万 / 0.04 = 1000 万）。
- `project(p, goal, a)`：起始本金 = `savings - debt`；年储蓄 = `(income - expense) * 12`；逐年 `balance = balance * (1 + returnRate) + annualDeposit`；`enough-line` 目标的目标本金 = `value / a.withdrawalRate`；60 年内达标 → `reachable`（`years` = 首次达标年；目标 ≤ 起始本金 → 0）；月净储蓄 ≤ 0 → `no-net-savings`；否则 `unreachable`。`savingsRate` = 月净储蓄 / 月收入。
- `gap(p, goal, a)`：`yearsAtCurrentPace` = 当前速度达成年数（unreachable = 60，no-net-savings = 0）；`annualGap` = 30 年内达标所需年储蓄 − 当前年储蓄（< 0 记 0）。
- `scenarioAnnualCost`：M1 = 各选项年成本简单求和（通胀作为假设记录并展示，暂不参与换算；改口径必须 bump `assumptionsVersion`）。
- `convert(amount, from, to, fx)` = `amount * fx.rates[to] / fx.rates[from]`。
- 假设默认值：`returnRate 0.04` / `withdrawalRate 0.04` / `inflation 0.03`（可调；UI 必须显式展示）。

## 币种口径（T10 已定，2026-10-03 冻结）

- `draft.currency` = **展示本位币**（默认 USD，海外市场优先）。所有展示金额换算到它。
- `draft.profile.currency`（Profile 自带字段）= **录入币种**，恒等于 draft.currency：**切换币种时**，若已有 profile，将其各金额用 `convert` 换算到新币种并更新 `profile.currency`；未录入则置空。core 计算始终在 profile.currency 口径内（= draft.currency），引擎零重算、零改公式。
- Catalog 以 **USD** 建模（T05）；展示层一律 `convert(annualCost, 'USD', draft.currency, fx)`。
- 默认假设与兜底汇率：`apps/web/src/lib/defaults.ts`（`DEFAULT_ASSUMPTIONS` / `DEFAULT_CURRENCY` / `STATIC_FX_SNAPSHOT`），兜底快照 `apps/web/src/lib/static-fx.json`（source=static-snapshot + 日期，参与假设清单展示）。
- `/api/fx?base=USD`：SSR 代理，Frankfurter 实时优先，失败降级 static-fx.json（m1 风险清单：实测 Frankfurter 的 CNY 覆盖）。
- 假设清单必须显示汇率来源与日期。

## 测试与验证

- core 单测：`packages/core/src/*.test.ts`（Vitest）；根目录 `npm run test`。
- web 检查：`astro check`；汇总命令：`npm run check`。
- 每个 Agent 端到端交付并自带验收：测试输出摘要 / 数据来源 / 页面可达（dev server + curl）/ 组件可渲染。

## Commit 规范

- `<type>: <subject>`，英文小写；原子提交（骨架 / 类型 / 函数 / 测试 / 内容 / UI 各一提交）。
- 不 push（用户未要求）。

## 红线（来自产品，必须遵守）

- 不做投资建议、不荐股、不推荐任何金融产品；只对用户自填假设做算术。
- 假设清单 + 免责声明必须 **SSR 渲染**（页面源码可见，不被 JS 关掉）。
- 可达 / 不可达 / 无净储蓄 三状态为**一等状态**，不是错误分支。
- 任何数值必须有来源或显式标注「待校准」；禁止编造数据。
