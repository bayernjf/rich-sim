/**
 * B6 · 首页「继续上次方案」入口（client:load 岛）。
 *
 * 挂载后读取本机草稿，按完成度给出下一步链接（逻辑见 lib/draft.ts 的
 * nextDraftStep）；无草稿则完全不渲染。SSR 首帧与客户端首帧都返回 null，
 * 避免 hydration mismatch，也保证无 JS / SSR 时不暴露依赖 localStorage 的内容。
 */
import { useEffect, useState } from 'react';
import { nextDraftStep, readDraft, type DraftStep } from '../lib/draft';

function formatTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `上次编辑 ${dt.getMonth() + 1}/${dt.getDate()} ${hh}:${mm}`;
}

const LABELS: Record<DraftStep, string> = {
  '/app/result': '继续查看测算结果',
  '/app/finance': '继续填写财务信息',
  '/app/designer': '继续富豪模拟',
};

export default function ContinueDraft() {
  const [step, setStep] = useState<DraftStep | null>(null);
  const [when, setWhen] = useState('');

  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    setStep(nextDraftStep(draft));
    if (draft.updatedAt) setWhen(formatTime(draft.updatedAt));
  }, []);

  if (!step) return null;

  return (
    <div className="mt-4 flex flex-col items-start gap-1.5">
      <a
        href={step}
        className="inline-flex min-h-11 items-center rounded-full border border-line bg-accent-soft px-5 py-2.5 text-sm font-medium text-accent"
      >
        {LABELS[step]} →
      </a>
      {when ? <p className="text-xs text-muted">{when} · 草稿仅保存在本机</p> : null}
    </div>
  );
}
