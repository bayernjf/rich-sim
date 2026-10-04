import { describe, expect, it } from 'vitest';
import type { Draft } from './draft';
import { nextDraftStep } from './draft';

const fullProfile = {
  income: 15000,
  expense: 8000,
  savings: 100000,
  debt: 0,
  currency: 'CNY' as const,
};

function makeDraft(overrides: Partial<Draft>): Draft {
  return {
    schemaVersion: 1,
    choices: [],
    profile: null,
    currency: 'CNY',
    assumptions: null,
    updatedAt: '',
    ...overrides,
  };
}

describe('nextDraftStep', () => {
  it('goes to results when the finance profile is complete', () => {
    const draft = makeDraft({
      choices: [{ dimension: 'home', optionId: 'home_a' }],
      profile: fullProfile,
    });
    expect(nextDraftStep(draft)).toBe('/app/result');
  });

  it('goes to finance when choices exist but profile is missing', () => {
    const draft = makeDraft({
      choices: [{ dimension: 'home', optionId: 'home_a' }],
    });
    expect(nextDraftStep(draft)).toBe('/app/finance');
  });

  it('goes to the designer when there are no choices and no profile', () => {
    expect(nextDraftStep(makeDraft({}))).toBe('/app/designer');
  });

  it('treats a partial profile (missing a field) as incomplete', () => {
    const draft = makeDraft({
      choices: [{ dimension: 'home', optionId: 'home_a' }],
      // debt missing → not a complete Profile at runtime
      profile: { income: 1, expense: 2, savings: 3, currency: 'CNY' } as Draft['profile'],
    });
    expect(nextDraftStep(draft)).toBe('/app/finance');
  });
});
