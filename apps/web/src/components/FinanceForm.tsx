import { useEffect, useState } from 'react';
import type { Currency, LifeChoice, Profile } from '@rich-sim/core';
import { readDraft, writeDraft } from '../lib/draft';
import { DEFAULT_ASSUMPTIONS, DEFAULT_CURRENCY } from '../lib/defaults';
import { track } from '../lib/analytics';

/**
 * T07 · 轻量财务录入（mobile-first）。
 *
 * - 恰好 4 个字段：月收入 / 月支出 / 现有存款 / 负债（PRD §8 F2：≤4 项、
 *   每项带示例值、可随时修改并重算）。
 * - 校验：仅接受有限非负数；负数 / NaN / 空值 → 内联错误并阻止写入；
 *   合法修改 → 立即经 lib/draft.ts 写回 localStorage（保留其余字段）。
 * - mount 时从 readDraft() 恢复已有 profile（数值合法才恢复）。
 * - 持久化一律走 readDraft / writeDraft，不绕过入口。
 */

type FieldKey = 'income' | 'expense' | 'savings' | 'debt';

const FIELD_KEYS: FieldKey[] = ['income', 'expense', 'savings', 'debt'];

type FieldDef = {
  key: FieldKey;
  label: string;
  hint: string;
  placeholder: string;
};

const FIELDS: FieldDef[] = [
  { key: 'income', label: '月收入', hint: '每月税后到手总收入', placeholder: '如 15000' },
  { key: 'expense', label: '月支出', hint: '每月固定生活开销', placeholder: '如 8000' },
  { key: 'savings', label: '现有存款', hint: '当前可动用的储蓄总额', placeholder: '如 100000' },
  { key: 'debt', label: '负债', hint: '房贷 / 车贷 / 信用卡等欠款总额', placeholder: '如 0' },
];

type Validation = { ok: true; value: number } | { ok: false; reason: 'empty' | 'negative' | 'nan' };

function validate(raw: string): Validation {
  if (raw.trim() === '') return { ok: false, reason: 'empty' };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, reason: 'nan' };
  if (n < 0) return { ok: false, reason: 'negative' };
  return { ok: true, value: n };
}

const ERROR_TEXT: Record<Exclude<Validation, { ok: true }>['reason'], string> = {
  empty: '请输入数值',
  negative: '不能为负数，请填 0 或更大的数',
  nan: '请输入有效数字',
};

/** 已存 profile 仅在四项均为有限非负数时才恢复。 */
function isValidProfile(p: Profile | null | undefined): p is Profile {
  if (!p) return false;
  return FIELD_KEYS.every((k) => Number.isFinite(p[k]) && p[k] >= 0);
}

const emptyText = (): Record<FieldKey, string> => ({
  income: '',
  expense: '',
  savings: '',
  debt: '',
});

const emptyTouched = (): Record<FieldKey, boolean> => ({
  income: false,
  expense: false,
  savings: false,
  debt: false,
});

export default function FinanceForm() {
  // SSR 确定性渲染：空输入 + 默认币种，SSR HTML 即含四个 label 与单位提示。
  const [text, setText] = useState<Record<FieldKey, string>>(emptyText);
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>(emptyTouched);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [saved, setSaved] = useState(false);

  // 仅在浏览器执行：localStorage 不可用于 SSR。
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    setCurrency(draft.currency);
    if (isValidProfile(draft.profile)) {
      setText({
        income: String(draft.profile.income),
        expense: String(draft.profile.expense),
        savings: String(draft.profile.savings),
        debt: String(draft.profile.debt),
      });
      setSaved(true);
    }
  }, []);

  const handleChange = (key: FieldKey, raw: string) => {
    const nextText = { ...text, [key]: raw };
    setText(nextText);
    setTouched((t) => ({ ...t, [key]: true }));

    const res = validate(raw);
    if (!res.ok) {
      // 非法输入：内联错误提示，阻止写入 draft。
      setSaved(false);
      return;
    }

    // 组装完整 profile：本字段用新值；其余字段优先取当前输入，
    // 取不到则回退到已存 draft 的值（不编造默认 0）。
    const existing = readDraft();
    const profile = {} as Profile;
    let complete = true;
    for (const f of FIELDS) {
      const r = validate(nextText[f.key]);
      if (r.ok) {
        profile[f.key] = r.value;
      } else if (isValidProfile(existing?.profile)) {
        profile[f.key] = existing.profile[f.key];
      } else {
        complete = false;
      }
    }
    if (!complete) {
      // 其余字段尚未填齐，暂不写入，保持本机 draft 不变。
      setSaved(false);
      return;
    }

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
    setSaved(true);
    track('finance:update', {
      field: key,
      income: profile.income,
      expense: profile.expense,
      savings: profile.savings,
      debt: profile.debt,
    });
  };

  return (
    <section className="pb-24">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">财务录入</p>
        <h1 className="mt-2 text-2xl font-semibold">填一下你的财务现状</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          只需要 4 个数，随时可以回来改。单位：{currency}（按月计）。
        </p>
      </header>

      <div className="mt-6 space-y-4">
        {FIELDS.map((f) => {
          const res = validate(text[f.key]);
          const showError = touched[f.key] && !res.ok;
          return (
            <div key={f.key} className="rounded-2xl border border-line bg-panel p-4">
              <label
                htmlFor={`field-${f.key}`}
                className="block text-sm font-medium text-ink"
              >
                {f.label}
              </label>
              <input
                id={`field-${f.key}`}
                type="number"
                min={0}
                step={100}
                inputMode="decimal"
                placeholder={f.placeholder}
                value={text[f.key]}
                onChange={(e) => handleChange(f.key, e.target.value)}
                aria-invalid={showError}
                aria-describedby={showError ? `error-${f.key}` : undefined}
                className={[
                  'mt-2 block w-full min-h-11 rounded-xl border bg-panel-2 px-3 py-3',
                  'text-base font-mono tabular-nums text-ink placeholder:text-muted',
                  showError ? 'border-accent' : 'border-line',
                ].join(' ')}
              />
              <p className="mt-1.5 text-xs text-muted">{f.hint}</p>
              {showError && (
                <p id={`error-${f.key}`} role="alert" className="mt-1 text-xs text-accent">
                  {ERROR_TEXT[res.reason]}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted" aria-live="polite">
        {saved ? '已自动保存到本机' : '4 项填齐后自动保存到本机'}
      </p>

      <nav className="mt-8 grid gap-3 sm:grid-cols-2">
        <a
          href="/app/designer"
          className="flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-3 text-sm text-ink hover:border-line-strong"
        >
          ← 上一步：设计理想生活
        </a>
        <a
          href="/app/result"
          className="flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-medium text-on-accent"
        >
          下一步：看测算结果 →
        </a>
      </nav>
    </section>
  );
}
