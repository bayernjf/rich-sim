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
