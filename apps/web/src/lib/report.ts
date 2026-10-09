import type { Catalog, Currency } from '@rich-sim/core';
import type { Draft } from './draft';
import type { Locale } from './i18n';
import { t, format } from './messages';
import { fmtMoney, pct } from './format';
import { computeResults } from './results';
import { compareScenarios, type Scenario } from './scenarios';

/**
 * M4 S2 · T01 报告数据层（apps/web，纯函数、无副作用、可单测）。
 *
 * 口径（`m4-task-breakdown.md` §2 S2）：
 * - **零新计算**：报告只是把 `computeResults()` 已经算出来的东西重新排版，
 *   本模块不碰 `@rich-sim/core`。
 * - **数据不出本机**：纯函数，没有任何网络 / 上传路径。
 * - **不渲染**：本模块只产出「块 + 字段」的字符串，视图层负责排版；这样
 *   报告的内容可以在没有 DOM 的地方断言。
 * - 情景段是**可选**的：情景不持久化（S1 的边界），所以只有调用方手里有
 *   情景状态时才带上。
 */

export type ReportField = {
  /** 已渲染的字段名（含单位提示）。 */
  label: string;
  /** 已格式化的显示值（含币种符号 / 百分号 / 句子）。 */
  value: string;
};

export type ReportBlockId =
  | 'situation'
  | 'goal'
  | 'status'
  | 'gap'
  | 'milestones'
  | 'scenarios';

export type ReportBlock = {
  id: ReportBlockId;
  title: string;
  fields: ReportField[];
};

export type Report = {
  blocks: ReportBlock[];
  /** 报告所用币种（页脚与口径行要显示）。 */
  currency: Currency;
  /** 生成日期（YYYY-MM-DD）；由调用方传入，便于测试与复现。 */
  generatedOn: string;
};

export type BuildReportOptions = {
  /** 有情景状态时才带情景段（情景不持久化，见 S1 边界）。 */
  scenarios?: Scenario[];
  /** 生成日期；默认取当下。 */
  now?: Date;
};

/** ISO 日期部分（YYYY-MM-DD）。 */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 把本机方案 + 目录整理成一份报告。**无 profile 或草稿不可用时返回 null**
 * （调用方据此不渲染报告区块，与结果页空态一致）。
 */
export function buildReport(
  draft: Draft,
  catalog: Catalog,
  locale: Locale,
  options: BuildReportOptions = {},
): Report | null {
  const results = computeResults(draft, catalog, locale);
  if (results.status !== 'ok') return null;
  const profile = draft.profile;
  if (!profile) return null;

  const currency = results.currency;
  const money = (n: number) => fmtMoney(n, currency, locale);
  const blocks: ReportBlock[] = [];

  // 现状
  blocks.push({
    id: 'situation',
    title: t('report.situation', locale),
    fields: [
      { label: `${t('finance.income.label', locale)} · ${t('report.perMonth', locale)}`, value: money(profile.income) },
      { label: `${t('finance.expense.label', locale)} · ${t('report.perMonth', locale)}`, value: money(profile.expense) },
      { label: `${t('finance.savings.label', locale)} · ${t('report.total', locale)}`, value: money(profile.savings) },
      { label: `${t('finance.debt.label', locale)} · ${t('report.total', locale)}`, value: money(profile.debt) },
    ],
  });

  // 目标（T0-3：口径由 results.goal 决定——净资产目标时第一行就是它；
  // goal 来自 computeResults，报告零新计算）
  blocks.push({
    id: 'goal',
    title: t('report.goal', locale),
    fields: [
      {
        label: t(
          results.goal.kind === 'net-worth' ? 'result.goalNetWorth' : 'result.enoughLine',
          locale,
        ),
        value: money(
          results.goal.kind === 'net-worth' ? results.goal.value : results.enoughLine,
        ),
      },
      { label: t('result.annualCost', locale), value: money(results.annualCostLocal) },
      {
        label: t('result.savingsRate', locale),
        value: results.savingsRate === null ? '—' : pct(results.savingsRate),
      },
    ],
  });

  // 三状态（一等状态：句子本身就是结论，不再拆成 label/value 两段）
  const statusSentence =
    results.projection.status === 'reachable'
      ? format(t('result.reachableH', locale), { years: results.projection.years })
      : results.projection.status === 'unreachable'
        ? t('result.unreachableH', locale)
        : t('result.noNetH', locale);
  blocks.push({
    id: 'status',
    title: t('report.status', locale),
    fields: [{ label: t('report.statusLabel', locale), value: statusSentence }],
  });

  // 差距
  blocks.push({
    id: 'gap',
    title: t('report.gap', locale),
    fields: [
      {
        label: t('report.gapAnnual', locale),
        value: money(results.gapResult.annualGap),
      },
      {
        label: t('report.gapYears', locale),
        value:
          results.projection.status === 'no-net-savings'
            ? t('result.yearsNoNet', locale)
            : results.gapResult.yearsAtCurrentPace >= 60
              ? format(t('result.yearsOverCap', locale), { cap: 60 })
              : format(t('result.yearsApprox', locale), {
                  years: results.gapResult.yearsAtCurrentPace,
                }),
      },
    ],
  });

  // 阶梯目标
  blocks.push({
    id: 'milestones',
    title: t('report.milestones', locale),
    fields: results.milestones.map((m) => ({
      label: format(t('result.stage', locale), { stage: m.stage }),
      value: `${money(m.goalValue)} · ${format(t('result.yearsApprox', locale), { years: m.years })}`,
    })),
  });

  // 情景对比（可选）
  const scenarios = options.scenarios ?? [];
  if (scenarios.length > 0) {
    const { outcomes } = compareScenarios(draft, catalog, locale, scenarios);
    blocks.push({
      id: 'scenarios',
      title: t('report.scenarios', locale),
      fields: outcomes.map((o) => ({
        label: t(SCENARIO_LABEL_KEY[o.id], locale),
        value:
          o.yearsDelta === null
            ? t('scenario.incomparable', locale)
            : o.yearsDelta === 0
              ? t('scenario.same', locale)
              : format(
                  o.yearsDelta < 0 ? t('scenario.shorter', locale) : t('scenario.longer', locale),
                  { n: Math.abs(o.yearsDelta) },
                ),
      })),
    });
  }

  return { blocks, currency, generatedOn: isoDate(options.now ?? new Date()) };
}

/** 情景 id -> 词典 key（与情景面板同源，避免两处各写一份）。 */
const SCENARIO_LABEL_KEY = {
  raise: 'scenario.raise',
  side: 'scenario.side',
  jobless: 'scenario.jobless',
  'big-expense': 'scenario.bigExpense',
} as const;
