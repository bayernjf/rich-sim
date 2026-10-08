import type { ExpenseBreakdown } from '@rich-sim/core';

/**
 * F2 · 逐项支出（闸门 (b)，2026-10-08）· 支出口径解析（纯函数）。
 *
 * 规则（引擎侧由 core `profileMonthlyExpense` 钉住同一口径）：
 * - 任一子项填写 → 支出 = 四项之和、写 breakdown；expenseTotal 被忽略
 *   （输入框已只读显示合计，两个数字不会打架）。
 * - 子项全空 → 回落单个数 expenseTotal（旧草稿逐位不变、无 breakdown）。
 * - 非法输入 → ok:false（组件据此阻止写入并内联报错）。
 */
export type ExpenseSubKey = keyof ExpenseBreakdown;
export const EXPENSE_SUB_KEYS: ExpenseSubKey[] = ['housing', 'transport', 'food', 'other'];

export type ResolvedExpense =
  | { ok: true; expense: number; breakdown?: ExpenseBreakdown }
  | { ok: false; reason: 'empty' | 'bad-sub' | 'bad-total' };

export function resolveExpense(
  sub: Record<ExpenseSubKey, string>,
  expenseTotal: string,
): ResolvedExpense {
  const filled = EXPENSE_SUB_KEYS.some((k) => sub[k].trim() !== '');
  if (filled) {
    const values: Record<ExpenseSubKey, number> = { housing: 0, transport: 0, food: 0, other: 0 };
    for (const k of EXPENSE_SUB_KEYS) {
      const raw = sub[k].trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return { ok: false, reason: 'bad-sub' };
      values[k] = n;
    }
    const expense = values.housing + values.transport + values.food + values.other;
    return { ok: true, expense, breakdown: values };
  }

  const t = expenseTotal.trim();
  if (t === '') return { ok: false, reason: 'empty' };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { ok: false, reason: 'bad-total' };
  return { ok: true, expense: n };
}
