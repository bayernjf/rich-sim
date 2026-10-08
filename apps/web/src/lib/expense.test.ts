import { describe, expect, it } from 'vitest';
import { resolveExpense } from './expense';

const emptySub = { housing: '', transport: '', food: '', other: '' };

describe('resolveExpense · F2 支出口径（闸门 (b)）', () => {
  it('子项全空 → 回落总额，无 breakdown（旧草稿兼容）', () => {
    expect(resolveExpense(emptySub, '8000')).toEqual({ ok: true, expense: 8000 });
  });

  it('子项全空且总额空 → empty', () => {
    expect(resolveExpense(emptySub, '')).toEqual({ ok: false, reason: 'empty' });
  });

  it('任一子项填写 → 四项求和 + breakdown，忽略 expenseTotal', () => {
    const r = resolveExpense(
      { housing: '3500', transport: '800', food: '2000', other: '' },
      '99999', // 故意写一个不同的旧值：拆分后必须被忽略
    );
    expect(r).toEqual({
      ok: true,
      expense: 6300,
      breakdown: { housing: 3500, transport: 800, food: 2000, other: 0 },
    });
  });

  it('只填一项：其余记 0', () => {
    expect(resolveExpense({ ...emptySub, housing: '4000' }, '')).toEqual({
      ok: true,
      expense: 4000,
      breakdown: { housing: 4000, transport: 0, food: 0, other: 0 },
    });
  });

  it('子项非法（负数 / NaN）→ bad-sub', () => {
    expect(resolveExpense({ ...emptySub, food: '-5' }, '8000')).toEqual({
      ok: false,
      reason: 'bad-sub',
    });
    expect(resolveExpense({ ...emptySub, other: 'abc' }, '8000')).toEqual({
      ok: false,
      reason: 'bad-sub',
    });
  });

  it('总额非法（负数 / NaN）→ bad-total', () => {
    expect(resolveExpense(emptySub, '-1')).toEqual({ ok: false, reason: 'bad-total' });
    expect(resolveExpense(emptySub, 'x')).toEqual({ ok: false, reason: 'bad-total' });
  });

  it('拆分后 expense = breakdown 之和（写入口径，引擎侧 profileMonthlyExpense 同源）', () => {
    const r = resolveExpense(
      { housing: '1000', transport: '1000', food: '1000', other: '1000' },
      '',
    );
    expect(r.ok && r.expense).toBe(4000);
    expect(r.ok && r.breakdown).toEqual({ housing: 1000, transport: 1000, food: 1000, other: 1000 });
  });
});
