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
import { formatRunway, runwayMonths } from '../lib/sim-content';
import { readSimState } from '../lib/sim-draft';

type Props = {
  /** 当前这套生活的年成本（加购游艇后随之变贵）。 */
  annualCost: number;
  /**
   * 关 JS 的那条路径（首页按钮降级成 `/app/sim?claim=1`）落到这一页时，
   * 把起始金作为 URL 里的显式参数带上，这一行就能被 SSR 渲染出来——
   * 那一屏是该用户唯一能看到「够撑多久」的机会，因为没有 JS 就写不了本机账本。
   */
  initialCapital?: number | null;
};

function money(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

export default function ClaimRunway({ annualCost, initialCapital = null }: Props) {
  const [capital, setCapital] = useState<number | null>(initialCapital);

  useEffect(() => {
    const sim = readSimState();
    if (sim) setCapital(sim.startingCapital);
  }, []);

  const months = capital === null ? null : runwayMonths(capital, annualCost);

  if (!capital || months === null) return null;

  return (
    <p
      data-claim-runway
      className="mt-3 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm leading-relaxed text-ink"
    >
      你领的 <span className="font-mono font-semibold tabular-nums">{money(capital)}</span>{' '}
      撑这套生活 ≈ <span className="font-mono font-semibold tabular-nums">{formatRunway(months)}</span>
      <span className="mt-1 block text-xs font-normal leading-relaxed text-muted">
        纯除法：{money(capital)} ÷ {money(annualCost)}/年 · 起始金为虚拟，这一笔没有收入进账，
        不算收益率也不算复利。
      </span>
    </p>
  );
}
