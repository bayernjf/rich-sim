import { useEffect, useMemo, useRef, useState } from 'react';
import {
  convert,
  dimensionLabel,
  optionLabel,
  type Catalog,
  type Currency,
  type FxSnapshot,
  type LifeChoice,
  type Profile,
} from '@rich-sim/core';
import { readDraft, writeDraft } from '../lib/draft';
import { patchAssumptionDisplay } from '../lib/assumptions';
import { STATIC_FX_SNAPSHOT } from '../lib/defaults';
import { converterLine } from '../lib/converter';
import { format, t } from '../lib/messages';
import type { Locale } from '../lib/i18n';
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
 * - 年成本在本地求和（不走 core 的 scenarioAnnualCost）；S3 换算条例外，它必须
 *   吃 core 的 `wealthTimeEquivalent`，因为币种换算只能在那个函数内部做。
 */

type DesignerShellProps = {
  /** 维度目录（必传）；生产由页面传入 core 的 initialCatalogUSD。 */
  catalog: Catalog;
  /** 界面语言（页面 SSR 解析后传入；省略即中文）。 */
  locale?: Locale;
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

export default function DesignerShell({ catalog, locale = 'zh' }: DesignerShellProps) {
  // SSR 用默认选择渲染（确定性，SSR HTML 即含 7 维标题与选项）；
  // 客户端 mount 后再尝试从 localStorage 恢复。
  const [choices, setChoices] = useState<LifeChoice>(() => defaultChoices(catalog));
  const [persisted, setPersisted] = useState(false);

  // T10 展示层状态：展示本位币 + 换算用 fx 快照（仅展示，不参与引擎计算）。
  // Catalog 以 USD 建模，展示时一律 convert(usdAmount, 'USD', currency, fx)。
  const [currency, setCurrency] = useState<Currency>('USD');
  const [fx, setFx] = useState<FxSnapshot>(() => STATIC_FX_SNAPSHOT);
  /** S3 换算条的分母（只读；换算条本身不写回任何本机状态）。 */
  const [profile, setProfile] = useState<Profile | null>(null);
  /** 本机方案是否已恢复过——换算条上报要等它，见下面的 tracker。 */
  const [restored, setRestored] = useState(false);

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

  // 仅展示层：从 draft 恢复展示币种、fx 快照与已录入的财务现状
  // （不动 choices 的选择/持久化逻辑）。
  // deps 带 currency：CurrencySwitcher 切换时会把 profile 各金额一并换算后写回
  // draft，这里必须重读，否则换算条吃的还是旧币种的分母。不带 fx——它在每次
  // readDraft 里都是新解析出来的对象身份，进 deps 会让本 effect 自己转成死循环。
  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      setCurrency(draft.currency ?? 'USD');
      if (draft.assumptions?.fx) setFx(draft.assumptions.fx);
      setProfile(draft.profile ?? null);
      // 合规清单是 SSR 渲染的，只能印默认值；用户在本机改过假设后，那几个数字
      // 必须是真正在用的那一套，否则这一页在替一个不成立的假设背书。
      if (draft.assumptions) patchAssumptionDisplay(draft.assumptions);
    }
    setRestored(true);
  }, [catalog, currency]);

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

  // S3 换算条：sticky 条常驻一行——已录入财务就换算，没录入就变成 F2 引导句。
  // 金额已经在 profile 币种里（core 函数换算过），这里只加符号与千分位。
  const converter = useMemo(
    () =>
      converterLine(catalog, choices, profile, fx, (local, c) =>
        local.toLocaleString('en-US', {
          style: 'currency',
          currency: c,
          maximumFractionDigits: 0,
        }),
        locale,
      ),
    [catalog, choices, profile, fx, locale],
  );

  // 一次页面访问只报一条 converter:view（随选择重算时不重复刷屏）。
  // 必须等 restored：mount 首帧 profile 恒为 null，否则每个已录入财务的用户
  // 回访设计器都会被记成 no-profile——把漏斗最想看的那一步反着记。
  const converterTracked = useRef(false);
  useEffect(() => {
    if (!restored || !converter || converterTracked.current) return;
    converterTracked.current = true;
    track('converter:view', { status: converter.status });
  }, [restored, converter]);

  return (
    <section className="pb-32">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          {t('designer.eyebrow', locale)}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{t('designer.h1', locale)}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t('designer.intro', locale)}
        </p>
      </header>

      {/* T10 显示币种切换器（展示层；选择/持久化逻辑见组件内说明） */}
      <div className="mt-6 rounded-2xl border border-line bg-panel p-4">
        <CurrencySwitcher
          currency={currency}
          fx={fx}
          onChanged={handleCurrencyChanged}
          locale={locale}
        />
      </div>

      <div className="mt-6 space-y-4">
        {catalog.dimensions.map((dim, idx) => (
          <div
            key={dim.id}
            role="radiogroup"
            aria-label={dimensionLabel(dim, locale)}
            className="rounded-2xl border border-line bg-panel p-4"
          >
            <h2 className="text-base font-semibold">
              <span className="mr-2 font-mono text-sm text-muted">
                {String(idx + 1).padStart(2, '0')}
              </span>
              {dimensionLabel(dim, locale)}
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
                      {optionLabel(opt, locale)}
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                      {fmt(opt.annualCost)}
                      <span className="ml-1 text-xs">{locale === 'en' ? '/yr' : '/年'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        {t('designer.disclaimer', locale)}
      </p>

      {/* sticky 底部实时预览条（常驻）：年成本 + S3 换算条 */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line-strong bg-panel/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-muted">
                {format(t('designer.totalLabel', locale), { currency })}
              </div>
              <div className="font-mono text-xl font-semibold tabular-nums text-accent">
                {fmt(total)}
              </div>
            </div>
            <div className="text-right text-xs leading-relaxed text-muted" aria-live="polite">
              <div>{t(persisted ? 'designer.saved' : 'designer.notSaved', locale)}</div>
              <div className="mt-0.5">
                {t(persisted ? 'designer.savedHint' : 'designer.saveHint', locale)}
              </div>
            </div>
          </div>

          {converter && (
            <p
              data-converter-line
              className="mt-2 border-t border-line pt-2 text-xs leading-relaxed text-muted"
            >
              {converter.sentence}
              {converter.status === 'no-profile' && (
                <a
                  className="ml-1 whitespace-nowrap text-accent underline-offset-2 hover:underline"
                  href="/app/finance"
                >
                  {t('designer.gotoFinance', locale)}
                </a>
              )}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
