import type { Currency } from '@rich-sim/core';
import type { Locale } from './i18n';

/**
 * 展示层的数字格式化（单一来源）。
 *
 * 抽出来的理由：结果页与 M4 的报告都要把同一批数字印成同一种样子——币种符号、
 * 小数位、等宽。两处各写一份，迟早会在某一次改口径时只改一边。
 */

/** 金额：按展示币种与语言格式化，小数位为 0（金额都是量级级别的数）。 */
export function fmtMoney(n: number, currency: Currency, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(n);
}

/** 比率 -> 整数百分比字符串（0.333 -> '33%'）。 */
export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
