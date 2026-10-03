import type { Currency, FxSnapshot } from '@rich-sim/core';
import { STATIC_FX_SNAPSHOT } from './defaults';

/**
 * T10 · 汇率链路：实时优先 + 快照规范化 + 静态兜底。
 *
 * 本模块是「可测纯函数」层：SSR 端点（pages/api/fx.ts）与客户端切换器
 * 都不直接拼 Frankfurter URL，而是走这里。网络/解析/缺币种任一步失败
 * 一律降级 STATIC_FX_SNAPSHOT（source 保持 'static-snapshot'）。
 *
 * 数据源事实（2026-10-04 实测）：
 *   - Frankfurter 已从 https://api.frankfurter.app 301 迁移到
 *     https://api.frankfurter.dev/v1/latest（旧域会 301 到新域）。
 *   - base=CNY 实测可用（HTTP 200，返回全部 6 币种），m1 风险清单
 *     「待验证」项关闭。
 *   - Frankfurter 不返回 base 自身（1 base = 1 base），故规范化时
 *     显式补 rates[base] = 1。
 */

/** M1 支持的 6 币种（与 core Currency 类型一致）。 */
export const SUPPORTED_CURRENCIES: readonly Currency[] = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CNY',
  'HKD',
];

/** 实时数据源标签（进假设清单展示）。 */
export const LIVE_SOURCE = 'Frankfurter (ECB)';

/** Frankfurter 最新汇率端点（canonical；旧 .app 域 301 至此）。 */
const FX_API = 'https://api.frankfurter.dev/v1/latest';

/** 运行时 fetch 形状；便于测试注入 mock。 */
export type FxFetcher = (url: string) => Promise<Response>;

/** 判断一个字符串是否为受支持币种。 */
export function isSupportedCurrency(c: string): c is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

/** Frankfurter /latest 的原始响应形状。 */
export type FrankfurterRaw = {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 把 Frankfurter 原始响应规范化成 FxSnapshot。
 * - 补 rates[base] = 1（接口不返回 base 自身）。
 * - 其余 5 币种必须齐全且为正数，否则抛错（由调用方决定降级）。
 * - version 用汇率日期（可复现）。
 */
export function toFxSnapshot(raw: FrankfurterRaw, base: Currency): FxSnapshot {
  if (!raw.date || !ISO_DATE.test(raw.date)) {
    throw new Error(`fx: bad snapshot date from upstream: ${String(raw.date)}`);
  }
  if (raw.base !== base) {
    throw new Error(`fx: upstream base mismatch: got ${String(raw.base)}, want ${base}`);
  }

  const rates = {} as Record<Currency, number>;
  rates[base] = 1;
  for (const c of SUPPORTED_CURRENCIES) {
    if (c === base) continue;
    const v = raw.rates?.[c];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new Error(`fx: upstream missing/invalid rate for ${c}`);
    }
    rates[c] = v;
  }

  return {
    base,
    rates,
    date: raw.date,
    source: LIVE_SOURCE,
    version: raw.date,
  };
}

/**
 * 拉一次实时汇率并规范化。任一步失败（网络错 / 非 2xx / 缺币种 / 日期非法）
 * 都抛错——由 resolveSnapshot 捕获并降级。
 */
export async function fetchLiveFx(
  base: Currency,
  fetchImpl: FxFetcher = fetch,
): Promise<FxSnapshot> {
  const symbols = SUPPORTED_CURRENCIES.filter((c) => c !== base).join(',');
  const url = `${FX_API}?from=${base}&symbols=${symbols}`;
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch (err) {
    throw new Error(`fx: network error fetching ${url}: ${String(err)}`);
  }
  if (!res.ok) {
    throw new Error(`fx: upstream HTTP ${res.status}`);
  }
  let raw: FrankfurterRaw;
  try {
    raw = (await res.json()) as FrankfurterRaw;
  } catch (err) {
    throw new Error(`fx: upstream returned non-JSON: ${String(err)}`);
  }
  return toFxSnapshot(raw, base);
}

/**
 * 解析一份 FxSnapshot：实时优先，任何失败都降级静态兜底快照。
 * 静态快照 base=USD；convert() 是比率换算，任意 base 的快照都能正确
 * 在 6 币种间换算，故兜底无需重定 base（且 source 保持 static-snapshot）。
 */
export async function resolveSnapshot(
  base: Currency,
  fetchImpl?: FxFetcher,
): Promise<FxSnapshot> {
  try {
    return await fetchLiveFx(base, fetchImpl);
  } catch {
    return STATIC_FX_SNAPSHOT;
  }
}
