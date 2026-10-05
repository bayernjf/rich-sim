/**
 * 模拟态本机存储（S4 领钱入口 · `homepage-claim-experience.md` §3.1）。
 *
 * 与 `rich-sim:plan:v1` 物理分开的第二个 key。这是**结构保证**而不是纪律：
 * `readDraft()` 永远读不到这里的数，所以"领到的一百万"不可能被静默当成
 * 用户的真实资产；反过来，本模块也不 import `lib/draft.ts`
 * （由 sim-draft.test.ts 的源码扫描钉住）——两本账一旦互相引用，
 * 隔离就从结构退化成约定。
 *
 * P1 只存起始金本身。`SimState` 的其余字段（`choices` / `allocation` 等）
 * 等用到它们的切片各自来加：这里提前铺满只会让没人读的字段假装是契约。
 */
export const SIM_KEY = 'rich-sim:sim:v1';

/** 虚拟起始金以 USD 计价并展示（卡 A 页的金额口径同样是 USD）。 */
export type SimState = {
  schemaVersion: 1;
  /** 虚拟模拟起始金（USD）。 */
  startingCapital: number;
  /** 领取时刻，ISO。 */
  claimedAt: string;
};

export function readSimState(): SimState | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SIM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SimState;
    if (parsed && parsed.schemaVersion === 1 && Number.isFinite(parsed.startingCapital)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** 领取（幂等）：同一笔起始金重复领取只是刷新 claimedAt。返回写下的状态。 */
export function claimSim(startingCapital: number): SimState {
  const state: SimState = {
    schemaVersion: 1,
    startingCapital,
    claimedAt: new Date().toISOString(),
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SIM_KEY, JSON.stringify(state));
    }
  } catch {
    // 写入失败（隐私模式 / 配额）：这一步只是本机记账，不该影响主流程。
  }
  return state;
}

export function clearSimState(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(SIM_KEY);
  } catch {
    // 同上，静默。
  }
}
