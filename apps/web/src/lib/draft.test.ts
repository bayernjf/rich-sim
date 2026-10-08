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

/**
 * `history` 只由结果页那一个岛追加，但每个调用点都是**重建整个 Draft**。
 * 不显式透传就会静默抹掉用户的历史，所以 writeDraft 统一保留——这几条钉住
 * 「不传 = 不动」「传 [] = 主动清空」两半语义。
 */
describe('writeDraft keeps the local history', () => {
  const stored = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;

  function withStorage(run: () => void) {
    const saved = { localStorage: g.localStorage, window: g.window };
    // 三条用例共用一个 Map：不清空的话，上一条留下的草稿会被下一条的
    // 「不传 history 就保留」逻辑读进去，测出来的行为是真的、前提却是假的。
    stored.clear();
    g.localStorage = {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => void stored.set(k, v),
      removeItem: (k: string) => void stored.delete(k),
    };
    g.window = { dispatchEvent: () => true };
    try {
      run();
    } finally {
      g.localStorage = saved.localStorage;
      g.window = saved.window;
    }
  }

  const snapshot = {
    at: '2026-10-01T00:00:00.000Z',
    currency: 'USD' as const,
    status: 'reachable' as const,
    years: 20,
    annualCost: 80_000,
    enoughLine: 2_000_000,
    netWorth: 100_000,
  };

  it('a writer that does not mention history leaves it intact', () => {
    withStorage(() => {
      writeDraft(makeDraft({ profile: fullProfile, history: [snapshot] }));
      // 设计器式的写法：整个 Draft 重建，只有 choices 变了。
      writeDraft(makeDraft({ profile: fullProfile, choices: [{ dimension: 'living', optionId: 'opt' }] }));
      const raw = JSON.parse(stored.get('rich-sim:plan:v1') ?? 'null');
      expect(raw.history).toEqual([snapshot]);
    });
  });

  it('an explicit empty array is a deliberate wipe, not an omission', () => {
    withStorage(() => {
      writeDraft(makeDraft({ profile: fullProfile, history: [snapshot] }));
      writeDraft(makeDraft({ profile: fullProfile, history: [] }));
      expect(JSON.parse(stored.get('rich-sim:plan:v1') ?? 'null').history).toEqual([]);
    });
  });

  it('a fresh plan carries no history key at all (old drafts stay valid)', () => {
    withStorage(() => {
      writeDraft(makeDraft({ profile: fullProfile }));
      expect('history' in JSON.parse(stored.get('rich-sim:plan:v1') ?? '{}')).toBe(false);
    });
  });
});

/**
 * `savedPlans` 与 `history` 同一条纪律：每个写方都是重建整个 Draft，
 * 不透传就会静默抹掉存档。钉住「不传 = 不动」「传 [] = 主动清空」。
 */
describe('writeDraft keeps the saved plans', () => {
  const stored = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;

  function withStorage(run: () => void) {
    const saved = { localStorage: g.localStorage, window: g.window };
    stored.clear();
    g.localStorage = {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => void stored.set(k, v),
      removeItem: (k: string) => void stored.delete(k),
    };
    g.window = { dispatchEvent: () => true };
    try {
      run();
    } finally {
      g.localStorage = saved.localStorage;
      g.window = saved.window;
    }
  }

  const plan = {
    id: 'plan-test',
    name: '基准',
    savedAt: '2026-10-08T00:00:00.000Z',
    choices: [{ dimension: 'home', optionId: 'home_a' }],
    profile: fullProfile,
  };

  it('a writer that does not mention savedPlans leaves them intact', () => {
    withStorage(() => {
      writeDraft(makeDraft({ profile: fullProfile, savedPlans: [plan] }));
      writeDraft(makeDraft({ profile: fullProfile, currency: 'USD' }));
      expect(JSON.parse(stored.get('rich-sim:plan:v1') ?? 'null').savedPlans).toEqual([plan]);
    });
  });

  it('an explicit empty array wipes the archive deliberately', () => {
    withStorage(() => {
      writeDraft(makeDraft({ profile: fullProfile, savedPlans: [plan] }));
      writeDraft(makeDraft({ profile: fullProfile, savedPlans: [] }));
      expect(JSON.parse(stored.get('rich-sim:plan:v1') ?? 'null').savedPlans).toEqual([]);
    });
  });
});
