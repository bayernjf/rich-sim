import { useEffect, useMemo, useState } from 'react';
import type { Catalog } from '@rich-sim/core';
import { DRAFT_UPDATED_EVENT, readDraft, type Draft } from '../lib/draft';
import { t, format } from '../lib/messages';
import type { Locale } from '../lib/i18n';
import { track } from '../lib/analytics';
import {
  SCENARIO_DEFAULTS,
  SCENARIO_IDS,
  compareScenarios,
  type Scenario,
  type ScenarioId,
  type ScenarioOutcome,
} from '../lib/scenarios';

/**
 * M4 S1 · T02 情景面板（React 岛，client:load，挂在 /app/result 页内）。
 *
 * - 四个情景各自「开关 + 幅度」，改动即时重算（纯函数层 `compareScenarios`）。
 * - 情景**不持久化**：只活在组件 state 里，`Draft` 契约不动（`m4-task-breakdown.md`
 *   §2 S1 明确不做）。
 * - 无 draft / 无 profile 时整块不渲染（空态由 `ResultsView` 负责）。
 * - SSR 首帧渲染 null：关掉 JS 时基线卡片与假设清单仍是完整页面。
 * - 措辞只陈述算术与状态，**不得像投资或职业建议**（§1 规则 1）。
 */

type ScenarioState = Record<ScenarioId, { on: boolean; value: number }>;

function initialState(): ScenarioState {
  return {
    raise: { on: false, value: SCENARIO_DEFAULTS.raise ?? 0 },
    side: { on: false, value: SCENARIO_DEFAULTS.side ?? 0 },
    jobless: { on: false, value: 0 },
    'big-expense': { on: false, value: SCENARIO_DEFAULTS['big-expense'] ?? 0 },
  };
}

const LABEL_KEY: Record<ScenarioId, 'scenario.raise' | 'scenario.side' | 'scenario.jobless' | 'scenario.bigExpense'> = {
  raise: 'scenario.raise',
  side: 'scenario.side',
  jobless: 'scenario.jobless',
  'big-expense': 'scenario.bigExpense',
};

const UNIT_KEY: Record<ScenarioId, 'scenario.percent' | 'scenario.perMonth' | 'scenario.perOnce' | null> = {
  raise: 'scenario.percent',
  side: 'scenario.perMonth',
  jobless: null,
  'big-expense': 'scenario.perOnce',
};

export default function ScenarioPanel({
  catalog,
  locale = 'zh',
}: {
  catalog: Catalog;
  locale?: Locale;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ScenarioState>(initialState);

  useEffect(() => {
    const sync = () => setDraft(readDraft());
    sync();
    setReady(true);
    // 情景比较的是「同一套假设下的差值」，所以假设编辑器改写 draft 之后必须重读：
    // 留着旧假设会让四条情景线集体与上面的结果区口径不一致。
    window.addEventListener(DRAFT_UPDATED_EVENT, sync);
    return () => window.removeEventListener(DRAFT_UPDATED_EVENT, sync);
  }, []);

  const active: Scenario[] = useMemo(
    () =>
      SCENARIO_IDS.filter((id) => state[id].on).map((id) => ({
        id,
        value: state[id].value,
      })),
    [state],
  );

  const comparison = useMemo(
    () => (draft ? compareScenarios(draft, catalog, locale, active) : null),
    [draft, catalog, locale, active],
  );

  // 无草稿 / 无财务档案：整块不渲染（空态交给 ResultsView）。
  if (!ready || !draft || !draft.profile || !comparison) return null;
  const { baseline, outcomes } = comparison;
  if (baseline.status !== 'ok') return null;

  const toggle = (id: ScenarioId, on: boolean) => {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], on } }));
    // 只发事件名：情景 id、幅度、差值都不上传（收集端本来也丢 props，但源头就不发更干净）。
    track('scenario:toggle');
  };
  const setValue = (id: ScenarioId, value: number) =>
    setState((prev) => ({ ...prev, [id]: { ...prev[id], value } }));

  const statusLabel = (outcome: ScenarioOutcome): string => {
    if (outcome.results.status !== 'ok') return t('scenario.incomparable', locale);
    const s = outcome.results.projection.status;
    return t(`scenario.status.${s}` as 'scenario.status.reachable', locale);
  };

  const resultLine = (outcome: ScenarioOutcome): string => {
    if (outcome.results.status !== 'ok') return statusLabel(outcome);
    if (outcome.yearsDelta === null) {
      // 状态变了，或两侧不全可比 —— 说状态，不说年限。
      return outcome.statusChanged
        ? format(t('scenario.statusBecame', locale), { status: statusLabel(outcome) })
        : statusLabel(outcome);
    }
    if (outcome.yearsDelta === 0) return t('scenario.same', locale);
    return format(
      outcome.yearsDelta < 0 ? t('scenario.shorter', locale) : t('scenario.longer', locale),
      { n: Math.abs(outcome.yearsDelta) },
    );
  };

  const baselineYears =
    baseline.projection.status === 'reachable'
      ? format(t('scenario.baselineYears', locale), { n: baseline.projection.years })
      : statusLabel({
          id: 'raise',
          value: null,
          yearsDelta: null,
          statusChanged: false,
          results: baseline,
        });

  return (
    <section
      data-scenario-panel
      className="mt-4 rounded-2xl border border-line bg-panel p-6"
      aria-labelledby="scenario-title"
    >
      <h2 id="scenario-title" className="text-base font-medium text-ink">
        {t('scenario.title', locale)}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{t('scenario.intro', locale)}</p>
      <p data-scenario-baseline className="mt-3 text-xs text-muted">
        {baselineYears}
      </p>

      <ul className="mt-4 space-y-3">
        {SCENARIO_IDS.map((id) => {
          const row = state[id];
          const outcome = outcomes.find((o) => o.id === id);
          const unitKey = UNIT_KEY[id];
          const inputId = `scenario-${id}-value`;
          return (
            <li key={id} className="rounded-xl border border-line bg-panel-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    data-scenario-toggle={id}
                    checked={row.on}
                    onChange={(e) => toggle(id, e.target.checked)}
                    className="size-4 accent-[var(--c-accent)]"
                  />
                  {t(LABEL_KEY[id], locale)}
                </label>

                {unitKey && (
                  <label className="flex items-center gap-1.5 text-xs text-muted" htmlFor={inputId}>
                    <span className="sr-only">{t('scenario.value', locale)}</span>
                    <input
                      id={inputId}
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      value={row.value}
                      disabled={!row.on}
                      onChange={(e) => setValue(id, Number(e.target.value))}
                      className="min-h-11 w-24 rounded-lg border border-line bg-panel px-2 py-1.5 font-mono text-sm tabular-nums text-ink disabled:opacity-50"
                      onBlur={() => track('scenario:edit')}
                    />
                    {t(unitKey, locale)}
                  </label>
                )}
              </div>

              {row.on && outcome && (
                <p
                  data-scenario-result={id}
                  className="mt-2 font-mono text-xs tabular-nums text-ink motion-reduce:transition-none"
                >
                  {resultLine(outcome)}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* 改动即时播报给读屏器；同时充当结果区的 aria-live 容器 */}
      <p aria-live="polite" className="sr-only">
        {outcomes.map((o) => `${t(LABEL_KEY[o.id], locale)} ${resultLine(o)}`).join(locale === 'en' ? '; ' : '；')}
      </p>

      <p className="mt-4 text-xs leading-relaxed text-muted">{t('scenario.note', locale)}</p>
    </section>
  );
}
