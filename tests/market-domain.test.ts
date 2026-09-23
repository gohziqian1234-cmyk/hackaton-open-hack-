import { describe, expect, it } from 'vitest';
import { platformFee, split } from '../src/domain/fee';
import { drawMany, drawOne } from '../src/domain/draw';
import { trustScore } from '../src/domain/trust';

/** Deterministic PRNG (mulberry32) so the statistical test can never flake. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return (total: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * total);
  };
}

describe('platform fee: 8%, rounded half up, minimum S$0.50', () => {
  it.each([
    [1, 1],
    [100, 50],
    [625, 50],
    [1000, 80],
    [1250, 100],
    [100000, 8000],
  ])('subtotal %i cents → fee %i cents', (subtotal, fee) => {
    expect(platformFee(subtotal)).toBe(fee);
  });
  it('seller owed + fee always equals the subtotal, in integer cents', () => {
    for (const subtotal of [1, 99, 100, 625, 1890, 3333, 100000]) {
      const s = split(subtotal);
      expect(s.fee + s.sellerOwed).toBe(subtotal);
      expect(Number.isInteger(s.fee) && s.sellerOwed >= 0).toBe(true);
    }
    expect(() => platformFee(0)).toThrow('INVALID_SUBTOTAL');
    expect(() => platformFee(10.5)).toThrow('INVALID_SUBTOTAL');
  });
});

describe('stock-weighted draw', () => {
  it('never picks a character with no stock left, and refuses an empty listing', () => {
    const stock = [
      { id: 'a', remaining: 0 },
      { id: 'b', remaining: 3 },
      { id: 'c', remaining: 0 },
    ];
    const random = seeded(1);
    for (let i = 0; i < 1000; i++) expect(drawOne(stock, random).id).toBe('b');
    expect(() => drawOne([{ id: 'a', remaining: 0 }], random)).toThrow('SOLD_OUT');
    const { remaining } = drawMany([{ id: 'x', remaining: 2 }], 2, random);
    expect(remaining[0].remaining).toBe(0);
    expect(() => drawMany([{ id: 'x', remaining: 2 }], 3, random)).toThrow('SOLD_OUT');
  });
  it('matches stock shares within ±2 percentage points over 10,000 draws', () => {
    const stock = [
      { id: 'mango', remaining: 50 },
      { id: 'durian', remaining: 30 },
      { id: 'kaya', remaining: 15 },
      { id: 'secret', remaining: 5 },
    ];
    const random = seeded(20260923);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10000; i++) {
      const id = drawOne(stock, random).id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    for (const s of stock)
      expect(Math.abs(counts[s.id] / 100 - s.remaining)).toBeLessThanOrEqual(2);
  });
  it('rejects a random value outside [0, total)', () => {
    expect(() => drawOne([{ id: 'a', remaining: 2 }], () => 2)).toThrow('BAD_RANDOM');
  });
});

describe('trust score', () => {
  it('is 100 − 25 × upheld reports + 2 × completed orders, clamped to 0–100', () => {
    expect(trustScore(0, 0)).toBe(100);
    expect(trustScore(1, 0)).toBe(75);
    expect(trustScore(2, 3)).toBe(56);
    expect(trustScore(3, 0)).toBe(25);
    expect(trustScore(0, 40)).toBe(100);
    expect(trustScore(5, 0)).toBe(0);
  });
});
