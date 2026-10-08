/**
 * 模拟态本机存储（S4 领钱入口 · `homepage-claim-experience.md` §3.1）。
 *
 * 与 `rich-sim:plan:v1` 物理分开的第二个 key。这是**结构保证**而不是纪律：
 * `readDraft()` 永远读不到这里的数，所以"领到的一百万"不可能被静默当成
 * 用户的真实资产；反过来，本模块也不 import `lib/draft.ts`
 * （由 sim-draft.test.ts 的源码扫描钉住）——两本账一旦互相引用，
 * 隔离就从结构退化成约定。
 *
 * M3 S2 起多一个可选 `cart`：购物车条目（同一维度允许多件，但每个选项
 * 在车中至多一件——加购是幂等切换）。`schemaVersion` 维持 1：旧状态读出来
 * `cart` 为 `undefined`，一律按空车处理，不迁移、不改版本号。
 */
export const SIM_KEY = 'rich-sim:sim:v1';

/**
 * M5 S3 · 模拟态账本被改写的事件名（同 DRAFT_UPDATED_EVENT 的地位：不是存储
 * key、不落盘，订阅方与写方只有本模块和 components 的岛）。云同步桥靠它
 * 做防抖上行；改名要一起改。
 */
export const SIM_UPDATED_EVENT = 'rich-sim:sim-updated';

/**
 * 购物车条目（G2 · m3-task-breakdown §1）。只记定位两件套，金额永远现查
 * 购物池，不把价格快照进本机账——目录校准时旧草稿不会携带过期价格。
 */
export type CartItem = { dimension: string; optionId: string };

import { sanitizeAllocation, type InvestAllocation } from './sim-invest';

/** 虚拟起始金以 USD 计价并展示（卡 A 页的金额口径同样是 USD）。 */
export type SimState = {
  schemaVersion: 1;
  /** 虚拟模拟起始金（USD）。 */
  startingCapital: number;
  /** 领取时刻，ISO。 */
  claimedAt: string;
  /** 购物车；旧草稿（S2 之前写入）没有这个字段，按空车处理。 */
  cart?: CartItem[];
  /**
   * P3 投资线 · 起始金的资产类别配置（可选）。旧状态没有它，按「全部现金」处理；
   * 收益率一律用户自填（缺失 = 该类别按 0% 推演），不存任何标的或策略。
   */
  invest?: InvestAllocation;
  /**
   * M5 S3 · 最后一次本机写入时刻（ISO，可选）：云同步的对时依据。
   * 旧状态没有它，对时时按 claimedAt 兜底（见 sync 的调用方）。
   */
  updatedAt?: string;
};

function notifySimUpdated(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(SIM_UPDATED_EVENT));
  }
}

export function readSimState(): SimState | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SIM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SimState;
    if (parsed && parsed.schemaVersion === 1 && Number.isFinite(parsed.startingCapital)) {
      return { ...parsed, cart: sanitizeCart(parsed.cart), invest: sanitizeAllocation(parsed.invest) };
    }
    return null;
  } catch {
    return null;
  }
}

/** 只保留形状合法的条目并去重（先到先得），其余输入一律收敛成空车。 */
export function sanitizeCart(cart: unknown): CartItem[] {
  if (!Array.isArray(cart)) return [];
  const seen = new Set<string>();
  const items: CartItem[] = [];
  for (const entry of cart) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as CartItem).dimension === 'string' &&
      typeof (entry as CartItem).optionId === 'string'
    ) {
      const item = {
        dimension: (entry as CartItem).dimension,
        optionId: (entry as CartItem).optionId,
      };
      const key = `${item.dimension}/${item.optionId}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
    }
  }
  return items;
}

/** 纯函数：加车（已在车中则原样返回，幂等）。 */
export function addCartItem(cart: CartItem[], item: CartItem): CartItem[] {
  return cart.some((entry) => entry.dimension === item.dimension && entry.optionId === item.optionId)
    ? cart
    : [...cart, item];
}

/** 纯函数：移车（本就不在则原样返回，幂等）。 */
export function removeCartItem(cart: CartItem[], item: CartItem): CartItem[] {
  return cart.filter(
    (entry) => !(entry.dimension === item.dimension && entry.optionId === item.optionId),
  );
}

function persistCart(cart: CartItem[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const state = readSimState();
    if (!state) return; // 没领过起始金就没有 sim 账本，购物车无处可挂。
    localStorage.setItem(
      SIM_KEY,
      JSON.stringify({ ...state, cart, updatedAt: new Date().toISOString() }),
    );
    notifySimUpdated();
  } catch {
    // 与领取路径一致：本机记账失败不阻断页面交互。
  }
}

/**
 * 基于调用方持有的当前车做幂等加/删，并尝试持久化，返回最新车。
 *
 * 当前车由 UI 持有（事实源），不从账本重读：没领过起始金的人没有 sim 账本，
 * 若这里每次都从 readSimState() 重新派生，连续加购会各自从空车算起而互相覆盖。
 * 有 sim 账本时把结果写回；没有时购物车是纯内存会话态（不凭空创建账本）。
 */
export function saveCartItem(cart: CartItem[], item: CartItem, add: boolean): CartItem[] {
  const current = sanitizeCart(cart);
  const next = add ? addCartItem(current, item) : removeCartItem(current, item);
  persistCart(next);
  return next;
}

/** 读出当前购物车（无草稿/坏数据统一为空车）。 */
export function readCart(): CartItem[] {
  return sanitizeCart(readSimState()?.cart);
}

/** 读出当前投资配置（无草稿 / 从未配置 / 坏数据统一为 undefined = 全部现金）。 */
export function readInvest(): InvestAllocation | undefined {
  return readSimState()?.invest;
}

/** 持久化投资配置（幂等覆盖；没领过起始金就没有 sim 账本，无处可挂，静默跳过）。 */
export function saveInvest(invest: InvestAllocation): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const state = readSimState();
    if (!state) return;
    localStorage.setItem(
      SIM_KEY,
      JSON.stringify({ ...state, invest, updatedAt: new Date().toISOString() }),
    );
    notifySimUpdated();
  } catch {
    // 与购物车一致：本机记账失败不阻断页面交互。
  }
}

/** 领取（幂等）：同一笔起始金重复领取只是刷新 claimedAt。返回写下的状态。 */
export function claimSim(startingCapital: number): SimState {
  const state: SimState = {
    schemaVersion: 1,
    startingCapital,
    claimedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SIM_KEY, JSON.stringify(state));
      notifySimUpdated();
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
