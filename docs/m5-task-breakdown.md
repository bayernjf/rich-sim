# M5 任务分解：账号体系与云端同步

> 状态：**新建（2026-10-08）**，未开工。
> 起因：2026-10-08 发起人拍板 **D4 翻转——账号体系立项**（`docs/m2-decisions.md` D4）。原判据（同设备 7 日回访 ≥15%）因线上读数为 0 短期无法达成，发起人直接拍板。
> 范围：M5 = **Supabase Auth 登录** + **草稿云端同步**（REAL 账 `rich-sim:plan:v1` 与 SIM 账 `rich-sim:sim:v1`）。**不做**：付费、分享、社交、多设备冲突合并的高级策略。

## 0. 红线与闸门（动手前先读）

M5 是本仓库第一次引入「用户数据离开本机」，红线压力最大的一片，逐条对照：

| 红线 / 契约 | M5 怎么守 |
|---|---|
| 「用户自填的财务数据不得上传」（AGENTS.md） | 这条红线的原意是**不得在用户不知情下采集**（analytics 管道至今不碰财务数据，继续保持）。M5 的同步是**用户显式登录后的主动行为**，性质等同「用户自己的存档」——这是 D4 拍板时已接受的解释，回写在 `handoff.md` 决策表。匿名/未登录路径**一字不改**，零上传 |
| MVP 形态决策（原「无后端」） | 已随 D4 翻转为「localStorage 优先 + 登录后同步」。**不登录可全程使用**，localStorage 始终是首屏数据源（离线可用、无加载闪烁），云端只做备份与跨设备 |
| 冻结契约（`CONVENTIONS.md`：`types.ts` / `draft.ts` / `sim-draft.ts` / 两个 localStorage key） | **零改动**。同步层读现有 `readDraft()` / `readSimState()` 的输出了序列化上云；写回走现有 `writeDraft` 路径。schema 变了才过闸门，本分解不引入 schema 变化 |
| 两本账不混 | 云端两张表（或一张表两个 kind），与本地两个 key 一一对应，同步逻辑互不读写对方 |
| 不编造数据 | 同步冲突解决规则是显式写的（§3），不做「智能合并」的黑盒承诺 |

**闸门（每条没过前不写对应代码）：**

| 闸门 | 内容 | 状态 |
|---|---|---|
| **M5-G1** | **Supabase 项目与密钥**：需要发起人创建 Supabase 项目（海外区域），提供 `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY`（Pages 环境变量）；service key 不进前端、暂不需要 | ⏳ 等发起人 |
| **M5-G2** | **登录方式**：建议只做 **magic link 邮箱登录**（Supabase Auth 内置、免密码、海外合规压力最小）；Google OAuth 后置 | 待拍板（建议项即可批） |
| **M5-G3** | **隐私政策 / 条款页**：有了账号与云端存储，就需要最小隐私政策页（收集什么、存哪、怎么删）。文案需发起人确认 | 待拍板 |

## 1. 切片

顺序 **S1 → S2 → S3**，每片独立可上线、自带测试。S1 纯前端可先做（不依赖 G1 也能把 UI 壳与本地队列做好？——**不**，没有真项目连 auth 客户端都初始化不了，所以 S1 等 G1）。

| 切片 | 内容 | 依赖 | 规模 |
|---|---|---|---|
| **S1** | **Auth 接入**：`@supabase/supabase-js` 客户端（懒加载，未配置环境变量时零行为，沿用 Analytics 的开关纪律）；导航区「登录」入口 + magic link 表单 + 会话恢复；`auth:login` / `auth:logout` 事件 | G1、G2 | M |
| **S2** | **草稿同步（REAL 账）**：登录后首次把本机草稿上云；此后 `writeDraft` 时防抖上云；冷启动时云端新于本机则拉取（冲突规则见 §3）。RLS：`auth.uid() = user_id` 才能读写自己的行 | S1 | M |
| **S3** | **草稿同步（SIM 账）+ 登出语义**：SIM 账同 S2 口径；登出**不清本机草稿**（明示「本机副本保留」），只断同步 | S2 | S |

## 2. 数据模型（最小）

```sql
-- plans：一行 = 一个用户的一本账（kind: 'plan' | 'sim'）
create table plans (
  user_id uuid references auth.users not null,
  kind text not null check (kind in ('plan','sim')),
  payload jsonb not null,        -- 本机 localStorage 的原样 JSON（含 version 字段）
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table plans enable row level security;
create policy "own rows" on plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

`payload` 原样存本机序列化结果：**云端不理解 schema，schema 演进只走本机迁移逻辑**（`draft.ts` 的 version 机制），这样冻结契约的升版流程不被云同步绕过。

## 3. 同步与冲突规则（显式，不智能）

- **上行**：登录态下每次本地写入后防抖 2s 上行（`updated_at` 服务端时间）。
- **下行**：登录/冷启动时比较 `updated_at` 与本机草稿时间戳；云端新 → 覆盖本机并刷新 UI；本机新或相等 → 不动。
- **首次登录且两边都有内容**：本机优先上行（本机是用户刚用过的，更可能是「最新意图」），UI 不做合并、不出冲突弹窗。**这条是可翻的**，翻的条件：出现真实多设备用户抱怨覆盖。
- **登出**：断同步、保留本机副本；再登录按上面规则重新对时。

## 4. 验收

1. 未配置 Supabase 环境变量时：全站与现在**逐字节一致**（构建产物 diff），无登录入口、零网络请求。
2. 未登录全程：localStorage 读写路径与现测试钉住的行为逐位不变（现有 270 单测全绿即证）。
3. 登录 → 写草稿 → 另一无痕窗口登录同账号 → 草稿出现（REAL 与 SIM 各验一次）。
4. RLS 验证：用另一账号的 JWT 直接查 `plans` 返回 0 行。
5. 关 JS / 离线：首屏仍从 localStorage 渲染，无白屏无报错。
6. 冒烟脚本新增登录态用例（测试账号走 Supabase 测试项目，不进生产数据）。

## 5. 明确不做

- 不做密码登录 / 社交登录（G2 之外的提供商后置）。
- 不做服务端渲染个性化（页面仍静态 + 岛）。
- 不做分享链接、不做协作、不做多剧本云存档（F9 是另一件事，可做本机版，不依赖 M5）。
- 不动 `workers/analytics-collector`：它继续只存事件名与时间，与账号体系完全无关。
