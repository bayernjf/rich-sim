import type { Currency, Profile, Projection } from '@rich-sim/core';
import type { Results } from './results';

/**
 * F6（本机版）· 测算快照与「和上次比」的纯函数层。
 *
 * **为什么记的是算出来的数字，而不是只记输入**：快照要回答的是「上一次这一屏
 * 告诉你什么」。年限与够用线是当时的 profile × 当时的假设（含当时那份汇率快照）
 * 的产物；用今天的引擎重算昨天的 profile，等于替昨天说一套它当时并不成立的数。
 * 所以 `annualCost` / `enoughLine` / `years` 全部落盘。
 *
 * **为什么这不是健身环**：`product-concept.md` §3.2 已经警告过——净资产按月几乎
 * 不动，做成进度条只会看不见、反而劝退。所以这里的主读数不是「你完成了 3.2%」，
 * 而是**两次测算之间的差**：年限动了几个、状态有没有跨档。净值差只在同币种时给，
 * 并且**「和上次一样」本身就是一个读数**，不装作有进展。
 */

export type Snapshot = {
  /** 记录时刻（ISO 8601，带时区）。 */
  at: string;
  /** 当时的展示/录入币种：金额类字段全部按它口径。 */
  currency: Currency;
  /** 当时的三状态之一（一等状态，不是错误码）。 */
  status: Projection['status'];
  /** 只有 reachable 有年限；其余为 null。 */
  years: number | null;
  /** 理想生活年成本（`currency` 口径）。 */
  annualCost: number;
  /** 够用线 = 年成本 ÷ 当时那套假设里的提取率。 */
  enoughLine: number;
  /** 当时的净资产 = 存款 − 负债（`currency` 口径）。 */
  netWorth: number;
};

/** 本机最多留多少条：每条 ~150 字节，30 条 = 一台设备几年每日测算的量。 */
export const MAX_SNAPSHOTS = 30;

/** 把一次成功的测算压成一条快照；`no-profile` 没什么可记，返回 null。 */
export function snapshotOf(results: Results, profile: Profile, at: Date = new Date()): Snapshot | null {
  if (results.status !== 'ok') return null;
  return {
    at: at.toISOString(),
    currency: results.currency,
    status: results.projection.status,
    years: results.projection.status === 'reachable' ? results.projection.years : null,
    annualCost: results.annualCostLocal,
    enoughLine: results.enoughLine,
    // 引擎内部用的就是这个数（project: start = savings - debt），口径跟着走。
    netWorth: profile.savings - profile.debt,
  };
}

/** 本机历日 key（'YYYY-MM-DD'，按本地时区，不用 UTC——UTC 会在午夜附近把同一天劈成两条）。 */
export function dayKey(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** 决定「这次要不要落一条」的全部字段：任何一项相同就不算变化。 */
export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (
    a.currency === b.currency &&
    a.status === b.status &&
    a.years === b.years &&
    a.annualCost === b.annualCost &&
    a.enoughLine === b.enoughLine &&
    a.netWorth === b.netWorth
  );
}

/**
 * 追加或改写**今天**那一条：同一天里数字变了就覆盖当天记录（这台机器今天看到的
 * 最新状态），一天之内没有任何变化则**原样返回同一个数组**——调用方据此跳过写盘。
 * 不跳的话：每次写盘都会广播给本页的重算监听器，再算一遍又写一次，循环只靠
 * 「值恰好没变」才停，等于把一个存储写放大挂在运气上。
 */
export function upsertToday(history: Snapshot[], next: Snapshot): Snapshot[] {
  const today = dayKey(next.at);
  const last = history[history.length - 1];
  if (last && dayKey(last.at) === today) {
    if (sameSnapshot(last, next)) return history;
    return [...history.slice(0, -1), next];
  }
  const appended = [...history, next];
  return appended.length > MAX_SNAPSHOTS ? appended.slice(appended.length - MAX_SNAPSHOTS) : appended;
}

/**
 * 「上一次」= 最近一条**不是今天**的记录。
 * 按天而不是按值找：回访时数字完全可能一字未动，而「7 天过去，什么都没动」正是
 * 这一屏要如实说出来的读数（`product-concept.md` §3.2 担心的就是这个，但躲开它
 * 的办法应该是别把它包装成进展，不是不说）。
 */
export function previousDay(history: Snapshot[], today: string): Snapshot | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (dayKey(history[i].at) !== today) return history[i];
  }
  return null;
}

export type ProgressDiff = {
  /** 距上次测算的整天数（向下取整；同一天内为 0）。 */
  daysBetween: number;
  /** 两侧币种是否一致——金额类差值只在同币种时才可比。 */
  sameCurrency: boolean;
  /**
   * 年限差（负数 = 提前）。跨币种也可比：整条复利递推对币种单位是齐次的
   * （本金、年储蓄、目标本金同时乘一个汇率因子），跨过首次达标年的那一年不变。
   * 任一侧不是 reachable 时为 null。
   */
  yearsDelta: number | null;
  /** 三状态是否跨档（可达 ↔ 不可达 ↔ 无净储蓄）。 */
  statusChanged: boolean;
  /** 净资产差；跨币种时为 null（不同单位相减没有意义）。 */
  netWorthDelta: number | null;
};

export function diffSnapshots(prev: Snapshot, current: Snapshot): ProgressDiff {
  const ms = new Date(current.at).getTime() - new Date(prev.at).getTime();
  return {
    daysBetween: Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : 0,
    sameCurrency: prev.currency === current.currency,
    yearsDelta:
      prev.years !== null && current.years !== null ? current.years - prev.years : null,
    statusChanged: prev.status !== current.status,
    netWorthDelta: prev.currency === current.currency ? current.netWorth - prev.netWorth : null,
  };
}

/**
 * 「有没有变化」一律用 `sameSnapshot` 判，不再另写一套比较：
 * 差值字段各有 null 口径（跨币种不给金额差、非可达不给年限差），自己拼
 * 「有进展」容易把 `yearsDelta === 0` 当成进展、或把只动了目标的改动当成没动。
 * 有变化但某些差值不可比时，UI 说清哪一侧不能放在一起比，而不是编一个数。
 */
