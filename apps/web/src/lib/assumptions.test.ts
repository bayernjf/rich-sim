/**
 * M4 · 可调假设纯函数层测试。
 *
 * 三条不显然的判据：
 *  1. **改动真的进得了引擎**——手算核对：8 万 USD 年成本、月净 5,000、起始 10 万，
 *     提取率 4% -> 目标本金 200 万 -> 20 年；2% -> 400 万 ->
 *     `1e5·1.04^n + 6e4·(1.04^n−1)/0.04 ≥ 4e6` -> `1.04^n ≥ 3.4375` -> n = 32。
 *     收益率 0% -> 无复利 -> `(2e6−1e5)/6e4 = 31.67` -> 32 年。
 *  2. **换算条不吃假设**——§2.1 是纯除法，改了 r 还跟着动就是口径错了。
 *  3. **合规清单不会说谎**——岛把 SSR 那几个 `<dd>` 改成真正在用的值。
 */
import { describe, expect, it } from 'vitest';
import type { Assumptions, Catalog, FxSnapshot } from '@rich-sim/core';
import {
  applyRate,
  DEFAULT_RATES,
  formatFxLine,
  formatRate,
  isDefaultRates,
  parseRatePercent,
  patchAssumptionDisplay,
  RATE_BOUNDS,
  toPercentInput,
} from './assumptions';
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

const catalog: Catalog = {
  currency: 'USD',
  dimensions: [
    {
      id: 'living',
      label: '居住',
      options: [{ id: 'opt', label: '测试档', annualCost: 80_000, isDefault: true }],
    },
  ],
};

function makeDraft(over: Partial<Assumptions> = {}): Draft {
  return {
    schemaVersion: 1,
    choices: [],
    profile: { income: 15000, expense: 10000, savings: 100000, debt: 0, currency: 'USD' },
    currency: 'USD',
    assumptions: assumptions(over),
    updatedAt: '2026-10-08T00:00:00.000Z',
  };
}

describe('parseRatePercent', () => {
  it('接受整数与一位小数百分数', () => {
    expect(parseRatePercent('4', 'returnRate')).toEqual({ ok: true, value: 0.04 });
    expect(parseRatePercent('3.5', 'returnRate')).toEqual({ ok: true, value: 0.035 });
    expect(parseRatePercent(' 4 ', 'returnRate')).toEqual({ ok: true, value: 0.04 });
  });

  it('边界值放行：收益率可为 0，提取率最低 1%，两者最高 20%', () => {
    expect(parseRatePercent('0', 'returnRate')).toEqual({ ok: true, value: 0 });
    expect(parseRatePercent('1', 'withdrawalRate')).toEqual({ ok: true, value: 0.01 });
    expect(parseRatePercent('20', 'returnRate')).toEqual({ ok: true, value: 0.2 });
    expect(parseRatePercent('20', 'withdrawalRate')).toEqual({ ok: true, value: 0.2 });
  });

  it('提取率 0% 被拒（够用线要除以它），而 0 对收益率是合法值', () => {
    expect(parseRatePercent('0', 'withdrawalRate')).toEqual({ ok: false, reason: 'below' });
    expect(parseRatePercent('0.5', 'withdrawalRate')).toEqual({ ok: false, reason: 'below' });
  });

  it('负数、空白、非数字与超上限各自报明原因，不静默夹紧', () => {
    expect(parseRatePercent('-1', 'returnRate')).toEqual({ ok: false, reason: 'below' });
    expect(parseRatePercent('', 'returnRate')).toEqual({ ok: false, reason: 'empty' });
    expect(parseRatePercent('abc', 'returnRate')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseRatePercent('Infinity', 'returnRate')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseRatePercent('21', 'returnRate')).toEqual({ ok: false, reason: 'above' });
    expect(parseRatePercent('4%', 'returnRate')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('拒绝的边界就是展示的边界（两处不是各写一份数字）', () => {
    expect(parseRatePercent('0.999', 'withdrawalRate')).toEqual({ ok: false, reason: 'below' });
    expect(parseRatePercent('20.1', 'withdrawalRate')).toEqual({ ok: false, reason: 'above' });
    expect(RATE_BOUNDS.withdrawalRate.min).toBe(0.01);
    expect(RATE_BOUNDS.returnRate.max).toBe(0.2);
  });
});

describe('formatRate / toPercentInput', () => {
  it('整数不带小数点，一位小数保留（旧的四舍五入会把 3.5% 显示成 4%）', () => {
    expect(formatRate(0.04)).toBe('4%');
    expect(formatRate(0.035)).toBe('3.5%');
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(0.2)).toBe('20%');
  });

  it('浮点尾差不外泄到界面', () => {
    expect(formatRate(0.04000000000000001)).toBe('4%');
    expect(toPercentInput(0.035000000000000004)).toBe('3.5');
  });

  it('写出再读回是同一个值（输入框回填不会漂）', () => {
    for (const value of [0, 0.01, 0.035, 0.04, 0.2]) {
      const field = value === 0 ? 'returnRate' : 'withdrawalRate';
      const parsed = parseRatePercent(toPercentInput(value), field);
      expect(parsed, `round-trip ${value}`).toEqual({ ok: true, value });
    }
  });
});

describe('applyRate', () => {
  it('返回新对象，原假设不动，fx / 通胀 / 版本原样带过去', () => {
    const before = assumptions();
    const after = applyRate(before, 'withdrawalRate', 0.02);
    expect(after.withdrawalRate).toBe(0.02);
    expect(before.withdrawalRate).toBe(0.04);
    expect(after).not.toBe(before);
    expect(after.fx).toBe(before.fx);
    expect(after.inflation).toBe(before.inflation);
    expect(after.assumptionsVersion).toBe(before.assumptionsVersion);
  });

  it('默认值取自 DEFAULT_ASSUMPTIONS，不是这里另写的一份', () => {
    expect(DEFAULT_RATES.withdrawalRate).toBe(0.04);
    expect(isDefaultRates(assumptions())).toBe(true);
    expect(isDefaultRates(assumptions({ returnRate: 0.03 }))).toBe(false);
  });
});

describe('改假设对测算的实际影响', () => {
  it('提取率减半 -> 够用线翻倍，达标年限 20 年 -> 32 年（手算）', () => {
    const base = computeResults(makeDraft(), catalog);
    const halved = computeResults(makeDraft({ withdrawalRate: 0.02 }), catalog);
    if (base.status !== 'ok' || halved.status !== 'ok') throw new Error('expected ok');

    expect(base.enoughLine).toBe(2_000_000);
    expect(halved.enoughLine).toBe(4_000_000);
    expect(base.projection.status).toBe('reachable');
    if (base.projection.status !== 'reachable' || halved.projection.status !== 'reachable') {
      throw new Error('expected reachable on both');
    }
    expect(base.projection.years).toBe(20);
    expect(halved.projection.years).toBe(32);
  });

  it('收益率归零 -> 没有复利，20 年变 32 年（手算 (2e6−1e5)/6e4）', () => {
    const r = computeResults(makeDraft({ returnRate: 0 }), catalog);
    if (r.status !== 'ok' || r.projection.status !== 'reachable') throw new Error('expected reachable');
    expect(r.projection.years).toBe(32);
    expect(r.gapResult.annualGap).toBeGreaterThan(0);
  });

  it('极端组合仍落在一等状态里，不产出 NaN/Infinity', () => {
    const r = computeResults(makeDraft({ returnRate: 0, withdrawalRate: 0.01 }), catalog);
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.projection.status).toBe('unreachable');
    expect(Number.isFinite(r.enoughLine)).toBe(true);
  });

  it('换算条是纯除法：改假设它一个字都不变（PRD §6.2 之外的口径）', () => {
    const base = computeResults(makeDraft(), catalog);
    const edited = computeResults(makeDraft({ returnRate: 0.2, withdrawalRate: 0.01 }), catalog);
    if (base.status !== 'ok' || edited.status !== 'ok') throw new Error('expected ok');
    expect(edited.converter.sentence).toBe(base.converter.sentence);
  });
});

describe('patchAssumptionDisplay', () => {
  function fakeDoc(initial: Record<string, string>) {
    const nodes = new Map(Object.entries(initial).map(([k, v]) => [k, { textContent: v }]));
    return {
      nodes,
      querySelector(selector: string) {
        return nodes.get(selector) ?? null;
      },
    };
  }

  it('把清单里的三项改成真正在用的值', () => {
    const doc = fakeDoc({
      '[data-assumption="returnRate"]': '4%',
      '[data-assumption="withdrawalRate"]': '4%',
      '[data-assumption="inflation"]': '3%',
    });
    patchAssumptionDisplay(assumptions({ returnRate: 0.035, withdrawalRate: 0.02 }), doc);
    expect(doc.nodes.get('[data-assumption="returnRate"]')?.textContent).toBe('3.5%');
    expect(doc.nodes.get('[data-assumption="withdrawalRate"]')?.textContent).toBe('2%');
    expect(doc.nodes.get('[data-assumption="inflation"]')?.textContent).toBe('3%');
  });

  it('节点不存在（别的页面没有这张清单）与 doc 缺失（SSR / node）都不抛错', () => {
    expect(() => patchAssumptionDisplay(assumptions(), fakeDoc({}))).not.toThrow();
    expect(() => patchAssumptionDisplay(assumptions(), null)).not.toThrow();
  });

  it('把汇率行改成真正在用的快照（zh / en 两条句子各一次）', () => {
    const zh = fakeDoc({ '[data-assumption="fx"]': 'old' });
    patchAssumptionDisplay(assumptions(), zh, 'zh');
    expect(zh.nodes.get('[data-assumption="fx"]')?.textContent).toBe(
      '汇率：按 1 USD = 7.12 CNY、0.92 EUR 折算；来源 static-snapshot，日期 2026-10-03。',
    );

    const en = fakeDoc({ '[data-assumption="fx"]': 'old' });
    patchAssumptionDisplay(assumptions(), en, 'en');
    expect(en.nodes.get('[data-assumption="fx"]')?.textContent).toBe(
      'FX: 1 USD = 7.12 CNY and 0.92 EUR. Source static-snapshot, dated 2026-10-03.',
    );
  });

  it('汇率行缺币种显示 —，不印 NaN（与 SSR 同一口径）', () => {
    const noCny = assumptions({
      fx: { ...fx, rates: { ...fx.rates, CNY: Number.NaN } },
    });
    expect(formatFxLine(noCny, 'zh')).toContain('= — CNY');
  });
});
