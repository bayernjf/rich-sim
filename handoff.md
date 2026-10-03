# Handoff · rich-sim（财富模拟 · 产品）

> 更新时间：2026-10-03
> 本仓库是**产品文档仓库**，产品代码尚未开始。

---

## 这个仓库是什么

产品的构想、需求与架构文档，**没有代码**。将来的应用会是一个独立仓库（暂名 `rich-sim-app`，**尚未创建**）。

## 当前状态

- **文档**：4 份，见 `docs/`（下表）
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

落地页里已有一个可复用的测算器雏形，见 `rich-sim-landing/src/components/Calculator.astro`。

实施拆解（2026-10-03 规划）：
1. 建 `rich-sim-app` 仓库（Astro 5 + React 19 + TS + Tailwind v4，单仓库 + `packages/core`）
2. `@rich-sim/core`：类型 + 纯函数（规格见 `technical-design.md` §4.1）+ Vitest 单测全绿
3. 理想生活设计器（7 维度 × 3–5 选项，合理默认值）
4. 轻量财务录入（≤4 项）
5. 测算输出：三状态 + 假设清单 + 免责声明（服务端渲染，不被 JS 关掉）
6. 移动端响应式达标
7. 参照落地页 Calculator.astro 校验口径一致

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
- git 状态：`dev` 与 `origin/dev` 已同步（2026-10-03 实测，工作区干净）
