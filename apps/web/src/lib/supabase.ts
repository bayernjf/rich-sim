/**
 * M5 S1 · Supabase 客户端（Auth + 后续的草稿同步）。
 *
 * 开关纪律（与 Analytics.astro 同一条）：**未配置环境变量时全站零行为**——
 * 这里返回 null，挂载方（AuthButton）直接不渲染，不发出任何网络请求，
 * 构建产物与未接入时逐字节一致（M5 验收 #1）。
 *
 * 只用 anon/publishable key：RLS 保证它只能碰 `auth.uid() = user_id` 的行
 * （m5-task-breakdown §2）。service key 永远不进这个仓库、不进前端。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;

/** 已配置时返回单例客户端；未配置（或 SSR 无 env）返回 null。 */
export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = (import.meta.env.PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  cached = url && key ? createClient(url, key) : null;
  return cached;
}

/** 测试用：清掉单例缓存。 */
export function resetSupabaseForTest(): void {
  cached = undefined;
}
