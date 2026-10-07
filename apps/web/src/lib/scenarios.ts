import type { Catalog, Profile, Projection } from '@rich-sim/core';
import type { Draft } from './draft';
import type { Locale } from './i18n';
import { computeResults, type Results } from './results';

/**
 * M4 S1 · F7 多情景推演（apps/web，纯函数层、无副作用、可单测）。
 *
 * 做法：**不新造公式**——把改过的 `Profile` 再喂一遍既有的 `computeResults()`，
 * 展示与基线的差值。四种情景里只有「大额支出」动 `savings`（一次性支出，
 * 不是月度开支），其余都动 `income`，所以 `Profile` 的形状不变
 * （`m4-task-breakdown.md` §0 G5 = 零契约改动）。
 *
 * 幅度只是起点、可改，**不得呈现为对用户的预测**（§1 规则 1）。
 */

export type ScenarioId = 'raise' | 'side' | 'jobless' | 'big-expense';

export type Scenario = {
  id: ScenarioId;
  /**
   * 幅度。含义随 id 而变：`raise` = 涨幅百分比、`side` = 月增收额、
   * `big-expense` = 一次性支出额；`jobless` 不用（收入直接归零）。
   */
  value?: number;
};

/** 建议默认幅度（原型后可回调）；`jobless` 无幅度。 */
export const SCENARIO_DEFAULTS: Record<ScenarioId, number | null> = {
  raise: 10,
  side: 500,
  jobless: null,
  'big-expense': 20_000,
};

/** 展示顺序。 */
export const SCENARIO_IDS: readonly ScenarioId[] = [
  'raise',
  'side',
  'jobless',
  'big-expense',
] as const;

/**
 * 幅度收敛：非有限值（NaN / Infinity）与负数一律记 0。
 * 纯函数层不假设调用方已经校验过输入（与 `sim-draft` 的坏数据收敛同一纪律）。
 */
function magnitude(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** 把情景作用到 `Profile` 上，返回**新的** Profile（不改原对象）。 */
export function applyScenario(profile: Profile, scenario: Scenario): Profile {
  switch (scenario.id) {
    case 'raise':
      return { ...profile, income: profile.income * (1 + magnitude(scenario.value) / 100) };
    case 'side':
      return { ...profile, income: profile.income + magnitude(scenario.value) };
    case 'jobless':
      return { ...profile, income: 0 };
    case 'big-expense':
      return { ...profile, savings: profile.savings - magnitude(scenario.value) };
  }
}

export type ScenarioOutcome = {
  id: ScenarioId;
  value: number | null;
  /** 与基线的年限差；任一侧不可比（不可达 / 无净储蓄 / 无 profile）时为 null。 */
  yearsDelta: number | null;
  /** 投影状态是否相对基线改变。 */
  statusChanged: boolean;
  /** 该情景下的完整结果，供 UI 取状态、差距与假设。 */
  results: Results;
};

export type ScenarioComparison = {
  baseline: Results;
  outcomes: ScenarioOutcome[];
};

/** 投影状态；无 profile 时用 'no-profile' 参与比较。 */
function projectionStatus(results: Results): Projection['status'] | 'no-profile' {
  return results.status === 'ok' ? results.projection.status : 'no-profile';
}

/** 只有 reachable 才有「年限」可比；其余返回 null。 */
function yearsOf(results: Results): number | null {
  if (results.status !== 'ok') return null;
  return results.projection.status === 'reachable' ? results.projection.years : null;
}

function yearsDelta(baseline: Results, scenario: Results): number | null {
  const before = yearsOf(baseline);
  const after = yearsOf(scenario);
  return before === null || after === null ? null : after - before;
}

/**
 * 跑一遍基线，再对每个情景各跑一遍 `computeResults`，返回基线与逐条差值。
 * 空数组时 `outcomes` 为空，`baseline` 仍照常返回。
 */
export function compareScenarios(
  draft: Draft,
  catalog: Catalog,
  locale: Locale,
  scenarios: Scenario[],
): ScenarioComparison {
  const baseline = computeResults(draft, catalog, locale);

  const outcomes = scenarios.map((scenario) => {
    const profile = draft.profile ? applyScenario(draft.profile, scenario) : null;
    const results = computeResults({ ...draft, profile }, catalog, locale);
    return {
      id: scenario.id,
      value: scenario.value ?? null,
      yearsDelta: yearsDelta(baseline, results),
      statusChanged: projectionStatus(baseline) !== projectionStatus(results),
      results,
    };
  });

  return { baseline, outcomes };
}
