// T13 · M1 E2E 冒烟：设计器 → 财务录入 → 测算结果 → 切币种 → 复看结果。
//
// 运行前提：apps/web dev server 已启动（默认 http://localhost:4335，可用 BASE_URL 覆盖）。
//   cd apps/web && npx astro dev --port 4335
//   node scripts/e2e-smoke.mjs
//
// 驱动：playwright-core + 系统 Chrome（channel:'chrome'），移动视口 390×844。
// 断言用页面实际值互相校验（相对变化），避免脆死数；每步同时断言对应埋点事件
// 已入 localStorage 队列（rich-sim:events:v1），末尾打印事件摘要作为可观测证据。
import pw from 'playwright-core';

const { chromium } = pw;
const BASE = process.env.BASE_URL ?? 'http://localhost:4335';
const EVENTS_KEY = 'rich-sim:events:v1';

const results = [];
const check = (ok, label, detail = '') => {
  results.push({ ok, label, detail });
};

/** 从一段货币格式化文本里抠出第一个数字（含千分位逗号）。 */
function parseAmount(text) {
  const m = text.replace(/,/g, '').match(/\d[\d.]*\d|\d/);
  return m ? Number(m[0]) : NaN;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const eventsSoFar = async () =>
  page.evaluate((key) => {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  }, EVENTS_KEY);
const countEvent = (list, name) => list.filter((e) => e.event === name).length;

try {
  // 干净起点
  await page.goto(`${BASE}/app/designer`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
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

  // ── 步骤 2：财务录入 4 项 ──
  await page.goto(`${BASE}/app/finance`, { waitUntil: 'networkidle' });
  await page.fill('#field-income', '15000');
  await page.fill('#field-expense', '8000');
  await page.fill('#field-savings', '100000');
  await page.fill('#field-debt', '0');
  await page.waitForTimeout(150);
  const evFinance = await eventsSoFar();
  check(countEvent(evFinance, 'finance:update') >= 1, '埋点：finance:update 已入队', `count=${countEvent(evFinance, 'finance:update')}`);

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

  // ── 步骤 4：切币种 USD -> CNY（切换器在设计器页）──
  await page.goto(`${BASE}/app/designer`, { waitUntil: 'networkidle' });
  await page.selectOption('#display-currency', 'CNY');
  await page.waitForSelector('#display-currency:not([disabled])');
  await page.waitForTimeout(300);
  const curVal = await page.locator('#display-currency').inputValue();
  check(curVal === 'CNY', '切币种：选择器值变为 CNY', `value=${curVal}`);

  const evSwitch = await eventsSoFar();
  check(countEvent(evSwitch, 'currency:switch') >= 1, '埋点：currency:switch 已入队', `count=${countEvent(evSwitch, 'currency:switch')}`);

  // ── 步骤 5：复看结果页，金额随新币种（约 1800 万量级 CNY）──
  await page.goto(`${BASE}/app/result`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-status]');
  const enoughTextCny = await page.locator('[data-results-root] .font-mono.text-4xl').innerText();
  const enoughCny = parseAmount(enoughTextCny);
  check(enoughCny > 15_000_000 && enoughCny < 22_000_000, '切币种后：够用线换算到 CNY（约 1800 万量级）', `enoughCny=${enoughCny} text="${enoughTextCny.trim()}"`);
  const bodyCny = await page.locator('[data-results-root]').innerText();
  check(/CNY/.test(bodyCny), '切币种后：结果页币种标签为 CNY', `hasCNY=${/CNY/.test(bodyCny)}`);
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
