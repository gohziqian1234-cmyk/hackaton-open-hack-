import { describe, expect, it } from 'vitest';
import { createDatabase } from '../src/server/db';
import { App } from '../src/server/app';
import { DomainError } from '../src/server/service';
import { CODE_LENGTH, base32, hashCode, newCode, normalizeCode } from '../src/server/physical';

const make = () => new App(createDatabase(':memory:'), () => Date.now(), true);
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof DomainError ? e.code : String(e);
  }
  return 'OK';
};

describe('physical figure codes', () => {
  it('are 128-bit base32 without padding and normalise from URLs and typing', () => {
    expect(base32(new Uint8Array(16))).toBe('A'.repeat(26));
    const c = newCode();
    expect(c).toMatch(/^[A-Z2-7]{26}$/);
    expect(CODE_LENGTH).toBe(26);
    expect(normalizeCode('https://loopbox.example/claim/' + c + '?utm=x')).toBe(c);
    expect(normalizeCode(c.toLowerCase().replace(/(.{5})/g, '$1 '))).toBe(c);
    expect(normalizeCode(c.slice(0, 20) + '-' + c.slice(20))).toBe(c);
    expect(normalizeCode('not a code')).toBeNull();
    expect(normalizeCode(c + 'A')).toBeNull();
    expect(normalizeCode(c.slice(0, 25) + '1')).toBeNull();
  });

  it('only admins generate; a batch spreads over every character with running serials', () => {
    const s = make();
    expect(code(() => s.generatePhysical('collector', 'naruto', 20, 'https://x.test'))).toBe(
      'FORBIDDEN',
    );
    expect(code(() => s.generatePhysical('admin', 'sanrio', 20, 'https://x.test'))).toBe(
      'NOT_FOUND',
    );
    const batch = s.generatePhysical('admin', 'naruto', 20, 'https://x.test/');
    expect(batch).toHaveLength(20);
    const per = new Map<string, number[]>();
    for (const b of batch) per.set(b.character, [...(per.get(b.character) ?? []), b.serial_no]);
    expect([...per.keys()].sort()).toEqual(
      ['Itachi Uchiha', 'Naruto Uzumaki', 'Sakura Haruno', 'Sasuke Uchiha'].sort(),
    );
    for (const serials of per.values()) expect(serials).toEqual(serials.map((_, i) => i + 1));
    expect(batch[0].url).toBe('https://x.test/claim/' + batch[0].code);
    // A second batch continues the numbering.
    const more = s.generatePhysical('admin', 'naruto', 4, 'https://x.test');
    expect(more.find((b) => b.character === 'Itachi Uchiha')!.serial_no).toBe(
      per.get('Itachi Uchiha')!.length + 1,
    );
    // Only fingerprints are stored.
    const dump = JSON.stringify(s.all('SELECT * FROM physical_items'));
    expect(dump).not.toContain(batch[0].code);
    expect(dump).toContain(hashCode(batch[0].code));
  });

  it('claims once: yours, someone else’s and invalid codes each get a clear error', () => {
    const s = make();
    const [first] = s.generatePhysical('admin', 'edgerunners', 3, 'https://x.test');
    expect(code(() => s.claimPhysical('collector', 'hello'))).toBe('INVALID_CODE');
    expect(code(() => s.claimPhysical('collector', newCode()))).toBe('INVALID_CODE');
    const r = s.claimPhysical('collector', first.url);
    expect(r.character.name).toBe(first.character);
    expect(r.figure).toMatchObject({
      serial_no: first.serial_no,
      cap: 60,
      theme_slug: 'edgerunners',
    });
    expect(code(() => s.claimPhysical('collector', first.code))).toBe('ALREADY_YOURS');
    expect(code(() => s.claimPhysical('demo-0', first.code))).toBe('ALREADY_CLAIMED');
    const snap = s.snapshot(s.user('collector'));
    expect(snap.physical.map((p) => p.id)).toEqual([r.figure.id]);
    expect(snap.characters.some((c) => c.id === r.character.id)).toBe(true);
    expect(s.snapshot(s.user('demo-0')).physical).toEqual([]);
    const audit = JSON.stringify(s.all("SELECT * FROM audit_log WHERE action LIKE 'physical.%'"));
    expect(audit).not.toContain(first.code);
  });
});
