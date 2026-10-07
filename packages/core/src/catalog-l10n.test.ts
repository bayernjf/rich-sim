/**
 * M4-i18n 切片一 · 目录英文名表的穷尽性。
 *
 * 存在的理由：新增或改名一个档位时如果忘了配英文名，页面不会报错——它会
 * 静默地把中文混进英文界面里，而这正是最不容易被发现、又最容易被用户看到的
 * 缺陷形态。所以这里把「静默混合」变成红灯。
 */
import { describe, expect, it } from 'vitest';
import {
  CATALOG_LABELS_EN,
  dimensionLabel,
  initialCatalogUSD,
  optionLabel,
} from './catalog-data';

const dimensionIds = initialCatalogUSD.dimensions.map((d) => d.id);
const optionIds = initialCatalogUSD.dimensions.flatMap((d) => d.options.map((o) => o.id));
const allIds = [...dimensionIds, ...optionIds];

describe('CATALOG_LABELS_EN 穷尽性', () => {
  it('维度与选项的 id 一个不漏、一个不多（同一张表，缺/多都红）', () => {
    expect(Object.keys(CATALOG_LABELS_EN).sort()).toEqual([...allIds].sort());
  });

  it('维度 id 与选项 id 不重名（共用一张表的前提）', () => {
    const overlap = dimensionIds.filter((id) => optionIds.includes(id));
    expect(overlap).toEqual([]);
  });

  it('英文名里没有中文字符（防复制粘贴错位）', () => {
    for (const [id, label] of Object.entries(CATALOG_LABELS_EN)) {
      expect(label, `${id} 的英文名含中文：${label}`).not.toMatch(/[一-鿿]/);
      expect(label, `${id} 的英文名为空`).toMatch(/[A-Za-z]/);
    }
  });

  it('数量与目录一致：7 个维度、23 个选项', () => {
    expect(dimensionIds).toHaveLength(7);
    expect(optionIds).toHaveLength(23);
  });
});

describe('选择器', () => {
  it('zh 恒返回 label 原文；en 返回英文名', () => {
    const dim = initialCatalogUSD.dimensions[0];
    const opt = dim?.options[0];
    if (!dim || !opt) throw new Error('目录为空，测试前提不成立');
    expect(dimensionLabel(dim, 'zh')).toBe(dim.label);
    expect(dimensionLabel(dim, 'en')).toBe('Housing');
    expect(optionLabel(opt, 'zh')).toBe(opt.label);
    expect(optionLabel(opt, 'en')).toBe(CATALOG_LABELS_EN[opt.id]);
  });

  it('查不到 id 时退回原文，绝不返回空串或 undefined', () => {
    expect(dimensionLabel({ id: 'no-such-dim', label: '未知维度' }, 'en')).toBe('未知维度');
    expect(optionLabel({ id: 'no-such-opt', label: '未知选项' }, 'en')).toBe('未知选项');
  });
});
