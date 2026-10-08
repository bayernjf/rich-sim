/**
 * M5 S1 · 登录入口（client:load 岛，挂导航区）。
 *
 * 三条纪律：
 * - **未配置 Supabase 就不渲染**（M5 验收 #1：未接入时全站零变化）；
 *   SSR 与客户端首帧都返回 null，挂上客户端、读到 env 后才出现。
 * - **会话恢复**走 supabase-js 的 onAuthStateChange——magic link 点回来
 *   落在任意页面，这个岛自己换到已登录态，不需要专门的重定向页。
 * - **事件零 props**：`auth:login` / `auth:logout` 不带邮箱（PII 不出本机）。
 */
import { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { looksLikeEmail, sendMagicLink, signOut, stateFromSession, type AuthState } from '../lib/auth';
import { track } from '../lib/analytics';
import { format, t } from '../lib/messages';
import type { Locale } from '../lib/i18n';

export default function AuthButton({ locale = 'zh' }: { locale?: Locale }) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<AuthState>({ status: 'signed-out' });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
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

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!looksLikeEmail(trimmed)) {
      setNotice(t('auth.invalidEmail', locale));
      return;
    }
    setBusy(true);
    const result = await sendMagicLink(trimmed, window.location.href.split('#')[0]);
    setBusy(false);
    if (result.ok) {
      setState({ status: 'sent', email: trimmed });
      setNotice(format(t('auth.sent', locale), { email: trimmed }));
    } else {
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
          <div className="flex gap-2">
            <input
              data-auth-email-input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !busy) void handleSend();
              }}
              placeholder={t('auth.emailPlaceholder', locale)}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-sm text-ink placeholder:text-muted"
            />
            <button
              type="button"
              data-auth-send
              disabled={busy}
              onClick={() => void handleSend()}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-accent px-4 py-2 text-xs font-semibold text-on-accent disabled:opacity-60"
            >
              {t('auth.sendLink', locale)}
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
