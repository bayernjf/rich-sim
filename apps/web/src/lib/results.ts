import {
  buildMilestones,
  convert,
  enoughLine,
  gap,
  project,
  scenarioAnnualCost,
} from '@rich-sim/core';
import type {
  Catalog,
  Currency,
  FxSnapshot,
  LifeChoice,
  Milestone,
  Projection,
} from '@rich-sim/core';
import type { Draft } from './draft';
import type { ConverterStatus } from './converter';
import { converterForItem } from './converter';
import { DEFAULT_ASSUMPTIONS } from './defaults';

/**
 * T08 · 测算结果纯函数层（apps/web，无副作用、可单测）。
 *
 * 口径（冻结，见 CONVENTIONS.md「引擎公式口径」「币种口径」）：
 * - Catalog 以 USD 建模；理想生活年成本必须先 convert 到录入币种
 *   （= draft.profile.currency，按契约恒等于展示本位币 draft.currency）。
 * - 目标固定为 enough-line：value = 换算后的理想生活年成本；
 *   目标本金 = value / withdrawalRate（由 core project 内部完成）。
 * - choices 缺省（空/缺失）时取每维 isDefault，否则第一项。
 * - assumptions 缺省时取 DEFAULT_ASSUMPTIONS（冻结）。
 * - 三状态（reachable / unreachable / no-net-savings）是一等状态，
 *   由 projection 原样携带，UI 层不做错误分支处理。
 */

/** 有 profile 时的结构化结果；no-profile 时 UI 走空态引导。 */
export type Results =
  | { status: 'no-profile' }
  | {
      status: 'ok';
      /** 理想生活年成本（录入/展示币种口径）。 */
      annualCostLocal: number;
      /** 够用线 = annualCostLocal / withdrawalRate。 */
      enoughLine: number;
      /** 三状态投影（一等状态）。 */
      projection: Projection;
      /** 差距：达到 30 年目标所需年储蓄缺口 + 当前速度所需年限。 */
      gapResult: { annualGap: number; yearsAtCurrentPace: number };
      /** 阶梯目标（≥3 阶段，数值来自用户自身数据）。 */
      milestones: Milestone[];
      /** 储蓄率 = 月净储蓄 / 月收入；no-net-savings 时为 null。 */
      savingsRate: number | null;
      /** 展示本位币。 */
      currency: Currency;
      /** 本次测算使用的汇率快照（进假设清单展示）。 */
      fx: FxSnapshot;
      /**
       * S3 换算条（轻量口径）：整份理想生活的一年 = 你要存多久。
       * 只在展示层存在，不进 draft。
       */
      converter: { sentence: string; status: ConverterStatus };
    };

/** 为每个维度生成默认选择：优先 isDefault，否则第一项。 */
export function buildDefaultChoices(catalog: Catalog): LifeChoice {
  return catalog.dimensions.map((d) => {
    const chosen = d.options.find((o) => o.isDefault) ?? d.options[0];
    return { dimension: d.id, optionId: chosen.id };
  });
}

/**
 * computeResults(draft, catalog) — 由本机方案 + Catalog 算结构化结果。
 * profile 缺失 -> { status: 'no-profile' }（UI 引导先录财务）。
 */
export function computeResults(draft: Draft, catalog: Catalog): Results {
  const assumptions = draft.assumptions ?? DEFAULT_ASSUMPTIONS;
  const profile = draft.profile;
  if (!profile) return { status: 'no-profile' };

  const choices =
    draft.choices && draft.choices.length > 0
      ? draft.choices
      : buildDefaultChoices(catalog);

  // Catalog 以 USD 建模 -> 理想生活年成本（USD）-> 换算到录入币种。
  const annualCostUSD = scenarioAnnualCost(choices, catalog, assumptions).annualCost;
  const annualCostLocal = convert(annualCostUSD, 'USD', profile.currency, assumptions.fx);

  const goal = { kind: 'enough-line', value: annualCostLocal } as const;
  const enough = enoughLine(annualCostLocal, assumptions);
  const projection = project(profile, goal, assumptions);
  const gapResult = gap(profile, goal, assumptions);
  const milestones = buildMilestones(profile, goal, assumptions);
  const savingsRate =
    projection.status === 'no-net-savings' ? null : projection.savingsRate;

  // S3 换算条：对象是整份理想生活（不是某个单项），分母是用户自己的年净储蓄。
  const converter = converterForItem(
    { label: '你选的这种生活', annualCostUSD },
    profile,
    assumptions.fx,
    (local, c) =>
      local.toLocaleString('en-US', {
        style: 'currency',
        currency: c,
        maximumFractionDigits: 0,
      }),
  );

  return {
    status: 'ok',
    annualCostLocal,
    enoughLine: enough,
    projection,
    gapResult,
    milestones,
    savingsRate,
    currency: draft.currency,
    fx: assumptions.fx,
    converter,
  };
}
