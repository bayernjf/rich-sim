import type { Assumptions, Catalog, LifeChoice } from '@rich-sim/core';
import { scenarioAnnualCost } from '@rich-sim/core';

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

export function cardAnnualCost(
  choices: LifeChoice,
  catalog: Catalog,
  assumptions: Assumptions,
): number {
  return scenarioAnnualCost(choices, catalog, assumptions).annualCost;
}
