/**
 * M4 S2 · T01 报告数据层测试。
 *
 * 断言的是**报告的内容**（块、字段、值），不是 DOM——所以这一层可以在没有
 * 浏览器的地方钉住。数字沿用 `results.test.ts` 的同一套现状与目录，便于对照。
 */
import { describe, expect, it } from 'vitest';
import type { Assumptions, Catalog, FxSnapshot } from '@rich-sim/core';
import type { Draft } from './draft';
import { buildReport } from './report';

const fx: FxSnapshot = {
  base: 'USD',
  rates: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7.12, HKD: 7.8 },
  date: '2026-10-03',
  source: 'static-snapshot',
  version: 'test',
};

function assumptions(over: Partial<Assumptions> = {}): Assumptions {
  return {
    returnRate: 0.04,
    withdrawalRate: 0.04,
    inflation: 0.03,
    assumptionsVersion: 'test',
    fx,
    ...over,
  };
}

function catalogWith(annualCostUSD: number): Catalog {
  return {
    currency: 'USD',
    dimensions: [
      {
        id: 'living',
        label: '居住',
        options: [
          { id: 'opt', label: '测试档', annualCost: annualCostUSD, isDefault: true },
        ],
      },
    ],
  };
}

function makeDraft(over: Partial<Draft> = {}): Draft {
  return {
    schemaVersion: 1,
    choices: [],
    profile: { income: 15000, expense: 10000, savings: 100000, debt: 0, currency: 'USD' },
    currency: 'USD',
    assumptions: assumptions(),
    updatedAt: '2026-10-08T00:00:00.000Z',
    ...over,
  };
}

const NOW = new Date('2026-10-08T12:00:00.000Z');
const ids = (blocks: { id: string }[]) => blocks.map((b) => b.id);

describe('buildReport · 形状', () => {
  it('无 profile：返回 null（调用方据此不渲染报告区块）', () => {
    const report = buildReport(makeDraft({ profile: null }), catalogWith(80_000), 'zh', {
      now: NOW,
    });
    expect(report).toBeNull();
  });

  it('可达：五块齐全且顺序稳定，币种与生成日期随参数', () => {
    const report = buildReport(makeDraft(), catalogWith(80_000), 'zh', { now: NOW });
    if (!report) throw new Error('报告不该为 null');
    expect(ids(report.blocks)).toEqual(['situation', 'goal', 'status', 'gap', 'milestones']);
    expect(report.currency).toBe('USD');
    expect(report.generatedOn).toBe('2026-10-08');
  });

  it('现状块把四个字段都印出来，且带单位提示', () => {
    const report = buildReport(makeDraft(), catalogWith(80_000), 'zh', { now: NOW });
    if (!report) throw new Error('报告不该为 null');
    const situation = report.blocks.find((b) => b.id === 'situation');
    expect(situation?.fields).toHaveLength(4);
    expect(situation?.fields[0]?.label).toContain('每月');
    expect(situation?.fields[2]?.label).toContain('总额');
  });

  it('目标块：够用线 = 80,000 / 0.04 = 2,000,000（与 results.test.ts 同一手算）', () => {
    const report = buildReport(makeDraft(), catalogWith(80_000), 'zh', { now: NOW });
    if (!report) throw new Error('报告不该为 null');
    const goal = report.blocks.find((b) => b.id === 'goal');
    expect(goal?.fields[0]?.value).toContain('2,000,000');
  });
});

describe('buildReport · 三状态是一等状态', () => {
  it('可达：状态句带年限', () => {
    const report = buildReport(makeDraft(), catalogWith(80_000), 'zh', { now: NOW });
    const status = report?.blocks.find((b) => b.id === 'status');
    expect(status?.fields[0]?.value).toContain('20'); // 与 results.test.ts 同一手算
  });

  it('不可达：走不可达文案，不是错误', () => {
    // 年成本 1,000,000 USD -> 够用线 25,000,000，月净 5,000 在 60 年内到不了。
    const report = buildReport(makeDraft(), catalogWith(1_000_000), 'zh', { now: NOW });
    const status = report?.blocks.find((b) => b.id === 'status');
    expect(status?.fields[0]?.value).toBe('60 年内无法达到');
  });

  it('无净储蓄：状态与年限两处都走各自的文案', () => {
    const draft = makeDraft({
      profile: { income: 8000, expense: 10000, savings: 100000, debt: 0, currency: 'USD' },
    });
    const report = buildReport(draft, catalogWith(80_000), 'zh', { now: NOW });
    const status = report?.blocks.find((b) => b.id === 'status');
    const gap = report?.blocks.find((b) => b.id === 'gap');
    expect(status?.fields[0]?.value).toBe('当前没有净储蓄');
    expect(gap?.fields[1]?.value).toBe('—（没有净储蓄）');
  });
});

describe('buildReport · 阶梯目标与情景', () => {
  it('阶梯目标：每个阶段一个字段，至少 3 段', () => {
    const report = buildReport(makeDraft(), catalogWith(80_000), 'zh', { now: NOW });
    const milestones = report?.blocks.find((b) => b.id === 'milestones');
    expect(milestones?.fields.length).toBeGreaterThanOrEqual(3);
    expect(milestones?.fields[0]?.label).toContain('阶段');
  });

  it('不带情景参数：没有情景块', () => {
    const report = buildReport(makeDraft(), catalogWith(80_000), 'zh', { now: NOW });
    expect(ids(report?.blocks ?? [])).not.toContain('scenarios');
  });

  it('带情景参数：有情景块，失业那条是「年限不可比」', () => {
    const report = buildReport(makeDraft(), catalogWith(80_000), 'zh', {
      now: NOW,
      scenarios: [{ id: 'raise', value: 10 }, { id: 'jobless' }],
    });
    const scenarios = report?.blocks.find((b) => b.id === 'scenarios');
    expect(scenarios?.fields).toHaveLength(2);
    expect(scenarios?.fields[0]?.label).toBe('涨薪');
    expect(scenarios?.fields[0]?.value).toBe('年限少 3 年'); // 20 -> 17，与 S1 手算同源
    expect(scenarios?.fields[1]?.value).toBe('年限不可比');
  });

  it('情景为空数组时同样没有情景块（只有真开了才有）', () => {
    const report = buildReport(makeDraft(), catalogWith(80_000), 'zh', {
      now: NOW,
      scenarios: [],
    });
    expect(ids(report?.blocks ?? [])).not.toContain('scenarios');
  });
});
