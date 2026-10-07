/**
 * 事件埋点（T13 本地队列 · B2 增加可选真实上报）。
 *
 * track(event, props) 始终做两件事（M1 行为不变）：
 *   ① console.debug 打印（开发期可观测）；
 *   ② 追加到 localStorage 事件队列（key `rich-sim:events:v1`），上限 200 条。
 *
 * B2：配置了上报端点后，队列会批量发出去：
 *   - 端点由构建期环境变量 PUBLIC_ANALYTICS_ENDPOINT 指定（Umami / Plausible /
 *     自建 collect 等任意接受 JSON 的收集端；Cloudflare Web Analytics 只自动
 *     采集 PV，不提供通用自定义事件 API，故漏斗事件走本端点）；
 *   - 传输用 `fetch(..., { keepalive: true })`：**收到 2xx 才裁剪本机队列**。
 *     原先用 navigator.sendBeacon，而 beacon 返回 true 只代表「已入队」不代表
 *     「已送达」，客户端却据此裁剪——2026-10-07 实测一次冒烟里约 15 条事件只有
 *     1 条真到达收集端（快速翻页时 beacon 被丢），也就是静默丢事件。keepalive
 *     的请求能活过卸载；确认回不来时队列保留，下次访问重发，所以**可能出重复行**
 *     ——按 `{event, at}` 去重即可（`at` 是事件自己的时间戳，重复行该值相同）；
 *   - Content-Type 用 text/plain：既是简单请求（不触发 preflight），也让 no-cors
 *     时代那个坑不再存在（application/json 曾被浏览器在发出前直接拦掉，见
 *     DEPLOYMENT.md 的 sendBeacon 事故）；collect 端 request.json() 不校验类型；
 *   - 任何失败（无端点 / 非 2xx / 存储异常）一律保留在本机，静默不抛错，
 *     绝不影响主流程；
 *   - 未配置端点时完全等同 M1（只存本机）。
 * 调用点（designer:select / finance:update / results:view / currency:switch /
 * converter:view / claim:* / sim:* / cart:to-goal）无需改动。
 *
 * 冒烟合成流量的自标记：收集端只存 `{ts, day, event}`、不存任何标识符，所以
 * 「我们自己的验证跑」和「真实访客」在库里长得一模一样。真实流量为零的现在，
 * 往生产跑一次冒烟就会把「有没有人来过」这个唯一信号污染掉。因此 URL 带
 * `?smoke=1` 时事件名一律加 `smoke:` 前缀，合成流量可以在查询侧整段滤掉。
 * 本地 dev 跑不受影响——没配端点，事件本来就发不出去。
 */

export const EVENTS_KEY = 'rich-sim:events:v1';
/** 冒烟运行的事件名前缀；worker 闸门 `/^[a-z][a-z0-9:_-]{0,63}$/` 天然放行。 */
export const SMOKE_PREFIX = 'smoke:';
/** 一次冒烟要跳好几个 URL，标记落在 sessionStorage（同标签页 sticky）。 */
export const SMOKE_FLAG_KEY = 'rich-sim:smoke';
const MAX_EVENTS = 200;
const FLUSH_BATCH = 50;
const FLUSH_DELAY_MS = 3000;

export type AnalyticsProps = Record<string, string | number | boolean | undefined>;

type QueuedEvent = {
  event: string;
  props?: AnalyticsProps;
  at: string;
};

/** 可注入依赖（默认取浏览器全局；测试传入内存实现）。 */
type AnalyticsDeps = {
  endpoint: string | null;
  storage: Storage | null;
  /** 发一批并等结果：resolve(true) = 收到 2xx，才允许裁剪本机队列。 */
  send: ((url: string, body: string) => Promise<boolean>) | null;
};

export function defaultDeps(): AnalyticsDeps {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const endpoint = env?.PUBLIC_ANALYTICS_ENDPOINT?.trim() || null;
  const storage =
    typeof window !== 'undefined' && typeof localStorage !== 'undefined'
      ? localStorage
      : null;
  const send =
    typeof fetch === 'function'
      ? (url: string, body: string) =>
          fetch(url, {
            method: 'POST',
            // 让请求活过页面卸载：卸载时的丢事件正是旧 beacon 方案的问题所在。
            keepalive: true,
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body,
          }).then((res) => res.ok)
      : null;
  return { endpoint, storage, send };
}

/** 只认 `smoke=1` 这一个值，避免手滑把真实访客流量也打上标。 */
export function isSmokeParam(search: string): boolean {
  return new URLSearchParams(search).get('smoke') === '1';
}

/**
 * 这一趟浏览器会话是不是冒烟运行。URL 带参 -> 记进 sessionStorage 并返回 true；
 * URL 没带但此前带过 -> 仍是 true（一次冒烟要跳好几个 URL，不能只认第一个）。
 * 存储不可用（隐私模式 / 配额）时按 false 走：宁可少打标，也不在这里抛错。
 */
export function detectSmokeRun(
  search: string,
  session: Pick<Storage, 'getItem' | 'setItem'> | null,
): boolean {
  try {
    if (isSmokeParam(search)) {
      session?.setItem(SMOKE_FLAG_KEY, '1');
      return true;
    }
    return session?.getItem(SMOKE_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/** 事件名解析：冒烟运行一律加 `smoke:` 前缀。 */
export function resolveEventName(event: string, smoke: boolean): string {
  return smoke ? `${SMOKE_PREFIX}${event}` : event;
}

let smokeRun = false;
if (typeof window !== 'undefined') {
  smokeRun = detectSmokeRun(
    window.location.search,
    typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  );
}

/**
 * 记录一个埋点事件。SSR 安全（无 window/localStorage 时静默跳过）；
 * 任何写入失败（隐私模式 / 配额满）都静默吞掉，绝不影响主流程。
 */
export function track(event: string, props?: AnalyticsProps): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const name = resolveEventName(event, smokeRun);
    console.debug('[analytics]', name, props ?? {});
    const raw = localStorage.getItem(EVENTS_KEY);
    const queue: QueuedEvent[] = raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
    queue.push({ event: name, props, at: new Date().toISOString() });
    while (queue.length > MAX_EVENTS) queue.shift();
    localStorage.setItem(EVENTS_KEY, JSON.stringify(queue));
    scheduleFlush();
  } catch {
    // 存储不可用：静默，不抛错。
  }
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** 延迟合并上报，避免每次交互都发请求。 */
function scheduleFlush(): void {
  if (typeof window === 'undefined') return;
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, FLUSH_DELAY_MS);
}

/**
 * 把队列前 FLUSH_BATCH 条发到上报端点；**只有收到 2xx 才从本机队列移除**。
 * 返回 'sent'（已送达并裁剪）/ 'retained'（未确认，保留，下次重发）/ 'disabled'（未配置）。
 * 依赖可注入，便于单测。
 *
 * 至少一次语义：确认没回来就不裁，于是下一次翻页可能把同一批再发一遍——**库里
 * 会有重复行**。2026-10-07 实测一次冒烟 15 个事件落成 62 行（约 4 倍冗余）。
 * 这是「重复」与「静默丢」之间的取舍，选前者：重复行按 `{event, at}` 可完全去重
 * （`at` 是事件自身的时间戳），而丢掉的数据再也补不回来。曾试过加同页 in-flight
 * 闸门压重复，实测把投递从 62 行压到 5 行（keepalive 未确认时闸门一直不落），
 * 反而造成大面积丢失，已撤回。
 */
export async function flushQueue(depsInput?: Partial<AnalyticsDeps>): Promise<
  'sent' | 'retained' | 'disabled'
> {
  const deps: AnalyticsDeps = { ...defaultDeps(), ...depsInput };
  const { endpoint, storage, send } = deps;
  if (!endpoint || !storage || !send) return 'disabled';

  let queue: QueuedEvent[] = [];
  try {
    const raw = storage.getItem(EVENTS_KEY);
    queue = raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
  } catch {
    return 'retained';
  }
  if (queue.length === 0) return 'disabled';

  const batch = queue.slice(0, FLUSH_BATCH);
  let ok = false;
  try {
    ok = await send(endpoint, JSON.stringify({ events: batch }));
  } catch {
    ok = false;
  }
  if (!ok) return 'retained';

  try {
    const remaining = queue.slice(batch.length);
    storage.setItem(EVENTS_KEY, JSON.stringify(remaining));
  } catch {
    // 裁剪失败不影响已送达的事实；下次可能重发同一批（按 {event, at} 去重）。
  }
  return 'sent';
}

/**
 * 浏览器端一次性注册：页面隐藏 / 卸载前尽力把队列发出去。
 * 卸载路径上的确认回调可能来不及执行，那批就留在本机下次重发——
 * 重复行比静默丢失好，且 {event, at} 可辨。多次导入安全（模块级 guard）。
 */
let registered = false;
export function registerFlushTriggers(): void {
  if (registered || typeof window === 'undefined') return;
  registered = true;
  const flush = () => {
    void flushQueue();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

if (typeof window !== 'undefined') {
  registerFlushTriggers();
}
