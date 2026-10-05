import { useEffect, useState } from 'react';
import type { Catalog, Currency } from '@rich-sim/core';
import { readDraft } from '../lib/draft';
import { computeResults } from '../lib/results';
import type { Results } from '../lib/results';
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
 */

type View = Results | 'loading' | 'no-draft';

function fmtMoney(n: number, c: Currency): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: c,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(n);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function ResultsView({ catalog }: { catalog: Catalog }) {
  // SSR 确定性渲染：加载占位（结果区挂载标记随之出现在源码里）。
  const [view, setView] = useState<View>('loading');

  useEffect(() => {
    const draft = readDraft();
    if (!draft) {
      setView('no-draft');
      return;
    }
    try {
      const res = computeResults(draft, catalog);
      setView(res);
      track('results:view', {
        status: res.status === 'ok' ? res.projection.status : res.status,
        currency: res.status === 'ok' ? res.currency : undefined,
      });
      if (res.status === 'ok') track('converter:view', { status: res.converter.status });
    } catch {
      // choices 与 Catalog 失配（旧本机方案）-> 退回默认选择重算。
      const res = computeResults({ ...draft, choices: [] }, catalog);
      setView(res);
      track('results:view', { status: res.status === 'ok' ? res.projection.status : res.status });
      if (res.status === 'ok') track('converter:view', { status: res.converter.status });
    }
  }, [catalog]);

  return (
    <section data-results-root className="pb-10">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">测算结果</p>
        <h1 className="mt-2 text-2xl font-semibold">你的财富模拟结果</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          下面只对你本机填的假设做静态算术，不预测、不承诺。
        </p>
      </header>

      {view === 'loading' && (
        <p className="mt-8 text-sm text-muted" data-results-loading aria-live="polite">正在读取本机方案…</p>
      )}

      {(view === 'no-draft' || (view !== 'loading' && view.status === 'no-profile')) && (
        <div className="mt-8 rounded-2xl border border-line bg-panel p-6">
          <h2 className="text-base font-medium">还没有录入财务现状</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            测算需要你的月收入、月支出、存款与负债（4 项，随时可改）。
          </p>
          <a
            href="/app/finance"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 py-3 text-sm font-medium text-on-accent"
          >
            先录入财务 →
          </a>
        </div>
      )}

      {view !== 'loading' && view !== 'no-draft' && view.status === 'ok' && (
        <>
          {/* 核心数字：够用线 + 理想生活年成本 + 储蓄率 */}
          <div className="mt-8 rounded-2xl border border-line bg-panel p-6">
            <p className="text-xs text-muted">够用线（目标本金）</p>
            <p className="mt-1 font-mono text-4xl font-semibold tabular-nums text-ink">
              {fmtMoney(view.enoughLine, view.currency)}
              <span className="ml-2 align-middle text-sm font-normal text-muted">{view.currency}</span>
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted">理想生活年成本</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-ink">{fmtMoney(view.annualCostLocal, view.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">当前储蓄率</dt>
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
                <h2 className="text-base font-semibold text-ink">可达 · 约 {view.projection.years} 年</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  按当前储蓄速度，约 <span className="font-mono tabular-nums text-ink">{view.projection.years}</span> 年摸到够用线；
                  当前储蓄率 <span className="font-mono tabular-nums text-ink">{pct(view.projection.savingsRate)}</span>。
                </p>
              </>
            )}
            {view.projection.status === 'unreachable' && (
              <>
                <h2 className="text-base font-semibold text-ink">60 年内无法达到</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  按当前储蓄速度 <span className="font-mono tabular-nums text-ink">60</span> 年内无法达到够用线；
                  当前储蓄率 <span className="font-mono tabular-nums text-ink">{pct(view.projection.savingsRate)}</span>。
                </p>
              </>
            )}
            {view.projection.status === 'no-net-savings' && (
              <>
                <h2 className="text-base font-semibold text-ink">当前没有净储蓄</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  月支出不低于月收入，当前没有净储蓄——先去调整财务录入，或把理想生活设计得更贴近现状。
                </p>
              </>
            )}
          </div>

          {/* gap 区 */}
          <div className="mt-4 rounded-2xl border border-line bg-panel p-6">
            <h2 className="text-base font-medium text-ink">差距</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {view.gapResult.annualGap > 0 ? (
                <>
                  若想 30 年内达标，每年还需多存{' '}
                  <span className="font-mono tabular-nums text-ink">{fmtMoney(view.gapResult.annualGap, view.currency)}</span>。
                </>
              ) : (
                '按当前储蓄速度，30 年内可以达标。'
              )}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              当前速度所需年限：
              <span className="font-mono tabular-nums text-ink">
                {view.projection.status === 'no-net-savings'
                  ? '—（没有净储蓄）'
                  : view.gapResult.yearsAtCurrentPace >= 60
                    ? '60 年以上'
                    : `约 ${view.gapResult.yearsAtCurrentPace} 年`}
              </span>
            </p>
          </div>

          {/* 阶梯目标 */}
          <div className="mt-8">
            <h2 className="text-base font-medium text-ink">阶梯目标</h2>
            <p className="mt-1 text-xs text-muted">示例路径，非承诺；数值由你的财务现状算出。</p>
            <div className="mt-3 space-y-3">
              {view.milestones.map((m) => (
                <div key={m.stage} className="rounded-2xl border border-line bg-panel p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-ink">阶段 {m.stage}</p>
                    <p className="font-mono text-sm tabular-nums text-ink">
                      {fmtMoney(m.goalValue, view.currency)}
                      <span className="ml-1 text-xs text-muted">/ 约 {m.years} 年</span>
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{m.action}</p>
                </div>
              ))}
            </div>
          </div>

          <nav className="mt-8 grid gap-3 sm:grid-cols-2">
            <a
              href="/app/finance"
              className="flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-3 text-sm text-ink hover:border-line-strong"
            >
              ← 上一步：财务录入
            </a>
            <a
              href="/app/designer"
              className="flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-3 text-sm text-ink hover:border-line-strong"
            >
              重新设计理想生活
            </a>
          </nav>
        </>
      )}
    </section>
  );
}
