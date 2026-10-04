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
 *   - 发送成功才裁剪队列；失败（无端点 / beacon 返回 false / 存储异常）一律
 *     保留在本机，静默不抛错，绝不影响主流程；
 *   - 未配置端点时完全等同 M1（只存本机）。
 * 四个调用点（designer:select / finance:update / results:view / currency:switch）
 * 无需改动。
 */

export const EVENTS_KEY = 'rich-sim:events:v1';
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

function defaultDeps(): AnalyticsDeps {
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
            return navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
          } catch {
            return false;
          }
        }
      : null;
  return { endpoint, storage, beacon };
}

/**
 * 记录一个埋点事件。SSR 安全（无 window/localStorage 时静默跳过）；
 * 任何写入失败（隐私模式 / 配额满）都静默吞掉，绝不影响主流程。
 */
export function track(event: string, props?: AnalyticsProps): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    console.debug('[analytics]', event, props ?? {});
    const raw = localStorage.getItem(EVENTS_KEY);
    const queue: QueuedEvent[] = raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
    queue.push({ event, props, at: new Date().toISOString() });
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
