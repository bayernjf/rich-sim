/**
 * Comparison-converter tests (comparison-converter.md §2.1 / §3 / §7).
 * Expectations hand-derived independently: each quotient is reduced to a
 * fraction first (1,000,000/180,000 = 50/9) rather than read back from the
 * implementation, and the boundary cases use dividends that divide exactly so
 * the threshold itself — not float noise — is what the assertion pins.
 */
import { describe, expect, it } from 'vitest';
import type { Assumptions, FxSnapshot, Profile } from './types';
import {
  TIME_EQUIVALENT_ABSURD_MULTIPLE,
  gap,
  wealthTimeEquivalent,
} from './functions';

const fx: FxSnapshot = {
  base: 'USD',
  rates: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7, HKD: 7.8 },
  date: '2026-10-03',
  source: 'static-snapshot',
  version: 'test',
};

function profile(over: Partial<Profile> = {}): Profile {
  return { income: 20_000, expense: 5_000, savings: 0, debt: 0, currency: 'USD', ...over };
}

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

/** 私人飞机的 catalog 年成本（catalog-data.ts:96-98），此处只作金额来源标注。 */
const PRIVATE_JET_USD = 1_000_000;

describe('wealthTimeEquivalent 轻量口径（§2.1）', () => {
  it('纯除法，误差为 0：不碰 returnRate / withdrawalRate、不复利', () => {
    // 手算：年净储蓄 = (20,000 − 5,000) × 12 = 180,000；1,000,000 / 180,000 = 50/9。
    const te = wealthTimeEquivalent(PRIVATE_JET_USD, profile(), fx);
    expect(te.status).toBe('years');
    if (te.status !== 'years') return;
    expect(te.years).toBeCloseTo(50 / 9, 12);
    expect(te.annualSavings).toBe(180_000);
    expect(te.currency).toBe('USD');
  });

  it('币种同域（§3.1）：分子换算到分母币种后，年数与录入币种无关', () => {
    const usd = wealthTimeEquivalent(PRIVATE_JET_USD, profile(), fx);
    // 同一经济状况的 CNY 表达：收入/支出各 ×7（CurrencySwitcher 的换算口径）。
    const cny = wealthTimeEquivalent(
      PRIVATE_JET_USD,
      profile({ income: 140_000, expense: 35_000, currency: 'CNY' }),
      fx,
    );
    expect(cny.status).toBe('years');
    if (usd.status !== 'years' || cny.status !== 'years') return;

    expect(cny.annualCostLocal).toBe(7_000_000); // convert(1e6, USD, CNY, 7)
    // 手算：7,000,000 / 1,260,000 = 700/126 = 50/9 —— 与 USD 口径同一个数。
    expect(cny.years).toBeCloseTo(50 / 9, 12);
    expect(cny.years).toBeCloseTo(usd.years, 12);
  });

  it('反向对照：不换算分子就是差一个汇率因子，不是「结果一样、只是展示不一致」', () => {
    // §3.1 点名的错法：USD 分子 ÷ CNY 分母。
    const wrong = PRIVATE_JET_USD / ((140_000 - 35_000) * 12); // 50/63
    const right = wealthTimeEquivalent(
      PRIVATE_JET_USD,
      profile({ income: 140_000, expense: 35_000, currency: 'CNY' }),
      fx,
    );
    expect(right.status).toBe('years');
    if (right.status !== 'years') return;
    expect(right.years / wrong).toBeCloseTo(fx.rates.CNY, 9);
    expect(right.years).not.toBeCloseTo(wrong, 6);
  });

  it('分母 ≤ 0：一等状态，不给年数、不产 NaN/Infinity（§3.2）', () => {
    for (const p of [profile({ income: 10_000, expense: 10_000 }), profile({ income: 8_000, expense: 10_000 })]) {
      const te = wealthTimeEquivalent(PRIVATE_JET_USD, p, fx);
      expect(te.status).toBe('no-net-savings');
      expect(te).not.toHaveProperty('years');
      expect(te).not.toHaveProperty('multiple');
      expect(te.annualSavings).toBeLessThanOrEqual(0);
      // 金额仍然给得出，UI 可以直接显示这一笔。
      expect(te.annualCostLocal).toBe(PRIVATE_JET_USD);
      for (const value of Object.values(te)) {
        if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});

describe('超上限的三种收口（§3.3）', () => {
  const annual60k = profile({ income: 10_000, expense: 5_000 }); // 年净储蓄 60,000

  it('60 年整仍是年数，61 年起改倍数表达', () => {
    // 手算：3,600,000 / 60,000 = 60；3,660,000 / 60,000 = 61（都能整除，边界不是浮点噪声）。
    const at = wealthTimeEquivalent(3_600_000, annual60k, fx);
    const over = wealthTimeEquivalent(3_660_000, annual60k, fx);
    expect(at).toMatchObject({ status: 'years', years: 60 });
    expect(over).toMatchObject({ status: 'multiple', multiple: 61 });
  });

  it('倍数到 1000 仍给数，再大只给陈述', () => {
    const annual12k = profile({ income: 2_000, expense: 1_000 }); // 年净储蓄 12,000
    // 手算：12,000,000 / 12,000 = 1000；12,012,000 / 12,000 = 1001。
    expect(TIME_EQUIVALENT_ABSURD_MULTIPLE).toBe(1000);
    expect(wealthTimeEquivalent(12_000_000, annual12k, fx).status).toBe('multiple');
    const absurd = wealthTimeEquivalent(12_012_000, annual12k, fx);
    expect(absurd.status).toBe('beyond-scale');
    expect(absurd).not.toHaveProperty('multiple');
  });

  it('与引擎同一个 60 阈值：引擎判 60 年内不可达的那笔，换算条不给年数', () => {
    // 手算：够用线目标本金 = 4,500,000 / 0.04 = 112,500,000；年储 60,000、r=4%
    //   需 (1.04^n − 1) ≥ 187.5 → n ≈ 134 年 → 超出 60 年上限 -> unreachable。
    //   换算条 k = 4,500,000 / 60,000 = 75 -> 必为倍数表达，不给「75 年」。
    const cost = 4_500_000;
    const a = assumptions();
    expect(gap(annual60k, { kind: 'enough-line', value: cost }, a).yearsAtCurrentPace).toBe(60);
    expect(wealthTimeEquivalent(cost, annual60k, fx).status).toBe('multiple');
  });
});
