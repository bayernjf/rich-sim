import { useState } from 'react';
import { convert, type Currency, type FxSnapshot, type Profile } from '@rich-sim/core';
import { readDraft, writeDraft } from '../lib/draft';
import { DEFAULT_ASSUMPTIONS } from '../lib/defaults';
import { SUPPORTED_CURRENCIES } from '../lib/fx';

/**
 * T10 · 显示币种切换器（React 岛）。
 *
 * 切换行为（CONVENTIONS §币种口径，冻结）：
 *   ① 读 draft；
 *   ② 经同源 /api/fx 拿新 fx（服务端已做实时→兜底，恒返回合法 FxSnapshot）；
 *   ③ 若已有 profile，把各金额 convert 到新币种并更新 profile.currency；
 *   ④ draft.currency = 新币种、draft.assumptions.fx = 新快照；
 *   ⑤ writeDraft（一律经 lib/draft.ts，不绕过）。
 *
 * 渲染态（currency / fx）由父组件 DesignerShell 持有；切换成功后回调
 * onChanged，父组件据此重算展示金额——本组件不自行改展示数字。
 */

type CurrencySwitcherProps = {
  /** 当前展示本位币（= draft.currency）。 */
  currency: Currency;
  /** 当前展示用 fx 快照（= draft.assumptions.fx 或静态兜底）。 */
  fx: FxSnapshot;
  /** 切换成功后回调，父组件更新展示状态。 */
  onChanged: (currency: Currency, fx: FxSnapshot) => void;
};

/** 用新快照把 profile 各金额从旧币种换算到新币种（旧==profile.currency）。 */
function convertProfile(p: Profile, from: Currency, to: Currency, fx: FxSnapshot): Profile {
  return {
    income: convert(p.income, from, to, fx),
    expense: convert(p.expense, from, to, fx),
    savings: convert(p.savings, from, to, fx),
    debt: convert(p.debt, from, to, fx),
    currency: to,
  };
}

export default function CurrencySwitcher({
  currency,
  fx,
  onChanged,
}: CurrencySwitcherProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (next: Currency) => {
    if (next === currency || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 同源代理：实时优先，失败由服务端降级静态快照。
      const res = await fetch(`/api/fx?base=${next}`);
      if (!res.ok) throw new Error(`/api/fx HTTP ${res.status}`);
      const nextFx = (await res.json()) as FxSnapshot;

      const draft = readDraft();
      const nextProfile =
        draft?.profile != null
          ? convertProfile(draft.profile, currency, next, nextFx)
          : null;

      writeDraft({
        schemaVersion: 1,
        choices: draft?.choices ?? [],
        profile: nextProfile,
        currency: next,
        assumptions: draft?.assumptions
          ? { ...draft.assumptions, fx: nextFx }
          : { ...DEFAULT_ASSUMPTIONS, fx: nextFx },
        updatedAt: new Date().toISOString(),
      });

      onChanged(next, nextFx);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-currency-switcher>
      <label
        htmlFor="display-currency"
        className="text-xs font-medium text-muted"
      >
        显示币种
      </label>
      <div className="mt-1 flex items-center gap-2">
        <select
          id="display-currency"
          value={currency}
          disabled={busy}
          onChange={(e) => void handleChange(e.target.value as Currency)}
          className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink focus-visible:outline-accent"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          {busy ? '切换中…' : `汇率：${fx.source} · ${fx.date}`}
        </span>
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-500">切换失败：{error}</p>
      ) : null}
    </div>
  );
}
