/**
 * M5 S2 · 两本账的上行防抖调度器（P1 修复抽层，便于单测）。
 *
 * 关键不变量：plan 与 sim 各持各的 timer——同一本账 2s 内连写只推最后一次
 * （防抖本义），但一本账的排期绝不能取消另一本账的排期。此前 SyncBridge
 * 用单个共享 timer，2s 内两账先后写入时先排期的上行被静默取消，当次会话
 * 再无补偿（P1：跨设备看到旧数据）。
 */
import type { LedgerKind } from './sync';

const LEDGER_KINDS: readonly LedgerKind[] = ['plan', 'sim'];

export interface LedgerPushScheduler {
  schedule(kind: LedgerKind): void;
  cancelAll(): void;
}

export function createLedgerPushScheduler(
  delayMs: number,
  push: (kind: LedgerKind) => void | Promise<void>,
): LedgerPushScheduler {
  const timers: Record<LedgerKind, ReturnType<typeof setTimeout> | null> = {
    plan: null,
    sim: null,
  };
  return {
    schedule(kind) {
      const existing = timers[kind];
      if (existing) clearTimeout(existing);
      timers[kind] = setTimeout(() => {
        timers[kind] = null;
        void push(kind);
      }, delayMs);
    },
    cancelAll() {
      for (const kind of LEDGER_KINDS) {
        const timer = timers[kind];
        if (timer) clearTimeout(timer);
        timers[kind] = null;
      }
    },
  };
}
