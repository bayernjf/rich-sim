import { describe, expect, it } from 'vitest';
import { looksLikeEmail, stateFromSession } from './auth';

describe('stateFromSession', () => {
  it('maps a session with email to signed-in', () => {
    const session = { user: { email: 'a@b.co' } } as Parameters<typeof stateFromSession>[0];
    expect(stateFromSession(session)).toEqual({ status: 'signed-in', email: 'a@b.co' });
  });
  it('maps null session to signed-out', () => {
    expect(stateFromSession(null)).toEqual({ status: 'signed-out' });
  });
  it('maps a session without email to signed-out (defensive)', () => {
    const session = { user: {} } as Parameters<typeof stateFromSession>[0];
    expect(stateFromSession(session)).toEqual({ status: 'signed-out' });
  });
});

describe('looksLikeEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(looksLikeEmail('jiang@example.com')).toBe(true);
    expect(looksLikeEmail('  a+b@sub.domain.co ')).toBe(true);
  });
  it('rejects obvious slips', () => {
    expect(looksLikeEmail('')).toBe(false);
    expect(looksLikeEmail('no-at.com')).toBe(false);
    expect(looksLikeEmail('a@b')).toBe(false);
    expect(looksLikeEmail('a b@c.com')).toBe(false);
  });
});
