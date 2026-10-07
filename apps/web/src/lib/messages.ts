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
