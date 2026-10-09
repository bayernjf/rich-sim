import { useEffect, useState } from 'react';
import { convert, type FxSnapshot } from '@rich-sim/core';
import { t } from '../lib/messages';
import type { Locale } from '../lib/i18n';
import { track } from '../lib/analytics';

/**
 * T3 · 汇率时间机（React 岛）——technical-design §4.2 的 M2 历史汇率 +
 * 汇率波动教育点，落点选 sim 页（归属「看见 / 感受」通道，与失去模拟同族）。
 *
 * 设计纪律：
 * - **零重算、零污染假设**：历史汇率只做教育展示，不写进任何冻结的
 *   FxSnapshot 假设；换算锚定 $1M（教学数字），走 core `convert`。
 * - 预设锚点选**工作日**（Frankfurter 只有工作日汇率，周末日期会 404）：
 *   2025-10-09（周四）、2021-10-08（周五）、2016-10-07（周五）。
 * - 埋点 `fx:historical` **零 props**——不带上行日期以外的任何信息。
 * - 合规：展示固定标注日期与来源（Frankfurter ECB），不构成汇率建议。
 */
const PRESET_DATES = ['2025-10-09', '2021-10-08', '2016-10-07'] as const;
/** 教学锚：$1M（与起始金三档的最高档一致，纯展示数字）。 */
const NOTIONAL = 1_000_000;

const fmtMoney = (v: number) => `¥${Math.round(v).toLocaleString('en-US')}`;
const fmtDelta = (d: number) =>
  `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%`;

export default function FxTimeMachine({ locale = 'zh' }: { locale?: Locale }) {
  const [today, setToday] = useState<FxSnapshot | null>(null);
  const [date, setDate] = useState<string>('');
  const [hist, setHist] = useState<FxSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 挂载即取今日 CNY 快照，作为「今天值多少」的对比基线。
  useEffect(() => {
    let alive = true;
    fetch('/api/fx?base=CNY')
      .then((r) => (r.ok ? (r.json() as Promise<FxSnapshot>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((s) => {
        if (alive) setToday(s);
      })
      .catch(() => {
        if (alive) setError(t('sim.fxError', locale));
      });
    return () => {
      alive = false;
    };
  }, [locale]);

  const load = async (d: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/fx?base=CNY&date=${d}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = (await res.json()) as FxSnapshot;
      setHist(s);
      setDate(d);
      track('fx:historical');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const histValue = hist ? convert(NOTIONAL, 'USD', 'CNY', hist) : null;
  const todayValue = today ? convert(NOTIONAL, 'USD', 'CNY', today) : null;
  const delta =
    histValue !== null && todayValue !== null && todayValue > 0
      ? (histValue - todayValue) / todayValue
      : null;

  return (
    <div data-fx-machine>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">{t('sim.fxPick', locale)}</span>
        {PRESET_DATES.map((d) => (
          <button
            key={d}
            type="button"
            data-fx-preset={d}
            disabled={busy}
            onClick={() => void load(d)}
            className="min-h-8 rounded-full border border-line px-3 py-1 font-medium text-ink hover:bg-panel-2 disabled:opacity-60"
          >
            {d}
          </button>
        ))}
        <input
          type="date"
          data-fx-date
          value={date}
          max={new Date().toISOString().slice(0, 10)}
          min="1999-01-04"
          disabled={busy}
          onChange={(e) => {
            if (e.target.value) void load(e.target.value);
          }}
          className="min-h-8 rounded-lg border border-line bg-panel-2 px-2 py-1 text-sm text-ink focus-visible:outline-accent"
        />
      </div>

      {busy ? (
        <p className="mt-2 text-xs text-muted" data-fx-result>
          {t('sim.fxLoading', locale)}
        </p>
      ) : error ? (
        <p className="mt-2 text-xs text-danger" role="alert" data-fx-result>
          {t('sim.fxError', locale)}（{error}）
        </p>
      ) : date && histValue !== null && todayValue !== null && delta !== null ? (
        <p className="mt-2 text-sm leading-relaxed text-ink" data-fx-result>
          {date}：$1M ≈ {fmtMoney(histValue)} · 今天 ≈ {fmtMoney(todayValue)} · 波动 {fmtDelta(delta)}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted" data-fx-result>
          {t('sim.fxLead', locale)}
        </p>
      )}
      <p className="mt-1 text-xs leading-relaxed text-muted" data-fx-note>
        {t('sim.fxNote', locale)}
      </p>
    </div>
  );
}
