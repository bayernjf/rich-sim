/**
 * 拟物衣柜（`sim-wardrobe.md`）· 衣物内容模块。
 *
 * 与纯体验项同套路放 web 侧而不进 core catalog：catalog 受每维 3–5 项、
 * 维内年成本严格递增、每维一个默认档的契约约束，而衣物是独立陈列形态
 * （`dimension: 'wardrobe'`），不属于 M1 设计器的「每维选一件」模型。
 *
 * 入池闸门与购物池同一红线：`source` 必须是 http(s)（金额有可查证的公开
 * 依据）才进得了衣柜，即使它标了 kind。当前衣物池为空——S2 等条目来源与
 * 衣物图（OPENAI_API_KEY）解除后，只往这里加条目、组件零改动。
 */
import type { ShoppingItem } from './sim-content';

/** 衣柜固定用一个维度 id，陈列与账务都靠它识别。 */
export const WARDROBE_DIMENSION = 'wardrobe';

export type WardrobeItem = ShoppingItem & {
  /** 衣物图（/mall/wardrobe/<optionId>.webp 之外的自定义路径）；缺省走约定路径。 */
  image?: string;
};

/**
 * 衣物条目（S2 待补）。每条都必须带 http(s) 来源与 `kind: 'consumer'`、
 * `resellable: true`（可二手变卖）；`annualCost` 口径 = 该类衣物的年持有
 * 口径（干洗 / 保养 / 收纳摊提），写进各自 `note`。
 */
export const WARDROBE_ITEMS: WardrobeItem[] = [];

/** 衣物图约定路径：/mall/wardrobe/<optionId>.webp。 */
export function wardrobeImage(item: WardrobeItem): string {
  return item.image ?? `/mall/wardrobe/${item.option.id}.webp`;
}

/** 入池闸门：与 shoppingPool 同一规则——无 http(s) 来源的条目不得上架。 */
export function wardrobePool(): WardrobeItem[] {
  return WARDROBE_ITEMS.filter(
    (item) =>
      item.dimension === WARDROBE_DIMENSION &&
      item.option.kind === 'consumer' &&
      typeof item.option.source === 'string' &&
      /^https?:\/\//.test(item.option.source),
  );
}

