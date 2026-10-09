# rich-sim（财富模拟）

**先看见，再算清。** 一款财商模拟教育工具（不是投资顾问）：先在模拟里玩一把富豪，看清财富的真实持有成本与风险；再用你自己的收入，算清「够用线 / 差距 / 年限」。

- **在线体验**：https://app.rich-sim.bayjf.com（模拟 `/app/sim` · 现实测算 `/app/designer` · 玩法说明 `/app/guide`）
- **玩法地图**：26 个可交互玩法，按新手引导路径排布（玩一把富豪 → 对照你自己 → 养账本 → 系统层），见 [`docs/gameplay-inventory.md`](./docs/gameplay-inventory.md)
- **双主线**：富豪模拟做钩子（身份卡 / 账单日 / 人生快进 / 黑天鹅 / 特权价目 / 加杠杆 / 收购谈判 / 随机事件 / 汇率时间机 / 模拟购物 / 投资线），现实测算做落点（够用线 / 差距 / 年限 / 多情景 / 计划管理 / 云端同步）
- **红线**：只对用户自填的假设做算术；不荐股、不推荐金融产品、不做记账工具；用户财务数据不上传

产品仓库：**文档 + 应用代码一体**（2026-10-04 起，M1 代码已并入）。

- 产品文档：`docs/`（PRD、技术设计、M1 任务分解、口径与红线，以 `handoff.md` 为索引）
- 产品应用：`apps/web`（Astro 5 + React 19 + Tailwind v4，SSR，Cloudflare adapter）
- 计算引擎：`packages/core`（`@rich-sim/core` 纯函数，零运行时依赖）
- 营销落地页：同级目录 `rich-sim-landing`（独立仓库，T12 口径对照参照）

## 布局

- `packages/core` — `@rich-sim/core` 纯函数计算引擎（类型契约 + `functions.ts` 的 8 个引擎函数：`enoughLine` / `scenarioAnnualCost` / `project` / `gap` / `buildMilestones` / `convert` / `burdenStatus` / `wealthTimeEquivalent`；目录与本地化在 `catalog-data.ts`，Vitest）
- `apps/web` — Astro 5 + React 19 + Tailwind v4 应用（SSR）
- `docs/` — 产品文档；**清单与每份状态只在 `handoff.md` 的文档表里维护**（这里不复制，复制过的那份会过期）

## 常用命令（仓库根目录）

```bash
npm install   # 安装全部 workspace
npm run dev   # 启动开发服务器（默认 :4321）
npm run test  # core + web 全部单测
npm run check # TS 类型检查 + astro check
```

## 部署

- 产品应用：Cloudflare Pages 项目 `rich-sim`（**Git 集成**：push `main` 自动构建，monorepo 根部署），正式域名 `https://app.rich-sim.bayjf.com`（落地页为 `https://rich-sim.bayjf.com`）；Pages 预览域 `https://rich-sim.pages.dev` 仍保留。完整配置与发布流程见 [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)。
- 落地页 `rich-sim-landing`（独立仓库）：https://rich-sim-landing.pages.dev（另绑 https://rich-sim.bayjf.com）。

## 约定

工程约定见 [CONVENTIONS.md](./CONVENTIONS.md)；产品口径与合规红线见 `docs/`；任务分解（13 任务 × 4 Wave）见 `docs/m1-task-breakdown.md`。
