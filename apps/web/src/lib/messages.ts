import type { Locale } from './i18n';

/**
 * M4-i18n · 界面文案词典（UI chrome，不含目录内容）。
 *
 * `en` 被标注成 `Record<keyof typeof ZH, string>`：**少翻一个键就编译不过**，
 * 所以这里不会出现「英文界面里静默夹一句中文」的状态（目录内容的英文名在 core 的
 * CATALOG_LABELS_EN，两件事分开放）。
 *
 * 红线相关：免责声明与假设清单的译文要和中文**同样明确**——它们是合规文本，
 * 不是可意译的营销文案。英文一律不出现 promise / guaranteed 这类词。
 */

const ZH = {
  'designer.metaTitle': '设计理想生活 · 财富模拟',
  'designer.metaDesc':
    '在居住、出行、家庭等 7 个维度里选择你想要的生活，实时算出理想生活年成本。',
  'designer.eyebrow': '理想生活设计器',
  'designer.h1': '设计你想过的生活',
  'designer.intro':
    '在每个维度里选一项，系统把它们的年成本加总。金额为美国全国口径的实际自付年现金支出，' +
    '按公开统计估算（数据年 2024；富豪档为行业估算），仅用于财商教育，不代表真实报价。',
  'designer.disclaimer':
    '免责声明：本工具仅做静态推演与财商教育，不构成投资建议，不推荐任何金融产品；' +
    '结果不承诺未来收益。年成本按当前所选选项简单加总，通胀作为假设记录、暂不参与换算。',
  'designer.nextStep': '下一步：录入财务 →',
  'designer.totalLabel': '理想生活年成本（{currency}）',
  'designer.saved': '已保存 · 本机',
  'designer.notSaved': '未保存',
  'designer.savedHint': '选择已自动存入本机',
  'designer.saveHint': '选择后自动保存',
  'designer.gotoFinance': '去录入 →',
  'currency.label': '显示币种',
  'currency.busy': '切换中…',
  'currency.fxLine': '汇率：{source} · {date}',
  'currency.failed': '切换失败：{error}',
  'locale.label': '语言',
  'converter.lifeTotal': '你选的这种生活',
  'converter.cartLife': '富豪购物车里的这套生活',
  'assumptions.title': '假设清单',
  'assumptions.returnRate': '年化投资回报率',
  'assumptions.withdrawalRate': '安全提取率',
  'assumptions.inflation': '年化通胀',
  'assumptions.version': '假设版本',
  'assumptions.fxLine':
    '汇率：按 1 {base} = {cny} CNY、{eur} EUR 折算；来源 {source}，日期 {date}。',
  'assumptions.disclaimerTitle': '免责声明',
  'assumptions.disclaimer1': '本工具仅对用户自行填写的假设做静态推演与算术，不构成投资建议。',
  'assumptions.disclaimer2': '不推荐、不背书任何具体金融产品、标的或机构。',
  'assumptions.disclaimer3': '测算结果不预测市场、不承诺未来收益；实际结果可能与测算差异巨大。',
  'assumptions.disclaimer4': '通胀等假设仅作记录展示，M1 暂不参与换算。',
  'assumptions.disclaimer5': '本工具仅用于财商模拟教育，不替代专业的财务、法律或税务意见。',
  'finance.metaTitle': '财务录入 · 财富模拟',
  'finance.metaDesc': '只需要月收入、月支出、存款与负债 4 个数，随时可改，数据只保存在你的设备上。',
  'finance.eyebrow': '财务录入',
  'finance.h1': '填一下你的财务现状',
  'finance.intro': '只需要 4 个数，随时可以回来改。单位：{currency}（按月计）。',
  'finance.income.label': '月收入',
  'finance.income.hint': '每月税后到手总收入',
  'finance.income.ph': '如 15000',
  'finance.expense.label': '月支出',
  'finance.expense.hint': '每月固定生活开销',
  'finance.expense.ph': '如 8000',
  'finance.savings.label': '现有存款',
  'finance.savings.hint': '当前可动用的储蓄总额',
  'finance.savings.ph': '如 100000',
  'finance.debt.label': '负债',
  'finance.debt.hint': '房贷 / 车贷 / 信用卡等欠款总额',
  'finance.debt.ph': '如 0',
  'finance.error.empty': '请输入数值',
  'finance.error.negative': '不能为负数，请填 0 或更大的数',
  'finance.error.nan': '请输入有效数字',
  'finance.saved': '已自动保存到本机',
  'finance.unfilled': '4 项填齐后自动保存到本机',
  'finance.privacy': '这 4 个数只存在这台设备上，不会上传——上报的漏斗事件只有事件名与时间。',
  'finance.prev': '← 上一步：设计理想生活',
  'finance.next': '下一步：看测算结果 →',
};

const EN: Record<keyof typeof ZH, string> = {
  'designer.metaTitle': 'Design your ideal life · rich-sim',
  'designer.metaDesc':
    'Pick the life you want across 7 dimensions — housing, transport, family and more — and watch the annual cost update as you choose.',
  'designer.eyebrow': 'Ideal-life designer',
  'designer.h1': 'Design the life you want',
  'designer.intro':
    'Choose one option per dimension; the tool sums their annual costs. Figures are actual out-of-pocket ' +
    'annual cash costs in the United States, calibrated from public statistics (data year 2024; top tiers ' +
    'are industry estimates). For financial-literacy education only — not a quote.',
  'designer.disclaimer':
    'Disclaimer: this tool does static arithmetic for financial-literacy education. It is not investment ' +
    'advice, recommends no product, and promises no future return. Annual cost is a plain sum of your ' +
    'selected options; inflation is recorded as an assumption and is not applied yet.',
  'designer.nextStep': 'Next: enter your finances →',
  'designer.totalLabel': 'Ideal-life annual cost ({currency})',
  'designer.saved': 'Saved · on this device',
  'designer.notSaved': 'Not saved',
  'designer.savedHint': 'Your choices are stored on this device',
  'designer.saveHint': 'Choices save automatically',
  'designer.gotoFinance': 'Enter them →',
  'currency.label': 'Display currency',
  'currency.busy': 'Switching…',
  'currency.fxLine': 'FX: {source} · {date}',
  'currency.failed': 'Switch failed: {error}',
  'locale.label': 'Language',
  'converter.lifeTotal': 'the life you designed',
  'converter.cartLife': 'the lifestyle in the sim cart',
  'assumptions.title': 'Assumptions',
  'assumptions.returnRate': 'Annual return rate',
  'assumptions.withdrawalRate': 'Safe withdrawal rate',
  'assumptions.inflation': 'Annual inflation',
  'assumptions.version': 'Assumption version',
  'assumptions.fxLine':
    'FX: 1 {base} = {cny} CNY and {eur} EUR. Source {source}, dated {date}.',
  'assumptions.disclaimerTitle': 'Disclaimer',
  'assumptions.disclaimer1':
    'This tool only does static arithmetic on assumptions you entered yourself. It is not investment advice.',
  'assumptions.disclaimer2': 'No specific financial product, security or institution is recommended or endorsed.',
  'assumptions.disclaimer3':
    'Results do not forecast markets and promise no future return; actual outcomes can differ greatly.',
  'assumptions.disclaimer4': 'Inflation and similar assumptions are recorded and displayed, not applied yet.',
  'assumptions.disclaimer5':
    'This is a financial-literacy simulator. It does not replace professional financial, legal or tax advice.',
  'finance.metaTitle': 'Enter your finances · rich-sim',
  'finance.metaDesc':
    'Four numbers only: monthly income, monthly spending, savings and debt. Editable any time, stored on your device.',
  'finance.eyebrow': 'Finances',
  'finance.h1': 'Tell us where you stand financially',
  'finance.intro':
    'Four numbers, and you can come back and edit them any time. Units: {currency}, per month.',
  'finance.income.label': 'Monthly income',
  'finance.income.hint': 'Total take-home after tax',
  'finance.income.ph': 'e.g. 15000',
  'finance.expense.label': 'Monthly spending',
  'finance.expense.hint': 'Recurring monthly living costs',
  'finance.expense.ph': 'e.g. 8000',
  'finance.savings.label': 'Current savings',
  'finance.savings.hint': 'Cash you could actually draw on',
  'finance.savings.ph': 'e.g. 100000',
  'finance.debt.label': 'Debt',
  'finance.debt.hint': 'Total outstanding: mortgage, car loans, cards',
  'finance.debt.ph': 'e.g. 0',
  'finance.error.empty': 'Enter a number',
  'finance.error.negative': 'Cannot be negative — enter 0 or more',
  'finance.error.nan': 'Enter a valid number',
  'finance.saved': 'Saved automatically on this device',
  'finance.unfilled': 'Saves automatically once all 4 are filled in',
  'finance.privacy':
    'These four numbers stay on this device and are never uploaded — funnel events carry an event name and a timestamp only.',
  'finance.prev': '← Back: design your ideal life',
  'finance.next': 'Next: see your projection →',
};

export type MessageKey = keyof typeof ZH;

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { zh: ZH, en: EN };

export function t(key: MessageKey, locale: Locale): string {
  return MESSAGES[locale][key] ?? ZH[key];
}

/** 只有 {name} 这一种插值：文案里要动态塞的只有币种、日期、错误串。 */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
