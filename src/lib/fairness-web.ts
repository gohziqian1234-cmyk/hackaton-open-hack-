// Browser re-implementation of src/domain/fairness.ts with Web Crypto, so the verify page
// can recompute the shuffle and fingerprint without trusting our server.
const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const bytes = (h: string) => new Uint8Array(h.match(/../g)!.map((b) => parseInt(b, 16)));

export function buildPoolWeb(characters: readonly { id: string; units: number }[]) {
  return characters.flatMap((c) => Array.from({ length: c.units }, () => c.id));
}

export async function shuffleWeb(pool: readonly string[], seedHex: string) {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey(
    'raw',
    bytes(seedHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const encoder = new TextEncoder();
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) {
    const mac = await subtle.sign('HMAC', key, encoder.encode('i:' + i));
    const j = Number(BigInt('0x' + hex(mac)) % BigInt(i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export async function commitmentWeb(seedHex: string, order: readonly string[]) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(seedHex + '|' + order.join(',')),
  );
  return hex(digest);
}
