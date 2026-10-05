/**
 * S4 · 首页「领一百万」两拍（`homepage-claim-experience.md` §4）。
 *
 * 两条纪律决定这个组件的结构：
 *
 * - **首帧必须可用**：SSR 出来的永远是 `<a href="/app/sim?claim=1">`——关掉 JS
 *   点它就是去 SIM 页，不是一块死按钮（验收 #6）。JS 只把这条链接升级成原地
 *   两拍；cmd / ctrl / shift 点击仍走浏览器原行为（新标签页）。
 * - **金额不在这里算**：起始金、按提取率算出的年产出、三行真实账单都由
 *   `index.astro` 从 `sim-content` + catalog 传进来，组件里没有一个数字字面量
 *   （与 S1/S2 同一条内容纪律）。
 *
 * 两拍间隔就是 0.3s / 1.8s 两个时间常数；`prefers-reduced-motion` 下跳过第一拍
 * 直接给账单态（PRD §9 WCAG AA），此时不上报 `claim:reveal`——那一拍没有被
 * 渲染过，报了就是把漏斗最想看的那一步记成假的。
 */
import { useEffect, useRef, useState } from 'react';
import { track } from '../lib/analytics';
import { claimSim, readSimState } from '../lib/sim-draft';
import type { ClaimBillRow } from '../lib/sim-content';

type Props = {
  /** 虚拟起始金（USD）。 */
  capital: number;
  /** capital × withdrawalRate：这笔本金一年能产出多少。 */
  drawdown: number;
  /** 假设的提取率（0.04），仅用于把它作为假设显式写出来。 */
  withdrawalRate: number;
  /** 三行真实账单（含 catalog 来源链接）。 */
  rows: ClaimBillRow[];
};

/** §4 时间常数：T+0.3s 到账，T+1.8s 翻转——第二拍在 2 秒内出现是可验收的。 */
const GRANT_MS = 300;
const BILL_MS = 1800;

const VIRTUAL_NOTE = '虚拟模拟起始金 · 不是你的真实资产';

function money(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

export default function ClaimMillion({ capital, drawdown, withdrawalRate, rows }: Props) {
  const [phase, setPhase] = useState<'idle' | 'granted' | 'bill'>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // 已经领过的人回访：直接给账单态，但不重放两拍、也不重复计数。
  // 必须放在 effect 里：SSR 没有 localStorage，放进 useState 初值会 hydration mismatch。
  useEffect(() => {
    if (readSimState()) setPhase('bill');
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const handleClaim = (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    claimSim(capital);
    track('claim:tap', { capital, reduced: reduce });

    if (reduce) {
      setPhase('bill');
      track('claim:bill', { reduced: true });
      return;
    }

    timers.current.push(
      setTimeout(() => {
        setPhase('granted');
        track('claim:reveal', { capital });
      }, GRANT_MS),
      setTimeout(() => {
        setPhase('bill');
        track('claim:bill', { reduced: false });
      }, BILL_MS),
    );
  };

  return (
    <section
      aria-labelledby="claim-heading"
      className="mt-10 rounded-2xl border border-line bg-panel px-4 py-5"
    >
      <p className="text-xs font-medium uppercase tracking-widest text-accent">富豪模拟</p>
      <h2 id="claim-heading" className="mt-2 text-xl font-semibold tracking-tight">
        先领一百万
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{VIRTUAL_NOTE}</p>

      <div aria-live="polite">
        {phase === 'idle' && (
          <a
            data-claim-cta
            href="/app/sim?claim=1"
            onClick={handleClaim}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-on-accent"
          >
            先领 {money(capital)} →
          </a>
        )}

        {phase !== 'idle' && (
          <>
            <p className="mt-4 font-mono text-3xl font-semibold tabular-nums tracking-tight text-accent">
              {money(capital)}
            </p>
            <p className="mt-1 text-sm font-medium text-ink">虚拟起始金已到账</p>
          </>
        )}

        {phase === 'bill' && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm leading-relaxed text-ink">
              按 {Math.round(withdrawalRate * 100)}% 的提取率，它一年只能给你{' '}
              <span className="font-mono font-semibold tabular-nums">{money(drawdown)}</span>
              ——它不够，这才是重点：
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              提取率是可修改的假设，不是收益承诺。
            </p>

            <ul className="mt-3 space-y-2">
              {rows.map((row) => (
                <li key={row.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-xs leading-relaxed text-muted">{row.label}</span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-ink">
                    {money(row.annualCost)}/年
                    {row.source && (
                      <a
                        className="ml-2 text-xs text-accent underline-offset-2 hover:underline"
                        href={row.source}
                        rel="noopener"
                      >
                        来源
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                data-claim-route="life"
                href="/app/sim"
                onClick={() => track('route:life', { from: 'claim' })}
                className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-on-accent"
              >
                用它撑这种生活 →
              </a>
              <a
                data-claim-route="real"
                href="/app/finance"
                onClick={() => track('route:real', { from: 'claim' })}
                className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-ink"
              >
                换成我的真实生活 →
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
