import { beforeEach, describe, expect, it } from 'vitest';
import { initialCatalogUSD } from '@rich-sim/core';
import { DRAFT_KEY } from './draft';
import { SIM_KEY, claimSim } from './sim-draft';
import { adoptCartAsGoal, cartGoalAnnualCost } from './sim-bridge';

function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const map = new Map(Object.entries(initial));
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, String(value)),
      removeItem: (key: string) => void map.delete(key),
      clear: () => map.clear(),
      key: (index: number) => [...map.keys()][index] ?? null,
      get length() { return map.size; },
    },
  });
  return map;
}

describe('购物车目标年成本（S4）', () => {
  it('空车 = 卡 A 基线 $1,317,000；逐项叠加基线项不双算', () => {
    expect(cartGoalAnnualCost([])).toBe(1_317_000);
    // 豪宅已是卡 A 基线生活的一部分，不重复加；游艇是新购。
    const cart = [
      { dimension: 'living', optionId: 'luxury-mansion' },
      { dimension: 'travel', optionId: 'superyacht' },
    ];
    expect(cartGoalAnnualCost(cart)).toBe(6_717_000);
  });

  it('体验项同口径计入：基线 + Met Gala $100,000', () => {
    expect(
      cartGoalAnnualCost([{ dimension: 'flexibility', optionId: 'exp-met-gala-ticket' }]),
    ).toBe(1_417_000);
  });
});

describe('一键成目标 · SIM→REAL 单向桥（S4 · G4）', () => {
  beforeEach(() => installStorage());

  it('无真实草稿：建最小草稿写 goalOverride，落点去财务录入', () => {
    const dest = adoptCartAsGoal([{ dimension: 'travel', optionId: 'superyacht' }]);
    expect(dest).toBe('/app/finance');
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    expect(draft.goalOverride).toEqual({ annualCost: 6_717_000, from: 'sim-cart' });
    expect(draft.profile).toBeNull();
    // choices 写了每维最贵项作展示回显（7 维各一件）。
    expect(draft.choices).toHaveLength(initialCatalogUSD.dimensions.length);
    expect(draft.schemaVersion).toBe(1);
  });

  it('已录完财务：保留 profile/currency/assumptions，落点去结果页', () => {
    installStorage({
      [DRAFT_KEY]: JSON.stringify({
        schemaVersion: 1,
        choices: [],
        profile: { income: 20000, expense: 10000, savings: 500000, debt: 0, currency: 'USD' },
        currency: 'USD',
        assumptions: null,
        updatedAt: '2026-10-06T00:00:00.000Z',
      }),
    });
    const dest = adoptCartAsGoal([]);
    expect(dest).toBe('/app/result');
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    expect(draft.profile.income).toBe(20000);
    expect(draft.goalOverride).toEqual({ annualCost: 1_317_000, from: 'sim-cart' });
  });

  it('结构性红线：走过桥后 sim 账本原样不动，REAL 里没有任何起始金/资产占比', () => {
    claimSim(1_000_000);
    const simBefore = localStorage.getItem(SIM_KEY);
    adoptCartAsGoal([{ dimension: 'travel', optionId: 'superyacht' }]);
    expect(localStorage.getItem(SIM_KEY)).toBe(simBefore);
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    expect(JSON.stringify(draft)).not.toContain('startingCapital');
    expect(draft.goalOverride).toEqual({ annualCost: 6_717_000, from: 'sim-cart' });
    expect(Object.keys(draft.goalOverride).sort()).toEqual(['annualCost', 'from']);
  });

  it('坏 id 不污染目标金额（计 0，不产 NaN）', () => {
    adoptCartAsGoal([{ dimension: 'travel', optionId: 'ghost' }]);
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    expect(draft.goalOverride.annualCost).toBe(1_317_000);
    expect(Number.isNaN(draft.goalOverride.annualCost)).toBe(false);
  });
});
