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
  await page.goto(`${BASE}/?smoke=1`, { waitUntil: 'networkidle' });
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
    check(await claimCta.getAttribute('href') === '/app/sim?claim=1', '领钱入口：SSR 出来就是可用链接（关 JS 也能走）', '');
    await claimCta.click();
    await page.waitForSelector('[data-claim-route="life"]', { timeout: 3000 });
    const panel = await page.locator('section[aria-labelledby="claim-heading"]').innerText();
    check(panel.includes('年运营全口径'), '领钱：第二拍含账单口径字样', '');
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
    const evClaim = await eventsSoFar();
    const claimEvents = ['claim:tap', 'claim:reveal', 'claim:bill'].map((n) => `${n}=${countEvent(evClaim, n)}`);
    check(
      ['claim:tap', 'claim:reveal', 'claim:bill'].every((n) => countEvent(evClaim, n) >= 1),
      '埋点：claim 三步已入队',
      claimEvents.join(' '),
    );

    // 关 JS 的那条路径（?claim=1）：这一行由 SSR 渲染，不依赖本机账本。
    await page.goto(`${BASE}/app/sim?claim=1`, { waitUntil: 'networkidle' });
    const runway = await page.locator('[data-claim-runway]').innerText();
    check(
      runway.includes('9.1 个月'),
      '领钱：$1M 撑卡 A 这套生活 ≈ 9.1 个月（手算 1,000,000 ÷ 1,317,000/年）',
      `text="${runway.replace(/\n/g, ' ').trim()}"`,
    );
  }

  // 干净起点（localStorage.clear() 只清队列，不动 sessionStorage 里的冒烟标记）
  await page.goto(`${BASE}/app/designer?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
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

  // 自标记自检：此刻观测到的事件名必须全部带 smoke: 前缀。少一条就是打标失效——
  // 那样每跑一次生产冒烟，都会把自己的流量混进「到底有没有真人来过」这个唯一
  // 信号里，而且没人会发现（收集端不存标识符，冒烟行与真人行形状完全相同）。
  const unmarked = evDesigner.filter((e) => !String(e.event).startsWith('smoke:'));
  check(
    evDesigner.length > 0 && unmarked.length === 0,
    '冒烟打标：观测到的事件名全部带 smoke: 前缀',
    `total=${evDesigner.length} unmarked=${unmarked.map((e) => e.event).join(',') || '(无)'}`,
  );

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

  // ── 步骤 4：切币种 USD -> CNY（切换器在设计器页）──
  await page.goto(`${BASE}/app/designer?smoke=1&lang=zh`, { waitUntil: 'networkidle' });
  await page.selectOption('#display-currency', 'CNY');
  await page.waitForSelector('#display-currency:not([disabled])');
  await page.waitForTimeout(300);
  const curVal = await page.locator('#display-currency').inputValue();
  check(curVal === 'CNY', '切币种：选择器值变为 CNY', `value=${curVal}`);

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

  // ── 步骤 5：复看结果页，金额随新币种（约 1800 万量级 CNY）──
  await page.goto(`${BASE}/app/result`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-status]');
  const enoughTextCny = await page.locator('[data-results-root] .font-mono.text-4xl').innerText();
  const enoughCny = parseAmount(enoughTextCny);
  check(enoughCny > 15_000_000 && enoughCny < 22_000_000, '切币种后：够用线换算到 CNY（约 1800 万量级）', `enoughCny=${enoughCny} text="${enoughTextCny.trim()}"`);
  const bodyCny = await page.locator('[data-results-root]').innerText();
  check(/CNY/.test(bodyCny), '切币种后：结果页币种标签为 CNY', `hasCNY=${/CNY/.test(bodyCny)}`);

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
        .evaluate((el) => el.outerHTML)
        .catch(() => '');
      const m = html.match(/data-cart-status="([a-z]+)"/);
      if (m) return m[1];
      await page.waitForTimeout(100);
    }
    return null;
  };

  check(await cartCount() === 0, '购物区：首帧空车', `count=${await cartCount()}`);

  const galaCard = page.locator('li', { hasText: 'Met Gala 慈善晚宴单张门票' }).first();
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

  const yachtCard = page.locator('li', { hasText: '超级游艇' }).first();
  await yachtCard.getByRole('button', { name: '加入购物车' }).click();
  await page.waitForTimeout(200);
  check(await cartCount() === 2, '购物区：加购游艇后件数 = 2（同维多件允许）', `count=${await cartCount()}`);
  check(
    (await cartAdded()).includes('5,500,000'),
    '购物区：新增年成本 = 游艇 5,400,000 + 晚宴 100,000',
    `added=${await cartAdded()}`,
  );
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

  // 移出游艇 → 回到黄、新增回落。
  await yachtCard.getByRole('button', { name: '移出购物车' }).click();
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
