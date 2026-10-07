/**
 * B6 · 首页「继续上次方案」入口（client:load 岛）。
 *
 * 挂载后读取本机草稿，按完成度给出下一步链接（逻辑见 lib/draft.ts 的
 * nextDraftStep）；无草稿则完全不渲染。SSR 首帧与客户端首帧都返回 null，
 * 避免 hydration mismatch，也保证无 JS / SSR 时不暴露依赖 localStorage 的内容。
 */
import { useEffect, useState } from 'react';
import { nextDraftStep, readDraft, type DraftStep } from '../lib/draft';
import { format, t, type MessageKey } from '../lib/messages';
import type { Locale } from '../lib/i18n';

function formatTime(iso: string, locale: Locale): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return format(t('continue.stamp', locale), { date: `${dt.getMonth() + 1}/${dt.getDate()} ${hh}:${mm}` });
}

const STEP_KEYS: Record<DraftStep, MessageKey> = {
  '/app/result': 'continue.result',
  '/app/finance': 'continue.finance',
  // nextDraftStep 在没有选择时返回设计器；原先这里写的是「继续富豪模拟」，
  // 指向的却是 /app/designer。两种语言一起改对（无测试或文档钉过旧文案）。
  '/app/designer': 'continue.designer',
};

export default function ContinueDraft({ locale = 'zh' }: { locale?: Locale }) {
  const [step, setStep] = useState<DraftStep | null>(null);
  const [when, setWhen] = useState('');

  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    setStep(nextDraftStep(draft));
    if (draft.updatedAt) setWhen(formatTime(draft.updatedAt, locale));
  }, [locale]);

  if (!step) return null;

  return (
    <div className="mt-4 flex flex-col items-start gap-1.5">
      <a
        href={step}
        className="inline-flex min-h-11 items-center rounded-full border border-line bg-accent-soft px-5 py-2.5 text-sm font-medium text-accent"
      >
        {t(STEP_KEYS[step], locale)} →
      </a>
      {when ? (
        <p className="text-xs text-muted">
          {when} · {t('continue.note', locale)}
        </p>
      ) : null}
    </div>
  );
}
