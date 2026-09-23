import { describe, expect, it } from 'vitest';
import { splitAlong, validSlice } from '../src/lib/slice';

const rect = { left: 100, top: 100, right: 300, bottom: 380, width: 200 };
const line = (x0: number, y0: number, x1: number, y1: number, n = 20) =>
  Array.from({ length: n + 1 }, (_, i) => ({
    x: x0 + ((x1 - x0) * i) / n,
    y: y0 + ((y1 - y0) * i) / n,
  }));

describe('swipe to tear', () => {
  it('accepts one stroke that enters, crosses at least 60% of the width and leaves', () => {
    expect(validSlice(line(60, 200, 340, 260), rect)).not.toBeNull();
    // Any angle counts, as long as the inside part is long enough.
    expect(validSlice(line(80, 90, 320, 390), rect)).not.toBeNull();
  });
  it('rejects strokes that start inside, never leave, or are too short', () => {
    expect(validSlice(line(150, 200, 340, 200), rect)).toBeNull();
    expect(validSlice(line(60, 200, 250, 200), rect)).toBeNull();
    expect(validSlice(line(60, 102, 340, 102, 3), { ...rect, width: 1000 })).toBeNull();
    expect(validSlice(line(10, 10, 50, 50), rect)).toBeNull();
  });
  it('splits the pack along the stroke into two polygons that fly apart in opposite directions', () => {
    const [a, b] = splitAlong(200, 280, [0, 100], [200, 180]);
    expect(a.clip).toMatch(/^polygon\(/);
    expect(b.clip).toMatch(/^polygon\(/);
    expect(a.clip).toContain('0.00% 35.71%');
    expect(b.clip).toContain('100.00% 64.29%');
    expect(Math.sign(a.dy)).toBe(-Math.sign(b.dy));
  });
});
