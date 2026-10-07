import { describe, expect, it, vi } from 'vitest';
import type { Draft } from './draft';
import { DRAFT_UPDATED_EVENT, nextDraftStep, writeDraft } from './draft';

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

/**
 * 假设编辑器改完就要让同页的结果区重算，靠的是 writeDraft 派发的事件。
 * 这条测试盯的是「派发确实发生了」——少了它，改假设只落盘、屏幕上的数字不动，
 * 功能看起来还在但其实整条链是断的。
 */
describe('writeDraft broadcasts to the same tab', () => {
  const stored = new Map<string, string>();
  const fakeStorage = {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  };

  function withBrowserGlobals(run: (dispatch: ReturnType<typeof vi.fn>) => void) {
    const dispatch = vi.fn();
    const g = globalThis as Record<string, unknown>;
    const saved = { localStorage: g.localStorage, window: g.window };
    g.localStorage = fakeStorage;
    g.window = { dispatchEvent: dispatch };
    try {
      run(dispatch);
    } finally {
      g.localStorage = saved.localStorage;
      g.window = saved.window;
    }
  }

  it('dispatches DRAFT_UPDATED_EVENT after a successful write', () => {
    withBrowserGlobals((dispatch) => {
      writeDraft(makeDraft({ profile: fullProfile }));
      expect(dispatch).toHaveBeenCalledTimes(1);
      const event = dispatch.mock.calls[0][0] as Event;
      expect(event.type).toBe(DRAFT_UPDATED_EVENT);
    });
  });

  it('writes the payload before dispatching, so listeners re-read the new value', () => {
    withBrowserGlobals(() => {
      writeDraft(makeDraft({ profile: fullProfile, currency: 'EUR' }));
      expect(JSON.parse(stored.get('rich-sim:plan:v1') ?? '{}').currency).toBe('EUR');
    });
  });

  it('a storage failure does not announce an update that never landed', () => {
    const g = globalThis as Record<string, unknown>;
    const saved = { localStorage: g.localStorage, window: g.window };
    const dispatch = vi.fn();
    g.localStorage = { setItem: () => { throw new Error('quota'); } };
    g.window = { dispatchEvent: dispatch };
    try {
      expect(() => writeDraft(makeDraft({}))).toThrow('quota');
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      g.localStorage = saved.localStorage;
      g.window = saved.window;
    }
  });

  it('stays usable when there is no window at all (SSR / node)', () => {
    const g = globalThis as Record<string, unknown>;
    const saved = { localStorage: g.localStorage, window: g.window };
    g.localStorage = fakeStorage;
    delete g.window;
    try {
      expect(() => writeDraft(makeDraft({ profile: fullProfile }))).not.toThrow();
    } finally {
      g.localStorage = saved.localStorage;
      g.window = saved.window;
    }
  });
});
