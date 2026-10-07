/**
 * 事件埋点（T13 本地队列 · B2 增加可选真实上报）。
 *
 * track(event, props) 始终做两件事（M1 行为不变）：
 *   ① console.debug 打印（开发期可观测）；
 *   ② 追加到 localStorage 事件队列（key `rich-sim:events:v1`），上限 200 条。
 *
 * B2：配置了上报端点后，队列会批量 POST 出去：
 *   - 端点由构建期环境变量 PUBLIC_ANALYTICS_ENDPOINT 指定（Umami / Plausible /
 *     自建 collect 等任意接受 JSON 的收集端；Cloudflare Web Analytics 只自动
 *     采集 PV，不提供通用自定义事件 API，故漏斗事件走本端点）；
 *   - 用 navigator.sendBeacon（页面隐藏/卸载也能发出），载荷 { events: [...] }；
 *     必须传单字符串（浏览器以 text/plain;charset=UTF-8 发送）：sendBeacon 固定走
 *     no-cors，application/json 不是其允许的安全 Content-Type，会在发出前被浏览器
 *     直接拦截（net::ERR_FAILED），而 sendBeacon 仍同步返回 true、队列照常裁剪——
 *     事件会静默丢失。collect 端 request.json() 不校验 Content-Type，text/plain
 *     载荷照常解析；
 *   - 发送成功才裁剪队列；失败（无端点 / beacon 返回 false / 存储异常）一律
 *     保留在本机，静默不抛错，绝不影响主流程；
 *   - 未配置端点时完全等同 M1（只存本机）。
 * 四个调用点（designer:select / finance:update / results:view / currency:switch）
 * 无需改动。
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
  beacon: ((url: string, body: string) => boolean) | null;
};

export function defaultDeps(): AnalyticsDeps {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const endpoint = env?.PUBLIC_ANALYTICS_ENDPOINT?.trim() || null;
  const storage =
    typeof window !== 'undefined' && typeof localStorage !== 'undefined'
      ? localStorage
      : null;
  const beacon =
    typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
      ? (url: string, body: string) => {
          try {
            return navigator.sendBeacon(url, body);
          } catch {
            return false;
          }
        }
      : null;
  return { endpoint, storage, beacon };
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
 * 把队列前 FLUSH_BATCH 条发到上报端点；成功才从本机队列移除。
 * 返回 'sent'（已发并裁剪）/ 'retained'（发送失败，保留）/ 'disabled'（未配置）。
 * 依赖可注入，便于单测。
 */
export function flushQueue(depsInput?: Partial<AnalyticsDeps>):
  | 'sent'
  | 'retained'
  | 'disabled' {
  const deps: AnalyticsDeps = { ...defaultDeps(), ...depsInput };
  const { endpoint, storage, beacon } = deps;
  if (!endpoint || !storage || !beacon) return 'disabled';

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
    ok = beacon(endpoint, JSON.stringify({ events: batch }));
  } catch {
    ok = false;
  }
  if (!ok) return 'retained';

  try {
    const remaining = queue.slice(batch.length);
    storage.setItem(EVENTS_KEY, JSON.stringify(remaining));
  } catch {
    // 裁剪失败不影响已发出的事实；下次可能重发一批（最多一次）。
  }
  return 'sent';
}

/**
 * 浏览器端一次性注册：页面隐藏 / 卸载前尽力把队列发出去。
 * 多次导入安全（模块级 guard）。SSR 下不注册。
 */
let registered = false;
export function registerFlushTriggers(): void {
  if (registered || typeof window === 'undefined') return;
  registered = true;
  const flush = () => flushQueue();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

if (typeof window !== 'undefined') {
  registerFlushTriggers();
}
