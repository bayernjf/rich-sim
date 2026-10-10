import type { Assumptions, Catalog, CatalogOption, LifeChoice } from '@rich-sim/core';
import {
  burdenStatus,
  dimensionLabel as coreDimensionLabel,
  optionLabel as coreOptionLabel,
  scenarioAnnualCost,
} from '@rich-sim/core';
import type { Locale } from './i18n';
import { t } from './messages';

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
  /** 卡片的英文呈现（i18n 切片 内容层）。sim-l10n.test.ts 要求每张卡三样都有。 */
  labelEn: string;
  subtitleEn: string;
  fictionNoticeEn: string;
  assetStructureEn: string[];
};

export const CARD_A = {
  id: 'card-a',
  label: '科技独角兽创始人',
  subtitle: '新钱 · 高消费，愿为体验和地位付费，防御性配置弱。',
  fictionNotice: '虚构角色，不代表任何真实人物；资产结构为示意，不代表真实持仓。',
  labelEn: 'Tech unicorn founder',
  subtitleEn:
    'New money · high spending, happy to pay for experience and status, defensively positioned.',
  fictionNoticeEn:
    'A fictional character, not any real person; the asset mix is illustrative, not real holdings.',
  assetStructure: [
    { label: '公司股权', share: 77.5 },
    { label: '现金 / 债券 / 不动产', share: 22.5 },
  ],
  assetStructureEn: ['Company equity', 'Cash / bonds / property'],
  choices: [
    { dimension: 'living', optionId: 'luxury-mansion' },
    { dimension: 'transport', optionId: 'private-jet' },
    { dimension: 'transport', optionId: 'exotic-car' },
    { dimension: 'flexibility', optionId: 'discretionary-large' },
    { dimension: 'health-insurance', optionId: 'concierge-medical' },
    { dimension: 'dining-daily', optionId: 'fine-dining' },
  ],
} as const satisfies SimCard;

/**
 * 卡 B · 家族企业继承人（§4.4，老钱 / 低调 × 传承）。
 *
 * 刻意**不持有**私人飞机 / 游艇：与卡 A 形成「同为超高净值、年成本压力完全不同」
 * 的对照——卡 A 基态负担率 78%（黄），卡 B 只有约 5%（绿），同一套 4% 现金流
 * 口径下，新钱在烧钱、老钱在守现金流，这就是这张卡要教的一课。
 * 年成本画像（catalog 直接加总）：独栋豪宅 120,000 + 城市公寓 27,000 +
 * 精英寄宿 / 国际学校 100,000 + 家庭商业医保 10,000 + 高档餐饮 / 社交 30,000 +
 * 大额弹性（管家 / 慈善 / 俱乐部）120,000 = **407,000 / 年**。
 */
export const CARD_B = {
  id: 'card-b',
  label: '家族企业继承人',
  subtitle: '老钱 · 低调重传承，防御性配置，社交与慈善是工作而非炫耀。',
  fictionNotice: '虚构角色，不代表任何真实人物；资产结构为示意，不代表真实持仓。',
  labelEn: 'Family-business heir',
  subtitleEn:
    'Old money · low-key and inheritance-focused, defensively positioned; socializing and philanthropy are work, not showing off.',
  fictionNoticeEn:
    'A fictional character, not any real person; the asset mix is illustrative, not real holdings.',
  assetStructure: [
    { label: '家族信托与企业股权', share: 65 },
    { label: '不动产', share: 20 },
    { label: '现金 / 债券', share: 15 },
  ],
  assetStructureEn: ['Family trust & business equity', 'Real estate', 'Cash / bonds'],
  choices: [
    { dimension: 'living', optionId: 'luxury-mansion' },
    { dimension: 'living', optionId: 'owner-condo' },
    { dimension: 'family', optionId: 'elite-education' },
    { dimension: 'health-insurance', optionId: 'family-insurance' },
    { dimension: 'dining-daily', optionId: 'fine-dining' },
    { dimension: 'flexibility', optionId: 'discretionary-large' },
  ],
} as const satisfies SimCard;

/** 全部身份卡（顺序即切换器顺序）。 */
export const SIM_CARDS = [CARD_A, CARD_B] as const;

/** 卡 B 同款现金流参数（§4.4 量级区间下限 $200M × 4% 安全提取率，与卡 A 同一口径）。 */
export const CARD_B_ANNUAL_INCOME = 8_000_000;
/** 卡 B 上一年已承担的持有成本 = 基态年成本 407,000。 */
export const CARD_B_LAST_YEAR_COST = 407_000;

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
// §2.4 参数 2（BILLS_PER_PAGE = 4）与参数 4（变卖回收率 75%）已参数化进
// @rich-sim/core（resaleRecovery / RESALE_RECOVERY_RATE），UI 不再持有副本——
// 账单日与商城共用同一个命名常量，避免两处静默漂移。

/**
 * 卡片文案按语言取。缺英文字段时退回中文而不是抛错或返回空——
 * 「虚构角色」那条标注是合规文本，宁可不翻也不能不出现在页面上。
 * 每个字段都有是 sim-l10n.test.ts 的职责。
 */
export function cardView(card: SimCard, locale: Locale): {
  label: string;
  subtitle: string;
  fictionNotice: string;
  assetStructure: { label: string; share: number }[];
} {
  const en = locale === 'en';
  return {
    label: en ? card.labelEn : card.label,
    subtitle: en ? card.subtitleEn : card.subtitle,
    fictionNotice: en ? card.fictionNoticeEn : card.fictionNotice,
    assetStructure: card.assetStructure.map((part, index) => ({
      label: en ? (card.assetStructureEn[index] ?? part.label) : part.label,
      share: part.share,
    })),
  };
}

/**
 * 经历通道 · 人生快进（§2.3）：收入与年成本不变，逐年累计结余。
 * 纯算术——不预测收入变化、不含通胀与税率；负值即累计亏空（现金流早已断裂）。
 */
export function fastForward(annualIncome: number, annualCost: number, years: number): number {
  return (annualIncome - annualCost) * years;
}

/**
 * 感受通道 · 失去模拟（§2.3 MVP 候选 3）：某一年收入腰斩，其余不变，
 * 用既有 burdenStatus 立刻重算负担率——「持有即风险」的反面教材。
 */
export function swanBurden(
  annualCost: number,
  annualIncome: number,
  lastYearCost: number,
): { rate: number | null; status: 'green' | 'yellow' | 'red' } {
  const cashflow = annualIncome / 2 - lastYearCost;
  const { rate, status } = burdenStatus(annualCost, cashflow);
  return { rate, status };
}

/**
 * 三个纯体验项刻意不进 core catalog（那边有每维 3–5 项、维内递增等契约），
 * 所以它们的英文名也只能在这一侧——同样由 sim-l10n.test.ts 穷尽性钉住。
 */
export const EXPERIENCE_LABELS_EN: Record<string, string> = {
  'exp-private-jet-world-tour': 'Private-jet world tour (26 days)',
  'exp-met-gala-ticket': 'Met Gala charity gala, one seat',
  'exp-hire-ceo': 'Hire an S&P 500-level CEO (annual comp)',
};

export function experienceLabel(option: CatalogOption, locale: Locale): string {
  return locale === 'en' ? (EXPERIENCE_LABELS_EN[option.id] ?? option.label) : option.label;
}

/**
 * 购物池里的名字：先查体验项表，再退回 core 的目录表（目录项走 CATALOG_LABELS_EN，
 * 未知 id 一律退回中文原文）。购物池是两种来源拼起来的，视图不该各自判一遍。
 *
 * `extraLabelsEn` 给第三类来源（拟物衣柜，见 sim-wardrobe）用：它的英文词典在
 * 自己模块里、不进 core 也不进体验表，由上层（MallArea）合并 allItems 时传入。
 */
export function poolOptionLabel(
  option: CatalogOption,
  locale: Locale,
  extraLabelsEn?: Record<string, string>,
): string {
  if (locale === 'en') {
    return (
      EXPERIENCE_LABELS_EN[option.id] ??
      extraLabelsEn?.[option.id] ??
      coreOptionLabel(option, 'en') ??
      option.label
    );
  }
  return option.label;
}

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
  locale: Locale = 'zh',
): Bill[] {
  return choices
    .map((choice) => {
      const dimension = catalog.dimensions.find((d) => d.id === choice.dimension);
      const option = dimension?.options.find((o) => o.id === choice.optionId);
      return {
        dimensionLabel: dimension ? coreDimensionLabel(dimension, locale) : choice.dimension,
        optionLabel: option ? coreOptionLabel(option, locale) : choice.optionId,
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
  /** 现金流口径默认卡 A；卡 B（及以后的卡）必须显式传自己的收入与上一年成本。 */
  cashflowParams: { annualIncome: number; lastYearCost: number } = {
    annualIncome: CARD_A_ANNUAL_INCOME,
    lastYearCost: CARD_A_LAST_YEAR_COST,
  },
) {
  const annualCost = scenarioAnnualCost(choices, catalog, assumptions).annualCost;
  const cashflow = cashflowParams.annualIncome - cashflowParams.lastYearCost;
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
 * 车中新增年成本按品类拆桶（年度账单饼图用）。口径与 `cartAddedAnnualCost`
 * **逐位一致**：基线已含项不重复计、同项幂等去重、解析不到计 0；三个桶之和
 * 必然等于 `cartAddedAnnualCost(cart, pool, baseline)`，由单测钉住。
 */
export function cartKindCosts(
  cart: CartEntry[],
  pool: ShoppingItem[],
  baseline: CartEntry[] = [],
): { asset: number; consumer: number; experience: number } {
  const lookup = poolLookup(pool);
  const owned = new Set(baseline.map((entry) => `${entry.dimension}/${entry.optionId}`));
  const counted = new Set<string>();
  const costs = { asset: 0, consumer: 0, experience: 0 };
  for (const entry of cart) {
    const key = `${entry.dimension}/${entry.optionId}`;
    if (owned.has(key) || counted.has(key)) continue;
    counted.add(key);
    const kind = lookup.get(key)?.option.kind;
    if (kind === 'asset' || kind === 'consumer' || kind === 'experience') {
      costs[kind] += lookup.get(key)!.option.annualCost;
    }
  }
  return costs;
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
  {
    dimension: 'flexibility',
    option: {
      id: 'exp-hire-ceo',
      label: '任命一位标普 500 级别 CEO（年薪酬）',
      annualCost: 16_500_000,
      source: 'https://www.prnewswire.com/news-releases/report-women-ceos-outearn-men-and-companies-increase-ceo-security-packages-302621526.html',
      note: 'Equilar 2025 报告（PR Newswire 引述）：标普 500 CEO 中位总薪酬 $16.5M（同比 +7%，含股权授予面值）。此处按每年付一份中位薪酬的口径；教学点：一位顶级 CEO 的年薪高于卡 A / 卡 B 的可支配现金流——「雇一个比你更贵的人」。',
      kind: 'experience',
      joy: 3,
      resellable: false,
    },
  },
];

/* ── 一次性特权价签（C-1 · 2026-10-10）── */

/**
 * 一次性特权价签：金额是一次性承诺、不是年成本——**不进购物池**（不参与
 * 年账单 / 一键成目标），只在特权价目通道（地位）里作为「单次价签」展示，
 * 与购物池里「每年一次」的体验项口径分开。教学点：有些特权根本没有年账单，
 * 它们是一次性把一大笔钱交出去换一个名字。
 */
export type OneoffPerk = {
  id: string;
  label: { zh: string; en: string };
  /** 单次金额（一次性承诺，非年成本）。 */
  amount: number;
  source: string;
  note: { zh: string; en: string };
};

export const ONEOFF_PERKS: OneoffPerk[] = [
  {
    id: 'perk-building-naming',
    label: {
      zh: '捐赠冠名一所商学院楼（一次性）',
      en: 'Name a business-school building (one-time)',
    },
    amount: 42_000_000,
    source:
      'https://www.purdue.edu/newsroom/2026/Q4/longtime-purdue-benefactor-parrish-commits-42m-to-name-new-daniels-school-building/',
    note: {
      zh: '普渡大学 2026 年 10 月新闻：校友 Roland G. Parrish 承诺 $42M 命名商学院新主楼（Roland G. Parrish Hall of Business，2027 秋启用）。一次性捐赠承诺、不是年成本——此处按单次价签展示，不进购物车与账单。',
      en: 'Purdue University (Oct 2026): alumnus Roland G. Parrish committed $42M to name the new Daniels School of Business flagship (Roland G. Parrish Hall of Business, opening fall 2027). A one-time commitment, not an annual cost - shown as a one-time price tag, never added to cart or bills.',
    },
  },
];

/* ── 领钱入口（S4 · homepage-claim-experience.md §7 P1）── */

/**
 * 虚拟起始金。~~§9 #1 的「固定 $1M vs 三档」未拍板，P1 取固定档~~
 * **2026-10-08 发起人拍板走三档**：$100K / $1M / $10M 把"不够"变成可对比的
 * 梯度（$10M × 4% = $40 万/年，仍盖不住全顶档 $7M）。`claim:tap` 埋点带
 * capital，读数出来后可评估哪档被点得最多。
 */
export const SIM_CAPITAL_TIERS = [100_000, 1_000_000, 10_000_000] as const;

/** 兼容默认档（中间档）：SSR 降级链接与 sim 页 ?claim=1 无 capital 参数时用。 */
export const SIM_STARTING_CAPITAL = SIM_CAPITAL_TIERS[1];

/** 校验一个 URL 参数来的本金：只接受三档之一，其余回退默认档。 */
export function capitalFromParam(raw: string | null): number {
  const value = Number(raw);
  return (SIM_CAPITAL_TIERS as readonly number[]).includes(value) ? value : SIM_STARTING_CAPITAL;
}

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
export function claimBillRows(
  catalog: Catalog,
  assumptions: Assumptions,
  locale: Locale = 'zh',
): ClaimBillRow[] {
  const picks: LifeChoice = [
    { dimension: 'living', optionId: 'luxury-mansion' },
    { dimension: 'transport', optionId: 'private-jet' },
  ];
  const bills = cardBills(picks, catalog, locale).map((bill) => ({
    label: bill.optionLabel,
    annualCost: bill.annualCost,
    source: bill.source,
  }));
  return [
    ...bills,
    {
      label: t('claim.topTier', locale),
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
export function formatRunway(months: number, locale: 'zh' | 'en' = 'zh'): string {
  const unit = (n: string, kind: 'month' | 'year') =>
    locale === 'en' ? `${n} ${kind}${n === '1' ? '' : 's'}` : `${n} ${kind === 'month' ? '个月' : '年'}`;
  if (months < 12) return unit(months.toFixed(1), 'month');
  const years = months / 12;
  const digits = years >= 100 ? Math.round(years).toLocaleString('en-US') : years.toFixed(1);
  return unit(digits.endsWith('.0') ? digits.slice(0, -2) : digits, 'year');
}

/* ── 操作通道（T3 · simulation-gameplay §2.3 剩余：收购谈判 / 加杠杆）── */

/**
 * 操作通道的**示意参数**（教学假设，不是来源数据）——与 `CARD_A_ANNUAL_INCOME`
 * 同一纪律：注释写清口径、UI 显式标「示意」，不冒充真实报价或建议。
 * - `LEVERAGE_MULTIPLE`：可借规模 = 可支配现金流 × 2（示意：银行对高净值客户
 *   的常见杠杆额度量级，不是任何机构的真实条款）。
 * - `ACQUISITION_MULTIPLE`：收购估值 = 标的年营收 × 6（示意：私人市场并购
 *   常见收入倍数量级，非真实定价）。
 * - `DEAL_RATE`：杠杆/收购共用的年化利息率 5%（示意）。
 */
export const LEVERAGE_MULTIPLE = 2;
export const ACQUISITION_MULTIPLE = 6;
export const DEAL_RATE = 0.05;

export type LeverageDeal = {
  /** 可借规模 = 现金流 × 杠杆倍数（示意）。 */
  borrow: number;
  /** 年利息 = 可借规模 × 示意利率。 */
  interest: number;
  /** 年成本 + 年利息（新的下一年账单）。 */
  totalCost: number;
  rate: number | null;
  status: 'green' | 'yellow' | 'red';
  /** 负担率推到 100% 的临界杠杆倍数——超过它利息就吃光现金流（null = 已断裂）。 */
  breakMultiple: number | null;
};

/**
 * 加杠杆：借 cashflow × 2，利息按 5% 年化，把年利息加进年成本后重算负担率。
 * 教育点：杠杆放大的是「能借多少」的掌控感，同时放大「每年利息」的账单——
 * 临界倍数算出来给用户看：超过它，现金流就断裂。
 * 纯算术，不产 NaN：非法输入（成本/现金流非正）返回可渲染的空结果。
 */
export function leverageDeal(annualCost: number, cashflow: number): LeverageDeal {
  const empty = (): LeverageDeal => ({
    borrow: 0,
    interest: 0,
    totalCost: annualCost,
    rate: null,
    status: 'green',
    breakMultiple: null,
  });
  if (!(annualCost > 0) || !(cashflow > 0)) return empty();
  const borrow = cashflow * LEVERAGE_MULTIPLE;
  const interest = borrow * DEAL_RATE;
  const totalCost = annualCost + interest;
  const { rate, status } = burdenStatus(totalCost, cashflow);
  // 负担率 ≤ 1 ⇔ annualCost + cashflow·m·r ≤ cashflow ⇔ m ≤ (cashflow − annualCost)/(cashflow·r)
  const breakMultiple =
    cashflow > annualCost ? (cashflow - annualCost) / (cashflow * DEAL_RATE) : null;
  return { borrow, interest, totalCost, rate, status, breakMultiple };
}

export type AcquisitionDeal = {
  /** 标的年营收（示意：按卡片年收入）。 */
  revenue: number;
  /** 估值 = 年营收 × 6（示意）。 */
  valuation: number;
  /** 全杠杆收购的年利息 = 估值 × 5%（示意）。 */
  interest: number;
  totalCost: number;
  rate: number | null;
  status: 'green' | 'yellow' | 'red';
  /** 负担率 ≤ 100% 的估值倍数上限——谈判价砍到它以内才不断裂（null = 已断裂）。 */
  breakMultiple: number | null;
};

/**
 * 收购谈判：标的年营收按卡片年收入（示意），全杠杆收购，估值 × 5% 的年利息
 * 加进年成本重算负担率。教育点：收购价每高一个倍数，年利息账单就涨一段；
 * 临界倍数就是「谈判底价」——超过它，这笔收购把现金流吃断。
 */
export function acquisitionDeal(
  annualIncome: number,
  annualCost: number,
  cashflow: number,
): AcquisitionDeal {
  const empty = (): AcquisitionDeal => ({
    revenue: annualIncome,
    valuation: 0,
    interest: 0,
    totalCost: annualCost,
    rate: null,
    status: 'green',
    breakMultiple: null,
  });
  if (!(annualIncome > 0) || !(annualCost > 0) || !(cashflow > 0)) return empty();
  const revenue = annualIncome;
  const valuation = revenue * ACQUISITION_MULTIPLE;
  const interest = valuation * DEAL_RATE;
  const totalCost = annualCost + interest;
  const { rate, status } = burdenStatus(totalCost, cashflow);
  // 负担率 ≤ 1 ⇔ annualCost + revenue·m·r ≤ cashflow ⇔ m ≤ (cashflow − annualCost)/(revenue·r)
  const breakMultiple =
    cashflow > annualCost ? (cashflow - annualCost) / (revenue * DEAL_RATE) : null;
  return { revenue, valuation, interest, totalCost, rate, status, breakMultiple };
}

/* ── 剧情通道（T3 · §2.3 剩余：随机事件——危机 / 诉讼 / 分产）── */

/**
 * 剧情通道的**示意参数**（教学假设，不是来源数据）：
 * - `PLOT_LAWSUIT_CASHFLOW_CUT`：诉讼一次性赔付 = 0.5 × 年现金流（示意），
 *   从现金出、当年现金流减半——「风险不是每年账单，是一次性掏空」。
 * - `PLOT_CRISIS_INCOME_CUT`：市场危机让股权收入缩水 30%（示意），
 *   其余不变——与 swan（收入腰斩 50%）区分幅度。
 * - `PLOT_SPLIT_CASHFLOW_CUT`：家庭分产让可支配现金流永久减半（示意）——
 *   内部安排，不是外部黑天鹅。
 */
export const PLOT_LAWSUIT_CASHFLOW_CUT = 0.5;
export const PLOT_CRISIS_INCOME_CUT = 0.3;
export const PLOT_SPLIT_CASHFLOW_CUT = 0.5;

export type PlotEventId = 'lawsuit' | 'crisis' | 'split';

export type PlotEvent = {
  id: PlotEventId;
  /** 事件后的可支配现金流（口径各异，见各自参数注释）。 */
  cashflow: number;
  rate: number | null;
  status: 'green' | 'yellow' | 'red';
};

/**
 * 三张黑天鹅卡：每张给出「若发生」后的负担率与状态，参数全部从卡片现有
 * 数值（收入 / 年成本 / 现金流）推导，本函数不写任何新的金额字面量。
 * 纯算术，不产 NaN；非法输入逐项回落空结果。
 */
export function plotEvents(
  annualIncome: number,
  annualCost: number,
  lastYearCost: number,
): PlotEvent[] {
  const build = (id: PlotEventId, cashflow: number): PlotEvent => {
    if (!(annualIncome > 0) || !(annualCost > 0) || !(lastYearCost > 0) || cashflow <= 0) {
      return { id, cashflow, rate: null, status: 'green' };
    }
    const { rate, status } = burdenStatus(annualCost, cashflow);
    return { id, cashflow, rate, status };
  };
  return [
    build('lawsuit', (annualIncome - lastYearCost) * (1 - PLOT_LAWSUIT_CASHFLOW_CUT)),
    build('crisis', annualIncome * (1 - PLOT_CRISIS_INCOME_CUT) - lastYearCost),
    build('split', (annualIncome - lastYearCost) * (1 - PLOT_SPLIT_CASHFLOW_CUT)),
  ];
}

/* ── C-2 家族传承剧本（2026-10-10，设计稿 simulation-gameplay §4.5 实现）── */

/**
 * 教学示意参数（**示意**，非任何真实人物/家族；每个数字都有可查证来源）：
 * - `taxableAssets` $100M：示意应税资产组合（设计稿 §4.5 定，非目录项、纯教学假设）。
 * - `exemption` $15M：2026 起联邦遗产/赠与税基本免税额（IRS：2025 为 $13.99M，
 *   One Big Beautiful Bill 后 2026 起 $15M、随通胀指数化）。
 * - `rate` 40%：超过免税额部分最高税率（Cornell LII 概述）。
 */
export const LEGACY_ASSUMPTIONS = {
  taxableAssets: 100_000_000,
  exemption: 15_000_000,
  rate: 0.4,
} as const;

export type LegacyBranchId = 'direct' | 'trust' | 'charity';

export type LegacyBranch = {
  id: LegacyBranchId;
  /** 一次性税单：直接继承 = 超过免税额部分 × 税率；信托 / 慈善示意为零。 */
  taxBill: number;
  /** 按当前可支配现金流付清税单所需年数；无税单或现金流非正为 null。 */
  paybackYears: number | null;
};

/**
 * 家族传承三分支的税单算术：纯函数、不产 NaN；非法输入逐项回落
 * （税单 0、年限 null），与全产品「非法输入不产 NaN」红线一致。
 */
export function legacyPlan(
  assets: number,
  exemption: number,
  rate: number,
  cashflow: number,
): LegacyBranch[] {
  if (
    !Number.isFinite(assets) ||
    !Number.isFinite(exemption) ||
    !Number.isFinite(rate) ||
    !Number.isFinite(cashflow)
  ) {
    return [
      { id: 'direct', taxBill: 0, paybackYears: null },
      { id: 'trust', taxBill: 0, paybackYears: null },
      { id: 'charity', taxBill: 0, paybackYears: null },
    ];
  }
  const directTax = Math.max(0, Math.max(0, assets - exemption) * rate);
  const payback = directTax > 0 && cashflow > 0 ? directTax / cashflow : null;
  return [
    { id: 'direct', taxBill: directTax, paybackYears: payback },
    { id: 'trust', taxBill: 0, paybackYears: null },
    { id: 'charity', taxBill: 0, paybackYears: null },
  ];
}
