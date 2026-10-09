import type { Assumptions } from '@rich-sim/core';
import { DEFAULT_ASSUMPTIONS } from './defaults';
import { format, t } from './messages';
import type { Locale } from './i18n';

/**
 * M4 · 可调假设的纯函数层（PRD §6.2：安全提取率「必须显式展示为可调假设」、
 * r「用户可调」）。
 *
 * **不碰公式**：`returnRate` / `withdrawalRate` 本来就是 core `enoughLine` /
 * `project` / `gap` / `buildMilestones` 的入参，改的是数值不是口径，所以
 * `assumptionsVersion` 不动（那是公式版本，见 CONVENTIONS「引擎公式口径」）。
 *
 * `inflation` 故意不可调：`scenarioAnnualCost` 明确不应用通胀
 * （`packages/core/src/functions.ts` 的 M1 注记），给一个不动任何数字的输入框
 * 等于骗人。免责声明第 4 条已经把这件事讲给用户了。
 */

/** 可改的两个字段；其余假设（通胀、版本、汇率）各有自己的来源，不在这里编辑。 */
export type RateField = 'returnRate' | 'withdrawalRate';

export const RATE_FIELDS: readonly RateField[] = ['returnRate', 'withdrawalRate'] as const;

export type RateBounds = { min: number; max: number };

/**
 * 允许区间（小数口径）。上下限都是算术约束，不是对用户的建议：
 * - `withdrawalRate` 下限必须 > 0——够用线 = 年成本 ÷ 提取率，0 会解出无穷大本金。
 * - 上限 20%：再高的提取率/收益率下面已经没有可比数字（达标年限落到 0–1 年），
 *   而把收益率开到离谱值只会让这一屏看起来像在承诺收益。
 */
export const RATE_BOUNDS: Record<RateField, RateBounds> = {
  returnRate: { min: 0, max: 0.2 },
  withdrawalRate: { min: 0.01, max: 0.2 },
};

/** 默认值只有一个来源：`DEFAULT_ASSUMPTIONS`（冻结），这里不复制数字。 */
export const DEFAULT_RATES: Record<RateField, number> = {
  returnRate: DEFAULT_ASSUMPTIONS.returnRate,
  withdrawalRate: DEFAULT_ASSUMPTIONS.withdrawalRate,
};

export type RateError = 'empty' | 'invalid' | 'below' | 'above';
export type RateParse = { ok: true; value: number } | { ok: false; reason: RateError };

/**
 * 解析用户在界面上填的**百分数**文本（"3.5" -> 0.035）。
 * 拒绝而不是夹紧：静默把 25% 改成 20% 会让用户以为自己填的是 25%。
 */
export function parseRatePercent(raw: string, field: RateField): RateParse {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const percent = Number(trimmed);
  if (!Number.isFinite(percent)) return { ok: false, reason: 'invalid' };
  const { min, max } = RATE_BOUNDS[field];
  if (percent / 100 < min) return { ok: false, reason: 'below' };
  if (percent / 100 > max) return { ok: false, reason: 'above' };
  return { ok: true, value: percent / 100 };
}

/** 小数 -> 界面百分数文本（'3.5'），与 formatRate 同一精度口径。 */
function percentNumber(value: number): number {
  return Math.round(value * 1000) / 10;
}

/** 0.04 -> '4%'；0.035 -> '3.5%'。整数就不带小数点，避免 '4.0%'。 */
export function formatRate(value: number): string {
  const percent = percentNumber(value);
  return `${Number.isInteger(percent) ? String(percent) : percent.toFixed(1)}%`;
}

export function toPercentInput(value: number): string {
  return String(percentNumber(value));
}

/** 返回**新的** Assumptions：fx / inflation / assumptionsVersion 原样带过去。 */
export function applyRate(a: Assumptions, field: RateField, value: number): Assumptions {
  return { ...a, [field]: value };
}

/** 两个可调项是否都还是默认值（决定「恢复默认」按钮出不出现）。 */
export function isDefaultRates(a: Assumptions): boolean {
  return RATE_FIELDS.every((field) => a[field] === DEFAULT_RATES[field]);
}

type AssumptionNode = { textContent: string };
type AssumptionDoc = { querySelector: (selector: string) => AssumptionNode | null };

/**
 * 汇率行的展示文本（与 AssumptionsPanel.astro 同文案源、同格式化口径——
 * CNY / EUR 两位小数，缺币种显示 '—'）。patch 时按用户当前 locale 重写，
 * 与 SSR 期 locale 保持一致（双语文案是两条不同的句子）。
 */
export function formatFxLine(a: Assumptions, locale: Locale): string {
  const fx = a.fx;
  const cnyRate = fx.rates['CNY'];
  const eurRate = fx.rates['EUR'];
  const cnyText = Number.isFinite(cnyRate) ? cnyRate.toFixed(2) : '—';
  const eurText = Number.isFinite(eurRate) ? eurRate.toFixed(2) : '—';
  return format(t('assumptions.fxLine', locale), {
    base: fx.base,
    cny: cnyText,
    eur: eurText,
    source: fx.source,
    date: fx.date,
  });
}

/**
 * 把假设清单里那几个 `<dd data-assumption>` / `<p data-assumption="fx">` 的
 * 显示值同步成真正在用的那套。
 *
 * 存在理由：合规清单是 SSR 渲染的（红线：不能被 JS 关掉），它只能渲染默认值；
 * 用户改过假设、切过币种后，那份静态清单就会说出与计算不一致的数字。岛挂载时
 * 与每次改动后各调一次，SSR 首屏仍在源码里——这里只是把已经存在于页面的
 * 那几个数字改对。
 *
 * `locale` 影响汇率行文案（zh / en 是两条不同的句子），默认 'zh' 与
 * AssumptionsPanel 的 props 默认一致。
 *
 * `document` 注入而不是伸手拿全局：apps/web 的单测跑在 node 环境，且本仓库
 * 纪律是注入依赖（见 copy-guard.test.ts 的说明）。
 */
export function patchAssumptionDisplay(
  a: Assumptions,
  doc: AssumptionDoc | null = typeof document === 'undefined' ? null : document,
  locale: Locale = 'zh',
): void {
  if (!doc) return;
  for (const field of ['returnRate', 'withdrawalRate', 'inflation'] as const) {
    const node = doc.querySelector(`[data-assumption="${field}"]`);
    if (node) node.textContent = formatRate(a[field]);
  }
  const fxNode = doc.querySelector('[data-assumption="fx"]');
  if (fxNode) fxNode.textContent = formatFxLine(a, locale);
}
