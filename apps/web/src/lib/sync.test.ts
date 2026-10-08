import { describe, expect, it } from 'vitest';
import { decideSync } from './sync';

const at = (iso: string) => ({ updatedAt: iso });
const cloudAt = (iso: string) => ({ updated_at: iso });

describe('decideSync（M5 §3 对时规则）', () => {
  it('未登录永远不动', () => {
    expect(decideSync({ signedIn: false, local: at('2026-10-08T01:00:00Z'), cloud: cloudAt('2026-10-08T02:00:00Z') })).toBe('none');
  });
  it('云端无行、本机有 → 推（首次登录的本机优先）', () => {
    expect(decideSync({ signedIn: true, local: at('2026-10-08T01:00:00Z'), cloud: null })).toBe('push');
  });
  it('两边都没有 → 不动', () => {
    expect(decideSync({ signedIn: true, local: null, cloud: null })).toBe('none');
  });
  it('本机没有、云端有 → 拉（换设备）', () => {
    expect(decideSync({ signedIn: true, local: null, cloud: cloudAt('2026-10-08T01:00:00Z') })).toBe('pull');
  });
  it('云端新 → 拉', () => {
    expect(decideSync({ signedIn: true, local: at('2026-10-08T01:00:00Z'), cloud: cloudAt('2026-10-08T02:00:00Z') })).toBe('pull');
  });
  it('本机新 → 推', () => {
    expect(decideSync({ signedIn: true, local: at('2026-10-08T02:00:00Z'), cloud: cloudAt('2026-10-08T01:00:00Z') })).toBe('push');
  });
  it('相等 → 不动', () => {
    expect(decideSync({ signedIn: true, local: at('2026-10-08T01:00:00Z'), cloud: cloudAt('2026-10-08T01:00:00Z') })).toBe('none');
  });
  it('时间戳解析失败 → 不动（不拿坏数据冒险）', () => {
    expect(decideSync({ signedIn: true, local: at('bad'), cloud: cloudAt('2026-10-08T01:00:00Z') })).toBe('none');
  });
});
