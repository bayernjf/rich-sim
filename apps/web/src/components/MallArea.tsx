/**
 * 富豪商城（`docs/sim-shopping-mall.md` v1 · S1+S2 + 商城扩展）：
 * 商品卡片流 + 分类 tab + 购物车抽屉 +「结算 = 账单日」反转。
 *
 * 商城扩展三件（sim-shopping-mall.md §8）：
 * - 商品详情卡：每张卡可展开成本构成（core optionCostComponents）与强制变卖口径；
 * - 收藏夹：书签 + 独立 tab，只浏览，**永不进**车 / 账单 / 一键成目标；
 * - 年度账单环形图：抽屉内把下一期账单按基线 + 品类拆桶（cartKindCosts）。
 *
 * 算术层零自创：shoppingPool / saveCartItem / cartBurdenSummary /
 * adoptCartAsGoal / resaleRecovery 全部复用 core 与 sim-content。冒烟钩子与旧版
 * 完全一致（data-shopping-area / data-cart-count / data-cart-status /
 * data-adopt-goal、卡片为 li、按钮名「加入购物车 / 移出购物车」）。
 *
 * 反电商纪律：不做促销话术与催单设计、不用真实品牌图（禁语由 copy-guard 闸门钉住）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Interpolated from './Interpolated';
import {
  RESALE_RECOVERY_RATE,
  dimensionLabel,
  optionCostComponents,
  resaleRecovery,
} from '@rich-sim/core';
import {
  CARD_A,
  CARD_A_ANNUAL_INCOME,
  CARD_A_LAST_YEAR_COST,
  cartBurdenSummary,
  cartKindCosts,
  poolOptionLabel,
  type CartEntry,
  type ShoppingItem,
} from '../lib/sim-content';
import {
  type CartItem,
  readCart,
  readFavorites,
  saveCartItem,
  saveFavoriteItem,
  sellCartItem,
} from '../lib/sim-draft';
import { adoptCartAsGoal } from '../lib/sim-bridge';
import { format, t, type MessageKey } from '../lib/messages';
import type { Locale } from '../lib/i18n';
import { track } from '../lib/analytics';

type Props = { items: ShoppingItem[]; baselineAnnualCost: number; locale?: Locale };
type Band = 'green' | 'yellow' | 'red';
type Tab = 'all' | 'asset' | 'consumer' | 'experience' | 'favorites';
type Kind = 'asset' | 'consumer' | 'experience';

const statusBanner = (locale: Locale): Record<Band, { label: string; cls: string; note: string }> => ({
  green: { label: t('sim.bannerGreen', locale), cls: 'border-accent bg-accent-soft text-ink', note: t('sim.bannerGreenNote', locale) },
  yellow: { label: t('sim.bannerYellow', locale), cls: 'border-line bg-panel text-ink', note: t('sim.bannerYellowNote', locale) },
  red: { label: t('sim.bannerRed', locale), cls: 'border-danger bg-panel text-danger', note: t('sim.bannerRedNote', locale) },
});

const TABS: { id: Tab; kind?: Kind; label: MessageKey }[] = [
  { id: 'all', label: 'mall.tab.all' },
  { id: 'asset', kind: 'asset', label: 'mall.tab.asset' },
  { id: 'consumer', kind: 'consumer', label: 'mall.tab.consumer' },
  { id: 'experience', kind: 'experience', label: 'mall.tab.experience' },
  { id: 'favorites', label: 'mall.tab.favorites' },
];

const KIND_LABEL: Record<Kind, MessageKey> = {
  asset: 'sim.kind.asset',
  consumer: 'sim.kind.consumer',
  experience: 'sim.kind.experience',
};

/** 每个维度一个通用图标（emoji 作占位，AI 插画是 §6 P2 可选项）。 */
const DIMENSION_ICON: Record<string, string> = {
  living: '🏠', transport: '✈️', family: '🎓', travel: '🛥️',
  'health-insurance': '🩺', 'dining-daily': '🍽️', flexibility: '👥',
};

/** 环形图品类色（global.css 令牌：基线灰 / 资产墨 / 消费青 / 体验金）。 */
const SLICE_COLOR: Record<'baseline' | Kind, string> = {
  baseline: 'var(--c-muted)',
  asset: 'var(--c-ink)',
  consumer: 'var(--c-chart-teal)',
  experience: 'var(--c-accent)',
};

type BillSlice = { key: 'baseline' | Kind; value: number; label: string };

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}
function itemKey(item: CartItem): string {
  return `${item.dimension}/${item.optionId}`;
}

/** 年度账单环形图（纯 SVG，无第三方图表库；图例本身就是可读的文本等价物）。 */
function BillDonut({ slices, locale }: { slices: BillSlice[]; locale: Locale }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const R = 64;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div data-bill-chart className="mt-4 rounded-xl border border-line bg-canvas px-4 py-3">
      <p className="text-xs font-semibold text-ink">{t('mall.chartTitle', locale)}</p>
      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
        <svg viewBox="0 0 160 160" role="img" className="size-40 shrink-0" aria-label={t('mall.chartTitle', locale)}>
          <g transform="rotate(-90 80 80)">
            <circle cx="80" cy="80" r={R} fill="none" stroke="var(--c-line)" strokeWidth="22" />
            {slices.map((slice) => {
              const fraction = slice.value / total;
              const len = Math.max(0, fraction * C - (slices.length > 1 ? 2 : 0));
              const offset = -acc;
              acc += fraction * C;
              return (
                <circle
                  key={slice.key}
                  data-bill-ring={slice.key}
                  cx="80"
                  cy="80"
                  r={R}
                  fill="none"
                  stroke={SLICE_COLOR[slice.key]}
                  strokeWidth="22"
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={offset}
                />
              );
            })}
          </g>
          <text x="80" y="76" textAnchor="middle" fontSize="11" fill="var(--c-muted)">
            {t('mall.chartTotal', locale)}
          </text>
          <text x="80" y="97" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--c-ink)">
            {money(total)}
          </text>
        </svg>
        <ul className="w-full min-w-0 flex-1 space-y-1.5" aria-label={t('mall.chartTitle', locale)}>
          {slices.map((slice) => (
            <li
              key={slice.key}
              data-bill-slice={slice.key}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="flex min-w-0 items-center gap-2 text-muted">
                <span
                  aria-hidden="true"
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ background: SLICE_COLOR[slice.key] }}
                />
                <span className="truncate">{slice.label}</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-ink">
                {money(slice.value)}
                <span className="ml-1 text-muted">{Math.round((slice.value / total) * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">{t('mall.chartNote', locale)}</p>
    </div>
  );
}

export default function MallArea({ items, baselineAnnualCost, locale = 'zh' }: Props) {
  const [mounted, setMounted] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<CartItem[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [soldNotice, setSoldNotice] = useState<{ label: string; amount: number } | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCart(readCart());
    setFavorites(readFavorites());
    setMounted(true);
  }, []);

  // 抽屉：Esc 关闭 + 初始焦点进抽屉。
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    drawerRef.current?.querySelector<HTMLElement>('button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const selected = useMemo(() => new Set(cart.map(itemKey)), [cart]);
  const favoredSet = useMemo(() => new Set(favorites.map(itemKey)), [favorites]);

  const baselineChoices: CartEntry[] = CARD_A.choices.map((choice) => ({
    dimension: choice.dimension,
    optionId: choice.optionId,
  }));

  const summary = useMemo(
    () =>
      cartBurdenSummary(
        cart,
        items,
        baselineChoices,
        baselineAnnualCost,
        CARD_A_ANNUAL_INCOME - CARD_A_LAST_YEAR_COST,
      ),
    // baselineChoices 内容恒定，不进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, items, baselineAnnualCost],
  );

  const kindCosts = useMemo(
    () => cartKindCosts(cart, items, baselineChoices),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, items],
  );

  const resellValue = useMemo(() => {
    const asset = cart
      .map((ci) =>
        items.find(
          (entry) =>
            entry.dimension === ci.dimension && entry.option.id === ci.optionId && entry.option.kind === 'asset',
        ),
      )
      .filter((entry): entry is ShoppingItem => Boolean(entry))
      .sort((a, b) => b.option.annualCost - a.option.annualCost)[0];
    return asset
      ? {
          label: poolOptionLabel(asset.option, locale),
          value: Math.round(resaleRecovery(asset.option.annualCost)),
        }
      : null;
  }, [cart, items, locale]);

  const visibleItems = useMemo(() => {
    if (tab === 'favorites') {
      return favorites
        .map((fav) =>
          items.find((entry) => entry.dimension === fav.dimension && entry.option.id === fav.optionId),
        )
        .filter((entry): entry is ShoppingItem => Boolean(entry))
        .sort((a, b) => b.option.annualCost - a.option.annualCost);
    }
    const kind = TABS.find((entry) => entry.id === tab)?.kind;
    return items
      .filter((item) => (kind ? item.option.kind === kind : true))
      .sort((a, b) => b.option.annualCost - a.option.annualCost);
  }, [items, tab, favorites]);

  const cartItems = useMemo(
    () =>
      cart
        .map((ci) => items.find((entry) => entry.dimension === ci.dimension && entry.option.id === ci.optionId))
        .filter((entry): entry is ShoppingItem => Boolean(entry)),
    [cart, items],
  );

  const slices: BillSlice[] = [
    { key: 'baseline', value: baselineAnnualCost, label: t('mall.chartBaseline', locale) },
    ...((['asset', 'consumer', 'experience'] as Kind[])
      .filter((kind) => kindCosts[kind] > 0)
      .map((kind) => ({ key: kind, value: kindCosts[kind], label: t(KIND_LABEL[kind], locale) }))),
  ];

  if (!mounted) return null;

  const toggle = (item: ShoppingItem, add: boolean) => {
    const entry = { dimension: item.dimension, optionId: item.option.id };
    setCart(saveCartItem(cart, entry, add));
    track(add ? 'sim:add' : 'sim:remove');
  };

  /** 二手变卖（sim-resale-market §3）：只有资产/消费品可卖，体验不可转卖。 */
  const sellable = (item: ShoppingItem) =>
    (item.option.kind === 'asset' || item.option.kind === 'consumer') && item.option.resellable !== false;

  const sell = (item: ShoppingItem) => {
    const entry = { dimension: item.dimension, optionId: item.option.id };
    const amount = Math.round(resaleRecovery(item.option.annualCost));
    const result = sellCartItem(cart, entry, amount);
    setCart(result.cart);
    setSoldNotice({ label: poolOptionLabel(item.option, locale), amount });
    track('sim:sell');
  };

  const toggleFavorite = (item: ShoppingItem, add: boolean) => {
    const entry = { dimension: item.dimension, optionId: item.option.id };
    setFavorites(saveFavoriteItem(favorites, entry, add));
    track(add ? 'mall:favorite' : 'mall:unfavorite');
  };

  const checkout = () => {
    track('mall:checkout');
    setDrawerOpen(false);
    const bill = document.getElementById('sim-bill-heading');
    bill?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    bill?.classList.add('ring-2', 'ring-accent', 'rounded');
    window.setTimeout(() => bill?.classList.remove('ring-2', 'ring-accent', 'rounded'), 1500);
  };

  return (
    <section aria-labelledby="sim-shop-heading" className="mt-8" data-shopping-area data-mall>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="sim-shop-heading" className="text-base font-semibold text-ink">{t('mall.h', locale)}</h2>
          <p className="mt-1 text-sm text-muted">{t('sim.cart.lead', locale)}</p>
        </div>
        <button
          type="button"
          data-mall-cart-open
          onClick={() => setDrawerOpen(true)}
          className="relative inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-panel-2"
        >
          🛒 {t('mall.cartBtn', locale)}
          <span data-cart-count className="inline-grid min-w-6 place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold text-on-accent">
            {cart.length}
          </span>
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        <Interpolated
          template={t('sim.cart.selected', locale)}
          vars={{ count: cart.length, amount: money(summary.addedAnnualCost) }}
          dataAttr={{ amount: 'data-cart-added' }}
        />
      </p>

      <div role="tablist" aria-label={t('mall.tabs', locale)} className="mt-4 flex flex-wrap gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            data-mall-tab={entry.id}
            onClick={() => setTab(entry.id)}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tab === entry.id ? 'bg-accent text-on-accent' : 'border border-line text-ink hover:bg-panel-2'
            }`}
          >
            {t(entry.label, locale)}
          </button>
        ))}
      </div>

      {tab === 'favorites' && visibleItems.length === 0 && (
        <p data-fav-empty className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm leading-relaxed text-muted">
          {t('mall.favEmpty', locale)}
        </p>
      )}

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleItems.map((item) => {
          const inCart = selected.has(itemKey({ dimension: item.dimension, optionId: item.option.id }));
          const favored = favoredSet.has(itemKey({ dimension: item.dimension, optionId: item.option.id }));
          const components = optionCostComponents(item.option, locale) ?? [];
          return (
            <li
              key={`${item.dimension}/${item.option.id}`}
              data-mall-item={`${item.dimension}/${item.option.id}`}
              className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-colors ${
                inCart ? 'border-accent bg-accent-soft/40' : 'border-line bg-panel'
              }`}
            >
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-canvas text-xl">
                  {DIMENSION_ICON[item.dimension] ?? '🛍️'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{poolOptionLabel(item.option, locale)}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {dimensionLabel({ id: item.dimension, label: item.dimensionLabel }, locale)}
                  </p>
                </div>
                <button
                  type="button"
                  data-fav={`${item.dimension}/${item.option.id}`}
                  aria-pressed={favored}
                  aria-label={favored ? t('mall.favRemove', locale) : t('mall.favAdd', locale)}
                  title={favored ? t('mall.favRemove', locale) : t('mall.favAdd', locale)}
                  onClick={() => toggleFavorite(item, !favored)}
                  className={`grid size-11 shrink-0 place-items-center rounded-xl border text-lg transition-colors ${
                    favored
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-canvas text-muted hover:border-line-strong'
                  }`}
                >
                  <span aria-hidden="true">{favored ? '★' : '☆'}</span>
                </button>
              </div>

              <details data-item-detail className="rounded-lg border border-line bg-canvas px-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-medium text-accent [&::-webkit-details-marker]:hidden">
                  {t('mall.detail', locale)}
                  <span aria-hidden="true" className="text-muted">▾</span>
                </summary>
                <div className="pb-3 text-xs leading-relaxed text-muted">
                  {components.length > 0 ? (
                    <ul data-item-components className="space-y-1">
                      {components.map((component) => (
                        <li key={component} className="flex gap-2">
                          <span aria-hidden="true" className="shrink-0 text-accent">·</span>
                          <span>{component}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t('mall.detailEmpty', locale)}</p>
                  )}
                  {item.option.kind === 'asset' && (
                    <p data-item-resell className="mt-2 text-accent">
                      {format(t('mall.resellable', locale), {
                        rate: `${Math.round(RESALE_RECOVERY_RATE * 100)}%`,
                      })}
                    </p>
                  )}
                  {item.option.kind === 'experience' && (
                    <p data-item-resell className="mt-2">
                      {t('mall.notResellable', locale)}
                    </p>
                  )}
                </div>
              </details>

              <div className="flex items-end justify-between gap-3">
                <p className="font-mono text-lg font-semibold tabular-nums text-ink">
                  {money(item.option.annualCost)}
                  <span className="text-xs font-normal text-muted">/{t('mall.perYear', locale)}</span>
                </p>
                <button
                  type="button"
                  aria-pressed={inCart}
                  data-mall-item-toggle={`${item.dimension}/${item.option.id}`}
                  onClick={() => toggle(item, !inCart)}
                  className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                    inCart ? 'border border-line-strong text-ink hover:bg-panel-2' : 'bg-accent text-on-accent hover:brightness-105'
                  }`}
                >
                  {inCart ? t('sim.cart.remove', locale) : t('sim.cart.add', locale)}
                </button>
              </div>
              {typeof item.option.source === 'string' && (
                <a href={item.option.source} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline-offset-2 hover:underline">Source</a>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-muted">{t('sim.cart.note', locale)}</p>

      {drawerOpen && (
        <div className="fixed inset-0 z-50" role="presentation" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-ink/40" aria-hidden="true"></div>
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('mall.drawerH', locale)}
            data-mall-drawer
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-canvas shadow-2xl motion-safe:animate-[slide-in_200ms_ease-out]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-base font-semibold text-ink">{t('mall.drawerH', locale)}</h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t('mall.close', locale)}
                className="grid size-9 place-items-center rounded-lg border border-line text-ink hover:bg-panel-2"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {cartItems.length === 0 ? (
                <p className="text-sm text-muted">{t('sim.cart.ctaEmpty', locale)}</p>
              ) : (
                <ul className="space-y-2">
                  {cartItems.map((item) => (
                    <li key={item.option.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-ink">{poolOptionLabel(item.option, locale)}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{money(item.option.annualCost)}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {sellable(item) ? (
                          <button
                            type="button"
                            data-mall-sell={`${item.dimension}/${item.option.id}`}
                            title={format(t('mall.sellHint', locale), {
                              amount: money(Math.round(resaleRecovery(item.option.annualCost))),
                            })}
                            onClick={() => sell(item)}
                            className="rounded-full border border-accent px-2 py-1 text-xs font-semibold text-accent hover:bg-accent-soft"
                          >
                            {t('mall.sell', locale)}
                          </button>
                        ) : (
                          <span data-mall-nosell className="text-xs text-muted">{t('mall.noResale', locale)}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => toggle(item, false)}
                          className="rounded-full border border-line px-2 py-1 text-xs text-ink hover:bg-panel-2"
                        >
                          {t('sim.cart.remove', locale)}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <p aria-live="polite" className="sr-only" data-mall-sold>
                {soldNotice
                  ? format(t('mall.sold', locale), { item: soldNotice.label, amount: money(soldNotice.amount) })
                  : ''}
              </p>
              {soldNotice && (
                <p className="mt-2 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs leading-relaxed text-ink">
                  {format(t('mall.sold', locale), { item: soldNotice.label, amount: money(soldNotice.amount) })}
                </p>
              )}

              <div
                role="status"
                data-cart-status={summary.status}
                className={`mt-4 rounded-xl border px-4 py-3 ${statusBanner(locale)[summary.status].cls}`}
              >
                <p className="text-sm font-semibold">
                  {format(t('sim.cart.preview', locale), { status: statusBanner(locale)[summary.status].label })}
                  {summary.rate !== null && (
                    <span className="ml-2 font-mono text-xs tabular-nums">
                      {format(t('sim.burdenRate', locale), { rate: `${Math.round(summary.rate * 100)}%` })}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs leading-relaxed">{statusBanner(locale)[summary.status].note}</p>
                <p className="mt-2 font-mono text-xs tabular-nums opacity-80">
                  {format(t('sim.cart.formula', locale), {
                    base: money(baselineAnnualCost),
                    added: money(summary.addedAnnualCost),
                    total: money(summary.totalAnnualCost),
                    cashflow: money(summary.cashflow),
                  })}
                </p>
                {summary.ratioHint && (
                  <p className="mt-2 rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs leading-relaxed text-muted">
                    {format(t('sim.cart.ratio', locale), { assets: summary.assetCount, experiences: summary.experienceCount })}
                  </p>
                )}
                {summary.status === 'red' && resellValue && (
                  <p className="mt-2 rounded-lg border border-danger px-2 py-1.5 text-xs leading-relaxed">
                    {format(t('sim.cart.resell', locale), { item: resellValue.label, amount: money(resellValue.value) })}
                  </p>
                )}
              </div>

              <BillDonut slices={slices} locale={locale} />
            </div>

            <div className="space-y-2 border-t border-line px-5 py-4">
              <button
                type="button"
                data-mall-checkout
                disabled={cart.length === 0}
                onClick={checkout}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-on-accent transition-colors hover:brightness-105 disabled:opacity-50"
              >
                {t('mall.checkout', locale)}
              </button>
              {cart.length > 0 && (
                <button
                  type="button"
                  data-adopt-goal
                  onClick={() => {
                    const dest = adoptCartAsGoal(cart);
                    track('cart:to-goal', { items: cart.length });
                    window.location.assign(dest);
                  }}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-panel-2"
                >
                  {t('sim.cart.ctaBtn', locale)}
                </button>
              )}
              <p className="text-xs leading-relaxed text-muted">
                {t('sim.cart.ctaA', locale)}
                <strong>{t('sim.cart.ctaBold', locale)}</strong>
                {t('sim.cart.ctaB', locale)}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
