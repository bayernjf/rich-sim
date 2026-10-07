/**
 * M4-i18n 切片五 · 卡 A 与体验项的英文内容层。
 *
 * 卡片的名字、副标、「虚构角色」标注属于**内容**，不在 UI 词典里（那里只有
 * chrome），所以它们跟着卡定义放在一起，由这里穷尽性钉住：漏一个字段就红，
 * 而不是等某个语言版本的页面悄悄缺一条合规标注。
 */
import { describe, expect, it } from 'vitest';
import { initialCatalogUSD } from '@rich-sim/core';
import {
  CARD_A,
  EXPERIENCE_LABELS_EN,
  cardView,
  experienceLabel,
  shoppingPool,
} from './sim-content';

describe('卡 A 的英文内容', () => {
  it('label / subtitle / fictionNotice 三样都有英文且不是原样兜过去', () => {
    expect(CARD_A.labelEn).not.toBe(CARD_A.label);
    expect(CARD_A.subtitleEn).not.toBe(CARD_A.subtitle);
    expect(CARD_A.fictionNoticeEn).not.toBe(CARD_A.fictionNotice);
    for (const value of [CARD_A.labelEn, CARD_A.subtitleEn, CARD_A.fictionNoticeEn]) {
      expect(value).not.toMatch(/[一-鿿]/);
    }
  });

  it('资产结构逐项都有英文名（数量必须与占比一致）', () => {
    expect(CARD_A.assetStructureEn).toHaveLength(CARD_A.assetStructure.length);
    for (const en of CARD_A.assetStructureEn) expect(en).not.toMatch(/[一-鿿]/);
  });

  it('cardView 按语言取值，zh 路径逐字不变', () => {
    const zh = cardView(CARD_A, 'zh');
    expect(zh.label).toBe(CARD_A.label);
    expect(zh.subtitle).toBe(CARD_A.subtitle);
    expect(zh.fictionNotice).toBe(CARD_A.fictionNotice);
    expect(zh.assetStructure.map((p) => p.label)).toEqual(CARD_A.assetStructure.map((p) => p.label));
    expect(zh.assetStructure.map((p) => p.share)).toEqual([77.5, 22.5]);

    const en = cardView(CARD_A, 'en');
    expect(en.label).toBe(CARD_A.labelEn);
    expect(en.assetStructure.map((p) => p.label)).toEqual(CARD_A.assetStructureEn);
    // 占比一个都不能动：它是示意，但两种语言必须指向同一张饼。
    expect(en.assetStructure.map((p) => p.share)).toEqual([77.5, 22.5]);
  });

  it('英文的虚构标注仍在（合规文本不因语言缺席）', () => {
    expect(cardView(CARD_A, 'en').fictionNotice.toLowerCase()).toContain('fictional');
  });
});

describe('体验项英文名', () => {
  const catalog = initialCatalogUSD;
  const catalogIds = new Set(
    catalog.dimensions.flatMap((d) => d.options.map((o) => o.id)),
  );
  const experienceIds = shoppingPool(catalog)
    .map((item) => item.option.id)
    .filter((id) => !catalogIds.has(id));

  it('购物池里的每个非 catalog 项都有英文名，且表里没有多余 id', () => {
    expect(experienceIds.length).toBeGreaterThan(0);
    expect(Object.keys(EXPERIENCE_LABELS_EN).sort()).toEqual([...experienceIds].sort());
  });

  it('experienceLabel 按语言取，未知 id 退回原文而不是空串', () => {
    const item = shoppingPool(catalog).find((entry) => experienceIds.includes(entry.option.id));
    if (!item) throw new Error('购物池里没有体验项，测试前提不成立');
    expect(experienceLabel(item.option, 'zh')).toBe(item.option.label);
    expect(experienceLabel(item.option, 'en')).toBe(EXPERIENCE_LABELS_EN[item.option.id]);
    expect(experienceLabel({ id: 'nope', label: '未知项' } as never, 'en')).toBe('未知项');
  });
});
