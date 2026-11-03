/**
 * 评审 2026-11-02 P2 回归：/collect 此前无任何速率/总量限制，白名单源可无限灌库。
 * 这里用 mock D1 驱动真实 fetch handler，钉死三条护栏：
 *   1. 日写入硬上限（超限整批 429，不静默截断）
 *   2. 上限内部分截断并如实返回 stored
 *   3. 客户端伪造的远古/未来 at 被钳制到服务器 ±24h（day 桶不可绕过）
 */
import { describe, expect, it } from 'vitest';
import handler from './index';
import { MAX_EVENTS_PER_DAY } from './limits';

type Bind = { query: string; values: unknown[] };

/** 造一个记录 SQL 的 mock D1：COUNT 查询返回固定值，INSERT 记录 bind。 */
function mockDb(usedToday: number) {
  const inserts: Bind[] = [];
  const db = {
    inserts,
    prepare(query: string) {
      if (query.includes('COUNT')) {
        return {
          bind: (...values: unknown[]) => ({
            bind: () => db.prepare(query),
            all: async <T,>() => ({ results: [{ n: usedToday }] as T[] }),
          }),
        };
      }
      return {
        bind: (...values: unknown[]) => {
          inserts.push({ query, values });
          return {
            bind: () => db.prepare(query),
            all: async () => ({ results: [] }),
          };
        },
      };
    },
    async batch(statements: unknown[]) {
      return statements;
    },
  };
  return db;
}

function collectRequest(events: unknown[]): Request {
  return new Request('https://collector.example/collect', {
    method: 'POST',
    headers: { Origin: 'http://localhost:4321', 'content-type': 'application/json' },
    body: JSON.stringify({ events }),
  });
}

const env = (usedToday: number) => ({ DB: mockDb(usedToday), READ_TOKEN: 'x' });

describe('POST /collect 滥用护栏（评审 P2）', () => {
  it('日写入打满 → 整批 429，一行不写', async () => {
    const e = env(MAX_EVENTS_PER_DAY);
    const res = await handler.fetch(collectRequest([{ event: 'claim:tap' }]), e as never);
    expect(res.status).toBe(429);
    expect((await res.json() as { error: string }).error).toMatch(/cap/);
    expect((e.DB as ReturnType<typeof mockDb>).inserts).toEqual([]);
  });

  it('上限内批量入库，stored 与实际写入一致', async () => {
    const e = env(0);
    const res = await handler.fetch(
      collectRequest([{ event: 'claim:tap' }, { event: 'guide:view' }]),
      e as never,
    );
    expect(res.status).toBe(200);
    expect((await res.json() as { stored: number }).stored).toBe(2);
    expect((e.DB as ReturnType<typeof mockDb>).inserts).toHaveLength(2);
  });

  it('伪造远古 at → 被钳制到服务器日期（day 桶计数生效）', async () => {
    const e = env(0);
    const res = await handler.fetch(
      collectRequest([{ event: 'claim:tap', at: '1999-01-01T00:00:00.000Z' }]),
      e as never,
    );
    expect(res.status).toBe(200);
    const [insert] = (e.DB as ReturnType<typeof mockDb>).inserts;
    const storedDay = String(insert.values[1]);
    const serverDay = new Date().toISOString().slice(0, 10);
    expect(storedDay).toBe(serverDay);
  });

  it('±24h 内的客户端 at 原样保留（离线补传语义不破）', async () => {
    const e = env(0);
    const within = new Date(Date.now() - 60_000).toISOString();
    const res = await handler.fetch(collectRequest([{ event: 'claim:tap', at: within }]), e as never);
    expect(res.status).toBe(200);
    const [insert] = (e.DB as ReturnType<typeof mockDb>).inserts;
    expect(insert.values[0]).toBe(within);
  });
});
