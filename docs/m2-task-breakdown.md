# M2 任务分解（F5 最小版 + 三通道）

> 状态：**可开工 · 2026-10-05**。依据 `docs/m2-decisions.md` D1 / D2（已整包确认）。
> 进度：S1 已上线（PR #19，2026-10-05）→ S2 已上线（PR #20，2026-10-05）→ S3 已上线（PR #21/#22，2026-10-05）→ **S4 代码完成**（2026-10-05），入口受 `PUBLIC_HOMEPAGE_CLAIM` 控制且**生产尚未打开**。
> 先例：M1 用 `docs/m1-task-breakdown.md` 做同样的事。
> **红线不变**：不含 3D、不做多剧本、不做购物交互（那是 M3）、不出现具体金融标的。

---

## 0. 开工前必须过的两个闸门

这两处是**冻结契约**，不能绕过、也不能"先写了再说"：

| 闸门 | 要改的文件 | 内容 |
|---|---|---|
| **路由表** | `CONVENTIONS.md` §路由表（冻结） | 新增 `/app/sim`（卡 A 剧本页）。**先改表再写代码**，同一个提交里带上 |
| **localStorage schema** | `CONVENTIONS.md` §localStorage 方案 schema（冻结） | 新增 `rich-sim:sim:v1`（模拟态独立账本，见 `homepage-claim-experience.md` §3.1）。**不得复用 `rich-sim:plan:v1`** |

引擎侧**零契约改动**：卡 A 的年成本用现成 `scenarioAnnualCost` 对 catalog 选项求和，够用线用 `enoughLine`。

## 1. 内容取值规则（避免编数据）

卡 A 的六项年成本**全部来自 catalog 实测**，已在 `m2-decisions.md` D1 复核：$1,317,000/年。

资产结构（看板用占比）只有一条规则：**股权取 `simulation-gameplay.md` §4.4 区间「约 70–85%」的中值 77.5%；剩余 22.5% 不细拆，合并显示为「现金 / 债券 / 不动产」**——因为 §4.4 只给了相对顺序、没给比例，再拆就是编造。看板必须显式标 **「示意 · 虚构角色」**。

占比**不进任何计算**，只用于展示；参与计算的只有年成本。

## 2. 切片

| # | 内容 | 完成判据 | 规模 |
|---|---|---|---|
| **S1** | `/app/sim` 卡 A 资产看板 + 年持有成本 | 资产结构可见且标「示意」；年成本 = `scenarioAnnualCost` 对六项求和 = $1,317,000，与 §4.4 一致（写成测试）；含「虚构角色，不代表任何真实人物」标注 | M |
| **S2** | 账单日（现金流波动 + 断裂） | 用 §2.4 六个默认参数；负担率 r=100% 硬线、绿/黄 60%（§2.5）；加游艇后年成本 $6,717,000 触发红区，作为固定测试用例 | M |
| **S3** | 换算条（轻量口径） | `comparison-converter.md` §2.1 纯除法；三条边界（币种同域、分母 ≤0、超 60 年改倍数表达）各有测试；**不写入 draft** | S–M ✅ 2026-10-05 |
| **S4** | 首页「领钱入口」 | 依赖 S1–S3 存在才有落点；按 `homepage-claim-experience.md` §7 P1 范围 | M ✅ 2026-10-05（当晚 Production 开关打开，Preview 未配） |

**顺序 S1 → S2 → S3 → S4**。S4 明确排最后：先有落点再开门。

## 3. 每片的验收通用项

1. `npm test` 与 `npm run check` 绿（CI 已在 PR 上强制）。
2. 新增界面文案必须过 `copy-guard.test.ts`（措辞与数据事实一致性 + 禁语清单）。
3. 假设清单与免责声明在页面上可达（S1/S2 是模拟态，额外加「起始金/资产结构为示意 · 虚构角色」一行）。
4. 移动端 390×844 无溢出；键盘可达；`prefers-reduced-motion` 生效。
5. 生产冒烟：`scripts/e2e-smoke.mjs` 保持全绿，新页面另加断言或独立冒烟。

## 4. 明确不做

购物机制与可购项字段扩展（§5.2）、多剧本、名人原型卡（路径 B/C，先过 `deferred #5` 法务）、3D、任何"推荐配置"控件、把模拟值写进 `rich-sim:plan:v1`。

## 5. 与度量的关系（别自欺）

S1–S4 做完**不等于验证过**。度量现状（2026-10-05 晚更新）：

- **漏斗事件收集端已就绪**：`workers/analytics-collector`（Cloudflare Worker + D1 `rich-sim-events`）已部署，端点 `https://rich-sim-collect.jiangfengkxi.workers.dev/collect`，`/summary` 只读查询要 `READ_TOKEN`。**只存事件名+时间，丢 props、不存 IP/UA**（红线工程保证）。
- **客户端已指过去并端到端验证**：Pages Production 已配 `PUBLIC_ANALYTICS_ENDPOINT`，`PUBLIC_HOMEPAGE_CLAIM=1` 同步打开。开关首日暴露一个静默丢事件缺陷——`sendBeacon` 固定 no-cors，客户端却以 `application/json` Blob 发送，请求在发出前被浏览器拦截、队列却照常裁剪；已在 `c6894a2` 改为纯字符串载荷修复并重新部署，D1 console 可见真实漏斗事件入库；当晚联调用的 3 条 `probe:*` 诊断事件已在验证后删除，读漏斗无需再过滤。
- **PV / 会话分母仍缺**：`PUBLIC_CF_WEB_ANALYTICS_TOKEN` 暂缓至今 ⇒ 完成率的「进入」分母没有，自建 collect 只数自定义事件、不给 PV。
- 配置与 sendBeacon 踩坑细节见 `docs/DEPLOYMENT.md` §分析埋点。**D4（账号体系）与 D5（付费墙/投资线）的判据依赖读数积累——管道已通，等真实流量。**

本分解只负责"能开工"，不负责"知道有没有用"。
