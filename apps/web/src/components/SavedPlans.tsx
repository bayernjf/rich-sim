/**
 * F9（本机版）· 多剧本存档（client:load 岛，挂 /app/result）。
 *
 * 纪律与边界（与 lib/plans.ts 头注释一致）：
 * - **SSR/无 JS 不渲染**：内容来自 localStorage，SSR 空帧、挂载后才有——
 *   与 ContinueDraft 同一条模式，避免 hydration mismatch。
 * - **事件零 props**：剧本名是用户起的，可能带个人信息；`plan:save` 等事件
 *   只报名字不带 props（与 progress:view 同一条红线纪律）。
 * - **不写引擎**：载入 = 把存档输入写回 Draft，数字由既有 `computeResults` 重算。
 */
import { useEffect, useState } from 'react';
import { DRAFT_UPDATED_EVENT, readDraft, writeDraft, type Draft } from '../lib/draft';
import { MAX_PLAN_NAME, MAX_SAVED_PLANS, applyPlan, removePlan, savePlan } from '../lib/plans';
import { track } from '../lib/analytics';
import { format, t } from '../lib/messages';
import type { Locale } from '../lib/i18n';

export default function SavedPlans({ locale = 'zh' }: { locale?: Locale }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const sync = () => setDraft(readDraft());
    sync();
    window.addEventListener(DRAFT_UPDATED_EVENT, sync);
    return () => window.removeEventListener(DRAFT_UPDATED_EVENT, sync);
  }, []);

  if (!draft) return null;

  const plans = draft.savedPlans ?? [];

  const handleSave = () => {
    const hadSameName = plans.some((plan) => plan.name === name.trim().replace(/\s+/g, ' '));
    const result = savePlan(draft, name);
    if (!result.ok) {
      setNotice(
        result.reason === 'empty-name'
          ? t('plans.emptyName', locale)
          : format(t('plans.tooMany', locale), { max: MAX_SAVED_PLANS }),
      );
      return;
    }
    writeDraft(result.draft);
    track('plan:save');
    setNotice(
      format(t(hadSameName ? 'plans.overwritten' : 'plans.saved', locale), { name: result.plan.name }),
    );
    setName('');
  };

  const handleLoad = (id: string, planName: string) => {
    const next = applyPlan(draft, id);
    if (!next) return;
    writeDraft(next);
    track('plan:load');
    setNotice(format(t('plans.loaded', locale), { name: planName }));
  };

  const handleDelete = (id: string) => {
    writeDraft(removePlan(draft, id));
    track('plan:delete');
    setNotice('');
  };

  return (
    <section
      data-saved-plans
      aria-labelledby="saved-plans-heading"
      className="mt-8 rounded-2xl border border-line bg-panel px-4 py-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="saved-plans-heading" className="text-sm font-semibold tracking-tight">
          {t('plans.eyebrow', locale)}
        </h2>
        <span className="font-mono text-xs tabular-nums text-muted">
          {format(t('plans.count', locale), { n: plans.length, max: MAX_SAVED_PLANS })}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{t('plans.intro', locale)}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          data-plan-name
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSave();
          }}
          placeholder={t('plans.placeholder', locale)}
          maxLength={MAX_PLAN_NAME}
          className="min-h-11 flex-1 rounded-xl border border-line bg-canvas px-3 text-sm text-ink placeholder:text-muted"
        />
        <button
          type="button"
          data-plan-save
          onClick={handleSave}
          className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent"
        >
          {t('plans.save', locale)}
        </button>
      </div>

      <p data-plan-notice aria-live="polite" className="mt-2 min-h-4 text-xs text-accent">
        {notice}
      </p>

      {plans.length === 0 ? (
        <p className="mt-1 text-xs text-muted">{t('plans.empty', locale)}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {plans.map((plan) => (
            <li
              key={plan.id}
              data-plan-item
              className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{plan.name}</span>
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  data-plan-load
                  onClick={() => handleLoad(plan.id, plan.name)}
                  className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 py-1.5 text-xs font-medium text-ink"
                >
                  {t('plans.load', locale)}
                </button>
                <button
                  type="button"
                  data-plan-delete
                  onClick={() => handleDelete(plan.id)}
                  className="inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-xs text-muted hover:text-danger"
                >
                  {t('plans.delete', locale)}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
