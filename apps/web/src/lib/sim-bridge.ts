/**
 * M3 S4 · SIM → REAL 单向桥（m3-task-breakdown §2 S4，G4 方案 a）。
 *
 * 唯一允许的跨界动作：把富豪模拟购物车的**年成本一个数字**写进真实方案草稿
 * 的 `goalOverride`。绝不反向（真实草稿永远不写 sim 账本），也不携带起始金、
 * 资产占比等任何虚构成分——目标是「这套生活方式一年要花多少」，不是「你有
 * 这么多钱」。
 *
 * 桥不直接读写 sim 账本：cart 由调用方（购物区岛）传入，避免这个模块反向
 * 依赖 sim-draft；「写桥后 sim key 不变」由 sim-bridge 自己的测试钉死。
 */
import { initialCatalogUSD } from '@rich-sim/core';
import { readDraft, writeDraft, type Draft } from './draft';
import {
  CARD_A,
  CARD_A_LAST_YEAR_COST,
  cartAddedAnnualCost,
  shoppingPool,
  topTierChoices,
  type CartEntry,
} from './sim-content';
import { DEFAULT_ASSUMPTIONS } from './defaults';

/**
 * 购物车目标年成本（USD）= 卡 A 基线 + 加购。基线项不双算，逻辑与 S3
 * 账单预览同一纯函数，避免桥出去的数字和屏幕上看到的不一致。基线年成本
 * 复用 M2 冻结常量（卡 A 画像 = $1,317,000，即 CARD_A_LAST_YEAR_COST）。
 */
export function cartGoalAnnualCost(cart: CartEntry[]): number {
  const pool = shoppingPool(initialCatalogUSD);
  const baseline: CartEntry[] = CARD_A.choices.map((choice) => ({
    dimension: choice.dimension,
    optionId: choice.optionId,
  }));
  return CARD_A_LAST_YEAR_COST + cartAddedAnnualCost(cart, pool, baseline);
}

/**
 * 把购物车写为真实方案的目标（G4 方案 a）。
 *
 * - 已有草稿：保留 profile / currency / assumptions，只覆盖 goalOverride；
 *   choices 改写「每维最贵项」作展示回显（计算仍以 override 为准）。
 * - 无草稿：建一份最小合法草稿（profile=null，落点进财务录入）。
 * 返回落点路径：已录入 → /app/result，否则 → /app/finance。
 */
export function adoptCartAsGoal(
  cart: CartEntry[],
  catalog = initialCatalogUSD,
): '/app/finance' | '/app/result' {
  const annualCost = cartGoalAnnualCost(cart);
  const existing = readDraft();
  const choices = topTierChoices(catalog);

  const base: Draft = existing ?? {
    schemaVersion: 1,
    choices,
    profile: null,
    currency: 'USD',
    assumptions: DEFAULT_ASSUMPTIONS,
    updatedAt: new Date().toISOString(),
  };

  const next: Draft = {
    ...base,
    choices,
    goalOverride: { annualCost, from: 'sim-cart' },
  };
  writeDraft(next);

  const profile = next.profile;
  const financeDone =
    !!profile &&
    typeof profile.income === 'number' &&
    typeof profile.expense === 'number' &&
    typeof profile.savings === 'number' &&
    typeof profile.debt === 'number';
  return financeDone ? '/app/result' : '/app/finance';
}
