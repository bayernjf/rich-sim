# 财富模拟（rich-sim）· 技术架构与选型

> 状态：Draft v0.1 · 2026-10-03
> 关联：[PRD](./PRD.md) · [构想与评估](./product-concept.md) · 落地页 `rich-sim-landing`
> 文中标注 `待定` 的项需要发起人拍板；标注 ⚠️ 的是会显著改变架构的决策点。

---

## 1. 架构目标与约束

### 1.1 目标

- **快速验证**：MVP 要能在最短时间内跑通"用完 → 回来 → 付费"的闭环（见 PRD §11）。
- **计算可信**：测算引擎必须准确、可测、可复用（应用 + 落地页 + 未来的服务端报告）。
- **低成本、低运维**：小团队/个人开发，能不上后端就不上。

### 1.2 约束

- 落地页已经是 **Astro + Tailwind v4**，应尽量复用，避免维护两套栈。
- **目标用户疑似中国大陆**（中文、一线城市、以元计价）。这直接影响托管选型——⚠️ 见 §9。
- **合规红线**：产品是财商模拟教育工具，绝不能演变成投资建议（见 PRD §9）。

---

## 2. 总体架构

```
┌───────────────────────────────────────────────┐
│ Astro 应用（单栈）                             │
│                                               │
│  营销路由   /            ← 来自落地页          │
│  应用路由   /app/...                           │
│    ├─ React islands：表单 / 看板 / 交互        │
│    └─ 计算引擎 @rich-sim/core（纯函数，客户端）│
│  服务端端点 /api/...     ← MVP 可完全不需要    │
│    └─ 持久化 / 认证 / 报告（P1 起）            │
└───────────────────────────────────────────────┘
                        │（P1 起）
                        ▼
              PostgreSQL (Drizzle ORM)
```

### 2.1 三条核心原则

1. **计算与存储分离。** 计算是纯函数、无副作用、可单测；存储只保存**输入与假设**，结果随时可重算。这样测算逻辑永远只有一份，且可复现。
2. **渐进式后端。** MVP **不需要后端**——测算是纯客户端计算，方案存 `localStorage` 即可。等要做账号/跨设备保存时再引入数据库。这是把 MVP 做小的关键。
3. **单一框架。** 营销页与应用同栈（Astro），共享设计令牌（`global.css` 的 CSS 变量）与基础组件。

---

## 3. 技术选型

| 层 | 选择 | 理由 | 备选 / 何时切换 |
|---|---|---|---|
| 语言 | **TypeScript 5** | 全栈统一；计算引擎可前后端共用 | — |
| 框架 | **Astro 5 + React 19 islands** | 复用落地页；SSR + 服务端端点；岛屿模型对"表单 + 计算 + 看板"足够 | **Next.js**：当应用状态变得很重、需要大量客户端路由时 |
| 样式 | **Tailwind v4 + CSS 变量令牌** | 已有，令牌化，深浅色自动 | — |
| 计算引擎 | **独立纯 TS 包 `@rich-sim/core`** | 产品核心资产；零副作用；可单测；多处复用 | — |
| 客户端状态 | React 局部 state + 少量 Zustand | 避免过度设计 | URL query 承载可分享的方案 |
| 校验 | **Zod** | 前后端共用 schema；输入边界校验 | — |
| API | Astro 服务端端点（REST） | 与前端同仓，零额外服务 | **Hono on Workers**：若端点变多或要独立部署 |
| 数据库 | **Supabase（PostgreSQL）** | Postgres + Auth + Storage + RLS 一体，省一套自建；底层是 Postgres，能平滑迁到国内云托管 PG | Neon（纯 PG，认证要另配） |
| ORM | **Drizzle** | 类型安全、轻；连 Supabase 的 Postgres 直连串 | supabase-js（简单查询够用） |
| 认证 | MVP 免登录 → **Supabase Auth** | 与数据库同源，免自建账号体系 | Auth.js / Clerk |
| 存储 | **Supabase Storage**（P1 起） | 与数据库同源，少一个服务 | Cloudflare R2 |
| 支付 | `待定` | 取决于市场：大陆微信/支付宝，海外 Stripe/Paddle | — |
| 分析 | **Umami / PostHog** | 轻量，可自托管，验证三数够用 | Plausible |
| 错误监控 | **Sentry** | 标准方案 | — |
| 测试 | **Vitest**（引擎）+ **Playwright**（关键流程） | 计算引擎**必须**单测；主流程必须有 e2e | — |
| 托管 | **Cloudflare（应用 SSR + 营销 / 边缘一体）**；Vercel 作为服务端变重时的触发选项 | 见 §9 |

> 只引入当前需要的依赖。上表里 Drizzle / Auth.js / Sentry / Playwright 都属于 **P1 才装**，MVP 不装。

---

## 4. 计算引擎 `@rich-sim/core`

产品的核心资产，必须独立、纯粹、可测。

**设计要求**

- 纯函数，零副作用，除 Zod 外无运行时依赖。
- 所有**假设显式传入**（收益率、安全提取率、通胀），不藏在函数里。
- 输入输出都有类型定义；假设与公式带**版本号**，保证历史结果可复现。
- 覆盖三类一等状态：可达 / 不可达 / 无净储蓄（见 PRD §6.3）。

**接口草案**

```ts
type Profile = { income: number; expense: number; savings: number; debt: number };
type Assumptions = { returnRate: number; withdrawalRate: number; inflation: number };
type Goal = { kind: 'enough-line' | 'net-worth'; value: number };

type Projection =
  | { status: 'reachable'; years: number; savingsRate: number }
  | { status: 'unreachable'; savingsRate: number }
  | { status: 'no-net-savings' };

function enoughLine(annualCost: number, a: Assumptions): number;
function project(p: Profile, goal: Goal, a: Assumptions): Projection;
function buildMilestones(p: Profile, goal: Goal, a: Assumptions): Milestone[];
```

**测试要求**：可达/不可达/负储蓄三种状态、边界值（目标 ≤ 存款、收益率为 0）、以及若干手算核对过的样例。

**复用**：落地页的测算器 → 应用 → 未来的服务端报告，全部调用同一份引擎。

### 4.1 接口细化与测试清单（2026-10-03，M1 实施规格）

承接 §4 接口草案。所有假设显式传入；公式与假设带版本号（`assumptionsVersion`），保证历史结果可复现。

**类型与函数**

```ts
type Profile = { income: number; expense: number; savings: number; debt: number };   // 月口径
type Assumptions = { returnRate: number; withdrawalRate: number; inflation: number }; // 年化小数（0.04）
type Goal = { kind: 'enough-line' | 'net-worth'; value: number };
type Projection =
  | { status: 'reachable'; years: number; savingsRate: number }
  | { status: 'unreachable'; savingsRate: number }
  | { status: 'no-net-savings' };
type LifeChoice = { dimension: string; optionId: string }[];   // 理想生活设计器选择
type ScenarioCost = { annualCost: number; breakdown: Record<string, number> };
type Milestone = { stage: number; goalValue: number; years: number; action: string };

function enoughLine(annualCost: number, a: Assumptions): number;                              // annualCost / withdrawalRate
function scenarioAnnualCost(choices: LifeChoice, catalog: Catalog, a: Assumptions): ScenarioCost; // 维度选项 → 年成本（含通胀换算）
function project(p: Profile, goal: Goal, a: Assumptions): Projection;                        // 复利反解 + 三状态
function gap(p: Profile, goal: Goal, a: Assumptions): { annualGap: number; yearsAtCurrentPace: number }; // 差距
function buildMilestones(p: Profile, goal: Goal, a: Assumptions): Milestone[];                // ≥3 阶段，数值来自 profile
```

**测试清单（Vitest，M1 上线前全绿）**

| 用例 | 输入 | 期望 |
|---|---|---|
| enoughLine 基准 | 年成本 40 万，提取率 4% | 1000 万 |
| enoughLine 提取率 5% | 年成本 40 万，提取率 5% | 800 万 |
| project 可达（手算核对） | 存款 10 万、月储蓄 5 千（年 6 万）、目标 100 万、r=4% | status reachable，years ≈ 12–13 |
| project 不可达 | 年储蓄过低，60 年内达不到 | status unreachable |
| project 无净储蓄 | 月支出 ≥ 月收入 | status no-net-savings |
| 边界：目标 ≤ 存款 | 存款 ≥ 目标 | reachable，years = 0 |
| 边界：r = 0 | 收益率为 0 | 退化线性增长 |
| 边界：savings = 0 | 年储蓄 0 | 仅存款按 r 增长 |
| buildMilestones | 任意达标 profile | 3 阶段：提储蓄率 → 攒首笔本金 → 抬收入，数值来自输入 |
| 版本化 | 修改公式后跑历史样例 | 结果带 assumptionsVersion，可复现旧结果 |

> 注：手算核对样例在实现时用独立计算复核一遍，不直接信任实现输出。

### 4.2 币种与汇率设计（2026-10-03 已确认方案）

**核心决策**

1. **计算永远在本位币，换算只在展示层**——用户输入与 Catalog 年成本均以本位币建模；`@rich-sim/core` 全部在本位币内计算，结果出来后按汇率换算成显示币种。切换币种只改展示、零重算（延续「计算与存储分离」）。
2. **汇率是假设的一部分，不是功能**——`FxSnapshot` 进 `Assumptions`，参与 `assumptionsVersion`；假设清单必显示「按 X 汇率（来源、日期）换算」，历史模式显示「按 YYYY-MM-DD 汇率」。只存快照，不存换算结果。

**换算模型**：方案 A（本位币内部计算 + 展示层换算）。跨币种资产场景（富豪模拟）以 Catalog 按本位币建模解决，不做原币存储汇总（方案 B 后置，MVP 不需要）。

**数据源与降级**

| 场景 | 方案 |
|---|---|
| 实时汇率（M1） | Astro **SSR 代理端点**：服务端拉免费 API，前端调自己端点（规避 CORS/限流；宿主平台零额外成本） |
| 离线 / API 失败 | 构建期生成的**静态汇率快照 JSON** 兜底（标注快照日期） |
| 历史汇率（M2） | Frankfurter（ECB 参考汇率，免费、覆盖 1999 至今、含 CNY）——**实现前需实测 CNY 历史覆盖深度**（`待验证`） |

**产品场景**：历史汇率切换 → 按当日汇率重算全部金额 → 对比「现在值多少 / 当时值多少」→ 展示「汇率吃掉了你 Z%」。汇率波动是跨币种资产最真实的财富风险之一，归属「看见 / 感受」通道，可与失去模拟联动。

**币种范围与分期**

- 币种：USD / EUR / GBP / JPY / CNY / HKD（6 种）
- M1：本位币选择器（默认按市场：海外 USD、大陆 CNY）+ 实时汇率换算 + 假设清单显示汇率来源与日期
- M2：历史汇率切换（选日期）+ 汇率波动教育点
- 大陆阶段：切换人民币中间价数据源

**类型与函数**

```ts
type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CNY' | 'HKD';
type FxSnapshot = { base: Currency; rates: Record<Currency, number>; date: string; source: string; version: string };
// Assumptions 增加 fx: FxSnapshot；Profile 增加 currency: Currency
function convert(amount: number, from: Currency, to: Currency, fx: FxSnapshot): number;
```

**测试要点**：换算基准（用快照核对）；**往返误差 < 0.01%**（base→display→base）；边界（快照缺币种、汇率 0 / 负数拒绝、无效日期）；快照版本化可复现。

**合规**：汇率进假设清单与免责声明（仅供参考，不构成建议）；历史汇率必须显式标注日期。

---

## 5. 数据模型（P1 起）

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `user` | id, email, created_at | 认证后才有 |
| `profile` | user_id, income, expense, savings, debt, currency, updated_at | 现状快照 |
| `scenario` | user_id, choices(jsonb), annual_cost, created_at | 理想生活的维度选择 |
| `goal` | user_id, kind, value, assumptions(jsonb) | 目标与假设 |
| `plan` | user_id, goal_id, milestones(jsonb), created_at | 阶梯目标 |
| `report` | user_id, goal_id, payload(jsonb), created_at | 深度报告（P1） |

**存储原则**：只存输入与假设；结果随时重算。需要历史对比时存**快照**，而不是把结果当真相。

---

## 6. API 设计（P1 起）

MVP 无后端。引入后：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET/PUT | `/api/profile` | 读写现状 |
| GET/POST | `/api/scenarios` | 理想生活方案 |
| POST | `/api/plans` | 生成阶梯目标 |
| POST | `/api/reports` | 生成深度报告 |
| — | `/api/auth/*` | Auth.js 端点 |

计算类接口（如测算）**默认不做成服务端接口**——客户端直接算，减少延迟与成本。只有需要服务端出报告时才在服务端调用同一个引擎。

---

## 7. 前端架构

- **Astro 页面 + React 岛**：静态/营销部分零 JS；交互部分（设计器、测算器、看板）为 React 岛。
- **状态**：方案可编码进 URL（可分享、可回访）；本地草稿存 `localStorage`。
- **表单**：受控组件 + Zod 校验；错误内联展示；标签在输入框上方。
- **设计令牌**：沿用落地页的 CSS 变量与深浅色策略，保证营销页与应用观感一致。

---

## 8. 安全与合规

- **输入校验**：所有用户输入经 Zod；服务端再校验一次。
- **限流 / CSRF**：端点加限流；表单加 CSRF 防护。
- **数据最小化**：MVP 不采集任何非必要个人信息；不强制登录。
- **合规**：免责声明**服务端渲染**（不能被 JS 关掉）；绝不推荐具体金融产品；不投放金融类广告。
- **数据用途**：明确告知，不出售、不用于荐股。

---

## 9. 托管与部署（已定：先海外，后大陆）

**分两阶段。** 阶段一面向海外用户，阶段二扩展大陆。架构本身（Astro SSR + PostgreSQL）两阶段不变，迁移成本主要在备案与数据搬迁。

### 阶段一 · 海外（现在）

**托管决策（2026-10-03 拍板：Cloudflare 全包，Vercel 后置为触发选项）**

- **应用主体 + 营销页 → Cloudflare Pages**：应用用官方 `@astrojs/cloudflare` adapter 跑 Astro SSR（Functions/Workers 承载 SSR 与汇率代理端点），营销页纯静态——**一个平台管 DNS / CDN / WAF / Turnstile / 部署**，运维面最小，免费额度对 MVP 足够。
- **注意点**：Workers 运行时需启用 `nodejs_compat`，少数 Node API 需适配；Astro SSR 在该环境的兼容性在落地时实测一次。
- **Vercel 不再部署**；保留为**触发选项**：M2/M3 后若服务端变重（服务端报告生成、支付 webhook、复杂 SSR），评估迁 Vercel（Node 运行时 + 预览部署 DX 更顺）——一次 adapter 切换即可，成本可控。
- **数据与账号 → Supabase**：Postgres + Auth + Storage 一体，省一套自建。
- **区域**：Cloudflare 与 Supabase 均就近全球边缘/区域，海外访问无碍。

### 阶段二 · 大陆（确认主攻后再做）

- **国内云（阿里云 / 腾讯云）+ ICP 备案。**
- **数据库**：托管 PostgreSQL（阿里云 RDS / 腾讯云 PostgreSQL）——与阶段一同构，迁移平滑。
- **部署形态**：大陆部署与海外部署**并存**（各自域名），而不是替换，避免影响已有海外用户。

### 为什么是 Supabase（Postgres）而不是 SQLite 系

Supabase 底层就是 PostgreSQL。大陆没有 Supabase / D1 的等价物，阶段二要用国内云托管 PG（阿里云 RDS / 腾讯云），但因为是同一个 Postgres，**表结构与 Drizzle 几乎不用动**，只需换连接串并迁移数据。这正是选 Postgres 系（Supabase）而不是 SQLite 系的原因。

### 迁移到大陆的成本清单（提前知道）

- ICP 备案（需要主体资质、域名、时间）。
- 数据搬迁 + 双写/切换方案。
- 支付渠道切换（见 §12）。
- 合规主体确认。

---

## 10. 演进路线

| 阶段 | 架构变化 |
|---|---|
| **M1**（核心闭环） | **纯前端**：Astro + React 岛 + `@rich-sim/core`，方案存 `localStorage`。**无后端、无数据库、无账号。** |
| **M2**（保存/回访） | 引入认证（Auth.js）+ PostgreSQL（Drizzle）+ `/api/*` |
| **M3**（富豪模拟） | 新增模拟状态模块（仍是前端计算为主） |
| **M4**（报告/支付） | 服务端报告生成 + 支付渠道 + 快照历史 |

**关键点**：M1 刻意不引入后端，是最快验证、成本最低的路径。

### 10.1 产品形态矩阵与决策节奏

> 2026-10-03 讨论沉淀。**决策节奏四条已确认（当日采纳推荐）**；矩阵中的大陆/原生 App 规划为方向性路线，以触发门驱动。关联 [PRD §3.2 Non-Goals 修订](./PRD.md)。

**事实背景**：海外没有「小程序」生态。可类比的只有超级 App 内的 mini app——LINE（日本/东南亚）、KakaoTalk（韩国）、Grab（东南亚）各有区域性 mini app 平台，均非通用分发渠道；TikTok 海外 mini app 面向 B 端商务合作。出海产品标准形态：响应式 Web / PWA / 原生 App。

| 市场 | 形态 | 技术栈 | 节奏（已确认） |
|---|---|---|---|
| 阶段一 · 海外（现在） | 响应式 Web → **PWA** | Astro 5 + React 19（现状）；PWA = manifest + service worker | **M1 只做响应式适配（PRD §9 硬要求）；M2 加 PWA 增强（辅助 7 日回访）** |
| 阶段二 · 大陆（确认主攻后） | **微信小程序** | Taro（React 语法） | 大陆启动时做；微信为国民级入口 + 支付成熟 |
| 阶段二 · 大陆多端 | ~~抖音 / 支付宝小程序~~ | — | **不做**。抖音仅做内容引流 → 跳转承接（省一套 Taro 构建与字节审核） |
| 验证后 | 原生 App（iOS / Android） | React Native / Flutter | **触发门驱动**：付费转化 ≥ 3% 且 7 日回访 ≥ 10%（PRD §11.3）同时达标后再评估；未达标一律不做 |

**定海神针：@rich-sim/core 计算引擎**——纯 TS、零副作用、可单测，Web / 小程序 / 原生 App 共用同一套测算逻辑。**UI 可以多套，计算永远一套。**

**跨端信号**：UI 层从一套变两套（Astro + Taro）后，core 必须抽成共享包 → 提前拍板「仓库结构：单应用仓库 vs monorepo」（见 §12 待决 5）。

**已确认决策（2026-10-03）**：
1. 海外 MVP：M1 只做移动端响应式达标，不做 PWA/小程序/App；PWA 增强放 M2（辅助回访，半天成本）。
2. 大陆小程序：微信小程序（Taro）优先；抖音仅做内容引流跳转，不做抖音/支付宝小程序。
3. 移动端写入 PRD：Non-Goals 已修订表述；里程碑 M1/M2 已加备注（见 PRD §3.2、§12）。
4. 原生 App：以触发门驱动（付费转化 ≥ 3% 且 7 日回访 ≥ 10% 同时达标），未达标一律不做。

---

## 11. 仓库结构

**MVP 建议**：应用作为**单个 Astro 项目**（新仓库 `rich-sim-app`），计算引擎作为仓库内模块（`src/core` 或 `packages/core`）。**不要过早拆 monorepo。**

当出现第二个消费者（落地页需要同一份引擎）时，再二选一：
- 抽成 workspace 包（pnpm workspaces，或合并为 monorepo）；
- 或引擎稳定前，落地页维持自己的简化版测算器（约百行，重复可接受）。

**现状**：`rich-sim`（文档，本仓库）、`rich-sim-landing`（营销页，Astro）已存在。应用仓库尚未创建。

**渐进式结论（2026-10-03 建议）**：M1 建 `rich-sim-app` **单仓库**，core 放 `packages/core`（独立包结构，暂不强制 workspace 化）。产品形态已确认跨端（大陆微信小程序，见 §10.1），第二个消费者是确定事件——小程序加入时升级为 **pnpm workspaces**（`apps/web` + `packages/core` + `apps/miniprogram`）。落地页维持简化测算器直至引擎稳定。

---

## 12. 待决问题

1. ~~**目标市场与托管区域**~~ **已定（2026-10-03）**：先海外、后大陆。海外用 Vercel（应用）+ Cloudflare（营销/边缘）+ Supabase。见 §9。
2. ~~**认证方案**~~ **已定**：Supabase Auth（与数据库同源，免自建）。
3. **托管分工**：维持「应用 → Vercel、营销 → Cloudflare」（2026-10-03 建议确认，无异议即定）。
4. **支付渠道**：阶段一海外（Stripe / Paddle），阶段二再加大陆（微信 / 支付宝）。M4 才需要；倾向海外 **Stripe**（`待定`）。
5. **仓库结构**：渐进式——M1 单仓库 + `packages/core`，小程序加入时转 pnpm workspaces（2026-10-03 建议，见 §11）。
6. **框架终局**：维持 Astro；应用状态变重、需要大量客户端路由时再评估 Next.js（2026-10-03 建议，见 §3）。
7. **产品形态**：海外 PWA / 大陆小程序（Taro）/ 原生 App 时机——草案见 §10.1。
