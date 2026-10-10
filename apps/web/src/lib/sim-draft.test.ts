/**
 * S4 · 模拟态本机存储（`homepage-claim-experience.md` §3.1 + 验收 #1）。
 *
 * 「两本账互不污染」是这个模块存在的全部理由，而它是一组**不存在**型断言。
 * 空扫面会让这类断言集体假绿，所以每条都先写正向对照（证明笔真的写进去了、
 * 证明 RIGHT SIDE 真的读得到），再断言另一本账没被动过。
 *
 * 用 `Object.defineProperty` 而不是 jsdom：Node 环境本来没有 localStorage，
 * 而这两个模块的入口都有 `typeof localStorage` 守卫，注入实现就能测到真路径。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_KEY } from './draft';
import {
  SIM_KEY,
  SIM_UPDATED_EVENT,
  addCartItem,
  claimSim,
  clearSimState,
  readCart,
  readFavorites,
  readResaleProceeds,
  readSimState,
  removeCartItem,
  sanitizeCart,
  saveCartItem,
  saveFavoriteItem,
  sellCartItem,
} from './sim-draft';

function installStorage(): Map<string, string> {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, String(value)),
      removeItem: (key: string) => void map.delete(key),
      clear: () => map.clear(),
      key: (index: number) => [...map.keys()][index] ?? null,
      get length() {
        return map.size;
      },
    },
  });
  return map;
}

const REAL_PLAN = JSON.stringify({
  schemaVersion: 1,
  choices: [{ dimension: 'living', optionId: 'owner-condo' }],
  profile: { income: 15000, expense: 8000, savings: 100000, debt: 0, currency: 'USD' },
  currency: 'USD',
  assumptions: null,
  updatedAt: '2026-10-05T00:00:00.000Z',
});

describe('模拟态存储（S4）', () => {
  beforeEach(() => {
    installStorage();
  });

  it('key 是 §3.1 指定的独立账本，不是真实方案那个', () => {
    expect(SIM_KEY).toBe('rich-sim:sim:v1');
    expect(SIM_KEY).not.toBe(DRAFT_KEY);
  });

  it('领取后能读回（正向对照：下面几条「不影响 Real 账本」才有意义）', () => {
    expect(readSimState()).toBeNull();
    const claimed = claimSim(1_000_000);
    expect(claimed.startingCapital).toBe(1_000_000);
    expect(readSimState()?.startingCapital).toBe(1_000_000);
    expect(readSimState()?.claimedAt).toBe(claimed.claimedAt);
  });

  it('验收 #1：领完之后 rich-sim:plan:v1 仍是它原来的样子', () => {
    localStorage.setItem(DRAFT_KEY, REAL_PLAN);
    claimSim(1_000_000);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(REAL_PLAN);
    // 反过来也一样：真实账本所在的 key 不会被写出第二个意思。
    expect(localStorage.getItem(SIM_KEY)).not.toBeNull();
    clearSimState();
    expect(localStorage.getItem(SIM_KEY)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(REAL_PLAN);
  });

  it('重复领取只是刷新时间，不叠加', () => {
    claimSim(1_000_000);
    claimSim(1_000_000);
    expect(readSimState()?.startingCapital).toBe(1_000_000);
  });

  it('坏数据一律视为没领过（不抛错、不产 NaN）', () => {
    localStorage.setItem(SIM_KEY, '{oops');
    expect(readSimState()).toBeNull();
    localStorage.setItem(SIM_KEY, JSON.stringify({ schemaVersion: 2, startingCapital: 100 }));
    expect(readSimState()).toBeNull();
    localStorage.setItem(SIM_KEY, JSON.stringify({ schemaVersion: 1, startingCapital: 'x' }));
    expect(readSimState()).toBeNull();
  });
});

describe('购物车（M3 S2 · G2）', () => {
  beforeEach(() => {
    installStorage();
  });

  it('旧草稿（无 cart 字段）读出来是空车，schemaVersion 仍是 1', () => {
    claimSim(1_000_000);
    expect(readSimState()?.cart ?? []).toEqual([]);
    expect(readCart()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(SIM_KEY)!).schemaVersion).toBe(1);
  });

  it('加购幂等：同一选项重复加只有一件；同维可多件', () => {
    claimSim(1_000_000);
    let cart = saveCartItem([], { dimension: 'travel', optionId: 'superyacht' }, true);
    expect(cart).toHaveLength(1);
    cart = saveCartItem(cart, { dimension: 'travel', optionId: 'superyacht' }, true);
    expect(cart).toHaveLength(1);
    cart = saveCartItem(cart, { dimension: 'travel', optionId: 'international' }, true);
    expect(cart).toHaveLength(2);
    expect(cart.map((item) => item.optionId)).toEqual(['superyacht', 'international']);
  });

  it('移出幂等：删本就不在车里的条目不报错', () => {
    expect(addCartItem([], { dimension: 'a', optionId: 'x' })).toHaveLength(1);
    expect(
      addCartItem(
        [{ dimension: 'a', optionId: 'x' }],
        { dimension: 'a', optionId: 'x' },
      ),
    ).toEqual([{ dimension: 'a', optionId: 'x' }]);
    expect(removeCartItem([], { dimension: 'a', optionId: 'x' })).toEqual([]);
    expect(
      removeCartItem(
        [{ dimension: 'a', optionId: 'x' }],
        { dimension: 'a', optionId: 'x' },
      ),
    ).toEqual([]);
  });

  it('持久化后能读回，且只动 sim 账本', () => {
    localStorage.setItem(DRAFT_KEY, REAL_PLAN);
    claimSim(1_000_000);
    saveCartItem([], { dimension: 'flexibility', optionId: 'exp-met-gala-ticket' }, true);
    expect(readCart()).toEqual([
      { dimension: 'flexibility', optionId: 'exp-met-gala-ticket' },
    ]);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(REAL_PLAN);
  });

  it('坏 cart（非数组 / 形状错 / 重复）被收敛：合法项保留并去重', () => {
    claimSim(1_000_000);
    localStorage.setItem(
      SIM_KEY,
      JSON.stringify({
        schemaVersion: 1,
        startingCapital: 1_000_000,
        claimedAt: '2026-10-06T00:00:00.000Z',
        cart: [
          { dimension: 'travel', optionId: 'superyacht' },
          { dimension: 'travel', optionId: 'superyacht' },
          { dimension: 42 },
          null,
          'nope',
        ],
      }),
    );
    expect(readCart()).toEqual([{ dimension: 'travel', optionId: 'superyacht' }]);
    expect(sanitizeCart(undefined)).toEqual([]);
    expect(sanitizeCart(null)).toEqual([]);
  });

  it('没领过起始金时加车不凭空创建账本（购物区不强迫先领钱）', () => {
    const cart = saveCartItem([], { dimension: 'travel', optionId: 'superyacht' }, true);
    expect(cart).toHaveLength(1);
    expect(readSimState()).toBeNull();
  });

  it('没账本时连续加购也能累积（车由 UI 持有，不各自从空车派生）', () => {
    let cart = saveCartItem([], { dimension: 'travel', optionId: 'superyacht' }, true);
    cart = saveCartItem(cart, { dimension: 'flexibility', optionId: 'exp-met-gala-ticket' }, true);
    expect(cart).toHaveLength(2);
    expect(readSimState()).toBeNull();
  });
});

describe('收藏夹（商城扩展 · 逛而不买）', () => {
  beforeEach(() => {
    installStorage();
  });

  it('旧草稿（无 favorites 字段）读出来是空收藏，schemaVersion 仍是 1', () => {
    claimSim(1_000_000);
    expect(readSimState()?.favorites ?? []).toEqual([]);
    expect(readFavorites()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(SIM_KEY)!).schemaVersion).toBe(1);
  });

  it('收藏 / 取消收藏幂等（与购物车同形状）', () => {
    claimSim(1_000_000);
    let favorites = saveFavoriteItem([], { dimension: 'travel', optionId: 'superyacht' }, true);
    favorites = saveFavoriteItem(favorites, { dimension: 'travel', optionId: 'superyacht' }, true);
    expect(favorites).toHaveLength(1);
    favorites = saveFavoriteItem(favorites, { dimension: 'travel', optionId: 'superyacht' }, false);
    expect(favorites).toEqual([]);
    // 取消一个本就没收藏的条目也不报错。
    expect(saveFavoriteItem([], { dimension: 'a', optionId: 'x' }, false)).toEqual([]);
  });

  it('持久化后能读回，坏数据被收敛', () => {
    claimSim(1_000_000);
    saveFavoriteItem([], { dimension: 'flexibility', optionId: 'exp-met-gala-ticket' }, true);
    expect(readFavorites()).toEqual([
      { dimension: 'flexibility', optionId: 'exp-met-gala-ticket' },
    ]);
    localStorage.setItem(
      SIM_KEY,
      JSON.stringify({
        schemaVersion: 1,
        startingCapital: 1_000_000,
        claimedAt: '2026-10-09T00:00:00.000Z',
        favorites: [{ dimension: 'travel', optionId: 'superyacht' }, { dimension: 42 }, null],
      }),
    );
    expect(readFavorites()).toEqual([{ dimension: 'travel', optionId: 'superyacht' }]);
  });

  it('收藏与购物车互不影响：收藏一件不进车，加车不进收藏', () => {
    claimSim(1_000_000);
    saveFavoriteItem([], { dimension: 'travel', optionId: 'superyacht' }, true);
    expect(readCart()).toEqual([]);
    saveCartItem([], { dimension: 'flexibility', optionId: 'exp-met-gala-ticket' }, true);
    expect(readFavorites()).toEqual([{ dimension: 'travel', optionId: 'superyacht' }]);
    const state = JSON.parse(localStorage.getItem(SIM_KEY)!) as { cart: unknown; favorites: unknown };
    expect(state.cart).toEqual([{ dimension: 'flexibility', optionId: 'exp-met-gala-ticket' }]);
    expect(state.favorites).toEqual([{ dimension: 'travel', optionId: 'superyacht' }]);
  });

  it('没领过起始金时收藏不凭空创建账本（会话态，与购物车一致）', () => {
    const favorites = saveFavoriteItem([], { dimension: 'travel', optionId: 'superyacht' }, true);
    expect(favorites).toHaveLength(1);
    expect(readSimState()).toBeNull();
  });
});

/**
 * 结构隔离靠的是「两个模块互不引用」，而这条事实会被一次顺手的 import
 * 静默推翻，所以钉在测试里。
 */
describe('两本账的结构隔离', () => {
  const sources = import.meta.glob('./*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('真的读到了 sim-draft.ts 原文（正向对照）', () => {
    expect(sources['./sim-draft.ts']).toContain('SIM_KEY');
  });

  it('sim-draft.ts 不引用真实方案模块，也不出现它的 key', () => {
    // 只查代码里被引号包住的字面量：注释里拿这串 key 做对比说明是它的本分。
    const source = sources['./sim-draft.ts'];
    expect(source).not.toMatch(/from '\.\/draft'/);
    expect(source).not.toMatch(/DRAFT_KEY/);
    expect(source).not.toMatch(/['"]rich-sim:plan:v1['"]/);
  });

  it('真实方案的 draft.ts 也不知道模拟态存在', () => {
    const source = sources['./draft.ts'];
    expect(source).not.toMatch(/SIM_KEY/);
    expect(source).not.toMatch(/['"]rich-sim:sim:v1['"]/);
  });
});

/**
 * M5 S3 · 云同步的对时基础：每次本机写入都要刷新 updatedAt 并广播事件，
 * 否则同步桥不知道本机变了（防抖上行订阅的就是它）。
 */
describe('updatedAt 与更新事件（M5 S3）', () => {
  beforeEach(() => {
    installStorage();
  });

  it('领取时写下 updatedAt（与 claimedAt 同刻）', () => {
    claimSim(1_000_000);
    const state = readSimState();
    expect(state?.updatedAt).toBe(state?.claimedAt);
  });

  it('加购刷新 updatedAt，比领取时新', () => {
    claimSim(1_000_000);
    const claimed = readSimState()!.updatedAt!;
    // 保证时间戳必然前进（同毫秒 flake 防护）。
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 1000);
    saveCartItem([], { dimension: 'travel', optionId: 'superyacht' }, true);
    vi.useRealTimers();
    expect(Date.parse(readSimState()!.updatedAt!)).toBeGreaterThan(Date.parse(claimed));
  });

  it('领取与加购都广播 SIM_UPDATED_EVENT', () => {
    const seen: string[] = [];
    const g = globalThis as Record<string, unknown>;
    const saved = g.window;
    g.window = { dispatchEvent: (e: Event) => void seen.push(e.type) };
    try {
      claimSim(1_000_000);
      saveCartItem([], { dimension: 'travel', optionId: 'superyacht' }, true);
    } finally {
      g.window = saved;
    }
    expect(seen.filter((type) => type === SIM_UPDATED_EVENT)).toHaveLength(2);
  });
});

describe('二手变卖（sim-resale-market）', () => {
  beforeEach(() => {
    installStorage();
  });

  it('旧草稿（无 resaleProceeds 字段）读出来是 0，schemaVersion 仍是 1', () => {
    claimSim(1_000_000);
    expect(readResaleProceeds()).toBe(0);
    expect(JSON.parse(localStorage.getItem(SIM_KEY)!).schemaVersion).toBe(1);
  });

  it('卖出 = 移出车项 + 回笼累加，一次写盘；重复卖出同一项只回一次', () => {
    claimSim(1_000_000);
    const cart = saveCartItem([], { dimension: 'travel', optionId: 'superyacht' }, true);
    const first = sellCartItem(cart, { dimension: 'travel', optionId: 'superyacht' }, 4_050_000);
    expect(first.cart).toEqual([]);
    expect(first.resaleProceeds).toBe(4_050_000);
    expect(readCart()).toEqual([]);
    expect(readResaleProceeds()).toBe(4_050_000);
    // 再卖一件别的，回笼累计；账面起始金不被改写。
    const cart2 = saveCartItem([], { dimension: 'living', optionId: 'mansion' }, true);
    const second = sellCartItem(cart2, { dimension: 'living', optionId: 'mansion' }, 100_000);
    expect(second.resaleProceeds).toBe(4_150_000);
    expect(readSimState()?.startingCapital).toBe(1_000_000);
  });

  it('非法回笼（NaN / 负数）只移车不加钱；坏数据字段收敛为 0', () => {
    claimSim(1_000_000);
    const cart = saveCartItem([], { dimension: 'travel', optionId: 'superyacht' }, true);
    const sold = sellCartItem(cart, { dimension: 'travel', optionId: 'superyacht' }, NaN);
    expect(sold.cart).toEqual([]);
    expect(sold.resaleProceeds).toBe(0);
    localStorage.setItem(
      SIM_KEY,
      JSON.stringify({ ...readSimState(), resaleProceeds: -50 }),
    );
    expect(readResaleProceeds()).toBe(0);
  });

  it('没领过起始金：卖出只动车，回笼是内存态 0，不凭空建账', () => {
    const sold = sellCartItem(
      [{ dimension: 'travel', optionId: 'superyacht' }],
      { dimension: 'travel', optionId: 'superyacht' },
      4_050_000,
    );
    expect(sold.cart).toEqual([]);
    expect(sold.resaleProceeds).toBe(0);
    expect(readSimState()).toBeNull();
  });

  it('卖出只动 sim 账本，真实方案账一个字节不变', () => {
    localStorage.setItem(DRAFT_KEY, REAL_PLAN);
    claimSim(1_000_000);
    const cart = saveCartItem([], { dimension: 'travel', optionId: 'superyacht' }, true);
    sellCartItem(cart, { dimension: 'travel', optionId: 'superyacht' }, 4_050_000);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(REAL_PLAN);
  });
});
