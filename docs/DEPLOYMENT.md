# 部署 — rich-sim（产品应用 · Cloudflare Pages Git 集成）

更新时间：2026-10-06

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

**当前事件清单**（与 `apps/web/src` 调用点一致，2026-10-08 清点）：`designer:select`、`converter:view`、`converter:expand`、`results:view`、`currency:switch`、`finance:update`、`claim:tap`、`claim:bill`、`claim:reveal`、`route:real`、`route:life`、`locale:switch`、`sim:add`、`sim:remove`、`cart:to-goal`、`scenario:toggle`、`scenario:edit`、`assumptions:edit`、`assumptions:reset`、`progress:view`、`paywall:intent:report`、`paywall:intent:counsel`。`sim:*` 与 `cart:to-goal` 是 M3 漏斗段（加购 / 移出 / 一键成目标）；`scenario:*` 是 M4 S1 的情景段（开关系 / 改幅度，改幅度在 blur 时报一次，避免逐键刷屏）；`assumptions:*` 是 M4 S1.5 的假设调整段——**这两个事件只带字段名，数值从头就不发**（用户自己填的回报率与提取率属于财务数据，红线：不上传；冒烟有一条断言盯「props 里出现数字就红」）；`progress:view` 是 M4 S1.6 的回访读数段，**零 props**，只在「本机有至少两个历日的测算快照」时报，所以它的计数含义是「隔天再算并看见了对照」——**不是回访率**（没有分母，也不存标识符）；`converter:expand` 是本金口径（`docs/comparison-converter.md` §2.2）在设计器 sticky 上的展开位，**零 props、一次页面访问只报一次**（反复折叠不刷屏）。`paywall:intent:*` 是假付费信号（M4 S4 的前置探针，2026-10-08 随 PR #51 上线）：报告页两个不收款的选项，props **只带 `{ tier }`**、不带价格或任何财务数字——它先产出 PRD §11.2 缺的「付费意愿」读数，据此再决定要不要投入真支付开发。事件名走 worker 既有正则 `/^[a-z][a-z0-9:_-]{0,63}$/`，无需改收集端。props 全丢后只剩频次（`cart:to-goal` 虽带件数，入库时同样丢弃）。

**合成流量自标记（2026-10-07）**：冒烟运行一律带 `?smoke=1`，此后同标签页的所有事件名加 `smoke:` 前缀（`apps/web/src/lib/analytics.ts` 的 `SMOKE_PREFIX`；标记落在 `sessionStorage`，一次冒烟跳多个 URL 也延续）。原因：库里只有 `{ts, day, event}` 三个字段，**冒烟行与真人行形状完全相同**，在真实流量为零时跑一次生产冒烟就会把「到底有没有人来过」这个唯一信号污染掉。带前缀后可以从查询侧整段滤掉：

```sql
-- 真人流量（排除我们自己的验证跑）
SELECT event, COUNT(*) n FROM events WHERE event NOT LIKE 'smoke:%' GROUP BY event;
```

**打开读数的两步（2026-10-05 已全部完成）**：

1. Pages → 项目 `rich-sim` → Settings → Environment variables → Production 加 `PUBLIC_ANALYTICS_ENDPOINT=https://rich-sim-collect.jiangfengkxi.workers.dev/collect`（Preview 可不加）。Astro 在**构建期**内联 `PUBLIC_*`（见 `apps/web/src/components/Analytics.astro:14-16`），设完必须有一次新构建才生效。✅ 已配。
2. 触发构建：推一个提交，或 dashboard 对该 production 部署 Retry deployment。✅ 当天先 Retry 了 `cefaf27`（部署 `ca9de98d`）让变量进构建，随后主干的 beacon 修复又触发一次正式构建。

**sendBeacon 踩坑（2026-10-05，修在 `c6894a2`）**：变量打开后线上冒烟全过、本地事件队列也被清空，但 D1 一行都没进。根因是 `navigator.sendBeacon` **固定走 no-cors 模式**，而客户端最初用 `new Blob([body], { type: 'application/json' })` 把 Content-Type 设成了 JSON——`application/json` 不是 no-cors 允许的 safelisted type，Chrome 在请求发出前直接 `net::ERR_FAILED` 拦掉；但 `sendBeacon` 仍同步返回 `true`，客户端据此裁剪队列，于是事件**静默全丢**，表面无任何异常。修复：beacon 直接传单字符串，浏览器自动用 `text/plain;charset=UTF-8`（no-cors 放行）；collect 端 `request.json()` 不校验 Content-Type，故 worker 无需改动、无需重新部署。验证方式：headless Chrome 在生产页上下文发 `navigator.sendBeacon(endpoint, JSON.stringify(...))`，网络面板必须看到该 POST 真实 200，再到 D1 console 查到行——只看「beacon 返回 true / 本地队列清空」不算数。**（2026-10-07 更新：这条已取代——beacon 本身在卸载路径上会随机丢，传输改为 `fetch` + keepalive，见下一节。本段的「必须看真实 200 + D1 读到行」这条验证纪律继续有效，而且正是它暴露了 beacon 的丢失率。）**

**验证**：`BASE_URL=https://app.rich-sim.bayjf.com node scripts/e2e-smoke.mjs`（脚本自己给首个导航加 `?smoke=1`），然后查 D1：`wrangler d1 execute rich-sim-events --remote --command "SELECT event, COUNT(*) n FROM events WHERE event LIKE 'smoke:%' GROUP BY event"`——冒烟验证要看到的是 **带 `smoke:` 前缀**的事件名；裸名（`NOT LIKE 'smoke:%'`）才是真人。等价的 HTTP 查法：`curl -s -x http://127.0.0.1:7900 -H "Authorization: Bearer $READ_TOKEN" "https://rich-sim-collect.jiangfengkxi.workers.dev/summary?since=2026-10-01"`。

**传输已改为 `fetch(..., { keepalive: true })` + 「确认才裁」（2026-10-07，实测驱动）**

`sendBeacon` 的两个弱点叠在一起：① 返回 true 只代表「已入队」，不代表「已送达」，而旧实现凭 true 就裁剪本机队列；② 快速翻页时，卸载路径上的 beacon 大量被浏览器直接丢弃。用本地 sink 实测一次冒烟：约 15 个事件**只有 1 条到达收集端**。也就是说线上 D1 的漏斗会系统性缺九成，而表面完全正常——比 10-05 那次更危险，因为它不是全丢，是**随机丢**。

现在：`fetch` + `keepalive` 发批，**收到 2xx 才裁剪**；未确认就留在队列里，下次访问重发。代价是**至少一次**语义（同一事件可能落多行）：同一条冒烟 21 个事件落成 78 行、按 `(event, ts)` 去重后 20 个（约 3.9 倍冗余；仍差 1 条，是浏览器关闭前没来得及发的最后一个）。`ts` 存的就是事件自身的 `at`，所以重复行可以完全去重。收集端 `/summary` 的计数相应改成 `COUNT(DISTINCT event, ts)` —— **代码已改，要重新部署 worker 才生效**。

**读数纪律**：对原始行直接 `COUNT(*)` 会高估数倍，任何计数都要先按 `(event, ts)` 去重。

**一个与上面无关、但容易误判的本机现象**：这台机器直连 `*.workers.dev` 的 DNS 被污染（解析到 108.160.163.106，`curl` 不带代理返回 000），而浏览器走系统代理 `127.0.0.1:7900` 才通。所以「shell 里 curl 收集端失败」**不等于**埋点坏了。要确认收集端能不能收名，走带代理的 POST 探针 + D1 读回——M3 的三个事件名就是这么确认的（`smoke:sim:add` / `smoke:sim:remove` / `smoke:cart:to-goal` 各 1 行入库，worker 的收名正则零改动）。

### Cloudflare Web Analytics 怎么配（**2026-10-05 决定暂缓**，以下是恢复时的步骤）

1. Cloudflare 控制台 → **Web Analytics** → Add site → 域名填 `app.rich-sim.bayjf.com`，复制 beacon token。
2. Pages → 项目 `rich-sim` → Settings → Environment variables → 加 `PUBLIC_CF_WEB_ANALYTICS_TOKEN`，**Production 与 Preview 都要设**。Astro 在**构建期**内联 `PUBLIC_*`，设完必须有一次新构建才生效。
3. 触发构建：推一个提交，或在 dashboard 对该 production 部署 Retry deployment。
4. 验证：`curl -s https://app.rich-sim.bayjf.com/ | grep beacon.min.js` 必须命中 `static.cloudflareinsights.com/beacon.min.js` 且带 `data-cf-beacon`。未命中即变量没进构建。

本机 `wrangler` 的 OAuth token 权限**只有 `account(read) / user(read) / workers(write) / d1(write) / pages(write)` 等**，**建不了 Web Analytics 站点、也写不了 Pages 变量**（`pages(write)` scope 在 API 层不能改项目级环境变量），所以以上步骤只能在控制台完成；不要试图用 `vercel env pull` 那类思路找凭证，这里没有可代跑的通道。

## 发布事故：CI 卡在 queued，pr-helper 不合并（2026-10-05，S1 · 已解除）

**现象**：推 dev 后 pr-helper 正常开出 PR #31、Cloudflare Pages 构建 SUCCESS，但 **GitHub Actions 的 CI（push + pull_request 两个 run）一度 `queued`、runner 没领任务**（不是 in_progress）。pr-helper 等 CI 变绿才自动合并。

**判定**：这不是代码问题——本地测试全绿、`npm run check` 0 错误。run 卡在 queued 而不是 in_progress，指向 **GitHub Actions 侧**（免费额度/计费，或 runner 排队），不是测试 flaky。

**收尾（2026-10-05 20:46 UTC）**：CI 恢复后 run 自动开始并变绿，pr-helper 随即自动合并 PR #31，main 更新、生产发布完成，无需人工干预。

> 教训（写进这里）：**「PR 开了但迟迟不合并」先查 run 是 `queued` 还是 `in_progress`**。queued 不动是基础设施/计费问题，别去翻测试，恢复后无需补操作；这与「合并后门禁红 check 导致停摆」是两种不同的停摆，诊断时先分清。

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
  —— 第 4 条用仓库自带脚本，不要手点：`BASE_URL=https://app.rich-sim.bayjf.com node scripts/e2e-smoke.mjs`（断言数随片子增长——2026-10-08 实测 **124 条**（开着 `PUBLIC_HOMEPAGE_CLAIM` 跑，否则领钱段整体跳过、只剩 **118 条**；2026-10-08 M4 S2 报告那一步新增 **9 条**：五个小节齐全 / 免责声明随报告走 / 正文无输入控件 / 打印入口存在 / 打印样式命中报告与合规面板）（含换算条、i18n 的 SSR 语言断言，以及 M4 S1.5 的可调假设 12 条：SSR 源码无编辑岛 / 提取率减半够用线翻倍 / 情景面板那个**另一个岛**跟着重算 / 合规清单同步成生效值 / 刷新后仍是改过的值 / 越界拒绝且不落盘 / 失焦拉回 / 一键回默认 / 两个新事件不带数值，以及 M4 S1.6 的本机测算历史 15 条：SSR 源码无复盘块 / 首次测算只落一条 / 没有上一条时不编造对比 / **同一天反复测算不增长**（钉住 `writeDraft` 广播回来的重入不会变成写放大）/ 年限与净资产差值 / 跨币种不给金额差但年限仍比 / 状态跨档复用三状态词典 / `progress:view` 零 props，以及本金口径 8 条：未录入财务时没有展开位 / 默认折叠 / 本金 = 页上所示年成本 ÷ 页上所示提取率 / 展开位与换算条说的是同一笔钱 / 展开句子里复述除法本身 / `converter:expand` 一次访问只报一次 / 展开态 390 宽不溢出 / 英文换算条不夹中文项名）；新增购物区加购/幂等/同维多件、账单预览变色、1:1 配比、75% 折价、一键成目标单向桥与三个新埋点；headless Chrome 驱动系统 Chrome，退出前打印 `TOTAL n FAILS m` 与埋点事件摘要）。脚本含卡 A 与账单日的断言，所以老号线上的新分支会在这两项变红，属预期。
> **本地跑冒烟时的断言数陷阱（2026-10-08 踩到）**：`PUBLIC_HOMEPAGE_CLAIM` 是**服务端**读的，
> 写在跑脚本的命令上（`PUBLIC_HOMEPAGE_CLAIM=1 node scripts/e2e-smoke.mjs`）**不起作用**——领钱段照样整体跳过。
> 要把变量放到起 dev/preview 服务的那条命令上。同一份代码因此有两个合法读数（开 107 / 关 101），
> 引用断言数时必须连着开关态一起说，否则会把一次少跑了 6 条的读数当成回归。
> **本地 dev 冒烟点不到 sticky 条里的东西（2026-10-08 踩到）**：Astro 的 dev toolbar 浮在视口底部，
> 正好盖住设计器 sticky 条，playwright 的真点击会卡在可点击性上直到超时
> （报错原文：`<astro-dev-toolbar> intercepts pointer events`）。这不是产品缺陷——生产构建没有工具条。
> 脚本里 `page.addStyleTag({ content: 'astro-dev-toolbar{display:none !important}' })` 只在测试内按住它，
> **仍然走真点击**；不要改成 JS 派发或 `force: true`，那一条就再也证明不了「用户点得动」。
5. `/sitemap.xml` / `/robots.txt` 返回 200，且其中域名与当前正式域名一致（正式域为 `app.rich-sim.bayjf.com`）

> **2026-10-04 五条全部在生产实测通过**：标题 `财富模拟 · rich-sim`；`/api/fx?base=CNY` 返回 6 币种、`date=2026-10-02`、来源 Frankfurter (ECB)，与上游同一 URL 逐字段一致；`/app/result` 源码含假设清单与免责声明；冒烟 15/15；sitemap 与 robots 内域名均为当时的 `rich-sim.pages.dev`。同日域名拍板并绑定后，第 4 / 5 条已在正式域 `app.rich-sim.bayjf.com` 重跑：冒烟 15/15、`robots.txt` 的 `Sitemap:` 与 `sitemap.xml` 的 4 个 `<loc>` 均为该域、每页 canonical 同域自洽。

## 与 landing 的关系
- `rich-sim-landing`（营销落地页）：独立仓库 `bayernjf/rich-sim-landing`，已 Git 集成上线 → https://rich-sim-landing.pages.dev（含 `rich-sim.bayjf.com`）
- 产品应用 `rich-sim`：本仓库，SSR 应用。两个 Pages 项目各自 Git 集成，互不影响
- 换正式域名时要同步的位置（2026-10-04 实测清点）：`apps/web/public/sitemap.xml`（4 个 `<loc>`）、`apps/web/public/robots.txt`（1 行 `Sitemap:`）、`rich-sim-landing/src/content/site.ts` 的 `APP_URL`、以及 Cloudflare 侧的 DNS 记录与 Pages Custom domain。**没有别的地方**：本仓库不存在 `consts.ts`，`astro.config.mjs` 也没设 `site`，应用源码与 `manifest.webmanifest` 里没有任何自引用的绝对 URL——此前本节写的「consts.ts / Astro config」是凭空列的，已按实测更正。
