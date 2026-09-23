/** Seller trust score (AGENTS.md section 13): 100 − 25 × upheld reports + 2 × completed orders, 0–100. */
export function trustScore(upheldReports: number, completedOrders: number) {
  return Math.max(0, Math.min(100, 100 - 25 * upheldReports + 2 * completedOrders));
}
export const SUSPEND_BELOW = 50;
