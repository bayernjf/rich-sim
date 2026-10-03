import { describe, expect, it } from 'vitest';
import { CORE_VERSION, type Currency, type FxSnapshot } from './index';

describe('@rich-sim/core module contract (T02)', () => {
  it('exports a version', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });

  it('supports the six M1 currencies', () => {
    const currencies: Currency[] = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD'];
    expect(currencies).toHaveLength(6);
  });

  it('shapes an FxSnapshot', () => {
    const fx: FxSnapshot = {
      base: 'USD',
      rates: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7.12, HKD: 7.8 },
      date: '2026-10-03',
      source: 'static-snapshot',
      version: '1',
    };
    expect(fx.base).toBe('USD');
    expect(fx.rates['USD']).toBe(1);
  });
});
