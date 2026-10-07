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
  it('default beacon sends a plain string, never a JSON Blob (no-cors would block it)', () => {
    const sent: unknown[] = [];
    vi.stubGlobal('navigator', {
      sendBeacon: (_url: string, body: unknown) => {
        sent.push(body);
        return true;
      },
    });
    try {
      const deps = defaultDeps();
      expect(typeof deps.beacon).toBe('function');
      const ok = deps.beacon?.('https://collect.example.com/events', '{"events":[]}');
      expect(ok).toBe(true);
      expect(sent).toHaveLength(1);
      expect(typeof sent[0]).toBe('string');
      expect(sent[0]).not.toBeInstanceOf(Blob);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns disabled and keeps the queue when no endpoint configured', () => {
    const storage = memoryStorage();
    seed(storage, 3);
    const result = flushQueue({ endpoint: null, storage, beacon: null });
    expect(result).toBe('disabled');
    expect(JSON.parse(storage.getItem(EVENTS_KEY) as string)).toHaveLength(3);
  });

  it('sends a batch and trims the queue when beacon succeeds', () => {
    const storage = memoryStorage();
    seed(storage, 3);
    const beacon = vi.fn<(url: string, body: string) => boolean>(() => true);
    const result = flushQueue({ endpoint: 'https://collect.example.com/events', storage, beacon });
    expect(result).toBe('sent');
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, body] = beacon.mock.calls[0];
    expect(url).toBe('https://collect.example.com/events');
    const payload = JSON.parse(body) as { events: unknown[] };
    expect(payload.events).toHaveLength(3);
    expect(storage.getItem(EVENTS_KEY)).toBe('[]');
  });

  it('retains the queue when beacon returns false', () => {
    const storage = memoryStorage();
    seed(storage, 3);
    const beacon = vi.fn<(url: string, body: string) => boolean>(() => false);
    const result = flushQueue({ endpoint: 'https://collect.example.com/events', storage, beacon });
    expect(result).toBe('retained');
    expect(JSON.parse(storage.getItem(EVENTS_KEY) as string)).toHaveLength(3);
  });

  it('flushes at most FLUSH_BATCH (50) events per call', () => {
    const storage = memoryStorage();
    seed(storage, 60);
    const beacon = vi.fn<(url: string, body: string) => boolean>(() => true);
    const result = flushQueue({ endpoint: 'https://collect.example.com/events', storage, beacon });
    expect(result).toBe('sent');
    const body = beacon.mock.calls[0][1] as string;
    expect(JSON.parse(body).events).toHaveLength(50);
    expect(JSON.parse(storage.getItem(EVENTS_KEY) as string)).toHaveLength(10);
  });

  it('treats a thrown beacon as retained, never throws', () => {
    const storage = memoryStorage();
    seed(storage, 2);
    const beacon = vi.fn<(url: string, body: string) => boolean>(() => {
      throw new Error('network down');
    });
    const result = flushQueue({ endpoint: 'https://collect.example.com/events', storage, beacon });
    expect(result).toBe('retained');
    expect(JSON.parse(storage.getItem(EVENTS_KEY) as string)).toHaveLength(2);
  });

  it('returns disabled for an empty queue', () => {
    const storage = memoryStorage();
    const beacon = vi.fn<(url: string, body: string) => boolean>(() => true);
    const result = flushQueue({ endpoint: 'https://collect.example.com/events', storage, beacon });
    expect(result).toBe('disabled');
    expect(beacon).not.toHaveBeenCalled();
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
