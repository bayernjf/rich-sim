/**
 * S3 · 换算条展示层测试（comparison-converter.md §5 / §7）。
 * 期望值都是先把商手算到小数再写死的，不是从实现输出回填的。
 */
import { describe, expect, it } from 'vitest';
import { wealthTimeEquivalent, type FxSnapshot, type Profile } from '@rich-sim/core';
import {
  converterForItem,
  converterLine,
  converterNudge,
  converterCopy,
  priciestSelection,
} from './converter';

const fx: FxSnapshot = {
  base: 'USD',
  rates: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7, HKD: 7.8 },
  date: '2026-10-03',
  source: 'static-snapshot',
  version: 'test',
};

const usd = (local: number) => `$${local.toLocaleString('en-US')}`;
const cny = (local: number) => `¥${local.toLocaleString('en-US')}`;

function profile(over: Partial<Profile> = {}): Profile {
  return { income: 20_000, expense: 5_000, savings: 0, debt: 0, currency: 'USD', ...over };
}

const JET = '私人飞机（年运营全口径）';

describe('converterCopy 四态文案', () => {
  it('60 年内：给年数（50/9 ≈ 5.6 年）', () => {
    const line = converterCopy(wealthTimeEquivalent(1_000_000, profile(), fx), JET, usd);
    expect(line).toBe(`「${JET}」一年 $1,000,000 = 你按现在的存法要存 5.6 年。`);
  });

  it('超 60 年：改倍数表达（3,660,000 ÷ 60,000 = 61）', () => {
    const te = wealthTimeEquivalent(
      3_660_000,
      profile({ income: 10_000, expense: 5_000 }),
      fx,
    );
    expect(converterCopy(te, '超级游艇自持', usd)).toBe(
      '「超级游艇自持」一年 $3,660,000 ≈ 你 61 年的全部结余。',
    );
  });

  it('荒谬量级：收口成陈述，不给数字（12,012,000 ÷ 12,000 = 1,001）', () => {
    const te = wealthTimeEquivalent(12_012_000, profile({ income: 2_000, expense: 1_000 }), fx);
    const line = converterCopy(te, JET, usd);
    expect(line).toContain('算不出年数');
    expect(line).not.toMatch(/1,001|1001/);
    expect(line).not.toContain('≈ 你');
  });

  it('没有净储蓄：一等文案，不出现 Infinity / NaN', () => {
    const line = converterCopy(
      wealthTimeEquivalent(1_000_000, profile({ income: 10_000, expense: 12_000 }), fx),
      JET,
      usd,
    );
    expect(line).toBe(`「${JET}」：按你填的数，目前每月没有净储蓄——这条先算不出年来。`);
    expect(line).not.toMatch(/Infinity|NaN|∞/);
  });

  it('倍数给到千位仍带分隔符（12,000,000 ÷ 12,000 = 1,000）', () => {
    const te = wealthTimeEquivalent(12_000_000, profile({ income: 2_000, expense: 1_000 }), fx);
    expect(converterCopy(te, JET, usd)).toContain('≈ 你 1,000 年的全部结余');
  });

  it('不满一年说月数，绝不出现「0.0 年」', () => {
    // 手算：30,000 ÷ 180,000 = 1/6 年 = 2 个月。
    const te = wealthTimeEquivalent(30_000, profile(), fx);
    expect(converterCopy(te, '合租一间房', usd)).toBe(
      '「合租一间房」一年 $30,000 = 你按现在的存法要存 2 个月。',
    );
  });

  it('措辞纪律：任何一态都不许出现暴富 / 预测句式', () => {
    const cases = [
      wealthTimeEquivalent(1_000_000, profile(), fx),
      wealthTimeEquivalent(3_660_000, profile({ income: 10_000, expense: 5_000 }), fx),
      wealthTimeEquivalent(12_012_000, profile({ income: 2_000, expense: 1_000 }), fx),
      wealthTimeEquivalent(1_000_000, profile({ income: 10_000, expense: 12_000 }), fx),
    ];
    for (const te of cases) {
      const line = converterCopy(te, JET, usd);
      expect(line, line).not.toMatch(/你也能|你将拥有|你将会|你需要|你值得|稳赚|躺赚|保证收益/);
    }
  });

  it('未录入财务：给 F2 引导句（§4 设计器行的顺带收益）', () => {
    expect(converterNudge(JET)).toBe(`先填 4 个数，就能把「${JET}」换算成你要存多久。`);
  });
});

describe('converterLine（两个挂载点共用的入口）', () => {
  const catalog = {
    currency: 'USD' as const,
    dimensions: [
      {
        id: 'living',
        label: '居住',
        options: [
          { id: 'shared', label: '合租一间房', annualCost: 12_000 },
          { id: 'mansion', label: '独栋豪宅（房产税+维护）', annualCost: 120_000 },
        ],
      },
      {
        id: 'transport',
        label: '出行',
        options: [{ id: 'jet', label: JET, annualCost: 1_000_000 }],
      },
    ],
  };
  const choices = [
    { dimension: 'living', optionId: 'shared' },
    { dimension: 'transport', optionId: 'jet' },
  ];

  it('有 profile：出换算句，状态取自 core 的四态', () => {
    const line = converterLine(catalog, choices, profile(), fx, (local, c) => `${c} ${local}`);
    expect(line?.status).toBe('years');
    expect(line?.sentence).toBe(`「${JET}」一年 USD 1000000 = 你按现在的存法要存 5.6 年。`);
  });

  it('没有 profile：同一行改挂引导句，而不是消失', () => {
    const line = converterLine(catalog, choices, null, fx, (local) => `${local}`);
    expect(line?.status).toBe('no-profile');
    expect(line?.sentence).toBe(converterNudge(JET));
  });

  it('还没有任何选择：整行不出现（不渲染空引号）', () => {
    expect(converterLine(catalog, [], profile(), fx, (local) => `${local}`)).toBeNull();
  });

  it('结果页入口：对象是整份理想生活，不是某个单项', () => {
    // 手算：合计 1,012,000 ÷ 180,000 = 5.622… -> 5.6 年（与单项同一个分母）。
    const line = converterForItem(
      { label: '你选的这种生活', annualCostUSD: 1_012_000 },
      profile(),
      fx,
      (local, c) => `${c} ${local}`,
    );
    expect(line?.status).toBe('years');
    expect(line?.sentence).toBe('「你选的这种生活」一年 USD 1012000 = 你按现在的存法要存 5.6 年。');
  });

  it('结果页入口：没录入时也走引导句，不静默消失', () => {
    const line = converterForItem(
      { label: '你选的这种生活', annualCostUSD: 1_012_000 },
      null,
      fx,
      (local) => `${local}`,
    );
    expect(line?.status).toBe('no-profile');
    expect(line?.sentence).toBe(converterNudge('你选的这种生活'));
  });
});

describe('币种切换时的不变性（验收 §7.3）', () => {
  it('年数不动、金额随币种变', () => {
    // 同一经济状况：USD 口径 vs 各 ×7 的 CNY 口径（CurrencySwitcher 的换算规则）。
    const usdLine = converterCopy(wealthTimeEquivalent(1_000_000, profile(), fx), JET, usd);
    const cnyLine = converterCopy(
      wealthTimeEquivalent(1_000_000, profile({ income: 140_000, expense: 35_000, currency: 'CNY' }), fx),
      JET,
      cny,
    );
    expect(usdLine).toContain('要存 5.6 年');
    expect(cnyLine).toContain('要存 5.6 年');
    expect(cnyLine).toContain('¥7,000,000');
    expect(usdLine).not.toContain('¥');
  });
});

describe('priciestSelection', () => {
  const catalog = {
    currency: 'USD' as const,
    dimensions: [
      {
        id: 'living',
        label: '居住',
        options: [
          { id: 'shared', label: '合租一间房', annualCost: 12_000 },
          { id: 'mansion', label: '独栋豪宅（房产税+维护）', annualCost: 120_000 },
        ],
      },
      {
        id: 'transport',
        label: '出行',
        options: [
          { id: 'jet', label: '私人飞机（年运营全口径）', annualCost: 1_000_000 },
          { id: 'car', label: '跑车车队', annualCost: 200_000 },
        ],
      },
    ],
  };

  it('取当前选择里最贵的一项', () => {
    const picked = priciestSelection(catalog, [
      { dimension: 'living', optionId: 'mansion' },
      { dimension: 'transport', optionId: 'car' },
    ]);
    expect(picked?.id).toBe('car');
  });

  it('换算对象随选择变，不是写死的目录项', () => {
    const picked = priciestSelection(catalog, [
      { dimension: 'living', optionId: 'shared' },
      { dimension: 'transport', optionId: 'jet' },
    ]);
    expect(picked?.annualCost).toBe(1_000_000);
  });

  it('选择为空时不给对象（不产 undefined 文案）', () => {
    expect(priciestSelection(catalog, [])).toBeNull();
  });
});

/**
 * 「不写入 draft」是 S3 的完成判据之一，而它是一条**不存在**型断言——
 * 只在整个模块真被扫到的前提下才有意义，所以先断言扫描本身有效。
 */
describe('只读纪律', () => {
  const sources = import.meta.glob('./*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const converterSource = sources['./converter.ts'];

  it('真的读到了 converter.ts 原文（正向对照）', () => {
    expect(converterSource).toBeTruthy();
    expect(converterSource).toContain('priciestSelection');
  });

  it('converter.ts 不碰本机方案，也不碰 localStorage', () => {
    expect(converterSource).not.toMatch(/from '\.\/draft'/);
    expect(converterSource).not.toMatch(/writeDraft|localStorage|DRAFT_KEY/);
  });
});
