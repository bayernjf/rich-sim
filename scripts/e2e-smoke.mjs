// T13 · M1 E2E 冒烟：设计器 → 财务录入 → 测算结果 → 切币种 → 复看结果。
//
// 运行前提：apps/web dev server 已启动（默认 http://localhost:4335，可用 BASE_URL 覆盖）。
//   cd apps/web && npx astro dev --port 4335
//   node scripts/e2e-smoke.mjs
//
// 驱动：playwright-core + 系统 Chrome（channel:'chrome'），移动视口 390×844。
// 断言用页面实际值互相校验（相对变化），避免脆死数；每步同时断言对应埋点事件
// 已产生（观测 = 已 POST 出去的载荷 + 本机队列 rich-sim:events:v1 的残留，两路合并），
// 末尾打印事件摘要作为可观测证据。
//
// 流量自标记：首个导航带 ?smoke=1，此后同标签页的所有事件名都加 `smoke:` 前缀
// （apps/web/src/lib/analytics.ts 的 SMOKE_PREFIX）。收集端不存任何标识符，
// 冒烟行和真人行形状完全相同；不打标的话，往生产跑一次冒烟就会污染
// 「到底有没有人来过」这个唯一信号。跑生产时必须看得到 smoke: 前缀（脚本自检）。
import pw from 'playwright-core';

const { chromium } = pw;
const BASE = process.env.BASE_URL ?? 'http://localhost:4335';
const EVENTS_KEY = 'rich-sim:events:v1';

const results = [];
const check = (ok, label, detail = '') => {
  results.push({ ok, label, detail });
};

/** 冒烟运行的事件名一律带 `smoke:` 前缀（见文件头）；比对时都走这个函数。 */
const NAME = (name) => `smoke:${name}`;
const countEvent = (list, name) => list.filter((e) => e.event === NAME(name)).length;

/** 从一段货币格式化文本里抠出第一个数字（含千分位逗号）。 */
function parseAmount(text) {
  const m = text.replace(/,/g, '').match(/\d[\d.]*\d|\d/);
  return m ? Number(m[0]) : NaN;
}

/**
 * 只留标记：去掉 <style> / <script> 块。
 *
 * 「SSR 里没有这个岛」要查的是**标记**，不是字符串——打印样式表里也会出现
 * `[data-scenario-panel]` 这类选择器（`@media print` 用它隐藏岛），而 dev 模式
 * 会把 CSS 内联进 HTML，按裸字符串查会误伤。
 */
function markupOnly(html) {
  return html.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '');
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

// 埋点观测不能依赖投递：analytics.ts 只要 sendBeacon 返回 true（= 已入队，不是已送达）
// 就把那一批裁出本机队列，而翻页时的 beacon 实测大量丢失（2026-10-07：sink 只收到
// 1 批 1 条）。所以这里在页面脚本之前挂钩 localStorage.setItem，把每一次写进队列的
// 事件累积进 sessionStorage——它跨同标签页的多次导航存活，且完全不看网络。
const CAPTURE_KEY = 'rich-sim:smoke-capture';
await page.addInitScript(
  ([queueKey, captureKey]) => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function patched(key, value) {
      if (key === queueKey) {
        try {
          const batch = JSON.parse(value);
          if (Array.isArray(batch)) {
            // 捕获桶固定写 sessionStorage（this 是被调用的那个 Storage，可能是
            // localStorage）；key 与队列不同，所以这次写入不会再进本挂钩。
            const seen = JSON.parse(sessionStorage.getItem(captureKey) || '[]');
            const ids = new Set(seen.map((e) => `${e.event}|${e.at}`));
            for (const e of batch) {
              const id = `${e.event}|${e.at}`;
              if (!ids.has(id)) {
                seen.push(e);
                ids.add(id);
              }
            }
            sessionStorage.setItem(captureKey, JSON.stringify(seen));
          }
        } catch {
          // 挂钩本身绝不影响被测页面。
        }
      }
      return orig.call(this, key, value);
    };
  },
  [EVENTS_KEY, CAPTURE_KEY],
);

// 上报出去的载荷也收着（能看见就看得见，看不见也不影响判读）。
const flushed = [];
page.on('request', (req) => {
  if (req.method() !== 'POST') return;
  let body;
  try {
    body = req.postData();
  } catch {
    return;
  }
  if (!body) return;
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed?.events)) flushed.push(...parsed.events);
  } catch {
    // 不是埋点批次，忽略。
  }
});

const identity = (e) => `${e.event}|${e.at}`;

// 导航刚结束时 evaluate 可能撞上被销毁的执行上下文，重试两次再放弃。
const readObserved = async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(
        ([key, captureKey]) => {
          const parse = (raw) => {
            try {
              const v = JSON.parse(raw || '[]');
              return Array.isArray(v) ? v : [];
            } catch {
              return [];
            }
          };
          return [
            ...parse(sessionStorage.getItem(captureKey)),
            ...parse(localStorage.getItem(key)),
          ];
        },
        [EVENTS_KEY, CAPTURE_KEY],
      );
    } catch {
      await page.waitForTimeout(150);
    }
  }
  return [];
};

// 同名同毫秒的两条会并成一条；断言全是 >= 阈值，这点损耗不影响判读。
const eventsSoFar = async () => {
  const seen = new Set();
  const merged = [];
  for (const e of [...(await readObserved()), ...flushed]) {
    const id = identity(e);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(e);
  }
  return merged;
};

try {
  // ── 步骤 0：首页 · S4 领钱入口 ──
  // 入口受 PUBLIC_HOMEPAGE_CLAIM 开关控制：没开就断言它确实不在，其余流程跳过
  // （这样同一份脚本既能跑开着的本地环境，也能跑默认关闭的生产）。
  await page.goto(`${BASE}/?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
  // 首页这一屏先钉中文：下面的断言读的是账单行的目录文案（「年运营全口径」），
  // 那是 catalog 内容，两种语言都由 CATALOG_LABELS_EN 驱动，英文状态单独验。
  check(
    await page.locator('a[href="/app/designer"]').count() === 1,
    '首页：原有主 CTA 仍在',
    '',
  );
  const claimCta = page.locator('[data-claim-cta]');
  const claimEnabled = await claimCta.count();
  if (!claimEnabled) {
    check(true, '领钱入口：开关未开时不出现（PUBLIC_HOMEPAGE_CLAIM≠1）→ 跳过该流程', 'skipped');
  } else {
    check(
      (await claimCta.count()) === 3 &&
        (await claimCta.nth(0).getAttribute('href')) === '/app/sim?claim=1&capital=100000' &&
        (await claimCta.nth(2).getAttribute('href')) === '/app/sim?claim=1&capital=10000000',
      '领钱入口：三档起始金，SSR 出来就是可用链接（关 JS 也能走）',
      `count=${await claimCta.count()}`,
    );
    await claimCta.nth(2).click();
    const coinsAppeared = await page
      .waitForSelector('[data-claim-coins] .claim-coin', { timeout: 1200 })
      .then(() => true)
      .catch(() => false);
    check(coinsAppeared, '领钱：第一拍有金币雨特效（§4 T+0.3s，P2）', '');
    await page.waitForSelector('[data-claim-route="life"]', { timeout: 3000 });
    const panel = await page.locator('section[aria-labelledby="claim-heading"]').innerText();
    check(
      panel.includes('年运营全口径') && panel.includes('$400,000'),
      '领钱：第二拍含账单口径字样与所选档位的年产出（$10M × 4% = $400,000）',
      '',
    );
    check(
      await page.locator('section[aria-labelledby="claim-heading"] a[href^="http"]').count() >= 2,
      '领钱：第二拍每个金额带来源',
      '',
    );
    const ledger = await page.evaluate(() => ({
      sim: localStorage.getItem('rich-sim:sim:v1'),
      plan: localStorage.getItem('rich-sim:plan:v1'),
    }));
    check(
      !!ledger.sim && ledger.plan === null,
      '领钱：只写模拟态账本，真实方案账本仍为空（验收 #1）',
      `sim=${!!ledger.sim} plan=${ledger.plan}`,
    );
    check(
      !!ledger.sim && JSON.parse(ledger.sim).startingCapital === 10_000_000,
      '领钱：所选 $10M 档落进模拟账本',
      `capital=${ledger.sim ? JSON.parse(ledger.sim).startingCapital : 'n/a'}`,
    );
    const evClaim = await eventsSoFar();
    const claimEvents = ['claim:tap', 'claim:reveal', 'claim:bill'].map((n) => `${n}=${countEvent(evClaim, n)}`);
    check(
      ['claim:tap', 'claim:reveal', 'claim:bill'].every((n) => countEvent(evClaim, n) >= 1),
      '埋点：claim 三步已入队',
      claimEvents.join(' '),
    );

    // 关 JS 的那条路径（?claim=1）：这一行由 SSR 渲染，不依赖本机账本。
    // 注意：上面已点过 $10M 档并落账，组件挂载后会读本机账本覆盖 URL 默认值，
    // 所以这里按 $10M 校验（顺带钉住「账本覆盖 URL 默认档」这条行为）。
    await page.goto(`${BASE}/app/sim?claim=1`, { waitUntil: 'networkidle' });
    const runway = await page.locator('[data-claim-runway]').innerText();
    check(
      runway.includes('7.6 年'),
      '领钱：$10M 撑卡 A 这套生活 ≈ 7.6 年（手算 10,000,000 ÷ 1,317,000/年）',
      `text="${runway.replace(/\n/g, ' ').trim()}"`,
    );
  }

  // ── 步骤 0.5：首页英文态（SSR 直接产出）──
  await page.goto(`${BASE}/?smoke=1&lang=en`, { waitUntil: 'networkidle' });
  const homeEn = await page.content();
  check(/<html[^>]*lang="en"/.test(homeEn), 'i18n：首页 ?lang=en 时 <html lang> 是 en', '');
  check(
    homeEn.includes('See the cost first. Then do the math.'),
    'i18n：首页英文 H1 由 SSR 渲染',
    '',
  );
  check(
    homeEn.includes('data-locale-switcher'),
    'i18n：首页语言切换器 SSR 渲染（补挂的首页入口，与 app 页同一组件）',
    '',
  );
  if (claimEnabled) {
    const claimEn = await page
      .locator('section[aria-labelledby="claim-heading"]')
      .innerText();
    check(
      claimEn.includes('Claim your first million') &&
        claimEn.includes('not your real assets') &&
        !/[一-鿿]/.test(claimEn),
      'i18n：领钱入口英文态整段无中文',
      `text=${claimEn.replace(/\n/g, ' ').slice(0, 60)}`,
    );
  }

  // 干净起点（localStorage.clear() 只清队列，不动 sessionStorage 里的冒烟标记）
  await page.goto(`${BASE}/app/designer?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  // 语言钉在中文：后面的断言用的是中文选择器与中文文案（换算条那句、阶梯目标、
  // 购物车来源标签）。有些页面是点击跳过去的、带不上 ?lang=，所以钉 Cookie
  // ——那也正是真实用户切语言时走的东西，比给每个 URL 加参数更贴近真实状态。
  await page.evaluate(() => {
    document.cookie = 'rich-sim-locale=zh; path=/; max-age=3600';
  });
  await page.reload({ waitUntil: 'networkidle' });

  // ── 步骤 1：设计器改 2 个选项，断言 sticky 年成本随之变化（再改回默认）──
  // sticky 条结构：理想生活年成本（USD）/ $101,600 / 已保存… / 选择已…
  const stickyAmount = async () => {
    const t = await page.locator('.fixed.bottom-0').innerText();
    const line = t.split('\n').map((s) => s.trim()).find((s) => /[€£¥$]/.test(s) && /\d/.test(s));
    return line ? parseAmount(line) : NaN;
  };
  const v0 = await stickyAmount();

  await page.click('text=独栋豪宅'); // living: 自有公寓 -> 独栋豪宅（更贵）
  await page.waitForTimeout(150);
  const v1 = await stickyAmount();
  check(v1 > v0, '设计器：切到更贵选项后 sticky 年成本上升', `v0=${v0} v1=${v1}`);

  await page.click('text=自有公寓'); // 改回
  await page.waitForTimeout(150);
  const v2 = await stickyAmount();
  check(v2 === v0, '设计器：改回默认后 sticky 回到原值', `v0=${v0} v2=${v2}`);

  await page.click('text=豪华车'); // transport: 家用车 -> 豪华车（更贵）
  await page.waitForTimeout(150);
  const v3 = await stickyAmount();
  check(v3 > v0, '设计器：第二个更贵选项 sticky 再次上升', `v0=${v0} v3=${v3}`);

  await page.click('text=家用车'); // 改回
  await page.waitForTimeout(150);
  const v4 = await stickyAmount();
  check(v4 === v0, '设计器：再次改回默认 sticky 复原', `v0=${v0} v4=${v4}`);

  const evDesigner = await eventsSoFar();
  check(countEvent(evDesigner, 'designer:select') >= 4, '埋点：designer:select 已入队（≥4 次点选）', `count=${countEvent(evDesigner, 'designer:select')}`);

  // 自标记自检：此刻观测到的事件名必须全部带 smoke: 前缀。少一条就是打标失效——
  // 那样每跑一次生产冒烟，都会把自己的流量混进「到底有没有真人来过」这个唯一
  // 信号里，而且没人会发现（收集端不存标识符，冒烟行与真人行形状完全相同）。
  const unmarked = evDesigner.filter((e) => !String(e.event).startsWith('smoke:'));
  check(
    evDesigner.length > 0 && unmarked.length === 0,
    '冒烟打标：观测到的事件名全部带 smoke: 前缀',
    `total=${evDesigner.length} unmarked=${unmarked.map((e) => e.event).join(',') || '(无)'}`,
  );

  // ── 步骤 1.1：键盘 Tab 走查 + prefers-reduced-motion（M4 文档「没有机器断言的两项」）──
  // 设计器是交互最密集的一页（radiogroup 单选 + sticky 换算条）。两条断言回答
  // 「键盘走不通 / reduced-motion 下交互失效」这类回归，不钉死具体元素序号以免脆。
  const a11yErrors = [];
  const onPageError = (err) => a11yErrors.push(String(err));
  page.on('pageerror', onPageError);
  try {
    // ① 第一个 Tab 必须落在 skip link（WCAG 2.4.1）。重新导航一次，回到
    //    「键盘用户新进一页」的真实状态（焦点在 body，第一个 Tab 从文档开头走）；
    //    前面步骤的点选会把焦点留在控件上，靠 blur 在 React 页面里不可靠。
    await page.goto(`${BASE}/app/designer?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    const firstFocus = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName ?? '',
        cls: typeof el?.className === 'string' ? el.className : '',
        href: el?.getAttribute?.('href') ?? '',
      };
    });
    check(
      firstFocus.tag === 'A' && firstFocus.cls.includes('skip-link'),
      '键盘走查：第一个 Tab 落在 skip link（WCAG 2.4.1）',
      `${firstFocus.tag} ${firstFocus.cls}`,
    );

    // ② Tab 循环能走到 radiogroup 里的 radio（中间被语言切换/导航/链接拦截也合法），
    //    且继续 Tab 能绕回 body / skip link——证明没有焦点陷阱。
    let reachedRadio = false;
    for (let i = 0; i < 16 && !reachedRadio; i += 1) {
      await page.keyboard.press('Tab');
      reachedRadio = await page.evaluate(() => {
        const el = document.activeElement;
        return (
          el?.getAttribute?.('role') === 'radio' ||
          (el?.tagName === 'INPUT' && el?.getAttribute?.('type') === 'radio')
        );
      });
    }
    check(reachedRadio, '键盘走查：Tab 可达设计器选项（radio 可聚焦）', '');

    let escaped = false;
    for (let i = 0; i < 30 && !escaped; i += 1) {
      await page.keyboard.press('Tab');
      escaped = await page.evaluate(() => {
        const el = document.activeElement;
        return el === document.body || el?.classList?.contains('skip-link');
      });
    }
    check(escaped, '键盘走查：连续 Tab 能回到 body / skip link（无焦点陷阱）', '');

    // ③ reduced-motion：动画关闭后交互照常工作（motion-reduce 只关动画、不关功能）。
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('text=独栋豪宅');
    await page.waitForTimeout(150);
    const vReduced = await stickyAmount();
    check(vReduced > v0, 'reduced-motion：开启后点选仍生效（sticky 金额上升）', `v0=${v0} vReduced=${vReduced}`);
    await page.click('text=自有公寓');
    await page.waitForTimeout(150);
    check(
      a11yErrors.length === 0,
      'reduced-motion：交互全程无未捕获 JS 错误',
      a11yErrors.join(' | ').slice(0, 160),
    );
  } finally {
    page.off('pageerror', onPageError);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }

  // ── 步骤 1.6：语言在 SSR 期生效（?lang=en 直接出英文界面，不是客户端改写）──
  await page.goto(`${BASE}/app/designer?smoke=1&lang=en`, { waitUntil: 'networkidle' });
  const enHtml = await page.content();
  check(/<html[^>]*lang="en"/.test(enHtml), 'i18n：?lang=en 时 <html lang> 是 en', '');
  check(enHtml.includes('Design the life you want'), 'i18n：英文 H1 由 SSR 渲染', '');
  check(
    enHtml.includes('Disclaimer') && !enHtml.includes('设计你想过的生活'),
    'i18n：英文页面的合规文本也是英文（不是中文兜过去）',
    '',
  );
  // 换算条插的是**目录项名**（core 的内容层，不是界面 chrome），而 sticky 条由岛
  // 渲染——所以只看 SSR HTML 抓不到它。这一条曾经真实红过：英文页显示
  // `"自有公寓（房贷+物业+水电）" costs $27,000 a year`。
  await page.waitForSelector('[data-converter-line]', { timeout: 5000 });
  const stickyEn = await page.locator('[data-converter-line]').innerText();
  check(
    !/[\u4e00-\u9fff]/.test(stickyEn),
    'i18n：英文设计器的换算条不夹中文项名',
    `text="${stickyEn.trim().slice(0, 70)}"`,
  );

  // 本金口径（§2.2）在没录入财务时整块不出现：那一档要收入与支出才能反解年限，
  // 留一个点开没内容的控件比没有控件更坏。
  check(
    (await page.locator('[data-converter-principal]').count()) === 0,
    '本金口径：未录入财务时不出现展开位',
    '',
  );

  // 切回中文继续——后面的断言用中文选择器与中文文案。
  await page.goto(`${BASE}/app/designer?smoke=1&lang=zh`, { waitUntil: 'networkidle' });

  // ── 步骤 1.5：换算条（S3）——未录入财务时不消失，改成 F2 引导句 ──
  const stickyText = await page.locator('[data-converter-line]').innerText();
  check(
    stickyText.includes('先填 4 个数'),
    '换算条：未录入财务时显示引导句',
    `text="${stickyText.trim()}"`,
  );
  check(
    await page.locator('[data-converter-line] a[href="/app/finance"]').count() === 1,
    '换算条：引导句带「去录入」入口',
    '',
  );
  const evConverter = await eventsSoFar();
  check(
    countEvent(evConverter, 'converter:view') >= 1,
    '埋点：converter:view 已入队',
    `count=${countEvent(evConverter, 'converter:view')}`,
  );

  // ── 步骤 2：财务录入 4 项 ──
  // 先验英文界面是 SSR 直接产出的：这一片的完成判据就是「英文页不再中英混排」，
  // 而 label 由岛渲染，所以必须看真实浏览器里的 DOM，不是只看单测。
  await page.goto(`${BASE}/app/finance?smoke=1&lang=en`, { waitUntil: 'networkidle' });
  const finEn = await page.content();
  check(/<html[^>]*lang="en"/.test(finEn), 'i18n：财务页 ?lang=en 时 <html lang> 是 en', '');
  check(
    finEn.includes('Tell us where you stand financially') &&
      finEn.includes('Monthly income') &&
      !finEn.includes('月收入'),
    'i18n：财务页英文界面不夹中文标签',
    '',
  );
  check(
    finEn.includes('never uploaded'),
    'i18n：隐私说明（数据不出本机）在英文页也在',
    '',
  );

  await page.goto(`${BASE}/app/finance?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
  await page.fill('#field-income', '15000');
  await page.fill('#field-expenseTotal', '8000');
  await page.fill('#field-savings', '100000');
  await page.fill('#field-debt', '0');
  await page.waitForTimeout(100);
  const evFinance = await eventsSoFar();
  check(countEvent(evFinance, 'finance:update') >= 1, '埋点：finance:update 已入队', `count=${countEvent(evFinance, 'finance:update')}`);

  // F2（2026-10-08）：展开「高级：拆开填」，四类求和 8000 驱动 expense + breakdown。
  await page.click('button:has-text("高级：拆开填")');
  await page.fill('#sub-housing', '3500');
  await page.fill('#sub-transport', '800');
  await page.fill('#sub-food', '2000');
  await page.fill('#sub-other', '1700');
  await page.waitForTimeout(150);
  const totalShown = await page.inputValue('#field-expenseTotal');
  const totalDisabled = await page.isDisabled('#field-expenseTotal');
  check(
    totalShown === '8000' && totalDisabled,
    'F2：四类拆分自动求和为 8000 且总额只读',
    `total=${totalShown} disabled=${totalDisabled}`,
  );
  const breakdownInDraft = await page.evaluate(() => {
    try {
      const d = JSON.parse(localStorage.getItem('rich-sim:plan:v1') ?? 'null');
      return d?.profile?.expenseBreakdown ?? null;
    } catch {
      return null;
    }
  });
  check(
    breakdownInDraft !== null &&
      breakdownInDraft.housing === 3500 &&
      breakdownInDraft.transport === 800 &&
      breakdownInDraft.food === 2000 &&
      breakdownInDraft.other === 1700 &&
      breakdownInDraft.housing + breakdownInDraft.transport + breakdownInDraft.food + breakdownInDraft.other === 8000,
    'F2：draft.profile 已写 expenseBreakdown（四项合计 8000）',
    JSON.stringify(breakdownInDraft),
  );

  // ── 步骤 3：结果页 ──
  await page.goto(`${BASE}/app/result`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-status]');
  const status = await page.locator('[data-status]').getAttribute('data-status');
  check(status === 'reachable', '结果页：三状态为 reachable', `data-status=${status}`);

  const enoughText = await page.locator('[data-results-root] .font-mono.text-4xl').innerText();
  const enoughUsd = parseAmount(enoughText);
  // 够用线 = 年成本 / 安全提取率（core enoughLine）。两个操作数都从页面上读，
  // 不再钉死数：目录内容校准会改年成本，公式没变就不该红。
  const rateText = await page.locator('dt:text-is("安全提取率") + dd').innerText();
  const withdrawalRate = Number.parseFloat(rateText) / 100;
  check(
    Number.isFinite(withdrawalRate) && withdrawalRate > 0 && Math.abs(enoughUsd - v0 / withdrawalRate) < 1,
    '结果页：够用线 = sticky 年成本 / 页面所示安全提取率',
    `enough=${enoughUsd} v0=${v0} rate=${rateText.trim()}`,
  );

  const milestoneCount = await page.locator('text=阶段 ').count();
  check(milestoneCount >= 3, '结果页：阶梯目标 ≥3 级', `count=${milestoneCount}`);

  const bodyText = await page.locator('[data-results-root]').innerText();
  check(/USD/.test(bodyText), '结果页：币种标签为 USD', `hasUSD=${/USD/.test(bodyText)}`);

  const evResult = await eventsSoFar();
  check(countEvent(evResult, 'results:view') >= 1, '埋点：results:view 已入队', `count=${countEvent(evResult, 'results:view')}`);

  // ── 步骤 3.5：换算条（S3）——年成本 ÷ 年净储蓄，纯除法、手算核对 ──
  // 分母用脚本自己填进去的 15,000 / 8,000（不读页面），分子用 sticky 的 v0。
  const annualSavings = (15_000 - 8_000) * 12;
  const expectedYears = (v0 / annualSavings).toFixed(1);
  const converterUsd = await page.locator('[data-results-root] [data-converter-line]').innerText();
  const yearsOf = (text) => text.match(/(要存|≈ 你)\s*([\d,.]+)\s*(年|个月)/)?.[2] ?? null;
  check(
    yearsOf(converterUsd) === expectedYears,
    '换算条：年数 = sticky 年成本 ÷ 年净储蓄（手算核对）',
    `shown=${yearsOf(converterUsd)} expected=${expectedYears} text="${converterUsd.trim()}"`,
  );
  check(
    !/NaN|Infinity|undefined/.test(converterUsd),
    '换算条：不出现 NaN / Infinity / undefined',
    `text="${converterUsd.trim()}"`,
  );

  // ── 步骤 3.6：可调假设（M4 · PRD §6.2「必须显式展示为可调假设」）──
  // 先验关 JS 的那一屏：编辑岛不在源码里，但提取率与免责声明必须还在。
  const ssrAssumptions = await (await page.request.get(`${BASE}/app/result?smoke=1&lang=zh`)).text();
  check(
    !markupOnly(ssrAssumptions).includes('data-assumptions-editor'),
    '可调假设：SSR 源码里没有编辑岛',
    '',
  );
  check(
    /data-assumption="withdrawalRate"[^>]*>\d+(\.\d+)?%/.test(ssrAssumptions) &&
      ssrAssumptions.includes('免责声明'),
    '可调假设：SSR 仍印出提取率与免责声明',
    '',
  );

  await page.waitForSelector('[data-assumptions-editor]', { timeout: 5000 });
  const enoughNow = async () =>
    parseAmount(await page.locator('[data-results-root] .font-mono.text-4xl').innerText());
  const ddOf = (field) => page.locator(`[data-assumption="${field}"]`).innerText();
  const inputOf = (field) => page.locator(`[data-assumption-input="${field}"]`).inputValue();
  const baselineYearsOf = async () =>
    Number((await page.locator('[data-scenario-baseline]').innerText()).match(/(\d+)/)?.[1] ?? NaN);

  const enoughDefault = await enoughNow();
  const yearsDefault = await baselineYearsOf();

  // 提取率 4% -> 2%：够用线翻倍（纯除法）；情景面板的基线属于**另一个岛**，
  // 它跟着变才证明 writeDraft 的同页广播真的接上了。
  await page.fill('[data-assumption-input="withdrawalRate"]', '2');
  await page.waitForTimeout(250);
  const enoughHalf = await enoughNow();
  const yearsAtTwo = await baselineYearsOf();
  check(
    Math.abs(enoughHalf - enoughDefault * 2) < 2,
    '可调假设：提取率减半，够用线翻倍',
    `before=${enoughDefault} after=${enoughHalf}`,
  );
  check(
    Number.isFinite(yearsDefault) && Number.isFinite(yearsAtTwo) && yearsAtTwo > yearsDefault,
    '可调假设：情景面板即时重算，年限变长',
    `${yearsDefault} -> ${yearsAtTwo}`,
  );
  check(
    (await ddOf('withdrawalRate')).trim() === '2%',
    '可调假设：合规清单同步成真正在用的 2%',
    `dd=${(await ddOf('withdrawalRate')).trim()}`,
  );

  // 刷新一次：假设必须落在本机 draft 里，且首帧就把 SSR 清单改成 2%。
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-assumptions-editor]');
  check(
    (await inputOf('withdrawalRate')) === '2' &&
      (await ddOf('withdrawalRate')).trim() === '2%' &&
      Math.abs((await enoughNow()) - enoughHalf) < 2,
    '可调假设：刷新后仍是 2%（落盘 + 首帧同步清单）',
    `input=${await inputOf('withdrawalRate')} dd=${(await ddOf('withdrawalRate')).trim()}`,
  );

  // 越界不写盘、不静默夹紧；失焦把输入拉回生效值。
  await page.fill('[data-assumption-input="withdrawalRate"]', '30');
  await page.waitForTimeout(200);
  const overAlert = await page.locator('[data-assumptions-editor] [role="alert"]').innerText();
  check(
    overAlert.includes('20'),
    '可调假设：越界报出允许区间，而不是偷偷夹紧',
    `alert=${overAlert.trim()}`,
  );
  check(
    (await ddOf('withdrawalRate')).trim() === '2%' &&
      Math.abs((await enoughNow()) - enoughHalf) < 2,
    '可调假设：非法输入不改测算、不落盘',
    `dd=${(await ddOf('withdrawalRate')).trim()}`,
  );
  await page.locator('[data-assumption-input="withdrawalRate"]').press('Tab');
  check(
    (await inputOf('withdrawalRate')) === '2',
    '可调假设：失焦把非法输入拉回生效值',
    `input=${await inputOf('withdrawalRate')}`,
  );

  // 一键回到默认；回到默认后按钮消失（否则它一直在，像个摆设）。
  await page.click('[data-assumption-reset]');
  await page.waitForTimeout(250);
  check(
    Math.abs((await enoughNow()) - enoughDefault) < 2 &&
      (await ddOf('withdrawalRate')).trim() === '4%' &&
      (await page.locator('[data-assumption-reset]').count()) === 0,
    '可调假设：恢复默认后测算与清单都回到 4%',
    `dd=${(await ddOf('withdrawalRate')).trim()}`,
  );

  const evAssumptions = await eventsSoFar();
  check(
    countEvent(evAssumptions, 'assumptions:edit') >= 1 &&
      countEvent(evAssumptions, 'assumptions:reset') >= 1,
    '埋点：assumptions:edit / assumptions:reset 已入队',
    `edit=${countEvent(evAssumptions, 'assumptions:edit')} reset=${countEvent(evAssumptions, 'assumptions:reset')}`,
  );
  // 红线：用户自己填的假设是财务数据，事件名可以走，数值不行。
  const assumptionEvents = evAssumptions.filter(
    (e) => e.event === NAME('assumptions:edit') || e.event === NAME('assumptions:reset'),
  );
  const leakedRate = assumptionEvents.find((e) => /\d/.test(JSON.stringify(e.props ?? {})));
  check(
    !leakedRate,
    '红线：假设事件只带字段名，不带任何数值',
    leakedRate ? JSON.stringify(leakedRate.props) : `n=${assumptionEvents.length}`,
  );

  // ── 步骤 3.7：本机测算历史（F6 本机版）——回访时看到的「和上次比」──
  await page.goto(`${BASE}/app/result?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-results-root]');
  // 先验关 JS 的一屏：复盘块是岛渲染的，源码里不能有它。
  const ssrProgress = await (await page.request.get(`${BASE}/app/result?smoke=1&lang=zh`)).text();
  check(
    !ssrProgress.includes('data-progress-note'),
    '测算历史：SSR 源码里没有复盘块',
    '',
  );

  // 第一次访问：只该留下一条今天的记录，而且没有可比对象。
  const histAfterFirstVisit = await page.evaluate(
    () => JSON.parse(localStorage.getItem('rich-sim:plan:v1') || '{}').history?.length ?? 0,
  );
  check(
    histAfterFirstVisit === 1,
    '测算历史：首次测算只落一条本机记录',
    `count=${histAfterFirstVisit}`,
  );
  check(
    (await page.locator('[data-progress-note]').count()) === 0,
    '测算历史：没有上一条时不编造对比',
    '',
  );

  // 反复刷新不得越刷越多：同一天覆盖当天那一条，而不是追加。
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-results-root]');
  const histAfterReload = await page.evaluate(
    () => JSON.parse(localStorage.getItem('rich-sim:plan:v1') || '{}').history?.length ?? 0,
  );
  check(
    histAfterReload === 1,
    '测算历史：同一天反复测算不增长（写盘只发生在数字真的变了时）',
    `count=${histAfterReload}`,
  );

  // 喂一条「3 天前」的记录：年限推后 5 年、净资产少 5 万——都是脚本自己写的数，
  // 所以断言看得见「读的是本机历史、算的是差值」，而不是碰巧渲染了什么。
  const yearsNow = Number(
    (await page.locator('[data-status]').innerText()).match(/约\s*(\d+)\s*年/)?.[1] ?? NaN,
  );
  check(Number.isFinite(yearsNow), '测算历史：先从状态卡读到当前年限', `years=${yearsNow}`);

  const seedHistory = (entries) =>
    page.evaluate((raw) => {
      const draft = JSON.parse(localStorage.getItem('rich-sim:plan:v1') || '{}');
      draft.history = raw;
      localStorage.setItem('rich-sim:plan:v1', JSON.stringify(draft));
    }, entries);

  await seedHistory([
    {
      at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      currency: 'USD',
      status: 'reachable',
      years: yearsNow + 5,
      annualCost: 101_600,
      enoughLine: 2_540_000,
      netWorth: 50_000,
    },
  ]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-progress-note]', { timeout: 5000 });

  const yearsLine = await page.locator('[data-progress-years]').innerText();
  check(
    yearsLine.includes(String(yearsNow + 5)) && yearsLine.includes(String(yearsNow)) && yearsLine.includes('提前 5 年'),
    '复盘：上一条年限更大时，报「提前 5 年」',
    `text="${yearsLine.trim()}"`,
  );
  const netLine = await page.locator('[data-progress-net]').innerText();
  check(
    netLine.includes('净资产') && netLine.includes('50,000'),
    '复盘：同币种时给出净资产差值',
    `text="${netLine.trim()}"`,
  );
  const progressNote = await page.locator('[data-progress-note]').innerText();
  check(
    /相隔 \d+ 天/.test(progressNote) && progressNote.includes('2026-'),
    '复盘：说清两次测算的日期与间隔',
    `text="${progressNote.replace(/\s+/g, ' ').trim().slice(0, 80)}"`,
  );
  check(
    progressNote.includes('不是预测') && progressNote.includes('不构成建议'),
    '复盘：合规措辞跟着走（这不是预测，也不是建议）',
    '',
  );

  // 跨币种：金额不放在一起比，但年限仍然可比（递推的齐次性）。
  await seedHistory([
    {
      at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      currency: 'CNY',
      status: 'reachable',
      years: yearsNow + 5,
      annualCost: 723_392,
      enoughLine: 18_084_800,
      netWorth: 356_000,
    },
  ]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-progress-note]');
  check(
    (await page.locator('[data-progress-net]').count()) === 0,
    '复盘：跨币种时不给金额差（不同单位相减没有意义）',
    '',
  );
  check(
    (await page.locator('[data-progress-currency-note]').count()) === 1 &&
      (await page.locator('[data-progress-years]').count()) === 1,
    '复盘：跨币种改成明说「不放在一起比」，年限仍然比',
    '',
  );

  // 状态跨档：三状态是一等状态，复盘要说状态而不是年限。
  await seedHistory([
    {
      at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      currency: 'USD',
      status: 'no-net-savings',
      years: null,
      annualCost: 101_600,
      enoughLine: 2_540_000,
      netWorth: 50_000,
    },
  ]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-progress-status]');
  const statusLine = await page.locator('[data-progress-status]').innerText();
  check(
    statusLine.includes('无净储蓄') && statusLine.includes('可达'),
    '复盘：状态跨档说状态（复用三状态的词典，不另造说法）',
    `text="${statusLine.trim()}"`,
  );

  const evProgress = await eventsSoFar();
  check(
    countEvent(evProgress, 'progress:view') >= 1,
    '埋点：progress:view 已入队（回访且手里有上一条时才算一次）',
    `count=${countEvent(evProgress, 'progress:view')}`,
  );
  const progressWithValues = (await eventsSoFar()).find(
    (e) => e.event === NAME('progress:view') && /\d/.test(JSON.stringify(e.props ?? {})),
  );
  check(
    !progressWithValues,
    '红线：progress:view 一个 props 都不带',
    progressWithValues ? JSON.stringify(progressWithValues.props) : '',
  );

  // 英文态同一块。eyebrow 有 CSS uppercase，innerText 拿到的是渲染后的大写形，
  // 所以按小写比对——按原样字符串比会红在一个纯样式决定上。
  // 此时手里那条是「无净储蓄」的记录，所以这块说的是状态而不是年限。
  await page.goto(`${BASE}/app/result?smoke=1&lang=en`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-progress-note]');
  const progressEn = await page.locator('[data-progress-note]').innerText();
  const progressEnLower = progressEn.toLowerCase();
  check(
    progressEnLower.includes('versus your last calculation') &&
      /days apart/.test(progressEn) &&
      progressEnLower.includes('no net savings') &&
      progressEnLower.includes('forecasts nothing') &&
      !/[\u4e00-\u9fff]/.test(progressEn),
    'i18n：复盘块英文态不夹中文（含复用的三状态词）',
    `text="${progressEn.replace(/\s+/g, ' ').trim().slice(0, 90)}"`,
  );

  // 留两条记录给后面的步骤：390 宽要带着这一块量一次不溢出（步骤 10 那条）。
  await seedHistory([
    {
      at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      currency: 'USD',
      status: 'reachable',
      years: yearsNow + 5,
      annualCost: 101_600,
      enoughLine: 2_540_000,
      netWorth: 50_000,
    },
  ]);

  // F9（本机版）· 多剧本存档：存一个 → 列表出现 → 载入 → 删除，
  // 顺带钉住三件事——SSR 源码里没有这个岛、同名覆盖不翻倍、事件零 props。
  // 注意不能查 'data-saved-plans' 本身：print 隐藏清单里有同名 CSS 选择器，
  // dev 模式样式内联，会躺在 SSR <style> 里造成误伤——查组件专属的内部 id。
  const ssrPlans = await (await fetch(`${BASE}/app/result?lang=zh`)).text();
  check(!ssrPlans.includes('saved-plans-heading'), '剧本存档：SSR 源码无存档岛（纯客户端渲染）', '');
  await page.goto(`${BASE}/app/result?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-saved-plans]');
  await page.fill('[data-plan-name]', '基准');
  await page.click('[data-plan-save]');
  await page.waitForSelector('[data-plan-item]');
  check(
    (await page.locator('[data-plan-item]').count()) === 1,
    '剧本存档：存一个后列表出现一条',
    '',
  );
  await page.fill('[data-plan-name]', '基准');
  await page.click('[data-plan-save]');
  check(
    (await page.locator('[data-plan-item]').count()) === 1,
    '剧本存档：同名覆盖，不翻倍',
    '',
  );
  await page.click('[data-plan-load]');
  const loadNotice = await page.locator('[data-plan-notice]').innerText();
  check(loadNotice.includes('已载入'), '剧本存档：载入后有明示', `notice="${loadNotice}"`);
  const evPlans = await eventsSoFar();
  check(
    ['plan:save', 'plan:load'].every((n) => countEvent(evPlans, n) >= 1),
    '埋点：plan:save / plan:load 已入队',
    ['plan:save', 'plan:load'].map((n) => `${n}=${countEvent(evPlans, n)}`).join(' '),
  );
  const planEventsWithProps = evPlans.find(
    (e) => /^.*plan:(save|load|delete)$/.test(e.event) && Object.keys(e.props ?? {}).length > 0,
  );
  check(
    !planEventsWithProps,
    '红线：plan:* 事件零 props（剧本名不出本机）',
    planEventsWithProps ? JSON.stringify(planEventsWithProps.props) : '',
  );
  await page.click('[data-plan-delete]');
  check(
    (await page.locator('[data-plan-item]').count()) === 0,
    '剧本存档：删除后列表清空',
    '',
  );

  // M5 S1 · Auth：dev 挂了 .env（模拟已配置）→ 登录按钮要出现；
  // 面板开合、坏邮箱提示、事件不发（没真登录就没有 auth:login）。
  // 「未配置时全站零渲染」由 SSR 源文本断言钉住（构建期无 env 时的形态）。
  await page.goto(`${BASE}/app/finance?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-auth-open]', { timeout: 5000 });
  check(true, 'Auth：已配置 Supabase 时登录按钮出现', '');
  const ssrFinance = await (await fetch(`${BASE}/app/finance?lang=zh`)).text();
  check(!ssrFinance.includes('data-auth-open'), 'Auth：SSR 源码无登录岛（纯客户端渲染）', '');
  await page.click('[data-auth-open]');
  await page.waitForSelector('[data-auth-panel]');
  await page.fill('[data-auth-email-input]', 'not-an-email');
  await page.click('[data-auth-send]');
  const authNotice = await page.locator('[data-auth-notice]').innerText();
  check(
    authNotice.includes('邮箱格式'),
    'Auth：坏邮箱被前端拦下，不发请求',
    `notice="${authNotice}"`,
  );
  // 合法邮箱 + 短密码：前端拦截，不发请求（密码模式，2026-10-09 起）。
  await page.fill('[data-auth-email-input]', 'smoke@example.com');
  await page.fill('[data-auth-password-input]', '123');
  await page.click('[data-auth-send]');
  const pwNotice = await page.locator('[data-auth-notice]').innerText();
  check(pwNotice.includes('至少 6 位'), 'Auth：短密码被前端拦下，不发请求', `notice="${pwNotice}"`);
  const evAuth = await eventsSoFar();
  check(
    countEvent(evAuth, 'auth:login') === 0,
    'Auth：未完成登录前没有 auth:login 事件',
    `count=${countEvent(evAuth, 'auth:login')}`,
  );

  // M5-G3 · 隐私政策：纯 SSR（关 JS 也能读全）、双语、页脚可达。
  const ssrPrivacyZh = await (await fetch(`${BASE}/privacy?lang=zh`)).text();
  check(
    ssrPrivacyZh.includes('你的财务数据，默认不出这台设备') && ssrPrivacyZh.includes('localStorage'),
    '隐私政策：中文 SSR 含本机存储承诺',
    '',
  );
  // 扫描前剥掉 HTML 注释与 <head>：仓库的工程注释是中文的，那不叫夹中文；
  // 这条盯的是正文文本。
  const ssrPrivacyEnRaw = await (await fetch(`${BASE}/privacy?lang=en`)).text();
  const ssrPrivacyEn = ssrPrivacyEnRaw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[\s\S]*<body[^>]*>/, '')
    .replace(/财富模拟|跳到主要内容/g, '');
  check(
    ssrPrivacyEn.includes('stays on this device by default') && !/[\u4e00-\u9fff]/.test(ssrPrivacyEn),
    '隐私政策：英文 SSR 正文不夹中文',
    '',
  );
  const ssrHome = await (await fetch(`${BASE}/?lang=zh`)).text();
  check(ssrHome.includes('href="/privacy"'), '隐私政策：页脚链接在各页可达', '');

  // ── 步骤 4：切币种 USD -> CNY（切换器在设计器页）──
  await page.goto(`${BASE}/app/designer?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
  await page.selectOption('#display-currency', 'CNY');
  await page.waitForSelector('#display-currency:not([disabled])');
  await page.waitForTimeout(300);
  const curVal = await page.locator('#display-currency').inputValue();
  check(curVal === 'CNY', '切币种：选择器值变为 CNY', `value=${curVal}`);

  const breakdownAfterSwitch = await page.evaluate(() => {
    try {
      const d = JSON.parse(localStorage.getItem('rich-sim:plan:v1') ?? 'null');
      return d?.profile?.expenseBreakdown ?? null;
    } catch {
      return null;
    }
  });
  check(
    breakdownAfterSwitch !== null &&
      breakdownAfterSwitch.housing > 0 &&
      breakdownAfterSwitch.transport > 0 &&
      breakdownAfterSwitch.food > 0 &&
      breakdownAfterSwitch.other > 0,
    'F2：切币种后 expenseBreakdown 逐项保留（未降级成单个数）',
    JSON.stringify(breakdownAfterSwitch),
  );

  const evSwitch = await eventsSoFar();
  check(countEvent(evSwitch, 'currency:switch') >= 1, '埋点：currency:switch 已入队', `count=${countEvent(evSwitch, 'currency:switch')}`);

  // mount 首帧 profile 恒为 null，上报要等本机方案恢复完——否则已录入财务的人
  // 回访设计器会被记成 no-profile（漏斗上就是「有 profile 的人看不到换算条」）。
  const idxFinance = evSwitch.findIndex((e) => e.event === NAME('finance:update'));
  const converterAfterFinance = evSwitch
    .slice(idxFinance + 1)
    .filter((e) => e.event === NAME('converter:view'));
  check(
    converterAfterFinance.length >= 1 &&
      converterAfterFinance.every((e) => e.props?.status !== 'no-profile'),
    '换算条：录入财务后不再误报 no-profile',
    `statuses=${converterAfterFinance.map((e) => e.props?.status).join(',') || '(无)'} financeIdx=${idxFinance}`,
  );

  // ── 步骤 4.5：本金口径（§2.2，可展开）──
  // 这一步在设计器页做：切完币种之后，金额已经是 CNY 口径，正好同时验币种通路。
  await page.waitForSelector('[data-converter-principal]', { timeout: 5000 });

  // 默认折叠是文档写死的形态（§2.2「默认折叠」），而且折叠时那句本金不该被读到。
  const collapsed = await page.evaluate(
    () => document.querySelector('[data-converter-principal]')?.open ?? null,
  );
  check(collapsed === false, '本金口径：默认折叠', `open=${String(collapsed)}`);

  // 两个操作数从页面不同位置读，彼此核对，不吃实现输出：
  //   本金（data 属性） ?= 年成本（同一行 data 属性）÷ 提取率（合规清单那一行）
  const framing = await page.evaluate(() => {
    const el = document.querySelector('[data-converter-principal]');
    const rateText = document.querySelector('[data-assumption="withdrawalRate"]')?.textContent ?? '';
    return {
      annualCost: Number(el?.getAttribute('data-annual-cost')),
      principal: Number(el?.getAttribute('data-principal')),
      rateText: rateText.trim(),
    };
  });
  const rateFromPage = Number.parseFloat(framing.rateText) / 100;
  check(
    Number.isFinite(framing.principal) &&
      Number.isFinite(framing.annualCost) &&
      rateFromPage > 0 &&
      Math.abs(framing.principal - framing.annualCost / rateFromPage) < 1,
    '本金口径：本金 = 页上所示年成本 ÷ 页上所示提取率',
    `principal=${framing.principal} cost=${framing.annualCost} rate=${framing.rateText}`,
  );

  // 轻量口径那行与本金口径必须是**同一笔钱**（否则一屏两句各说各话）。
  const lightCost = parseAmount(await page.locator('[data-converter-line]').innerText());
  check(
    Math.abs(lightCost - framing.annualCost) < 1,
    '本金口径：展开位与换算条说的是同一个对象',
    `light=${lightCost} framing=${framing.annualCost}`,
  );

  // 展开：句子里要出现本金那个数字（千分位形式），并且 converter:expand 只报一次。
  //
  // 先在测试里按住 Astro 的 dev toolbar：它在 dev 模式浮在视口底部，正好盖住
  // sticky 条里的 <summary>，playwright 的真点击会一直等可点击性而超时
  // （`<astro-dev-toolbar> intercepts pointer events`）。生产构建没有这个工具条，
  // 所以这不是产品缺陷，而是只在 dev 冒烟里存在的遮挡——去掉它之后仍然走真点击，
  // 不降级成 JS 派发，否则这一条就再也证明不了「用户点得动」。
  await page.addStyleTag({ content: 'astro-dev-toolbar{display:none !important}' });
  await page.click('[data-converter-principal] summary');
  await page.waitForTimeout(200);
  const principalText = await page.locator('[data-converter-principal]').innerText();
  // 比的是**页上渲染出来的那位数**：data 属性存原始浮点，展示按 maximumFractionDigits: 0
  // 取整，直接 toLocaleString 会把小数位一起带进比对（第一次红就是这么来的）。
  check(
    principalText.includes(Math.round(framing.principal).toLocaleString('en-US')) &&
      principalText.includes('÷') &&
      principalText.includes(framing.rateText),
    '本金口径：展开后把除法本身写进句子里',
    `text="${principalText.replace(/\s+/g, ' ').trim().slice(0, 90)}"`,
  );

  await page.click('[data-converter-principal] summary');
  await page.waitForTimeout(150);
  await page.click('[data-converter-principal] summary');
  await page.waitForTimeout(200);
  const evExpand = await eventsSoFar();
  check(
    countEvent(evExpand, 'converter:expand') === 1,
    '埋点：converter:expand 一条访问只报一次（反复折叠不刷屏）',
    `count=${countEvent(evExpand, 'converter:expand')}`,
  );

  // 展开后 390 宽仍不得横向溢出（这一段句子最长）。
  const principalOverflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  check(
    principalOverflow.scrollWidth <= principalOverflow.innerWidth + 1,
    '本金口径：展开态在 390 宽不横向溢出',
    `scrollWidth=${principalOverflow.scrollWidth} innerWidth=${principalOverflow.innerWidth}`,
  );

  // ── 步骤 5：复看结果页，金额随新币种（约 1800 万量级 CNY）──
  await page.goto(`${BASE}/app/result`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-status]');
  const enoughTextCny = await page.locator('[data-results-root] .font-mono.text-4xl').innerText();
  const enoughCny = parseAmount(enoughTextCny);
  check(enoughCny > 15_000_000 && enoughCny < 22_000_000, '切币种后：够用线换算到 CNY（约 1800 万量级）', `enoughCny=${enoughCny} text="${enoughTextCny.trim()}"`);
  const bodyCny = await page.locator('[data-results-root]').innerText();
  check(/CNY/.test(bodyCny), '切币种后：结果页币种标签为 CNY', `hasCNY=${/CNY/.test(bodyCny)}`);

  // ── 步骤 5.3：目标口径切换（T0-3 · 进契约的方案 A）──
  // 默认够用线；切「目标净资产」→ 输入框出现 → 填 5,000,000 提交 →
  // 主数字换成目标净资产、draft.goal 落盘、状态句改说「目标净资产」；
  // 切回够用线 → 主数字复原、goal 清除。净资产目标本身是用户自填假设，
  // 只是把 project/gap/milestones 的目标换掉，符合「只对自填假设做算术」红线。
  const goalMode = page.locator('[data-goal-mode]');
  await page.waitForSelector('[data-goal-mode]');
  check(
    (await goalMode.locator('[data-goal-mode-option="enough-line"]').getAttribute('aria-checked')) === 'true',
    '目标口径：默认选中够用线',
    '',
  );
  await goalMode.locator('[data-goal-mode-option="net-worth"]').click();
  await page.waitForSelector('[data-goal-mode] [data-goal-networth] input');
  await goalMode.locator('[data-goal-networth] input').fill('5000000');
  await goalMode.locator('[data-goal-networth] input').press('Enter');
  await page.waitForTimeout(200);
  const netWorthText = await page.locator('[data-results-root] .font-mono.text-4xl').innerText();
  const netWorthCny = parseAmount(netWorthText);
  check(
    netWorthCny === 5_000_000,
    '目标口径：净资产目标成为主数字（¥5,000,000）',
    `netWorth=${netWorthCny} text="${netWorthText.trim()}"`,
  );
  const goalLedger = await page.evaluate(() => JSON.parse(localStorage.getItem('rich-sim:plan:v1') || 'null'));
  check(
    goalLedger?.goal?.kind === 'net-worth' && goalLedger.goal.value === 5_000_000,
    '目标口径：goal 落进本机方案（契约可选字段，schemaVersion 仍为 1）',
    JSON.stringify(goalLedger?.goal),
  );
  const bodyNetWorth = await page.locator('[data-results-root]').innerText();
  check(
    bodyNetWorth.includes('目标净资产'),
    '目标口径：状态/正文按「目标净资产」表述',
    '',
  );
  await goalMode.locator('[data-goal-mode-option="enough-line"]').click();
  await page.waitForTimeout(200);
  const enoughBack = parseAmount(await page.locator('[data-results-root] .font-mono.text-4xl').innerText());
  check(
    enoughBack === enoughCny,
    '目标口径：切回够用线后主数字复原',
    `before=${enoughCny} after=${enoughBack}`,
  );
  const goalCleared = await page.evaluate(() => JSON.parse(localStorage.getItem('rich-sim:plan:v1') || 'null'));
  check(
    !goalCleared?.goal,
    '目标口径：切回够用线后 goal 显式清除（不是残留）',
    '',
  );

  // ── 步骤 5.5：换算条切币种——年数必须不动，金额必须动（§7.3）──
  // 这一条是分子换算的活体探针：漏了 convert()，年数会随币种漂移。
  const converterCny = await page.locator('[data-results-root] [data-converter-line]').innerText();
  check(
    yearsOf(converterCny) === yearsOf(converterUsd),
    '换算条：切币种后年数不变',
    `usd=${yearsOf(converterUsd)} cny=${yearsOf(converterCny)} text="${converterCny.trim()}"`,
  );
  const moneyOf = (text) => text.match(/一年\s*[^\d]+([\d,.]+)/)?.[1] ?? null;
  check(
    moneyOf(converterCny) !== moneyOf(converterUsd),
    '换算条：切币种后金额随币种变',
    `usd=${moneyOf(converterUsd)} cny=${moneyOf(converterCny)}`,
  );

  // ── 步骤 5.6：结果页整页切英文（三状态、差距、阶梯目标都走词典）──
  // 断言用「结果区里查不到一个汉字」这种形式：它同时覆盖漏译、硬编码残留
  // 和 core 那句 action 混进来，而逐条文案对不对另有单测与词典测试。
  await page.evaluate(() => {
    document.cookie = 'rich-sim-locale=en; path=/; max-age=3600';
  });
  await page.goto(`${BASE}/app/result?smoke=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-status]');
  const enResults = await page.locator('[data-results-root]').innerText();
  check(
    /Enough line \(target capital\)/.test(enResults),
    'i18n：结果页英文标题与够用线标签',
    `text=${enResults.replace(/\n/g, ' ').slice(0, 60)}`,
  );
  check(
    /Staged goals/.test(enResults) && /Stage 1/.test(enResults),
    'i18n：阶梯目标走英文词典',
    '',
  );
  check(
    !/[一-鿿]/.test(enResults),
    'i18n：英文结果页里查不到一个汉字',
    `matched=${(enResults.match(/[一-鿿]+/g) || []).slice(0, 3).join(',')}`,
  );
  await page.evaluate(() => {
    document.cookie = 'rich-sim-locale=zh; path=/; max-age=3600';
  });

  // ── 步骤 6：富豪模拟卡 A（F5 最小版，纯 SSR 页）──
  await page.goto(`${BASE}/app/sim`, { waitUntil: 'networkidle' });
  const simText = await page.locator('#main').innerText();
  check(simText.includes('1,317,000'), '卡 A：年持有成本合计 = $1,317,000', '来自六项 catalog 求和');
  check(simText.includes('虚构角色，不代表任何真实人物'), '卡 A：虚构角色标注可见', '');
  const simSourceLinks = await page.locator('a[href^="https://"][rel="noopener"]').count();
  check(simSourceLinks >= 6, '卡 A：六项来源链接可达', `links=${simSourceLinks}`);

  // ── 步骤 7：账单日（S2）——基态黄 / 加游艇红 + 强制变卖提示 ──
  const baseSim = await page.locator('#main').innerText();
  check(baseSim.includes('紧张') && baseSim.includes('负担率 78%'), '账单日：基态黄（负担率 78%）', '示意现金流 $1,683,000');
  await page.goto(`${BASE}/app/sim?yacht=1`, { waitUntil: 'networkidle' });
  const redSim = await page.locator('#main').innerText();
  check(redSim.includes('断裂预警') && redSim.includes('负担率 399%'), '账单日：加游艇后断裂预警（负担率 399%）', '');
  check(redSim.includes('$4,050,000'), '账单日：变卖回笼 = 原价 75% = $4,050,000', 'superyacht 5,400,000 × 0.75');
  check(redSim.includes('第 2 页'), '账单日：一页 4 张，出现第 2 页', '');

  // ── 步骤 7.5：卡 A 页英文态（SSR 直接产出；购物区尚未迁移，所以不断言整页无中文）──
  await page.goto(`${BASE}/app/sim?smoke=1&lang=en`, { waitUntil: 'networkidle' });
  const simEn = await page.locator('#main').innerText();
  check(
    simEn.includes('Tech unicorn founder') &&
      simEn.includes('What it costs to hold for a year') &&
      simEn.includes('Bill day'),
    'i18n：卡 A 页标题与分区走英文词典',
    `text=${simEn.replace(/\n/g, ' ').slice(0, 50)}`,
  );
  check(
    simEn.includes('Stretched') &&
      simEn.includes('burden rate 78%') &&
      simEn.includes('A fictional character'),
    'i18n：负担率横幅与虚构标注在英文页也在',
    `fictional=${simEn.includes('A fictional character')}`,
  );

  // ── 步骤 7.6：购物区英文态（costComponents 仍是目录里的中文说明，所以不断言整块无中文）──
  await page.goto(`${BASE}/app/sim?smoke=1&lang=en`, { waitUntil: 'networkidle' });
  const shopEn = await page.locator('[data-shopping-area]').innerText();
  check(
    shopEn.includes('The Wealth Mall') &&
      shopEn.includes('Add to cart') &&
      shopEn.includes('All') &&
      shopEn.includes('Goods') &&
      shopEn.includes('Experiences'),
    'i18n：商城英文态（标题、tab、加购按钮）',
    `text=${shopEn.replace(/\n/g, ' ').slice(0, 50)}`,
  );
  // 预览与 CTA 在抽屉里：开抽屉再断言。
  await page.click('[data-mall-cart-open]');
  await page.waitForSelector('[data-mall-drawer]', { timeout: 5000 });
  const drawerEn = await page.locator('[data-mall-drawer]').innerText();
  check(
    drawerEn.includes('Next bill preview') && drawerEn.includes('Stretched'),
    'i18n：购物车预览与负担率横幅走英文词典',
    '',
  );
  check(
    drawerEn.includes('Checkout - see bill day'),
    'i18n：抽屉结算按钮英文',
    '',
  );
  await page.keyboard.press('Escape');

  // ── 步骤 7.8：三通道（经历·快进 / 感受·黑天鹅 / 地位·特权价目）──
  // 卡 A 基态：收入 $3M、年成本 $1,317,000 → 30 年累计结余 (3,000,000−1,317,000)×30 = $50,490,000。
  const lifeText = await page.locator('[data-sim-life]').innerText();
  check(
    lifeText.includes('$50,490,000'),
    '快进 30 年：卡 A 累计结余 $50,490,000（手算核对）',
    lifeText.replace(/\s+/g, ' ').trim().slice(0, 160),
  );
  // 黑天鹅：卡 A 收入腰斩 → 现金流 1.5M − 1.317M = 183k，负担率 1.317M/183k ≈ 720% → 红。
  const swanText = await page.locator('[data-sim-swan]').innerText();
  check(
    swanText.includes('720%') && swanText.includes('78%'),
    '黑天鹅：卡 A 负担率 78% → 720% 断裂（手算核对）',
    swanText.replace(/\s+/g, ' ').trim().slice(0, 160),
  );
  const privText = await page.locator('[data-sim-priv]').innerText();
  check(
    privText.includes('$189,500') && privText.includes('$100,000') && privText.includes('Source'),
    '特权价目：两项带来源金额呈现',
    '',
  );

  // ── 步骤 7.7：卡 B（老钱继承人）——?card=card-b 切卡、年成本与绿区负担率、切换器 ──
  await page.goto(`${BASE}/app/sim?card=card-b&lang=zh`, { waitUntil: 'networkidle' });
  const cardBText = await page.locator('main').innerText();
  check(
    cardBText.includes('家族企业继承人') && cardBText.includes('$407,000'),
    '卡 B：标题与年成本 $407,000',
    '',
  );
  // 负担率 = 407,000 ÷ (8,000,000 − 407,000) ≈ 5.4% → 绿区「可负担」，与卡 A 的 78% 黄区同口径对照。
  check(
    cardBText.includes('可负担') && cardBText.includes('负担率 5%'),
    '卡 B：负担率 ≈5% 绿区（vs 卡 A 78% 黄区，同一 4% 口径的对照课）',
    '',
  );
  const activeCardLink = page.locator('nav[aria-label*="身份卡"] a[aria-current="page"], nav[aria-label*="persona"] a[aria-current="page"]');
  check(
    (await activeCardLink.count()) === 1 && (await activeCardLink.innerText()).includes('家族企业继承人'),
    '卡 B：切换器存在且当前卡高亮',
    '',
  );
  check(!cardBText.includes('加一艘超级游艇'), '卡 B：无游艇断裂开关（老钱刻意不持有）', '');
  // 切回卡 A：切换器链接生效
  await page.goto(`${BASE}/app/sim?lang=zh`, { waitUntil: 'networkidle' });
  const cardAText = await page.locator('main').innerText();
  check(cardAText.includes('科技独角兽创始人') && cardAText.includes('紧张'), '切回卡 A：默认卡与黄区负担率不变', '');

  // ── 步骤 8：购物区（M3 S2/S3）——加购 → 预览变色 → 移出 ──
  await page.goto(`${BASE}/app/sim`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-shopping-area]', { timeout: 5000 });
  await page.waitForSelector('[data-cart-count]', { timeout: 5000 });

  const cartCount = async () => Number((await page.locator('[data-cart-count]').innerText()).trim());
  const cartAdded = async () => (await page.locator('[data-cart-added]').innerText()).trim();
  // 该节点带 aria-live，点击后被 React 替换；直接 getAttribute 在重渲染窗口里
  // 偶发拿到旧节点（outerHTML 有序列化值但属性读取为 null）。改为轮询 outerHTML，
  // 从序列化结果里解析属性，读到与横幅 class 一致的稳定值。
  const cartStatus = async () => {
    for (let i = 0; i < 20; i += 1) {
      const html = await page
        .locator('[data-shopping-area] [data-cart-status]')
        .evaluate((el) => el.outerHTML, undefined, { timeout: 1500 })
        .catch(() => '');
      const m = html.match(/data-cart-status="([a-z]+)"/);
      if (m) return m[1];
      await page.waitForTimeout(100);
    }
    return null;
  };

  check(await cartCount() === 0, '购物区：首帧空车', `count=${await cartCount()}`);

  const galaCard = page.locator('[data-shopping-area] li', { hasText: 'Met Gala 慈善晚宴单张门票' }).first();
  await galaCard.getByRole('button', { name: '加入购物车' }).click();
  await page.waitForTimeout(200);
  check(await cartCount() === 1, '购物区：加购后件数 = 1', `count=${await cartCount()}`);
  check(
    (await cartAdded()).includes('100,000'),
    '购物区：新增年成本 = $100,000（体验项）',
    `added=${await cartAdded()}`,
  );
  check(
    await galaCard.getByRole('button', { name: '移出购物车' }).count() === 1,
    '购物区：按钮切换为移出（幂等态）',
    '',
  );

  // 重复点击同一项不叠加（幂等）。
  await galaCard.getByRole('button', { name: '移出购物车' }).click();
  await galaCard.getByRole('button', { name: '加入购物车' }).click();
  await page.waitForTimeout(150);
  check(await cartCount() === 1, '购物区：同一项反复切换不叠加', `count=${await cartCount()}`);

  const yachtCard = page.locator('[data-shopping-area] li', { hasText: '超级游艇' }).first();
  await yachtCard.getByRole('button', { name: '加入购物车' }).click();
  await page.waitForTimeout(200);
  check(await cartCount() === 2, '购物区：加购游艇后件数 = 2（同维多件允许）', `count=${await cartCount()}`);
  check(
    (await cartAdded()).includes('5,500,000'),
    '购物区：新增年成本 = 游艇 5,400,000 + 晚宴 100,000',
    `added=${await cartAdded()}`,
  );
  // 负担率横幅与变卖提示已迁入购物车抽屉：开抽屉再断言，抽屉保持开到步骤 9。
  await page.click('[data-mall-cart-open]');
  await page.waitForSelector('[data-mall-drawer]', { timeout: 5000 });
  check(await cartStatus() === 'red', '购物即记账：下一期负担率变红', `status=${await cartStatus()}`);

  const evShop = await eventsSoFar();
  check(
    countEvent(evShop, 'sim:add') >= 2 && countEvent(evShop, 'sim:remove') >= 1,
    '埋点：sim:add / sim:remove 已入队',
    `add=${countEvent(evShop, 'sim:add')} remove=${countEvent(evShop, 'sim:remove')}`,
  );

  // 红区变卖引导出现（最贵资产 75% 折价口径）。
  const shopText = await page.locator('[data-shopping-area]').innerText();
  check(shopText.includes('4,050,000'), '购物即记账：红区给出游艇 75% 折价回笼 $4,050,000', '');

  // 移出游艇 → 回到黄、新增回落。抽屉开着，走抽屉里的移出按钮。
  await page
    .locator('[data-mall-drawer] li', { hasText: '超级游艇' })
    .first()
    .getByRole('button', { name: '移出购物车' })
    .click();
  await page.waitForTimeout(200);
  check((await cartAdded()).includes('100,000'), '购物区：移出游艇后新增回落到 $100,000', `added=${await cartAdded()}`);
  check(await cartStatus() === 'yellow', '购物即记账：移出后回到黄色', `status=${await cartStatus()}`);

  // ── 步骤 9：一键成目标（M3 S4 · SIM→REAL 单向桥）──
  const ledgersBefore = await page.evaluate(() => ({
    sim: localStorage.getItem('rich-sim:sim:v1'),
    plan: localStorage.getItem('rich-sim:plan:v1'),
  }));
  await Promise.all([
    page.waitForURL('**/app/result', { timeout: 5000 }),
    page.locator('[data-adopt-goal]').click(),
  ]);
  await page.waitForLoadState('networkidle');
  check(page.url().includes('/app/result'), '桥：点击后跳到结果页（前面已录入财务）', page.url());
  await page.waitForSelector('[data-goal-source]', { timeout: 5000 });
  const goalSource = await page.locator('[data-goal-source]').innerText();
  check(
    goalSource.includes('目标来自富豪模拟购物车'),
    '桥：结果页显示目标来源标签',
    goalSource.replace(/\s+/g, ' ').trim(),
  );
  const ledgersAfter = await page.evaluate(() => ({
    sim: localStorage.getItem('rich-sim:sim:v1'),
    plan: JSON.parse(localStorage.getItem('rich-sim:plan:v1') || 'null'),
  }));
  check(
    ledgersAfter.sim === ledgersBefore.sim,
    '桥：sim 账本原样不动（单向）',
    `simBefore=${ledgersBefore.sim !== null} simAfter=${ledgersAfter.sim !== null}`,
  );
  check(
    ledgersAfter.plan?.goalOverride?.from === 'sim-cart' &&
      Number.isFinite(ledgersAfter.plan?.goalOverride?.annualCost) &&
      JSON.stringify(ledgersAfter.plan).includes('sim-cart') &&
      !JSON.stringify(ledgersAfter.plan).includes('startingCapital'),
    '桥：REAL 只拿到 goalOverride 年成本，无起始金/资产占比',
    JSON.stringify(ledgersAfter.plan?.goalOverride),
  );

  const evGoal = await eventsSoFar();
  check(countEvent(evGoal, 'cart:to-goal') >= 1, '埋点：cart:to-goal 已入队', `count=${countEvent(evGoal, 'cart:to-goal')}`);

  // ── 步骤 8.6：商城扩展（详情卡 / 收藏夹 / 年度账单环形图）──
  await page.goto(`${BASE}/app/sim?smoke=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-shopping-area]', { timeout: 5000 });
  // 干净起手：放一个只领过起始金、空车空收藏的 sim 账本（无账本时收藏是会话态，
  // 与购物车同一纪律，这里要验证的是「有账本时持久化」）。
  await page.evaluate(() => {
    const now = new Date().toISOString();
    localStorage.setItem(
      'rich-sim:sim:v1',
      JSON.stringify({ schemaVersion: 1, startingCapital: 1_000_000, claimedAt: now, updatedAt: now }),
    );
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-shopping-area]', { timeout: 5000 });

  // ① 详情卡：游艇有成本拆项 + 资产强制变现 75% 回笼口径。
  const extYachtCard = page.locator('[data-shopping-area] li', { hasText: '超级游艇' }).first();
  await extYachtCard.locator('[data-item-detail] summary').click();
  await page.waitForTimeout(100);
  const yachtDetail = await extYachtCard.locator('[data-item-detail]').innerText();
  check(
    yachtDetail.includes('船员') && yachtDetail.includes('停泊与保险'),
    '商城扩展：游艇详情卡展开成本构成（船员 / 停泊与保险）',
    yachtDetail.replace(/\n/g, ' ').slice(0, 80),
  );
  check(yachtDetail.includes('75%'), '商城扩展：资产详情明示强制变现只回笼原价 75%', '');

  // 体验项：无拆项 → 来源口径空态 + 无一残值提示。
  const extGalaCard = page.locator('[data-shopping-area] li', { hasText: 'Met Gala 慈善晚宴单张门票' }).first();
  await extGalaCard.locator('[data-item-detail] summary').click();
  const galaDetail = await extGalaCard.locator('[data-item-detail]').innerText();
  check(galaDetail.includes('公开来源'), '商城扩展：无拆项档位显示来源口径说明', '');
  check(galaDetail.includes('一次性体验'), '商城扩展：体验项明示没有可变现残值', '');

  // ② 收藏夹：空态 → 收藏游艇 → 不进车、持久化、tab 可见 → 取消回空态。
  await page.click('[data-mall-tab="favorites"]');
  check(await page.locator('[data-fav-empty]').isVisible(), '商城扩展：收藏 tab 初始空态可见', '');
  await page.click('[data-mall-tab="all"]');
  await extYachtCard.getByRole('button', { name: '收藏' }).click();
  await page.waitForTimeout(150);
  check(await cartCount() === 0, '商城扩展：收藏不计入购物车件数', `count=${await cartCount()}`);
  await page.click('[data-mall-tab="favorites"]');
  check(
    (await page.locator('[data-shopping-area] li', { hasText: '超级游艇' }).count()) === 1,
    '商城扩展：收藏的游艇出现在收藏 tab',
    '',
  );
  const favLedger = await page.evaluate(() => JSON.parse(localStorage.getItem('rich-sim:sim:v1') || 'null'));
  check(
    favLedger?.favorites?.some((i) => i.optionId === 'superyacht') && (favLedger?.cart?.length ?? 0) === 0,
    '商城扩展：收藏持久化进 sim 账本且购物车仍为空',
    JSON.stringify({ fav: favLedger?.favorites, cart: favLedger?.cart }),
  );
  await page
    .locator('[data-shopping-area] li', { hasText: '超级游艇' })
    .first()
    .getByRole('button', { name: '取消收藏' })
    .click();
  await page.waitForTimeout(150);
  check(await page.locator('[data-fav-empty]').isVisible(), '商城扩展：取消收藏后回到空态', '');
  const evFav = await eventsSoFar();
  check(
    countEvent(evFav, 'mall:favorite') >= 1 && countEvent(evFav, 'mall:unfavorite') >= 1,
    '埋点：mall:favorite / mall:unfavorite 已入队',
    `fav=${countEvent(evFav, 'mall:favorite')} unfav=${countEvent(evFav, 'mall:unfavorite')}`,
  );

  // ③ 年度账单环形图：空车只有基线一桶且金额 = $1,317,000。
  await page.click('[data-mall-tab="all"]');
  await page.click('[data-mall-cart-open]');
  await page.waitForSelector('[data-mall-drawer]', { timeout: 5000 });
  check((await page.locator('[data-bill-chart] [data-bill-slice]').count()) === 1, '商城扩展：空车年度账单只有基线一桶', '');
  const baselineSlice = page.locator('[data-bill-slice="baseline"]');
  check((await baselineSlice.innerText()).includes('1,317,000'), '商城扩展：基线桶 = $1,317,000', '');
  await page.keyboard.press('Escape');

  // 加 gala（体验 $100k）+ 游艇（资产 $5.4M）→ 三桶 + 合计 $6,817,000，无消费品桶。
  await extGalaCard.getByRole('button', { name: '加入购物车' }).click();
  await extYachtCard.getByRole('button', { name: '加入购物车' }).click();
  await page.waitForTimeout(200);
  await page.click('[data-mall-cart-open]');
  await page.waitForSelector('[data-bill-chart]', { timeout: 5000 });
  const chartText = await page.locator('[data-bill-chart]').innerText();
  check(
    chartText.includes('1,317,000') &&
      chartText.includes('5,400,000') &&
      chartText.includes('100,000') &&
      chartText.includes('6,817,000'),
    '商城扩展：环形图含基线/资产/体验金额与合计 $6,817,000',
    chartText.replace(/\n/g, ' ').slice(0, 160),
  );
  check((await page.locator('[data-bill-slice="consumer"]').count()) === 0, '商城扩展：无消费品加购时不出现消费品桶', '');
  await page.keyboard.press('Escape');

  // ── 步骤 9.5：投资线（P3）——配置权重与自填收益率 → 推演 → 本机账 ──
  // 步骤 1.5 的 localStorage.clear() 把 sim 账本清掉了，这里先补领 $10M。
  await page.goto(`${BASE}/?lang=zh`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('rich-sim:sim:v1', JSON.stringify({
      schemaVersion: 1,
      startingCapital: 10_000_000,
      claimedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  });
  await page.goto(`${BASE}/app/sim?lang=zh`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-invest-area]', { timeout: 5000 });
  // SSR 源码里必须没有这块岛（关 JS 时卡 A 看板与免责标注仍是完整页面）。
  const simSsr = await (await page.request.get(`${BASE}/app/sim?lang=zh`)).text();
  check(!markupOnly(simSsr).includes('data-invest-area'), '投资线：SSR 源码里没有岛', '');
  // 现金 60 / 债券 40；债券填 10%，现金留空（按 0% 并显式标注）。
  // 每行 3 个输入框（权重 / 收益率 / 波动率）：nth(0)=现金权重, nth(3)=债券权重, nth(4)=债券收益率。
  const weightInputs = page.locator('[data-invest-area] input[type="number"]');
  await weightInputs.nth(0).fill('60');
  await weightInputs.nth(3).fill('40');
  await weightInputs.nth(4).fill('10');
  const investTotal = await page.locator('[data-invest-total]').innerText();
  check(investTotal.includes('100%'), '投资线：权重合计 100%', investTotal.replace(/\s+/g, ' ').trim());
  // $10M × 60% = $6,000,000（现金 0%）；$10M × 40% × 1.1 = $4,400,000 → 1 年合计 $10,400,000。
  const investText = await page.locator('[data-invest-area]').innerText();
  check(
    investText.includes('$10,400,000') && investText.includes('你假设 债券 每年 10%') && investText.includes('你假设 现金 每年 0%'),
    '投资线：1 年推演金额与假设清单逐字呈现',
    investText.replace(/\s+/g, ' ').trim().slice(0, 200),
  );
  const simLedger = await page.evaluate(() => JSON.parse(localStorage.getItem('rich-sim:sim:v1') || 'null'));
  check(
    simLedger?.invest?.weights?.bond === 40 && simLedger?.invest?.returns?.bond === 10 &&
      simLedger?.invest?.returns?.cash === null && simLedger?.schemaVersion === 1,
    '投资线：配置持久化在 sim 账本可选字段（schemaVersion 仍为 1）',
    JSON.stringify(simLedger?.invest),
  );
  // 红线源文本断言：界面上不存在任何具体标的/推荐配置控件。
  check(
    !/S&P|纳斯达克|基金|代码|推荐配置/.test(investText),
    '投资线：无标的、无基金名、无"推荐配置"字样',
    '',
  );

  // 蒙特卡洛：债券波动率填 20% → MC 区块出现，带「随机模拟 · 非预测」常驻标注。
  await weightInputs.nth(5).fill('20');
  await page.waitForSelector('[data-invest-mc]', { timeout: 5000 });
  const mcText = await page.locator('[data-invest-mc]').innerText();
  check(
    mcText.includes('蒙特卡洛路径') && mcText.includes('随机模拟 · 非预测') && mcText.includes('300 条随机路径'),
    '投资线 MC：300 条路径 + 常驻非预测标注',
    mcText.replace(/\s+/g, ' ').trim().slice(0, 200),
  );
  check(!/S&P|纳斯达克|基金|代码|推荐配置/.test(mcText), '投资线 MC：仍无标的、无推荐配置字样', '');
  // 确定性推演仍在（波动率不改变「你假设 x%」的基准行）。
  const investTextAfter = await page.locator('[data-invest-area]').innerText();
  check(investTextAfter.includes('$10,400,000'), '投资线 MC：确定性基准行仍在', '');
  // ── 步骤 10：多情景推演（M4 S1）──────────────────────────────
  await page.goto(`${BASE}/app/result?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-scenario-panel]', { timeout: 5000 });

  // 面板是客户端岛：SSR 源码里必须没有它，而假设清单/免责声明必须仍然完整
  // （T03 判据——关 JS 时这一页依然是合规的完整页面）。
  const ssrHtml = await (await page.request.get(`${BASE}/app/result?smoke=1&lang=zh`)).text();
  check(!markupOnly(ssrHtml).includes('data-scenario-panel'), '情景面板：SSR 源码里没有岛', '');
  check(
    ssrHtml.includes('假设清单') && ssrHtml.includes('免责声明'),
    '情景面板：SSR 仍带假设清单与免责声明',
    '',
  );

  // 失业：收入归零 → 一等状态，文案说状态而不是年限。
  await page.check('[data-scenario-toggle="jobless"]');
  await page.waitForSelector('[data-scenario-result="jobless"]');
  const joblessLine = await page.locator('[data-scenario-result="jobless"]').innerText();
  check(
    joblessLine.includes('无净储蓄'),
    '情景：失业落 no-net-savings 的独立文案',
    `text="${joblessLine.trim()}"`,
  );

  // 涨薪：默认幅度也要即时出一个差值（不比大小，只比"有没有算出来"）。
  await page.check('[data-scenario-toggle="raise"]');
  await page.waitForSelector('[data-scenario-result="raise"]');
  const raiseLine = await page.locator('[data-scenario-result="raise"]').innerText();
  check(
    raiseLine.trim().length > 0 && !/NaN|Infinity|undefined/.test(raiseLine),
    '情景：涨薪即时重算出一个可读结果',
    `text="${raiseLine.trim()}"`,
  );

  await page.uncheck('[data-scenario-toggle="jobless"]');
  check(
    await page.locator('[data-scenario-result="jobless"]').count() === 0,
    '情景：关掉失业后该行消失，回到基线',
    '',
  );

  // 移动端 390 宽不得横向溢出（视口本来就是 390×844）。
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  check(
    overflow.scrollWidth <= overflow.innerWidth + 1,
    '情景面板：390 宽无横向溢出',
    `scrollWidth=${overflow.scrollWidth} innerWidth=${overflow.innerWidth}`,
  );

  const evScenario = await eventsSoFar();
  check(
    countEvent(evScenario, 'scenario:toggle') >= 2,
    '埋点：scenario:toggle 已入队',
    `count=${countEvent(evScenario, 'scenario:toggle')}`,
  );

  // 英文态：面板标题、情景名与状态文案都走词典（全站双语，这块不能例外）。
  await page.goto(`${BASE}/app/result?smoke=1&lang=en`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-scenario-panel]');
  const panelEn = await page.locator('[data-scenario-panel]').innerText();
  check(
    panelEn.includes('What-if scenarios') &&
      panelEn.includes('Job loss') &&
      panelEn.includes('Pay rise') &&
      panelEn.includes('Large one-off expense'),
    'i18n：情景面板英文态走词典',
    `text=${panelEn.replace(/\n/g, ' ').slice(0, 46)}`,
  );
  await page.check('[data-scenario-toggle="jobless"]');
  const joblessEn = await page.locator('[data-scenario-result="jobless"]').innerText();
  check(
    joblessEn.includes('no net savings') && !/[一-鿿]/.test(joblessEn),
    'i18n：失业结果行也是英文',
    `text="${joblessEn.trim()}"`,
  );
  await page.uncheck('[data-scenario-toggle="jobless"]');

  // ── 步骤 10：报告（M4 S2 · T02/T03/T05/T06）──
  await page.goto(`${BASE}/app/result?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-report]');

  const reportBlocks = await page
    .locator('[data-report] [data-report-block]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-report-block')));
  for (const id of ['situation', 'goal', 'status', 'gap', 'milestones']) {
    check(reportBlocks.includes(id), `报告：有「${id}」小节`, `blocks=${reportBlocks.join(',')}`);
  }

  const reportText = await page.locator('[data-report]').innerText();
  check(
    reportText.includes('不构成') && reportText.includes('建议'),
    '报告：免责声明随报告走',
    `has=${reportText.includes('不构成')}`,
  );

  // 报告是文档不是表单：正文里不该出现输入控件（唯一的控件是打印按钮）
  const reportInputs = await page
    .locator('[data-report] input, [data-report] select, [data-report] textarea')
    .count();
  check(reportInputs === 0, '报告：正文没有输入控件', `count=${reportInputs}`);
  check(
    (await page.locator('[data-report-print]').count()) === 1,
    '报告：有打印入口按钮',
    '',
  );

  // 打印样式表必须命中报告与合规面板，并隐藏交互控件
  const printCss = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // 跨源表读不到 cssRules，跳过
      }
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule && rule.media.mediaText === 'print') return rule.cssText;
      }
    }
    return '';
  });
  check(
    /\[data-report\]/.test(printCss) &&
      /\[data-compliance\]/.test(printCss) &&
      /button/.test(printCss),
    '报告：打印样式命中报告与合规面板、并隐藏按钮',
    `len=${printCss.length}`,
  );

  // ── 步骤 11：假付费信号（M4 S4 前置探针）——不收款，只确认交互与埋点 ──
  await page.waitForSelector('[data-paywall-probe]');
  const tierCount = await page.locator('[data-paywall-tier]').count();
  check(tierCount === 2, '付费墙：两个意愿选项', `count=${tierCount}`);

  const probeNote = await page.locator('[data-paywall-probe]').innerText();
  check(/不收款|not|No charge/.test(probeNote), '付费墙：明示不收款', '');

  await page.click('[data-paywall-tier="report"]');
  await page.waitForSelector('[data-paywall-thanks]');

  const evProbe = await eventsSoFar();
  check(
    countEvent(evProbe, 'paywall:intent:report') >= 1,
    '埋点：paywall:intent:report 已入队',
    `count=${countEvent(evProbe, 'paywall:intent:report')}`,
  );

} catch (err) {
  check(false, '脚本未异常中断', err.message);
} finally {
  // 事件队列摘要（可观测证据）
  const queue = await eventsSoFar();
  const summary = {};
  for (const e of queue) summary[e.event] = (summary[e.event] ?? 0) + 1;
  console.log('=== E2E SMOKE RESULTS ===');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}  ${r.detail}`);
  const fails = results.filter((r) => !r.ok).length;
  console.log('=== EVENTS (rich-sim:events:v1) ===');
  console.log(JSON.stringify(summary));
  console.log(JSON.stringify(queue));
  console.log(`=== TOTAL ${results.length}  FAILS ${fails} ===`);
  await browser.close();
  process.exit(fails > 0 ? 1 : 0);
}
