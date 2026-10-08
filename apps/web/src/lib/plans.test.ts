import { describe, expect, it } from 'vitest';
import type { Draft } from './draft';
import { MAX_SAVED_PLANS, applyPlan, normalizePlanName, removePlan, savePlan } from './plans';

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    schemaVersion: 1,
    choices: [{ dimension: 'home', optionId: 'home_a' }],
    profile: { income: 15000, expense: 8000, savings: 100000, debt: 0, currency: 'CNY' },
    currency: 'CNY',
    assumptions: null,
    updatedAt: '2026-10-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizePlanName', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizePlanName('  辞职  去大理  ')).toBe('辞职 去大理');
  });
  it('rejects blank names', () => {
    expect(normalizePlanName('   ')).toBeNull();
  });
});

describe('savePlan', () => {
  it('appends a plan with the current inputs', () => {
    const result = savePlan(makeDraft(), '基准', '2026-10-08T01:00:00.000Z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.savedPlans).toHaveLength(1);
    expect(result.plan.name).toBe('基准');
    expect(result.plan.profile?.income).toBe(15000);
  });

  it('overwrites a same-named plan instead of duplicating it', () => {
    const first = savePlan(makeDraft(), '基准');
    if (!first.ok) throw new Error('unreachable');
    const second = savePlan({ ...first.draft, profile: { ...makeDraft().profile!, income: 20000 } }, ' 基准 ');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.draft.savedPlans).toHaveLength(1);
    expect(second.draft.savedPlans?.[0]?.profile?.income).toBe(20000);
  });

  it('refuses beyond the cap instead of silently dropping the oldest', () => {
    let draft = makeDraft();
    for (let i = 0; i < MAX_SAVED_PLANS; i += 1) {
      const result = savePlan(draft, `剧本${i}`);
      if (!result.ok) throw new Error('unreachable');
      draft = result.draft;
    }
    const overflow = savePlan(draft, '第11个');
    expect(overflow).toEqual({ ok: false, reason: 'too-many' });
  });

  it('rejects an empty name', () => {
    expect(savePlan(makeDraft(), '  ')).toEqual({ ok: false, reason: 'empty-name' });
  });

  it('keeps goalOverride only when the draft has one', () => {
    const withOverride = savePlan(makeDraft({ goalOverride: { annualCost: 500000, from: 'sim-cart' } }), '购物车版');
    if (!withOverride.ok) throw new Error('unreachable');
    expect(withOverride.plan.goalOverride?.annualCost).toBe(500000);
    const plain = savePlan(makeDraft(), '普通版');
    if (!plain.ok) throw new Error('unreachable');
    expect('goalOverride' in plain.plan).toBe(false);
  });
});

describe('applyPlan', () => {
  it('restores inputs but keeps current currency and assumptions', () => {
    const saved = savePlan(makeDraft(), '基准');
    if (!saved.ok) throw new Error('unreachable');
    const drifted: Draft = {
      ...saved.draft,
      choices: [],
      profile: null,
      currency: 'USD',
      assumptions: {
        returnRate: 0.05,
        withdrawalRate: 0.04,
        inflation: 0.02,
        assumptionsVersion: 'test',
        fx: { base: 'CNY', at: '2026-10-08', rates: {} },
      } as unknown as Draft['assumptions'],
    };
    const loaded = applyPlan(drifted, saved.plan.id);
    expect(loaded?.choices).toHaveLength(1);
    expect(loaded?.profile?.income).toBe(15000);
    expect(loaded?.currency).toBe('USD');
    expect(loaded?.assumptions).not.toBeNull();
  });

  it('clears a live goalOverride when the saved plan has none', () => {
    const saved = savePlan(makeDraft(), '普通版');
    if (!saved.ok) throw new Error('unreachable');
    const withOverride = { ...saved.draft, goalOverride: { annualCost: 1, from: 'sim-cart' as const } };
    const loaded = applyPlan(withOverride, saved.plan.id);
    expect(loaded?.goalOverride).toBeUndefined();
  });

  it('returns null for an unknown id', () => {
    expect(applyPlan(makeDraft(), 'nope')).toBeNull();
  });
});

describe('removePlan', () => {
  it('removes by id and is idempotent', () => {
    const saved = savePlan(makeDraft(), '基准');
    if (!saved.ok) throw new Error('unreachable');
    const once = removePlan(saved.draft, saved.plan.id);
    expect(once.savedPlans).toHaveLength(0);
    expect(removePlan(once, saved.plan.id)).toBe(once);
  });
});
