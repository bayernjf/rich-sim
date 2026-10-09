import type { Assumptions, Currency, LifeChoice, Profile } from '@rich-sim/core';
import type { Snapshot } from './progress';

/**
 * localStorage draft schema (frozen). MVP has no backend; the whole plan
 * lives under one key. All pages read/write through this module only.
 */
export const DRAFT_KEY = 'rich-sim:plan:v1';

/**
 * 本机方案被改写的事件名（只在当前标签页内，同页跨岛）。它不是存储 key，
 * 也不落盘，因此不在 CONVENTIONS 的冻结 key 清单里——但**订阅方与写方都只有
 * 本模块和 apps/web/src/components 的岛**，改名要一起改。
 */
export const DRAFT_UPDATED_EVENT = 'rich-sim:draft-updated';

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
  /**
   * T0-3（2026-10-09 拍板方案 A，进契约）· 目标口径切换。
   * 存在时，结果页的目标从「够用线（年成本/提取率）」切换为净资产目标：
   * `project` / `gap` / `buildMilestones` 全部喂 `{ kind: 'net-worth', value }`。
   * value 是**录入/展示币种**下的净资产目标；undefined = 够用线，旧草稿天然兼容。
   * 与 goalOverride 互不排斥：override 改「目标年成本的来源」，goal 改「目标类型」。
   */
  goal?: { kind: 'net-worth'; value: number };
  /**
   * F6（本机版）· 测算历史快照，见 `lib/progress.ts`。
   * undefined = 这台机器还没记过（旧草稿天然兼容）；`[]` = 主动清空。
   * 只存派生数字与当时的净资产，不存任何输入原文之外的东西，且**永远不出本机**。
   */
  history?: Snapshot[];
  /**
   * F9（本机版）· 多剧本存档，见 `lib/plans.ts`。
   * undefined = 没存过（旧草稿天然兼容）；`[]` = 全部删光。
   * 与 `history` 同一条纪律：`writeDraft` 隐式保留，永远不出本机。
   */
  savedPlans?: SavedPlan[];
  /** ISO timestamp. */
  updatedAt: string;
};

/**
 * F9（本机版）· 多剧本存档的一条。
 *
 * 存的是「一个剧本的全部输入」：设计器七维选择 + 财务四（八）项 + 可能的
 * 购物车一键成目标 override。不存币种与假设——那是展示偏好与全局口径，
 * 不是剧本的一部分；载入时沿用当前值。派生数字（年限、够用线）不存：
 * 载入后走 `computeResults` 现算，与「测算结果不落盘」的既有口径一致。
 */
export type SavedPlan = {
  /** 本机唯一 id（`lib/plans.ts` 生成，不出本机）。 */
  id: string;
  /** 用户起的名字（ trimmed，长度上限见 plans.ts）。 */
  name: string;
  /** 存档时刻（ISO 8601）。 */
  savedAt: string;
  choices: LifeChoice;
  profile: Profile | null;
  goalOverride?: { annualCost: number; from: 'sim-cart' };
  /** T0-3 · 目标口径（净资产目标）；undefined = 够用线。 */
  goal?: { kind: 'net-worth'; value: number };
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
  // `history` 是只追加的本机记录，写它的只有结果页那一个岛。其余调用点（设计器、
  // 财务录入、币种切换、模拟购物车）都是**重建整个 draft**，不逐条透传就会把历史
  // 抹掉——而且抹得很安静。所以这里统一保留：调用方不显式写 history 就等于不动它。
  // 要清掉请显式传 `history: []`（当前只有 clearDraft 走整键删除）。
  const previous = readDraft();
  let merged = draft;
  if (draft.history === undefined && previous?.history) merged = { ...merged, history: previous.history };
  if (draft.savedPlans === undefined && previous?.savedPlans)
    merged = { ...merged, savedPlans: previous.savedPlans };
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ ...merged, updatedAt: new Date().toISOString() }),
  );
  // 同一页上有多个岛各读一份 draft（结果区、情景面板、假设编辑器）。任何一个
  // 写完，其余的必须重读重算，否则改完假设下面的数字还停在旧值上——那正是这一
  // 功能唯一要给用户看的东西。监听方一律 readDraft()，不从这里传对象：
  // 本账只有一个真相来源。
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(DRAFT_UPDATED_EVENT));
  }
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
