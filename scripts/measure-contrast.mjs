// PRD §9「WCAG AA；对比度达标」的验证脚本。
//
//   node scripts/measure-contrast.mjs                    # 默认测生产，浅色 + 深色各一轮
//   BASE_URL=http://localhost:4321 node scripts/measure-contrast.mjs
//   ROUTES=/,/app/designer SCHEMES=dark node scripts/measure-contrast.mjs
//   node scripts/measure-contrast.mjs --selftest         # 先证明这把尺子能量出坏样本
//
// 为什么单独一个脚本：§9 写了 WCAG AA，而仓库里键盘走查、skip link、reduced-motion
// 都有冒烟断言，**对比度一次都没验过**——「达标」这句一直没有出处。
//
// 判定口径（每条都要能自证）：
// - 只判**真实渲染出来的文本**：叶子文本节点、非空、非 visibility:hidden / display:none、
//   opacity 链乘 > 0.5。
// - 前景取 computed color，背景沿祖先链找**第一个不透明底**并把半透明逐层合成；
//   整条链都没有底色时用 body/html 的底色兜底，再兜白。
// - 阈值按 AA：正文 4.5:1；大号文本（≥24px，或 ≥18.66px 且字重 ≥700）3:1。
// - **背景是图片 / 渐变的一律记「不可判定」**，不参与 PASS/FAIL——在图片上算纯色对比度
//   是假精确，宁可留白。
// - 只扫首屏起三屏内的文本（长页全扫会把离线内容的字体也拿来判，读数会漂）。
import pw from 'playwright-core';

const { chromium } = pw;
const BASE = process.env.BASE_URL ?? 'https://app.rich-sim.bayjf.com';
const ROUTES = (
  process.env.ROUTES ?? '/,/app/designer,/app/finance,/app/result,/app/sim?claim=1&capital=100000'
)
  .split(',')
  .filter(Boolean);
const SCHEMES = (process.env.SCHEMES ?? 'light,dark').split(',').filter(Boolean);

const AUDIT_FN = () => {
  const parse = (c) => {
    const m = (c || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)];
    const [hi, lo] = x > y ? [x, y] : [y, x];
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: fg.a + bg.a * (1 - fg.a),
  });

  const rootBg = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const bodyBg = parse(getComputedStyle(document.body).backgroundColor) || rootBg;

  const effectiveBg = (el) => {
    const layers = [];
    let node = el;
    let opaque = null;
    let imageBehind = false;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') imageBehind = true;
      const c = parse(cs.backgroundColor);
      if (c) {
        if (c.a >= 1) {
          opaque = c;
          break;
        }
        if (c.a > 0) layers.push(c);
      }
      node = node.parentElement;
    }
    let base = opaque || bodyBg;
    if (base.a < 1) base = over(base, { r: 255, g: 255, b: 255, a: 1 });
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return { bg: base, imageBehind };
  };

  const chainOpacity = (el) => {
    let o = 1;
    let node = el;
    while (node && node.nodeType === 1) {
      o *= Number(getComputedStyle(node).opacity || '1');
      node = node.parentElement;
    }
    return o;
  };

  const describe = (el) => {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 3) {
      const id = node.id ? `#${node.id}` : '';
      const cls = node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\s+/)[0] : '';
      parts.unshift(node.tagName.toLowerCase() + id + cls);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };

  const failing = [];
  const undecidable = [];
  let checked = 0;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el) continue;
    if (/^(script|style|noscript)$/.test(el.tagName.toLowerCase())) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (rect.bottom < 0 || rect.top > innerHeight * 3) continue;
    if (chainOpacity(el) <= 0.5) continue;

    const fg = parse(cs.color);
    if (!fg) continue;
    const { bg, imageBehind } = effectiveBg(el);
    const size = parseFloat(cs.fontSize) || 16;
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    checked++;

    if (imageBehind) {
      undecidable.push({ text: text.slice(0, 40), why: '背景含图片/渐变' });
      continue;
    }
    const r = ratio(fg.a < 1 ? over(fg, bg) : fg, bg);
    if (r < need) failing.push({ text: text.slice(0, 40), ratio: r, need, px: Math.round(size), selector: describe(el) });
  }
  return { checked, failing, undecidable };
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });

/**
 * 自测：注入一对必然不合格（浅灰字压近白底）与一对必然合格（黑字白底），
 * 要求「只报前者」。为什么必须内置：第一次跑出「0 处不达标」时差点被当成达标，
 * 而当时手工种的靶子是 #3a3a3a 压深色底——在无头 Chrome 默认的**浅色**方案下那是
 * 合格色，红不起来不是页面好，是探针选错了靶子。两个方向都验，才敢引用读数。
 */
if (process.argv.includes('--selftest')) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 90_000 });
  await page.addStyleTag({
    content: '#cs-bad{color:#dedede;background:#f7f7f8;font-size:14px;padding:8px}' + '#cs-good{color:#111111;background:#ffffff;font-size:14px;padding:8px}',
  });
  await page.evaluate(() => {
    for (const [id, text] of [['cs-bad', 'Low contrast sample text'], ['cs-good', 'High contrast sample text']]) {
      const el = document.createElement('div');
      el.id = id;
      el.textContent = text;
      document.body.prepend(el);
    }
  });
  const res = await page.evaluate(AUDIT_FN);
  const hitBad = res.failing.some((f) => f.text.startsWith('Low contrast'));
  const falseAlarm = res.failing.some((f) => f.text.startsWith('High contrast'));
  console.log(`自测：抓到注入的低对比样本=${hitBad} · 误报合格样本=${falseAlarm}`);
  const ok = hitBad && !falseAlarm;
  console.log(ok ? 'SELFTEST PASS（这把尺子能量出坏样本）' : 'SELFTEST FAIL（对比度检查不可信，别引用它的读数）');
  await browser.close();
  process.exit(ok ? 0 : 1);
}

/**
 * 先跑通漏斗再测结果页：结果页的主读数由岛按本机草稿算出，不填财务就停在
 * no-profile——那样「审计了结果页」是假的（首版就犯过这个错，27 个节点全是空态文案）。
 */
async function seedDraft(page) {
  await page.goto(BASE + '/app/finance', { waitUntil: 'load', timeout: 90_000 });
  await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(400);
  for (const [id, v] of [
    ['#field-income', '15000'],
    ['#field-expenseTotal', '8000'],
    ['#field-savings', '100000'],
    ['#field-debt', '0'],
  ]) {
    await page.fill(id, v, { timeout: 20_000 });
  }
  await page.waitForTimeout(700);
  const bytes = await page.evaluate(() => (localStorage.getItem('rich-sim:plan:v1') || '').length);
  if (bytes < 50) throw new Error('草稿没写进去（财务岛的保存没生效），后面的读数无效');
  return bytes;
}

let totalFail = 0;
let totalChecked = 0;
for (const scheme of SCHEMES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
  const page = await ctx.newPage();
  console.log(`\n########## 配色方案：${scheme} ##########`);
  let first = true;
  for (const route of ROUTES) {
    if (route === '/app/result') await seedDraft(page);
    const url = BASE + route + (first ? (route.includes('?') ? '&' : '?') + 'smoke=1' : '');
    first = false;
    await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(900);
    const res = await page.evaluate(AUDIT_FN);
    totalFail += res.failing.length;
    totalChecked += res.checked;
    console.log(`${route}  文本节点 ${res.checked} · 不达标 ${res.failing.length} · 不可判定 ${res.undecidable.length}`);
    for (const f of res.failing.slice(0, 12)) {
      console.log(`  ✗ ${f.ratio.toFixed(2)}:1（需 ≥${f.need}） ${f.px}px  ${f.selector}  「${f.text}」`);
    }
    if (res.failing.length > 12) console.log(`  …另 ${res.failing.length - 12} 条同类`);
    for (const u of res.undecidable.slice(0, 3)) console.log(`  ? 不可判定：${u.why} 「${u.text}」`);
  }
  await ctx.close();
}

await browser.close();
console.log(`\n合计：判定 ${totalChecked} 个文本节点 · 不达标 ${totalFail} 处（方案 ${SCHEMES.join('/')}）`);
process.exit(totalFail > 0 ? 1 : 0);
