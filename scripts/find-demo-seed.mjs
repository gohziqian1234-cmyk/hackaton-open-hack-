// Finds (or with --check, verifies) the fixed demo shuffle seed in src/server/seed.ts.
// Requirements: the 94th box (position 93) is Eclipse Knight, and positions 0–92 contain at
// least one Eclipse Knight (Alex's starter) and one Aurora Warden (Sarah's trade offer).
// Usage: node scripts/find-demo-seed.mjs [--check]
import { createHash } from 'node:crypto';
import { buildPool, shuffle } from '../src/domain/fairness.ts';
import { characters } from '../src/lib/catalog.ts';
import { DEMO_SEED_HEX, DEMO_SOLD } from '../src/server/seed.ts';

const pool = buildPool(characters, 100);
const fits = (seed) => {
  const order = shuffle(pool, seed);
  const sold = order.slice(0, DEMO_SOLD);
  return order[DEMO_SOLD] === 'eclipse' && sold.includes('eclipse') && sold.includes('aurora');
};

if (process.argv.includes('--check')) {
  if (!fits(DEMO_SEED_HEX)) {
    console.error('DEMO_SEED_HEX does not meet the demo requirements.');
    process.exit(1);
  }
  const order = shuffle(pool, DEMO_SEED_HEX);
  console.log(`OK: position ${DEMO_SOLD} is ${order[DEMO_SOLD]} for seed ${DEMO_SEED_HEX}`);
} else {
  for (let n = 0; ; n++) {
    const seed = createHash('sha256').update('loopbox-astral-demo-' + n).digest('hex');
    if (fits(seed)) {
      console.log(`candidate ${n}: ${seed}`);
      break;
    }
  }
}
