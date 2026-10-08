/**
 * T03/T04 · Engine tests. Covers technical-design.md §4.1 (10 cases) and
 * §4.2 (convert). Expectations below were computed INDEPENDENTLY first
 * (closed-form formulas / a separate Python trace), not trusted from the
 * implementation output.
 */
import { describe, expect, it } from 'vitest';
import {
  buildMilestones,
  convert,
  enoughLine,
  gap,
  profileMonthlyExpense,
  project,
  scenarioAnnualCost,
} from './functions';
import type { Assumptions, Catalog, FxSnapshot, Goal, Profile } from './types';

const fx: FxSnapshot = {
  base: 'USD',
  rates: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7.12, HKD: 7.8 },
  date: '2026-10-03',
  source: 'static-snapshot',
  version: '1',
};

function assumptions(over: Partial<Assumptions> = {}): Assumptions {
  return {
    returnRate: 0.04,
    withdrawalRate: 0.04,
    inflation: 0.03,
    assumptionsVersion: 'm1-2026-10-03',
    fx,
    ...over,
  };
}

function profile(over: Partial<Profile> = {}): Profile {
  return { income: 15000, expense: 10000, savings: 100000, debt: 0, currency: 'CNY', ...over };
}

describe('profileMonthlyExpense (F2 · 逐项支出取数)', () => {
  it('无 breakdown：回落 expense（旧草稿逐位不变）', () => {
    expect(profileMonthlyExpense(profile())).toBe(10000);
  });

  it('有 breakdown：取四项之和，忽略 expense', () => {
    const p = profile({
      expense: 10000, // 故意写一个不同的旧值
      expenseBreakdown: { housing: 4000, transport: 1500, food: 2500, other: 1000 },
    });
    expect(profileMonthlyExpense(p)).toBe(9000);
  });

  it('breakdown 全 0：月支出为 0（合法）', () => {
    const p = profile({
      expenseBreakdown: { housing: 0, transport: 0, food: 0, other: 0 },
    });
    expect(profileMonthlyExpense(p)).toBe(0);
  });
});

describe('enoughLine', () => {
  // Hand-check ① (independent): 400,000 / 0.04 = 10,000,000.
  it('基准: 年成本 40 万 @ 提取率 4% -> 1000 万', () => {
    expect(enoughLine(400_000, assumptions())).toBe(10_000_000);
  });

  it('提取率 5% -> 800 万 (独立: 400000/0.05 = 8,000,000)', () => {
    expect(enoughLine(400_000, assumptions({ withdrawalRate: 0.05 }))).toBe(8_000_000);
  });
});

describe('project', () => {
  const goal: Goal = { kind: 'net-worth', value: 1_000_000 };

  // Hand-check ② (independent closed form):
  //   n = ln((target*r + annual) / (start*r + annual)) / ln(1+r)
  //     = ln((1e6*0.04 + 60000)/(1e5*0.04 + 60000)) / ln(1.04)
  //     = ln(100000/64000) / ln(1.04) = ln(1.5625)/ln(1.04) ≈ 11.38
  //   -> first integer year = 12. Independent trace:
  //     year 11 balance = 963,126.49 (< 1,000,000),
  //     year 12 balance = 1,061,651.55 (>= 1,000,000).
  // Profile: savings 10万, income 15000 / expense 10000 -> 月净 5千 = 年 6万.
  it('可达 (手算核对): years = 12', () => {
    const r = project(profile(), goal, assumptions());
    expect(r.status).toBe('reachable');
    if (r.status === 'reachable') {
      expect(r.years).toBe(12);
      // savingsRate = 5000 / 15000 = 1/3
      expect(r.savingsRate).toBeCloseTo(1 / 3, 10);
    }
  });

  it('不可达: 年储蓄过低, 60 年内达不到', () => {
    // monthly net = 1000 -> annual 12000; target 10,000,000.
    // Even the closed form needs n >> 60 years.
    const p = profile({ income: 11000, expense: 10000 });
    const r = project(p, { kind: 'net-worth', value: 10_000_000 }, assumptions());
    expect(r.status).toBe('unreachable');
  });

  it('无净储蓄: 月支出 >= 月收入', () => {
    expect(project(profile({ income: 10000, expense: 12000 }), goal, assumptions()).status).toBe(
      'no-net-savings',
    );
    expect(project(profile({ income: 10000, expense: 10000 }), goal, assumptions()).status).toBe(
      'no-net-savings',
    );
  });

  it('边界: 目标 <= 起始本金 -> reachable, years = 0', () => {
    const r = project(profile({ savings: 2_000_000 }), goal, assumptions());
    expect(r.status).toBe('reachable');
    if (r.status === 'reachable') expect(r.years).toBe(0);
  });

  it('边界: r = 0 退化为线性增长 (独立: ceil((1e6-1e5)/6e4) = 15)', () => {
    const r = project(profile(), goal, assumptions({ returnRate: 0 }));
    expect(r.status).toBe('reachable');
    if (r.status === 'reachable') expect(r.years).toBe(15);
  });

  it('边界: 起始存款 = 0, 仅靠年储蓄按 r 复利', () => {
    // start=0, annual 60000, target 100000, r=0.04:
    // year1 = 60000; year2 = 60000*1.04 + 60000 = 122400 -> years = 2.
    const r = project(profile({ savings: 0 }), { kind: 'net-worth', value: 100_000 }, assumptions());
    expect(r.status).toBe('reachable');
    if (r.status === 'reachable') expect(r.years).toBe(2);
  });

  it('enough-line 目标 = value / withdrawalRate (独立: 40万/4%=1000万, n≈50.29 -> years=51)', () => {
    // Independent closed form: n = ln((1e7*0.04+6e4)/(1e5*0.04+6e4))/ln(1.04)
    //   = ln(460000/64000)/ln(1.04) ≈ 50.29 -> first integer year = 51.
    // Trace: year 50 = 9,870,693 (< 1e7), year 51 = 10,325,521 (>= 1e7).
    const r = project(profile(), { kind: 'enough-line', value: 400_000 }, assumptions());
    expect(r.status).toBe('reachable');
    if (r.status === 'reachable') expect(r.years).toBe(51);
  });

  it('未知 goal kind 抛错', () => {
    expect(() =>
      project(profile(), { kind: 'bogus', value: 1 } as unknown as Goal, assumptions()),
    ).toThrow(/Unknown goal kind/);
  });
});

describe('scenarioAnnualCost', () => {
  const catalog: Catalog = {
    currency: 'CNY',
    dimensions: [
      {
        id: 'housing',
        label: '居住',
        options: [
          { id: 'small', label: '一居室', annualCost: 60_000 },
          { id: 'villa', label: '别墅', annualCost: 300_000 },
        ],
      },
      {
        id: 'transport',
        label: '出行',
        options: [
          { id: 'bus', label: '公交', annualCost: 6_000 },
          { id: 'tesla', label: '电车', annualCost: 60_000 },
        ],
      },
    ],
  };

  it('M1 = 各选项年成本简单求和, breakdown 按 dimensionId 分组', () => {
    const cost = scenarioAnnualCost(
      [
        { dimension: 'housing', optionId: 'villa' },
        { dimension: 'transport', optionId: 'bus' },
      ],
      catalog,
      assumptions(),
    );
    expect(cost.annualCost).toBe(306_000);
    expect(cost.breakdown).toEqual({ housing: 300_000, transport: 6_000 });
  });

  it('未知 optionId 抛 Error', () => {
    expect(() =>
      scenarioAnnualCost([{ dimension: 'housing', optionId: 'yacht' }], catalog, assumptions()),
    ).toThrow(/Unknown optionId/);
  });
});

describe('gap', () => {
  // Independent annuity check (Python): start=100000, target=1e6, r=4%, 30y:
  //   f = 1.04^30 ≈ 3.2434; P = (1e6 - 1e5*f)*0.04/(f-1) ≈ 12,047.09
  // With current annual = 12,000 (月净 1000): annualGap ≈ 47.09.
  it('30 年达标所需年储蓄反解 (独立 ≈ 12,047.09, gap ≈ 47.09)', () => {
    const p = profile({ income: 11000, expense: 10000 });
    const g = gap(p, { kind: 'net-worth', value: 1_000_000 }, assumptions());
    expect(g.annualGap).toBeCloseTo(12_047.09 - 12_000, 2);
    expect(g.yearsAtCurrentPace).toBeGreaterThan(30);
  });

  it('不可达时 yearsAtCurrentPace = 60 (target 1000万 @ 年储蓄1.2万, 独立 n≈82.8)', () => {
    const p = profile({ income: 11000, expense: 10000 });
    const g = gap(p, { kind: 'net-worth', value: 10_000_000 }, assumptions());
    expect(g.yearsAtCurrentPace).toBe(60);
  });

  it('当前年储蓄已超过 30 年所需 -> annualGap = 0', () => {
    const g = gap(profile(), { kind: 'net-worth', value: 500_000 }, assumptions());
    expect(g.annualGap).toBe(0);
  });

  it('no-net-savings 时 yearsAtCurrentPace = 0', () => {
    const g = gap(
      profile({ income: 10000, expense: 12000 }),
      { kind: 'net-worth', value: 1_000_000 },
      assumptions(),
    );
    expect(g.yearsAtCurrentPace).toBe(0);
  });

  it('r = 0 时退化: P = (target - start)/30', () => {
    // start 10万, target 100万 -> required annual = 30,000; current 60,000 -> gap 0.
    const g = gap(profile(), { kind: 'net-worth', value: 1_000_000 }, assumptions({ returnRate: 0 }));
    expect(g.annualGap).toBe(0);
  });
});

describe('buildMilestones', () => {
  it('>=3 阶段, 数值全部来自 profile, action 含「示例路径」', () => {
    const p = profile(); // income 15000, expense 10000, savings 100000
    const ms = buildMilestones(p, { kind: 'net-worth', value: 1_000_000 }, assumptions());
    expect(ms.length).toBeGreaterThanOrEqual(3);

    // Stage 1: 储蓄率提到 20% -> 月储蓄 = 0.2*15000 = 3000
    expect(ms[0]?.stage).toBe(1);
    expect(ms[0]?.goalValue).toBe(3_000);
    expect(ms[0]?.years).toBeGreaterThan(0);

    // Stage 2: 首笔本金 = 6 * 月支出 = 60000; 月净 5000 -> 12 个月 = 1 年
    expect(ms[1]?.stage).toBe(2);
    expect(ms[1]?.goalValue).toBe(60_000);
    expect(ms[1]?.years).toBe(1);

    // Stage 3: 收入 +10% -> 月净 = 16500-10000 = 6500; goalValue = target capital
    expect(ms[2]?.stage).toBe(3);
    expect(ms[2]?.goalValue).toBe(1_000_000);
    expect(ms[2]?.years).toBeLessThanOrEqual(60);

    for (const m of ms) expect(m.action).toContain('示例路径');
  });
});

describe('convert (§4.2)', () => {
  it('基准换算: 100 USD @ CNY 7.12 -> 712', () => {
    expect(convert(100, 'USD', 'CNY', fx)).toBeCloseTo(712, 6);
  });

  it('往返误差 < 0.01% (USD->EUR->USD)', () => {
    const round = convert(convert(100, 'USD', 'EUR', fx), 'EUR', 'USD', fx);
    expect(Math.abs(round - 100) / 100).toBeLessThan(1e-4);
  });

  it('快照缺币种抛错', () => {
    const bad = { ...fx, rates: { ...fx.rates, CNY: undefined } } as unknown as FxSnapshot;
    expect(() => convert(100, 'USD', 'CNY', bad)).toThrow(/missing rate/);
  });

  it('汇率为 0 / 负数被拒绝', () => {
    const zero = { ...fx, rates: { ...fx.rates, JPY: 0 } };
    expect(() => convert(100, 'USD', 'JPY', zero)).toThrow(/Non-positive/);
    const neg = { ...fx, rates: { ...fx.rates, JPY: -1 } };
    expect(() => convert(100, 'USD', 'JPY', neg)).toThrow(/Non-positive/);
  });

  it('无效日期被拒绝', () => {
    expect(() => convert(100, 'USD', 'EUR', { ...fx, date: 'not-a-date' })).toThrow(/Invalid fx/);
    expect(() => convert(100, 'USD', 'EUR', { ...fx, date: '2026-13-40' })).toThrow(/Invalid fx/);
  });

  it('快照版本化可复现: 同一快照两次结果一致', () => {
    expect(convert(250, 'EUR', 'JPY', fx)).toBe(convert(250, 'EUR', 'JPY', fx));
    // 1 base = rates[c]; EUR 0.92, JPY 149.5: 250 EUR * 149.5 / 0.92
    expect(convert(250, 'EUR', 'JPY', fx)).toBeCloseTo((250 * 149.5) / 0.92, 6);
  });
});

describe('逐项支出参与测算（F2 闸门 (b)）', () => {
  it('project 用 breakdown 之和而非 expense 字段', () => {
    // expense 字段写 10000（月净 5千），但 breakdown 合计 9000（月净 6千）：
    // 引擎必须按 breakdown 算。10 万存款、年投入 7.2 万、r=0 -> 到 100 万需 ~12.5 年 -> 13 年。
    const p = profile({
      expense: 10000,
      expenseBreakdown: { housing: 4000, transport: 1500, food: 2500, other: 1000 },
    });
    const r = project(p, { kind: 'net-worth', value: 1_000_000 }, assumptions({ returnRate: 0 }));
    expect(r).toEqual({ status: 'reachable', years: 13, savingsRate: 6000 / 15000 });
  });

  it('gap 用 breakdown 之和计算年储蓄', () => {
    const p = profile({
      expense: 10000,
      expenseBreakdown: { housing: 4000, transport: 1500, food: 2500, other: 1000 },
    });
    const g = gap(p, { kind: 'net-worth', value: 1_000_000 }, assumptions({ returnRate: 0 }));
    // 年储蓄 = 6000*12 = 72000；r=0、30 年、start=10 万 -> 所需 = (100万-10万)/30 = 30000/年 -> gap=0。
    expect(g.yearsAtCurrentPace).toBe(13);
    expect(g.annualGap).toBe(0);
  });

  it('buildMilestones 的支出垫子用 breakdown 之和', () => {
    const p = profile({
      expense: 10000,
      expenseBreakdown: { housing: 4000, transport: 1500, food: 2500, other: 1000 },
    });
    const ms = buildMilestones(p, { kind: 'net-worth', value: 1_000_000 }, assumptions());
    // stage 2 = 6 个月支出 = 6 * 9000 = 54000。
    expect(ms[1]?.goalValue).toBe(54_000);
  });
});

describe('版本化可复现', () => {
  it('同一 assumptions (含 version) 重复调用结果一致', () => {
    const a = assumptions();
    const p = profile();
    const g: Goal = { kind: 'net-worth', value: 1_000_000 };
    expect(project(p, g, a)).toEqual(project(p, g, a));
    expect(a.assumptionsVersion).toBeTruthy();
  });
});
