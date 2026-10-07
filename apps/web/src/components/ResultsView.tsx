import { useEffect, useState } from 'react';
import type { Catalog, Currency } from '@rich-sim/core';
import Interpolated from './Interpolated';
import { DRAFT_UPDATED_EVENT, readDraft, writeDraft } from '../lib/draft';
import {
  dayKey,
  diffSnapshots,
  previousDay,
  snapshotOf,
  upsertToday,
  type ProgressDiff,
  type Snapshot,
} from '../lib/progress';
import { computeResults } from '../lib/results';
import type { Results } from '../lib/results';
import { format, t, type MessageKey } from '../lib/messages';
import type { Locale } from '../lib/i18n';
import { track } from '../lib/analytics';

/**
 * T08 · 测算输出视图（React 岛，client:load）。
 *
 * - mount 时 readDraft() + initialCatalogUSD 调 computeResults（纯函数层）。
 * - 三状态（reachable / unreachable / no-net-savings）是一等状态卡片，
 *   不是错误分支（PRD F3 / CONVENTIONS 红线）。
 * - 金额一律按 draft.currency 格式化，等宽数字，币种标签始终可见。
 * - 假设清单与免责声明由 result.astro 的 <AssumptionsPanel /> 纯 SSR 渲染，
 *   不依赖本岛。
 * - 假设编辑器是**另一个岛**：它 writeDraft 后本岛靠 DRAFT_UPDATED_EVENT 重读
 *   重算，所以「改假设 -> 上面的数字立刻跟着变」不需要刷新页面。
 * - 文案走 messages（i18n 切片三）。阶梯目标的行动项**由词典渲染**而不是
 *   直接用 core 返回的 `m.action`：core 那句是中文。两边不能各写一份还指望它们
 *   一致，所以 i18n.test.ts 有一条「zh 词典必须逐字等于 core 的 action」的测试，
 *   改一边就红另一边。未知阶段号才退回 `m.action`。
 */

type View = Results | 'loading' | 'no-draft';

/** 一次回访的对照读数：上一条（不是今天的最后一次测算）与本次。 */
type Review = { previous: Snapshot; current: Snapshot; diff: ProgressDiff };

const STAGE_ACTION: Record<number, MessageKey> = {
  1: 'result.action1',
  2: 'result.action2',
  3: 'result.action3',
};

function fmtMoney(n: number, c: Currency, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    style: 'currency',
    currency: c,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(n);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function ResultsView({
  catalog,
  locale = 'zh',
}: {
  catalog: Catalog;
  locale?: Locale;
}) {
  // SSR 确定性渲染：加载占位（结果区挂载标记随之出现在源码里）。
  const [view, setView] = useState<View>('loading');
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    let tracked = false;

    const recompute = () => {
      const draft = readDraft();
      if (!draft) {
        setView('no-draft');
        setReview(null);
        return;
      }
      const emit = (res: Results) => {
        setView(res);

        // F6（本机版）· 本次测算的读数与「和上一次比」。
        const snap = draft.profile ? snapshotOf(res, draft.profile) : null;
        const history = draft.history ?? [];
        // previousDay 用**写盘前**的 history：今天这条不参与，比的是上一个历日。
        const previous = snap ? previousDay(history, dayKey(snap.at)) : null;
        setReview(previous && snap ? { previous, current: snap, diff: diffSnapshots(previous, snap) } : null);

        // 一条访问只报一组：假设编辑器每改一次都会广播回来重算，若每次都会把
        // 「看过结果」刷成「改了假设」（那一步有自己的事件名）。
        const firstCompute = !tracked;
        if (firstCompute) {
          tracked = true;
          track('results:view', {
            status: res.status === 'ok' ? res.projection.status : res.status,
            currency: res.status === 'ok' ? res.currency : undefined,
          });
          if (res.status === 'ok') track('converter:view', { status: res.converter.status });
          // progress:view 没有任何 props。它存在本身就是一条读数：「这台机器今天
          // 回来看过，而且手里有至少两个历日的记录」——在收集端不存标识符的前提下，
          // 这是回访唯一能被**计数**的形式（不是回访率，见 PRD §11.2 的死结）。
          if (previous) track('progress:view');
        }

        // 落一条本机快照：每次重算都覆盖**当天**那一条，所以存的就是这一屏此刻的
        // 数——与用户看到的对比保持一致，而不是他进来那一刻的。写盘放在报点之后，
        // tracked 已经落下来，因此那条写触发的重入只会重渲染、不会再报点。
        // 值真的没变时 upsertToday 返回同一个数组，于是一个字节都不写。
        if (snap) {
          const next = upsertToday(history, snap);
          if (next !== history) writeDraft({ ...draft, history: next });
        }
      };
      try {
        emit(computeResults(draft, catalog, locale));
      } catch {
        // choices 与 Catalog 失配（旧本机方案）-> 退回默认选择重算。
        emit(computeResults({ ...draft, choices: [] }, catalog, locale));
      }
    };

    recompute();
    window.addEventListener(DRAFT_UPDATED_EVENT, recompute);
    return () => window.removeEventListener(DRAFT_UPDATED_EVENT, recompute);
  }, [catalog, locale]);

  const money = (n: number, c: Currency) => fmtMoney(n, c, locale);

  return (
    <section data-results-root className="pb-10">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          {t('result.eyebrow', locale)}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{t('result.h1', locale)}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('result.intro', locale)}</p>
      </header>

      {view === 'loading' && (
        <p className="mt-8 text-sm text-muted" data-results-loading aria-live="polite">
          {t('result.loading', locale)}
        </p>
      )}

      {(view === 'no-draft' || (view !== 'loading' && view.status === 'no-profile')) && (
        <div className="mt-8 rounded-2xl border border-line bg-panel p-6">
          <h2 className="text-base font-medium">{t('result.noProfileTitle', locale)}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t('result.noProfileBody', locale)}</p>
          <a
            href="/app/finance"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 py-3 text-sm font-medium text-on-accent"
          >
            {t('result.goToFinance', locale)}
          </a>
        </div>
      )}

      {view !== 'loading' && view !== 'no-draft' && view.status === 'ok' && (
        <>
          {/* 核心数字：够用线 + 理想生活年成本 + 储蓄率 */}
          <div className="mt-8 rounded-2xl border border-line bg-panel p-6">
            <p className="text-xs text-muted">{t('result.enoughLine', locale)}</p>
            <p className="mt-1 font-mono text-4xl font-semibold tabular-nums text-ink">
              {money(view.enoughLine, view.currency)}
              <span className="ml-2 align-middle text-sm font-normal text-muted">{view.currency}</span>
            </p>
            {view.goalFrom === 'sim-cart' && (
              <p data-goal-source className="mt-3 inline-flex items-center rounded-full border border-accent bg-accent-soft px-3 py-1 text-xs text-ink">
                {t('result.cartGoalTag', locale)}
              </p>
            )}
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted">{t('result.annualCost', locale)}</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-ink">
                  {money(view.annualCostLocal, view.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('result.savingsRate', locale)}</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-ink">
                  {view.savingsRate === null ? '—' : pct(view.savingsRate)}
                </dd>
              </div>
            </dl>
          </div>

          {/* S3 换算条：把这份理想生活翻译成用户自己的时间单位（§2.1 纯除法，不含假设） */}
          <p
            data-converter-line
            className="mt-4 rounded-xl border border-line bg-panel px-4 py-3 text-xs leading-relaxed text-muted"
          >
            {view.converter.sentence}
          </p>

          {/* 三状态一等状态卡片 */}
          <div
            data-status={view.projection.status}
            className={[
              'mt-4 rounded-2xl border p-6',
              view.projection.status === 'reachable' ? 'border-accent bg-accent-soft' : 'border-line bg-panel',
            ].join(' ')}
          >
            {view.projection.status === 'reachable' && (
              <>
                <h2 className="text-base font-semibold text-ink">
                  <Interpolated
                    template={t('result.reachableH', locale)}
                    vars={{ years: view.projection.years }}
                  />
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  <Interpolated
                    template={t('result.reachableBody', locale)}
                    vars={{ years: view.projection.years, rate: pct(view.projection.savingsRate) }}
                  />
                </p>
              </>
            )}
            {view.projection.status === 'unreachable' && (
              <>
                <h2 className="text-base font-semibold text-ink">{t('result.unreachableH', locale)}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  <Interpolated
                    template={t('result.unreachableBody', locale)}
                    vars={{ cap: 60, rate: pct(view.projection.savingsRate) }}
                  />
                </p>
              </>
            )}
            {view.projection.status === 'no-net-savings' && (
              <>
                <h2 className="text-base font-semibold text-ink">{t('result.noNetH', locale)}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t('result.noNetBody', locale)}</p>
              </>
            )}
          </div>

          {/* F6（本机版）· 与上一次测算的对照。放在状态卡之后：它解释的就是上面这些数。 */}
          {review && (
            <div data-progress-note className="mt-4 rounded-2xl border border-line bg-panel px-6 py-4">
              <p className="text-xs font-medium uppercase tracking-widest text-accent">
                {t('progress.eyebrow', locale)}
              </p>
              <p className="mt-1 text-xs text-muted">
                <span className="font-mono tabular-nums">
                  {format(t('progress.range', locale), {
                    // 两侧都走 dayKey：快照的 at 是 UTC 串，直接 slice 会在东八区晚上
                    // 显示成前一天，而这一屏下面比的是本机历日。
                    from: dayKey(review.previous.at),
                    to: dayKey(review.current.at),
                  })}
                </span>
                {' · '}
                {format(t('progress.days', locale), { n: review.diff.daysBetween })}
              </p>

              <ul className="mt-2 space-y-1 text-sm leading-relaxed text-ink">
                {review.diff.statusChanged && (
                  <li data-progress-status>
                    {format(t('progress.status', locale), {
                      from: t(`scenario.status.${review.previous.status}` as 'scenario.status.reachable', locale),
                      to: t(`scenario.status.${review.current.status}` as 'scenario.status.reachable', locale),
                    })}
                  </li>
                )}
                {review.diff.yearsDelta !== null && (
                  <li data-progress-years>
                    {format(
                      t(
                        review.diff.yearsDelta < 0
                          ? 'progress.yearsEarlier'
                          : review.diff.yearsDelta > 0
                            ? 'progress.yearsLater'
                            : 'progress.yearsSame',
                        locale,
                      ),
                      {
                        from: review.previous.years ?? '—',
                        to: review.current.years ?? '—',
                        n: Math.abs(review.diff.yearsDelta),
                      },
                    )}
                  </li>
                )}
                {review.diff.netWorthDelta !== null && (
                  <li data-progress-net>
                    {format(
                      t(
                        review.diff.netWorthDelta > 0
                          ? 'progress.netUp'
                          : review.diff.netWorthDelta < 0
                            ? 'progress.netDown'
                            : 'progress.netSame',
                        locale,
                      ),
                      { amount: money(Math.abs(review.diff.netWorthDelta), review.current.currency) },
                    )}
                  </li>
                )}
              </ul>

              {!review.diff.sameCurrency && (
                <p data-progress-currency-note className="mt-2 text-xs leading-relaxed text-muted">
                  {format(t('progress.currencyNote', locale), {
                    from: review.previous.currency,
                    to: review.current.currency,
                  })}
                </p>
              )}

              <p className="mt-2 text-xs leading-relaxed text-muted">{t('progress.note', locale)}</p>
            </div>
          )}

          {/* gap 区 */}
          <div className="mt-4 rounded-2xl border border-line bg-panel p-6">
            <h2 className="text-base font-medium text-ink">{t('result.gapTitle', locale)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {view.gapResult.annualGap > 0 ? (
                <Interpolated
                  template={t('result.gapNeed', locale)}
                  vars={{ amount: money(view.gapResult.annualGap, view.currency) }}
                />
              ) : (
                t('result.gapOk', locale)
              )}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {t('result.gapYears', locale)}
              <span className="font-mono tabular-nums text-ink">
                {view.projection.status === 'no-net-savings'
                  ? t('result.yearsNoNet', locale)
                  : view.gapResult.yearsAtCurrentPace >= 60
                    ? format(t('result.yearsOverCap', locale), { cap: 60 })
                    : format(t('result.yearsApprox', locale), {
                        years: view.gapResult.yearsAtCurrentPace,
                      })}
              </span>
            </p>
          </div>

          {/* 阶梯目标 */}
          <div className="mt-8">
            <h2 className="text-base font-medium text-ink">{t('result.milestonesTitle', locale)}</h2>
            <p className="mt-1 text-xs text-muted">{t('result.milestonesNote', locale)}</p>
            <div className="mt-3 space-y-3">
              {view.milestones.map((m) => {
                const key = STAGE_ACTION[m.stage];
                return (
                  <div key={m.stage} className="rounded-2xl border border-line bg-panel p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium text-ink">
                        {format(t('result.stage', locale), { stage: m.stage })}
                      </p>
                      <p className="font-mono text-sm tabular-nums text-ink">
                        {money(m.goalValue, view.currency)}
                        <span className="ml-1 text-xs text-muted">
                          / {format(t('result.yearsApprox', locale), { years: m.years })}
                        </span>
                      </p>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">
                      {key ? t(key, locale) : m.action}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <nav className="mt-8 grid gap-3 sm:grid-cols-2">
            <a
              href="/app/finance"
              className="flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-3 text-sm text-ink hover:border-line-strong"
            >
              {t('result.prevFinance', locale)}
            </a>
            <a
              href="/app/designer"
              className="flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-3 text-sm text-ink hover:border-line-strong"
            >
              {t('result.redesign', locale)}
            </a>
          </nav>
        </>
      )}
    </section>
  );
}
