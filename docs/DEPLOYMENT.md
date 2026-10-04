# 部署 — rich-sim（产品应用 · Cloudflare Pages Git 集成）

更新时间：2026-10-04

## 站点信息
- Pages 项目：`rich-sim`（**Git 集成**：GitHub 仓库 `bayernjf/rich-sim`，push `main` 自动构建部署）
- 域名：正式域 `app.rich-sim.bayjf.com`（2026-10-04 拍板，落地页为 `rich-sim.bayjf.com`）；Pages 分配域 `rich-sim.pages.dev` 保留作对照。绑定方式同 `rich-sim-landing`：DNS 记录 CNAME → `rich-sim.pages.dev`、Proxied，再在 Pages 项目加 Custom domain。**截至本次提交该子域尚未解析（`dig` 空、`curl` 000），绑定前不要把改动 push。**
- 技术栈：Astro 5 **SSR**（`@astrojs/cloudflare` adapter）+ React 19 islands + `@rich-sim/core`（monorepo）
- 包管理器：npm workspaces（`apps/web` + `packages/core`）

## 为什么是 monorepo 根部署（关键）

`apps/web` 依赖本地 workspace 包 `@rich-sim/core@0.1.0`——**registry 上没有这个版本**，只有根目录 `npm install` 才能符号链接解析。

所以 Cloudflare 配置中 **Root directory 必须留空（仓库根）**：
- ❌ 错误：Root directory = `apps/web` → 构建时 `npm install` 从 registry 拉 `@rich-sim/core` 直接失败
- ✅ 正确：Root directory 留空 → 根 `npm ci` 正确装 workspace，根 `npm run build` 代理到 `@rich-sim/web`

## Cloudflare Pages 配置（已就位）
| 项 | 值 |
|---|---|
| Framework preset | Astro |
| **Root directory** | **（留空 = 仓库根）** |
| Build command | `npm ci && npm run build` |
| Build output directory | `apps/web/dist` |
| Environment variables | 无必需（Node 版本由根 `.nvmrc` = 22 自动检测） |
| Production branch | `main` |
| Automatic deployments | Enabled |
| SSR 实测 | `/api/fx` 已线上验证（Frankfurter ECB 汇率代理，2026-10-04 实测 200）——当前环境无需 `nodejs_compat` 显式配置 |

## 分析埋点（可选，B2）

未配置时应用不加载任何第三方脚本，漏斗事件只存本机队列（等同 M1 行为）。

| 变量 | 作用 |
|---|---|
| `PUBLIC_CF_WEB_ANALYTICS_TOKEN` | Cloudflare Web Analytics beacon token，自动采集 PV / 会话（完成率漏斗的「进入」分母）；仅生产构建注入，dev 不统计。在 Cloudflare 控制台 Web Analytics 新建站点后获取 |
| `PUBLIC_ANALYTICS_ENDPOINT` | 自定义漏斗事件（designer:select / finance:update / results:view / currency:switch）收集端点；客户端用 `navigator.sendBeacon` 批量 POST `{ "events": [...] }`（JSON），可接 Umami / Plausible / 自建 collect；未配置则事件仅留本机 |

## 构建（本地）
```bash
npm install
npm run build     # 根 script = npm run build -w @rich-sim/web，产物 apps/web/dist/
npm run test      # core + web 全部单测（发版质量门槛）
npm run check     # 类型检查
```

## 发布流程
```bash
npm run build && npm run test     # 本地验证（产品发版必须过测试门槛）
git add -A && git commit -m "…"
git checkout main && git merge dev
git push origin main              # 触发 Cloudflare 自动构建
```
兜底（手动直传，仅应急，不覆盖 Git 集成状态）：
`wrangler pages deploy apps/web/dist --project-name=rich-sim --branch=main`

## 发布后验证
1. 首页 200，标题「财富模拟 · rich-sim」
2. `/api/fx?base=CNY` 返回完整汇率快照（Frankfurter ECB；验证 SSR + `nodejs_compat`）
3. `/app/result` 源码可见「假设清单 + 免责声明」（纯 SSR，不依赖 JS）
4. 完整流程：设计器 → 财务录入 → 测算 → 切币种（真实浏览器冒烟一次）
   —— 第 4 条用仓库自带脚本，不要手点：`BASE_URL=https://app.rich-sim.bayjf.com node scripts/e2e-smoke.mjs`（15 条断言，headless Chrome 驱动系统 Chrome，退出前打印 `TOTAL n FAILS m` 与埋点事件摘要）
5. `/sitemap.xml` / `/robots.txt` 返回 200，且其中域名与当前正式域名一致（正式域为 `app.rich-sim.bayjf.com`）

> **2026-10-04 五条全部在生产实测通过**：标题 `财富模拟 · rich-sim`；`/api/fx?base=CNY` 返回 6 币种、`date=2026-10-02`、来源 Frankfurter (ECB)，与上游同一 URL 逐字段一致；`/app/result` 源码含假设清单与免责声明；冒烟 15/15；sitemap 与 robots 内域名均为当时的 `rich-sim.pages.dev`。**同日稍后域名拍板为 `app.rich-sim.bayjf.com` 并已改码，第 5 条与第 4 条待绑定后重跑。**

## 与 landing 的关系
- `rich-sim-landing`（营销落地页）：独立仓库 `bayernjf/rich-sim-landing`，已 Git 集成上线 → https://rich-sim-landing.pages.dev（含 `rich-sim.bayjf.com`）
- 产品应用 `rich-sim`：本仓库，SSR 应用。两个 Pages 项目各自 Git 集成，互不影响
- 换正式域名时要同步的位置（2026-10-04 实测清点）：`apps/web/public/sitemap.xml`（4 个 `<loc>`）、`apps/web/public/robots.txt`（1 行 `Sitemap:`）、`rich-sim-landing/src/content/site.ts` 的 `APP_URL`、以及 Cloudflare 侧的 DNS 记录与 Pages Custom domain。**没有别的地方**：本仓库不存在 `consts.ts`，`astro.config.mjs` 也没设 `site`，应用源码与 `manifest.webmanifest` 里没有任何自引用的绝对 URL——此前本节写的「consts.ts / Astro config」是凭空列的，已按实测更正。
