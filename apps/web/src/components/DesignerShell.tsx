import { useEffect, useMemo, useState } from 'react';
import {
  convert,
  type Catalog,
  type Currency,
  type FxSnapshot,
  type LifeChoice,
} from '@rich-sim/core';
import { readDraft, writeDraft } from '../lib/draft';
import { STATIC_FX_SNAPSHOT } from '../lib/defaults';
import { track } from '../lib/analytics';
import CurrencySwitcher from './CurrencySwitcher';

/**
 * T06 · 理想生活设计器（mobile-first）。
 *
 * - 7 个维度以卡片列表呈现，每维单选；选项卡显示中文 label + 年成本（USD, 等宽数字）。
 * - 年成本实时预览 + 保存状态，sticky 底部条常驻。
 * - 选择经 lib/draft.ts 持久化到 localStorage（key `rich-sim:plan:v1`），mount 时恢复。
 * - catalog 为必传 prop，由页面传入 core 的 `initialCatalogUSD`（金额唯一事实源，
 *   已全部附公开来源），组件维度数量不写死。
 * - 不 import core 任何运行时函数；年成本在本地求和。
 */

type DesignerShellProps = {
  /** 维度目录（必传）；生产由页面传入 core 的 initialCatalogUSD。 */
  catalog: Catalog;
};

/** 每维默认选中一项（isDefault，否则第一项）。 */
function defaultChoices(catalog: Catalog): LifeChoice {
  return catalog.dimensions.map((dim) => {
    const chosen = dim.options.find((o) => o.isDefault) ?? dim.options[0];
    return { dimension: dim.id, optionId: chosen.id };
  });
}

/** 校验一份已存 choices 是否与当前 catalog 完全对应（每维一项且 option 存在）。 */
function isValidChoices(catalog: Catalog, choices: LifeChoice): boolean {
  if (!Array.isArray(choices) || choices.length !== catalog.dimensions.length) return false;
  return catalog.dimensions.every((dim) =>
    choices.some(
      (c) => c.dimension === dim.id && dim.options.some((o) => o.id === c.optionId),
    ),
  );
}

/** 本地求和：所选选项年成本之和（M1 口径 = 简单求和，通胀暂不参与）。 */
function annualTotal(catalog: Catalog, choices: LifeChoice): number {
  let sum = 0;
  for (const c of choices) {
    const dim = catalog.dimensions.find((d) => d.id === c.dimension);
    const opt = dim?.options.find((o) => o.id === c.optionId);
    if (opt) sum += opt.annualCost;
  }
  return sum;
}

export default function DesignerShell({ catalog }: DesignerShellProps) {
  // SSR 用默认选择渲染（确定性，SSR HTML 即含 7 维标题与选项）；
  // 客户端 mount 后再尝试从 localStorage 恢复。
  const [choices, setChoices] = useState<LifeChoice>(() => defaultChoices(catalog));
  const [persisted, setPersisted] = useState(false);

  // T10 展示层状态：展示本位币 + 换算用 fx 快照（仅展示，不参与引擎计算）。
  // Catalog 以 USD 建模，展示时一律 convert(usdAmount, 'USD', currency, fx)。
  const [currency, setCurrency] = useState<Currency>('USD');
  const [fx, setFx] = useState<FxSnapshot>(() => STATIC_FX_SNAPSHOT);

  // 仅在浏览器执行（localStorage 不可用于 SSR）。
  useEffect(() => {
    const draft = readDraft();
    if (draft && isValidChoices(catalog, draft.choices)) {
      setChoices(draft.choices);
      setPersisted(true);
    } else {
      setPersisted(false);
    }
  }, [catalog]);

  // 仅展示层：从 draft 恢复展示币种与 fx 快照（不动 choices 的选择/持久化逻辑）。
  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      setCurrency(draft.currency ?? 'USD');
      if (draft.assumptions?.fx) setFx(draft.assumptions.fx);
    }
  }, [catalog]);

  /** 切换器切换成功回调：更新展示态（持久化已由 CurrencySwitcher 经 writeDraft 完成）。 */
  const handleCurrencyChanged = (next: Currency, nextFx: FxSnapshot) => {
    setCurrency(next);
    setFx(nextFx);
  };

  /** 把 Catalog 的 USD 年成本换算到展示本位币并格式化（等宽数字）。 */
  const fmt = (usdAmount: number) => {
    const v = convert(usdAmount, 'USD', currency, fx);
    return v.toLocaleString('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
  };

  const handleSelect = (dimensionId: string, optionId: string) => {
    const next = choices.map((c) =>
      c.dimension === dimensionId ? { ...c, optionId } : c,
    );
    setChoices(next);
    // 经 lib/draft.ts 写回；保留 draft 其余字段，不绕过入口。
    const draft = readDraft();
    writeDraft({
      schemaVersion: 1,
      choices: next,
      profile: draft?.profile ?? null,
      currency: draft?.currency ?? 'USD',
      assumptions: draft?.assumptions ?? null,
      updatedAt: new Date().toISOString(),
    });
    setPersisted(true);
    track('designer:select', { dimension: dimensionId, option: optionId });
  };

  const total = useMemo(() => annualTotal(catalog, choices), [catalog, choices]);
  const selectedId = (dimensionId: string) =>
    choices.find((c) => c.dimension === dimensionId)?.optionId;

  return (
    <section className="pb-32">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          理想生活设计器
        </p>
        <h1 className="mt-2 text-2xl font-semibold">设计你想过的生活</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          在每个维度里选一项，系统把它们的年成本加总。金额为美国全国口径的实际自付年现金支出，
          按公开统计估算（数据年 2024；富豪档为行业估算），仅用于财商教育，不代表真实报价。
        </p>
      </header>

      {/* T10 显示币种切换器（展示层；选择/持久化逻辑见组件内说明） */}
      <div className="mt-6 rounded-2xl border border-line bg-panel p-4">
        <CurrencySwitcher
          currency={currency}
          fx={fx}
          onChanged={handleCurrencyChanged}
        />
      </div>

      <div className="mt-6 space-y-4">
        {catalog.dimensions.map((dim, idx) => (
          <div
            key={dim.id}
            role="radiogroup"
            aria-label={dim.label}
            className="rounded-2xl border border-line bg-panel p-4"
          >
            <h2 className="text-base font-semibold">
              <span className="mr-2 font-mono text-sm text-muted">
                {String(idx + 1).padStart(2, '0')}
              </span>
              {dim.label}
            </h2>
            <div className="mt-3 grid gap-2">
              {dim.options.map((opt) => {
                const selected = selectedId(dim.id) === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handleSelect(dim.id, opt.id)}
                    className={[
                      'flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left',
                      'transition-colors',
                      selected
                        ? 'border-accent bg-accent-soft text-ink'
                        : 'border-line bg-panel-2 text-ink hover:border-line-strong',
                    ].join(' ')}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden="true"
                        className={[
                          'inline-block h-2 w-2 rounded-full',
                          selected ? 'bg-accent' : 'bg-line-strong',
                        ].join(' ')}
                      />
                      {opt.label}
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                      {fmt(opt.annualCost)}
                      <span className="ml-1 text-xs">/年</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        免责声明：本工具仅做静态推演与财商教育，不构成投资建议，不推荐任何金融产品；
        结果不承诺未来收益。年成本按当前所选选项简单加总，通胀作为假设记录、暂不参与换算。
      </p>

      {/* sticky 底部实时预览条（常驻） */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line-strong bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-xs text-muted">
              理想生活年成本（{currency}）
            </div>
            <div className="font-mono text-xl font-semibold tabular-nums text-accent">
              {fmt(total)}
            </div>
          </div>
          <div className="text-right text-xs leading-relaxed text-muted" aria-live="polite">
            <div>{persisted ? '已保存 · 本机' : '未保存'}</div>
            <div className="mt-0.5">
              {persisted ? '选择已自动存入本机' : '选择后自动保存'}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
