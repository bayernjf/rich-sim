/**
 * /collect 的滥用护栏（评审 2026-11-02 P2）纯函数层，与 index.ts 分离便于单测。
 *
 * 两个决定：
 * 1. **客户端时间戳必须钳制在服务器当前时刻 ±SKEW 内。** 否则攻击者用伪造的
 *    远古/未来 `at` 把行撒到不同的 day 桶里，按日计数的上限就被绕过。
 * 2. **日写入硬上限按服务器日期计数。** 超限拒绝整批（429），不静默截断——
 *    截断会让调用方误以为全部送达。
 */

/** 客户端事件时间与服务器时刻允许的最大偏差（24h，容忍时区与离线队列延迟）。 */
export const MAX_AT_SKEW_MS = 24 * 60 * 60 * 1000;

/** 每日写入硬上限（行）。量级远高于真实流量，纯粹挡灌库。 */
export const MAX_EVENTS_PER_DAY = 100_000;

/**
 * 规范化事件时间戳：合法且不超出 ±SKEW 就用客户端给的（保留离线补传语义），
 * 否则回落到服务器当前时刻。返回 ISO 字符串。
 */
export function clampEventAt(at: unknown, nowMs: number): string {
  if (typeof at === 'string') {
    const parsed = Date.parse(at);
    if (!Number.isNaN(parsed) && Math.abs(parsed - nowMs) <= MAX_AT_SKEW_MS) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date(nowMs).toISOString();
}

/** 日上限决策：返回本批可接受的行数；0 表示已打满、应整体拒绝。 */
export function dailyCapAllowance(usedToday: number, batchSize: number): number {
  const remaining = MAX_EVENTS_PER_DAY - usedToday;
  if (remaining <= 0) return 0;
  return Math.min(remaining, batchSize);
}
