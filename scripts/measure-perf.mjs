// PRD §9 性能预算的测量脚本：LCP / INP / CLS（+ TTFB / FCP 作上下文）。
//
//   node scripts/measure-perf.mjs                        # 默认测生产
//   BASE_URL=http://localhost:4321 node scripts/measure-perf.mjs
//   THROTTLE=none node scripts/measure-perf.mjs          # 不降速（数字会好看得不真实）
//
// 为什么要有这个脚本：§9 写了 LCP<2.5s / INP<200ms / CLS<0.1 三个数，而仓库里
// 既没有 web-vitals 也没有 lighthouse，冒烟不采时序——需求处于「没法读」而不是
// 「已达标」。测量必须可复跑，数字才有出处。
//
// 三条纪律：
// 1. **降速是默认**：移动视口 390×844 + 4× CPU + Fast 3G 网络（Lighthouse 的移动端
//    默认档）。不降速测出来的数是桌面本机直连的成绩，拿它宣布达标是自欺。
// 2. **首个导航带 ?smoke=1**：同标签页后续事件名全部加前缀。打生产跑测量如果不打标，
//    就会往「到底有没有真人来过」这个唯一信号里掺假行（收集端不存标识符，冒烟行与
//    真人行形状完全相同，掺进去分不出来）。
// 3. 走**真实漏斗**顺序（设计器 → 财务 → 结果 → 模拟），所以财务/结果页量到的是
//    「有草稿的二次访问」，不是冷空页——这更接近真人第一次跑通的路径，脚本里注明。
import pw from 'playwright-core';

const { chromium } = pw;
const BASE = process.env.BASE_URL ?? 'https://app.rich-sim.bayjf.com';
const THROTTLE = process.env.THROTTLE ?? 'mobile';

const BUDGET = { lcp: 2500, inp: 200, cls: 0.1 };

/**
 * 每个页面在真实漏斗里的位置，以及要复现的那一次交互（INP 没有交互就测不到）。
 * 选择器一律 locale 无关——冒烟用 `text=独栋豪宅` 那种可见文本，脚本跟着换语言就废了。
 * 财务页必须**四个字段填齐**，否则不写草稿，结果页停在 no-profile，
 * 情景开关就不存在（这不是脚本的 bug，是产品的状态分支）。
 */
const ROUTES = [
  { path: '/', label: '首页', interact: [] },
  {
    path: '/app/designer',
    label: '设计器',
    interact: [{ kind: 'click', selector: '[role="radio"][aria-checked="false"]' }],
  },
  {
    path: '/app/finance',
    label: '财务录入',
    interact: [
      { kind: 'fill', selector: '#field-income', value: '15000' },
      { kind: 'fill', selector: '#field-expenseTotal', value: '8000' },
      { kind: 'fill', selector: '#field-savings', value: '100000' },
      { kind: 'fill', selector: '#field-debt', value: '0' },
    ],
  },
  {
    path: '/app/result',
    label: '测算结果',
    interact: [{ kind: 'click', selector: '[data-scenario-toggle="raise"]' }],
  },
  {
    path: '/app/sim?claim=1&capital=100000',
    label: '富豪模拟',
    interact: [{ kind: 'click', selector: '[data-mall-item-toggle]' }],
  },
];

// 在页面任何脚本之前装好三个观察器（PerformanceObserver 不吃历史条目就白测）。
const INIT_SCRIPT = `
(() => {
  const m = { fcp: null, lcp: null, inp: null, cls: 0, ttfb: null, interactions: 0, slowInteractions: 0 };
  let shifts = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((l) => {
      // LCP 会随加载更新，取最后一条（页面稳定后停在真正最大那块）。
      const es = l.getEntries();
      const last = es[es.length - 1];
      if (last) m.lcp = last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.duration > (m.inp ?? 0)) m.inp = e.duration;
        m.slowInteractions++;
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch (e) {}
  // 交互次数单独数：观察器只送 ≥16ms 的条目，一次都没超阈值时 INP 是
  // 「小于 16ms」这个**上界读数**，不是「没测到」——把有界读数说成未测量，
  // 等于把达标的那一半丢掉。
  for (const t of ['pointerdown', 'click', 'keydown', 'input', 'change']) {
    document.addEventListener(
      t,
      () => {
        m.interactions++;
      },
      { capture: true, passive: true },
    );
  }
  try {
    new PerformanceObserver((l) => { shifts.push(...l.getEntries()); }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
  // CLS 用 session window（web-vitals 的算法）：忽略 hadRecentChange，
  // 500ms 空档或 1200ms 窗口上限就开新窗，取各窗之和的最大值。
  window.__perfCompute = () => {
    let cls = 0, cur = 0, winStart = 0, last = 0;
    for (const e of shifts.slice().sort((a, b) => a.startTime - b.startTime)) {
      if (e.hadRecentChange) continue;
      const firstOfWindow = last === 0 || e.startTime - last > 500 || e.startTime - winStart > 1200;
      if (firstOfWindow) { cls = Math.max(cls, cur); cur = 0; winStart = e.startTime; }
      cur += e.value;
      last = e.startTime;
    }
    m.cls = Math.max(cls, cur);
    const describe = (node) => {
      if (!node || node.nodeType !== 1) return '(无名)';
      const id = node.id ? '#' + node.id : '';
      const cls0 = typeof node.className === 'string' && node.className.trim() ? '.' + node.className.trim().split(/\s+/)[0] : '';
      const hook = [...node.attributes || []].map((a) => a.name).find((n) => n.startsWith('data-'));
      return node.tagName.toLowerCase() + id + cls0 + (hook ? '[' + hook + ']' : '');
    };
    m.topShifts = shifts
      .filter((e) => !e.hadRecentChange && e.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((e) => ({
        value: Number(e.value.toFixed(4)),
        at: Math.round(e.startTime),
        node: e.sources && e.sources[0] ? describe(e.sources[0].node) : '(无名)',
      }));
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) m.ttfb = nav.responseStart - nav.startTime;
    return m;
  };
})();
`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.addInitScript(INIT_SCRIPT);

const cdp = await ctx.newCDPSession(page);
if (THROTTLE !== 'none') {
  // Lighthouse 移动端默认档：4× CPU + Fast 3G（1.6Mbps↓ / 750Kbps↑ / 150ms RTT）。
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

const rows = [];
let first = true;

for (const route of ROUTES) {
  const url = BASE + route.path + (first ? (route.path.includes('?') ? '&' : '?') + 'smoke=1' : '');
  first = false;
  const started = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
  // 岛 hydration + 首屏稳定；再等一小段让 LCP/CLS 收最后一拍。
  await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(1200);

  let inp = null;
  const landed = [];
  for (const it of route.interact) {
    const found = await page.locator(it.selector).count();
    if (found < 1) continue; // 该页此刻没有这个控件（状态分支），如实跳过
    const loc = page.locator(it.selector).first();
    if (it.kind === 'fill') await loc.fill(it.value, { timeout: 20_000 });
    else await loc.click({ timeout: 20_000 });
    landed.push(it.selector);
    // 让交互的处理与绘制落地，再读观察器累积值。
    await page.waitForTimeout(1200);
  }

  const m = await page.evaluate(() => window.__perfCompute());
  inp = m.inp;

  rows.push({
    label: route.label,
    path: route.path,
    ttfb: m.ttfb,
    fcp: m.fcp,
    lcp: m.lcp,
    inp,
    cls: m.cls,
    interactions: m.interactions,
    slowInteractions: m.slowInteractions,
    landed,
    topShifts: m.topShifts || [],
    navigatedIn: Date.now() - started,
  });
}

await browser.close();

const ms = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}ms`);
/** INP 读数：有交互但都没超观察阈值 → 报上界，不报「未测」。 */
const inpText = (r) => (r.inp !== null ? ms(r.inp) : r.interactions > 0 ? '<16ms' : '—');
const inpPass = (r) => (r.inp !== null ? r.inp <= BUDGET.inp : r.interactions > 0 ? true : null);

console.log(`\n测量目标 ${BASE} · 视口 390×844 · 降速 ${THROTTLE === 'none' ? '关闭（数字偏乐观）' : '4× CPU + Fast 3G'}`);
console.log(`预算（PRD §9）：LCP < ${BUDGET.lcp}ms · INP < ${BUDGET.inp}ms · CLS < ${BUDGET.cls}\n`);
console.log('页面        路径                                TTFB    FCP     LCP     INP     CLS     交互');
let fails = 0;
for (const r of rows) {
  console.log(
    [
      r.label.padEnd(10),
      r.path.padEnd(32),
      ms(r.ttfb).padEnd(7),
      ms(r.fcp).padEnd(7),
      ms(r.lcp).padEnd(7),
      inpText(r).padEnd(7),
      r.cls.toFixed(4).padEnd(7),
      `${r.interactions}/${r.slowInteractions}`,
    ].join(' '),
  );
  const lcpOk = r.lcp !== null && r.lcp <= BUDGET.lcp;
  const inpOk = inpPass(r);
  const clsOk = r.cls <= BUDGET.cls;
  const parts = [`lcp:${lcpOk ? 'PASS' : 'FAIL'}`, `inp:${inpOk === null ? '未测' : inpOk ? 'PASS' : 'FAIL'}`, `cls:${clsOk ? 'PASS' : 'FAIL'}`];
  if (!lcpOk) fails++;
  if (inpOk === false) fails++;
  if (!clsOk) fails++;
  console.log(`            → ${parts.join('  ')}`);
  console.log(`              交互落地：${r.landed.length ? r.landed.join(' , ') : '（该页此刻没有可复现的控件）'}`);
  if (!clsOk && r.topShifts.length) {
    for (const s of r.topShifts) console.log(`              位移来源 ${s.value} @${s.at}ms  ${s.node}`);
  }
}
console.log(`\n合计超预算项 ${fails}（交互列 = 触发次数 / 其中 ≥16ms 的条数）`);
process.exit(fails > 0 ? 1 : 0);
