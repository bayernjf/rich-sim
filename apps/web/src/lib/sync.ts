/**
 * M5 S2 · 草稿云端同步（REAL 账，`plans` 表 kind='plan'）。
 *
 * 规则与边界（m5-task-breakdown §2/§3 的代码化）：
 * - **localStorage 优先**：首屏永远先读本机；云只在登录态下做备份与跨设备。
 * - **payload 原样上云**：`plans.payload` 就是本机 Draft 的 JSON（含 version），
 *   云端不理解 schema，冻结契约的升版流程不被云同步绕过。
 * - **RLS 保证**：anon key 只能读写 `auth.uid() = user_id` 的行，service key 不出现。
 * - **冲突不智能**（§3）：登录/冷启动时对时——云端新 → 拉；本机新 → 推；相等 → 不动。
 *   首次登录两边都有 = 本机新的一种，本机优先上行，无合并、无弹窗。
 * - **登出不清本机**：断同步而已（S3 语义，这里先就位）。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Draft } from './draft';

export type SyncDecision = 'push' | 'pull' | 'none';

/** 对时决策：纯函数，全部情况显式列尽，便于测试钉死。 */
export function decideSync(args: {
  signedIn: boolean;
  local: { updatedAt: string } | null;
  cloud: { updated_at: string } | null;
}): SyncDecision {
  if (!args.signedIn) return 'none';
  if (!args.cloud) return args.local ? 'push' : 'none';
  if (!args.local) return 'pull';
  const cloudAt = Date.parse(args.cloud.updated_at);
  const localAt = Date.parse(args.local.updatedAt);
  if (Number.isNaN(cloudAt) || Number.isNaN(localAt)) return 'none';
  if (cloudAt > localAt) return 'pull';
  if (localAt > cloudAt) return 'push';
  return 'none';
}

const TABLE = 'plans';
const KIND = 'plan';

/** 上行：整份 Draft 原样 upsert（updated_at 用客户端时间，与对时口径一致）。 */
export async function pushDraft(supabase: SupabaseClient, userId: string, draft: Draft): Promise<boolean> {
  const { error } = await supabase.from(TABLE).upsert(
    { user_id: userId, kind: KIND, payload: draft, updated_at: draft.updatedAt },
    { onConflict: 'user_id,kind' },
  );
  return !error;
}

/** 下行：读云端那行；没有就是 null。 */
export async function pullDraft(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ payload: Draft; updated_at: string } | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('payload, updated_at')
    .eq('user_id', userId)
    .eq('kind', KIND)
    .maybeSingle();
  if (error || !data) return null;
  return data as { payload: Draft; updated_at: string };
}
