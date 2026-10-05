# 部署 — rich-sim（产品应用 · Cloudflare Pages Git 集成）

更新时间：2026-10-05

## 站点信息
- Pages 项目：`rich-sim`（**Git 集成**：GitHub 仓库 `bayernjf/rich-sim`，push `main` 自动构建部署）
- 域名：正式域 `app.rich-sim.bayjf.com`（2026-10-04 拍板并于同日绑定）；Pages 分配域 `rich-sim.pages.dev` 保留作对照。绑定方式同 `rich-sim-landing`：Pages 项目加 Custom domain，Cloudflare 自动补 CNAME → `rich-sim.pages.dev`、Proxied。
  - **验证新域时别只信本机 `curl`**：2026-10-04 绑定后 `curl` 先报 `Could not resolve host`（解析器还缓存着绑定前的否定应答），再报 TLS 验证失败（系统信任库不认刚签发的 Google Trust Services `WE1` 证书，而 `-k` 直接 200）。`dig +short @1.1.1.1` 与真实浏览器都是好的。**判定「域名通不通」以浏览器为准，`curl` 失败先怀疑本机。**
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

## 分析埋点（可选，B2 + M2 自建 collect）

未配置时应用不加载任何第三方脚本，漏斗事件只存本机队列（`rich-sim:events:v1`，等同 M1 行为）。

**2026-10-05 生产现状**：`PUBLIC_ANALYTICS_ENDPOINT` 与 `PUBLIC_HOMEPAGE_CLAIM=1` 已在 Pages 项目 **Production** 环境变量配好（Preview 未配），经一次 Retry deployment 与后续一次主干构建生效；自建收集端已开始收到真实事件。`PUBLIC_CF_WEB_ANALYTICS_TOKEN` 仍暂缓。

| 变量 | 作用 |
|---|---|
| `PUBLIC_CF_WEB_ANALYTICS_TOKEN` | Cloudflare Web Analytics beacon token，自动采集 PV / 会话（完成率漏斗的「进入」分母）；仅生产构建注入，dev 不统计。在 Cloudflare 控制台 Web Analytics 新建站点后获取。**2026-10-05 决定暂缓**，至今未配。 |
| `PUBLIC_ANALYTICS_ENDPOINT` | 自定义漏斗事件收集端点；客户端用 `navigator.sendBeacon` 批量 POST `{ "events": [{event, at, props?}] }`（JSON 载荷，但 **Content-Type 是 `text/plain`**，原因见下「sendBeacon 踩坑」），可接 Umami / Plausible / 自建 collect；未配置则事件仅留本机。**2026-10-05 已在 Production 配置**为自建端点（值见下节）。**自建落点**见下节。 |
| `PUBLIC_HOMEPAGE_CLAIM` | 首页「领一百万」入口开关（`=1` 显示，未配置则隐藏；见 `docs/homepage-claim-experience.md` §7）。**2026-10-05 已在 Production 配 `=1`**，入口已在生产打开；Preview 未配。 |

### 自建收集端 `workers/analytics-collector`（已部署，2026-10-05）

M2 收尾时搭的默认 collect 端点，给 `apps/web/src/lib/analytics.ts` 的 beacon 用，落在 Cloudflare Workers + D1。

| 项 | 值 |
|---|---|
| Worker 名 | `rich-sim-collect` |
| 端点 | **生产** `https://rich-sim-collect.jiangfengkxi.workers.dev/collect`（subdomain `jiangfengkxi`） |
| 只读查询 | `GET /summary?since=YYYY-MM-DD`，需 `Authorization: Bearer $READ_TOKEN`；返回 `{ totals: [{event,n}], daily: [{day,n}] }` |
| D1 | `rich-sim-events`（id `8eeca8fa-f11c-4c20-9e6d-7076b3856d5b`），表 `events(ts, day, event)` + 索引 `(day,event)`，schema 见 `workers/analytics-collector/schema.sql` |
| Secret | `READ_TOKEN`（`wrangler secret put READ_TOKEN`，在 `workers/analytics-collector/` 目录执行） |
| 部署 | `cd workers/analytics-collector && wrangler deploy`；D1 初始化 `wrangler d1 execute rich-sim-events --remote --file=schema.sql` |

**隐私三条（写在 `src/index.ts` 头，不要悄悄改）**：① 只入库 `event` 名与时间，`props` 一律丢弃（`finance:update` 带用户自填的收入/支出，上传即越过红线）；② 不写 IP / UA / 任何标识符，所以没有跨事件个体链路、不需要 consent 门槛，代价是只能做频次统计、做不了单用户转化漏斗；③ 来源白名单（`ALLOWED_ORIGINS`），未知 Origin 直接 403，绝不回显。

**当前事件清单**（与 `apps/web/src` 调用点一致，2026-10-05 清点）：`designer:select`、`converter:view`、`results:view`、`currency:switch`、`finance:update`、`claim:tap`、`claim:bill`、`claim:reveal`、`route:real`、`route:life`。props 全丢后只剩频次。

**打开读数的两步（2026-10-05 已全部完成）**：

1. Pages → 项目 `rich-sim` → Settings → Environment variables → Production 加 `PUBLIC_ANALYTICS_ENDPOINT=https://rich-sim-collect.jiangfengkxi.workers.dev/collect`（Preview 可不加）。Astro 在**构建期**内联 `PUBLIC_*`（见 `apps/web/src/components/Analytics.astro:14-16`），设完必须有一次新构建才生效。✅ 已配。
2. 触发构建：推一个提交，或 dashboard 对该 production 部署 Retry deployment。✅ 当天先 Retry 了 `cefaf27`（部署 `ca9de98d`）让变量进构建，随后主干的 beacon 修复又触发一次正式构建。

**sendBeacon 踩坑（2026-10-05，修在 `c6894a2`）**：变量打开后线上冒烟全过、本地事件队列也被清空，但 D1 一行都没进。根因是 `navigator.sendBeacon` **固定走 no-cors 模式**，而客户端最初用 `new Blob([body], { type: 'application/json' })` 把 Content-Type 设成了 JSON——`application/json` 不是 no-cors 允许的 safelisted type，Chrome 在请求发出前直接 `net::ERR_FAILED` 拦掉；但 `sendBeacon` 仍同步返回 `true`，客户端据此裁剪队列，于是事件**静默全丢**，表面无任何异常。修复：beacon 直接传单字符串，浏览器自动用 `text/plain;charset=UTF-8`（no-cors 放行）；collect 端 `request.json()` 不校验 Content-Type，故 worker 无需改动、无需重新部署。验证方式：headless Chrome 在生产页上下文发 `navigator.sendBeacon(endpoint, JSON.stringify(...))`，网络面板必须看到该 POST 真实 200，再到 D1 console 查到行——只看「beacon 返回 true / 本地队列清空」不算数。

**验证**：浏览器走一遍设计器 → 财务 → 结果，然后 `curl -s -H "Authorization: Bearer $READ_TOKEN" "https://rich-sim-collect.jiangfengkxi.workers.dev/summary?since=2026-10-01"` 应看到上述事件有计数；或 `wrangler d1 execute rich-sim-events --remote --command "SELECT event, COUNT(*) n FROM events GROUP BY event"`。

### Cloudflare Web Analytics 怎么配（**2026-10-05 决定暂缓**，以下是恢复时的步骤）

1. Cloudflare 控制台 → **Web Analytics** → Add site → 域名填 `app.rich-sim.bayjf.com`，复制 beacon token。
2. Pages → 项目 `rich-sim` → Settings → Environment variables → 加 `PUBLIC_CF_WEB_ANALYTICS_TOKEN`，**Production 与 Preview 都要设**。Astro 在**构建期**内联 `PUBLIC_*`，设完必须有一次新构建才生效。
3. 触发构建：推一个提交，或在 dashboard 对该 production 部署 Retry deployment。
4. 验证：`curl -s https://app.rich-sim.bayjf.com/ | grep beacon.min.js` 必须命中 `static.cloudflareinsights.com/beacon.min.js` 且带 `data-cf-beacon`。未命中即变量没进构建。

本机 `wrangler` 的 OAuth token 权限**只有 `account(read) / user(read) / workers(write) / d1(write) / pages(write)` 等**，**建不了 Web Analytics 站点、也写不了 Pages 变量**（`pages(write)` scope 在 API 层不能改项目级环境变量），所以以上步骤只能在控制台完成；不要试图用 `vercel env pull` 那类思路找凭证，这里没有可代跑的通道。

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
   —— 第 4 条用仓库自带脚本，不要手点：`BASE_URL=https://app.rich-sim.bayjf.com node scripts/e2e-smoke.mjs`（断言数随片子增长——2026-10-05 S3 后为 **30 条**；headless Chrome 驱动系统 Chrome，退出前打印 `TOTAL n FAILS m` 与埋点事件摘要）。脚本含卡 A 与账单日的断言，所以老号线上的新分支会在这两项变红，属预期。
5. `/sitemap.xml` / `/robots.txt` 返回 200，且其中域名与当前正式域名一致（正式域为 `app.rich-sim.bayjf.com`）

> **2026-10-04 五条全部在生产实测通过**：标题 `财富模拟 · rich-sim`；`/api/fx?base=CNY` 返回 6 币种、`date=2026-10-02`、来源 Frankfurter (ECB)，与上游同一 URL 逐字段一致；`/app/result` 源码含假设清单与免责声明；冒烟 15/15；sitemap 与 robots 内域名均为当时的 `rich-sim.pages.dev`。同日域名拍板并绑定后，第 4 / 5 条已在正式域 `app.rich-sim.bayjf.com` 重跑：冒烟 15/15、`robots.txt` 的 `Sitemap:` 与 `sitemap.xml` 的 4 个 `<loc>` 均为该域、每页 canonical 同域自洽。

## 与 landing 的关系
- `rich-sim-landing`（营销落地页）：独立仓库 `bayernjf/rich-sim-landing`，已 Git 集成上线 → https://rich-sim-landing.pages.dev（含 `rich-sim.bayjf.com`）
- 产品应用 `rich-sim`：本仓库，SSR 应用。两个 Pages 项目各自 Git 集成，互不影响
- 换正式域名时要同步的位置（2026-10-04 实测清点）：`apps/web/public/sitemap.xml`（4 个 `<loc>`）、`apps/web/public/robots.txt`（1 行 `Sitemap:`）、`rich-sim-landing/src/content/site.ts` 的 `APP_URL`、以及 Cloudflare 侧的 DNS 记录与 Pages Custom domain。**没有别的地方**：本仓库不存在 `consts.ts`，`astro.config.mjs` 也没设 `site`，应用源码与 `manifest.webmanifest` 里没有任何自引用的绝对 URL——此前本节写的「consts.ts / Astro config」是凭空列的，已按实测更正。
