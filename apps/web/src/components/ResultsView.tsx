import { useEffect, useState } from 'react';
import type { Catalog, Currency } from '@rich-sim/core';
import Interpolated from './Interpolated';
import { readDraft } from '../lib/draft';
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
 * - 文案走 messages（i18n 切片三）。阶梯目标的行动项**由词典渲染**而不是
 *   直接用 core 返回的 `m.action`：core 那句是中文。两边不能各写一份还指望它们
 *   一致，所以 i18n.test.ts 有一条「zh 词典必须逐字等于 core 的 action」的测试，
 *   改一边就红另一边。未知阶段号才退回 `m.action`。
 */

type View = Results | 'loading' | 'no-draft';

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

  useEffect(() => {
    const draft = readDraft();
    if (!draft) {
      setView('no-draft');
      return;
    }
    try {
      const res = computeResults(draft, catalog, locale);
      setView(res);
      track('results:view', {
        status: res.status === 'ok' ? res.projection.status : res.status,
        currency: res.status === 'ok' ? res.currency : undefined,
      });
      if (res.status === 'ok') track('converter:view', { status: res.converter.status });
    } catch {
      // choices 与 Catalog 失配（旧本机方案）-> 退回默认选择重算。
      const res = computeResults({ ...draft, choices: [] }, catalog, locale);
      setView(res);
      track('results:view', { status: res.status === 'ok' ? res.projection.status : res.status });
      if (res.status === 'ok') track('converter:view', { status: res.converter.status });
    }
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
