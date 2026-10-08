import { describe, expect, it } from 'vitest';
import {
  ASSET_CLASSES,
  emptyAllocation,
  growClass,
  isComplete,
  projectAllocation,
  sanitizeAllocation,
  weightTotal,
} from './sim-invest';

describe('sim-invest', () => {
  it('empty allocation is 100% cash with all returns blank', () => {
    const a = emptyAllocation();
    expect(weightTotal(a.weights)).toBe(100);
    expect(a.weights.cash).toBe(100);
    expect(Object.values(a.returns).every((v) => v === null)).toBe(true);
  });

  it('ASSET_CLASSES has exactly five classes and no tickers', () => {
    expect(ASSET_CLASSES).toEqual(['cash', 'bond', 'equity', 'realestate', 'alternative']);
  });

  it('growClass compounds annually; null return is 0%', () => {
    expect(growClass(100, 10, 2)).toBeCloseTo(121);
    expect(growClass(100, null, 10)).toBe(100);
    expect(growClass(100, -50, 1)).toBe(50);
  });

  it('projectAllocation sums classes independently without rebalancing', () => {
    const a = emptyAllocation();
    a.weights = { cash: 50, bond: 50, equity: 0, realestate: 0, alternative: 0 };
    a.returns = { ...a.returns, cash: 0, bond: 10 };
    const [y1] = projectAllocation(1000, a, [1]);
    expect(y1.byClass.cash).toBeCloseTo(500);
    expect(y1.byClass.bond).toBeCloseTo(550);
    expect(y1.total).toBeCloseTo(1050);
  });

  it('sanitizeAllocation drops unknown keys, clamps ranges, rejects garbage', () => {
    expect(sanitizeAllocation(null)).toBeUndefined();
    expect(sanitizeAllocation({ weights: 'x' })).toBeUndefined();
    const s = sanitizeAllocation({
      weights: { cash: 250, bond: -5, equity: 10, sp500: 30 },
      returns: { cash: 999, bond: -999, equity: 'abc' },
    });
    expect(s?.weights.cash).toBe(100);
    expect(s?.weights.bond).toBe(0);
    expect(s?.weights.equity).toBe(10);
    expect(s?.returns.cash).toBe(100);
    expect(s?.returns.bond).toBe(-100);
    expect(s?.returns.equity).toBeNull();
  });

  it('isComplete tolerates float noise', () => {
    expect(isComplete({ cash: 33.33, bond: 33.33, equity: 33.34, realestate: 0, alternative: 0 })).toBe(true);
    expect(isComplete({ cash: 90, bond: 0, equity: 0, realestate: 0, alternative: 0 })).toBe(false);
  });
});
