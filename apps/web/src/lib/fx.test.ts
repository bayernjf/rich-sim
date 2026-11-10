import { describe, expect, it } from 'vitest';
import { fetchFx, resolveSnapshot, toFxSnapshot } from './fx';
import type { FxFetcher } from './fx';
import { STATIC_FX_SNAPSHOT } from './defaults';

/** 造一个受控上游响应（Frankfurter 形状）。 */
function upstream(
  rates: Record<string, number>,
  base = 'CNY',
  date = '2025-10-09',
): Response {
  return new Response(JSON.stringify({ amount: 1, base, date, rates }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('汇率链路（T3 · 历史日期路径）', () => {
  it('fetchFx 不带 date → 打 latest 端点，快照正常规范化', async () => {
    let url = '';
    const fetchImpl: FxFetcher = async (u) => {
      url = u;
      return upstream({ USD: 7.1, EUR: 0.92, GBP: 0.78, JPY: 156.1, HKD: 7.78 });
    };
    const snap = await fetchFx('CNY', undefined, fetchImpl);
    expect(url).toBe('https://api.frankfurter.dev/v1/latest?from=CNY&symbols=USD,EUR,GBP,JPY,HKD');
    expect(snap.base).toBe('CNY');
    expect(snap.date).toBe('2025-10-09');
    expect(snap.rates.USD).toBeCloseTo(7.1);
    expect(snap.rates.CNY).toBe(1);
  });

  it('fetchFx 带 date → 打历史端点，快照日期即所选日', async () => {
    let url = '';
    const fetchImpl: FxFetcher = async (u) => {
      url = u;
      return upstream({ USD: 6.6, EUR: 0.9, GBP: 0.76, JPY: 148.2, HKD: 7.75 }, 'CNY', '2021-10-08');
    };
    const snap = await fetchFx('CNY', '2021-10-08', fetchImpl);
    expect(url).toBe('https://api.frankfurter.dev/v1/2021-10-08?from=CNY&symbols=USD,EUR,GBP,JPY,HKD');
    expect(snap.date).toBe('2021-10-08');
    expect(snap.rates.USD).toBeCloseTo(6.6);
  });

  it('历史响应缺币种 → toFxSnapshot 抛错（由 resolveSnapshot 降级）', () => {
    const raw = { amount: 1, base: 'CNY', date: '2025-10-09', rates: { USD: 7.1 } };
    expect(() => toFxSnapshot(raw as never, 'CNY')).toThrow();
  });

  it('上游非 2xx → fetchFx 抛错（不静默返回坏数据）', async () => {
    const fetchImpl: FxFetcher = async () => new Response('not found', { status: 404 });
    await expect(fetchFx('CNY', '2026-10-11', fetchImpl)).rejects.toThrow(/HTTP 404/);
  });

  // 评审 2026-11-02 P2 回归：上游 fetch 必须带超时信号，挂起时走静态降级，
  // 不能把 SSR 请求拖到平台超时。
  it('fetchFx 调用 fetch 时附带超时 AbortSignal', async () => {
    let seenSignal: AbortSignal | undefined;
    const fetchImpl: FxFetcher = async (_u, init) => {
      seenSignal = init?.signal;
      return upstream({ USD: 7.1, EUR: 0.92, GBP: 0.78, JPY: 156.1, HKD: 7.78 });
    };
    await fetchFx('CNY', undefined, fetchImpl);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal!.aborted).toBe(false);
  });

  it('上游挂起/中断（AbortError）→ resolveSnapshot 降级静态快照', async () => {
    const hanging: FxFetcher = async (_u, init) => {
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation timed out', 'TimeoutError')),
        );
      });
      throw new Error('unreachable');
    };
    // 注入 50ms 超时：不必真等 4s 生产阈值
    const snap = await resolveSnapshot('CNY', undefined, hanging, 50);
    expect(snap).toBe(STATIC_FX_SNAPSHOT);
  });
});
