import type { Draft, SavedPlan } from './draft';

/**
 * F9（本机版）· 多剧本存档的纯函数层。
 *
 * 边界与「为什么长这样」：
 * - **本机版**：全部数据仍在 `rich-sim:plan:v1` 一个 key 里（Draft.savedPlans），
 *   不加新 key、不出本机。将来 M5 云同步上行的是整个 Draft，存档自然跟着走。
 * - **多身份（SIM 侧）不做**：SIM 的身份是预设卡（catalog 内容），不是用户创作；
 *   这里只存档 REAL 剧本。这是范围裁剪，不是漏做。
 * - **同名 = 覆盖**：用户视角「存一个同名剧本」的意图就是更新它，做双份才是惊讶。
 * - **上限 10 个**：存档不是无限仓库；超过就拒绝，让 UI 明说，而不是静默丢最旧的。
 */

/** 存档条数上限。 */
export const MAX_SAVED_PLANS = 10;
/** 名字长度上限（字符，trim 后计）。 */
export const MAX_PLAN_NAME = 20;

export type SavePlanResult =
  | { ok: true; draft: Draft; plan: SavedPlan }
  | { ok: false; reason: 'empty-name' | 'too-many' };

function planId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.floor(Math.random() * 36 ** 8).toString(36);
  return `plan-${Date.now().toString(36)}-${rand}`;
}

/** 规范化名字：去首尾空白、压缩内部连续空白。空则返回 null。 */
export function normalizePlanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_PLAN_NAME);
  return name.length > 0 ? name : null;
}

/**
 * 把 draft 的当前输入存成一个剧本（同名覆盖）。不改调用方传入的对象，
 * 返回带上新 savedPlans 的新 Draft；失败时返回原因（UI 负责明说）。
 */
export function savePlan(draft: Draft, rawName: string, now = new Date().toISOString()): SavePlanResult {
  const name = normalizePlanName(rawName);
  if (!name) return { ok: false, reason: 'empty-name' };
  const existing = draft.savedPlans ?? [];
  const kept = existing.filter((plan) => plan.name !== name);
  if (kept.length >= MAX_SAVED_PLANS) return { ok: false, reason: 'too-many' };
  const plan: SavedPlan = {
    id: planId(),
    name,
    savedAt: now,
    choices: draft.choices,
    profile: draft.profile,
    ...(draft.goalOverride ? { goalOverride: draft.goalOverride } : {}),
    ...(draft.goal ? { goal: draft.goal } : {}),
  };
  return { ok: true, draft: { ...draft, savedPlans: [...kept, plan] }, plan };
}

/**
 * 载入一个剧本：choices / profile / goalOverride / goal 回到存档时的值，
 * currency / assumptions / history / 其余 savedPlans 不动。找不到 id 返回 null。
 */
export function applyPlan(draft: Draft, id: string): Draft | null {
  const plan = (draft.savedPlans ?? []).find((item) => item.id === id);
  if (!plan) return null;
  const next: Draft = {
    ...draft,
    choices: plan.choices,
    profile: plan.profile,
  };
  if (plan.goalOverride) next.goalOverride = plan.goalOverride;
  else delete next.goalOverride;
  if (plan.goal) next.goal = plan.goal;
  else delete next.goal;
  return next;
}

/** 删除一个剧本；找不到 id 时原样返回（幂等，UI 双击不出错）。 */
export function removePlan(draft: Draft, id: string): Draft {
  const existing = draft.savedPlans ?? [];
  const kept = existing.filter((plan) => plan.id !== id);
  if (kept.length === existing.length) return draft;
  return { ...draft, savedPlans: kept };
}
