import { describe, expect, it } from 'vitest';
import { initialCatalogUSD } from './catalog-data';
import type { CatalogDimension } from './types';

/** 硬编码的 M1 七维度 id（与 PRD §8 F1 一致）。 */
const EXPECTED_DIMENSION_IDS = [
  'living',
  'transport',
  'family',
  'travel',
  'health-insurance',
  'dining-daily',
  'flexibility',
] as const;

/**
 * 富豪档（top option）中，必须能追溯到 wealth-lifestyle-framework §4
 * 公开 URL 的选项。key = optionId，value = 必须匹配的来源 URL。
 * 2026-10 起其余选项也均已用公开来源（BLS CE/AAA/KFF/NAIS 等）校准。
 */
const FRAMEWORK_SOURCED_LUXURY_OPTIONS: Record<string, string> = {
  'living/luxury-mansion':
    'https://moneyinc.com/the-annual-maintenance-cost-of-a-4-million-luxury-home/',
  'transport/private-jet':
    'https://theflyingengineer.com/the-real-cost-of-owning-and-operating-a-private-jet/',
  'travel/superyacht':
    'https://firstownersreference.com/01-reality-of-ownership',
};

describe('initialCatalogUSD (T05) · 形状校验', () => {
  it('currency 为 USD', () => {
    expect(initialCatalogUSD.currency).toBe('USD');
  });

  it('恰好 7 个维度，且 id 与 PRD §8 F1 一致', () => {
    const dims: CatalogDimension[] = initialCatalogUSD.dimensions;
    expect(dims).toHaveLength(7);
    expect(dims.map((d) => d.id)).toEqual([...EXPECTED_DIMENSION_IDS]);
  });

  it('每个维度的选项数在 3–5 之间', () => {
    for (const dim of initialCatalogUSD.dimensions) {
      expect(
        dim.options.length,
        `维度 ${dim.id} 选项数=${dim.options.length}，应在 3–5`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        dim.options.length,
        `维度 ${dim.id} 选项数=${dim.options.length}，应在 3–5`,
      ).toBeLessThanOrEqual(5);
    }
  });

  it('所有 annualCost > 0', () => {
    for (const dim of initialCatalogUSD.dimensions) {
      for (const opt of dim.options) {
        expect(
          opt.annualCost,
          `${dim.id}/${opt.id} annualCost=${opt.annualCost}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('每个选项的 source 都是可查证的 http(s) URL', () => {
    for (const dim of initialCatalogUSD.dimensions) {
      for (const opt of dim.options) {
        expect(
          typeof opt.source === 'string' && /^https?:\/\//.test(opt.source),
          `${dim.id}/${opt.id} source 不是 http(s) URL：${opt.source}`,
        ).toBe(true);
        expect(
          typeof opt.note === 'string' && opt.note.length > 0,
          `${dim.id}/${opt.id} 缺少口径说明 note`,
        ).toBe(true);
      }
    }
  });

  it('每个维度内选项 annualCost 严格递增（成本梯度）', () => {
    for (const dim of initialCatalogUSD.dimensions) {
      for (let i = 1; i < dim.options.length; i += 1) {
        const prev = dim.options[i - 1]?.annualCost;
        const cur = dim.options[i]?.annualCost;
        expect(
          prev !== undefined && cur !== undefined && cur > prev,
          `${dim.id} 第 ${i} 项金额未递增：${prev} -> ${cur}`,
        ).toBe(true);
      }
    }
  });

  it('每个维度至多 1 个 isDefault', () => {
    for (const dim of initialCatalogUSD.dimensions) {
      const defaults = dim.options.filter((o) => o.isDefault === true);
      expect(
        defaults.length,
        `维度 ${dim.id} 默认选项数=${defaults.length}，应 ≤ 1`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('全目录 option id 唯一（跨维度不重名）', () => {
    const seen = new Set<string>();
    for (const dim of initialCatalogUSD.dimensions) {
      for (const opt of dim.options) {
        const key = `${dim.id}/${opt.id}`;
        expect(seen.has(key), `重复 option key: ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('富豪档中应追溯到框架 §4 的选项，source 与预期 URL 一致', () => {
    for (const dim of initialCatalogUSD.dimensions) {
      for (const opt of dim.options) {
        const key = `${dim.id}/${opt.id}`;
        const expectedUrl = FRAMEWORK_SOURCED_LUXURY_OPTIONS[key];
        if (expectedUrl) {
          expect(opt.source, `${key} 缺少框架 §4 URL`).toBe(expectedUrl);
        }
      }
    }
  });

  it('每个维度至少有 1 个 isDefault（合理默认值）', () => {
    for (const dim of initialCatalogUSD.dimensions) {
      const defaults = dim.options.filter((o) => o.isDefault === true);
      expect(
        defaults.length,
        `维度 ${dim.id} 缺少默认选项`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
