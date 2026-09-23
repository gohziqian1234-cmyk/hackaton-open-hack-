// Verifiable B2C draw (AGENTS.md section 8). Pure: no database, no clock.
// A campaign's boxes are shuffled once, before any sale, from a secret 32-byte seed.
// We publish sha256(seedHex + "|" + order) up front and reveal the seed when preorders close,
// so anyone can recompute the order and check it was never changed.
import { createHash, createHmac, randomBytes } from 'node:crypto';

export type PoolCharacter = { id: string; units: number };

/** Every character id repeated `units` times, in the given character order. */
export function buildPool(characters: readonly PoolCharacter[], capacity: number) {
  const pool = characters.flatMap((c) => Array.from({ length: c.units }, () => c.id));
  if (pool.length !== capacity)
    throw new Error(`POOL_SIZE_MISMATCH: ${pool.length} units for capacity ${capacity}`);
  return pool;
}

export function newSeedHex() {
  return randomBytes(32).toString('hex');
}

/** Step i of Fisher–Yates picks j = HMAC-SHA256(key = seed bytes, message = "i:<i>") mod (i + 1). */
export function stepIndex(seedHex: string, i: number) {
  const mac = createHmac('sha256', Buffer.from(seedHex, 'hex'))
    .update('i:' + i)
    .digest('hex');
  return Number(BigInt('0x' + mac) % BigInt(i + 1));
}

export function shuffle(pool: readonly string[], seedHex: string) {
  if (!/^[0-9a-f]{64}$/.test(seedHex)) throw new Error('INVALID_SEED');
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) {
    const j = stepIndex(seedHex, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export const canonical = (order: readonly string[]) => order.join(',');

export function commitment(seedHex: string, order: readonly string[]) {
  return createHash('sha256')
    .update(seedHex + '|' + canonical(order))
    .digest('hex');
}

/** True when `order` is exactly what was committed to with this seed. */
export function verify(seedHex: string, order: readonly string[], commitmentHex: string) {
  return commitment(seedHex, order) === commitmentHex;
}
