/**
 * C2C draw (AGENTS.md section 9): pick one character weighted by remaining stock.
 * `random(total)` must return an integer in [0, total). Walks cumulative stock in the given order.
 */
export type Stock = { id: string; remaining: number };
export function drawOne(stock: readonly Stock[], random: (total: number) => number) {
  const total = stock.reduce((n, s) => n + Math.max(0, s.remaining), 0);
  if (total <= 0) throw new Error('SOLD_OUT');
  const r = random(total);
  if (!Number.isInteger(r) || r < 0 || r >= total) throw new Error('BAD_RANDOM');
  let acc = 0;
  for (const s of stock) {
    if (s.remaining <= 0) continue;
    acc += s.remaining;
    if (r < acc) return { id: s.id, random: r, total };
  }
  throw new Error('UNREACHABLE');
}
/** Draws `quantity` boxes one at a time, removing each drawn unit from stock. */
export function drawMany(
  stock: readonly Stock[],
  quantity: number,
  random: (total: number) => number,
) {
  const live = stock.map((s) => ({ ...s }));
  const draws = [];
  for (let k = 0; k < quantity; k++) {
    const snapshot = live.map((s) => ({ ...s }));
    const pick = drawOne(live, random);
    live.find((s) => s.id === pick.id)!.remaining -= 1;
    draws.push({ ...pick, snapshot });
  }
  return { draws, remaining: live };
}
