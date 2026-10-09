import { describe, expect, it } from 'vitest';
import type { Assumptions, Catalog, FxSnapshot } from '@rich-sim/core';
import { initialCatalogUSD } from '@rich-sim/core';
import type { Draft } from './draft';
import { MESSAGES } from './messages';
import { buildReport } from './report';

/**
 * 界面措辞与数据事实之间的一致性闸门。
 *
 * 存在的理由：目录数值已按公开来源校准（23 项全部带 URL、零个「待校准」），
 * 但设计器文案当时仍写着「当前数字为初步估算（多数标注待校准）」——没有任何
 * 测试能发现它。这类陈述只会静默变旧，而它是对用户陈述数据可信度的。
 *
 * 用 import.meta.glob 读原文而不是 node:fs：apps/web 的 tsconfig 不带 node 类型，
 * 且本仓库测试的既有风格是注入依赖而不是伸手拿运行时设施。
 */

const uiModules = import.meta.glob('../**/*.{ts,tsx,astro}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const uiSources = Object.entries(uiModules).filter(
  ([path]) => !/\.(test|d)\.[a-z]+$/.test(path),
);
const uiText = uiSources.map(([, text]) => text).join('\n');

const unverifiedOptions = initialCatalogUSD.dimensions
  .flatMap((dimension) => dimension.options)
  .filter((option) => !option.source || !/^https?:\/\//.test(option.source));

describe('界面措辞闸门', () => {
  // 后面三条都是「不存在」型断言，先证明扫描器真的看得见文件，
  // 否则 glob 模式一失效，三条会同时假绿。
  it('扫到了界面源文件（正向对照）', () => {
    expect(uiSources.length).toBeGreaterThan(5);
    expect(uiText).toContain('理想生活');
  });

  it('「待校准 / 初步估算」只在目录真的有未核验项时出现', () => {
    const claimsUnverified = /待校准|初步估算/.test(uiText);
    expect(claimsUnverified).toBe(unverifiedOptions.length > 0);
  });

  it('红线禁语不出现在任何界面文案里', () => {
    for (const phrase of ['稳赚', '躺赚', '保证收益', '预期收益', '你也能拥有', '你将拥有']) {
      expect(uiText, `界面出现禁语「${phrase}」`).not.toContain(phrase);
    }
  });

  it('商城不做电商促销话术（无折扣/倒计时/库存压迫）', () => {
    for (const phrase of ['优惠', '折扣', '抢购', '仅剩', '限时', '秒杀', '库存紧张']) {
      expect(uiText, `商城出现促销话术「${phrase}」`).not.toContain(phrase);
    }
  });

  it('假设清单与免责声明仍在渲染路径上', () => {
    expect(uiText).toContain('假设清单');
    expect(uiText).toContain('免责声明');
  });
});

/**
 * M4 S2 · T07 · 报告措辞闸门。
 *
 * 上面那块扫的是**源码文本**，看不见运行时拼出来的字符串——而报告的值几乎
 * 全是 `buildReport()` 拼的（币种格式化、年限插值、状态句子）。所以这里换一种
 * 扫法：**把报告真的渲染出来**，对两个语言各扫一遍。
 */
describe('报告措辞闸门（M4 S2 · T07）', () => {
  const fx: FxSnapshot = {
    base: 'USD',
    rates: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7.12, HKD: 7.8 },
    date: '2026-10-03',
    source: 'static-snapshot',
    version: 'test',
  };
  const assumptions: Assumptions = {
    returnRate: 0.04,
    withdrawalRate: 0.04,
    inflation: 0.03,
    assumptionsVersion: 'test',
    fx,
  };
  const catalog: Catalog = {
    currency: 'USD',
    dimensions: [
      {
        id: 'living',
        label: '居住',
        options: [{ id: 'opt', label: '测试档', annualCost: 80_000, isDefault: true }],
      },
    ],
  };
  const draft: Draft = {
    schemaVersion: 1,
    choices: [],
    profile: { income: 15000, expense: 10000, savings: 100000, debt: 0, currency: 'USD' },
    currency: 'USD',
    assumptions,
    updatedAt: '2026-10-08T00:00:00.000Z',
  };

  const BANNED = ['稳赚', '躺赚', '保证收益', '预期收益', '你也能拥有', '你将拥有'];
  /** 英文侧只挑不会误伤否定句式的词（免责声明里会合法地出现 "not ... advice"）。 */
  const BANNED_EN = ['guaranteed', 'risk-free', 'promise you'];

  function renderedStrings(locale: 'zh' | 'en'): string[] {
    const report = buildReport(draft, catalog, locale, {
      now: new Date('2026-10-08T12:00:00.000Z'),
      scenarios: [{ id: 'raise', value: 10 }, { id: 'jobless' }],
    });
    if (!report) throw new Error('报告不该为 null，测试前提不成立');
    return [
      report.generatedOn,
      ...report.blocks.flatMap((block) => [
        block.title,
        ...block.fields.flatMap((field) => [field.label, field.value]),
      ]),
    ];
  }

  it('渲染出来的每一段都不含禁语（zh / en 各扫一遍）', () => {
    for (const locale of ['zh', 'en'] as const) {
      const strings = renderedStrings(locale);
      expect(strings.length).toBeGreaterThan(10); // 正向对照：真的渲染出东西了
      for (const text of strings) {
        for (const phrase of BANNED) {
          expect(text, `${locale} 报告出现禁语「${phrase}」：${text}`).not.toContain(phrase);
        }
        for (const phrase of BANNED_EN) {
          expect(
            text.toLowerCase(),
            `${locale} 报告出现英文禁语「${phrase}」：${text}`,
          ).not.toContain(phrase);
        }
      }
    }
  });

  it('免责声明随报告走：两个语言都有 report.note，且明说「不是建议」', () => {
    expect(MESSAGES.zh['report.note']).toContain('不构成');
    expect(MESSAGES.zh['report.note']).toContain('建议');
    expect(MESSAGES.en['report.note']).toContain('not');
    expect(MESSAGES.en['report.note']).toContain('advice');
  });

  it('每一段都非空（词典缺 key 会让 t() 回退成空串，报告就会印出空白）', () => {
    for (const locale of ['zh', 'en'] as const) {
      for (const text of renderedStrings(locale)) {
        expect(text.trim().length, `${locale} 报告出现空段落`).toBeGreaterThan(0);
      }
    }
  });
});
