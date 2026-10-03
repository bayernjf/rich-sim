# M1 任务分解与并行执行规划

> 创建：2026-10-03
> 范围：M1 核心闭环（理想生活设计器 + 轻量财务录入 + 计算引擎 + 测算输出 + 币种本位币选择）。
> 规格出处：`technical-design.md` §4.1（引擎）、§4.2（币种汇率）、§10.1（形态）；`PRD.md` §7/§9/§12。
> 执行原则：应用代码一律进 `rich-sim-app`（独立仓库，尚未创建）；本仓库只沉淀计划与验收标准。
> 并行依据：`@rich-sim/core` 为纯函数引擎，与 UI 天然解耦——类型先行（接口契约），三条工作线即可并行。

## 任务清单

| ID | 任务 | 依赖 | 验收标准 | 工作量 |
|---|---|---|---|---|
| T01 | 建仓与骨架：`rich-sim-app`（Astro 5 + React 19 + TS + Tailwind v4，单仓库 `packages/core`，Vitest 配置，CI 冒烟） | —（唯一全局前置） | `npm run dev` 可跑；`vitest run` 空跑通过；monorepo 结构就位 | M |
| T02 | core 类型定义：`LifeChoice` / `ScenarioCost` / `Projection` / `Profile` / `Assumptions`（含 `fx`）/ `Currency` / `FxSnapshot` | T01 | 类型文件导出，TS 严格模式通过 | S |
| T03 | core 函数实现：`enoughLine` / `scenarioAnnualCost` / `project` / `gap` / `buildMilestones`（§4.1） | T02 | 5 函数签名与规格一致 | M |
| T04 | core 测试：10 条用例 + 手算样例核对 + `convert` 往返/边界（§4.1/§4.2） | T03 | `vitest run` 全绿；手算样例（40 万@4%→1000 万等）独立复核一致 | M |
| T05 | Catalog 内容数据：7 维度 × 3–5 选项 + 年成本数值（海外 USD 初始口径） | —（可与 T01 并行准备） | 数据文件就位；每个数值有来源或显式标注「待校准」 | M |
| T06 | 设计器 UI：页面 + 组件 + 交互（mock 数据先行） | T01 + T02 类型 | 移动端可滚动、选项可点选、选择状态可保存 | M |
| T07 | 财务录入表单：≤4 项 + 校验 + localStorage 方案快照 | T01 + T02 | 非法输入被拦截；刷新后数据保留 | S |
| T08 | 测算输出页：三状态（可达/不可达/无净储蓄）+ 阶梯目标（`buildMilestones`） | T03 + T06 + T07 | 三种状态均正确渲染；阶梯 ≥3 级 | M |
| T09 | 假设清单 + 免责声明：SSR 渲染（不被 JS 关掉），含汇率来源与日期 | T01 + T02 | 页面源码可见假设与免责；无 JS 也可见 | S |
| T10 | 币种切换：本位币选择器 + `convert` 展示层换算 + SSR 汇率代理端点 + 静态快照兜底 | T01 + T02 | 切换币种金额即时重算；API 失败自动降级静态快照 | M |
| T11 | 移动端响应式达标：LCP < 2.5s / INP < 200ms / CLS < 0.1（PRD §9/§12） | T06–T10 | 移动端实测指标达标 | M |
| T12 | 口径校验：对照 `rich-sim-landing` Calculator.astro 一致性 | T03 + T08 | 同输入同输出（样例集逐项核对） | S |
| T13 | 集成验收：E2E 冒烟（设计器→录入→测算→切币种）+ 完成率埋点接入 | T08 + T10 + T11 | 全流程可走通；埋点事件可观测 | S |

## 并行分组（Wave 结构）

```
Wave 0（闸门，1 agent）        T01 建仓与骨架
                                    │
Wave 1（3 个并行）     ┌────────────┼────────────┐
                      │            │            │
        Agent A：core 链      Agent B：内容      Agent C：UI 骨架
        T02→T03→T04          T05 Catalog      T06 设计器（mock）
                      │            │            │
Wave 2（3 个并行）     ├────────────┼────────────┤
                      │            │            │
        Agent D：T07 财务录入  Agent E：T10 币种  Agent F：T09 假设清单
                      │            │            │
Wave 3（2 个并行）     └─────┬──────┘            │
                            │                   │
              Agent G：T08 测算输出页      Agent H：T11 移动端达标
                            └─────────┬─────────┘
                                      │
Wave 4（收尾，1 agent）      T12 口径校验 → T13 集成验收
```

## 并行执行说明（多 agent 编排）

1. **接口契约先行**：T02 类型定义是三条工作线的公共契约，Wave 0 完成后**第一时间**产出（可并入 T01 或紧随其后单独提交）。
2. **Wave 内并行，Wave 间闸门**：每个 Wave 的 agent 独立交付并带验收标准；上一 Wave 全部通过才进入下一 Wave，避免返工。
3. **每 agent 交付物自含验证**：core 链=测试全绿；内容=数据文件+来源；UI=组件可渲染+交互可操作；组装=页面可达+状态正确。
4. **真实开工时**：由 OrganizerAgent 按本表创建 Wave 分片（每片一个 SubAgent，端点到端点：实现→测试→验收→标准输出），本仓库只维护计划与验收标准。
5. **串行链只有两条**：core 链（T02→T03→T04）与组装链（T06/T07→T08）；其余全部可并行。

## 关键风险与对策

- **Catalog 数值无来源**：T05 允许「待校准」占位（不编造数据），校准由内容迭代补齐（见 `deferred-items.md` #1）。
- **汇率 API 兼容性**：T10 实现时实测 Frankfurter 的 CNY 覆盖（§4.2 `待验证`），失败则降级静态快照 + 标注。
- **Workers 运行时适配**：Astro SSR 部署 Cloudflare（§9 已定）时实测 `nodejs_compat`，纳入 T11/T13 验收。
- **口径漂移**：T12 强制对照落地页 Calculator.astro，任何不一致以 `@rich-sim/core` 为准并回写落地页。

## 状态

- 全部待执行；T01 未开工（`rich-sim-app` 仓库未创建）。
- 每完成一任务：本表勾掉，并在 `handoff.md`「下一步」同步。
