# Handoff · rich-sim（财富模拟 · 产品）

> 更新时间：2026-10-04
> 本仓库是**产品仓库：文档 + 应用代码一体**（M1 代码已并入，2026-10-04）。

---

## 这个仓库是什么

产品全部资产：构想 / 需求 / 架构文档（`docs/`）+ 产品应用代码（`apps/web`）+ 计算引擎（`packages/core`）+ 工程约定（`CONVENTIONS.md`）。

## 当前状态

- **文档**：9 份，见 `docs/`（下表）
- **分支**：`dev`，**领先 `origin/dev`（有未推送的提交）**
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
| `docs/DEPLOYMENT.md` | Cloudflare Pages Git 集成部署配置、发布流程与冒烟清单 | 活跃 |

## 已做的决策

| 决策 | 结论 | 出处 |
|---|---|---|
| **产品名** | **rich-sim**，中文名「财富模拟」（2026-10-03 拍板） | `product-concept.md` §7.2 |
| 产品方向 | 双主线：富豪模拟做钩子，现实测算做落点 | `product-concept.md` §7.1 |
| 目标市场 | 先海外，后大陆 | `technical-design.md` §9 |
| 技术栈 | Astro + React 岛 + 独立纯函数计算引擎 | `technical-design.md` §3 |
| 数据库 / 账号 | Supabase（Postgres + Auth + Storage） | `technical-design.md` §3 |
| 托管 | 海外 MVP：应用 + 营销**全 Cloudflare**（一个平台管 DNS/CDN/WAF/部署）；Vercel 后置为触发选项（服务端变重时评估迁入） | `technical-design.md` §9 |
| MVP 形态 | **无后端**，方案存 `localStorage` | `technical-design.md` §10 |
| 产品形态节奏 | M1 响应式 Web（移动端达标）；M2 加 PWA；大陆做微信小程序（Taro）；原生 App 以付费+回访触发门驱动 | `technical-design.md` §10.1 |
| 币种与汇率 | 计算在本位币、换算只在展示层；汇率 = 假设的一部分（快照进 Assumptions 并参与版本化）；M1 实时汇率（SSR 代理），M2 历史汇率 | `technical-design.md` §4.2 |

## 下一步

**M1：核心闭环** —— 理想生活设计器 + 轻量财务录入 + 计算引擎。无后端、无账号。移动端响应式达标（PRD §12）。

任务分解与并行排期见 `docs/m1-task-breakdown.md`（13 任务 × 4 Wave：T01 建仓 → Wave1 三线并行 [core 链 / Catalog 内容 / UI 骨架] → Wave2 组装 → Wave3 达标 → Wave4 验收）。

落地页里已有一个可复用的测算器雏形，见 `rich-sim-landing/src/components/Calculator.astro`。

实施拆解（2026-10-03 规划）：
1. ~~建 `rich-sim-app` 仓库（Astro 5 + React 19 + TS + Tailwind v4，单仓库 + `packages/core`）~~ ✅ 已完成（T01，2026-10-03，`npm run dev`/`test`/`check`/`build` 实测通过）
2. ~~`@rich-sim/core` 类型契约~~ ✅ 已冻结（T02，`packages/core/src/types.ts`，TS 严格 0 错误）；函数实现与测试（T03–T04）✅ 37 条全绿，手算样例独立复核一致
3. ~~理想生活设计器（7 维度 × 3–5 选项，合理默认值）~~ ✅ T05 Catalog（7 维 × 23 选项，3 富豪档带来源 URL，其余「待校准」）✅ T06 设计器（2026-10-03）
4. ~~轻量财务录入（≤4 项）~~ ✅ T07（2026-10-03）
5. ~~测算输出：三状态 + 假设清单 + 免责声明（服务端渲染，不被 JS 关掉）~~ ✅ T08（三状态/阶梯目标，43 测试全绿）+ ✅ T09（纯 SSR 面板，2026-10-03）
6. ~~币种：本位币选择 + 实时汇率（SSR 代理）~~ ✅ T10（2026-10-03；实测 Frankfurter 已迁移至 api.frankfurter.dev/v1，base=CNY 可用）
7. ~~移动端响应式达标~~ ✅ T11（2026-10-04；生产口径 LCP<2.5s / INP<200ms / CLS<0.1 全达标）
8. ~~参照落地页 Calculator.astro 校验口径一致~~ ✅ T12（2026-10-04，五组样例双侧一致，无需回写）+ ✅ T13（E2E 15/15 + 完成率埋点可观测）
9. ~~M1 移动端指标~~ ✅ T11（2026-10-04）

**M1 状态：核心闭环完成（2026-10-04）**。**部署状态**：`rich-sim-landing`（落地页）→ https://rich-sim-landing.pages.dev（**Git 集成**：GitHub `bayernjf/rich-sim-landing`，push main 自动构建，另绑 `rich-sim.bayjf.com`）；产品应用 `rich-sim` → Pages 项目 `rich-sim`（**Git 集成**：GitHub `bayernjf/rich-sim`，monorepo 根部署，详见 `docs/DEPLOYMENT.md`）。部署冒烟曾全部通过（首页 200、`/api/fx` Workers 环境实测返回完整汇率快照、假设清单+免责声明纯 SSR 源码可见）——**M1 遗留风险（Cloudflare 环境冒烟）已关闭**。下一步：正式域名绑定（需先定英文名/域名，deferred #2）；M2 立项（埋点接真实上报、PWA、见 `docs/technical-design.md` §10）。

### 候选一口气任务（2026-10-04 盘点，均不需拍板、本地可完成）

- **A 文档同步**（纯体力，各 ≤S）：~~① README 部署段过时~~ ✅ 4ca1bcd；~~② PRD §12 里程碑表 M1 仍标「待开发」~~ ✅ 2035316；~~③ 本表文档索引缺 DEPLOYMENT.md、文档计数过时~~ ✅ 462c23a；~~④ tech §12 残留旧托管决策（Vercel）~~ ✅ 5ea6abc；~~⑤ deferred #2 触发条件「M1 发布前」过期~~ ✅ 6c27880；~~⑥ 本表「相关」区 git 同步描述过时~~ ✅ fc2781b。
- **B 代码小功能**（各 S–M）：① PWA 增强（manifest + service worker，tech §10.1 定案「半天成本」）；② 埋点接真实上报（现为 localStorage 队列，T13 遗留）；③ sitemap.xml + robots.txt（DEPLOYMENT.md 验证清单 #5 提到，疑未配置）；④ WCAG AA / 键盘可达 / 对比度检查修复（PRD §9 硬要求，M1 验收未实测）；⑤ 深浅色自适应核对（PRD §9，tech §7 说沿用落地页策略，需核实）；⑥ 草稿恢复入口（方案已存 localStorage，T07，查 UI 是否有回访恢复）。
- **C 内容**（各 M）：① 富豪模拟玩法细节整批（购物目录数值 / 爽痛比例 / 断裂阈值 / 账单日参数 / 首批原型卡 / 一键成目标入 PRD §7.2，deferred #6，数值边做边定；名人原型合规除外）；② Catalog 21 项「待校准」数值补公开来源（deferred #1）；③ PRD §2.3 市场时机论证补全（需外部检索，带来源）。
- **需拍板后才能动**：正式域名绑定（deferred #2，先定英文名/域名）、首个付费场景、支付渠道、玩法机制方向（simulation-gameplay §6）、git push（dev 有未推送提交，按约定等用户指示）。

## 待决问题

详见 `docs/technical-design.md` §12 与 `docs/PRD.md` §13。关键几条：

1. ~~**托管分工**~~ **已定（2026-10-03）**：海外 MVP 应用 + 营销全 Cloudflare，Vercel 后置为触发选项，见 `docs/technical-design.md` §9
2. **支付渠道**：阶段一海外（Stripe / Paddle），阶段二大陆（微信 / 支付宝）。M4 才需要，倾向 Stripe（`待定`）
3. **仓库结构**：渐进式——M1 单仓库 + `packages/core`，小程序加入时转 pnpm workspaces（2026-10-03 建议，见 tech §11）
4. **框架终局**：维持 Astro，应用变重 / 大量客户端路由时再评估 Next.js（2026-10-03 建议，见 tech §3）
5. **首个付费场景**：建议 **买房 vs 租**，辞职 / 生娃 / 退休后置（2026-10-03 建议，`待定`，见 PRD §10）
6. **富豪模拟玩法设计**：购物机制、购物车一键成目标、名人原型合规路径——草案已沉淀，全部待拍板，见 `docs/simulation-gameplay.md` §6
7. ~~**产品形态**~~ **已定（2026-10-03）**：M1 响应式 Web → M2 PWA → 大陆微信小程序（Taro），原生 App 以触发门驱动，见 `docs/technical-design.md` §10.1

## 相关

- 落地页仓库：`rich-sim-landing`（同级目录，独立 git 仓库）
- git 状态：`dev` 领先 `origin/dev`（未推送；具体提交数以 `git status` 为准，是否 push 等用户指示）
