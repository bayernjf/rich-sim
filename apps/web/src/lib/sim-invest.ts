/**
 * P3 投资线（B 线）· 起始金按资产类别分配的最小推演（`homepage-claim-experience.md` §2/§5）。
 *
 * 红线集中在这一条线，所以实现刻意收窄：
 * - 只出现**资产类别**（现金/债券/股票/房产/另类），永不出现标的、基金名、代码；
 * - **不做"推荐配置"按钮**——权重与收益率全部用户自填，界面只呈现算术；
 * - 收益率是用户自填的显式假设，文案永远是「你假设它每年 x%」；
 * - 与 REAL 账零耦合：数据挂在 `rich-sim:sim:v1` 的可选 `invest` 字段上，
 *   不 import `lib/draft.ts`（由测试源码扫描钉住）。
 */

/** 资产类别清单（顺序即 UI 顺序）。这是 B 线能出现的全部分配对象。 */
export const ASSET_CLASSES = ['cash', 'bond', 'equity', 'realestate', 'alternative'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/**
 * 一份配置：权重（百分比，合计必须 100）+ 每个类别用户自填的年收益率假设（%）。
 * 收益率缺失（null）时该类别按 0% 参与推演，并在 UI 上提示补填。
 */
export type InvestAllocation = {
  weights: Record<AssetClass, number>;
  returns: Record<AssetClass, number | null>;
};

/** 起始权重：全部现金 100%——领到的钱默认躺着不动，配置是用户的主动动作。 */
export function emptyAllocation(): InvestAllocation {
  return {
    weights: { cash: 100, bond: 0, equity: 0, realestate: 0, alternative: 0 },
    returns: { cash: null, bond: null, equity: null, realestate: null, alternative: null },
  };
}

/** 权重合计（浮点宽容到 0.01）。 */
export function weightTotal(weights: Record<AssetClass, number>): number {
  return ASSET_CLASSES.reduce((sum, cls) => sum + (Number.isFinite(weights[cls]) ? weights[cls] : 0), 0);
}

/** 坏数据一律收敛：未知类别丢弃、权重夹到 [0,100]、收益率夹到 [-100,100] 或 null。 */
export function sanitizeAllocation(raw: unknown): InvestAllocation | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as { weights?: unknown; returns?: unknown };
  const out = emptyAllocation();
  let seen = false;
  if (input.weights && typeof input.weights === 'object') {
    for (const cls of ASSET_CLASSES) {
      const v = (input.weights as Record<string, unknown>)[cls];
      if (typeof v === 'number' && Number.isFinite(v)) {
        out.weights[cls] = Math.min(100, Math.max(0, v));
        seen = true;
      }
    }
  }
  if (input.returns && typeof input.returns === 'object') {
    for (const cls of ASSET_CLASSES) {
      const v = (input.returns as Record<string, unknown>)[cls];
      if (typeof v === 'number' && Number.isFinite(v)) {
        out.returns[cls] = Math.min(100, Math.max(-100, v));
      }
    }
  }
  return seen ? out : undefined;
}

/** 单类别一年后的金额（缺失收益率按 0%）。 */
export function growClass(amount: number, annualPct: number | null, years: number): number {
  const r = (annualPct ?? 0) / 100;
  return amount * Math.pow(1 + r, years);
}

export type ProjectionRow = {
  years: number;
  total: number;
  byClass: Record<AssetClass, number>;
};

/**
 * 推演：各类别独立按自填年复利增长后求和（不互相再平衡——再平衡是一种策略建议）。
 * `yearsList` 之外的任何动态都在 UI 层。
 */
export function projectAllocation(
  capital: number,
  allocation: InvestAllocation,
  yearsList: number[],
): ProjectionRow[] {
  return yearsList.map((years) => {
    const byClass = emptyAllocation().weights;
    let total = 0;
    for (const cls of ASSET_CLASSES) {
      const amount = growClass((capital * allocation.weights[cls]) / 100, allocation.returns[cls], years);
      byClass[cls] = amount;
      total += amount;
    }
    return { years, total, byClass };
  });
}

/** 权重是否配满 100%（未配满时其余按现金 0% 计，UI 提示）。 */
export function isComplete(weights: Record<AssetClass, number>): boolean {
  return Math.abs(weightTotal(weights) - 100) < 0.01;
}
