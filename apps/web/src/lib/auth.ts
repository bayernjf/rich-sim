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
  | { status: 'signed-in'; email: string };

/** 从 Supabase session 提取本组件需要的最小状态。 */
export function stateFromSession(session: Session | null): AuthState {
  const email = session?.user?.email;
  return email ? { status: 'signed-in', email } : { status: 'signed-out' };
}

export type PasswordAuthResult = { ok: true } | { ok: false; message: string };

/**
 * 邮箱+密码登录 / 注册（2026-10-09 起替换 magic link，发起人拍板）。
 * Confirm email 已在 Supabase 关闭：注册成功即拿到 session，无邮件环节。
 */
export async function signInWithPassword(email: string, password: string): Promise<PasswordAuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: 'not-configured' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function signUpWithPassword(email: string, password: string): Promise<PasswordAuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: 'not-configured' };
  const { error } = await supabase.auth.signUp({ email, password });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/** Supabase 默认最短密码长度；真正的校验在服务端，这里只挡明显过短。 */
export const MIN_PASSWORD_LENGTH = 6;

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (supabase) await supabase.auth.signOut();
}

/** 简单的邮箱形状校验（不是 RFC 全套，只挡明显手滑；真正的校验在服务端）。 */
export function looksLikeEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}
