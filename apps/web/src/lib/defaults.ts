import type { Assumptions, Currency, FxSnapshot } from '@rich-sim/core';
import staticFx from './static-fx.json';

/**
 * M1 默认假设与兜底汇率（冻结，T09/T10/T07 共用，勿各写一份）。
 *
 * - 汇率兜底快照 `static-fx.json`：构建期/离线兜底（source 显式标
 *   static-snapshot + 日期，参与假设清单展示）。T10 的 /api/fx 实时
 *   成功时用它替换 draft.assumptions.fx。
 * - 数值口径：本快照为静态兜底示意（2026-10-03），非实时行情；
 *   正式上线前由 T10 的抓取脚本（scripts/fetch-static-fx.mjs）刷新。
 */

export const STATIC_FX_SNAPSHOT: FxSnapshot = staticFx as FxSnapshot;

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  returnRate: 0.04,
  withdrawalRate: 0.04,
  inflation: 0.03,
  assumptionsVersion: '1',
  fx: STATIC_FX_SNAPSHOT,
};

/** 展示本位币默认值：海外市场 USD（目标市场先海外，见 technical-design.md §9）。 */
export const DEFAULT_CURRENCY: Currency = 'USD';
