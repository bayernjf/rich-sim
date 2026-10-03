/**
 * T02 · @rich-sim/core type contract — single source of truth.
 * Spec: rich-sim/docs/technical-design.md §4.1 (engine) / §4.2 (currency & fx).
 * This file is frozen once committed; changes go through the OrganizeAgent gate.
 */

/** Supported currencies (M1: 6). */
export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CNY' | 'HKD';

/** FX snapshot: 1 base = rates[c] of currency c. Part of Assumptions (versioned). */
export type FxSnapshot = {
  base: Currency;
  rates: Record<Currency, number>;
  /** Snapshot date, ISO (e.g. '2026-10-03'). */
  date: string;
  /** Data source, e.g. 'Frankfurter (ECB)' or 'static-snapshot'. */
  source: string;
  /** Snapshot version, for reproducibility. */
  version: string;
};

/** Current-finance profile, monthly granularity. */
export type Profile = {
  /** Monthly income. */
  income: number;
  /** Monthly expense. */
  expense: number;
  /** Current savings (absolute). */
  savings: number;
  /** Current debt (absolute). */
  debt: number;
  currency: Currency;
};

/**
 * Explicit assumptions — annual decimals (0.04 = 4%).
 * `assumptionsVersion` versions both formulas and assumption sets so
 * historical results stay reproducible.
 */
export type Assumptions = {
  /** Annual return rate on invested capital. */
  returnRate: number;
  /** Safe withdrawal rate used for the enough line. */
  withdrawalRate: number;
  /** Annual inflation. */
  inflation: number;
  assumptionsVersion: string;
  /** FX snapshot is part of the assumptions (spec §4.2). */
  fx: FxSnapshot;
};

/**
 * Goal for a projection.
 * - 'enough-line': value = ideal-life annual cost; target capital = value / withdrawalRate.
 * - 'net-worth':   value = target net worth directly.
 */
export type Goal =
  | { kind: 'enough-line'; value: number }
  | { kind: 'net-worth'; value: number };

/**
 * Projection result — three first-class states (reachable / unreachable /
 * no-net-savings), NOT an error branch.
 */
export type Projection =
  | { status: 'reachable'; years: number; savingsRate: number }
  | { status: 'unreachable'; savingsRate: number }
  | { status: 'no-net-savings' };

/** Ideal-life designer selections: one option per dimension. */
export type LifeChoice = { dimension: string; optionId: string }[];

/** Scenario annual cost, in the catalog's currency. */
export type ScenarioCost = {
  annualCost: number;
  /** dimensionId -> annual cost. */
  breakdown: Record<string, number>;
};

/** Staged goals (≥3 stages, values derived from the user's own profile). */
export type Milestone = {
  stage: number;
  goalValue: number;
  years: number;
  /** Chinese action item; explicitly an example path, not advice. */
  action: string;
};

/** Catalog option (content data lives in catalog-data.ts, T05). */
export type CatalogOption = {
  id: string;
  /** Chinese label. */
  label: string;
  /** Annual cost of this option, in Catalog.currency. */
  annualCost: number;
  /** Value source URL, or the literal marker 「待校准」 when unverified. */
  source?: string;
  note?: string;
  /** Designer default selection (exactly one per dimension is recommended). */
  isDefault?: boolean;
};

export type CatalogDimension = {
  id: string;
  label: string;
  options: CatalogOption[];
};

export type Catalog = {
  currency: Currency;
  dimensions: CatalogDimension[];
};

/*
 * T03 function contract (implemented in functions.ts by Agent A).
 *
 *   enoughLine(annualCost: number, a: Assumptions): number
 *     // annualCost / a.withdrawalRate   (40万 / 0.04 → 1000万)
 *
 *   scenarioAnnualCost(choices: LifeChoice, catalog: Catalog, a: Assumptions): ScenarioCost
 *     // sum of chosen option annual costs; breakdown by dimensionId.
 *     // M1: plain sum (inflation recorded in assumptions, not applied).
 *
 *   project(p: Profile, goal: Goal, a: Assumptions): Projection
 *     // starting capital = p.savings - p.debt; annual deposit = (income - expense) * 12
 *     // yearly: balance = balance * (1 + a.returnRate) + annualDeposit
 *     // 'enough-line' target capital = goal.value / a.withdrawalRate
 *     // reachable when goal met within 60 years (years = first year met; 0 if goal <= starting capital)
 *     // no-net-savings when monthly net savings <= 0; otherwise unreachable.
 *     // savingsRate = monthly net savings / monthly income.
 *
 *   gap(p: Profile, goal: Goal, a: Assumptions): { annualGap: number; yearsAtCurrentPace: number }
 *     // yearsAtCurrentPace = years at current pace (60 when unreachable, 0 when no-net-savings)
 *     // annualGap = annual savings required to reach the goal in 30 years minus current annual
 *     //              savings (floor at 0).
 *
 *   buildMilestones(p: Profile, goal: Goal, a: Assumptions): Milestone[]
 *     // ≥3 stages: raise savings rate -> build first principal -> raise income.
 *     // goalValue/years derived from the user's own profile; actions are example paths.
 *
 *   convert(amount: number, from: Currency, to: Currency, fx: FxSnapshot): number
 *     // amount * fx.rates[to] / fx.rates[from]
 */
