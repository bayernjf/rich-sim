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
  /**
   * 每类资产的年波动率假设（%，用户自填；null = 0，退回确定性复利）。
   * 填了才启用蒙特卡洛路径——「同样平均收益、路径千差万别」这一课由它驱动。
   */
  volatility: Record<AssetClass, number | null>;
};

/** 起始权重：全部现金 100%——领到的钱默认躺着不动，配置是用户的主动动作。 */
export function emptyAllocation(): InvestAllocation {
  return {
    weights: { cash: 100, bond: 0, equity: 0, realestate: 0, alternative: 0 },
    returns: { cash: null, bond: null, equity: null, realestate: null, alternative: null },
    volatility: { cash: null, bond: null, equity: null, realestate: null, alternative: null },
  };
}

/** 权重合计（浮点宽容到 0.01）。 */
export function weightTotal(weights: Record<AssetClass, number>): number {
  return ASSET_CLASSES.reduce((sum, cls) => sum + (Number.isFinite(weights[cls]) ? weights[cls] : 0), 0);
}

/** 坏数据一律收敛：未知类别丢弃、权重夹到 [0,100]、收益率夹到 [-100,100] 或 null。 */
export function sanitizeAllocation(raw: unknown): InvestAllocation | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as { weights?: unknown; returns?: unknown; volatility?: unknown };
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
  if (input.volatility && typeof input.volatility === 'object') {
    for (const cls of ASSET_CLASSES) {
      const v = (input.volatility as Record<string, unknown>)[cls];
      if (typeof v === 'number' && Number.isFinite(v)) {
        out.volatility[cls] = Math.min(100, Math.max(0, v));
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

/** 种子化 PRNG（mulberry32）：同一种子必现同一路径，「换一批」只是换种子。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller：均匀分布转标准正态。 */
function standardNormal(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * 蒙特卡洛 · GBM（几何布朗运动）年度步进：S(t+1) = S(t) · exp((μ − σ²/2) + σ·Z)。
 * 每类资产独立模拟后按路径序求和（类别间不相关性从简——这是一条教学线，
 * 不是组合优化器）。波动率全空时退化为确定性路径（与 projectAllocation 同值）。
 */
export function simulateAllocation(
  capital: number,
  allocation: InvestAllocation,
  years: number,
  paths: number,
  seed: number,
): number[] {
  const totals: number[] = [];
  for (let path = 0; path < paths; path += 1) {
    let total = 0;
    for (const cls of ASSET_CLASSES) {
      let amount = (capital * allocation.weights[cls]) / 100;
      const mu = (allocation.returns[cls] ?? 0) / 100;
      const sigma = (allocation.volatility[cls] ?? 0) / 100;
      const rand = mulberry32(seed + path * 7919 + ASSET_CLASSES.indexOf(cls) * 104729);
      for (let year = 0; year < years; year += 1) {
        if (sigma > 0) {
          amount *= Math.exp(mu - (sigma * sigma) / 2 + sigma * standardNormal(rand));
        } else {
          amount *= 1 + mu;
        }
      }
      total += amount;
    }
    totals.push(total);
  }
  return totals.sort((a, b) => a - b);
}

/** 从排序后的路径结果取分位数（线性插值）。 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export type McRow = { years: number; p10: number; median: number; p90: number };

/** 每个 horizon 一行：P10 / 中位数 / P90。 */
export function monteCarloRows(
  capital: number,
  allocation: InvestAllocation,
  yearsList: number[],
  paths: number,
  seed: number,
): McRow[] {
  return yearsList.map((years) => {
    const totals = simulateAllocation(capital, allocation, years, paths, seed);
    return {
      years,
      p10: percentile(totals, 0.1),
      median: percentile(totals, 0.5),
      p90: percentile(totals, 0.9),
    };
  });
}
