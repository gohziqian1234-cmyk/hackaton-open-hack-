/** Dashboard formulas (AGENTS.md section 14). Pure; integer cents for money. */
export function winRate(wins: number, plays: number) {
  if (plays <= 0) return 0;
  return Math.round((wins / plays) * 1000) / 10;
}
export function sellThrough(paid: number, capacity: number) {
  if (capacity <= 0) return 0;
  return Math.round((paid / capacity) * 1000) / 10;
}
export function revenueCents(paid: number, priceCents: number) {
  return paid * priceCents;
}
export function partnerShareCents(revenue: number, revenueShareBps: number) {
  return Math.floor((revenue * revenueShareBps) / 10000);
}
export const percent = (value: number) => value.toFixed(1) + '%';
