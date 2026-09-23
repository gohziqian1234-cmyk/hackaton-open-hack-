// Constants for the seeded demo drop. No imports, so scripts/find-demo-seed.mjs can load it.

/**
 * Fixed shuffle seed for the DEMO campaign, found by `node scripts/find-demo-seed.mjs`.
 * Chosen so the 94th box (position 93) is Eclipse Knight and positions 0–92 contain the
 * Eclipse Knight Alex already owns and the Aurora Warden Sarah offers for trade.
 * The verify page and README disclose this. Outside DEMO_MODE every campaign gets a random seed.
 */
export const DEMO_SEED_HEX = 'ffda080fb6d7ea212538b41a19ad1b1097e5a59841942bd04f61654e90c00f11';
/** Boxes already sold in the seeded demo history. */
export const DEMO_SOLD = 93;
