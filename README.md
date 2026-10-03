# rich-sim（财富模拟）

产品仓库：**文档 + 应用代码一体**（2026-10-04 起，M1 代码已并入）。

- 产品文档：`docs/`（PRD、技术设计、M1 任务分解、口径与红线，以 `handoff.md` 为索引）
- 产品应用：`apps/web`（Astro 5 + React 19 + Tailwind v4，SSR，Cloudflare adapter）
- 计算引擎：`packages/core`（`@rich-sim/core` 纯函数，零运行时依赖）
- 营销落地页：同级目录 `rich-sim-landing`（独立仓库，T12 口径对照参照）

## 布局

- `packages/core` — `@rich-sim/core` 纯函数计算引擎（类型契约 + 5 引擎函数 + 汇率换算，Vitest）
- `apps/web` — Astro 5 + React 19 + Tailwind v4 应用（SSR）
- `docs/` — 产品文档（product-concept / PRD / technical-design / simulation-gameplay / m1-task-breakdown / deferred-items）

## 常用命令（仓库根目录）

```bash
npm install   # 安装全部 workspace
npm run dev   # 启动开发服务器（默认 :4321）
npm run test  # core + web 全部单测
npm run check # TS 类型检查 + astro check
```

## 部署

- 产品应用**暂不上线**：线上部署已撤销，需要时按 `docs/DEPLOYMENT.md` 用 wrangler 直传重建。
- 落地页 `rich-sim-landing` 已上线：https://rich-sim-landing.pages.dev（wrangler 直传）。

## 约定

工程约定见 [CONVENTIONS.md](./CONVENTIONS.md)；产品口径与合规红线见 `docs/`；任务分解（13 任务 × 4 Wave）见 `docs/m1-task-breakdown.md`。
