import type { Assumptions, Currency, LifeChoice, Profile } from '@rich-sim/core';

/**
 * localStorage draft schema (frozen). MVP has no backend; the whole plan
 * lives under one key. All pages read/write through this module only.
 */
export const DRAFT_KEY = 'rich-sim:plan:v1';

export type Draft = {
  schemaVersion: 1;
  /** Designer selections (T06). */
  choices: LifeChoice;
  /** Finance profile (T07); null until entered. */
  profile: Profile | null;
  /** Display/base currency (T10). */
  currency: Currency;
  /** Assumptions incl. fx snapshot (T09/T10); null until defaults land. */
  assumptions: Assumptions | null;
  /**
   * M3 S4 · 富豪模拟购物车一键成目标（G4 方案 a）。
   * 存在时，结果页的目标年成本直接用这个 USD 数字，不再逐维求和 choices；
   * choices 仍写「每维最贵项」仅作展示回显。只携带年成本，不含任何虚构成分
   * （无起始金、无资产占比）。undefined = 普通设计器方案，旧草稿天然兼容。
   */
  goalOverride?: { annualCost: number; from: 'sim-cart' };
  /** ISO timestamp. */
  updatedAt: string;
};

export function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (parsed && parsed.schemaVersion === 1) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function writeDraft(draft: Draft): void {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
  );
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}

/** Where the home-page "continue" entry should send the user. */
export type DraftStep = '/app/designer' | '/app/finance' | '/app/result';

const PROFILE_FIELDS = ['income', 'expense', 'savings', 'debt'] as const;

/**
 * Resume target from a saved draft:
 * - complete finance profile → results
 * - designer choices present, profile incomplete → finance form
 * - otherwise → designer
 */
export function nextDraftStep(draft: Draft): DraftStep {
  const profile = draft.profile;
  const financeDone =
    !!profile && PROFILE_FIELDS.every((k) => typeof profile[k] === 'number');
  if (financeDone) return '/app/result';
  return draft.choices.length > 0 ? '/app/finance' : '/app/designer';
}
