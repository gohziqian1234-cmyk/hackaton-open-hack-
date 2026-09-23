/** Platform fee (AGENTS.md section 13): 8% rounded half up, minimum S$0.50. Integer cents only. */
export const FEE_BPS = 800;
export const MIN_FEE_CENTS = 50;
export function platformFee(subtotalCents: number) {
  if (!Number.isInteger(subtotalCents) || subtotalCents <= 0) throw new Error('INVALID_SUBTOTAL');
  const fee = Math.floor((subtotalCents * FEE_BPS + 5000) / 10000);
  return Math.min(subtotalCents, Math.max(MIN_FEE_CENTS, fee));
}
export function split(subtotalCents: number) {
  const fee = platformFee(subtotalCents);
  return { subtotal: subtotalCents, fee, sellerOwed: subtotalCents - fee };
}
