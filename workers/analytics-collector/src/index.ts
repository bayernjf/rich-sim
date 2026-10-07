/**
 * rich-sim 漏斗事件的收集端。
 *
 * 三个决定值得写下理由，否则下次会有人顺手改掉：
 *
 * 1. **只入库 event 名与时间，props 一律丢弃。** props 里可能带用户自己填的
 *    收入 / 支出 / 存款（`finance:update` 就是这么发的）。今天它们只存在本机，
 *    一旦落到服务端就成了「工具把用户的财务数据传走了」——那是产品红线的
 *    另一种踩法。要细粒度，先定 props 白名单，再逐个放行。
 * 2. **不写 IP / UA / 任何标识符。** 因此没有跨事件的个体链路，也不需要
 *    consent 门槛；代价是只能做频次统计，做不了单用户转化漏斗。想补哪一种
 *    都由发起人拍板，然后才改这里——不悄悄加进来。
 * 3. **来源白名单而非回显 Origin。** 任何站点都能构造 beacon；回显 Origin
 *    等于把写入和查询能力都公开出去，所以对未知来源直接 403。
 *
 * 类型用手写的最小结构，没引 `@cloudflare/workers-types`：这个 worker 只有一个
 * 文件，为了几行类型往仓库里加一套依赖不划算。
 */

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
};

type D1Database = {
  prepare(query: string): D1Statement;
  batch(statements: unknown[]): Promise<unknown[]>;
};

export interface Env {
  DB: D1Database;
  /** 只读接口的口令（`wrangler secret put READ_TOKEN`）。 */
  READ_TOKEN: string;
}

const ALLOWED_ORIGINS = new Set([
  'https://app.rich-sim.bayjf.com',
  'https://rich-sim.pages.dev',
  'http://localhost:4321',
  'http://localhost:4335',
  'http://localhost:4336',
  'http://localhost:4337',
]);

/** 事件名只接受小写开头的 `动词:名词` 形状（如 `claim:tap`），其余丢弃。 */
const EVENT_NAME = /^[a-z][a-z0-9:_-]{0,63}$/;
const MAX_BATCH = 50;

type StoredRow = { ts: string; day: string; event: string };

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  });
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function json(body: unknown, status: number, request: Request): Response {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

async function collect(request: Request, env: Env): Promise<Response> {
  let payload: { events?: unknown };
  try {
    payload = (await request.json()) as { events?: unknown };
  } catch {
    return json({ ok: false, error: 'invalid json' }, 400, request);
  }

  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    return json({ ok: false, error: 'events[] required' }, 400, request);
  }

  const rows: StoredRow[] = [];
  for (const item of payload.events.slice(0, MAX_BATCH)) {
    const record = item as { event?: unknown; at?: unknown };
    if (typeof record.event !== 'string' || !EVENT_NAME.test(record.event)) continue;
    const usable =
      typeof record.at === 'string' && !Number.isNaN(Date.parse(record.at))
        ? record.at
        : new Date().toISOString();
    rows.push({ ts: usable, day: usable.slice(0, 10), event: record.event });
  }
  if (rows.length === 0) return json({ ok: false, error: 'no valid events' }, 400, request);

  const statement = env.DB.prepare('INSERT INTO events (ts, day, event) VALUES (?, ?, ?)');
  await env.DB.batch(rows.map((row) => statement.bind(row.ts, row.day, row.event)));

  return json({ ok: true, stored: rows.length }, 200, request);
}

async function summary(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('Authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!presented || presented !== env.READ_TOKEN) {
    return json({ ok: false, error: 'unauthorized' }, 401, request);
  }

  const since = new URL(request.url).searchParams.get('since') ?? '2026-01-01';
  // 客户端是**至少一次**投递（确认没回来就不裁队列，下次翻页重发），所以库里会有
  // 重复行。`ts` 存的是事件自身的 `at`，重发的那条 ts 相同 -> 按 (event, ts) 去重
  // 就是真实次数。直接 COUNT(*) 会高估数倍（2026-10-07 实测一次冒烟 15 个事件
  // 落成 62 行）。同名同毫秒的两个事件会被并成一条，本表没有标识符，这个精度
  // 对漏斗计数够用。
  const totals = await env.DB.prepare(
    'SELECT event, COUNT(*) AS n FROM (SELECT DISTINCT event, ts FROM events WHERE day >= ?) GROUP BY event ORDER BY n DESC',
  )
    .bind(since)
    .all<{ event: string; n: number }>();
  const daily = await env.DB.prepare(
    'SELECT day, COUNT(*) AS n FROM (SELECT DISTINCT event, ts, day FROM events WHERE day >= ?) GROUP BY day ORDER BY day',
  )
    .bind(since)
    .all<{ day: string; n: number }>();

  return json({ ok: true, since, totals: totals.results, daily: daily.results }, 200, request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response('forbidden', { status: 403 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const { pathname } = new URL(request.url);
    if (pathname === '/collect' && request.method === 'POST') return collect(request, env);
    if (pathname === '/summary' && request.method === 'GET') return summary(request, env);
    return json({ ok: false, error: 'not found' }, 404, request);
  },
};
