/**
 * S4 · 卡 A 页的「你领的一百万够撑多久」（client:load 岛）。
 *
 * 只读本机模拟态（`rich-sim:sim:v1`），不读也不写真实方案账本。
 * SSR 首帧与客户端首帧都返回 null（与 ContinueDraft 同一模式），避免
 * hydration mismatch，也保证这一行永远不会出现在 SSR 源码里。
 *
 * 没领过就整行不出现：这是给领过钱的人看的第二拍，对没领过的人它只是
 * 一笔没来由的钱。
 */
import { useEffect, useState } from 'react';
import Interpolated from './Interpolated';
import { formatRunway, runwayMonths } from '../lib/sim-content';
import { SIM_UPDATED_EVENT, readSimState } from '../lib/sim-draft';
import { format, t } from '../lib/messages';
import type { Locale } from '../lib/i18n';

type Props = {
  /** 当前这套生活的年成本（加购游艇后随之变贵）。 */
  annualCost: number;
  /**
   * 关 JS 的那条路径（首页按钮降级成 `/app/sim?claim=1`）落到这一页时，
   * 把起始金作为 URL 里的显式参数带上，这一行就能被 SSR 渲染出来——
   * 那一屏是该用户唯一能看到「够撑多久」的机会，因为没有 JS 就写不了本机账本。
   */
  initialCapital?: number | null;
  /** 界面语言；卡 A 页尚未迁移，默认中文。 */
  locale?: Locale;
};

function money(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

export default function ClaimRunway({
  annualCost,
  initialCapital = null,
  locale = 'zh',
}: Props) {
  const [capital, setCapital] = useState<number | null>(initialCapital);

  useEffect(() => {
    // 分子 = 起始金 + 二手变卖累计回笼（sim-resale-market §3）。同页的商城
    // 卖出后账本更新，靠 SIM_UPDATED_EVENT 即时重读。
    const refresh = () => {
      const sim = readSimState();
      if (sim) setCapital(sim.startingCapital + (sim.resaleProceeds ?? 0));
    };
    refresh();
    window.addEventListener(SIM_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(SIM_UPDATED_EVENT, refresh);
  }, []);

  const months = capital === null ? null : runwayMonths(capital, annualCost);

  if (!capital || months === null) return null;

  return (
    <p
      data-claim-runway
      className="mt-3 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm leading-relaxed text-ink"
    >
      <Interpolated
        template={t('runway.covers', locale)}
        vars={{ capital: money(capital), runway: formatRunway(months, locale) }}
        className="font-mono font-semibold tabular-nums"
      />
      <span className="mt-1 block text-xs font-normal leading-relaxed text-muted">
        {format(t('runway.math', locale), {
          capital: money(capital),
          cost: money(annualCost),
        })}
      </span>
    </p>
  );
}
