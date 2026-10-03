# Handoff · 财富沙盘（产品）

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
| `docs/prd.md` | 产品需求：功能分级、旅程、度量、里程碑 | Draft |
| `docs/architecture.md` | 技术选型与架构 | Draft |

## 已做的决策

| 决策 | 结论 | 出处 |
|---|---|---|
| 产品方向 | 双主线：富豪模拟做钩子，现实测算做落点 | `product-concept.md` §7.1 |
| 目标市场 | 先海外，后大陆 | `architecture.md` §9 |
| 技术栈 | Astro + React 岛 + 独立纯函数计算引擎 | `architecture.md` §3 |
| 数据库 / 账号 | Supabase（Postgres + Auth + Storage） | `architecture.md` §3 |
| 托管 | Vercel（应用）+ Cloudflare（营销 / 边缘） | `architecture.md` §9 |
| MVP 形态 | **无后端**，方案存 `localStorage` | `architecture.md` §10 |

## 下一步

**M1：核心闭环** —— 理想生活设计器 + 轻量财务录入 + 计算引擎。无后端、无账号。

落地页里已有一个可复用的测算器雏形，见 `rich-sim-landing/src/components/Calculator.astro`。

## 待决问题

详见 `docs/architecture.md` §12 与 `docs/prd.md` §13。关键几条：

1. **托管分工确认**：应用 → Vercel、营销 → Cloudflare（文档里的理解，若想对调请指出）
2. **支付渠道**：阶段一海外（Stripe / Paddle），阶段二大陆（微信 / 支付宝）
3. **仓库结构**：单应用仓库 vs monorepo
4. **框架终局**：Astro 是否够用到底，还是应用变重后迁 Next.js
5. **产品名**：待定（落地页暂用「财富沙盘」）
6. **首个付费场景**：买房 vs 租 / 辞职 / 生娃 / 退休

## 相关

- 落地页仓库：`rich-sim-landing`（同级目录，独立 git 仓库）
- ⚠️ 本地 `dev` 领先 `origin/dev`，**有未推送的提交**（PRD、架构、托管决策等）。数量用 `git status` 查看。
