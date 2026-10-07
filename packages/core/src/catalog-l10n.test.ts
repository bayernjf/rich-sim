/**
 * i18n 切片一 · 目录英文名表的穷尽性。
 *
 * 存在的理由：新增或改名一个档位时如果忘了配英文名，页面不会报错——它会
 * 静默地把中文混进英文界面里，而这正是最不容易被发现、又最容易被用户看到的
 * 缺陷形态。所以这里把「静默混合」变成红灯。
 */
import { describe, expect, it } from 'vitest';
import {
  CATALOG_COST_COMPONENTS_EN,
  CATALOG_LABELS_EN,
  dimensionLabel,
  initialCatalogUSD,
  optionCostComponents,
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

describe('CATALOG_COST_COMPONENTS_EN 穷尽性', () => {
  // 持有成本拆项会直接渲染在购物区卡片上（ShoppingArea.tsx），是英文界面里
  // 最容易被看见的一处中文残留，所以单独钉一张表。
  const withComponents = initialCatalogUSD.dimensions
    .flatMap((d) => d.options)
    .filter((o) => (o.costComponents?.length ?? 0) > 0);

  it('目录里带 costComponents 的选项，英文表一个不漏、一个不多', () => {
    expect(Object.keys(CATALOG_COST_COMPONENTS_EN).sort()).toEqual(
      withComponents.map((o) => o.id).sort(),
    );
  });

  it('英文拆项与中文逐项对应：条数一致、无中文残留', () => {
    for (const option of withComponents) {
      const en = CATALOG_COST_COMPONENTS_EN[option.id];
      expect(en, `${option.id} 缺英文拆项`).toBeDefined();
      expect(en, `${option.id} 英文拆项条数与中文不一致`).toHaveLength(
        option.costComponents?.length ?? 0,
      );
      for (const line of en ?? []) {
        expect(line, `${option.id} 的英文拆项含中文：${line}`).not.toMatch(/[一-鿿]/);
        expect(line, `${option.id} 的英文拆项为空`).toMatch(/[A-Za-z]/);
      }
    }
  });

  it('访问器：zh 返回原文，en 返回英文，无拆项返回 undefined', () => {
    const mansion = withComponents.find((o) => o.id === 'luxury-mansion');
    if (!mansion) throw new Error('目录缺少 luxury-mansion，测试前提不成立');
    expect(optionCostComponents(mansion, 'zh')).toEqual(mansion.costComponents);
    expect(optionCostComponents(mansion, 'en')).toEqual(
      CATALOG_COST_COMPONENTS_EN['luxury-mansion'],
    );
    expect(optionCostComponents({ id: 'owner-condo' }, 'en')).toBeUndefined();
  });
});
