/**
 * S2 · 账单日的「现实参照」（client:load 岙）。
 *
 * §2.4 参数 3：已录入收入 → 每张账单显示「= 你 X 个月工资」；未录入 →
 * 提示录入并可跳过。数据只读本机草稿（readDraft），SSR 首帧返回 null
 * 避免 hydration mismatch——与 ContinueDraft 同一模式。
 */
import { useEffect, useState } from 'react';
import { readDraft } from '../lib/draft';

export type SimBill = { optionLabel: string; annualCost: number };

export default function SimRealityCompare({ bills }: { bills: SimBill[] }) {
  const [income, setIncome] = useState<number | null>(null);

  useEffect(() => {
    const draft = readDraft();
    if (draft?.profile && draft.profile.income > 0) setIncome(draft.profile.income);
  }, []);

  if (income === null) {
    return (
      <p className="mt-4 rounded-lg border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-muted">
        先填 4 个数，这些账单就能换算成「你几个月工资」。
        <a className="ml-1 text-accent underline-offset-2 hover:underline" href="/app/finance">
          去录入 →
        </a>
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-1 text-sm text-muted">
      {bills.map((bill) => {
        const months = bill.annualCost / income;
        const shown = months >= 100 ? Math.round(months).toLocaleString('en-US') : months.toFixed(1);
        return (
          <li key={bill.optionLabel} className="flex items-baseline justify-between gap-3">
            <span>{bill.optionLabel}</span>
            <span className="font-mono tabular-nums">≈ 你 {shown} 个月工资</span>
          </li>
        );
      })}
    </ul>
  );
}
