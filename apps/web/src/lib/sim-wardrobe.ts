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
import type { Locale } from './i18n';

/** 衣柜固定用一个维度 id，陈列与账务都靠它识别。 */
export const WARDROBE_DIMENSION = 'wardrobe';

export type WardrobeItem = ShoppingItem & {
  /** 衣物图（/mall/wardrobe/<optionId>.webp 之外的自定义路径）；缺省走约定路径。 */
  image?: string;
};

/**
 * 衣物英文名（内容层，与 sim-content 的 EXPERIENCE_LABELS_EN 同职责）。
 * 衣物是 web 侧条目、不进 core catalog，英文名只能放在这一侧；
 * `poolOptionLabel` 通过 extra 词典参数查表（见 MallArea 的 labelOf）。
 */
export const WARDROBE_LABELS_EN: Record<string, string> = {
  'wardrobe-bespoke-suit': 'Savile Row fully bespoke two-piece suit',
  'wardrobe-couture-gown': 'Paris haute-couture evening gown',
  'wardrobe-grand-complication-watch': 'Grand-complication mechanical watch',
  'wardrobe-exotic-handbag': 'Exotic crocodile-skin top handbag',
  'wardrobe-bespoke-shoes': 'London handmade bespoke leather shoes',
};

/** 衣柜件名字：英文查 WARDROBE_LABELS_EN，缺漏退回中文原文（不返回空串）。 */
export function wardrobeOptionLabel(option: { id: string; label: string }, locale: Locale): string {
  return locale === 'en' ? (WARDROBE_LABELS_EN[option.id] ?? option.label) : option.label;
}

/**
 * 衣物条目（S2，2026-10-10 补首批 5 件，全部带 http(s) 公开来源）。
 * 每条 `kind: 'consumer'`、`resellable: true`（可二手变卖）。
 *
 * **年成本口径（sim-wardrobe §2/§3）**：衣物是一次购入、持有多年，`annualCost`
 * 不取零售价而取**年持有口径**＝零售价按显式标注的教学穿着/持有寿命直线摊提
 * （含日常保养），零售价与摊提算式都写进各自 `note`，与产品「财富的真实持有
 * 成本」主题一致。零售价有公开来源；摊提年限是教学示意，已逐条标注。
 * 图片仍待 `OPENAI_API_KEY`（S2 剩余），缺图自动回退占位衣架。
 */
export const WARDROBE_ITEMS: WardrobeItem[] = [
  {
    dimension: WARDROBE_DIMENSION,
    dimensionLabel: '衣柜',
    option: {
      id: 'wardrobe-bespoke-suit',
      label: '萨维尔街全定制西装（两件套）',
      annualCost: 990,
      source: 'https://www.huntsmansavilerow.com/pages/bespoke-tailoring',
      note:
        '伦敦萨维尔街全定制两件套西装公开报价 £7,500 起（Huntsman 官网 bespoke-tailoring 页；' +
        '同级 Henry Poole 约 £6,500 起，见 Luxury London 指南）。按 ECB 2026-10-09 汇率 £1≈$1.322 ' +
        '折合约 $9,900；此处按 10 年穿着寿命直线摊提（教学口径，含干洗与保养）≈ $990/年。',
      kind: 'consumer',
      joy: 4,
      resellable: true,
    },
  },
  {
    dimension: WARDROBE_DIMENSION,
    dimensionLabel: '衣柜',
    option: {
      id: 'wardrobe-couture-gown',
      label: '巴黎高级定制晚礼服',
      annualCost: 3000,
      source: 'https://www.couturenotebook.com/haute-couture-definition-clients-and-prices',
      note:
        '高级定制晚礼服公开报价约 $60,000–$120,000 起、繁复款可达 $500,000+（Couture Notebook 价格' +
        '指南；学术资料口径约 $20,000–$100,000）。此处取下限 $60,000，按 20 年珍藏/穿着寿命直线摊提' +
        '（教学口径，含保管与维护）= $3,000/年。',
      kind: 'consumer',
      joy: 5,
      resellable: true,
    },
  },
  {
    dimension: WARDROBE_DIMENSION,
    dimensionLabel: '衣柜',
    option: {
      id: 'wardrobe-grand-complication-watch',
      label: '顶级复杂功能机械腕表',
      annualCost: 2830,
      source: 'https://www.jomashop.com/patek-phillepe-grand-complications.html',
      note:
        '顶级复杂功能（万年历/三问/陀飞轮级）机械腕表零售多在六位数美元：零售挂牌约 $84,900 起、' +
        '成交常见约 $64,000–$188,500（Jomashop Grand Complications 列表；苏富比买家指南复杂功能款' +
        '约 $31,900 起）。此处取 $85,000，按 30 年持有寿命直线摊提（教学口径，含定期保养）≈ ' +
        '$2,830/年。通用品类名，不指代任何品牌。',
      kind: 'consumer',
      joy: 4,
      resellable: true,
    },
  },
  {
    dimension: WARDROBE_DIMENSION,
    dimensionLabel: '衣柜',
    option: {
      id: 'wardrobe-exotic-handbag',
      label: '稀有鳄鱼皮顶级手袋',
      annualCost: 2500,
      source: 'https://www.sothebys.com/en/articles/complete-buying-guide-hermes-himalayan-birkin',
      note:
        '稀有鳄鱼皮顶级手袋精品店零售约 $50,000–$70,000（苏富比 Himalayan Birkin 买家指南：Birkin 25 ' +
        '零售区间；鳄鱼/短吻鳄款通常超 $40,000）。此处取下限 $50,000，按 20 年持有寿命直线摊提' +
        '（教学口径，含保养收纳）= $2,500/年。通用品类名，不指代任何品牌。',
      kind: 'consumer',
      joy: 4,
      resellable: true,
    },
  },
  {
    dimension: WARDROBE_DIMENSION,
    dimensionLabel: '衣柜',
    option: {
      id: 'wardrobe-bespoke-shoes',
      label: '伦敦手工定制皮鞋',
      annualCost: 660,
      source: 'https://www.georgecleverley.com/journal/fmi57bx84h1oqwe38p48vyty9vvs2z',
      note:
        '伦敦梅菲尔手工定制皮鞋公开报价 £5,000 起（George Cleverley 官网转载 Forbes 报道：custom ' +
        'creations priced in excess of £5,000；成衣约 £500 起）。按 ECB 2026-10-09 汇率 £1≈$1.322 ' +
        '折合约 $6,600，按 10 年穿着寿命（含换底）直线摊提（教学口径）≈ $660/年。',
      kind: 'consumer',
      joy: 3,
      resellable: true,
    },
  },
];

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

