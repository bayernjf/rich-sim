/**
 * 假付费信号 · 纯函数层测试。
 *
 * 钉住的是探针的**边界**，而不是按钮本身：事件名合法、props 不带任何金额、
 * 状态不持久化（由组件保证，这里只断言纯函数产出的形状）。
 */
import { describe, expect, it } from 'vitest';
import {
  PAYWALL_TIERS,
  expressIntent,
  intentProps,
  thanksNameKey,
  type PaywallTierId,
} from './paywall-probe';

const EVENT_PATTERN = /^[a-z][a-z0-9:_-]{0,63}$/;

describe('PAYWALL_TIERS', () => {
  it('两档都有 id / 名称键 / 事件名，且事件名过 worker 正则', () => {
    expect(PAYWALL_TIERS).toHaveLength(2);
    for (const tier of PAYWALL_TIERS) {
      expect(tier.id).toMatch(/^[a-z]+$/);
      expect(tier.nameKey).toMatch(/^paywall\.tier\.[a-z]+$/);
      expect(tier.event).toMatch(EVENT_PATTERN);
    }
  });

  it('两档事件互不相同（否则读数无法区分意愿落在哪个功能上）', () => {
    const events = PAYWALL_TIERS.map((t) => t.event);
    expect(new Set(events).size).toBe(events.length);
  });
});

describe('expressIntent', () => {
  it('返回埋点事件 + thanks 状态，且状态记下选中的档位', () => {
    for (const tier of PAYWALL_TIERS) {
      const { event, next } = expressIntent(tier);
      expect(event).toBe(tier.event);
      expect(next).toEqual({ status: 'thanks', tier: tier.id });
    }
  });

  it('不返回 idle 之外可持久化的字段：状态只有 status / tier', () => {
    const { next } = expressIntent(PAYWALL_TIERS[0]!);
    expect(Object.keys(next).sort()).toEqual(['status', 'tier']);
  });
});

describe('intentProps', () => {
  it('只带 tier 一个键（不带价格、不带收入/支出等财务字段）', () => {
    for (const id of ['report', 'counsel'] as PaywallTierId[]) {
      const props = intentProps(id);
      expect(Object.keys(props)).toEqual(['tier']);
      expect(props.tier).toBe(id);
    }
  });
});

describe('thanksNameKey', () => {
  it('按档位取回对应的名称键；未知档位安全回落到 report', () => {
    expect(thanksNameKey('report')).toBe('paywall.tier.report');
    expect(thanksNameKey('counsel')).toBe('paywall.tier.counsel');
    expect(thanksNameKey('no-such' as PaywallTierId)).toBe('paywall.tier.report');
  });
});
