import type { Assumptions, Catalog, LifeChoice } from '@rich-sim/core';
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
