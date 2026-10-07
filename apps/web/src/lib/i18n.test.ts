/**
 * i18n 切片一 · 语言解析与词典闸门。
 *
 * 这里最要紧的是两条「会静默失败」的性质：优先级写歪（Cookie 被 URL 参数越过、
 * 或者 ?lang=de 把界面变成未定义），以及**少翻一个键**——后者在页面上只会表现成
 * 英文界面里冒出一句中文，没人会专门去查。所以用类型 + 测试各钉一遍。
 */
import { describe, expect, it } from 'vitest';
import { buildMilestones, type FxSnapshot } from '@rich-sim/core';
import { HTML_LANG, localeFromAcceptLanguage, parseCookie, resolveLocale, type Locale } from './i18n';
import { MESSAGES, format, t, type MessageKey } from './messages';

describe('resolveLocale 优先级', () => {
  it('URL 参数 > Cookie > Accept-Language > 默认 en', () => {
    expect(resolveLocale({ searchParam: 'zh', cookie: 'en', acceptLanguage: 'en-US' })).toBe('zh');
    expect(resolveLocale({ cookie: 'zh', acceptLanguage: 'en-US' })).toBe('zh');
    expect(resolveLocale({ acceptLanguage: 'zh-CN,zh;q=0.9' })).toBe('zh');
    expect(resolveLocale({ acceptLanguage: 'fr-FR,en;q=0.8' })).toBe('en');
    expect(resolveLocale({})).toBe('en');
  });

  it('认不出的语言值不生效，也不会把结果变成 undefined', () => {
    expect(resolveLocale({ searchParam: 'de', cookie: 'zh' })).toBe('zh');
    expect(resolveLocale({ searchParam: 'de' })).toBe('en');
    expect(resolveLocale({ searchParam: '', cookie: '', acceptLanguage: '' })).toBe('en');
    expect(resolveLocale({ cookie: 'en', defaultLocale: 'zh' })).toBe('en');
    expect(resolveLocale({ defaultLocale: 'zh' })).toBe('zh');
  });

  it('Accept-Language 只看第一个能识别的语言', () => {
    expect(localeFromAcceptLanguage('de-DE,de;q=0.9,zh;q=0.8')).toBe('zh');
    expect(localeFromAcceptLanguage('zh-TW')).toBe('zh');
    expect(localeFromAcceptLanguage('es')).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });
});

describe('parseCookie', () => {
  it('在多条 Cookie 中精确取目标项，不被同名前缀骗走', () => {
    const header = 'other=1; rich-sim-locale=en; rich-sim-locale-x=zh';
    expect(parseCookie(header, 'rich-sim-locale')).toBe('en');
    expect(parseCookie('a=1', 'rich-sim-locale')).toBeNull();
    expect(parseCookie(null, 'rich-sim-locale')).toBeNull();
    expect(parseCookie(undefined, 'rich-sim-locale')).toBeNull();
  });
});

describe('词典完整性', () => {
  const zhKeys = Object.keys(MESSAGES.zh).sort();

  it('en 覆盖 zh 的每一个 key（漏译直接红）', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(zhKeys);
  });

  it('两边都没有空串', () => {
    for (const locale of ['zh', 'en'] as Locale[]) {
      for (const key of Object.keys(MESSAGES[locale]) as MessageKey[]) {
        expect(MESSAGES[locale][key].trim(), `${locale} / ${key} 是空的`).not.toBe('');
      }
    }
  });

  it('英文词典里没有原样兜过去的中文', () => {
    for (const key of zhKeys as MessageKey[]) {
      const value = MESSAGES.en[key];
      expect(value, `en / ${key} 仍含中文：${value}`).not.toMatch(/[一-鿿]/);
    }
  });

  it('红线禁语的英文对应说法同样不许出现（合规文本不是可意译的营销文案）', () => {
    const banned = /guarantee|guaranteed|steady gains|risk-?free|you will (own|have|earn)/i;
    for (const key of zhKeys as MessageKey[]) {
      expect(MESSAGES.en[key], `en / ${key} 越线：${MESSAGES.en[key]}`).not.toMatch(banned);
    }
  });

  it('t 取到对应语言的文本', () => {
    expect(t('designer.h1', 'zh')).toBe('设计你想过的生活');
    expect(t('designer.h1', 'en')).toBe('Design the life you want');
  });
});

describe('format', () => {
  it('替换已知占位符；未知占位符原样留着，绝不静默吞掉文案', () => {
    expect(
      format('汇率：{source} · {date}', { source: 'Frankfurter (ECB)', date: '2026-10-02' }),
    ).toBe('汇率：Frankfurter (ECB) · 2026-10-02');
    expect(format('a {x} b', {})).toBe('a {x} b');
  });
});

it('<html lang> 用 BCP 47，不是内部枚举', () => {
  expect(HTML_LANG.en).toBe('en');
  expect(HTML_LANG.zh).toBe('zh-CN');
});

/**
 * 阶梯目标的行动项由词典渲染（core 那句是中文），界面就不再显示 core 的字符串。
 * 两处各写各的话，「示例路径，非承诺」这句合规措辞会悄悄和引擎脱钩——所以逐字钉住：
 * 改 core 或改词典任意一边，这条就红。
 */
describe('词典与 core 的行动项文本一致', () => {
  it('zh 的 result.action1..3 逐字等于 buildMilestones 返回的 action', () => {
    const fx: FxSnapshot = {
      base: 'USD',
      rates: { USD: 1, EUR: 0.9, GBP: 0.8, JPY: 150, CNY: 7, HKD: 7.8 },
      date: '2026-10-07',
      source: 'static-snapshot',
      version: 'test',
    };
    const milestones = buildMilestones(
      { income: 15000, expense: 10000, savings: 100000, debt: 0, currency: 'USD' },
      { kind: 'enough-line', value: 80_000 },
      {
        returnRate: 0.04,
        withdrawalRate: 0.04,
        inflation: 0.03,
        assumptionsVersion: 'test',
        fx,
      },
    );
    expect(milestones.map((m) => m.action)).toEqual([
      t('result.action1', 'zh'),
      t('result.action2', 'zh'),
      t('result.action3', 'zh'),
    ]);
  });
});
