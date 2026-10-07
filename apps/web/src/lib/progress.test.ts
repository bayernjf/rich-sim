/**
 * F6（本机版）· 快照层测试。
 *
 * 两条最值得钉的：
 *  1. `appendSnapshot` 在没有变化时返回**同一个数组身份**——调用方靠它跳过写盘。
 *     写成「内容相等」就漏掉了真正的缺陷：每次 results:view 都往 localStorage
 *     写一次，并把本页自己的写广播再喂回重算。
 *  2. 「年限跨币种可比」不是修辞，是递推的齐次性：本金、年储蓄、目标本金同时
 *     乘一个汇率因子，跨过首次达标年的那一年不变。这条用**同一个真实财务状态
 *     的 USD 与 CNY 两份 profile** 各跑一遍引擎来验，而不是自证。
 */
import { describe, expect, it } from 'vitest';
import { convert, project, type Assumptions, type Catalog, type FxSnapshot, type Profile } from '@rich-sim/core';
import {
  MAX_SNAPSHOTS,
  dayKey,
  diffSnapshots,
  previousDay,
  sameSnapshot,
  snapshotOf,
  upsertToday,
  type Snapshot,
} from './progress';
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

const profile: Profile = { income: 15000, expense: 10000, savings: 100000, debt: 0, currency: 'USD' };

function makeDraft(over: Partial<Draft> = {}): Draft {
  return {
    schemaVersion: 1,
    choices: [],
    profile,
    currency: 'USD',
    assumptions: assumptions(),
    updatedAt: '2026-10-08T00:00:00.000Z',
    ...over,
  };
}

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    at: '2026-10-01T09:00:00.000Z',
    currency: 'USD',
    status: 'reachable',
    years: 20,
    annualCost: 80_000,
    enoughLine: 2_000_000,
    netWorth: 100_000,
    ...over,
  };
}

const at = (iso: string) => new Date(iso);

describe('snapshotOf', () => {
  it('no-profile 不记（没什么可记），ok 记全套字段', () => {
    expect(snapshotOf({ status: 'no-profile' }, profile, at('2026-10-08T00:00:00Z'))).toBeNull();
    const snap = snapshotOf(computeResults(makeDraft(), catalog), profile, at('2026-10-08T00:00:00Z'));
    expect(snap).toEqual({
      at: '2026-10-08T00:00:00.000Z',
      currency: 'USD',
      status: 'reachable',
      // 手算：目标本金 2,000,000、起始 100,000、年储 60,000、r 4% -> 第 20 年首达。
      years: 20,
      annualCost: 80_000,
      enoughLine: 2_000_000,
      netWorth: 100_000,
    });
  });

  it('净资产跟着引擎口径走（存款 − 负债，不是只看存款）', () => {
    const withDebt: Profile = { ...profile, savings: 300_000, debt: 120_000 };
    const snap = snapshotOf(
      computeResults(makeDraft({ profile: withDebt }), catalog),
      withDebt,
      at('2026-10-08T00:00:00Z'),
    );
    expect(snap?.netWorth).toBe(180_000);
  });

  it('不可达没有年限可记，但年成本与够用线仍要记下来', () => {
    const huge: Catalog = {
      currency: 'USD',
      dimensions: [
        { id: 'living', label: '居住', options: [{ id: 'x', label: '顶档', annualCost: 5_000_000, isDefault: true }] },
      ],
    };
    const snap = snapshotOf(computeResults(makeDraft(), huge), profile, at('2026-10-08T00:00:00Z'));
    expect(snap?.status).toBe('unreachable');
    expect(snap?.years).toBeNull();
    expect(snap?.enoughLine).toBe(125_000_000);
  });

  it('无净储蓄也是一等状态，照记不误', () => {
    const flat: Profile = { ...profile, expense: 15000 };
    const snap = snapshotOf(
      computeResults(makeDraft({ profile: flat }), catalog),
      flat,
      at('2026-10-08T00:00:00Z'),
    );
    expect(snap?.status).toBe('no-net-savings');
    expect(snap?.years).toBeNull();
  });
});

describe('upsertToday', () => {
  it('同一天、同样的数字 -> 返回**同一个数组**（调用方据此不写盘）', () => {
    const history = [snapshot({ at: '2026-10-08T01:00:00Z' })];
    expect(upsertToday(history, snapshot({ at: '2026-10-08T09:00:00Z' }))).toBe(history);
  });

  it('同一天里数字变了 -> 覆盖当天那一条，不新增（一天一个读数）', () => {
    const history = [
      snapshot({ at: '2026-10-01T01:00:00Z', netWorth: 100_000 }),
      snapshot({ at: '2026-10-08T01:00:00Z', netWorth: 120_000 }),
    ];
    const out = upsertToday(history, snapshot({ at: '2026-10-08T09:00:00Z', netWorth: 160_000 }));
    expect(out).toHaveLength(2);
    expect(out[1].netWorth).toBe(160_000);
    expect(out[0].netWorth).toBe(100_000);
    expect(history).toHaveLength(2);
    expect(history[1].netWorth).toBe(120_000);
  });

  it('换到新的历日 -> 追加一条', () => {
    const history = [snapshot({ at: '2026-10-08T01:00:00Z' })];
    const out = upsertToday(history, snapshot({ at: '2026-10-09T01:00:00Z', netWorth: 160_000 }));
    expect(out).toHaveLength(2);
    expect(out.map((s) => dayKey(s.at))).toEqual(['2026-10-08', '2026-10-09']);
  });

  it('超过上限丢最旧的', () => {
    const many = Array.from({ length: MAX_SNAPSHOTS }, (_, i) =>
      snapshot({ netWorth: i, at: `2026-0${1 + Math.floor(i / 9)}-${`${1 + (i % 28)}`.padStart(2, '0')}T00:00:00.000Z` }),
    );
    const out = upsertToday(many, snapshot({ netWorth: 999, at: '2026-12-31T00:00:00.000Z' }));
    expect(out).toHaveLength(MAX_SNAPSHOTS);
    expect(out[out.length - 1].netWorth).toBe(999);
    expect(out[0].netWorth).toBe(1);
  });
});

describe('dayKey', () => {
  it('本机历日，补零', () => {
    const local = new Date(2026, 0, 5, 23, 30);
    expect(dayKey(local)).toBe('2026-01-05');
    expect(dayKey(dayKey(local))).toBe('2026-01-05');
  });

  it('同一个历日内不受时分影响，跨日必须变', () => {
    const a = new Date(2026, 9, 8, 1, 0);
    const b = new Date(2026, 9, 8, 22, 0);
    const c = new Date(2026, 9, 9, 0, 30);
    expect(dayKey(a)).toBe(dayKey(b));
    expect(dayKey(c)).not.toBe(dayKey(a));
  });

  it('坏时间戳给空串而不是 NaN-undefined', () => {
    expect(dayKey('nope')).toBe('');
  });
});

describe('previousDay', () => {
  it('取最近一条不是今天的记录（哪怕数字一模一样）', () => {
    const history = [
      snapshot({ at: '2026-09-20T00:00:00.000Z', netWorth: 100_000 }),
      snapshot({ at: '2026-10-01T00:00:00.000Z', netWorth: 130_000 }),
    ];
    expect(previousDay(history, '2026-10-08')?.at).toBe('2026-10-01T00:00:00.000Z');
    const identical = [snapshot({ at: '2026-10-01T00:00:00.000Z' })];
    expect(previousDay(identical, '2026-10-08')?.at).toBe('2026-10-01T00:00:00.000Z');
  });

  it('只有今天的记录（第一次测算）时没有可比对象', () => {
    expect(previousDay([snapshot({ at: '2026-10-08T00:00:00.000Z' })], '2026-10-08')).toBeNull();
    expect(previousDay([], '2026-10-08')).toBeNull();
  });
});

describe('diffSnapshots', () => {
  it('天数向下取整，同一天内是 0', () => {
    const prev = snapshot({ at: '2026-10-01T09:00:00Z' });
    const cur = snapshot({ at: '2026-10-03T10:00:00Z', netWorth: 120_000 });
    expect(diffSnapshots(prev, cur).daysBetween).toBe(2);
    expect(diffSnapshots(prev, snapshot({ at: '2026-10-01T18:00:00Z', netWorth: 120_000 })).daysBetween).toBe(0);
  });

  it('坏时间戳不炸：天数按 0 处理', () => {
    const cur = snapshot({ at: 'not-a-date', netWorth: 120_000 });
    expect(diffSnapshots(snapshot(), cur).daysBetween).toBe(0);
  });

  it('同币种给净资产差，跨币种只给方向性的年限差', () => {
    const prev = snapshot({ currency: 'USD', netWorth: 100_000, years: 20 });
    const cur = snapshot({ currency: 'CNY', netWorth: 712_000, years: 18 });
    const diff = diffSnapshots(prev, cur);
    expect(diff.sameCurrency).toBe(false);
    expect(diff.netWorthDelta).toBeNull();
    expect(diff.yearsDelta).toBe(-2);
    const same = diffSnapshots(prev, snapshot({ netWorth: 130_000, years: 20 }));
    expect(same.netWorthDelta).toBe(30_000);
  });

  it('状态跨档单独可辨；任一侧没有年限时年限差为 null', () => {
    const prev = snapshot({ status: 'reachable', years: 20 });
    const cur = snapshot({ status: 'no-net-savings', years: null });
    const diff = diffSnapshots(prev, cur);
    expect(diff.statusChanged).toBe(true);
    expect(diff.yearsDelta).toBeNull();
  });

  it('年限没动时差值就是 0，不是 null（UI 得能说「年限没变」）', () => {
    const diff = diffSnapshots(snapshot({ at: '2026-10-01T00:00:00Z' }), snapshot({ at: '2026-10-08T00:00:00Z', netWorth: 130_000 }));
    expect(diff.yearsDelta).toBe(0);
    expect(diff.netWorthDelta).toBe(30_000);
  });

  it('什么都没动 -> sameSnapshot 为真：这一屏不该编出进展', () => {
    const prev = snapshot({ at: '2026-10-01T00:00:00Z' });
    const cur = snapshot({ at: '2026-10-08T00:00:00Z' });
    expect(diffSnapshots(prev, cur).daysBetween).toBe(7);
    expect(sameSnapshot(prev, cur)).toBe(true);
  });

  it('只动了目标（年成本变、profile 不变）也算变化——变化判定看快照，不看差值字段', () => {
    const prev = snapshot({ at: '2026-10-01T00:00:00Z' });
    const cur = snapshot({
      at: '2026-10-08T00:00:00Z',
      annualCost: 90_000,
      enoughLine: 2_250_000,
    });
    expect(sameSnapshot(prev, cur)).toBe(false);
    const diff = diffSnapshots(prev, cur);
    expect(diff.yearsDelta).not.toBeNull();
    expect(diff.statusChanged).toBe(false);
  });
});

/**
 * 齐次性的差分验证：同一个真实财务状态分别用 USD 与 CNY 表达（用**引擎自己的
 * convert**，不是手写系数），两边各跑一遍 `project`。
 * 避开恰好在浮点余数上平局的边界年（这里第 20 年首达时余额已超出目标 ~0.6 万，
 * 缩放后差值远小于该余量）。
 */
describe('年限的币种不变性', () => {
  it('profile 与目标同时按同一快照换算时，达标年限不动', () => {
    const annualCostUSD = 80_000;
    const a = assumptions();
    const goal = { kind: 'enough-line' as const, value: annualCostUSD };

    const usd = project(profile, goal, a);

    const scale = (v: number) => convert(v, 'USD', 'CNY', fx);
    const cnyProfile: Profile = {
      income: scale(profile.income),
      expense: scale(profile.expense),
      savings: scale(profile.savings),
      debt: scale(profile.debt),
      currency: 'CNY',
    };
    const cnyGoal = { kind: 'enough-line' as const, value: scale(annualCostUSD) };
    const cny = project(cnyProfile, cnyGoal, a);

    expect(usd.status).toBe('reachable');
    expect(cny.status).toBe('reachable');
    if (usd.status !== 'reachable' || cny.status !== 'reachable') return;
    expect(cny.years).toBe(usd.years);
    expect(cny.savingsRate).toBeCloseTo(usd.savingsRate, 12);
  });

  it('正向对照：缩放这条路径真的动了数字（否则上面的相等是空跑）', () => {
    const scaled = convert(80_000, 'USD', 'CNY', fx);
    expect(scaled).toBeCloseTo(80_000 * 7.12, 6);
    expect(scaled).not.toBe(80_000);
  });
});

describe('sameSnapshot', () => {
  it('时间戳不参与比较：同一状态重复测算不算进展', () => {
    expect(sameSnapshot(snapshot({ at: '2026-10-01T00:00:00Z' }), snapshot({ at: '2026-10-09T00:00:00Z' }))).toBe(true);
  });
});
