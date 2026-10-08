/**
 * M5 S1 · Auth 逻辑层（magic link 邮箱登录，G2 拍板项）。
 *
 * 为什么只做 magic link：免密码（没有密码就没有密码库要守）、Supabase Auth
 * 内置、海外合规压力最小。Google OAuth 是后置项（m5-task-breakdown §1 S1）。
 *
 * 事件纪律：`auth:login` / `auth:logout` 零 props——邮箱地址是 PII，
 * 不出本机（与 plan:* / progress:view 同一条红线）。
 */
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

export type AuthState =
  | { status: 'signed-out' }
  | { status: 'sent'; email: string }
  | { status: 'signed-in'; email: string };

/** 从 Supabase session 提取本组件需要的最小状态。 */
export function stateFromSession(session: Session | null): AuthState {
  const email = session?.user?.email;
  return email ? { status: 'signed-in', email } : { status: 'signed-out' };
}

export type SendLinkResult = { ok: true } | { ok: false; message: string };

/** 发 magic link；redirectTo 回到当前页（登录后落在用户原来在的地方）。 */
export async function sendMagicLink(email: string, redirectTo: string): Promise<SendLinkResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: 'not-configured' };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (supabase) await supabase.auth.signOut();
}

/** 简单的邮箱形状校验（不是 RFC 全套，只挡明显手滑；真正的校验在服务端）。 */
export function looksLikeEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}
