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
import type { CatalogOption } from '@rich-sim/core';
import {
  CARD_A,
  CARD_A_ANNUAL_INCOME,
  CARD_A_LAST_YEAR_COST,
  cartBurdenSummary,
  type ShoppingItem,
} from '../lib/sim-content';
import { type CartItem, readCart, saveCartItem } from '../lib/sim-draft';
import { adoptCartAsGoal } from '../lib/sim-bridge';
import { track } from '../lib/analytics';

type Props = {
  items: ShoppingItem[];
  /** 基线年成本（卡 A 当前生活），S3 账单预览在它之上累加。 */
  baselineAnnualCost: number;
};

const STATUS_BANNER: Record<
  'green' | 'yellow' | 'red',
  { label: string; cls: string; note: string }
> = {
  green: {
    label: '可负担',
    cls: 'border-accent bg-accent-soft text-ink',
    note: '付完持有成本仍有 ≥40% 结余。',
  },
  yellow: {
    label: '紧张',
    cls: 'border-line bg-panel text-ink',
    note: '结余被压到 40% 以下——再加一件可能断裂。',
  },
  red: {
    label: '断裂预警',
    cls: 'border-danger bg-panel text-danger',
    note: '当年持有成本超过年现金流：得变卖资产（75% 折价）或增加收入。',
  },
};

const KIND_GROUPS: { kind: CatalogOption['kind']; label: string; hint: string }[] = [
  { kind: 'asset', label: '资产', hint: '大额、长期、不持有也在付费' },
  { kind: 'consumer', label: '消费品', hint: '即时满足、会折旧、要维护' },
  { kind: 'experience', label: '体验', hint: '一次性、情绪强、零持有负担' },
];

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function itemKey(item: CartItem): string {
  return `${item.dimension}/${item.optionId}`;
}

export default function ShoppingArea({ items, baselineAnnualCost }: Props) {
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
        富豪购物区
      </h2>
      <p className="mt-1 text-sm text-muted">
        价格标签是一次性的爽，持有成本是每年都来的账单。加入购物车看下一期会多贵。
      </p>

      <p
        className="mt-3 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink"
        aria-live="polite"
      >
        已选{' '}
        <span className="font-mono font-semibold tabular-nums" data-cart-count>
          {cart.length}
        </span>{' '}
        件 ·
        新增年成本{' '}
        <span className="font-mono font-semibold tabular-nums" data-cart-added>
          {money(summary.addedAnnualCost)}
        </span>
        /年
      </p>

      <div
        role="status"
        data-cart-status={summary.status}
        className={`mt-2 rounded-xl border px-4 py-3 ${STATUS_BANNER[summary.status].cls}`}
      >
        <p className="text-sm font-semibold">
          下一期账单预览 · {STATUS_BANNER[summary.status].label}
          {summary.rate !== null && (
            <span className="ml-2 font-mono text-xs tabular-nums">
              负担率 {Math.round(summary.rate * 100)}%
            </span>
          )}
        </p>
        <p className="mt-1 text-xs leading-relaxed">{STATUS_BANNER[summary.status].note}</p>
        <p className="mt-2 font-mono text-xs tabular-nums opacity-80">
          {money(baselineAnnualCost)}（当前生活）+ {money(summary.addedAnnualCost)}（加购）=
          {' '}{money(summary.totalAnnualCost)}/年 · 可支配现金流 {money(summary.cashflow)}
        </p>
        {summary.ratioHint && (
          <p className="mt-2 rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs leading-relaxed text-muted">
            购物车里重资产有 {summary.assetCount} 件、体验只有 {summary.experienceCount} 件：
            这个玩法默认 1:1 配（按购买次数，不按金额）——纯堆资产时每年的账单会涨得最快，
            这只是算术呈现，不是建议你怎么花钱。
          </p>
        )}
        {summary.status === 'red' && resellValue && (
          <p className="mt-2 rounded-lg border border-danger px-2 py-1.5 text-xs leading-relaxed">
            变卖最贵的一项（{resellValue.label}）只能回笼 {money(resellValue.value)}（原价 75%）
            ——在购物车里把它移出，下一期账单立即回落。
          </p>
        )}
      </div>

      {KIND_GROUPS.map((group) => {
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
                return (
                  <li key={key} className="rounded-xl border border-line bg-panel px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{item.option.label}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {item.dimensionLabel} ·{' '}
                          <span className="font-mono tabular-nums">
                            {money(item.option.annualCost)}
                          </span>
                          /年
                        </p>
                        {item.option.costComponents && item.option.costComponents.length > 0 && (
                          <p className="mt-1 text-xs text-muted">
                            {item.option.costComponents.join(' · ')}
                          </p>
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
                          {inCart ? '移出购物车' : '加入购物车'}
                        </button>
                        {item.option.source && (
                          <a
                            className="text-xs text-accent underline-offset-2 hover:underline"
                            href={item.option.source}
                            rel="noopener"
                            target="_blank"
                          >
                            来源
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

      <p className="mt-4 text-xs leading-relaxed text-muted">
        全部商品为公开来源校准的档位（富豪极端档为行业公开估算），是虚构角色生活方式的
        算术教具，不是真实报价、消费建议或投资建议。
      </p>

      <div className="mt-5 rounded-xl border border-line bg-panel p-4">
        <p className="text-sm font-medium text-ink">把这套生活设为我的目标</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          只把这套生活方式的<strong>年成本</strong>带进你的现实测算，不是你有这么多钱；
          模拟领的起始金与资产占比不会带过去。
        </p>
        {cart.length === 0 ? (
          <p className="mt-3 text-xs text-muted">先在上面加入至少一件，再设为目标。</p>
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
            设为我的目标 →
          </button>
        )}
      </div>
    </section>
  );
}
