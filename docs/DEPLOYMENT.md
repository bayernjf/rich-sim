# 部署 — rich-sim-app（wrangler 直传）

更新时间：2026-10-04

## 站点信息
- Pages 项目：`rich-sim-app`（**wrangler 直传模式**，未连 GitHub）
- 域名：https://rich-sim-app.pages.dev（正式域名待定，绑定后 CNAME → pages.dev，Proxied）
- 技术栈：Astro 5 SSR（`@astrojs/cloudflare` adapter）+ React 19 islands + `@rich-sim/core`（monorepo）
- 包管理器：npm workspaces（`apps/web` + `packages/core`）

## 构建
```bash
npm install
npm run build     # 根 script = npm run build -w @rich-sim/web，产物 apps/web/dist/
npm run test      # core + web 全部单测
npm run check     # 类型检查
```

## 部署（wrangler 直传）
```bash
cd apps/web && wrangler pages deploy dist --project-name=rich-sim-app --branch=main
```
- production branch = `main`
- 每次更新：根目录 `npm run build && npm run test` 后，`cd apps/web && wrangler pages deploy dist --project-name=rich-sim-app --branch=main`

## 是否需要 GitHub 集成（结论：不需要，维持 wrangler 直传）
- **rich-sim-app 是产品本身**（区别于 landing 落地页）：发版应受质量门槛控制（先 `npm run test` 再部署），
  **不接入 GitHub 集成自动构建**，维持 wrangler 直传一条命令发版。
- GitHub 仓库仅作版本管理用（可选，由发起人决定是否补建），与部署解耦。

## 发布后验证
1. 首页 200，标题「财富模拟 · rich-sim」
2. `/api/fx?base=CNY` 返回完整汇率快照（Frankfurter ECB；验证 Workers `nodejs_compat`）
3. `/app/result` 源码可见「假设清单 + 免责声明」（纯 SSR，不依赖 JS）
4. 完整流程：设计器 → 财务录入 → 测算 → 切币种（真实浏览器冒烟一次）
