import { useEffect, useMemo, useState } from 'react';
import type { Catalog } from '@rich-sim/core';
import { DRAFT_UPDATED_EVENT, readDraft, type Draft } from '../lib/draft';
import { t, format } from '../lib/messages';
import type { Locale } from '../lib/i18n';
import { buildReport } from '../lib/report';
import {
  PAYWALL_TIERS,
  expressIntent,
  intentProps,
  thanksNameKey,
  type PaywallState,
} from '../lib/paywall-probe';
import { track } from '../lib/analytics';

/**
 * M4 S2 · T02 报告视图（React 岛，client:load，挂在 /app/result 页内）。
 *
 * - **它是文档，不是表单**：正文没有任何输入框或折叠控件；唯一的动作是页首那个
 *   「打印 / 保存为 PDF」按钮（T06），而它自己会被 `@media print` 隐藏，不进纸面。
 *   内容全部来自
 *   `buildReport()`（T01），本组件只负责排版。
 * - **数据不出本机**：只读 `localStorage` 的草稿，没有任何网络路径（G1）。
 * - 无草稿 / 无 profile 时整块不渲染（空态由 `ResultsView` 负责）。
 * - 假设被改后要跟着重算，所以与情景面板一样监听 `DRAFT_UPDATED_EVENT`——
 *   否则报告会印着一套已经不成立的假设。
 * - `data-report` / `data-report-block` 是打印样式（T05）与冒烟（T08）的锚点。
 */

export default function ReportView({
  catalog,
  locale = 'zh',
}: {
  catalog: Catalog;
  locale?: Locale;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setDraft(readDraft());
    sync();
    setReady(true);
    window.addEventListener(DRAFT_UPDATED_EVENT, sync);
    return () => window.removeEventListener(DRAFT_UPDATED_EVENT, sync);
  }, []);

  const report = useMemo(
    () => (draft ? buildReport(draft, catalog, locale) : null),
    [draft, catalog, locale],
  );

  // 假付费信号：状态只活在组件里，不进 Draft、不持久化。
  const [paywall, setPaywall] = useState<PaywallState>({ status: 'idle' });

  if (!ready || !report) return null;

  const onIntent = (tierId: string) => {
    const tier = PAYWALL_TIERS.find((t) => t.id === tierId);
    if (!tier) return;
    const { event, next } = expressIntent(tier);
    track(event, intentProps(tier.id)); // 只带档位 id，不带任何金额
    setPaywall(next);
  };

  return (
    <section
      data-report
      aria-labelledby="report-title"
      className="mt-8 rounded-2xl border border-line bg-panel p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="report-title" className="text-base font-medium text-ink">
            {t('report.title', locale)}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {format(t('report.generatedOn', locale), { date: report.generatedOn })}
          </p>
        </div>
        {/* T06 打印入口：不进纸面（@media print 隐藏所有 button） */}
        <button
          type="button"
          data-report-print
          onClick={() => window.print()}
          className="min-h-11 rounded-full border border-line-strong px-4 py-2 text-sm text-ink transition-colors hover:border-accent"
        >
          {t('report.print', locale)}
        </button>
      </header>

      <div className="mt-5 space-y-5">
        {report.blocks.map((block) => (
          <section key={block.id} data-report-block={block.id}>
            <h3 className="text-sm font-medium text-ink">{block.title}</h3>
            <dl className="mt-2 divide-y divide-line">
              {block.fields.map((field, index) => (
                <div
                  key={`${block.id}-${index}`}
                  className="flex items-baseline justify-between gap-4 py-2"
                >
                  <dt className="text-xs text-muted">{field.label}</dt>
                  <dd className="font-mono text-sm tabular-nums text-ink">{field.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      {/* 假付费墙：不收款，只采集一次意愿（PRD §11.2 破环探针）。
          打印时整个块随其它非报告正文内容一起隐藏（@media print 隐藏 button）。 */}
      <div
        data-paywall-probe
        className="mt-6 rounded-xl border border-line bg-panel-2 p-4"
      >
        {paywall.status === 'idle' ? (
          <>
            <h3 className="text-sm font-medium text-ink">{t('paywall.title', locale)}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {t('paywall.body', locale)}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {PAYWALL_TIERS.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  data-paywall-tier={tier.id}
                  onClick={() => onIntent(tier.id)}
                  className="min-h-11 rounded-full border border-line-strong px-4 py-2 text-xs text-ink transition-colors hover:border-accent"
                >
                  {t(tier.nameKey, locale)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p data-paywall-thanks className="text-sm text-ink">
            {format(t('paywall.thanks', locale), {
              tier: t(thanksNameKey(paywall.tier), locale),
            })}
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          {t('paywall.note', locale)}
        </p>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-muted">{t('report.note', locale)}</p>
    </section>
  );
}
