/**
 * T13 · M1 本地事件日志（完成率埋点）。
 *
 * M1 不接真实上报渠道：track(event, props) 只做两件事——
 *   ① console.debug 打印（开发期可观测）；
 *   ② 追加到 localStorage 事件队列（key `rich-sim:events:v1`），上限 ~200 条防膨胀。
 * M2 接入真实上报渠道时，在本模块内增加 flush/上报逻辑即可，四个调用点
 * （designer:select / finance:update / results:view / currency:switch）无需改动。
 */

export const EVENTS_KEY = 'rich-sim:events:v1';
const MAX_EVENTS = 200;

export type AnalyticsProps = Record<string, string | number | boolean | undefined>;

type QueuedEvent = {
  event: string;
  props?: AnalyticsProps;
  at: string;
};

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
  } catch {
    // 存储不可用：静默，不抛错。
  }
}
