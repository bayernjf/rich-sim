/**
 * M3 S2 · 富豪模拟购物区（`/app/sim` 页内客户端岛，不新增路由 = G3）。
 *
 * 购物池条目由服务端按 `shoppingPool(catalog)` 算好后作为 props 传入；本机
 * 购物车只在挂载后从 `rich-sim:sim:v1` 读出（与 ClaimRunway 同一模式），
 * SSR 首帧直接不渲染这块——关掉 JS 时卡 A 看板与免责标注仍是完整页面。
 *
 * S2 只做「选了什么 / 年成本合计」；负担率变色、账单联动和配比提示是 S3。
 */
import { useEffect, useMemo, useState } from 'react';
import { dimensionLabel, optionCostComponents, type CatalogOption } from '@rich-sim/core';
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

type Props = {
  items: ShoppingItem[];
  /** 界面语言（页面 SSR 解析后传入）。 */
  locale?: Locale;
  /** 基线年成本（卡 A 当前生活），S3 账单预览在它之上累加。 */
  baselineAnnualCost: number;
};

/** 三档负担率横幅（文案与卡 A 页共用同一组 key，所以两页的说法不会各自漂移）。 */
const statusBanner = (locale: Locale): Record<Band, { label: string; cls: string; note: string }> => ({
  green: {
    label: t('sim.bannerGreen', locale),
    cls: 'border-accent bg-accent-soft text-ink',
    note: t('sim.bannerGreenNote', locale),
  },
  yellow: {
    label: t('sim.bannerYellow', locale),
    cls: 'border-line bg-panel text-ink',
    note: t('sim.bannerYellowNote', locale),
  },
  red: {
    label: t('sim.bannerRed', locale),
    cls: 'border-danger bg-panel text-danger',
    note: t('sim.bannerRedNote', locale),
  },
});
type Band = 'green' | 'yellow' | 'red';

const kindGroups = (
  locale: Locale,
): { kind: CatalogOption['kind']; label: string; hint: string }[] => [
  { kind: 'asset', label: t('sim.kind.asset', locale), hint: t('sim.kind.assetHint', locale) },
  { kind: 'consumer', label: t('sim.kind.consumer', locale), hint: t('sim.kind.consumerHint', locale) },
  { kind: 'experience', label: t('sim.kind.experience', locale), hint: t('sim.kind.experienceHint', locale) },
];

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function itemKey(item: CartItem): string {
  return `${item.dimension}/${item.optionId}`;
}

export default function ShoppingArea({ items, baselineAnnualCost, locale = 'zh' }: Props) {
  const [mounted, setMounted] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    setCart(readCart());
    setMounted(true);
  }, []);

  const selected = useMemo(() => new Set(cart.map(itemKey)), [cart]);

  const summary = useMemo(
    () =>
      cartBurdenSummary(
        cart,
        items,
        CARD_A.choices.map((choice) => ({
          dimension: choice.dimension,
          optionId: choice.optionId,
        })),
        baselineAnnualCost,
        CARD_A_ANNUAL_INCOME - CARD_A_LAST_YEAR_COST,
      ),
    [cart, items, baselineAnnualCost],
  );

  const resellValue = useMemo(() => {
    // 红区变卖：车中最贵的资产类条目按 75% 折价回笼（复用 M2 常量口径）。
    const asset = cart
      .map((cartItem) =>
        items.find(
          (entry) =>
            entry.dimension === cartItem.dimension &&
            entry.option.id === cartItem.optionId &&
            entry.option.kind === 'asset',
        ),
      )
      .filter((entry): entry is ShoppingItem => Boolean(entry))
      .sort((a, b) => b.option.annualCost - a.option.annualCost)[0];
    return asset
      ? { label: asset.option.label, value: Math.round(asset.option.annualCost * 0.75) }
      : null;
  }, [cart, items]);

  if (!mounted) return null;

  const toggle = (item: ShoppingItem, add: boolean) => {
    const next = saveCartItem(
      cart,
      { dimension: item.dimension, optionId: item.option.id },
      add,
    );
    setCart(next);
    // S5 漏斗：只发事件名，不发金额 / 档 id / 任何用户数据（收集端 props 全丢）。
    track(add ? 'sim:add' : 'sim:remove');
  };

  return (
    <section aria-labelledby="sim-shop-heading" className="mt-8" data-shopping-area>
      <h2 id="sim-shop-heading" className="text-base font-semibold text-ink">
        {t('sim.cart.h', locale)}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('sim.cart.lead', locale)}</p>

      <p
        className="mt-3 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink"
        aria-live="polite"
      >
        <Interpolated
          template={t('sim.cart.selected', locale)}
          vars={{ count: cart.length, amount: money(summary.addedAnnualCost) }}
          dataAttr={{ count: 'data-cart-count', amount: 'data-cart-added' }}
        />
      </p>

      <div
        role="status"
        data-cart-status={summary.status}
        className={`mt-2 rounded-xl border px-4 py-3 ${statusBanner(locale)[summary.status].cls}`}
      >
        <p className="text-sm font-semibold">
          {format(t('sim.cart.preview', locale), {
            status: statusBanner(locale)[summary.status].label,
          })}
          {summary.rate !== null && (
            <span className="ml-2 font-mono text-xs tabular-nums">
              {format(t('sim.burdenRate', locale), {
                rate: `${Math.round(summary.rate * 100)}%`,
              })}
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
            {format(t('sim.cart.ratio', locale), {
              assets: summary.assetCount,
              experiences: summary.experienceCount,
            })}
          </p>
        )}
        {summary.status === 'red' && resellValue && (
          <p className="mt-2 rounded-lg border border-danger px-2 py-1.5 text-xs leading-relaxed">
            {format(t('sim.cart.resell', locale), {
              item: resellValue.label,
              amount: money(resellValue.value),
            })}
          </p>
        )}
      </div>

      {kindGroups(locale).map((group) => {
        const groupItems = items.filter((item) => item.option.kind === group.kind);
        if (groupItems.length === 0) return null;
        return (
          <div key={String(group.kind)} className="mt-5">
            <h3 className="text-sm font-semibold text-ink">
              {group.label}
              <span className="ml-2 text-xs font-normal text-muted">{group.hint}</span>
            </h3>
            <ul className="mt-2 space-y-2">
              {groupItems.map((item) => {
                const key = itemKey({ dimension: item.dimension, optionId: item.option.id });
                const inCart = selected.has(key);
                const components = optionCostComponents(item.option, locale);
                return (
                  <li key={key} className="rounded-xl border border-line bg-panel px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{poolOptionLabel(item.option, locale)}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {dimensionLabel({ id: item.dimension, label: item.dimensionLabel }, locale)} ·{' '}
                          <span className="font-mono tabular-nums">
                            {money(item.option.annualCost)}
                          </span>
                          {locale === 'en' ? '/yr' : '/年'}
                        </p>
                        {components && components.length > 0 && (
                          <p className="mt-1 text-xs text-muted">{components.join(' · ')}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <button
                          type="button"
                          aria-pressed={inCart}
                          onClick={() => toggle(item, !inCart)}
                          className={`min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ${
                            inCart
                              ? 'border border-ink bg-ink text-canvas hover:bg-ink/90'
                              : 'border border-accent bg-accent-soft text-accent hover:bg-accent/10'
                          }`}
                        >
                          {inCart ? t('sim.cart.remove', locale) : t('sim.cart.add', locale)}
                        </button>
                        {item.option.source && (
                          <a
                            className="text-xs text-accent underline-offset-2 hover:underline"
                            href={item.option.source}
                            rel="noopener"
                            target="_blank"
                          >
                            {t('sim.source', locale)}
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <p className="mt-4 text-xs leading-relaxed text-muted">{t('sim.cart.note', locale)}</p>

      <div className="mt-5 rounded-xl border border-line bg-panel p-4">
        <p className="text-sm font-medium text-ink">{t('sim.cart.ctaH', locale)}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {t('sim.cart.ctaA', locale)}
          <strong>{t('sim.cart.ctaBold', locale)}</strong>
          {t('sim.cart.ctaB', locale)}
        </p>
        {cart.length === 0 ? (
          <p className="mt-3 text-xs text-muted">{t('sim.cart.ctaEmpty', locale)}</p>
        ) : (
          <button
            type="button"
            data-adopt-goal
            onClick={() => {
              const dest = adoptCartAsGoal(cart);
              track('cart:to-goal', { items: cart.length });
              window.location.assign(dest);
            }}
            className="mt-3 inline-flex min-h-11 items-center rounded-full bg-accent px-5 py-3 text-sm font-medium text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent/90"
          >
            {t('sim.cart.ctaBtn', locale)}
          </button>
        )}
      </div>
    </section>
  );
}
