import { describe, expect, it } from 'vitest';
import {
  ASSET_CLASSES,
  emptyAllocation,
  growClass,
  isComplete,
  monteCarloRows,
  mulberry32,
  percentile,
  projectAllocation,
  sanitizeAllocation,
  simulateAllocation,
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

describe('monte carlo (GBM)', () => {
  it('mulberry32 is deterministic per seed and differs across seeds', () => {
    const a = mulberry32(42); const b = mulberry32(42); const c = mulberry32(43);
    const seqA = [a(), a(), a()]; const seqB = [b(), b(), b()]; const seqC = [c(), c(), c()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });

  it('zero volatility reduces to the deterministic projection', () => {
    const alloc = emptyAllocation();
    alloc.weights = { cash: 50, bond: 50, equity: 0, realestate: 0, alternative: 0 };
    alloc.returns = { ...alloc.returns, cash: 0, bond: 10 };
    const [det] = projectAllocation(1000, alloc, [5]);
    const totals = simulateAllocation(1000, alloc, 5, 50, 7);
    for (const t of totals) expect(t).toBeCloseTo(det.total, 6);
  });

  it('volatility widens the P10-P90 band around the median, and rows stay ordered', () => {
    const alloc = emptyAllocation();
    alloc.weights = { cash: 0, bond: 0, equity: 100, realestate: 0, alternative: 0 };
    alloc.returns = { ...alloc.returns, equity: 8 };
    alloc.volatility = { ...alloc.volatility, equity: 20 };
    const rows = monteCarloRows(100_000, alloc, [1, 5, 10], 300, 42);
    for (const row of rows) {
      expect(row.p10).toBeLessThanOrEqual(row.median);
      expect(row.median).toBeLessThanOrEqual(row.p90);
      expect(row.p90 - row.p10).toBeGreaterThan(0);
    }
    // 10 年的离散度必须大于 1 年（波动随时间放大，这是要教的那一课）
    expect(rows[2].p90 - rows[2].p10).toBeGreaterThan(rows[0].p90 - rows[0].p10);
  });

  it('same seed reproduces identical rows (resample changes them)', () => {
    const alloc = emptyAllocation();
    alloc.returns = { ...alloc.returns, cash: 5 };
    alloc.volatility = { ...alloc.volatility, cash: 15 };
    const a = monteCarloRows(1000, alloc, [5], 100, 42);
    const b = monteCarloRows(1000, alloc, [5], 100, 42);
    const c = monteCarloRows(1000, alloc, [5], 100, 43);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('percentile interpolates on sorted input', () => {
    expect(percentile([0, 10], 0.5)).toBe(5);
    expect(percentile([1, 2, 3, 4], 0.9)).toBeCloseTo(3.7);
    expect(percentile([], 0.5)).toBe(0);
  });

  it('sanitizeAllocation clamps volatility to [0,100] and drops junk', () => {
    const s = sanitizeAllocation({
      weights: { cash: 100 },
      volatility: { cash: 250, bond: -5, equity: 'abc' },
    });
    expect(s?.volatility.cash).toBe(100);
    expect(s?.volatility.bond).toBe(0);
    expect(s?.volatility.equity).toBeNull();
  });
});
