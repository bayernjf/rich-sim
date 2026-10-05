import { describe, expect, it } from 'vitest';
import { initialCatalogUSD } from '@rich-sim/core';
import { scenarioAnnualCost } from '@rich-sim/core';
import { DEFAULT_ASSUMPTIONS } from './defaults';
import {
  BILLS_PER_PAGE,
  CARD_A,
  CARD_A_ANNUAL_INCOME,
  CARD_A_BROKE,
  CARD_A_LAST_YEAR_COST,
  SELL_DISCOUNT,
  cardAnnualCost,
  cardBills,
  cardBurden,
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

  it('变卖折价是 §2.4 的 75%', () => {
    expect(SELL_DISCOUNT).toBe(0.75);
  });
});
