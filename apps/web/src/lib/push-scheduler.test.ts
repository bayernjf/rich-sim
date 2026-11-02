/**
 * P1 回归：两本账在防抖窗口内先后写入时，两本账都必须上行——
 * 修复前共享单 timer，先排期的那本被静默取消。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLedgerPushScheduler } from './push-scheduler';
import type { LedgerKind } from './sync';

describe('createLedgerPushScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('两本账 2s 窗口内各写一次：两本账都上行（P1 场景）', () => {
    const pushed: LedgerKind[] = [];
    const scheduler = createLedgerPushScheduler(2000, (kind) => {
      pushed.push(kind);
    });

    scheduler.schedule('plan');
    vi.advanceTimersByTime(1000);
    scheduler.schedule('sim'); // 修复前：plan 的排期在此被取消，永不触发
    vi.advanceTimersByTime(1000); // t=2000：plan 到点
    expect(pushed).toEqual(['plan']);
    vi.advanceTimersByTime(1000); // t=3000：sim 到点
    expect(pushed).toEqual(['plan', 'sim']);
  });

  it('同一本账窗口内连写：防抖为只推最后一次', () => {
    const pushed: LedgerKind[] = [];
    const scheduler = createLedgerPushScheduler(2000, (kind) => {
      pushed.push(kind);
    });

    scheduler.schedule('plan');
    vi.advanceTimersByTime(1000);
    scheduler.schedule('plan');
    vi.advanceTimersByTime(1999);
    expect(pushed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(pushed).toEqual(['plan']);
  });

  it('cancelAll 取消两本账的排期', () => {
    const pushed: LedgerKind[] = [];
    const scheduler = createLedgerPushScheduler(2000, (kind) => {
      pushed.push(kind);
    });

    scheduler.schedule('plan');
    scheduler.schedule('sim');
    scheduler.cancelAll();
    vi.advanceTimersByTime(5000);
    expect(pushed).toEqual([]);
  });
});
