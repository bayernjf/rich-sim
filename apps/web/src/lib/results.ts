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
  Goal,
  LifeChoice,
  Milestone,
  Projection,
} from '@rich-sim/core';
import type { Draft } from './draft';
import type { Locale } from './i18n';
import { t } from './messages';
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
      /** 本次测算实际使用的目标（够用线或净资产，T0-3 口径切换）。 */
      goal: Goal;
      /** 本次测算使用的汇率快照（进假设清单展示）。 */
      fx: FxSnapshot;
      /** 目标来源：普通设计器为 undefined；S4 购物车桥为 'sim-cart'。 */
      goalFrom?: 'sim-cart';
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
 * T0-3 · 目标口径：净资产目标存在且合法时用 `{ kind: 'net-worth' }`，
 * 否则够用线（value = 换算后的理想生活年成本）。非法 goal
 * （NaN / 非正数）静默回退够用线——与 goalOverride 同一套收敛纪律。
 */
export function goalFor(draft: Draft, annualCostLocal: number): Goal {
  return draft.goal &&
    draft.goal.kind === 'net-worth' &&
    Number.isFinite(draft.goal.value) &&
    draft.goal.value > 0
    ? draft.goal
    : { kind: 'enough-line', value: annualCostLocal };
}

/**
 * computeResults(draft, catalog) — 由本机方案 + Catalog 算结构化结果。
 * profile 缺失 -> { status: 'no-profile' }（UI 引导先录财务）。
 */
export function computeResults(
  draft: Draft,
  catalog: Catalog,
  locale: Locale = 'zh',
): Results {
  const assumptions = draft.assumptions ?? DEFAULT_ASSUMPTIONS;
  const profile = draft.profile;
  if (!profile) return { status: 'no-profile' };

  const choices =
    draft.choices && draft.choices.length > 0
      ? draft.choices
      : buildDefaultChoices(catalog);

  // Catalog 以 USD 建模 -> 理想生活年成本（USD）-> 换算到录入币种。
  // S4 桥（G4 方案 a）：有 goalOverride 时目标年成本直接取购物车合计，
  // 不经过逐维 choices 求和（购物车允许同维多件，LifeChoice 装不下）。
  // choices 仍保留「每维最贵项」作展示回显，计算口径以 override 为准。
  const override =
    draft.goalOverride &&
    draft.goalOverride.from === 'sim-cart' &&
    Number.isFinite(draft.goalOverride.annualCost)
      ? draft.goalOverride
      : undefined;
  const annualCostUSD = override
    ? override.annualCost
    : scenarioAnnualCost(choices, catalog, assumptions).annualCost;
  const annualCostLocal = convert(annualCostUSD, 'USD', profile.currency, assumptions.fx);

  const goal = goalFor(draft, annualCostLocal);
  const enough = enoughLine(annualCostLocal, assumptions);
  const projection = project(profile, goal, assumptions);
  const gapResult = gap(profile, goal, assumptions);
  const milestones = buildMilestones(profile, goal, assumptions);
  const savingsRate =
    projection.status === 'no-net-savings' ? null : projection.savingsRate;

  // S3 换算条：对象是整份理想生活（不是某个单项），分母是用户自己的年净储蓄。
  const converter = converterForItem(
    {
      label: t(override ? 'converter.cartLife' : 'converter.lifeTotal', locale),
      annualCostUSD,
    },
    profile,
    assumptions.fx,
    (local, c) =>
      local.toLocaleString('en-US', {
        style: 'currency',
        currency: c,
        maximumFractionDigits: 0,
      }),
    locale,
  );

  return {
    status: 'ok',
    annualCostLocal,
    enoughLine: enough,
    goal,
    projection,
    gapResult,
    milestones,
    savingsRate,
    currency: draft.currency,
    fx: assumptions.fx,
    converter,
    goalFrom: override?.from,
  };
}
