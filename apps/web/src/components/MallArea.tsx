/**
 * 富豪商城（`docs/sim-shopping-mall.md` v1 · S1+S2）：
 * 商品卡片流 + 分类 tab + 购物车抽屉 +「结算 = 账单日」反转。
 *
 * 算术层零改动：shoppingPool / saveCartItem / cartBurdenSummary /
 * adoptCartAsGoal 全部复用。冒烟钩子与旧 ShoppingArea 完全一致
 * （data-shopping-area / data-cart-count / data-cart-status /
 * data-adopt-goal、按钮名「加入购物车 / 移出购物车」），步骤 8/9 不用改。
 *
 * 反电商纪律：无折扣、无倒计时、无库存话术、无真实品牌图。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Interpolated from './Interpolated';
import {
  CARD_A,
  CARD_A_ANNUAL_INCOME,
  CARD_A_LAST_YEAR_COST,
  cartBurdenSummary,
  poolOptionLabel,
  type ShoppingItem,
} from '../lib/sim-content';
import { type CartItem, readCart, saveCartItem } from '../lib/sim-draft';
import { adoptCartAsGoal } from '../lib/sim-bridge';
import { format, t } from '../lib/messages';
import type { Locale } from '../lib/i18n';
import { track } from '../lib/analytics';

type Props = { items: ShoppingItem[]; baselineAnnualCost: number; locale?: Locale };
type Band = 'green' | 'yellow' | 'red';
type Tab = 'all' | 'asset' | 'consumer' | 'experience';

const statusBanner = (locale: Locale): Record<Band, { label: string; cls: string; note: string }> => ({
  green: { label: t('sim.bannerGreen', locale), cls: 'border-accent bg-accent-soft text-ink', note: t('sim.bannerGreenNote', locale) },
  yellow: { label: t('sim.bannerYellow', locale), cls: 'border-line bg-panel text-ink', note: t('sim.bannerYellowNote', locale) },
  red: { label: t('sim.bannerRed', locale), cls: 'border-danger bg-panel text-danger', note: t('sim.bannerRedNote', locale) },
});

const TABS: { id: Tab; kind?: 'asset' | 'consumer' | 'experience' }[] = [
  { id: 'all' },
  { id: 'asset', kind: 'asset' },
  { id: 'consumer', kind: 'consumer' },
  { id: 'experience', kind: 'experience' },
];

/** 每个维度一个通用图标（emoji 作占位，AI 插画是 §6 P2 可选项）。 */
const DIMENSION_ICON: Record<string, string> = {
  living: '🏠', transport: '✈️', family: '🎓', travel: '🛥️',
  'health-insurance': '🩺', 'dining-daily': '🍽️', flexibility: '👥',
};

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}
function itemKey(item: CartItem): string {
  return `${item.dimension}/${item.optionId}`;
}

export default function MallArea({ items, baselineAnnualCost, locale = 'zh' }: Props) {
  const [mounted, setMounted] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCart(readCart());
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
  const summary = useMemo(
    () =>
      cartBurdenSummary(
        cart,
        items,
        CARD_A.choices.map((choice) => ({ dimension: choice.dimension, optionId: choice.optionId })),
        baselineAnnualCost,
        CARD_A_ANNUAL_INCOME - CARD_A_LAST_YEAR_COST,
      ),
    [cart, items, baselineAnnualCost],
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
    return asset ? { label: asset.option.label, value: Math.round(asset.option.annualCost * 0.75) } : null;
  }, [cart, items]);

  const visibleItems = useMemo(() => {
    const kind = TABS.find((entry) => entry.id === tab)?.kind;
    return items
      .filter((item) => (kind ? item.option.kind === kind : true))
      .sort((a, b) => b.option.annualCost - a.option.annualCost);
  }, [items, tab]);

  const cartItems = useMemo(
    () =>
      cart
        .map((ci) => items.find((entry) => entry.dimension === ci.dimension && entry.option.id === ci.optionId))
        .filter((entry): entry is ShoppingItem => Boolean(entry)),
    [cart, items],
  );

  if (!mounted) return null;

  const toggle = (item: ShoppingItem, add: boolean) => {
    const next = saveCartItem(cart, { dimension: item.dimension, optionId: item.option.id }, add);
    setCart(next);
    track(add ? 'sim:add' : 'sim:remove');
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
            role="tab"
            aria-selected={tab === entry.id}
            data-mall-tab={entry.id}
            onClick={() => setTab(entry.id)}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tab === entry.id ? 'bg-accent text-on-accent' : 'border border-line text-ink hover:bg-panel-2'
            }`}
          >
            {t(`mall.tab.${entry.id}`, locale)}
          </button>
        ))}
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleItems.map((item) => {
          const inCart = selected.has(itemKey({ dimension: item.dimension, optionId: item.option.id }));
          return (
            <li
              key={item.option.id}
              className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-colors ${
                inCart ? 'border-accent bg-accent-soft/40' : 'border-line bg-panel'
              }`}
            >
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-canvas text-xl">
                  {DIMENSION_ICON[item.dimension] ?? '🛍️'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{poolOptionLabel(item.option, locale)}</p>
                  <p className="mt-0.5 text-xs text-muted">{item.dimensionLabel}</p>
                </div>
              </div>
              <div className="flex items-end justify-between gap-3">
                <p className="font-mono text-lg font-semibold tabular-nums text-ink">
                  {money(item.option.annualCost)}
                  <span className="text-xs font-normal text-muted">/{t('mall.perYear', locale)}</span>
                </p>
                <button
                  type="button"
                  aria-pressed={inCart}
                  onClick={() => toggle(item, !inCart)}
                  className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                    inCart ? 'border border-line-strong text-ink hover:bg-panel-2' : 'bg-accent text-on-accent hover:brightness-105'
                  }`}
                >
                  {inCart ? t('sim.cart.remove', locale) : t('sim.cart.add', locale)}
                </button>
              </div>
              {typeof item.option.source === 'string' && (
                <a href={item.option.source} className="text-xs text-accent underline-offset-2 hover:underline">Source</a>
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
                      <button
                        type="button"
                        onClick={() => toggle(item, false)}
                        className="shrink-0 rounded-full border border-line px-2 py-1 text-xs text-ink hover:bg-panel-2"
                      >
                        {t('sim.cart.remove', locale)}
                      </button>
                    </li>
                  ))}
                </ul>
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
