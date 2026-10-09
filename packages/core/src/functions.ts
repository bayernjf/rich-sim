/**
 * T03 · @rich-sim/core engine — the pure functions.
 *
 * Frozen contract: src/types.ts (comment block at EOF) + CONVENTIONS.md
 * 「引擎公式口径」. All assumptions are passed in explicitly; this module
 * holds no state and has zero runtime dependencies.
 */
import type {
  Assumptions,
  Catalog,
  Currency,
  FxSnapshot,
  Goal,
  LifeChoice,
  Milestone,
  Profile,
  Projection,
  ScenarioCost,
} from './types';

/** Max projection horizon (years). Beyond it the goal is 'unreachable'.
 *  The comparison converter shares this horizon: it never prints "N years"
 *  for an N the engine has already ruled out of a working life. */
const MAX_YEARS = 60;
/** Milestone stage 1: target savings rate lifted to 20% of income. */
const STAGE1_SAVINGS_RATE = 0.2;
/** Milestone stage 3: income lifted by 10%. */
const STAGE3_INCOME_LIFT = 1.1;
/** Milestone stage 2: first principal = 6 months of expense. */
const STAGE2_MONTHS = 6;

/** Resolve the target capital for a goal (enough-line uses the withdrawal rate). */
function targetCapital(goal: Goal, a: Assumptions): number {
  if (goal.kind === 'enough-line') return goal.value / a.withdrawalRate;
  if (goal.kind === 'net-worth') return goal.value;
  throw new Error(`Unknown goal kind: ${String((goal as { kind?: unknown }).kind)}`);
}

/**
 * Year-by-year compounding: balance = balance * (1 + r) + annualDeposit.
 * Returns the first year the balance reaches `target`, 0 if already there,
 * or null if it never happens within MAX_YEARS.
 */
function yearsToTarget(
  start: number,
  annualDeposit: number,
  target: number,
  r: number,
): number | null {
  if (target <= start) return 0;
  if (annualDeposit <= 0) return null;
  let balance = start;
  for (let year = 1; year <= MAX_YEARS; year++) {
    balance = balance * (1 + r) + annualDeposit;
    if (balance >= target) return year;
  }
  return null;
}

/**
 * enoughLine(annualCost, a) = annualCost / a.withdrawalRate.
 * Hand-check ①: 400,000 / 0.04 = 10,000,000 (1000万).
 */
export function enoughLine(annualCost: number, a: Assumptions): number {
  return annualCost / a.withdrawalRate;
}

/**
 * scenarioAnnualCost(choices, catalog, a) — M1 = plain sum of chosen option
 * annual costs (inflation is recorded in assumptions, NOT applied here;
 * changing this requires bumping assumptionsVersion). Breakdown grouped by
 * dimensionId. Unknown optionId (or dimension) throws.
 */
export function scenarioAnnualCost(
  choices: LifeChoice,
  catalog: Catalog,
  _a: Assumptions,
): ScenarioCost {
  const breakdown: Record<string, number> = {};
  let annualCost = 0;
  for (const choice of choices) {
    const dimension = catalog.dimensions.find((d) => d.id === choice.dimension);
    if (!dimension) throw new Error(`Unknown dimension: ${choice.dimension}`);
    const option = dimension.options.find((o) => o.id === choice.optionId);
    if (!option) {
      throw new Error(`Unknown optionId: ${choice.optionId} (dimension ${choice.dimension})`);
    }
    breakdown[choice.dimension] = (breakdown[choice.dimension] ?? 0) + option.annualCost;
    annualCost += option.annualCost;
  }
  return { annualCost, breakdown };
}

/**
 * profileMonthlyExpense(p) — the engine's single source for monthly spending.
 *
 * When the user itemized spending (expenseBreakdown present), the total is
 * the sum of the four buckets and `expense` is ignored: the itemized numbers
 * are the finer truth and the writer layer keeps expense = sum(breakdown)
 * anyway. Legacy drafts without a breakdown fall back to `expense` — their
 * results are bit-for-bit unchanged.
 */
export function profileMonthlyExpense(p: Profile): number {
  const b = p.expenseBreakdown;
  if (b) return b.housing + b.transport + b.food + b.other;
  return p.expense;
}

/**
 * project(p, goal, a) — three first-class states.
 * starting capital = savings - debt; annual deposit = (income - expense) * 12.
 */
export function project(p: Profile, goal: Goal, a: Assumptions): Projection {
  const monthlyNet = p.income - profileMonthlyExpense(p);
  const savingsRate = p.income > 0 ? monthlyNet / p.income : 0;
  if (monthlyNet <= 0) return { status: 'no-net-savings' };

  const start = p.savings - p.debt;
  const target = targetCapital(goal, a);
  const years = yearsToTarget(start, monthlyNet * 12, target, a.returnRate);

  if (years === null) return { status: 'unreachable', savingsRate };
  return { status: 'reachable', years, savingsRate };
}

/**
 * gap(p, goal, a) — how far short the current pace is.
 * yearsAtCurrentPace: reachable -> years; unreachable -> 60; no-net-savings -> 0.
 * annualGap: annual deposit needed to hit the target in 30 years minus current
 * annual savings, floored at 0. Required P solves the compound-annuity FV:
 *   FV = start*(1+r)^30 + P * ((1+r)^30 - 1)/r
 * => P = (target - start*(1+r)^30) * r / ((1+r)^30 - 1)
 * (r = 0 => P = (target - start) / 30).
 */
export function gap(
  p: Profile,
  goal: Goal,
  a: Assumptions,
): { annualGap: number; yearsAtCurrentPace: number } {
  const projection = project(p, goal, a);
  const yearsAtCurrentPace =
    projection.status === 'reachable'
      ? projection.years
      : projection.status === 'unreachable'
        ? MAX_YEARS
        : 0;

  const start = p.savings - p.debt;
  const target = targetCapital(goal, a);
  const currentAnnual = (p.income - profileMonthlyExpense(p)) * 12;
  const r = a.returnRate;

  let required: number;
  if (r === 0) {
    required = (target - start) / 30;
  } else {
    const f = Math.pow(1 + r, 30);
    required = ((target - start * f) * r) / (f - 1);
  }
  const annualGap = Math.max(0, required - currentAnnual);
  return { annualGap, yearsAtCurrentPace };
}

/**
 * buildMilestones(p, goal, a) — >=3 staged actions, all numbers derived from
 * the user's own profile. Actions are example paths (示例路径), NOT advice.
 */
export function buildMilestones(p: Profile, goal: Goal, a: Assumptions): Milestone[] {
  const start = p.savings - p.debt;
  const target = targetCapital(goal, a);
  const r = a.returnRate;
  const monthlyNet = p.income - profileMonthlyExpense(p);

  // Stage 1: lift savings rate to 20% of income -> new monthly saving amount
  // and the years to the main goal at that pace.
  const stage1Monthly = p.income > 0 ? STAGE1_SAVINGS_RATE * p.income : 0;
  const stage1Years = yearsToTarget(start, stage1Monthly * 12, target, r) ?? MAX_YEARS;

  // Stage 2: build the first principal cushion = 6 months of expense.
  // Saving speed is monthly; months-to-save / 12 = years.
  const stage2Amount = STAGE2_MONTHS * profileMonthlyExpense(p);
  const stage2Years =
    monthlyNet > 0 ? Math.ceil(stage2Amount / monthlyNet / 12) : 0;

  // Stage 3: lift income by 10% (expense unchanged) -> years to the main goal.
  const stage3Monthly = p.income * STAGE3_INCOME_LIFT - profileMonthlyExpense(p);
  const stage3Years = yearsToTarget(start, stage3Monthly * 12, target, r) ?? MAX_YEARS;

  return [
    {
      stage: 1,
      goalValue: stage1Monthly,
      years: stage1Years,
      action: '「示例路径」先把每月储蓄率提到 20%，再看按这个速度需要多少年摸到目标本金。',
    },
    {
      stage: 2,
      goalValue: stage2Amount,
      years: stage2Years,
      action: '「示例路径」用当前每月结余先攒出 6 个月支出，作为第一笔本金垫子。',
    },
    {
      stage: 3,
      goalValue: target,
      years: stage3Years,
      action: '「示例路径」收入抬升 10% 后重新算一次，看目标本金会提前几年。',
    },
  ];
}

/** Strict ISO date check: YYYY-MM-DD with a real calendar day. */
function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * convert(amount, from, to, fx) = amount * fx.rates[to] / fx.rates[from].
 * Throws on: snapshot missing a currency, non-positive rate, invalid date.
 */
export function convert(amount: number, from: Currency, to: Currency, fx: FxSnapshot): number {
  if (!isValidISODate(fx.date)) throw new Error(`Invalid fx snapshot date: ${fx.date}`);
  const rateFrom = fx.rates[from];
  const rateTo = fx.rates[to];
  if (rateFrom === undefined || !Number.isFinite(rateFrom)) {
    throw new Error(`Fx snapshot missing rate for ${from}`);
  }
  if (rateTo === undefined || !Number.isFinite(rateTo)) {
    throw new Error(`Fx snapshot missing rate for ${to}`);
  }
  if (rateFrom <= 0 || rateTo <= 0) {
    throw new Error(`Non-positive fx rate for ${from}/${to}`);
  }
  return (amount * rateTo) / rateFrom;
}

/** Simulation bill-day status bands (simulation-gameplay.md §2.5). Below or at the
 *  green line there is a >=40% cashflow buffer; above the hard line the year's
 *  holding costs exceed the cashflow and assets must be sold. */
export const BURDEN_RATE_GREEN = 0.6;
export const BURDEN_RATE_HARD = 1.0;

export type BurdenStatus = 'green' | 'yellow' | 'red';

/**
 * burdenStatus(annualCost, annualCashflow) — the bill-day burden ratio
 * r = annualCost / annualCashflow and its band. A non-positive cashflow is
 * 'red' with a null rate: there is nothing to divide by and nothing to pay
 * with, which is the broken state, not an error.
 */
export function burdenStatus(
  annualCost: number,
  annualCashflow: number,
): { rate: number | null; status: BurdenStatus } {
  if (!(annualCashflow > 0)) return { rate: null, status: 'red' };
  const rate = annualCost / annualCashflow;
  const status: BurdenStatus =
    rate <= BURDEN_RATE_GREEN ? 'green' : rate <= BURDEN_RATE_HARD ? 'yellow' : 'red';
  return { rate, status };
}

/**
 * Bill-day gameplay defaults (simulation-gameplay.md §2.4). The burden bands
 * above are parameters 5–6; these are parameters 2 and 4, lifted out of the UI
 * so the same number cannot silently diverge between the bill day and the mall.
 */

/** §2.4 parameter 2: bills flipped per page (suggested range 3–5). */
export const BILLS_PER_PAGE = 4;

/** §2.4 parameter 4: forced resale recovers 75% of face value (midpoint of the
 *  suggested 70–80% band) — assets do not liquidate at face value. */
export const RESALE_RECOVERY_RATE = 0.75;

/**
 * Cash recovered from a forced resale. Invalid (non-finite / negative) input
 * collapses to 0 rather than producing NaN; the rate must lie in (0, 1].
 */
export function resaleRecovery(
  value: number,
  rate: number = RESALE_RECOVERY_RATE,
): number {
  if (!(Number.isFinite(value) && value > 0)) return 0;
  if (!(rate > 0 && rate <= 1)) return 0;
  return value * rate;
}

/** Above this multiple the line drops the number entirely: "17,562 years"
 *  reads as noise, not as curiosity (comparison-converter.md §3.3). */
export const TIME_EQUIVALENT_ABSURD_MULTIPLE = 1000;

/**
 * The converter's four first-class outcomes. `years` and `multiple` hold the
 * same quotient and differ only in which framing the doc prescribes; the
 * `no-net-savings` name matches `project` so the UI speaks one vocabulary.
 */
export type TimeEquivalent =
  | { status: 'no-net-savings'; annualCostLocal: number; annualSavings: number; currency: Currency }
  | { status: 'years'; years: number; annualCostLocal: number; annualSavings: number; currency: Currency }
  | { status: 'multiple'; multiple: number; annualCostLocal: number; annualSavings: number; currency: Currency }
  | { status: 'beyond-scale'; annualCostLocal: number; annualSavings: number; currency: Currency };

/**
 * wealthTimeEquivalent(annualCostUsd, profile, fx) — the §2.1 lightweight
 * line: this bill's annual cost / the user's annual net savings, as a pure
 * division. No returnRate, no withdrawalRate, no compounding, so the result
 * states an arithmetic relation rather than a projection.
 *
 * The convert() below is load-bearing, not cosmetic: catalog costs are USD
 * while the profile is in the user's entry currency, so skipping it divides
 * across two currencies and yields a rate-factor-wrong number. It is inside
 * the function because there is no caller-side way to get that wrong.
 */
export function wealthTimeEquivalent(
  annualCostUsd: number,
  profile: Profile,
  fx: FxSnapshot,
): TimeEquivalent {
  const currency = profile.currency;
  const annualCostLocal = convert(annualCostUsd, 'USD', currency, fx);
  const annualSavings = (profile.income - profileMonthlyExpense(profile)) * 12;
  if (!(annualSavings > 0)) return { status: 'no-net-savings', annualCostLocal, annualSavings, currency };

  const years = annualCostLocal / annualSavings;
  if (years > TIME_EQUIVALENT_ABSURD_MULTIPLE) {
    return { status: 'beyond-scale', annualCostLocal, annualSavings, currency };
  }
  if (years > MAX_YEARS) {
    return { status: 'multiple', multiple: years, annualCostLocal, annualSavings, currency };
  }
  return { status: 'years', years, annualCostLocal, annualSavings, currency };
}
