/**
 * Bill-day burden-rate tests. Expectations computed INDEPENDENTLY first
 * (hand division of the documented card-A figures), not trusted from the
 * implementation output.
 */
import { describe, expect, it } from 'vitest';
import {
  BILLS_PER_PAGE,
  BURDEN_RATE_GREEN,
  BURDEN_RATE_HARD,
  RESALE_RECOVERY_RATE,
  burdenStatus,
  resaleRecovery,
} from './functions';

const COST_CARD_A = 1_317_000; // six catalog options (see apps/web sim-content)
const CF_CARD_A = 1_683_000; // income $3,000,000 minus last year's $1,317,000
const COST_WITH_YACHT = 6_717_000;

describe('burdenStatus（simulation-gameplay §2.5）', () => {
  it('卡 A 基态：r ≈ 0.7825 → 黄（紧张）', () => {
    const { rate, status } = burdenStatus(COST_CARD_A, CF_CARD_A);
    expect(status).toBe('yellow');
    expect(rate).toBeCloseTo(0.7825312, 4);
  });

  it('断裂开关：加游艇后 r ≈ 3.9911 → 红', () => {
    const { rate, status } = burdenStatus(COST_WITH_YACHT, CF_CARD_A);
    expect(status).toBe('red');
    expect(rate).toBeCloseTo(3.9910873, 4);
  });

  it('边界：r = 0.6 恰好在绿（含），0.6 之上是黄', () => {
    expect(burdenStatus(BURDEN_RATE_GREEN * CF_CARD_A, CF_CARD_A).status).toBe('green');
    expect(burdenStatus(BURDEN_RATE_GREEN * CF_CARD_A + 1, CF_CARD_A).status).toBe('yellow');
  });

  it('边界：r = 1.0 仍是黄（含），1.0 之上是红', () => {
    expect(burdenStatus(BURDEN_RATE_HARD * CF_CARD_A, CF_CARD_A).status).toBe('yellow');
    expect(burdenStatus(BURDEN_RATE_HARD * CF_CARD_A + 1, CF_CARD_A).status).toBe('red');
  });

  it('CF ≤ 0 是红且不给 rate（不产 NaN/Infinity，符合一等状态纪律）', () => {
    expect(burdenStatus(COST_CARD_A, 0)).toEqual({ rate: null, status: 'red' });
    expect(burdenStatus(COST_CARD_A, -1)).toEqual({ rate: null, status: 'red' });
  });
});

describe('账单日玩法常量（simulation-gameplay §2.4 参数 2 / 4）', () => {
  it('参数 2：一次翻 4 张（建议区间 3–5 的中值）', () => {
    expect(BILLS_PER_PAGE).toBe(4);
  });

  it('参数 4：强制变卖回收率 75%（70–80% 区间中值）', () => {
    expect(RESALE_RECOVERY_RATE).toBe(0.75);
  });

  it('resaleRecovery：5,400,000 的游艇强制变卖回笼 4,050,000（手算）', () => {
    expect(resaleRecovery(5_400_000)).toBe(4_050_000);
  });

  it('resaleRecovery：自定义回收率生效', () => {
    expect(resaleRecovery(100, 0.5)).toBe(50);
  });

  it('resaleRecovery：非法输入一律收敛为 0，不产 NaN', () => {
    expect(resaleRecovery(NaN)).toBe(0);
    expect(resaleRecovery(-100)).toBe(0);
    expect(resaleRecovery(100, 0)).toBe(0);
    expect(resaleRecovery(100, 1.5)).toBe(0);
  });
});
