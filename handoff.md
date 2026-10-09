# Handoff · rich-sim（财富模拟 · 产品）

> 更新时间：2026-10-08（F9 本机版多剧本存档 + 领钱 P2 金币雨 + 账号体系立项 D4 翻转）
> 本仓库是**产品仓库：文档 + 应用代码一体**（M1 代码已并入，2026-10-04）。

---

## 这个仓库是什么

产品全部资产：构想 / 需求 / 架构文档（`docs/`）+ 产品应用代码（`apps/web`）+ 计算引擎（`packages/core`）+ 工程约定（`CONVENTIONS.md`）。

## 当前状态

- **文档**：见下表——**这张表就是本仓库的唯一文档清单**，别在别处复制份数或文件名（`README` 与 `AGENTS.md` 只指到这里）。2026-10-08 现测：`docs/` 下 16 份、表内 16 行
- **分支**：`dev`。S1 已随 PR #31 合并进 main（2026-10-05），生产已上；体验项补源是其上的后续提交，**同步/领先状态不写死**（AGENTS.md「不要写死会变的结论」）——现测：`git fetch origin && git rev-list --count origin/dev..dev`（本地未推）与 `git rev-list --count origin/main..origin/dev`（未进 main）。
- **发布路径**：`dev → main` 的 PR 由 **pr-helper**（用户自建的 GitHub App）按 `ahead_by >= 1` 自动创建并自动合并，main 推送即触发 Cloudflare Pages 生产构建；见「下一步」与 `docs/DEPLOYMENT.md`。
- **默认分支**：`main`
- **远程**：`git@github.com:bayernjf/rich-sim.git`（public）

| 文档 | 内容 | 状态 |
|---|---|---|
| `docs/product-concept.md` | 原始构想 + 独立评估 + 验证计划 | 完成 |
| `docs/original-qa.md` | 发起时的完整问答存档 | 完成（存档，不再更新） |
| `docs/PRD.md` | 产品需求：功能分级、旅程、度量、里程碑 | Draft |
| `docs/technical-design.md` | 技术选型与架构 | Draft |
| `docs/wealth-lifestyle-framework.md` | 富豪生活方式内容框架（F5 富豪模拟的内容骨架） | Draft |
| `docs/simulation-gameplay.md` | 模拟玩法设计草案（购物 / 六通道体验 / 对比闭环 / 名人原型合规） | Draft |
| `docs/deferred-items.md` | 可边迭代边讨论的待决事项（每条带触发条件与阻塞性） | 活跃 |
| `docs/m1-task-breakdown.md` | M1 任务分解与并行执行规划（13 任务 × 4 Wave，多 agent 编排） | 活跃 |
| `docs/DEPLOYMENT.md` | Cloudflare Pages Git 集成部署配置、发布流程、冒烟清单与发布事故记录 | 活跃 |
| `docs/comparison-converter.md` | 对比换算器方案（把富人年成本翻译成用户的时间单位）：两种口径、币种/边界规则、红线对照、MVP 范围 | **v1.1：§2.1 轻量口径（M2 S3）与 §2.2 本金口径（2026-10-08，设计器 sticky 可展开）均已实现**；§4 记录了挂载位与原方案的差异及理由 |
| `docs/homepage-claim-experience.md` | 首页「领一百万」方案 **v2**：虚拟起始金走独立 `rich-sim:sim:v1`、两拍特效、SIM/REAL 两条账本单向桥、逐条红线对照、分期 P1-P3 | **P1 已实现（2026-10-05，切片 S4），生产入口已打开**（`PUBLIC_HOMEPAGE_CLAIM=1`，Preview 未配）；P2 金币雨、§9 #1 起始金三档（$100K/$1M/$10M）与 P3 投资线（五资产类别 + 自填收益率，2026-10-08；+ 蒙特卡洛波动路径 GBM×300 种子化、常驻非预测标注，2026-10-09）均已实现，守全部红线；见该文档 §7/§7.1 |
| `docs/m2-decisions.md` | M2 决策包 D1–D5：F5 首个剧本、六通道取舍、F2 逐项支出、账号体系、投资线——每条一个可批选项 + 理由 + 翻转条件 | **已整包确认（2026-10-05）**，保留翻转条件备查 |
| `docs/m2-task-breakdown.md` | M2 实施分解 S1–S4：卡 A 看板 / 账单日 / 换算条 / 领钱入口，含两个必须先过的冻结契约闸门与内容取值规则 | **S1–S4 全部上线（2026-10-05）**；埋点管道同日接通并修掉 sendBeacon 静默丢事件缺陷，§5 已更新 |
| `docs/m3-task-breakdown.md` | M3 实施分解 S1–S5：购物机制 / 购物车 / 购物即记账 / 一键成目标（SIM→REAL 单向桥），含 G1–G4 四个契约闸门与体验项内容规则 | **已开工（2026-10-06）**：G4 拍板走方案 (a)（`goalOverride`）；**S1–S5 全部已上线**（S1 随 PR #31，S5 随 PR #36，均已合并 main） |
| `docs/sim-shopping-mall.md` | 富豪商城设计 v1（2026-10-09）：清单式购物区升级为购物网站形态——商品卡片流 + 分类 tab + 购物车抽屉 + 「结算=账单日」反转；算术层零改动，S1-S3 分期 | **草案，待发起人过目** |
| `docs/m5-task-breakdown.md` | M5 实施分解：账号体系（2026-10-08 发起人拍板立项，D4 翻转）——Supabase Auth + 草稿云端同步，localStorage 优先不动摇，含隐私/契约闸门 | **S1 Auth 代码完成（2026-10-08）**：magic link 登录岛挂三页，未配置 env 零渲染；G1（Supabase 项目）/G2（magic link）已过；dashboard 两步已完成（agent 浏览器代办）；S2 草稿同步代码已完成（decideSync + SyncBridge，web 244 测试绿、冒烟 142 条 FAILS 0）；S3（SIM 账同步 + 登出语义）同日完成，M5 三片代码齐；已随 PR #54 合并 main 上线（Supabase Pages 变量已配）；G3 隐私政策页已实现（/privacy 双语 SSR + 页脚入口，文案待发起人过目）；登录方式 2026-10-09 翻转为邮箱+密码（Confirm email 已关，注册即登录）；**真人联调已闭环（2026-10-09 凌晨）**：生产注册成功即登录、改存款 2s 防抖上行、`plans` 表 plan/sim 两行核对一致（payload 存款数字与页面输入逐位相符、时间戳吻合）——M5 端到端全通 |
| `docs/m4-task-breakdown.md` | M4 实施分解：F7 多情景推演 + F8 深度报告导出，含 G1–G6 六个闸门（报告生成位置 / 导出格式 / 付费墙 / 支付渠道 / 是否动冻结契约 / 报告挂载位） | **S1（F7）随 PR #43、S1.5 随 PR #44、S1.6（F6 本机版测算历史）、S1.7（本金口径）均已上线**（2026-10-08）。**S2（F8 报告 + 打印导出）已随 PR #47–#49 合并 main**：纯前端报告、`@media print` 样式与打印入口。**假付费信号已随 PR #51 上线**：报告页两个不收款选项（`paywall:intent:*`，props 只带档位），先攒 PRD §11.2 的付费意愿读数。**只剩 S4（付费墙 + 支付）**——M4 里唯一需要服务端的一片，等 G3 / G4 基于意愿读数拍板。现值（270 单测 / check 0 hint / 冒烟 127·121）统一写在 m4 分解顶部 |

## 已做的决策

| 决策 | 结论 | 出处 |
|---|---|---|
| **产品名** | **rich-sim**，中文名「财富模拟」（2026-10-03 拍板） | `product-concept.md` §7.2 |
| 产品方向 | 双主线：富豪模拟做钩子，现实测算做落点 | `product-concept.md` §7.1 |
| 目标市场 | 先海外，后大陆 | `technical-design.md` §9 |
| 技术栈 | Astro + React 岛 + 独立纯函数计算引擎 | `technical-design.md` §3 |
| 数据库 / 账号 | Supabase（Postgres + Auth + Storage） | `technical-design.md` §3 |
| 托管 | 海外 MVP：应用 + 营销**全 Cloudflare**（一个平台管 DNS/CDN/WAF/部署）；Vercel 后置为触发选项（服务端变重时评估迁入） | `technical-design.md` §9 |
| MVP 形态 | ~~无后端，方案存 `localStorage`~~ **2026-10-08 翻转（发起人拍板：账号体系立项）**：localStorage 优先、不登录可全程使用；登录后草稿云端同步（Supabase Auth + Postgres）。红线不变：同步是**用户显式登录后的主动行为**，匿名分析与事件管道仍不碰财务数据 | `technical-design.md` §10、`docs/m5-task-breakdown.md` |
| 产品形态节奏 | M1 响应式 Web（移动端达标）；M2 加 PWA；大陆做微信小程序（Taro）；原生 App 以付费+回访触发门驱动 | `technical-design.md` §10.1 |
| 币种与汇率 | 计算在本位币、换算只在展示层；汇率 = 假设的一部分（快照进 Assumptions 并参与版本化）；M1 实时汇率（SSR 代理），M2 历史汇率 | `technical-design.md` §4.2 |
| **M2 决策包 D1–D5** | **D1** F5 首个剧本 = 卡 A 科技独角兽创始人（年成本 $1,317,000，$1M 起始金只够 76%）；**D2** 六通道只做 看见 / 感受（账单日）/ 比较（换算器），购物与剧情与特权后置；**D3** F2 逐项支出移出 MVP 降 P2（撞 §3.2 Non-Goal）；**D4** ~~账号体系暂不立项，等同设备回访读数~~ **2026-10-08 翻转：发起人拍板立项**（读数为 0、判据短期读不出，发起人直接拍），实施分解见 `docs/m5-task-breakdown.md`；**D5** 投资线、付费墙、支付渠道一起押后（2026-10-05 整包确认） | `docs/m2-decisions.md`、`docs/m2-task-breakdown.md` |
| **F5 排期** | **维持 P0，最小版从 M3 提到 M2**（1 个身份剧本 + 资产看板 + 持有成本 + 现金流波动，纯前端）；购物机制 / 六通道 / 原型卡 / 多剧本仍归 M3。M2 第一步是接度量而非写 F5（2026-10-05 拍板） | `docs/PRD.md` §13.7、§12 |
| **M3 桥口径 G4** | 走方案 **(a)**：`Draft` 增可选 `goalOverride?: { annualCost, from: 'sim-cart' }`，一键成目标**只携带年成本一个数字**进 REAL（不带起始金、不带资产占比）；`choices` 仍写「每维最贵项」作展示回显。过 `draft.ts` 冻结闸门（2026-10-06 拍板） | `docs/m3-task-breakdown.md` §0 G4、§3 S4 |
| **界面语言（i18n 切片）** | 双语 zh / en，**默认 en**，选择存 Cookie 并在 SSR 期生效（合规文本不能靠客户端改写）；目录英文名放 `catalog-data.ts` 的 `CATALOG_LABELS_EN` + 穷尽性测试，**不动冻结的 types.ts**；UI chrome 走 `lib/messages.ts`（`en` 用类型强制覆盖每一个 zh key）；逐页迁移：设计器、财务录入、结果页、首页与领钱入口已完成（2026-10-07）；六个界面全部迁移完毕（2026-10-07）；残留：目录项 `note` 仍是中文（内容层，且**当前无任何页面渲染它**）；会渲染的 `costComponents` 已于 2026-10-07 补英文（`CATALOG_COST_COMPONENTS_EN` + `optionCostComponents`） | `docs/PRD.md` §9、`apps/web/src/lib/i18n.ts`、`lib/messages.ts`、`packages/core/src/catalog-data.ts` |
| **可调假设范围 M4 S1.5** | 只有 `returnRate`（`0–20%`）与 `withdrawalRate`（`1–20%`）可改，**`inflation` 保持只展示**——没有任何公式吃它，给一个不动数字的输入框等于骗人；越界**拒绝并说明区间、不静默夹紧**；提取率下限 > 0 是算术要求（够用线要除以它）。跨岛即时重算走 `writeDraft` 派发的同页事件 `rich-sim:draft-updated`（不是存储 key、不落盘，故不在冻结清单）；SSR 合规清单由岛按 `[data-assumption]` 钩子改成真正生效的数值（2026-10-08） | `docs/m4-task-breakdown.md` §7、`docs/PRD.md` §6.2 |
| **F6 本机版 M4 S1.6** | 进度追踪**不做成完成度进度条**，只做「上一次测算 vs 这一次」的差值读数，且「什么都没变」照实说——形状来自 `product-concept.md` §3.2 的自我否定（净资产按月几乎不动，进度条看不见反而劝退）。快照**按历日一条**、当天覆盖；记的是**算出来的数**而不是输入（否则等于替昨天说一套它当时不成立的话）；跨币种**不给金额差**、年限仍比（齐次性已用 USD/CNY 双 profile 差分验证）；`Draft` 增可选 `history`（`schemaVersion` 不动，2026-10-07 口头批准）；`writeDraft` 对 `history` 隐式保留；`progress:view` 零 props，**不是回访率**（无分母，§11.2 死结未解） | `docs/m4-task-breakdown.md` §8、`CONVENTIONS.md` localStorage 节 |
| **本金口径挂载位 S1.7** | 展开位放**设计器 sticky**（对象=当前最贵单项），**不放结果页**——那页的主数字「够用线」本身就是整份生活的本金，再做一个点开才看到的同一数字是重复不是教育。偏离 `comparison-converter.md` §4 原文，已在该文档 §2.2 / §4 双侧记录差异与理由（2026-10-08） | `docs/comparison-converter.md` §4、本文「下一步」S1.7 段 |
| **M4 报告形态 G1 / G2** | ✅ **已拍板（2026-10-08）**：**G1 = 纯前端生成**——服务端生成必须先把用户的收入/支出/存款/负债上传，撞「用户自填的财务数据不得上传」红线；且不动「MVP 无后端」，成本低一个数量级（报告只是 `computeResults` 已有输出的排版视图）。**G2 = 浏览器打印样式（`@media print`）导出 PDF，分享链接不做**（分享同样要上传数据）。**服务端不是被否决，而是推迟到 S4 且只用于收款 / 验权**——S2 / S3 因此解锁 | `docs/m4-task-breakdown.md` §0、§2、§6 |
| **域名 / 英文名** | 产品 `app.rich-sim.bayjf.com`（2026-10-04 绑定，浏览器实测可达、canonical/robots/sitemap 同域、冒烟 15/15），落地页 `rich-sim.bayjf.com`；英文名沿用 `rich-sim`。**品牌视觉 / 商标仍 `待定`** | `docs/deferred-items.md` #2、`docs/DEPLOYMENT.md` |
| **F2 逐项支出（2026-10-08 拍板 (b)）** | **扩 `Profile` 让逐项支出真进引擎**：`expenseBreakdown?`（住房/交通/食品/其他四大类，月口径，可选、旧草稿兼容），引擎经 `profileMonthlyExpense` 取数（`project`/`gap`/`buildMilestones`/换算器全走它）；财务页支出为「高级：拆开填（默认收起）」，任一子项填写即写 breakdown 并参与测算，全空回落单个数（旧草稿逐位不变）。**部分推翻 m2 D3**：恢复"进引擎"，保留其顾虑（只 4 大类、默认收起，不重开 §3.2 记账工具 Non-Goal）；`assumptionsVersion` 不升版（无公式变化）。切币种时 breakdown 逐项换算不丢（CurrencySwitcher） | `docs/PRD.md` §8、`docs/m2-decisions.md` D3、`CONVENTIONS.md` |

## 下一步

**M1：核心闭环** —— 理想生活设计器 + 轻量财务录入 + 计算引擎。无后端、无账号。移动端响应式达标（PRD §12）。

任务分解与并行排期见 `docs/m1-task-breakdown.md`（13 任务 × 4 Wave：T01 建仓 → Wave1 三线并行 [core 链 / Catalog 内容 / UI 骨架] → Wave2 组装 → Wave3 达标 → Wave4 验收）。

落地页里已有一个可复用的测算器雏形，见 `rich-sim-landing/src/components/Calculator.astro`。

实施拆解（2026-10-03 规划）：
1. ~~建 `rich-sim-app` 仓库（Astro 5 + React 19 + TS + Tailwind v4，单仓库 + `packages/core`）~~ ✅ 已完成（T01，2026-10-03，`npm run dev`/`test`/`check`/`build` 实测通过）
2. ~~`@rich-sim/core` 类型契约~~ ✅ 已冻结（T02，`packages/core/src/types.ts`，TS 严格 0 错误）；函数实现与测试（T03–T04）✅ 37 条全绿，手算样例独立复核一致
3. ~~理想生活设计器（7 维度 × 3–5 选项，合理默认值）~~ ✅ T05 Catalog（7 维 × 23 选项，**23 项全部带可查证公开来源**，2026-10 校准，见 `26b4f4b`）✅ T06 设计器（2026-10-03）
4. ~~轻量财务录入（≤4 项）~~ ✅ T07（2026-10-03）
5. ~~测算输出：三状态 + 假设清单 + 免责声明（服务端渲染，不被 JS 关掉）~~ ✅ T08（三状态/阶梯目标，43 测试全绿）+ ✅ T09（纯 SSR 面板，2026-10-03）
6. ~~币种：本位币选择 + 实时汇率（SSR 代理）~~ ✅ T10（2026-10-03；实测 Frankfurter 已迁移至 api.frankfurter.dev/v1，base=CNY 可用）
7. ~~移动端响应式达标~~ ✅ T11（2026-10-04；生产口径 LCP<2.5s / INP<200ms / CLS<0.1 全达标）
8. ~~参照落地页 Calculator.astro 校验口径一致~~ ✅ T12（2026-10-04，五组样例双侧一致，无需回写）+ ✅ T13（E2E 15/15 + 完成率埋点可观测）
9. ~~M1 移动端指标~~ ✅ T11（2026-10-04）

**M1 状态：核心闭环完成（2026-10-04）**。**部署状态**：`rich-sim-landing`（落地页）→ https://rich-sim-landing.pages.dev（**Git 集成**：GitHub `bayernjf/rich-sim-landing`，push main 自动构建，另绑 `rich-sim.bayjf.com`）；产品应用 `rich-sim` → **https://rich-sim.pages.dev 已上线**（Git 集成：GitHub `bayernjf/rich-sim`，monorepo 根部署 + `.nvmrc` Node 22；首次构建因 main 缺 `package-lock.json` 报 EUSAGE，已修复推送；详见 `docs/DEPLOYMENT.md`）。线上冒烟全过（2026-10-04 实测）：首页 200「财富模拟 · rich-sim」、`/api/fx` 返回完整汇率快照（CNY base，Frankfurter ECB）、`/app/result` 假设清单+免责声明纯 SSR 源码可见——**M1 遗留风险（Cloudflare 环境冒烟）已关闭**。下一步（**2026-10-05 拍板 F5 后重排**）：① ~~配 `PUBLIC_CF_WEB_ANALYTICS_TOKEN`~~ ✅ **2026-10-08 已配置**（建站点 + Pages Production 变量 + 重建，线上 HTML 已见 beacon，PV/会话开始积累；详见 `docs/DEPLOYMENT.md` 分析埋点节）；**自定义事件管道已全通（2026-10-05 晚）：收集端部署 + Pages Production 变量 + beacon 修复均完成并端到端验证，见 M2 段**；② **F5 最小版**（1 个身份剧本 + 资产看板 + 年持有成本 + 现金流波动，纯前端），启动前须拍 gameplay §6 的「首个剧本身份」与「六通道取舍」；③ 账号体系是否立项（`待定`，会推翻「MVP 无后端」）。域名 `app.rich-sim.bayjf.com` 已绑定并复验通过。

**M2（F5 最小版 + 三通道）进度**（2026-10-05）：S1 卡 A 资产看板（`/app/sim`，纯 SSR）、S2 账单日（现金流波动 + 断裂负担率）、S3 换算条（轻量口径，挂设计器 sticky 与结果页）**均已上线**；**S4 领钱入口**代码完成——独立账本 `rich-sim:sim:v1`（第二个冻结 key，见 `CONVENTIONS.md`）、首页两拍受 `PUBLIC_HOMEPAGE_CLAIM` 控制、**2026-10-05 晚已在生产打开**（Pages Production 配 `PUBLIC_HOMEPAGE_CLAIM=1`；Preview 未配），A 线「够撑多久」挂在 `/app/sim`（`$1M ÷ 卡 A 年成本 = 9.1 个月`；加游艇后 1.8 个月；纯除法，不走 `project`——SIM 态没有收入，用法与 §8 验收 #8 的例外处理见 `homepage-claim-experience.md` §7.1）。
**M2 四片至此全部交付且埋点管道已通**（2026-10-05 晚）：Pages Production 配好 `PUBLIC_ANALYTICS_ENDPOINT=https://rich-sim-collect.jiangfengkxi.workers.dev/collect` 与 `PUBLIC_HOMEPAGE_CLAIM=1`，Retry deployment 让变量进构建后，线上冒烟 37/37、首页已见「领一百万」、analytics chunk 已内联端点。首日发现并修复一个**静默丢事件**缺陷：`sendBeacon` 固定 no-cors，原实现以 `application/json` Blob 发送被浏览器在发出前拦截（`net::ERR_FAILED`），而 beacon 仍返回 true、队列照常裁剪（`c6894a2` 改为纯字符串载荷，worker 无需改动）。修复后经 headless Chrome 真实 beacon + D1 console 双重确认入库；联调用的 3 条 `probe:*` 诊断事件验证后已删除，当前 D1 仅余真实漏斗事件。下一步不再是既定切片，需要重新排：账号体系 / 投资线等仍押后（D4、D5），判据依赖真实流量下的漏斗读数。PV/会话分母已于 2026-10-08 接通（`PUBLIC_CF_WEB_ANALYTICS_TOKEN` 已配）。

**2026-10-07 补记（传输换了）**：上面那条 beacon 事故只修了一半——纯字符串载荷解决了 Content-Type 被拦，但 beacon 在卸载路径上仍会**随机丢**，而旧实现凭「beacon 返回 true」就裁剪队列。本地 sink 实测一次冒烟：约 15 个事件**只有 1 条到达收集端**（比全丢更危险，表面一切正常）。现改为 `fetch(..., { keepalive: true })` + **收到 2xx 才裁队列**，代价是至少一次语义：同一条冒烟 21 个事件落成 78 行、按 `(event, ts)` 去重得 20 个。收集端 `/summary` 计数已相应改成 `COUNT(DISTINCT event, ts)`，**代码改了、还没重新部署**。口径与验证纪律见 `docs/DEPLOYMENT.md`。

诚实边界：埋点管道已通但**真实流量读数尚为零**——当前 D1 里只有联调产生的事件；S1–S4 有没有效果仍要等真实访客积累，口径见 `m2-task-breakdown.md` §5、`docs/DEPLOYMENT.md` §分析埋点。

**M3（F5 完整化：购物机制 + 一键成目标）**：2026-10-05 晚产出分解草案 `docs/m3-task-breakdown.md`（S1–S5：core 玩法字段 + 2–3 个带来源的体验项 → `/app/sim` 购物车 → 购物即记账/负担率联动 → SIM→REAL 一键成目标 → 埋点冒烟），**2026-10-06 已开工**：发起人拍板 G4 走方案 (a)——`Draft` 增可选 `goalOverride`（只携带年成本一个数字进 REAL，不带起始金与资产占比）；备选「限制同维一件」与卡 A 事实冲突，已排除。**S1 已完成**：G1 类型扩展、catalog 字段标注、`shoppingPool()`（池 = 12 个 catalog 标注项）随 PR #31 合并上线；2 个纯体验项（私人喷气环球之旅 $189,500/人、Met Gala 门票 $100,000/张，均带已核验 http 来源）放在 **web 侧** `sim-content.ts` 而非 core catalog（不破坏每维 3–5 项/递增/单一默认档契约），购物池现为 14 项。**S2、S3 已上线**：`sim-draft.ts` 扩可选 `cart`（schemaVersion 维持 1、旧草稿空车兼容、幂等加删、坏数据收敛、与 `draft.ts` 仍零 import），新 `ShoppingArea.tsx` 岛挂 `/app/sim`（不新增路由 = G3），按资产/消费品/体验三组陈列，年成本与来源齐全，`aria-pressed`/`aria-live`/44px 触摸目标/`motion-reduce` 达标；SSR 首帧岛渲染 null、看板与免责声明完整。**S3 代码完成**：`sim-content.ts` 增 `cartAddedAnnualCost`/`cartKindCounts`/`cartBurdenSummary`（逐项求和、基线项不双算、阈值仍取 core 的 burdenStatus），购物区岛显示下一期账单预览（基线+加购、负担率色）、资产>体验时的 1:1 配比提示（明示只呈现算术、非消费建议）、红区 75% 折价变卖引导；空车基线负担率 ≈78% 即黄（与账单日一致）。本地 86 测试绿、check/构建通过。名人原型卡（路径 B）仍等 `deferred #5` 法务，不进本轮。**S4 代码完成（2026-10-06，待推送）**：过冻结闸门——`Draft` 增可选 `goalOverride`，`computeResults` 在 override 存在时直接取其年成本（choices 仍写每维最贵项作回显，非法 override 退回 choices）；新 `sim-bridge.ts` 的 `adoptCartAsGoal` 只写 `rich-sim:plan:v1`、不碰 sim，只带年成本一个数字，按 profile 完整性跳 `/app/result` 或 `/app/finance`；结构测试钉死 sim 账本不变、REAL 无起始金；购物区底部 CTA + 结果页「目标来自富豪模拟购物车」标签，关 JS 降级链接放 SSR 层（岛内 noscript 不渲染，已修正）。本地 95 测试绿。**S5 已上线（PR #36）**：购物区加购/移出埋 `sim:add`/`sim:remove`（`cart:to-goal` 已在 S4 埋），worker 事件名正则天然放行、零改动；`e2e-smoke.mjs` 加步骤 8–9（购物车加购/幂等/同维多件/账单预览变色/折价/一键成目标单向桥），断言 37→49 且实测全过；DEPLOYMENT 事件清单与断言数已同步。**冒烟抓出并修复一个 S2/S3 真实缺陷**：未领起始金（无 sim 账本）时连续加购会互相覆盖——`saveCartItem` 改为吃调用方当前车、有账本才持久化，无账本为纯内存会话态。M3 五片至此**全部上线**（PR #31–#36 已合并 main）。**剩余已关闭（2026-10-07）**：D1 实收 `smoke:sim:add` / `smoke:sim:remove` / `smoke:cart:to-goal` 各 1 行，worker 零改动。**证据分两半**：入库那三条是带系统代理的 POST 探针打 `/collect`（本机直连 `*.workers.dev` 的 DNS 被污染），「客户端会发这三个事件」则由本地冒烟的队列读数证明（`sim:add`×3 / `sim:remove`×2 / `cart:to-goal`×1）——合起来才算闭环。冒烟流量现自标记为 `smoke:` 前缀，真人流量查 `NOT LIKE 'smoke:%'`；口径与两个投递坑见 `docs/DEPLOYMENT.md`。**真实访客仍为 0**：D1 里裸名事件全部停在 2026-10-05。**2026-10-09 追加**：卡 B（老钱继承人，§4.4 第二张虚构卡，纯虚构不碰真名）已上线——`?card=card-b` 切换器、负担率约 5% 绿区与卡 A 78% 黄区同一 4% 口径对照、`cardBurden` 改为每卡现金流参数；六通道补齐三通道最小版（经历·人生快进 30 年 / 感受·黑天鹅收入腰斩 / 地位·特权价目，均 `/app/sim` 纯 SSR，数字全由卡片参数与带来源目录项现算），剩操作通道的「收购谈判 / 加杠杆」与剧情通道随机事件未做。

**M4（F7 多情景推演 + §6.2 可调假设）**：**S1 已上线**——`41a8cc9` 随 **PR #43** 合并进 main（2026-10-08 现测 `git merge-base --is-ancestor 41a8cc9 origin/main` = yes）。**S1.5「假设可调」已随 PR #44 合并 main（2026-10-08 复核；提交 `632a28c` + `6420638` + `9c52265`）**：结果页新岛 `AssumptionsEditor.tsx` 直接写 `draft.assumptions.returnRate / withdrawalRate`，即时重算（跨岛靠 `writeDraft` 派发的同页事件），合规清单按 `[data-assumption]` 钩子同步成真正生效的数值；`inflation` 保持只展示（没有公式吃它）。零契约改动、不新增路由、事件不带数值。**本地实测（S1.5 收尾时）**：212 单测绿（core 59 + web 153）、`astro check` 0 错、冒烟 92 条（开 `PUBLIC_HOMEPAGE_CLAIM`）/ 86 条（关）全过。理由、区间与验收见 `docs/m4-task-breakdown.md` §7。**（下面 S1.6 那段的读数才是现值。）**

**这一片顺带解开的与留下的**：`comparison-converter.md` §2.2 的**本金口径**（「想养住它需要多少本金」+ `converter:expand`）此前卡在「两个率不可调」，前置条件满足后**已由 S1.7 做掉**（见下面那段）；`AssumptionsPanel` 的**汇率行**仍是 SSR 印的静态快照，切币种后不改写（本片之前即如此，仍未做）；`Goal: 'net-worth'` 引擎支持但无 UI 入口。**已知未自动化**：`prefers-reduced-motion` 与键盘走查（沿用 S1 的诚实记录）。设计器页没有任何按假设算出来的数字（sticky 只有年成本与纯除法的换算条，`grep -n enoughLine apps/web/src/components/DesignerShell.tsx` 无命中），所以那一页只需要把底部的清单同步对，已由 `DesignerShell` 挂载时做掉。

**M4 S1.6（F6 本机版 · 测算历史与复盘）代码完成（2026-10-08）**：过 `draft.ts` 冻结闸门——`Draft` 增**可选** `history?: Snapshot[]`（发起人 2026-10-07 口头批的形态，`schemaVersion` 维持 1，旧草稿天然兼容）。结果页每次测算落一条**当日**快照（年限 / 三状态 / 年成本 / 够用线 / 净资产 / 币种），下一次进来给「和上一次比」的差值。**形状是被 `product-concept.md` §3.2 逼出来的**：那句话（净资产按月几乎不动，进度条看不见、反而劝退）成立，所以不做完成度百分比、只做两次读数之间的差，且「什么都没变」照实说。跨币种时金额不给差（不同单位相减无意义），年限仍然比——这条齐次性用 USD 与 CNY 两份 profile 各跑一遍引擎**差分验证**过。`writeDraft` 现在对 `history` 做隐式保留（写方全是重建整个字面量，逐条透传漏一处就静默抹历史）。埋点 `progress:view` 零 props：它计数的是「这台机器今天回来看过并且有至少两个历日的记录」，**不是回访率**（无分母、无标识符，§11.2 的死结没被解开，只是多了一个此前完全没有的计数）。**本地实测（S1.6 收尾时；现值见下面 S1.7 段）**：238 单测绿（core 59 + web 179）、`astro check` 0 错 0 警、冒烟 **107 条**（开 `PUBLIC_HOMEPAGE_CLAIM`）/ **101 条**（关）全过。见 `docs/m4-task-breakdown.md` §8、`CONVENTIONS.md` 的 `history` 例外纪律。

**M4 S1.7（§2.2 本金口径 + 一处真实 i18n 缺陷）代码完成（2026-10-08）**：设计器 sticky 上「想养住它，需要多少本金？」默认折叠的展开位（原生 `<details>`），算术零新增——本金 = `enoughLine(年成本本位币, a)`、年限 = 同一个 `{ kind: 'enough-line' }` 喂 `project`，所以句子里那两个数**必然同源**。它吃整套假设，因此在结果页把提取率从 4% 改成 2% 之后，这一屏的本金从 $675,000 变 $1,350,000、年限 6 → 12（浏览器实测）。`converter:expand` 零 props、一次访问只报一次。**顺带修掉一个漏翻**：换算条把目录项的中文 `label` 直接插进英文句子（`"自有公寓（房贷+物业+水电）" costs $27,000 a year`）——SSR 抓不到、整页汉字断言也漏了它；现在对象名过 `optionLabel`，并有一条冒烟断言盯住。挂载位与 `comparison-converter.md` 原文不同（结果页不重复放，因为那页的主数字够用线**就是**这个数），差异与理由写在该文档 §2.2 / §4。**本地实测（现值）**：250 单测绿（core 59 + web 191）、`astro check` 0 错 0 警、冒烟 **115 条**（开 `PUBLIC_HOMEPAGE_CLAIM`）/ **109 条**（关）。

### 候选一口气任务（2026-10-04 盘点，均不需拍板、本地可完成）

- **A 文档同步**（纯体力，各 ≤S）：~~① README 部署段过时~~ ✅ 4ca1bcd；~~② PRD §12 里程碑表 M1 仍标「待开发」~~ ✅ 2035316；~~③ 本表文档索引缺 DEPLOYMENT.md、文档计数过时~~ ✅ 462c23a；~~④ tech §12 残留旧托管决策（Vercel）~~ ✅ 5ea6abc；~~⑤ deferred #2 触发条件「M1 发布前」过期~~ ✅ 6c27880；~~⑥ 本表「相关」区 git 同步描述过时~~ ✅ fc2781b。
- **B 代码小功能**（各 S–M）：~~① PWA 增强（manifest + service worker，tech §10.1 定案「半天成本」）~~ ✅ 32ddb25；~~② 埋点接真实上报（现为 localStorage 队列，T13 遗留）~~ ✅ 629d53c（CF Web Analytics beacon + sendBeacon 自定义事件，均由环境变量开启，未配置零行为）；~~③ sitemap.xml + robots.txt（DEPLOYMENT.md 验证清单 #5 提到，疑未配置）~~ ✅ 584b53b；~~④ WCAG AA / 键盘可达 / 对比度检查修复（PRD §9 硬要求，M1 验收未实测）~~ ✅ 61610ad（danger token、skip link、radiogroup 语义、aria-live、44px 触摸目标、固定底条遮挡）；~~⑤ 深浅色自适应核对（PRD §9，tech §7 说沿用落地页策略，需核实）~~ ✅ 6a4115c（机制已具备：prefers-color-scheme + color-scheme + 全量 light token；仅浅色 accent 对比度 4.36→5.23 加深，双主题全部文本 token 按 WCAG 公式实测 ≥4.5:1）；~~⑥ 草稿恢复入口（方案已存 localStorage，T07，查 UI 是否有回访恢复）~~ ✅ a4dcec0（首页 client:load 岛，nextDraftStep 纯函数 + 4 测试，无草稿不渲染、SSR 空帧）。
- **C 内容**（各 M）：~~① 富豪模拟玩法细节整批（购物目录数值 / 爽痛比例 / 断裂阈值 / 账单日参数 / 首批原型卡 / 一键成目标入 PRD §7.2，deferred #6；名人原型合规除外）~~ ✅ f725218（simulation-gameplay v0.2：账单日 6 个建议默认、现金流负担率公式与阈值、爽痛 1:1、两张虚构原型卡、一键成目标入 PRD §7.2/F5；剩余为 M3 前拍板项，见 gameplay §6）；~~② Catalog 21 项「待校准」数值补公开来源（deferred #1）~~ ✅ 26b4f4b（盘点所写「21 项」实为 **20 项**；23 项现已全部附可查证来源：BLS CE 2024 / AAA / KFF / NAIS / Child Care Aware / Allianz / Zillow，富豪极端档为行业估算；统一为实际自付现金口径，移除设计器 mock、catalog 改必传，测试增至 10 条；deferred #1 的 USD 部分闭环）；~~③ PRD §2.3 市场时机论证补全（需外部检索，带来源）~~ ✅ 38eb2df（Deloitte / PwC / 美联储 SHED / TIAA-GFLEC 四来源，deferred #8 市场时机部分闭环）。
- **需拍板后才能动**：~~D1–D5~~ **2026-10-05 已整包确认**（见「已做的决策」与 `docs/m2-decisions.md`）。当前真正待拍的只剩：`deferred #5` 法务与 publicity rights 复核（M3 原型卡上线前）、`#3` 付费墙与 `#7` 支付渠道（D5 押后，等付费意愿读数）、品牌视觉 / 商标（deferred #2 剩余部分）。
  - ~~**F2 逐项支出（PRD §8 明写、当前未实现）——我先前把它列进「不需拍板」的 B 组，是错的，已移出**：`Profile.expense` 是**单个数字**（`packages/core/src/types.ts:27`），而 `types.ts` 与 `draft.ts` 都是冻结契约（`CONVENTIONS.md`：改契约 = 过闸门）。两条路必须选一条：**(a)** 展示层拆解 + 独立 localStorage key、引擎不读——零契约改动，但「精细模型」只是看起来精细，不影响测算，**有误导用户以为它参与计算的风险**；**(b)** 扩 `Profile` 让逐项支出真正进引擎——要过契约闸门，且牵动 `project` / `gap` / `buildMilestones` 口径与 `assumptionsVersion`~~ ✅ **2026-10-08 发起人拍板走 (b) 并已实现**：`expenseBreakdown?` 四类月口径 + `profileMonthlyExpense` 取数 + 财务页「高级：拆开填」默认收起 + 切币种逐项换算保留；测试 core 65 / web 218 全绿。见「已做的决策」F2 行与 PRD §8。

## 待决问题

详见 `docs/technical-design.md` §12 与 `docs/PRD.md` §13。关键几条：

1. ~~**托管分工**~~ **已定（2026-10-03）**：海外 MVP 应用 + 营销全 Cloudflare，Vercel 后置为触发选项，见 `docs/technical-design.md` §9
2. **支付渠道**：阶段一海外（Stripe / Paddle），阶段二大陆（微信 / 支付宝）。M4 才需要，倾向 Stripe（`待定`）
3. **仓库结构**：渐进式——M1 单仓库 + `packages/core`，小程序加入时转 pnpm workspaces（2026-10-03 建议，见 tech §11）
4. **框架终局**：维持 Astro，应用变重 / 大量客户端路由时再评估 Next.js（2026-10-03 建议，见 tech §3）
5. **首个付费场景**：建议 **买房 vs 租**，辞职 / 生娃 / 退休后置（2026-10-03 建议，`待定`，见 PRD §10）
6. **富豪模拟玩法设计**：购物机制、购物车一键成目标、名人原型合规路径——**2026-10-06 M3 已开工，G4 桥口径拍板走 (a)**；名人原型合规仍待 `deferred #5` 法务复核。见 `docs/simulation-gameplay.md` §6 与 `docs/m3-task-breakdown.md`
7. ~~**产品形态**~~ **已定（2026-10-03）**：M1 响应式 Web → M2 PWA → 大陆微信小程序（Taro），原生 App 以触发门驱动，见 `docs/technical-design.md` §10.1
8. ~~**F5 富豪模拟的优先级与里程碑自相矛盾**~~ **已定（2026-10-05）**：维持 P0，**最小版从 M3 提到 M2**，M3 只做完整化。§8 / §12 / technical-design §架构演进 / gameplay §5.1 / deferred #6 已同步。**新的阻塞点**：F5 最小版启动前须拍 gameplay §6 的「首个剧本身份」与「六通道取舍」。详见 `docs/PRD.md` §13.7。

## 相关

- 落地页仓库：`rich-sim-landing`（同级目录，独立 git 仓库）
- git 状态：见「当前状态」的现测命令；本仓库不再手工维护推送/合并节奏，`dev → main` 由 pr-helper 自动化。
- **若 `dev` 长时间没进 `main`**：优先查 pr-helper 的「合并后门禁」——它评的是上一个 PR 的 merge commit，那个提交上的红 check 不会自己变绿，会让自动创建停摆（2026-10-04 实测停摆 ≥44 分钟，靠详情页「创建 PR」按钮人工解套）。诊断全文见 pr-helper 仓库 `docs/auto-create-pr-remediation.md` 第十八节。
