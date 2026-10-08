/**
 * M5 S1 · 登录入口（client:load 岛，挂导航区）。
 *
 * 三条纪律：
 * - **未配置 Supabase 就不渲染**（M5 验收 #1：未接入时全站零变化）；
 *   SSR 与客户端首帧都返回 null，挂上客户端、读到 env 后才出现。
 * - **会话恢复**走 supabase-js 的 onAuthStateChange——登录/注册成功后
 *   岛自己换到已登录态；邮箱+密码模式（Confirm email 已关，注册即登录）。
 * - **事件零 props**：`auth:login` / `auth:logout` 不带邮箱（PII 不出本机）。
 */
import { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import {
  looksLikeEmail,
  MIN_PASSWORD_LENGTH,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  stateFromSession,
  type AuthState,
} from '../lib/auth';
import { track } from '../lib/analytics';
import { format, t } from '../lib/messages';
import type { Locale } from '../lib/i18n';

export default function AuthButton({ locale = 'zh' }: { locale?: Locale }) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<AuthState>({ status: 'signed-out' });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    setEnabled(true);
    supabase.auth.getSession().then(({ data }) => setState(stateFromSession(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = stateFromSession(session);
      setState((prev) => {
        if (prev.status !== 'signed-in' && next.status === 'signed-in') track('auth:login');
        return next;
      });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!enabled) return null;

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!looksLikeEmail(trimmed)) {
      setNotice(t('auth.invalidEmail', locale));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setNotice(format(t('auth.shortPassword', locale), { min: String(MIN_PASSWORD_LENGTH) }));
      return;
    }
    setBusy(true);
    const result = mode === 'sign-in'
      ? await signInWithPassword(trimmed, password)
      : await signUpWithPassword(trimmed, password);
    setBusy(false);
    // 成功时 onAuthStateChange 会把岛切到已登录态，这里只需报错。
    if (!result.ok) {
      setNotice(format(t('auth.failed', locale), { message: result.message }));
    }
  };

  if (state.status === 'signed-in') {
    return (
      <div data-auth className="flex items-center gap-2">
        <span data-auth-email className="max-w-40 truncate text-xs text-muted" title={state.email}>
          {state.email}
        </span>
        <button
          type="button"
          data-auth-signout
          onClick={() => {
            track('auth:logout');
            void signOut();
          }}
          className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 py-1.5 text-xs font-medium text-ink"
        >
          {t('auth.signOut', locale)}
        </button>
      </div>
    );
  }

  return (
    <div data-auth className="relative">
      <button
        type="button"
        data-auth-open
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 py-1.5 text-xs font-medium text-ink"
      >
        {t('auth.signIn', locale)}
      </button>
      {open && (
        <div
          data-auth-panel
          className="absolute right-0 z-10 mt-2 w-72 rounded-2xl border border-line bg-panel p-4 shadow-lg"
        >
          <div className="flex gap-2" role="group" aria-label="mode">
            <button
              type="button"
              data-auth-mode="sign-in"
              aria-pressed={mode === 'sign-in'}
              onClick={() => setMode('sign-in')}
              className={`min-h-8 flex-1 rounded-full px-3 text-xs font-medium ${mode === 'sign-in' ? 'bg-accent text-on-accent' : 'border border-line text-ink'}`}
            >
              {t('auth.signIn', locale)}
            </button>
            <button
              type="button"
              data-auth-mode="sign-up"
              aria-pressed={mode === 'sign-up'}
              onClick={() => setMode('sign-up')}
              className={`min-h-8 flex-1 rounded-full px-3 text-xs font-medium ${mode === 'sign-up' ? 'bg-accent text-on-accent' : 'border border-line text-ink'}`}
            >
              {t('auth.signUp', locale)}
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <input
              data-auth-email-input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('auth.emailPlaceholder', locale)}
              className="min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink placeholder:text-muted"
            />
            <input
              data-auth-password-input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !busy) void handleSubmit();
              }}
              placeholder={t('auth.passwordPlaceholder', locale)}
              className="min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink placeholder:text-muted"
            />
            <button
              type="button"
              data-auth-send
              disabled={busy}
              onClick={() => void handleSubmit()}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-4 py-2 text-xs font-semibold text-on-accent disabled:opacity-60"
            >
              {mode === 'sign-in' ? t('auth.signIn', locale) : t('auth.signUp', locale)}
            </button>
          </div>
          <p data-auth-notice aria-live="polite" className="mt-2 min-h-4 text-xs leading-relaxed text-muted">
            {notice || t('auth.note', locale)}
          </p>
        </div>
      )}
    </div>
  );
}
