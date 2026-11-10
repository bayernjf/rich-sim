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

  // 评审 2026-11-02 P2 回归：上行失败必须指数退避重试，不再静默放弃。
  it('上行返回 false → 按 2s/4s 退避重试直到成功', async () => {
    let attempts = 0;
    const scheduler = createLedgerPushScheduler(2000, async () => {
      attempts += 1;
      return attempts >= 3; // 前两次失败，第三次成功
    });

    scheduler.schedule('plan');
    await vi.advanceTimersByTimeAsync(2000); // 首次推送（t=2s，失败）
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1); // 第 1 次重试（t=4s，失败）
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(4000); // 第 2 次重试（t=8s，成功）
    expect(attempts).toBe(3);
    // 成功后不再重试
    await vi.advanceTimersByTimeAsync(20000);
    expect(attempts).toBe(3);
  });

  it('重试次数耗尽后放弃（本账最多 1+maxRetries 次）', async () => {
    let attempts = 0;
    const scheduler = createLedgerPushScheduler(2000, async () => {
      attempts += 1;
      return false;
    }, { maxRetries: 2, retryBaseDelayMs: 1000 });

    scheduler.schedule('plan');
    await vi.advanceTimersByTimeAsync(2000); // 首次（失败）
    await vi.advanceTimersByTimeAsync(1000); // 重试 1（失败）
    await vi.advanceTimersByTimeAsync(2000); // 重试 2（失败，耗尽）
    expect(attempts).toBe(3);
    await vi.advanceTimersByTimeAsync(30000);
    expect(attempts).toBe(3);
  });

  it('重试未决时同账新写入：挤掉重试，只推最新一次', async () => {
    let attempts = 0;
    const scheduler = createLedgerPushScheduler(2000, async () => {
      attempts += 1;
      return attempts > 1; // 首次失败，其后成功
    }, { retryBaseDelayMs: 1000 });

    scheduler.schedule('plan');
    await vi.advanceTimersByTimeAsync(2000); // 首次（失败，重试排在 t=3s）
    expect(attempts).toBe(1);
    scheduler.schedule('plan'); // t=2s 新写入：挤掉 t=3s 的重试
    await vi.advanceTimersByTimeAsync(2000); // 新防抖到点（t=4s）
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(10000);
    expect(attempts).toBe(2);
  });
});
