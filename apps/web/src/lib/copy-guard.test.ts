import { describe, expect, it } from 'vitest';
import { initialCatalogUSD } from '@rich-sim/core';

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

  it('假设清单与免责声明仍在渲染路径上', () => {
    expect(uiText).toContain('假设清单');
    expect(uiText).toContain('免责声明');
  });
});
