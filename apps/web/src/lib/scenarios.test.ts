/**
 * M4 S1 · T01 情景纯函数层测试。
 *
 * 期望值仍走「先独立手算、再断言」的纪律（见 `results.test.ts` 头）：
 * 基线现状 = 月收入 15,000 / 月支出 10,000 / 存款 100,000 / 无负债，
 * 目标年成本 80,000 USD -> 够用线 2,000,000（= 80,000 / 0.04）。
 *   - 基线（月净 5,000、年储 60,000）：首达年 = 20（已在 results.test.ts 钉住）。
 *   - 涨薪 +10%（月净 6,500、年储 78,000）：
 *       1.04^16 = 1.872981 -> 余额 ≈ 187,298 + 78,000×21.8245 ≈ 1,889,609 < 2e6
 *       1.04^17 = 1.947900 -> 余额 ≈ 194,790 + 78,000×23.6975 ≈ 2,043,195 ≥ 2e6
 *       -> 首达年 = 17，年限差 = 17 - 20 = -3。
 *   - 失业（收入 0）-> 月净为负 -> no-net-savings（一等状态，不是错误）。
 */
import { describe, expect, it } from 'vitest';
import type { Assumptions, Catalog, FxSnapshot, Profile } from '@rich-sim/core';
import type { Draft } from './draft';
import {
  SCENARIO_DEFAULTS,
  SCENARIO_IDS,
  applyScenario,
  compareScenarios,
  type Scenario,
} from './scenarios';

const fx: FxSnapshot = {
  base: 'USD',
  rates: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7.12, HKD: 7.8 },
  date: '2026-10-03',
  source: 'static-snapshot',
  version: 'test',
};

function assumptions(over: Partial<Assumptions> = {}): Assumptions {
  return {
    returnRate: 0.04,
    withdrawalRate: 0.04,
    inflation: 0.03,
    assumptionsVersion: 'test',
    fx,
    ...over,
  };
}

function catalogWith(annualCostUSD: number): Catalog {
  return {
    currency: 'USD',
    dimensions: [
      {
        id: 'living',
        label: '居住',
        options: [
          { id: 'opt', label: '测试档', annualCost: annualCostUSD, isDefault: true },
        ],
      },
    ],
  };
}

function makeDraft(over: Partial<Draft> = {}): Draft {
  return {
    schemaVersion: 1,
    choices: [],
    profile: { income: 15000, expense: 10000, savings: 100000, debt: 0, currency: 'USD' },
    currency: 'USD',
    assumptions: assumptions(),
    updatedAt: '2026-10-07T00:00:00.000Z',
    ...over,
  };
}

const baseProfile: Profile = {
  income: 15000,
  expense: 10000,
  savings: 100000,
  debt: 0,
  currency: 'USD',
};

const catalog = catalogWith(80_000);

describe('applyScenario', () => {
  it('涨薪：只改 income，其余字段不动', () => {
    const p = applyScenario(baseProfile, { id: 'raise', value: 10 });
    expect(p.income).toBeCloseTo(16_500, 10);
    expect(p.expense).toBe(baseProfile.expense);
    expect(p.savings).toBe(baseProfile.savings);
    expect(p.debt).toBe(baseProfile.debt);
    expect(p.currency).toBe(baseProfile.currency);
  });

  it('副业：income 加上月增收额', () => {
    expect(applyScenario(baseProfile, { id: 'side', value: 500 }).income).toBe(15_500);
  });

  it('失业：income 归零，expense 不变（这就是 no-net-savings 的来源）', () => {
    const p = applyScenario(baseProfile, { id: 'jobless' });
    expect(p.income).toBe(0);
    expect(p.expense).toBe(10_000);
  });

  it('大额支出：减 savings，不是加 expense（一次性支出，不是月度开支）', () => {
    const p = applyScenario(baseProfile, { id: 'big-expense', value: 20_000 });
    expect(p.savings).toBe(80_000);
    expect(p.expense).toBe(baseProfile.expense);
    expect(p.income).toBe(baseProfile.income);
  });

  it('不改原对象', () => {
    const before = { ...baseProfile };
    applyScenario(baseProfile, { id: 'raise', value: 50 });
    applyScenario(baseProfile, { id: 'jobless' });
    applyScenario(baseProfile, { id: 'big-expense', value: 999 });
    expect(baseProfile).toEqual(before);
  });

  it('坏幅度收敛为 0：NaN / Infinity / 负数 / 缺失 都等于原值', () => {
    const bad: (number | undefined)[] = [Number.NaN, Infinity, -100, undefined];
    for (const value of bad) {
      expect(applyScenario(baseProfile, { id: 'raise', value }).income).toBe(baseProfile.income);
      expect(applyScenario(baseProfile, { id: 'side', value }).income).toBe(baseProfile.income);
      expect(applyScenario(baseProfile, { id: 'big-expense', value }).savings).toBe(
        baseProfile.savings,
      );
    }
  });

  it('默认幅度表与 id 清单一一对应', () => {
    expect(Object.keys(SCENARIO_DEFAULTS).sort()).toEqual([...SCENARIO_IDS].sort());
    expect(SCENARIO_DEFAULTS.jobless).toBeNull();
  });
});

describe('compareScenarios', () => {
  const raise: Scenario = { id: 'raise', value: 10 };

  it('基线不受情景影响，且与单独调用 computeResults 一致', () => {
    const { baseline, outcomes } = compareScenarios(makeDraft(), catalog, 'zh', [raise]);
    expect(baseline.status).toBe('ok');
    if (baseline.status !== 'ok') return;
    expect(baseline.projection.status).toBe('reachable');
    if (baseline.projection.status === 'reachable') {
      expect(baseline.projection.years).toBe(20); // 与 results.test.ts 同一手算
    }
    expect(outcomes).toHaveLength(1);
  });

  it('涨薪 10%：年限从 20 缩到 17，年限差 -3（手算见文件头）', () => {
    const { outcomes } = compareScenarios(makeDraft(), catalog, 'zh', [raise]);
    const outcome = outcomes[0];
    if (!outcome || outcome.results.status !== 'ok') throw new Error('情景结果不可用');
    expect(outcome.yearsDelta).toBe(-3);
    expect(outcome.statusChanged).toBe(false);
    expect(outcome.results.projection.status).toBe('reachable');
  });

  it('失业：状态变 no-net-savings，且年限不可比（null，不是 0）', () => {
    const { outcomes } = compareScenarios(makeDraft(), catalog, 'zh', [{ id: 'jobless' }]);
    const outcome = outcomes[0];
    if (!outcome || outcome.results.status !== 'ok') throw new Error('情景结果不可用');
    expect(outcome.results.projection.status).toBe('no-net-savings');
    expect(outcome.statusChanged).toBe(true);
    expect(outcome.yearsDelta).toBeNull();
  });

  it('大额支出：年限变长（delta > 0），状态不变', () => {
    const { outcomes } = compareScenarios(makeDraft(), catalog, 'zh', [
      { id: 'big-expense', value: 50_000 },
    ]);
    const outcome = outcomes[0];
    if (!outcome || outcome.results.status !== 'ok') throw new Error('情景结果不可用');
    expect(outcome.yearsDelta).toBeGreaterThan(0);
    expect(outcome.statusChanged).toBe(false);
  });

  it('空情景数组：outcomes 为空，基线照常返回', () => {
    const { baseline, outcomes } = compareScenarios(makeDraft(), catalog, 'zh', []);
    expect(outcomes).toEqual([]);
    expect(baseline.status).toBe('ok');
  });

  it('无 profile：基线与其后各条都走 no-profile，不算状态变化', () => {
    const { baseline, outcomes } = compareScenarios(
      makeDraft({ profile: null }),
      catalog,
      'zh',
      [{ id: 'raise', value: 10 }, { id: 'jobless' }],
    );
    expect(baseline).toEqual({ status: 'no-profile' });
    for (const outcome of outcomes) {
      expect(outcome.results).toEqual({ status: 'no-profile' });
      expect(outcome.statusChanged).toBe(false);
      expect(outcome.yearsDelta).toBeNull();
    }
  });

  it('四条情景可同时比较，且不改动传入的 draft', () => {
    const draft = makeDraft();
    const snapshot = JSON.parse(JSON.stringify(draft));
    const scenarios: Scenario[] = SCENARIO_IDS.map((id) => ({
      id,
      value: SCENARIO_DEFAULTS[id] ?? undefined,
    }));
    const { outcomes } = compareScenarios(draft, catalog, 'zh', scenarios);
    expect(outcomes.map((o) => o.id)).toEqual([...SCENARIO_IDS]);
    expect(JSON.parse(JSON.stringify(draft))).toEqual(snapshot);
  });
});
