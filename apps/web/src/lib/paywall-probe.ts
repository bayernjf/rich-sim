import type { Locale } from './i18n';

/**
 * 假付费信号（M4 S4 的前置探针，不真收款、不接支付）。
 *
 * 目的：PRD §11.2 的「付费意愿」按现有管道读不到——没有收款能力，而真做 S4
 * 又恰恰要等这个读数。这里用一个**不涉及任何交易**的轻量交互破环：用户点
 * 「我愿意解锁」只埋一个事件，据此先判断意愿，再决定要不要投入真付费开发。
 *
 * 边界（写死，别越线）：
 * - **不记金额、不记任何财务数字**——档位只用来区分用户选了哪一档，金额属于
 *   用户财务语境，且 worker 入库时本就丢弃 props，所以这里连价格都不发。
 * - 纯前端、无网络路径（埋点走既有的 analytics 队列，那是另一条独立管道）。
 * - 点击后状态只活在组件里，**不写进 Draft / 不持久化**——它不是用户的真实
 *   承诺，持久化反而误导。
 */

export type PaywallTierId = 'report' | 'counsel';

export type PaywallTier = {
  id: PaywallTierId;
  /** 词典 key：档位名（不含价格）。 */
  nameKey: 'paywall.tier.report' | 'paywall.tier.counsel';
  /** 埋点事件值；与 worker 事件名正则 `/^[a-z][a-z0-9:_-]{0,63}$/` 兼容。 */
  event: 'paywall:intent:report' | 'paywall:intent:counsel';
};

/** 两档占位：都不标价格（避免在商业模式未定前暗示定价）。 */
export const PAYWALL_TIERS: readonly PaywallTier[] = [
  { id: 'report', nameKey: 'paywall.tier.report', event: 'paywall:intent:report' },
  { id: 'counsel', nameKey: 'paywall.tier.counsel', event: 'paywall:intent:counsel' },
] as const;

export type PaywallState =
  | { status: 'idle' }
  | { status: 'thanks'; tier: PaywallTierId };

/**
 * 选中一档：返回埋点要用的事件名与新的本地状态。
 * **纯函数**，不真的发事件——由组件接 analytics.track，便于单测断言。
 */
export function expressIntent(tier: PaywallTier): {
  event: PaywallTier['event'];
  next: PaywallState;
} {
  return { event: tier.event, next: { status: 'thanks', tier: tier.id } };
}

/** 埋点 props：**只带档位 id**，不带价格、不带任何用户财务字段。 */
export function intentProps(tier: PaywallTierId): { tier: PaywallTierId } {
  return { tier };
}

/** 感谢文案随已选档位变化时取对应词典 key。 */
export function thanksNameKey(tier: PaywallTierId): PaywallTier['nameKey'] {
  const found = PAYWALL_TIERS.find((t) => t.id === tier);
  if (!found) return 'paywall.tier.report';
  return found.nameKey;
}

export type { Locale };
