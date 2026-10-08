import { useEffect, useState } from 'react';
import type { Currency, ExpenseBreakdown, LifeChoice, Profile } from '@rich-sim/core';
import { readDraft, writeDraft } from '../lib/draft';
import { DEFAULT_ASSUMPTIONS, DEFAULT_CURRENCY } from '../lib/defaults';
import { EXPENSE_SUB_KEYS, resolveExpense, type ExpenseSubKey } from '../lib/expense';
import { format, t, type MessageKey } from '../lib/messages';
import type { Locale } from '../lib/i18n';
import { track } from '../lib/analytics';

/**
 * T07 · 轻量财务录入（mobile-first）+ F2 · 逐项支出（闸门 (b)，2026-10-08）。
 *
 * - 主字段 4 个：月收入 / 月支出 / 现有存款 / 负债（PRD §8 F2：≤4 项、每项带示例值）。
 * - 月支出默认收成单个数；「高级：拆开填（可选）」展开成住房 / 交通 / 食品 / 其他
 *   四大类（刻意保持粗粒度，不滑向记账工具，PRD §3.2 Non-Goal）。任一子项填写后
 *   合计自动求和，`expense` = 和、`expenseBreakdown` 写入 —— 引擎按拆分后的合计
 *   计算（core `profileMonthlyExpense`）；子项全空则回落单个数（旧草稿逐位不变）。
 * - 校验：仅接受有限非负数；负数 / NaN / 空值 → 内联错误并阻止写入；
 *   合法修改 → 立即经 lib/draft.ts 写回（保留其余字段）。
 * - 恢复：有 expenseBreakdown 的草稿展开并回填四类；纯旧草稿收起、总额回填。
 * - 持久化一律走 readDraft / writeDraft，不绕过入口。
 * - 文案全部走 messages（i18n 切片二），示例值里的 "如 / e.g." 也是文案。
 */

type MainKey = 'income' | 'expenseTotal' | 'savings' | 'debt';
const MAIN_KEYS: MainKey[] = ['income', 'expenseTotal', 'savings', 'debt'];

const MAIN_FIELDS: { key: MainKey; label: MessageKey; hint: MessageKey; ph: MessageKey }[] = [
  {
    key: 'income',
    label: 'finance.income.label',
    hint: 'finance.income.hint',
    ph: 'finance.income.ph',
  },
  {
    key: 'expenseTotal',
    label: 'finance.expense.label',
    hint: 'finance.expense.hint',
    ph: 'finance.expense.ph',
  },
  {
    key: 'savings',
    label: 'finance.savings.label',
    hint: 'finance.savings.hint',
    ph: 'finance.savings.ph',
  },
  { key: 'debt', label: 'finance.debt.label', hint: 'finance.debt.hint', ph: 'finance.debt.ph' },
];

const SUB_FIELDS: { key: ExpenseSubKey; label: MessageKey; hint: MessageKey; ph: MessageKey }[] = [
  { key: 'housing', label: 'finance.expense.sub.housing.label', hint: 'finance.expense.sub.housing.hint', ph: 'finance.expense.sub.housing.ph' },
  { key: 'transport', label: 'finance.expense.sub.transport.label', hint: 'finance.expense.sub.transport.hint', ph: 'finance.expense.sub.transport.ph' },
  { key: 'food', label: 'finance.expense.sub.food.label', hint: 'finance.expense.sub.food.hint', ph: 'finance.expense.sub.food.ph' },
  { key: 'other', label: 'finance.expense.sub.other.label', hint: 'finance.expense.sub.other.hint', ph: 'finance.expense.sub.other.ph' },
];

type Validation = { ok: true; value: number } | { ok: false; reason: 'empty' | 'negative' | 'nan' };

function validateMain(raw: string): Validation {
  if (raw.trim() === '') return { ok: false, reason: 'empty' };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, reason: 'nan' };
  if (n < 0) return { ok: false, reason: 'negative' };
  return { ok: true, value: n };
}

/** 子项：空 = 合法中间态（记 0）；非空必须为有限非负数。 */
function validateSub(raw: string): 'ok' | 'empty' | 'bad' {
  if (raw.trim() === '') return 'empty';
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 'bad';
  return 'ok';
}

const ERROR_KEYS: Record<Exclude<Validation, { ok: true }>['reason'], MessageKey> = {
  empty: 'finance.error.empty',
  negative: 'finance.error.negative',
  nan: 'finance.error.nan',
};

/** 已存 profile 仅在四项均为有限非负数时恢复。 */
function isValidProfile(p: Profile | null | undefined): p is Profile {
  if (!p) return false;
  return MAIN_KEYS.filter((k) => k !== 'expenseTotal').every((k) => Number.isFinite(p[k]) && p[k] >= 0);
}

function isValidBreakdown(b: ExpenseBreakdown | undefined | null): b is ExpenseBreakdown {
  if (!b) return false;
  return EXPENSE_SUB_KEYS.every((k) => Number.isFinite(b[k]) && b[k] >= 0);
}

const emptyText = (): Record<MainKey, string> => ({
  income: '',
  expenseTotal: '',
  savings: '',
  debt: '',
});

const emptySubText = (): Record<ExpenseSubKey, string> => ({
  housing: '',
  transport: '',
  food: '',
  other: '',
});

const emptyTouched = (): Record<MainKey, boolean> => ({
  income: false,
  expenseTotal: false,
  savings: false,
  debt: false,
});

const emptySubTouched = (): Record<ExpenseSubKey, boolean> => ({
  housing: false,
  transport: false,
  food: false,
  other: false,
});

/** 子项求和：空 / 非法一律记 0（保存前已校验过，这里只做展示与组装）。 */
function subSum(sub: Record<ExpenseSubKey, string>): number {
  return EXPENSE_SUB_KEYS.reduce((acc, k) => {
    const n = Number(sub[k]);
    return acc + (Number.isFinite(n) && n >= 0 ? n : 0);
  }, 0);
}

function anySubFilled(sub: Record<ExpenseSubKey, string>): boolean {
  return EXPENSE_SUB_KEYS.some((k) => sub[k].trim() !== '');
}

export default function FinanceForm({ locale = 'zh' }: { locale?: Locale }) {
  // SSR 确定性渲染：空输入 + 默认币种，SSR HTML 即含四个 label 与单位提示。
  const [text, setText] = useState<Record<MainKey, string>>(emptyText);
  const [subText, setSubText] = useState<Record<ExpenseSubKey, string>>(emptySubText);
  const [touched, setTouched] = useState<Record<MainKey, boolean>>(emptyTouched);
  const [subTouched, setSubTouched] = useState<Record<ExpenseSubKey, boolean>>(emptySubTouched);
  const [expanded, setExpanded] = useState(false);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [saved, setSaved] = useState(false);

  // 仅在浏览器执行：localStorage 不可用于 SSR。
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    setCurrency(draft.currency);
    if (isValidProfile(draft.profile)) {
      const p = draft.profile;
      setText({
        income: String(p.income),
        expenseTotal: String(p.expense),
        savings: String(p.savings),
        debt: String(p.debt),
      });
      if (isValidBreakdown(p.expenseBreakdown)) {
        setSubText({
          housing: String(p.expenseBreakdown.housing),
          transport: String(p.expenseBreakdown.transport),
          food: String(p.expenseBreakdown.food),
          other: String(p.expenseBreakdown.other),
        });
        setExpanded(true);
      }
      setSaved(true);
    }
  }, []);

  /** 用最新输入组装完整 profile 并写回；返回是否写入成功。 */
  const commit = (
    nextText: Record<MainKey, string>,
    nextSub: Record<ExpenseSubKey, string>,
    fieldKey: string,
  ): boolean => {
    const existing = readDraft();
    const profile = {} as Profile;
    let complete = true;

    for (const k of ['income', 'savings', 'debt'] as const) {
      const r = validateMain(nextText[k]);
      if (r.ok) profile[k] = r.value;
      else if (isValidProfile(existing?.profile)) profile[k] = existing.profile[k];
      else complete = false;
    }

    // 支出口径：拆分驱动 vs 回落总额 —— 事实源在 lib/expense.ts（resolveExpense）。
    const resolved = resolveExpense(nextSub, nextText.expenseTotal);
    let itemized = false;
    if (resolved.ok) {
      profile.expense = resolved.expense;
      if (resolved.breakdown) {
        profile.expenseBreakdown = resolved.breakdown;
        itemized = true;
      }
    } else if (resolved.reason === 'bad-sub' || resolved.reason === 'bad-total') {
      complete = false;
    } else if (isValidProfile(existing?.profile)) {
      profile.expense = existing.profile.expense; // 全空且总额空：沿用旧值（旧草稿编辑中途）
    } else {
      complete = false;
    }

    if (!complete) return false;

    const cur = existing?.currency ?? DEFAULT_CURRENCY;
    profile.currency = cur; // 录入币种恒等于展示本位币（币种口径约定）
    writeDraft({
      schemaVersion: 1,
      choices: existing?.choices ?? ([] as LifeChoice),
      profile,
      currency: cur,
      assumptions: existing?.assumptions ?? DEFAULT_ASSUMPTIONS,
      updatedAt: new Date().toISOString(),
    });
    track('finance:update', {
      field: fieldKey,
      income: profile.income,
      expense: profile.expense,
      savings: profile.savings,
      debt: profile.debt,
      // 基于本次实际写入（resolved），不是组件渲染时的旧 state——
      // 用闭包里的 subsFilled 会在填第一项时误报 itemized:false。
      itemized,
    });
    return true;
  };

  const handleMainChange = (key: MainKey, raw: string) => {
    const nextText = { ...text, [key]: raw };
    setText(nextText);
    setTouched((prev) => ({ ...prev, [key]: true }));

    // 非法输入：内联错误提示，阻止写入 draft。
    const res = validateMain(raw);
    if (!res.ok) {
      setSaved(false);
      return;
    }
    setSaved(commit(nextText, subText, key));
  };

  const handleSubChange = (key: ExpenseSubKey, raw: string) => {
    const nextSub = { ...subText, [key]: raw };
    setSubText(nextSub);
    setSubTouched((prev) => ({ ...prev, [key]: true }));

    // 非空且非法：内联错误，阻止写入。
    if (validateSub(raw) === 'bad') {
      setSaved(false);
      return;
    }
    setSaved(commit(text, nextSub, `expense.${key}`));
  };

  const subsFilled = anySubFilled(subText);
  const totalShown = subsFilled ? String(subSum(subText)) : text.expenseTotal;
  const anySubBad = EXPENSE_SUB_KEYS.some((k) => subTouched[k] && validateSub(subText[k]) === 'bad');
  const subAllEmpty =
    expanded && EXPENSE_SUB_KEYS.some((k) => subTouched[k]) && !subsFilled;

  const renderField = (f: (typeof MAIN_FIELDS)[number]) => {
    const res = validateMain(text[f.key]);
    const showError = touched[f.key] && !res.ok;
    const inputId = `field-${f.key}`;
    return (
      <div key={f.key} className="rounded-2xl border border-line bg-panel p-4">
        <label htmlFor={inputId} className="block text-sm font-medium text-ink">
          {t(f.label, locale)}
        </label>
        <input
          id={inputId}
          type="number"
          min={0}
          step={100}
          inputMode="decimal"
          placeholder={t(f.ph, locale)}
          value={text[f.key]}
          onChange={(e) => handleMainChange(f.key, e.target.value)}
          aria-invalid={showError}
          aria-describedby={showError ? `error-${f.key}` : undefined}
          className={[
            'mt-2 block w-full min-h-11 rounded-xl border bg-panel-2 px-3 py-3',
            'text-base font-mono tabular-nums text-ink placeholder:text-muted',
            showError ? 'border-accent' : 'border-line',
          ].join(' ')}
        />
        <p className="mt-1.5 text-xs text-muted">{t(f.hint, locale)}</p>
        {showError && (
          <p id={`error-${f.key}`} role="alert" className="mt-1 text-xs text-accent">
            {t(ERROR_KEYS[res.reason], locale)}
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="pb-24">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          {t('finance.eyebrow', locale)}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{t('finance.h1', locale)}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {format(t('finance.intro', locale), { currency })}
        </p>
      </header>

      <div className="mt-6 space-y-4">
        {MAIN_FIELDS.map((f) => {
          // 支出字段特殊渲染：展开拆分后由四类驱动，总额输入只读。
          if (f.key === 'expenseTotal') {
            const res = validateMain(text.expenseTotal);
            const showError = touched.expenseTotal && !res.ok && !subsFilled;
            return (
              <div key="expenseTotal" className="rounded-2xl border border-line bg-panel p-4">
                <label htmlFor="field-expenseTotal" className="block text-sm font-medium text-ink">
                  {t('finance.expense.label', locale)}
                </label>
                <input
                  id="field-expenseTotal"
                  type="number"
                  min={0}
                  step={100}
                  inputMode="decimal"
                  placeholder={t('finance.expense.ph', locale)}
                  value={totalShown}
                  disabled={subsFilled}
                  onChange={(e) => handleMainChange('expenseTotal', e.target.value)}
                  aria-invalid={showError}
                  aria-describedby={showError ? 'error-expenseTotal' : undefined}
                  className={[
                    'mt-2 block w-full min-h-11 rounded-xl border bg-panel-2 px-3 py-3',
                    'text-base font-mono tabular-nums text-ink placeholder:text-muted',
                    subsFilled ? 'opacity-60' : '',
                    showError ? 'border-accent' : 'border-line',
                  ].join(' ')}
                />
                <p className="mt-1.5 text-xs text-muted">
                  {subsFilled ? t('finance.expense.totalHint', locale) : t('finance.expense.hint', locale)}
                </p>
                {showError && (
                  <p id="error-expenseTotal" role="alert" className="mt-1 text-xs text-accent">
                    {t(ERROR_KEYS[res.reason], locale)}
                  </p>
                )}

                {/* 高级：逐项拆分（默认收起；已有拆分记录的草稿自动展开） */}
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-3 flex w-full items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2 text-left text-xs font-medium text-ink hover:border-line-strong"
                >
                  <span>{t('finance.expense.advanced', locale)}</span>
                  <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                </button>
                <p className="mt-1.5 text-xs text-muted">{t('finance.expense.advancedHint', locale)}</p>

                {expanded && (
                  <div className="mt-3 space-y-3">
                    {SUB_FIELDS.map((s) => {
                      const v = validateSub(subText[s.key]);
                      const showSubError = subTouched[s.key] && v === 'bad';
                      return (
                        <div key={s.key} className="rounded-xl border border-line bg-panel-2 p-3">
                          <label
                            htmlFor={`sub-${s.key}`}
                            className="block text-xs font-medium text-ink"
                          >
                            {t(s.label, locale)}
                          </label>
                          <input
                            id={`sub-${s.key}`}
                            type="number"
                            min={0}
                            step={100}
                            inputMode="decimal"
                            placeholder={t(s.ph, locale)}
                            value={subText[s.key]}
                            onChange={(e) => handleSubChange(s.key, e.target.value)}
                            aria-invalid={showSubError}
                            aria-describedby={showSubError ? `sub-error-${s.key}` : undefined}
                            className={[
                              'mt-1.5 block w-full min-h-11 rounded-lg border bg-panel px-3 py-2.5',
                              'text-base font-mono tabular-nums text-ink placeholder:text-muted',
                              showSubError ? 'border-accent' : 'border-line',
                            ].join(' ')}
                          />
                          <p className="mt-1 text-xs text-muted">{t(s.hint, locale)}</p>
                          {showSubError && (
                            <p id={`sub-error-${s.key}`} role="alert" className="mt-1 text-xs text-accent">
                              {t('finance.error.nan', locale)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {(anySubBad || subAllEmpty) && (
                      <p role="alert" className="text-xs text-accent">
                        {t('finance.expense.atLeastOne', locale)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          }
          return renderField(f);
        })}
      </div>

      <p className="mt-4 text-xs text-muted" aria-live="polite">
        {t(saved ? 'finance.saved' : 'finance.unfilled', locale)}
      </p>

      <p className="mt-2 text-xs leading-relaxed text-muted">{t('finance.privacy', locale)}</p>

      <nav className="mt-8 grid gap-3 sm:grid-cols-2">
        <a
          href="/app/designer"
          className="flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-3 text-sm text-ink hover:border-line-strong"
        >
          {t('finance.prev', locale)}
        </a>
        <a
          href="/app/result"
          className="flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-medium text-on-accent"
        >
          {t('finance.next', locale)}
        </a>
      </nav>
    </section>
  );
}
