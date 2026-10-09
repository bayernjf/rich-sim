import { describe, expect, it } from 'vitest';
import { BILLS_PER_PAGE, RESALE_RECOVERY_RATE, initialCatalogUSD, scenarioAnnualCost } from '@rich-sim/core';
import { DEFAULT_ASSUMPTIONS } from './defaults';
import {
  ACQUISITION_MULTIPLE,
  CARD_A,
  CARD_A_ANNUAL_INCOME,
  CARD_A_BROKE,
  CARD_A_LAST_YEAR_COST,
  DEAL_RATE,
  LEVERAGE_MULTIPLE,
  SIM_STARTING_CAPITAL,
  acquisitionDeal,
  annualDrawdown,
  cardAnnualCost,
  cardBills,
  cardBurden,
  cartAddedAnnualCost,
  cartBurdenSummary,
  cartKindCosts,
  cartKindCounts,
  claimBillRows,
  formatRunway,
  leverageDeal,
  plotEvents,
  runwayMonths,
  shoppingPool,
  topTierChoices,
} from './sim-content';

const catalog = initialCatalogUSD;
const assumptions = DEFAULT_ASSUMPTIONS;

describe('卡 A（F5 最小版内容）', () => {
  // 与 simulation-gameplay.md §4.4 的年成本画像互为闸门：
  // 那边改了组合而这边没同步（或反过来），这条先红。
  it('六项年成本求和 = $1,317,000', () => {
    expect(cardAnnualCost(CARD_A.choices, catalog, assumptions)).toBe(1_317_000);
  });

  it('断裂开关：再加超级游艇 = $6,717,000', () => {
    expect(cardAnnualCost(CARD_A_BROKE, catalog, assumptions)).toBe(6_717_000);
  });

  it('每个 choice 都能解析出 catalog 选项（坏 id 会让上面两条红，这里给出更直的报错）', () => {
    for (const choice of CARD_A.choices) {
      const dimension = catalog.dimensions.find((d) => d.id === choice.dimension);
      expect(dimension, `未知维度 ${choice.dimension}`).toBeDefined();
      expect(
        dimension?.options.find((o) => o.id === choice.optionId),
        `${choice.dimension}/${choice.optionId} 不在目录里`,
      ).toBeDefined();
    }
  });

  it('资产结构占比合计 100，且引擎不消费它', () => {
    const total = CARD_A.assetStructure.reduce((sum, part) => sum + part.share, 0);
    expect(total).toBe(100);
    // 占比是展示内容：core 的 scenarioAnnualCost 只吃 annualCost，
    // 类型上也没有任何字段能接它——这条钉住「占比永不参与计算」。
    expect(CARD_A.assetStructure).not.toHaveProperty('annualCost');
  });

  it('逐项明细可直接渲染（含维度与选项名）', () => {
    const { breakdown } = scenarioAnnualCost(CARD_A.choices, catalog, assumptions);
    expect(Object.keys(breakdown).length).toBeGreaterThan(0);
    expect(breakdown['transport']).toBe(1_017_000); // 飞机 + 豪华车同维度合并
  });
});

describe('账单日（S2）', () => {
  it('账单按年成本降序，含拆到每月的口径', () => {
    const bills = cardBills(CARD_A_BROKE, catalog);
    expect(bills.length).toBe(7);
    for (let i = 1; i < bills.length; i += 1) {
      expect(bills[i - 1].annualCost).toBeGreaterThanOrEqual(bills[i].annualCost);
    }
    expect(bills[0].optionLabel).toBe('超级游艇自持（年运营全口径）');
    expect(bills[0].monthlyCost).toBe(450_000); // 5,400,000 / 12
    expect(bills.at(-1)?.monthlyCost).toBeGreaterThan(0);
  });

  it('翻页参数：一页 4 张，基态 6 张 = 2 页', () => {
    expect(BILLS_PER_PAGE).toBe(4);
    expect(Math.ceil(cardBills(CARD_A.choices, catalog).length / BILLS_PER_PAGE)).toBe(2);
  });

  it('负担率：基态黄（r ≈ 0.7825），加游艇红（r ≈ 3.9911）', () => {
    const base = cardBurden(CARD_A.choices, catalog, assumptions);
    expect(base.cashflow).toBe(CARD_A_ANNUAL_INCOME - CARD_A_LAST_YEAR_COST);
    expect(base.status).toBe('yellow');
    expect(base.rate).toBeCloseTo(1_317_000 / 1_683_000, 4);

    const broke = cardBurden(CARD_A_BROKE, catalog, assumptions);
    expect(broke.status).toBe('red');
    expect(broke.rate).toBeCloseTo(6_717_000 / 1_683_000, 4);
  });

  it('CF 公式与 §2.5 一致：收入 − 上一年已承担的持有成本', () => {
    expect(CARD_A_LAST_YEAR_COST).toBe(cardAnnualCost(CARD_A.choices, catalog, assumptions));
  });

  it('变卖折价是 §2.4 的 75%（常量已参数化进 core）', () => {
    expect(RESALE_RECOVERY_RATE).toBe(0.75);
  });
});

describe('领钱入口（S4）', () => {
  it('第二拍主句：$1M 按默认提取率一年只能产出 $40,000（手算 1,000,000 × 4%）', () => {
    expect(SIM_STARTING_CAPITAL).toBe(1_000_000);
    expect(assumptions.withdrawalRate).toBe(0.04);
    expect(annualDrawdown(SIM_STARTING_CAPITAL, assumptions)).toBe(40_000);
  });

  it('三行真实账单全部取自目录，UI 层复制不了这里的任何一个数字', () => {
    const rows = claimBillRows(catalog, assumptions);
    expect(rows).toHaveLength(3);
    // 与账单日同序：从贵到便宜。
    expect(rows.map((row) => row.annualCost)).toEqual([1_000_000, 120_000, 6_800_000]);
    // 验收 #3 点名的字样：第二拍必须有金额出处。
    expect(rows[0].label).toContain('年运营全口径');
    for (const row of rows.slice(0, 2)) {
      expect(row.source, `${row.label} 缺来源`).toMatch(/^https?:\/\//);
    }
    // 金额不是本模块写的：豪宅与飞机都等于 catalog 里那一项。
    const jet = catalog.dimensions
      .find((d) => d.id === 'transport')
      ?.options.find((o) => o.id === 'private-jet');
    expect(rows[0].annualCost).toBe(jet?.annualCost);
    const mansion = catalog.dimensions
      .find((d) => d.id === 'living')
      ?.options.find((o) => o.id === 'luxury-mansion');
    expect(rows[1].annualCost).toBe(mansion?.annualCost);
  });

  /**
   * 文档 §2 写的是「全顶档 $7,025,000」，目录实测是 $6,800,000。差值来自
   * 2026-10 的目录校准（26b4f4b）——文档那一行已回写为实测值。这条钉住
   * 现状：若哪天两边又不一致，先查 `topTierChoices` 的取值定义，再查文档。
   */
  it('全顶档生活 = 每个维度最贵项之和 = $6,800,000（不是文档旧写的 7,025,000）', () => {
    const choice = topTierChoices(catalog);
    expect(choice).toHaveLength(catalog.dimensions.length);
    expect(cardAnnualCost(choice, catalog, assumptions)).toBe(6_800_000);
  });

  it('$1M 撑卡 A 这套生活 ≈ 9.1 个月（手算 1,000,000 ÷ (1,317,000/12)）', () => {
    const months = runwayMonths(
      SIM_STARTING_CAPITAL,
      cardAnnualCost(CARD_A.choices, catalog, assumptions),
    );
    expect(months).toBeCloseTo(1_000_000 / (1_317_000 / 12), 6);
    expect(formatRunway(months as number)).toBe('9.1 个月');
  });

  it('加购游艇后掉到约 1.8 个月：这就是「起始金必须不够」的那一刀', () => {
    const months = runwayMonths(
      SIM_STARTING_CAPITAL,
      cardAnnualCost(CARD_A_BROKE, catalog, assumptions),
    );
    expect(months).toBeCloseTo(1_000_000 / (6_717_000 / 12), 6);
    expect(formatRunway(months as number)).toBe('1.8 个月');
  });

  it('英文态走英文单位：9.1 months / 9.8 years，不混中文', () => {
    expect(formatRunway(1_000_000 / (1_317_000 / 12), 'en')).toBe('9.1 months');
    expect(formatRunway(1_000_000 / (101_600 / 12), 'en')).toBe('9.8 years');
    expect(formatRunway(12, 'en')).toBe('1 year');
  });

  it('撑得住的生活说年数：默认生活 $101,600 → 9.8 年', () => {
    const months = runwayMonths(SIM_STARTING_CAPITAL, 101_600);
    expect(months).toBeCloseTo(1_000_000 / (101_600 / 12), 6);
    expect(formatRunway(months as number)).toBe('9.8 年');
  });

  it('年成本为 0 或负数时不硬算（返回 null，不产 Infinity）', () => {
    expect(runwayMonths(1_000_000, 0)).toBeNull();
    expect(runwayMonths(1_000_000, -5)).toBeNull();
    expect(runwayMonths(0, 100)).toBeNull();
  });
});

describe('购物池（M3 · S1）', () => {
  it('入池 = 标了 kind；普通人锚点档不进池', () => {
    const ids = shoppingPool(catalog).map((item) => `${item.dimension}/${item.option.id}`);
    for (const excluded of [
      'living/small-rental',
      'transport/public-transit',
      'family/single-no-kids',
      'travel/staycation',
      'health-insurance/basic-insurance',
      'dining-daily/home-cooking',
      'flexibility/modest-buffer',
    ]) {
      expect(ids, `${excluded} 不该进购物池`).not.toContain(excluded);
    }
    // 每个维度的富豪档都必须在池里，否则购物区会缺一整个维度。
    expect(ids).toContain('living/luxury-mansion');
    expect(ids).toContain('transport/private-jet');
    expect(ids).toContain('travel/superyacht');
    expect(ids).toContain('flexibility/discretionary-large');
  });

  it('池项的 kind / joy / source 齐全（m3-task-breakdown §0 G1 要求测试钉住）', () => {
    for (const item of shoppingPool(catalog)) {
      const key = `${item.dimension}/${item.option.id}`;
      expect(item.option.kind, `${key} 缺 kind`).toBeDefined();
      expect(item.option.joy, `${key} 缺 joy`).toBeDefined();
      expect(item.option.source, `${key} 缺来源`).toMatch(/^https?:\/\//);
    }
  });

  it('三类 kind 都有代表，且体验类不承担持有成本', () => {
    const pool = shoppingPool(catalog);
    const kinds = new Set(pool.map((item) => item.option.kind));
    for (const kind of ['asset', 'consumer', 'experience'] as const) {
      expect(kinds, `池里没有 ${kind} 类`).toContain(kind);
    }
    for (const item of pool) {
      if (item.option.kind === 'experience') {
        expect(item.option.resellable, `${item.option.id} 体验类不应可转卖`).toBe(false);
        expect(item.option.carryingJoy, `${item.option.id} 体验类无持有情绪`).toBeUndefined();
      }
    }
  });

  it('每个维度都有可购项（购物区不会缺一个维度）', () => {
    const dims = new Set(shoppingPool(catalog).map((item) => item.dimension));
    for (const dimension of catalog.dimensions) {
      expect(dims, `维度 ${dimension.id} 没有可购项`).toContain(dimension.id);
    }
  });

  it('web 侧补的两个纯体验项在池里，池总数 = 12 目录项 + 2 体验项 = 14', () => {
    const pool = shoppingPool(catalog);
    expect(pool).toHaveLength(14);
    const ids = pool.map((item) => item.option.id);
    expect(ids).toContain('exp-private-jet-world-tour');
    expect(ids).toContain('exp-met-gala-ticket');
  });

  it('纯体验项是一次性花费：不可转卖、无持有情绪、无购买价', () => {
    const pool = shoppingPool(catalog);
    for (const id of ['exp-private-jet-world-tour', 'exp-met-gala-ticket']) {
      const item = pool.find((entry) => entry.option.id === id);
      expect(item?.option.kind).toBe('experience');
      expect(item?.option.resellable).toBe(false);
      expect(item?.option.carryingJoy).toBeUndefined();
      expect(item?.option.purchasePrice ?? 0).toBe(0);
      expect(item?.option.source).toMatch(/^https?:\/\//);
      expect(item?.option.note).toBeTruthy();
    }
  });

  it('体验项只存在于 web 侧购物池，core catalog 仍是 23 项且不被污染', () => {
    const count = catalog.dimensions.reduce((sum, dimension) => sum + dimension.options.length, 0);
    expect(count).toBe(23);
    for (const dimension of catalog.dimensions) {
      expect(dimension.options.map((option) => option.id)).not.toContain(
        'exp-private-jet-world-tour',
      );
      expect(dimension.options.map((option) => option.id)).not.toContain('exp-met-gala-ticket');
    }
  });
});

describe('购物即记账（M3 S3）', () => {
  const pool = shoppingPool(catalog);
  const baseline = CARD_A.choices.map((choice) => ({
    dimension: choice.dimension,
    optionId: choice.optionId,
  }));
  const cashflow = CARD_A_ANNUAL_INCOME - CARD_A_LAST_YEAR_COST;

  it('空车：新增 0，下一期 = 基线 $1,317,000；基线本身已 78% → 黄（与账单日横幅一致）', () => {
    const summary = cartBurdenSummary([], pool, baseline, 1_317_000, cashflow);
    expect(summary.addedAnnualCost).toBe(0);
    expect(summary.totalAnnualCost).toBe(1_317_000);
    expect(summary.status).toBe('yellow');
    expect(summary.ratioHint).toBe(false);
  });

  it('逐项（非逐维）求和：游艇 $5.4M + Met Gala $100k = $5.5M 新增，状态红', () => {
    const cart = [
      { dimension: 'travel', optionId: 'superyacht' },
      { dimension: 'flexibility', optionId: 'exp-met-gala-ticket' },
    ];
    const summary = cartBurdenSummary(cart, pool, baseline, 1_317_000, cashflow);
    expect(summary.addedAnnualCost).toBe(5_500_000);
    expect(summary.totalAnnualCost).toBe(6_817_000);
    expect(summary.status).toBe('red');
    expect(summary.rate).toBeCloseTo(6_817_000 / cashflow, 6);
  });

  it('基线已拥有的项加车不重复计费；重复条目不双算', () => {
    const cart = [
      { dimension: 'living', optionId: 'luxury-mansion' },
      { dimension: 'travel', optionId: 'superyacht' },
      { dimension: 'travel', optionId: 'superyacht' },
    ];
    expect(cartAddedAnnualCost(cart, pool, baseline)).toBe(5_400_000);
  });

  it('解析不到池项的坏条目计 0，不产 NaN', () => {
    const cart = [
      { dimension: 'travel', optionId: 'ghost-option' },
      { dimension: 'nope', optionId: 'whatever' },
    ];
    const summary = cartBurdenSummary(cart, pool, baseline, 1_317_000, cashflow);
    expect(summary.addedAnnualCost).toBe(0);
    expect(Number.isNaN(summary.totalAnnualCost)).toBe(false);
  });

  it('kind 件数统计与 1:1 提示：只买资产不买体验时提示', () => {
    expect(
      cartKindCounts(
        [
          { dimension: 'travel', optionId: 'superyacht' },
          { dimension: 'transport', optionId: 'private-jet' },
        ],
        pool,
      ),
    ).toEqual({ asset: 2, consumer: 0, experience: 0 });
    const withExp = cartBurdenSummary(
      [
        { dimension: 'travel', optionId: 'superyacht' },
        { dimension: 'flexibility', optionId: 'exp-met-gala-ticket' },
      ],
      pool,
      baseline,
      1_317_000,
      cashflow,
    );
    expect(withExp.assetCount).toBe(1);
    expect(withExp.experienceCount).toBe(1);
    expect(withExp.ratioHint).toBe(false);
    const assetOnly = cartBurdenSummary(
      [{ dimension: 'travel', optionId: 'superyacht' }],
      pool,
      baseline,
      1_317_000,
      cashflow,
    );
    expect(assetOnly.ratioHint).toBe(true);
  });

  it('品类金额拆桶：游艇（资产）$5.4M + 晚宴（体验）$100k，三桶之和 = 新增总额', () => {
    const cart = [
      { dimension: 'travel', optionId: 'superyacht' },
      { dimension: 'flexibility', optionId: 'exp-met-gala-ticket' },
    ];
    const costs = cartKindCosts(cart, pool, baseline);
    expect(costs).toEqual({ asset: 5_400_000, consumer: 0, experience: 100_000 });
    expect(costs.asset + costs.consumer + costs.experience).toBe(
      cartAddedAnnualCost(cart, pool, baseline),
    );
  });

  it('品类金额拆桶与求和同口径：基线项不重复计、重复项不双算、坏项计 0', () => {
    const cart = [
      { dimension: 'living', optionId: 'luxury-mansion' }, // 基线已拥有
      { dimension: 'travel', optionId: 'superyacht' },
      { dimension: 'travel', optionId: 'superyacht' }, // 重复
      { dimension: 'travel', optionId: 'ghost' }, // 坏条目
    ];
    const costs = cartKindCosts(cart, pool, baseline);
    expect(costs.asset).toBe(5_400_000);
    expect(costs.consumer).toBe(0);
    expect(costs.experience).toBe(0);
    expect(costs.asset + costs.consumer + costs.experience).toBe(
      cartAddedAnnualCost(cart, pool, baseline),
    );
  });
});

describe('操作通道（T3 · 收购谈判 / 加杠杆）', () => {
  const annualCost = cardAnnualCost(CARD_A.choices, initialCatalogUSD, DEFAULT_ASSUMPTIONS);
  const cashflow = CARD_A_ANNUAL_INCOME - CARD_A_LAST_YEAR_COST;

  it('加杠杆：借 2× 现金流、5% 年息，负担率从 78% 升到 88.3%（手算复核）', () => {
    const deal = leverageDeal(annualCost, cashflow);
    // 借入 = 1,683,000 × 2 = 3,366,000；年息 = 168,300；总成本 = 1,485,300
    expect(deal.borrow).toBe(cashflow * LEVERAGE_MULTIPLE);
    expect(deal.interest).toBeCloseTo(cashflow * LEVERAGE_MULTIPLE * DEAL_RATE);
    expect(deal.totalCost).toBeCloseTo(annualCost + 168_300);
    expect(deal.rate).toBeCloseTo(1_485_300 / cashflow);
    expect(deal.status).toBe('yellow');
  });

  it('加杠杆临界倍数 ≈ 4.35×：超过它利息就吃光现金流', () => {
    const deal = leverageDeal(annualCost, cashflow);
    expect(deal.breakMultiple).toBeCloseTo((cashflow - annualCost) / (cashflow * DEAL_RATE));
    expect(deal.breakMultiple).toBeCloseTo(4.35, 2);
  });

  it('收购：6× 年营收估值，全杠杆年息 90 万 → 负担率 131.7% 红', () => {
    const deal = acquisitionDeal(CARD_A_ANNUAL_INCOME, annualCost, cashflow);
    expect(deal.revenue).toBe(CARD_A_ANNUAL_INCOME);
    expect(deal.valuation).toBe(CARD_A_ANNUAL_INCOME * ACQUISITION_MULTIPLE);
    expect(deal.interest).toBeCloseTo(18_000_000 * DEAL_RATE);
    expect(deal.totalCost).toBeCloseTo(annualCost + 900_000);
    expect(deal.rate).toBeCloseTo(2_217_000 / cashflow);
    expect(deal.status).toBe('red');
  });

  it('收购谈判底价 ≈ 2.44×：估值砍到它以内才不断裂', () => {
    const deal = acquisitionDeal(CARD_A_ANNUAL_INCOME, annualCost, cashflow);
    expect(deal.breakMultiple).toBeCloseTo((cashflow - annualCost) / (CARD_A_ANNUAL_INCOME * DEAL_RATE));
    expect(deal.breakMultiple).toBeCloseTo(2.44, 2);
  });

  it('非法输入收敛：成本或现金流非正 → 空结果不产 NaN', () => {
    for (const [c, f] of [
      [0, 1_683_000],
      [1_317_000, 0],
      [-1, -1],
    ] as const) {
      const l = leverageDeal(c, f);
      const a = acquisitionDeal(3_000_000, c, f);
      expect(Number.isNaN(l.rate)).toBe(false);
      expect(Number.isNaN(a.rate)).toBe(false);
      expect(l.totalCost).toBe(c);
      expect(a.totalCost).toBe(c);
    }
  });
});

describe('剧情通道（T3 · 随机事件：危机 / 诉讼 / 分产）', () => {
  const annualCost = cardAnnualCost(CARD_A.choices, initialCatalogUSD, DEFAULT_ASSUMPTIONS);
  const cashflow = CARD_A_ANNUAL_INCOME - CARD_A_LAST_YEAR_COST;

  it('三张卡齐全且顺序稳定（lawsuit / crisis / split）', () => {
    const events = plotEvents(CARD_A_ANNUAL_INCOME, annualCost, CARD_A_LAST_YEAR_COST);
    expect(events.map((e) => e.id)).toEqual(['lawsuit', 'crisis', 'split']);
  });

  it('诉讼：现金流减半 → 负担率翻倍（0.78 → 1.56）红', () => {
    const [lawsuit] = plotEvents(CARD_A_ANNUAL_INCOME, annualCost, CARD_A_LAST_YEAR_COST);
    expect(lawsuit.cashflow).toBeCloseTo(cashflow * 0.5);
    expect(lawsuit.rate).toBeCloseTo(annualCost / (cashflow * 0.5));
    expect(lawsuit.status).toBe('red');
  });

  it('危机：股权收入缩水 30% → 现金流 783k，负担率 168.2% 红', () => {
    const [, crisis] = plotEvents(CARD_A_ANNUAL_INCOME, annualCost, CARD_A_LAST_YEAR_COST);
    const crisisCashflow = CARD_A_ANNUAL_INCOME * 0.7 - CARD_A_LAST_YEAR_COST;
    expect(crisis.cashflow).toBeCloseTo(crisisCashflow);
    expect(crisis.rate).toBeCloseTo(annualCost / crisisCashflow);
    expect(crisis.status).toBe('red');
  });

  it('分产：可支配现金流永久减半（与诉讼同一比例但口径独立）', () => {
    const [, , split] = plotEvents(CARD_A_ANNUAL_INCOME, annualCost, CARD_A_LAST_YEAR_COST);
    expect(split.cashflow).toBeCloseTo(cashflow * 0.5);
    expect(split.status).toBe('red');
  });

  it('非法输入：任一参数非正 → 每张卡都是空结果，不产 NaN', () => {
    for (const [i, c, last] of [
      [0, 1_317_000, 1_317_000],
      [3_000_000, 0, 1_317_000],
      [3_000_000, 1_317_000, 0],
      [-1, -1, -1],
    ] as const) {
      for (const e of plotEvents(i, c, last)) {
        expect(Number.isNaN(e.rate)).toBe(false);
      }
    }
  });
});
