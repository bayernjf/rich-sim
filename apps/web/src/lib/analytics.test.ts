/**
 * B2 · 埋点上报测试（node 环境；storage / beacon 全部注入内存实现，
 * 不依赖真实浏览器）。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  SMOKE_FLAG_KEY,
  defaultDeps,
  detectSmokeRun,
  EVENTS_KEY,
  flushQueue,
  isSmokeParam,
  resolveEventName,
  track,
} from './analytics';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

function seed(storage: Storage, n: number) {
  const events = Array.from({ length: n }, (_, i) => ({
    event: `e${i}`,
    props: { i },
    at: new Date(0).toISOString(),
  }));
  storage.setItem(EVENTS_KEY, JSON.stringify(events));
  return events;
}

describe('flushQueue', () => {
  it('默认传输是 fetch keepalive + text/plain 字符串，不用 Blob', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    try {
      const deps = defaultDeps();
      expect(typeof deps.send).toBe('function');
      const ok = await deps.send?.('https://collect.example.com/events', '{"events":[]}');
      expect(ok).toBe(true);
      expect(calls).toHaveLength(1);
      const init = calls[0].init!;
      // keepalive 让卸载时的请求也能发出去；text/plain 是简单请求，不触发 preflight。
      expect(init.keepalive).toBe(true);
      expect(init.method).toBe('POST');
      expect(typeof init.body).toBe('string');
      expect(init.body).not.toBeInstanceOf(Blob);
      expect((init.headers as Record<string, string>)['Content-Type']).toBe(
        'text/plain;charset=UTF-8',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('非 2xx 不算送达（这条防的就是静默丢事件）', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 403 })));
    try {
      const deps = defaultDeps();
      expect(await deps.send?.('https://collect.example.com/events', '{}')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns disabled and keeps the queue when no endpoint configured', async () => {
    const storage = memoryStorage();
    seed(storage, 3);
    const result = await flushQueue({ endpoint: null, storage, send: null });
    expect(result).toBe('disabled');
    expect(JSON.parse(storage.getItem(EVENTS_KEY) as string)).toHaveLength(3);
  });

  it('sends a batch and trims the queue only after a confirmed delivery', async () => {
    const storage = memoryStorage();
    seed(storage, 3);
    const send = vi.fn<(url: string, body: string) => Promise<boolean>>(async () => true);
    const result = await flushQueue({
      endpoint: 'https://collect.example.com/events',
      storage,
      send,
    });
    expect(result).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    const [url, body] = send.mock.calls[0];
    expect(url).toBe('https://collect.example.com/events');
    const payload = JSON.parse(body) as { events: unknown[] };
    expect(payload.events).toHaveLength(3);
    expect(storage.getItem(EVENTS_KEY)).toBe('[]');
  });

  it('retains the queue when the send is not confirmed', async () => {
    const storage = memoryStorage();
    seed(storage, 3);
    const result = await flushQueue({
      endpoint: 'https://collect.example.com/events',
      storage,
      send: async () => false,
    });
    expect(result).toBe('retained');
    expect(JSON.parse(storage.getItem(EVENTS_KEY) as string)).toHaveLength(3);
  });

  it('retains the queue when the send rejects (network down)', async () => {
    const storage = memoryStorage();
    seed(storage, 2);
    const result = await flushQueue({
      endpoint: 'https://collect.example.com/events',
      storage,
      send: () => Promise.reject(new Error('network down')),
    });
    expect(result).toBe('retained');
    expect(JSON.parse(storage.getItem(EVENTS_KEY) as string)).toHaveLength(2);
  });

  it('flushes at most FLUSH_BATCH (50) events per call', async () => {
    const storage = memoryStorage();
    seed(storage, 60);
    const bodies: string[] = [];
    const send = vi.fn<(url: string, body: string) => Promise<boolean>>(async (_url, body) => {
      bodies.push(body);
      return true;
    });
    const result = await flushQueue({
      endpoint: 'https://collect.example.com/events',
      storage,
      send,
    });
    expect(result).toBe('sent');
    expect(JSON.parse(bodies[0]).events).toHaveLength(50);
    expect(JSON.parse(storage.getItem(EVENTS_KEY) as string)).toHaveLength(10);
  });

  it('returns disabled for an empty queue', async () => {
    const storage = memoryStorage();
    let called = 0;
    const result = await flushQueue({
      endpoint: 'https://collect.example.com/events',
      storage,
      send: async () => {
        called += 1;
        return true;
      },
    });
    expect(result).toBe('disabled');
    expect(called).toBe(0);
  });
});

describe('track (SSR safety)', () => {
  it('does not throw when window/localStorage are unavailable', () => {
    expect(() => track('results:view', { status: 'reachable' })).not.toThrow();
  });
});

describe('冒烟合成流量自标记', () => {
  it('只认 smoke=1 这一个值', () => {
    expect(isSmokeParam('?smoke=1')).toBe(true);
    expect(isSmokeParam('?yacht=1&smoke=1')).toBe(true);
    expect(isSmokeParam('?smoke=0')).toBe(false);
    expect(isSmokeParam('?smoke')).toBe(false);
    expect(isSmokeParam('')).toBe(false);
  });

  it('带参时打标并记进 session；后续 URL 不带参也延续（一次冒烟跳好几个页）', () => {
    const session = memoryStorage();
    expect(detectSmokeRun('?smoke=1', session)).toBe(true);
    expect(session.getItem(SMOKE_FLAG_KEY)).toBe('1');
    expect(detectSmokeRun('', session)).toBe(true);
    expect(detectSmokeRun('', memoryStorage())).toBe(false);
  });

  it('session 不可用（隐私模式）不抛错；没有 session 时单次带参仍然算', () => {
    const throwing: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(detectSmokeRun('?smoke=1', throwing)).toBe(false);
    expect(detectSmokeRun('?smoke=1', null)).toBe(true);
  });

  it('加前缀后的事件名仍然过 worker 的入库闸门', () => {
    // 与 workers/analytics-collector/src/index.ts:46 同一个式子。这条测试防的是
    // 「加了前缀结果被收集端静默 continue 掉」——丢弃发生在服务端，客户端看不出来。
    const EVENT_NAME = /^[a-z][a-z0-9:_-]{0,63}$/;
    expect(resolveEventName('sim:add', true)).toBe('smoke:sim:add');
    expect(EVENT_NAME.test(resolveEventName('sim:add', true))).toBe(true);
    expect(EVENT_NAME.test(resolveEventName('cart:to-goal', true))).toBe(true);
    expect(resolveEventName('results:view', false)).toBe('results:view');
  });
});
