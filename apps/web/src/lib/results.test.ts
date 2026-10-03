/**
 * T08 · Results 纯函数层测试。
 *
 * 期望值先用独立方式手算核对（封闭解 / 逐年现金流），不采信实现输出：
 *   - 手算①：start=10万、年储=6万、r=4%、目标本金=200万（=8万USD年成本/4%）。
 *       n = ln((2e6·0.04+6e4)/(1e5·0.04+6e4))/ln(1.04) ≈ 19.96
 *       -> 首达整数年 = 20（year19 余额 1,870,958.68 < 2e6；year20 余额 2,005,797.03 ≥ 2e6）。
 *   - 手算②：同现状 30 年达标所需年储蓄 ≈ 29,877 < 当前 60,000
 *       -> annualGap 取 0。
 *   - 手算③：月净 1,000、年储 1.2 万时 60 年余额上限 ≈ 390.8 万
 *       -> 目标本金 2,500 万（=100万USD年成本/4%）必为 unreachable。
 *   - 手算④：convert(80000, USD, CNY, 7.12) = 569,600；
 *       enoughLine = 569,600 / 0.04 = 14,240,000。
 */
import { describe, expect, it } from 'vitest';
import type { Assumptions, Catalog, FxSnapshot } from '@rich-sim/core';
import type { Draft } from './draft';
import { computeResults } from './results';

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

/** 最小 Catalog：单维度单选项（即默认项），年成本可定制。 */
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
    choices: [], // 缺省 -> 走 catalog 默认选择
    profile: { income: 15000, expense: 10000, savings: 100000, debt: 0, currency: 'USD' },
    currency: 'USD',
    assumptions: assumptions(),
    updatedAt: '2026-10-04T00:00:00.000Z',
    ...over,
  };
}

describe('computeResults', () => {
  it('可达 (手算核对): 8万USD年成本场景 -> years = 20, 储蓄率 1/3', () => {
    const r = computeResults(makeDraft(), catalogWith(80_000));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;

    // Catalog USD -> 录入币种 USD：1:1。
    expect(r.annualCostLocal).toBe(80_000);
    // 手算①：80,000 / 0.04 = 2,000,000 目标本金。
    expect(r.enoughLine).toBe(2_000_000);

    expect(r.projection.status).toBe('reachable');
    if (r.projection.status === 'reachable') {
      expect(r.projection.years).toBe(20);
      expect(r.projection.savingsRate).toBeCloseTo(1 / 3, 10);
    }
    expect(r.savingsRate).toBeCloseTo(1 / 3, 10);

    // gap：当前速度即达成年数；30 年达标所需年储蓄低于当前 -> annualGap=0。
    expect(r.gapResult.yearsAtCurrentPace).toBe(20);
    expect(r.gapResult.annualGap).toBe(0);

    // 阶梯目标 ≥3 阶段，字段齐全。
    expect(r.milestones.length).toBeGreaterThanOrEqual(3);
    for (const m of r.milestones) {
      expect(m).toMatchObject({ stage: expect.any(Number), goalValue: expect.any(Number), years: expect.any(Number), action: expect.stringContaining('示例路径') });
    }
  });

  it('不可达 (手算核对): 低储蓄 + 100万USD年成本场景 -> unreachable', () => {
    // 月净 1,000（年储 1.2 万）；目标本金 25,000,000。
    // 手算③：60 年余额上限 ≈ 390.8 万 << 2,500 万 -> unreachable。
    const draft = makeDraft({
      profile: { income: 11000, expense: 10000, savings: 100000, debt: 0, currency: 'USD' },
    });
    const r = computeResults(draft, catalogWith(1_000_000));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;

    expect(r.projection.status).toBe('unreachable');
    expect(r.gapResult.yearsAtCurrentPace).toBe(60);
    expect(r.savingsRate).toBeCloseTo(1000 / 11000, 10);
  });

  it('无净储蓄: 月支出 ≥ 月收入 -> no-net-savings（一等状态）', () => {
    const draft = makeDraft({
      profile: { income: 8000, expense: 10000, savings: 100000, debt: 0, currency: 'USD' },
    });
    const r = computeResults(draft, catalogWith(80_000));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;

    expect(r.projection.status).toBe('no-net-savings');
    expect(r.savingsRate).toBeNull();
    expect(r.gapResult.yearsAtCurrentPace).toBe(0);
  });

  it('空态: 未录入 profile -> { status: "no-profile" }', () => {
    const r = computeResults(makeDraft({ profile: null }), catalogWith(80_000));
    expect(r).toEqual({ status: 'no-profile' });
  });

  it('换算口径: Catalog USD -> CNY 录入币种，annualCostLocal 正确', () => {
    // 手算④：80,000 USD × 7.12 = 569,600 CNY；够用线 = 569,600 / 0.04。
    const draft = makeDraft({
      currency: 'CNY',
      profile: { income: 106500, expense: 71000, savings: 710000, debt: 0, currency: 'CNY' },
    });
    const r = computeResults(draft, catalogWith(80_000));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;

    expect(r.annualCostLocal).toBe(569_600);
    expect(r.enoughLine).toBe(14_240_000);
    expect(r.currency).toBe('CNY');
  });

  it('choices 缺省时取 Catalog 默认项（isDefault）', () => {
    // choices 为空数组 -> 应选中唯一标了 isDefault 的选项 80,000，
    // 而非第一项；这里故意把第一项 annualCost 设成别的。
    const catalog: Catalog = {
      currency: 'USD',
      dimensions: [
        {
          id: 'living',
          label: '居住',
          options: [
            { id: 'cheap', label: '便宜档', annualCost: 10_000 },
            { id: 'rich', label: '奢华档', annualCost: 80_000, isDefault: true },
          ],
        },
      ],
    };
    const r = computeResults(makeDraft(), catalog);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.annualCostLocal).toBe(80_000);
  });
});
