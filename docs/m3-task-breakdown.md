# M3 任务分解（F5 富豪模拟完整化：购物机制 + 一键成目标）

> 状态：**已开工 · 2026-10-06**（发起人 2026-10-06 过目并拍板 G4 走方案 (a)；S1 进行中，见 §2 备注）。依据 `PRD.md` §F5/§7.2、`simulation-gameplay.md` v0.2（§2 机制 / §5 购物池与字段 / §3 落点桥）。
> 先例：`docs/m2-task-breakdown.md`（已全部上线）。
> 范围：M3 = 购物交互、购物车、购物即记账、购物车一键成为现实测算目标。**不含**名人原型卡（路径 B 需先过 `deferred #5` 法务）、多剧本、六通道其余通道、3D。

---

## 0. 开工前必须过的闸门（冻结契约，先改契约再写代码）

| # | 闸门 | 现状 | M3 要动什么 |
|---|---|---|---|
| G1 | core 类型 `packages/core/src/types.ts`（frozen） | `CatalogOption` 只有 `id/label/annualCost/source/note/isDefault` | 增加**可选**玩法字段：`kind?: 'asset'|'consumer'|'experience'`、`purchasePrice?`、`costComponents?`（字符串条目，展示用）、`joy?`（1–5）、`resellable?`、`carryingJoy?`（−2…+2）。字段规格照 gameplay §5.2；**全可选**，不破坏既有测试，目录项在 S1 逐条补标注；富豪购物池内的项要求必填 `kind` 与 `joy`，由测试钉住（`shoppingPool` 落在 web 侧 `sim-content.ts`，测试随行） |
| G2 | `apps/web/src/lib/sim-draft.ts`（`rich-sim:sim:v1`） | `SimState` 只有起始金 | 扩 `cart?: CartItem[]`，`CartItem = { dimension: string; optionId: string }`，**允许同一维度多件**（见 G4）。`schemaVersion` 维持 1：旧状态读出 `cart` 为 `undefined` 时按空车处理，读写兼容由测试钉住。与 `draft.ts` 仍然互不 import（既有源码扫描测试不破） |
| G3 | 路由表 `CONVENTIONS.md`（frozen） | `/app/sim` 是卡 A 看板 | **不新增路由**：购物区是 `/app/sim` 页内的新区块（客户端岛），SSR 首帧仍是看板 + 「示意 · 虚构角色」。零路由改动，购物状态全在 `sim:v1` |
| G4 | 桥口径冲突（**2026-10-06 已拍板：走方案 (a)**） | `LifeChoice = { dimension, optionId }[]` 且 `scenarioAnnualCost` 每维取一件求和 | 购物车天然**同维多件**（卡 A 画像本身就含 transport 维的豪华车 \$17,000 + 私人飞机 \$1,000,000），一键成目标时无法用 `LifeChoice` 无损表达。两条路见 §3 S4，**推荐 (a)** |

> **G4 已定（2026-10-06）**：走方案 (a)——`Draft` 增可选 `goalOverride?: { annualCost: number; from: 'sim-cart' }`，过 `draft.ts` 冻结闸门。约束照 §3 方案 (a) 末条：只携带年成本一个数字进 REAL，不带起始金与资产占比。

**引擎侧零新公式**：年成本仍是 `scenarioAnnualCost` 的简单求和口径；购物车合计 = 对 `cart` 逐项（不是逐维）查 `annualCost` 求和。负担率用既有 `burdenStatus` 与常量 `BURDEN_RATE_GREEN/HARD`。变卖折价 75% M2 已在账单日实现过一次（游艇开关），M3 复用同一常量来源，不新造数字。

## 1. 内容取值规则（避免编数据）

1. **购物池收敛**（gameplay §5.1）：剔除普通人锚点档（small-rental / public-transit / home-cooking 等），普通人档保留在现实设计器、不进购物池。
   **实现口径（2026-10-06，S1 落地时确定）**：入池开关就是**目录项上的 `kind` 标注**——S2 的购物区要按 `kind` 分资产 / 消费品 / 体验三组陈列，没有 `kind` 就无法归组，所以池 = 已标注项，实测 **12 项**；另加一条红线：`source` 不是 http(s)（即「待校准」）的档位**即使标了 `kind` 也不进池**（`shoppingPool()` 里钉住）。
   ⚠️ **与本文原写法的差异**：原写「每维度取理想档 + 富豪档 ≈ 14–15 项」，实测按 `kind` 收敛是 **12 项**——差的正是 §2.1 点名要补的 2–3 个纯体验项（当前无来源，见 §2 S1 备注）。「理想档是否全部入池」这条口径待发起人确认。
2. **补 2–3 个纯体验项**（当前目录最缺，gameplay §2.1 点名）：如高端环球旅行、慈善晚宴 / 冠名、私人活动。**红线照走**：每项必须带可查证公开 `source`（口径写 `note`），与现有 23 项同一标准；拿不到可靠来源的档位写「待校准」标记且**不得进生产购物池**。体验项 `kind:'experience'`、`resellable:false`、无持有负担。
3. `joy` / `carryingJoy` 只做**相对排序**（gameplay §5.2 明令不做伪精确打分），不参与任何财务计算，测试只断言取值域与排序单调性。
4. 卡 A / 卡 B 的年成本画像仍是 catalog 实测加总（M2 已钉 \$1,317,000 / 加游艇 \$6,717,000），M3 加字段后这两个测试必须继续绿。
5. 页面常驻「虚构角色 · 金额为示意组合，不代表任何真实人物」，购物车金额页必须带口径与来源入口（沿用 M1 假设清单纪律）。

## 2. 切片

顺序 **S1 → S2 → S3 → S4 → S5**。每片独立可上线、自带测试。

| # | 内容 | 完成判据 | 规模 |
|---|---|---|---|
| **S1** | G1 类型扩展 + catalog 玩法字段 + 2–3 个体验项 + 购物池导出 | core：`CatalogOption` 可选字段落地；购物池项 `kind`/`joy` 齐全（测试钉）；新体验项均有 http(s) `source`，`catalog-data.test.ts` 的来源/逐维递增断言对新项同样通过；导出 `shoppingPool(catalog)`（或 web 侧等价纯函数，放 `sim-content.ts`）过滤普通人档，纯函数 + 测试；卡 A/B 两个加总测试不破 | M |
| **S2** | G2 购物车状态 + `/app/sim` 购物区 UI | `sim-draft.ts` 增 `cart`（同维多件、幂等加删、空车兼容旧状态）；React 岛：按 `kind` 三组（资产 / 消费品 / 体验）陈列，每项显示年成本、`costComponents`、来源；加入 / 移出购物车即时更新；SSR 首帧无购物区时主看板与免责标注仍完整；移动端 390×844、键盘可达、reduced-motion | L |
| **S3** | 购物即记账：实时账单预览 + 负担率联动 + 1:1 配比提示 | 购物车年成本逐项合计；用既有 `burdenStatus` 实时算 r 与绿/黄/红（阈值常量来自 core，不硬编码 UI）；「下一期账单预览」随加购累加；资产类件数 > 体验类时展示 1:1 配比的**提示文案**（不是禁止——gameplay §2.1 是默认规则不是硬约束，措辞不得像财务建议）；红区给变卖入口，复用 75% 折价口径（M2 已实现的常量/文案）；纯函数（cart → 合计/r/状态）在 web lib 有单测 | M |
| **S4** | 购物车一键成为现实测算目标（SIM→REAL 单向桥） | 「把这套生活设为我的目标」按钮（关 JS 降级为普通链接）；点击后**只写 `rich-sim:plan:v1`，绝不回写 sim**；落点按 G4 拍板方案实现；写入后跳 `/app/finance`（未录入）或 `/app/result`（已录入），结果页/草稿恢复处可见「目标来自富豪模拟购物车」标签；结构性测试：走过桥后 SIM 账本不变、REAL 账本不出现任何 sim 起始金 | M |
| **S5** | 埋点 + 冒烟 | 新增事件（worker 事件名正则天然允许，无需改 worker）：`sim:add` / `sim:remove` / `cart:to-goal`，props 仍全部丢弃；`e2e-smoke.mjs` 加购物车断言（加购→账单变色→一键成目标→REAL 落点），更新 DEPLOYMENT.md 的断言数；事件清单（DEPLOYMENT.md「当前事件清单」）同步 | S–M |

**S1 进度（2026-10-06）**：✅ G1 类型扩展（`types.ts` 六个可选玩法字段）+ catalog 玩法字段标注 + `shoppingPool()`（`apps/web/src/lib/sim-content.ts`，4 条测试随行）已实现。
**未完成**：2–3 个纯体验项——`catalog-data.test.ts` 要求每个 `source` 必须是 http(s) URL，当前无可查证来源（项目禁止编造数据），**未编造，待补来源**；补齐后自动进池。

**G4 两个方案（已拍板 (a)，保留备查）**：

- **(a) 推荐：`Draft` 增可选 `goalOverride?: { annualCost: number; from: 'sim-cart' }`（过 `draft.ts` 冻结闸门）**。结果页计算时若存在 override，目标年成本直接用它，不经过 `LifeChoice` 逐维选择；`choices` 仍照常写一份「每维最贵项」作展示回显，但计算口径以 override 为准，避免悄悄丢金额。改动集中、口径显式、可测试；代价是动一次冻结 schema（`schemaVersion` 处理 + 草稿测试）。
- (b) 购物池交互上限制同维度至多一件。零契约改动，但**与卡 A 事实冲突**（车 + 飞机同维），会让 M2 已上线的卡 A 画像在 M3 购物车里无法复现，排除。
- 顺带约束：`goalOverride` 只接受年成本一个数字，**不携带任何虚构成分进 REAL**（不带起始金、不带资产占比）；一键成目标页必须重申「这是你想要的生活方式的年成本，不是你有这么多钱」。

## 3. 每片的验收通用项

1. `npm test` 与 `npm run check` 绿；core 改动走 barrel 合并纪律（`index.ts` 不并发编辑）。
2. 新文案过 `copy-guard.test.ts`：禁语清单、数字与来源一致；配比提示与红区文案不得构成投资/消费建议（只陈述算术与状态）。
3. 模拟态免责：购物区与账单预览带「虚构角色 · 示意」；REAL 落点带桥来源标签 + 既有假设清单/免责声明（SSR 可见）。
4. 移动端 390×844 无溢出；键盘可达；`prefers-reduced-motion` 生效（加购/变色不依赖动效传达）。
5. 冒烟脚本保持全绿；S5 后生产实测一次真实加购 → D1 见到 `sim:add` 等事件（参照 M2 beacon 的教训：**必须看到网络 200 + D1 行，队列清空不算数**）。

## 4. 明确不做（M3 边界）

- 名人指名 / 肖像（路径 A 不可行）；路径 B 的新原型卡扩充、路径 C 授权联名——法务复核（`deferred #5`）没过之前不加卡，M3 仍只有卡 A（卡 B 画像文档已成文，可作为 S2 的只读第二卡，但不做购物交互）。
- 六通道中的「经历 / 地位 / 感受」其余通道、人生快进剧情、随机黑天鹅事件（gameplay §2.3 表内后置项）。
- 多剧本 / 多身份存档（PRD F9，P2）、账号、保存到云端（F6/D4，等漏斗读数）。
- 金币纸屑动效：属 claim P2，可顺手做但不阻塞 M3；做时必须 reduced-motion 直达。
- 把购物车写进 `rich-sim:plan:v1` 的 `choices` 后再反向同步 sim（REAL→SIM 永远禁止）。
- 成本模型参数化进 core 的大改（gameplay §6 待定项）：M3 只用既有命名常量，不新开参数体系。

## 5. 与度量的关系

M3 直接产出新的漏斗段：`claim:tap`（已有）→ `sim:add`（购物开始）→ `cart:to-goal`（被钩进现实测算）→ 后续 `finance:update` / `results:view`（已有）。这是「富豪钩子是否真的把人带进现实测算」的第一段可观测证据，也是 D4/D5 判据的核心输入。管道已通（2026-10-05），M3 上线后读数才有量；PV 分母（CF Web Analytics token）仍按发起人的决定暂缓，完成率分母继续缺，解读时带这个口径（`deferred-items.md` #4）。
