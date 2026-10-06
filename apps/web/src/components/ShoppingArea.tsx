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
import type { ShoppingItem } from '../lib/sim-content';
import { type CartItem, readCart, saveCartItem } from '../lib/sim-draft';

type Props = {
  items: ShoppingItem[];
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

export default function ShoppingArea({ items }: Props) {
  const [mounted, setMounted] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    setCart(readCart());
    setMounted(true);
  }, []);

  const selected = useMemo(() => new Set(cart.map(itemKey)), [cart]);

  const totalAnnual = useMemo(
    () =>
      cart.reduce((sum, cartItem) => {
        const hit = items.find(
          (entry) =>
            entry.dimension === cartItem.dimension && entry.option.id === cartItem.optionId,
        );
        return sum + (hit?.option.annualCost ?? 0);
      }, 0),
    [cart, items],
  );

  if (!mounted) return null;

  const toggle = (item: ShoppingItem, add: boolean) => {
    const next = saveCartItem({ dimension: item.dimension, optionId: item.option.id }, add);
    setCart(next);
  };

  return (
    <section aria-labelledby="sim-shop-heading" className="mt-8">
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
        已选 <span className="font-mono font-semibold tabular-nums">{cart.length}</span> 件 ·
        新增年成本{' '}
        <span className="font-mono font-semibold tabular-nums">{money(totalAnnual)}</span>/年
      </p>

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
    </section>
  );
}
