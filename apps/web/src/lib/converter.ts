import {
  wealthTimeEquivalent,
  type Catalog,
  type CatalogOption,
  type Currency,
  type FxSnapshot,
  type LifeChoice,
  type Profile,
  type TimeEquivalent,
} from '@rich-sim/core';
import type { Locale } from './i18n';

/**
 * S3 · 换算条展示层（comparison-converter.md）。
 *
 * 这个模块只做两件事：挑换算对象、出文案。算术在 core 的
 * `wealthTimeEquivalent` 里（分子的币种换算在函数内部，调用方绕不过）。
 *
 * 只读纪律：本模块不 import `lib/draft.ts`，也不写任何本机状态——换算条
 * 是一次性展示，不进方案（m2-task-breakdown.md S3「不写入 draft」）。
 * converter.test.ts 用源码扫描把这条钉死，因为「没有副作用」这种事实最
 * 容易在下一次顺手改动里静默失效。
 *
 * 文案随 locale 走（M4-i18n）：主语始终是**这笔账的代价**，不是「他的拥有」，
 * 英文同样不出现 promise / you will 这类预测句式（§5 措辞纪律）。
 */

/** 换算对象 = 当前选择里最贵的一项：它就是「他这一年的账单」中最荒谬的那笔。 */
export function priciestSelection(catalog: Catalog, choices: LifeChoice): CatalogOption | null {
  let best: CatalogOption | null = null;
  for (const choice of choices) {
    const dimension = catalog.dimensions.find((d) => d.id === choice.dimension);
    const option = dimension?.options.find((o) => o.id === choice.optionId);
    if (option && (best === null || option.annualCost > best.annualCost)) best = option;
  }
  return best;
}

const COPY: Record<Locale, {
  years: (item: string, money: string, duration: string) => string;
  multiple: (item: string, money: string, duration: string) => string;
  beyond: (item: string, money: string) => string;
  noNet: (item: string) => string;
  nudge: (item: string) => string;
}> = {
  zh: {
    years: (item, money, d) => `「${item}」一年 ${money} = 你按现在的存法要存 ${d}。`,
    multiple: (item, money, d) => `「${item}」一年 ${money} ≈ 你 ${d}的全部结余。`,
    beyond: (item, money) => `「${item}」一年 ${money}，按你填的数已经算不出年数——量级差得太远。`,
    noNet: (item) => `「${item}」：按你填的数，目前每月没有净储蓄——这条先算不出年来。`,
    nudge: (item) => `先填 4 个数，就能把「${item}」换算成你要存多久。`,
  },
  en: {
    years: (item, money, d) =>
      `"${item}" costs ${money} a year — that is ${d} of saving at the rate you entered.`,
    multiple: (item, money, d) =>
      `"${item}" costs ${money} a year ≈ ${d} of your entire surplus.`,
    beyond: (item, money) =>
      `"${item}" costs ${money} a year — at your numbers there is no year count worth printing.`,
    noNet: (item) =>
      `"${item}": with the numbers you entered there is no monthly surplus, so this one cannot be turned into years.`,
    nudge: (item) =>
      `Fill in 4 numbers and "${item}" becomes how long it would take you to save for it.`,
  },
};

/**
 * 一行文案。`formatMoney` 收的金额已在 `te.currency` 口径内。
 * `locale` 省略时是中文——历史调用点与测试口径不变。
 */
export function converterCopy(
  te: TimeEquivalent,
  itemLabel: string,
  formatMoney: (localAmount: number) => string,
  locale: Locale = 'zh',
): string {
  const copy = COPY[locale];
  const money = formatMoney(te.annualCostLocal);
  switch (te.status) {
    case 'no-net-savings':
      return copy.noNet(itemLabel);
    case 'years':
      return copy.years(itemLabel, money, formatDuration(te.years, locale));
    case 'multiple':
      return copy.multiple(itemLabel, money, formatDuration(te.multiple, locale));
    case 'beyond-scale':
      return copy.beyond(itemLabel, money);
  }
}

/** 还没录入财务时的引导句：这一行不隐藏，改成 F2 的入口（§4 的顺带收益）。 */
export function converterNudge(itemLabel: string, locale: Locale = 'zh'): string {
  return COPY[locale].nudge(itemLabel);
}

export type ConverterStatus = TimeEquivalent['status'] | 'no-profile';

/**
 * 一行换算条 = 那笔年成本 ÷ 用户自己的年净储蓄。
 * `formatMoney` 收的是**已换算到录入币种**的金额，币种由调用方给（§3.1）。
 *
 * 两个挂载点喂不同的对象，这是刻意的：
 * - 设计器 sticky 条喂 `converterLine`（当前选择里最贵的那项）——用户正在
 *   勾选的那一刻，反差要钉在他刚选的东西上；
 * - 结果页喂 `converterForItem`（对象是整份理想生活）——那一页的主数字就是
 *   年成本合计，换算必须围绕它，否则页面上会出现一笔没来由的钱。
 */
export function converterForItem(
  item: { label: string; annualCostUSD: number },
  profile: Profile | null,
  fx: FxSnapshot,
  formatMoney: (localAmount: number, currency: Currency) => string,
  locale: Locale = 'zh',
): { sentence: string; status: ConverterStatus } {
  if (!profile) {
    return { sentence: converterNudge(item.label, locale), status: 'no-profile' };
  }
  const te = wealthTimeEquivalent(item.annualCostUSD, profile, fx);
  return {
    sentence: converterCopy(te, item.label, (local) => formatMoney(local, te.currency), locale),
    status: te.status,
  };
}

/** 换算对象取当前选择里最贵的一项（结果页不用这个入口，见上面的说明）。 */
export function converterLine(
  catalog: Catalog,
  choices: LifeChoice,
  profile: Profile | null,
  fx: FxSnapshot,
  formatMoney: (localAmount: number, currency: Currency) => string,
  locale: Locale = 'zh',
): { sentence: string; status: ConverterStatus } | null {
  const item = priciestSelection(catalog, choices);
  if (!item) return null;
  return converterForItem(
    { label: item.label, annualCostUSD: item.annualCost },
    profile,
    fx,
    formatMoney,
    locale,
  );
}

/**
 * 展示取整只发生在这里：core 给的是原始商（验收 §7.1 误差为 0）。
 * 不满一年说月数，免得出现「要存 0.0 年」这种既无信息又显假的句子。
 */
function formatDuration(years: number, locale: Locale): string {
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12));
    return locale === 'en' ? `${months} months` : `${months} 个月`;
  }
  const digits =
    years >= 100 ? Math.round(years).toLocaleString('en-US') : trimDecimal(years.toFixed(1));
  if (locale === 'en') return `${digits} year${digits === '1' ? '' : 's'}`;
  return `${digits} 年`;
}

function trimDecimal(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value;
}
