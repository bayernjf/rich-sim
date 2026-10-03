# rich-sim-app

财富模拟（rich-sim）M1 核心闭环应用仓库。

- 产品文档仓库：`../rich-sim`（PRD、技术设计、M1 任务分解、口径与红线，以它为准）
- 营销落地页：`../rich-sim-landing`（T12 口径对照参照）

## 布局

- `packages/core` — `@rich-sim/core` 纯函数计算引擎（类型契约 + 5 引擎函数 + 汇率换算，Vitest，零运行时依赖）
- `apps/web` — Astro 5 + React 19 + Tailwind v4 应用（SSR，Cloudflare adapter）

## 常用命令（仓库根目录）

```bash
npm install   # 安装全部 workspace
npm run dev   # 启动开发服务器（默认 :4321）
npm run test  # core 单测（Vitest）
npm run check # TS 类型检查 + astro check
```

## 约定

工程约定见 [CONVENTIONS.md](./CONVENTIONS.md)；产品口径、合规红线、任务分解（13 任务 × 4 Wave）见 `../rich-sim/docs/m1-task-breakdown.md`。
