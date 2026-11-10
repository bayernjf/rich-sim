/**
 * M5 S2 · 两本账的上行防抖调度器（P1 修复抽层，便于单测）。
 *
 * 关键不变量：plan 与 sim 各持各的 timer——同一本账 2s 内连写只推最后一次
 * （防抖本义），但一本账的排期绝不能取消另一本账的排期。此前 SyncBridge
 * 用单个共享 timer，2s 内两账先后写入时先排期的上行被静默取消，当次会话
 * 再无补偿（P1：跨设备看到旧数据）。
 *
 * 评审 2026-11-02 P2 追加：push 回调返回 false 表示上行失败，调度器按指数
 * 退避重试（默认 2s/4s/8s 共 3 次）——弱网下单次失败不再意味着当次会话
 * 静默停止同步。同一本账的新写入会挤掉未决重试（新数据随防抖上行即可）。
 * 回调返回 void/undefined 视为成功，保持旧调用方行为不变。
 */
import type { LedgerKind } from './sync';

const LEDGER_KINDS: readonly LedgerKind[] = ['plan', 'sim'];

export interface LedgerPushScheduler {
  schedule(kind: LedgerKind): void;
  cancelAll(): void;
}

export interface LedgerPushSchedulerOptions {
  /** 上行失败后的最大重试次数（默认 3；0 = 不重试，退回旧行为）。 */
  maxRetries?: number;
  /** 重试基础间隔 ms，指数退避：base * 2^已重试次数（默认 2000 → 2s/4s/8s）。 */
  retryBaseDelayMs?: number;
}

export function createLedgerPushScheduler(
  delayMs: number,
  push: (kind: LedgerKind) => void | Promise<void | boolean>,
  options: LedgerPushSchedulerOptions = {},
): LedgerPushScheduler {
  const maxRetries = options.maxRetries ?? 3;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 2000;

  const timers: Record<LedgerKind, ReturnType<typeof setTimeout> | null> = {
    plan: null,
    sim: null,
  };
  const retryTimers: Record<LedgerKind, ReturnType<typeof setTimeout> | null> = {
    plan: null,
    sim: null,
  };
  const retriesUsed: Record<LedgerKind, number> = { plan: 0, sim: 0 };

  const fire = async (kind: LedgerKind): Promise<void> => {
    const ok = await push(kind);
    if (ok === false && retriesUsed[kind] < maxRetries) {
      const delay = retryBaseDelayMs * 2 ** retriesUsed[kind];
      retriesUsed[kind] += 1;
      retryTimers[kind] = setTimeout(() => {
        retryTimers[kind] = null;
        void fire(kind);
      }, delay);
    }
  };

  return {
    schedule(kind) {
      // 新写入携带最新本地状态：挤掉未决的重试排期，重新走防抖。
      const pendingRetry = retryTimers[kind];
      if (pendingRetry) clearTimeout(pendingRetry);
      retryTimers[kind] = null;
      retriesUsed[kind] = 0;

      const existing = timers[kind];
      if (existing) clearTimeout(existing);
      timers[kind] = setTimeout(() => {
        timers[kind] = null;
        void fire(kind);
      }, delayMs);
    },
    cancelAll() {
      for (const kind of LEDGER_KINDS) {
        const timer = timers[kind];
        if (timer) clearTimeout(timer);
        timers[kind] = null;
        const retry = retryTimers[kind];
        if (retry) clearTimeout(retry);
        retryTimers[kind] = null;
        retriesUsed[kind] = 0;
      }
    },
  };
}
