import { useEffect, useState } from 'react';
import type { Assumptions } from '@rich-sim/core';
import {
  DEFAULT_RATES,
  RATE_BOUNDS,
  RATE_FIELDS,
  applyRate,
  formatRate,
  isDefaultRates,
  parseRatePercent,
  patchAssumptionDisplay,
  toPercentInput,
  type RateError,
  type RateField,
} from '../lib/assumptions';
import { readDraft, writeDraft } from '../lib/draft';
import { DEFAULT_ASSUMPTIONS } from '../lib/defaults';
import { format, t, type MessageKey } from '../lib/messages';
import type { Locale } from '../lib/i18n';
import { track } from '../lib/analytics';

/**
 * M4 · 可调假设岛（client:load，挂在 /app/result）。
 *
 * 补的是 PRD §6.2 一直欠着的那句话：安全提取率「必须显式展示为**可调**假设」、
 * r「用户可调」。展示早就有了（`AssumptionsPanel`），能改从来没有。
 *
 * - 只改 `draft.assumptions` 里那两个数——字段本就在契约内，公式一个字没动，
 *   所以 `assumptionsVersion` 不 bump（那是口径版本，见 CONVENTIONS）。
 * - 即时重算：写盘走 `writeDraft`，它派发同页事件，结果区与情景面板各自重读
 *   `readDraft()`。写之前也重读一次，避免用本岛的旧快照盖掉别的岛刚写的 choices。
 * - 合规清单不能替不成立的假设背书：SSR 那份只会印默认值，所以每次改动都同步
 *   改写 `[data-assumption]` 那几个节点（`patchAssumptionDisplay`）。
 * - 措辞只讲算术：说「分母」「年限」，不说「收益好不好」。通胀不参与换算，
 *   就明确写在这里不参与换算，不给一个不动任何数字的输入框。
 * - 无 draft / 无 profile → 整块不渲染；SSR 首帧为 null，关 JS 时这一页仍是
 *   完整的测算 + 假设清单 + 免责声明。
 */

const LABEL_KEY: Record<RateField, 'assumptions.returnRate' | 'assumptions.withdrawalRate'> = {
  returnRate: 'assumptions.returnRate',
  withdrawalRate: 'assumptions.withdrawalRate',
};

const HINT_KEY: Record<RateField, 'assumptions.editor.returnHint' | 'assumptions.editor.withdrawalHint'> = {
  returnRate: 'assumptions.editor.returnHint',
  withdrawalRate: 'assumptions.editor.withdrawalHint',
};

const ERROR_KEY: Record<RateError, MessageKey> = {
  empty: 'assumptions.error.empty',
  invalid: 'assumptions.error.invalid',
  below: 'assumptions.error.below',
  above: 'assumptions.error.above',
};

/** 输入框里的百分数文本（用户看到的是 4，不是 0.04）。 */
type RateText = Record<RateField, string>;

function textOf(a: Assumptions): RateText {
  return {
    returnRate: toPercentInput(a.returnRate),
    withdrawalRate: toPercentInput(a.withdrawalRate),
  };
}

export default function AssumptionsEditor({ locale = 'zh' }: { locale?: Locale }) {
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [text, setText] = useState<RateText | null>(null);
  const [error, setError] = useState<{ field: RateField; reason: RateError } | null>(null);
  const [applied, setApplied] = useState('');

  useEffect(() => {
    const draft = readDraft();
    // 没有 profile 就没有任何按假设算出来的数字，这块放进去只是噪音。
    if (!draft?.profile) return;
    // draft.assumptions 为 null = 这台机器还没落过假设，用的就是默认值。
    const current = draft.assumptions ?? DEFAULT_ASSUMPTIONS;
    setAssumptions(current);
    setText(textOf(current));
    patchAssumptionDisplay(current, undefined, locale);
  }, [locale]);

  if (!assumptions || !text) return null;

  const commit = (next: Assumptions) => {
    const draft = readDraft();
    if (!draft) return;
    writeDraft({ ...draft, assumptions: next });
    setAssumptions(next);
    setApplied(
      format(t('assumptions.editor.applied', locale), {
        withdrawal: formatRate(next.withdrawalRate),
        returnRate: formatRate(next.returnRate),
      }),
    );
    // 合规清单那几个数字是 SSR 印的默认值，改完必须跟着改成真正在用的那套。
    patchAssumptionDisplay(next, undefined, locale);
  };

  const handleChange = (field: RateField, raw: string) => {
    setText((prev) => (prev ? { ...prev, [field]: raw } : prev));
    // 清空是打字过程中的常态（全选再输入），不是错误：不写盘也不报红。
    if (raw.trim() === '') {
      setError(null);
      return;
    }
    const parsed = parseRatePercent(raw, field);
    if (!parsed.ok) {
      setError({ field, reason: parsed.reason });
      return;
    }
    setError(null);
    commit(applyRate(assumptions, field, parsed.value));
    track('assumptions:edit', { field });
  };

  /** 失焦时还留着非法输入，就把这个框拉回真正生效的那个值。 */
  const handleBlur = (field: RateField) => {
    if (!error || error.field !== field) return;
    setText((prev) => (prev ? { ...prev, [field]: toPercentInput(assumptions[field]) } : prev));
    setError(null);
  };

  const handleReset = () => {
    const next: Assumptions = {
      ...assumptions,
      returnRate: DEFAULT_RATES.returnRate,
      withdrawalRate: DEFAULT_RATES.withdrawalRate,
    };
    commit(next);
    setText(textOf(next));
    setError(null);
    track('assumptions:reset');
  };

  return (
    <section
      data-assumptions-editor
      aria-labelledby="assumptions-editor-title"
      className="mt-4 rounded-2xl border border-line bg-panel p-6"
    >
      <h2 id="assumptions-editor-title" className="text-base font-medium text-ink">
        {t('assumptions.editor.title', locale)}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{t('assumptions.editor.lead', locale)}</p>

      <ul className="mt-4 space-y-4">
        {RATE_FIELDS.map((field) => {
          const bounds = RATE_BOUNDS[field];
          const minPct = toPercentInput(bounds.min);
          const maxPct = toPercentInput(bounds.max);
          const hintId = `assumption-${field}-hint`;
          const showBounds = format(t('assumptions.editor.range', locale), {
            min: minPct,
            max: maxPct,
          });
          return (
            <li key={field} className="rounded-xl border border-line bg-panel-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label htmlFor={`assumption-${field}`} className="text-sm text-ink">
                  {t(LABEL_KEY[field], locale)}
                </label>
                <span className="flex items-center gap-1.5">
                  <input
                    id={`assumption-${field}`}
                    data-assumption-input={field}
                    type="number"
                    min={minPct}
                    max={maxPct}
                    step="0.5"
                    inputMode="decimal"
                    value={text[field]}
                    onChange={(e) => handleChange(field, e.target.value)}
                    onBlur={() => handleBlur(field)}
                    aria-describedby={hintId}
                    className="w-24 rounded-lg border border-line bg-panel px-2 py-1.5 font-mono text-sm tabular-nums text-ink focus-visible:outline-accent"
                  />
                  <span className="text-xs text-muted">{t('assumptions.editor.percent', locale)}</span>
                </span>
              </div>
              <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-muted">
                {t(HINT_KEY[field], locale)} {showBounds}
              </p>
              {error?.field === field && (
                <p role="alert" className="mt-1 text-xs text-danger">
                  {format(t(ERROR_KEY[error.reason], locale), { min: minPct, max: maxPct })}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-muted">{t('assumptions.editor.inflationNote', locale)}</p>

      {!isDefaultRates(assumptions) && (
        <button
          type="button"
          data-assumption-reset
          onClick={handleReset}
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-line px-4 py-2 text-sm text-ink hover:border-line-strong"
        >
          {t('assumptions.editor.reset', locale)}
        </button>
      )}

      {/* 改了什么、按什么重算，读屏器要能听见（结果区本身不是 live region）。 */}
      <p aria-live="polite" className="sr-only">
        {applied}
      </p>
    </section>
  );
}
