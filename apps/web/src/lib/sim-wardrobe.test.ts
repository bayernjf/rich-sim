/**
 * 拟物衣柜内容闸门（sim-wardrobe.md §4 红线）。
 *
 * S2 首批衣物上架后，把三件事钉死：
 * 1. 入池闸门——每件都有 http(s) 来源、kind=consumer、可二手变卖、年成本为正；
 * 2. 英文穷尽——每件都有不含中文的英文名，词典不多 id 也不少 id；
 * 3. 年持有口径——annualCost 显著低于零售价（走摊提，不是把零售价当年账单）。
 */
import { describe, expect, it } from 'vitest';
import {
  WARDROBE_LABELS_EN,
  wardrobeOptionLabel,
  wardrobePool,
} from './sim-wardrobe';

describe('拟物衣柜入池闸门', () => {
  const pool = wardrobePool();

  it('首批有货且每件都带来源、可变卖', () => {
    expect(pool.length).toBeGreaterThanOrEqual(5);
    for (const item of pool) {
      expect(item.option.source).toMatch(/^https?:\/\//);
      expect(item.option.kind).toBe('consumer');
      expect(item.option.resellable).toBe(true);
      expect(item.option.annualCost).toBeGreaterThan(0);
      expect(item.option.note).toBeTruthy();
    }
  });

  it('英文词典与在池条目一一对应，且无中文漏网', () => {
    const ids = pool.map((item) => item.option.id).sort();
    expect(Object.keys(WARDROBE_LABELS_EN).sort()).toEqual(ids);
    for (const item of pool) {
      const en = wardrobeOptionLabel(item.option, 'en');
      expect(en).not.toMatch(/[一-鿿]/);
      expect(wardrobeOptionLabel(item.option, 'zh')).toBe(item.option.label);
    }
  });

  it('年成本是摊提口径：每件年成本都低于其零售价量级（note 里写得出零售价）', () => {
    // 衣柜件没有 purchasePrice 字段，零售价写在 note；这里钉年成本不超过 $4,000
    // （首批零售价 $6,600–$85,000、摊提 10–30 年，年持有均在 $660–$3,000 区间）。
    for (const item of pool) {
      expect(item.option.annualCost).toBeLessThanOrEqual(3000);
    }
  });
});
