# 发布终稿 · 各平台可直接粘贴版（rich-sim）

> 状态：2026-10-23 制作，配套 `docs/showcase-pitch.md`（素材母版）。本文只放**按平台真实字数/格式裁好、可直接复制粘贴**的终稿；所有硬限制已逐字符核对（条数见下）。
> 配图：`apps/web/public/og-cover.png`（1200×630）。链接自带 OG 图；Product Hunt 需在后台单独上传同图。
> 产品地址：https://app.rich-sim.bayjf.com ｜ 玩法说明：https://app.rich-sim.bayjf.com/app/guide ｜ 源码：https://github.com/bayernjf/rich-sim
> 红线：全篇不构成投资建议、不荐股、不推荐金融产品、不承诺收益；倍数/税率显式标注教学示意；隐私口径统一为「分析数据不出本机 / 登录后才可选同步」。

## 平台硬限制（已核对，来源见文末）

| 平台 | 字段 | 限制 | 本稿实际 |
|---|---|---|---|
| Product Hunt | Name / Tagline / Description | 40 / **60** / **260** 字符（含空格） | 8 / 58 / 255 |
| Hacker News | Show HN 标题 | 中性陈述句，建议 ≤80 字符；正文在**第一条评论**（纯文本，不渲染 Markdown） | 71 |
| Reddit r/SideProject | 标题 | `[Launch] …`，建议 <100 字符 | 78 |
| X | 单条推文 | 280 字符 | 252 |

---

## 1. Hacker News（Show HN）

**提交链接**：直接填产品 URL `https://app.rich-sim.bayjf.com`（Show HN 要求链接到可亲自试用的东西，且本人是 maker）。

**标题（71 字符，原样复制）**：

```
Show HN: rich-sim – a simulator for the real holding cost of being rich
```

**提交后立刻自己发第一条评论（这才是真正的正文；HN 不渲染 Markdown，保持纯文本、不要加粗）**：

```
Hi HN — I built rich-sim, a financial-literacy simulator with two tracks.

First you play rich. Pick an identity card (a new-money tech founder on $3M/year, or an old-money heir) and walk through a year of real bills. The founder's holdings cost about $1.3M a year, which puts the "bill burden" at roughly 78% of cashflow before you buy anything else. You can fast-forward 30 years, draw a black-swan card that halves income, take on 2x leverage (the math shows cashflow breaking past 4.35x), negotiate a 6x fully-leveraged acquisition (floor 2.44x), add items to a shopping cart where every purchase lands on next year's bill, resell them at a 75% recovery, and run an exchange-rate time machine that shows what $1M was worth on past dates.

Then you measure yourself. Carry the simulated bill structure over to your own income and expenses, and the engine computes a sufficiency line, the gap, and the number of years — with reachable / unreachable / no-net-savings as first-class states rather than error screens.

Everything is arithmetic on assumptions the user fills in. There is no portfolio, no ticker, no recommended product and no return promise. Multiples and tax rates are labeled as teaching illustrations; money figures either link to a public source or are marked as such.

Technically: Astro with React islands, a separate pure-function calculation engine in TypeScript, deployed on Cloudflare Pages. It is bilingual (English/Chinese), works as a PWA, and needs no account. On privacy, the analytics pipeline records only event names and timestamps — no props, no IP/UA, no identifiers — and the only way financial data leaves the device is if the user signs in and turns on sync to their own account.

It is an educational tool, not an advisor. I'd love feedback on whether the two-track structure (hook with the fantasy, then land on your own numbers) actually teaches the "holding cost" idea, and on anything that feels misleading.

Try it: https://app.rich-sim.bayjf.com
How to play: https://app.rich-sim.bayjf.com/app/guide
Source: https://github.com/bayernjf/rich-sim
```

**时机**：太平洋时间工作日 9–11 AM 提交（HN 流量高峰）；标题不要出现感叹号、最高级、营销词。

---

## 2. Product Hunt

**Name（8 字符）**：`rich-sim`

**Tagline（58 字符，≤60）**：

```
See the real cost of being rich, then run your own numbers
```

> 备选（56 字符，A/B）：`See what being rich really costs, then run your own math`

**Description（255 字符，≤260）**：

```
Play rich to see what wealth really costs—$1.3M/yr of bills, black swans, leverage, FX time travel—then run the same math on your own income: your sufficiency line, the gap and the years. Arithmetic on your assumptions; no advice, no products, no sign-up.
```

**素材**：上传 `og-cover.png` 作为分享图；分类选 Education（或 Fintech）；网站 URL 填产品地址。

**Maker comment（第一条评论，Markdown 可长，讲为什么/怎么做/求反馈）**：

```markdown
Hey Product Hunt 👋

rich-sim is a financial-literacy simulator with two tracks. The idea started from a simple question: most "rich lifestyle" content shows what wealthy people buy, but almost nothing shows what those things *cost to hold* year after year.

**Track 1 — Play rich.** Pick an identity card (new-money founder or old-money heir) and walk through a year of bills. The founder's holdings run about $1.3M/year — a ~78% bill burden on a $3M income before you buy anything. Fast-forward 30 years, draw a black-swan card that halves income, take 2x leverage and watch it break past 4.35x, negotiate a 6x acquisition (floor 2.44x), fill a shopping cart where every item lands on next year's bill, resell at 75% recovery, and time-travel exchange rates with $1M as the anchor.

**Track 2 — Measure yourself.** Carry that bill structure over to your own income and expenses. The engine returns a sufficiency line, the gap, and the years — with reachable / unreachable / no-net-savings treated as normal outcomes, not errors.

A few things I care about:
- Every number is arithmetic on **your own assumptions**; illustrative multiples and tax rates are labeled as such.
- No portfolio, no ticker, no recommended product, no return promise.
- Bilingual, PWA, works fully signed-out. Analytics stores only event names and timestamps; your financial data never leaves the device unless you sign in and enable sync.

It's an educational tool, not an advisor. I'd love to know: does the two-track structure (fantasy first, your own numbers second) actually help the "holding cost" idea land? And where does it feel confusing or misleading?

→ https://app.rich-sim.bayjf.com
→ How to play: https://app.rich-sim.bayjf.com/app/guide
```

---

## 3. Reddit r/SideProject

**标题（78 字符，<100）**：

```
[Launch] rich-sim — see what being rich actually costs, then run your own math
```

**正文（Markdown）**：

```markdown
Hey everyone,

I just shipped **rich-sim**, a financial-literacy simulator. The pitch: most content shows you what rich people *buy*; this shows what those things *cost to hold* — then runs the same math on your own income.

**What it is**
- **Play rich:** pick a new-money founder ($3M/yr) or old-money heir. The founder's holdings cost ~$1.3M/yr, a ~78% bill burden. Fast-forward 30 years, draw a black-swan (income halved), take 2x leverage (breaks past 4.35x), negotiate a 6x fully-leveraged acquisition (floor 2.44x), shop where every item hits next year's bill, resell at 75% recovery, and time-travel FX rates with $1M anchored.
- **Run your own numbers:** import your income/expenses and get a sufficiency line, the gap, and the years. Reachable / unreachable / no-net-savings are all first-class states.

**How it's built**
Astro + React islands, a pure-function TypeScript calculation engine, on Cloudflare Pages. Bilingual, PWA, no account needed.

**Privacy / ethics**
Every number is arithmetic on your own assumptions; multiples and tax rates are labeled teaching illustrations — no portfolio, no ticker, no product recommendation, no return promise. Analytics stores only event names and timestamps; financial data leaves the device only if you sign in and sync yourself.

**Feedback wanted**
Does the "hook with the fantasy, land on your own numbers" structure actually teach holding cost? Anything confusing or that feels like overreach?

🔗 https://app.rich-sim.bayjf.com
Guide: https://app.rich-sim.bayjf.com/app/guide
```

---

## 4. X / Twitter（252 字符，≤280）

```
Built rich-sim: play a $3M/year billionaire for a year (the bills, the leverage, the black swans), then run the same math on your own salary to get your sufficiency line, gap and years. No advice, no products, no sign-up. https://app.rich-sim.bayjf.com
```

---

## 5. 中文平台

### 5.1 V2EX（`/share/create` 节点「分享创造」，支持 Markdown，可稍长）

**标题**：

```
做了一个「财富模拟」：先玩一把富豪，再用你自己的收入算账
```

**正文**（直接用 `docs/showcase-pitch.md` 的「中文社区版」全文，结尾链接换成三条）：

```markdown
做了个小工具，想分享给同样对「钱到底怎么算」好奇的人。

**一句话**：先看见，再算清——先玩一把富豪，看清财富的真实持有成本；再用你自己的收入，算出「够用线 / 差距 / 年限」。

**好玩的部分**：
- 两张身份卡开局（新钱打工人 / 老钱继承人），年账单 $1.3M 摆在你面前
- 人生快进 30 年、黑天鹅收入腰斩、加杠杆 2×（超过 4.35× 利息吃光现金流）、6× 全杠杆收购（谈判底价 2.44×）、诉讼/危机/分产事件卡、汇率时间机（$1M 在不同历史日期值多少）
- 购物车里的每件商品都会变成下一年的账单——负担率实时变色
- 一键把模拟账单搬进你自己的收支，算够用线、差距和年限

**原则**：只对你自己填的假设做算术；倍数和参数都标注为教学示意；不荐股、不推荐产品、不承诺收益；不登录也能全程用，分析数据不出本机，只有你自己登录并开启同步才会上传。

**技术**：Astro + React 岛 + 独立的纯函数 TypeScript 计算引擎，部署在 Cloudflare Pages，中英双语、可装成 PWA。

- 体验：https://app.rich-sim.bayjf.com
- 玩法说明：https://app.rich-sim.bayjf.com/app/guide
- 源码：https://github.com/bayernjf/rich-sim
```

### 5.2 即刻（短动态，一条讲完）

```
做了个「财富模拟」：先让你当一年 $3M 收入的富豪，看 $1.3M 的年账单、加杠杆、黑天鹅怎么压垮现金流；再把同一套算术搬到你自己的收入上，算够用线、差距和年限。只算你填的假设，不荐股、不承诺收益、不用登录。
https://app.rich-sim.bayjf.com
```

---

## 6. 发布节奏与发布后

**节奏（素材包既定原则：先发 1 个平台观察，再铺）**：
1. **第一发：Hacker News**（太平洋工作日 9–11 AM），盯 24–48 小时评论，技术/隐私问题如实答；
2. HN 沉淀后再上 **Product Hunt**（建议周二/周三太平洋 00:01 上架，当天 0–1 点在线回复）；
3. 同日跟 **Reddit r/SideProject** 与 **X**；中文平台（V2EX / 即刻）随后或择机。
4. 一次只发一个主平台，避免同一批人在多处看到稀释票数；所有回复守住「教育工具、不构成投资建议、不承诺收益」。

**被问「怎么赚钱」统一口径**：付费墙还在意愿探针阶段，先攒真实访客与反馈再定方案，不承诺具体时间表（见 handoff 待决 #2 / #5；首个付费场景已定为「买房 vs 租」，构建暂缓）。

**发布后看读数（终端）**：

```bash
# 按日裸名访问（自动过滤 smoke: 冒烟流量）
npx wrangler d1 execute rich-sim-events --remote --json \
  --command "SELECT day, COUNT(*) n FROM events WHERE event NOT LIKE 'smoke:%' GROUP BY day ORDER BY day"
# 付费意愿探针累计
npx wrangler d1 execute rich-sim-events --remote --json \
  --command "SELECT event, COUNT(*) n FROM events WHERE event LIKE 'paywall:intent%' GROUP BY event"
```

> 发布前基线（2026-10-23 复拉）：裸名事件仅 10-05（15）/ 10-08（26），付费意愿探针 0；生产冒烟 238 条 FAILS 0。发布当天新增的访问日即第一条真实引流信号。

---

## 平台规则来源（2026-10-23 检索）

- Product Hunt 官方《Prepare for your launch》：tagline max 60 characters，禁夸张；name 40 / description 260 来自官方 launch 文档与多篇 2025–2026 launch checklist 交叉一致。
- Hacker News Show HN：标题前缀 `Show HN:`、中性陈述、maker 本人、链接可试用；第一条评论承载正文；多个 2026 HN 发布指南一致。
- Reddit r/SideProject：允许直接 self-promo，标题 `[Launch] ProductName - one-liner`、建议 <100 字符，正文讲 why/技术/求反馈。
