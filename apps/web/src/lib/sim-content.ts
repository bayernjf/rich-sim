import type { Assumptions, Catalog, CatalogOption, LifeChoice } from '@rich-sim/core';
import { burdenStatus, scenarioAnnualCost } from '@rich-sim/core';

/**
 * F5 最小版 · 卡 A（`simulation-gameplay.md` §4.4 定稿，`m2-decisions.md` D1 拍板）。
 *
 * 内容纪律（`m2-task-breakdown.md` §1）：
 * - 六项年成本全部是 catalog 选项，金额由 `scenarioAnnualCost` 求和得出，
 *   本模块**不写任何金额字面量**；
 * - 资产结构占比取 §4.4 区间「约 70–85%」的中值 77.5%，剩余 22.5% 因原文
 *   只给顺序没给比例而**不细拆**——再拆就是编造；
 * - 占比仅用于展示，**永不参与计算**（引擎只吃 `choices` 的年成本）。
 */

export type SimCard = {
  id: string;
  label: string;
  subtitle: string;
  fictionNotice: string;
  assetStructure: { label: string; share: number }[];
  choices: LifeChoice;
};

export const CARD_A = {
  id: 'card-a',
  label: '科技独角兽创始人',
  subtitle: '新钱 · 高消费，愿为体验和地位付费，防御性配置弱。',
  fictionNotice: '虚构角色，不代表任何真实人物；资产结构为示意，不代表真实持仓。',
  assetStructure: [
    { label: '公司股权', share: 77.5 },
    { label: '现金 / 债券 / 不动产', share: 22.5 },
  ],
  choices: [
    { dimension: 'living', optionId: 'luxury-mansion' },
    { dimension: 'transport', optionId: 'private-jet' },
    { dimension: 'transport', optionId: 'exotic-car' },
    { dimension: 'flexibility', optionId: 'discretionary-large' },
    { dimension: 'health-insurance', optionId: 'concierge-medical' },
    { dimension: 'dining-daily', optionId: 'fine-dining' },
  ],
} as const satisfies SimCard;

/** 卡 A 同款再加一艘超级游艇 = §4.4 的「断裂教学开关」（S2 账单日用）。 */
export const CARD_A_BROKE: LifeChoice = [
  ...CARD_A.choices,
  { dimension: 'travel', optionId: 'superyacht' },
];

/**
 * 账单日（§2.4/§2.5）的角色现金流参数。
 *
 * `annualIncome` 是**示意值**：§4.4 只给财富量级「十亿美元级」没给收入，
 * 这里取量级下限 $75,000,000 × 4%（产品自己教的安全提取率，与
 * `DEFAULT_ASSUMPTIONS.withdrawalRate` 同一口径）。改起始设定时改这里，
 * 不要在 UI 里另算。
 */
export const CARD_A_ANNUAL_INCOME = 3_000_000;
/** 上一年已承担的持有成本 = 卡 A 基态（§2.5：CF = 收入 − 上一年成本）。 */
export const CARD_A_LAST_YEAR_COST = 1_317_000;
/** §2.4 参数 4：变卖折价 75%（资产无法原价变现）。 */
export const SELL_DISCOUNT = 0.75;
/** §2.4 参数 2：一次翻 4 张，按年成本从高到低。 */
export const BILLS_PER_PAGE = 4;

export type Bill = {
  dimensionLabel: string;
  optionLabel: string;
  annualCost: number;
  monthlyCost: number;
  source?: string;
};

/** 把一组选择展开成按年成本降序的账单（含拆到每月的口径）。 */
export function cardBills(
  choices: LifeChoice,
  catalog: Catalog,
): Bill[] {
  return choices
    .map((choice) => {
      const dimension = catalog.dimensions.find((d) => d.id === choice.dimension);
      const option = dimension?.options.find((o) => o.id === choice.optionId);
      return {
        dimensionLabel: dimension?.label ?? choice.dimension,
        optionLabel: option?.label ?? choice.optionId,
        annualCost: option?.annualCost ?? 0,
        monthlyCost: Math.round((option?.annualCost ?? 0) / 12),
        source: option?.source,
      };
    })
    .sort((a, b) => b.annualCost - a.annualCost);
}

/** 卡 A 的现金流与负担率（模拟态专用，REAL 态不用这个函数）。 */
export function cardBurden(
  choices: LifeChoice,
  catalog: Catalog,
  assumptions: Assumptions,
) {
  const annualCost = scenarioAnnualCost(choices, catalog, assumptions).annualCost;
  const cashflow = CARD_A_ANNUAL_INCOME - CARD_A_LAST_YEAR_COST;
  const { rate, status } = burdenStatus(annualCost, cashflow);
  return { annualCost, cashflow, rate, status };
}

export function cardAnnualCost(
  choices: LifeChoice,
  catalog: Catalog,
  assumptions: Assumptions,
): number {
  return scenarioAnnualCost(choices, catalog, assumptions).annualCost;
}

/* ── 购物池（M3 · m3-task-breakdown.md §2 S1）── */

export type ShoppingItem = {
  dimension: string;
  dimensionLabel: string;
  option: CatalogOption;
};

/**
 * 可购项 = 目录里被**显式标注了玩法 `kind`** 的选项（`simulation-gameplay.md`
 * §5.2）。标注就是入池开关：M1 设计器里的普通人锚点档（两居租房、公交通勤、
 * 自己做饭等）不标注，因而天然不进池；S2 的购物区也依赖 `kind` 才能把卡片分到
 * 资产 / 消费品 / 体验三组。
 *
 * 来源红线（`m3-task-breakdown.md` §1.2）：`source` 不是 http(s)（即来源未核验
 * 的档位）**不得进生产购物池**，即使它标了 `kind`。这里刻意不写出那个未核验
 * 标记的字面量——`copy-guard.test.ts` 的界面措辞闸门会连源码注释一起扫。
 *
 * 纯体验项刻意放 web 侧而不进 core catalog：catalog 受每维 3–5 项、维内年成本
 * 严格递增、每维一个默认档的契约约束（`catalog-data.test.ts`），而这些一次性
 * 体验不属于 M1 现实设计器的「每维选一件」模型。`annualCost` 对它们是「每年
 * 体验一次的花费」，口径写进各自 `note`。
 */
export function shoppingPool(catalog: Catalog): ShoppingItem[] {
  const fromCatalog = catalog.dimensions.flatMap((dimension) =>
    dimension.options
      .filter(isPurchasable)
      .map((option) => ({
        dimension: dimension.id,
        dimensionLabel: dimension.label,
        option,
      })),
  );
  const experiences = EXPERIENCE_ITEMS.map(({ dimension, option }) => ({
    dimension,
    dimensionLabel: catalog.dimensions.find((d) => d.id === dimension)?.label ?? dimension,
    option,
  }));
  return [...fromCatalog, ...experiences];
}

function isPurchasable(option: CatalogOption): boolean {
  return (
    option.kind !== undefined &&
    typeof option.source === 'string' &&
    /^https?:\/\//.test(option.source)
  );
}

/* ── 购物即记账（M3 · m3-task-breakdown.md §2 S3）── */

export type CartEntry = { dimension: string; optionId: string };

export type CartBurdenSummary = {
  /** 购物车新增的年成本（基线已含的同项不重复计）。 */
  addedAnnualCost: number;
  /** 基线年成本 + 新增。 */
  totalAnnualCost: number;
  /** 卡 A 固定可支配现金流（M2 口径：税后收入 − 上一年成本）。 */
  cashflow: number;
  rate: number | null;
  status: 'green' | 'yellow' | 'red';
  assetCount: number;
  experienceCount: number;
  /** gameplay §2.1 的 1:1 默认（购买次数，不是金额）：资产件数 > 体验件数。 */
  ratioHint: boolean;
};

function poolLookup(items: ShoppingItem[]): Map<string, ShoppingItem> {
  return new Map(items.map((item) => [`${item.dimension}/${item.option.id}`, item]));
}

/**
 * 购物车年成本逐项求和（m3 §1：不是逐维）。`baseline` 是卡 A 已拥有的项：
 * 同一件东西在购物车里再点一次不重复收费——它是基线账单的一部分。
 * 解析不到池项的条目（旧目录 id、坏数据）一律计 0，不产 NaN。
 */
export function cartAddedAnnualCost(
  cart: CartEntry[],
  pool: ShoppingItem[],
  baseline: CartEntry[] = [],
): number {
  const lookup = poolLookup(pool);
  const owned = new Set(baseline.map((entry) => `${entry.dimension}/${entry.optionId}`));
  const counted = new Set<string>();
  let sum = 0;
  for (const entry of cart) {
    const key = `${entry.dimension}/${entry.optionId}`;
    if (owned.has(key) || counted.has(key)) continue;
    counted.add(key);
    sum += lookup.get(key)?.option.annualCost ?? 0;
  }
  return sum;
}

/** 车中各类 kind 的件数（按去重后的真实条目计，解析不到的不计）。 */
export function cartKindCounts(
  cart: CartEntry[],
  pool: ShoppingItem[],
): { asset: number; consumer: number; experience: number } {
  const lookup = poolLookup(pool);
  const seen = new Set<string>();
  const counts = { asset: 0, consumer: 0, experience: 0 };
  for (const entry of cart) {
    const key = `${entry.dimension}/${entry.optionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = lookup.get(key)?.option.kind;
    if (kind === 'asset' || kind === 'consumer' || kind === 'experience') {
      counts[kind] += 1;
    }
  }
  return counts;
}

/**
 * 下一期账单预览：基线 + 加购，用既有 burdenStatus 算状态色（阈值常量来自
 * core，UI 不硬编码）。现金流沿用卡 A M2 口径（上一年成本固定），与
 * sim.astro 现有账单日横幅同一算法。
 */
export function cartBurdenSummary(
  cart: CartEntry[],
  pool: ShoppingItem[],
  baseline: CartEntry[],
  baselineAnnualCost: number,
  cashflow: number,
): CartBurdenSummary {
  const addedAnnualCost = cartAddedAnnualCost(cart, pool, baseline);
  const totalAnnualCost = baselineAnnualCost + addedAnnualCost;
  const { rate, status } = burdenStatus(totalAnnualCost, cashflow);
  const counts = cartKindCounts(cart, pool);
  return {
    addedAnnualCost,
    totalAnnualCost,
    cashflow,
    rate,
    status,
    assetCount: counts.asset,
    experienceCount: counts.experience,
    ratioHint: counts.asset > counts.experience,
  };
}

/**
 * 纯体验项（M3 · m3-task-breakdown.md §2 S1 点名要补的 2–3 项）。
 * 不进 core catalog，只在购物池与后续购物区出现：`kind:'experience'`、
 * `resellable:false`、无持有情绪，`annualCost` = 每年体验一次的花费，
 * 金额口径写在 `note` 里。每项的价格与页面归属均已人工核验。
 */
const EXPERIENCE_ITEMS: { dimension: string; option: CatalogOption }[] = [
  {
    dimension: 'travel',
    option: {
      id: 'exp-private-jet-world-tour',
      label: '私人喷气飞机环球之旅（26 天）',
      annualCost: 189_500,
      source:
        'https://www.abercrombiekent.com/journeys/private-jet-journeys/wild-wonders-around-the-world-by-private-jet',
      note: 'Abercrombie & Kent 官网该行程 lowestPrices：2027 团期、26 天 10 个目的地，每人 $189,500（双人占房；单人单房差另计）。此处按每年一次、每人计价。',
      kind: 'experience',
      joy: 5,
      resellable: false,
    },
  },
  {
    dimension: 'flexibility',
    option: {
      id: 'exp-met-gala-ticket',
      label: 'Met Gala 慈善晚宴单张门票',
      annualCost: 100_000,
      source: 'https://www.cbsnews.com/news/how-much-met-gala-ticket-2026/',
      note: 'CBS News 援引《纽约时报》：2026 年 Met Gala 单张票价 $100,000（2025 年为 $75,000，桌位约 $350,000）。此处按每年一次、单张票计价。',
      kind: 'experience',
      joy: 4,
      resellable: false,
    },
  },
];

/* ── 领钱入口（S4 · homepage-claim-experience.md §7 P1）── */

/**
 * 虚拟起始金。§9 #1 的「固定 $1M vs 三档」未拍板，P1 取固定档：三档把
 * "不够"变成可对比的梯度，但它同时多一个决策点，而在没有读数的情况下
 * 无法判断这对转化是加分还是分散。翻转条件见该节。
 */
export const SIM_STARTING_CAPITAL = 1_000_000;

/** 每个维度取最贵的一项 = 「全顶档生活」。金额由目录求和，这里不含它的字面量。 */
export function topTierChoices(catalog: Catalog): LifeChoice {
  return catalog.dimensions.map((dimension) => {
    const top = dimension.options.reduce((best, option) =>
      option.annualCost > best.annualCost ? option : best,
    );
    return { dimension: dimension.id, optionId: top.id };
  });
}

/**
 * 第二拍的主句：一笔本金按给定的提取率，一年能产出多少（$1M × 4% = $40,000）。
 * 提取率来自假设对象，不在本模块写死。
 */
export function annualDrawdown(capital: number, assumptions: Assumptions): number {
  return capital * assumptions.withdrawalRate;
}

export type ClaimBillRow = { label: string; annualCost: number; source?: string };

/**
 * 第二拍的三行真实账单（§4）：豪宅的税和维护、私人飞机年运营、全顶档生活。
 * 金额与来源链接全部取自目录，UI 层不复制任何数字。
 */
export function claimBillRows(catalog: Catalog, assumptions: Assumptions): ClaimBillRow[] {
  const picks: LifeChoice = [
    { dimension: 'living', optionId: 'luxury-mansion' },
    { dimension: 'transport', optionId: 'private-jet' },
  ];
  const bills = cardBills(picks, catalog).map((bill) => ({
    label: bill.optionLabel,
    annualCost: bill.annualCost,
    source: bill.source,
  }));
  return [
    ...bills,
    {
      label: '全顶档生活（每个维度都选最贵）',
      annualCost: cardAnnualCost(topTierChoices(catalog), catalog, assumptions),
    },
  ];
}

/**
 * 一笔本金能撑多久 = 本金 ÷ 年成本，纯除法（与 §2「$1M 只够顶档生活约 7 周」
 * 同一口径）：不含收益率、不含复利，所以它是一句算术陈述而不是推演。
 *
 * P1 的 SIM 态不走 `project` 是有原因的，不是偷懒：SIM 态没有收入，
 * `project` 会一律返回 `no-net-savings`，此时的年限数字是假的。§9 #2 决定
 * 不编造 SIM 收入，所以在有收入的切片出现之前，这一屏只用纯除法说话。
 */
export function runwayMonths(capital: number, annualCost: number): number | null {
  if (!(capital > 0) || !(annualCost > 0)) return null;
  return capital / (annualCost / 12);
}

/**
 * 展示取整只发生在这里，与换算条同一套口吻：不足一年说月数，
 * 因为「0.0 年」既没有信息又显得假。
 */
export function formatRunway(months: number): string {
  if (months < 12) return `${months.toFixed(1)} 个月`;
  const years = months / 12;
  const digits = years >= 100 ? Math.round(years).toLocaleString('en-US') : years.toFixed(1);
  return `${digits.endsWith('.0') ? digits.slice(0, -2) : digits} 年`;
}
