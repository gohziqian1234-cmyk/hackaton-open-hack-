// Seeded partner-portal demo data (AGENTS.md section 19). Shared by seed() and migration 7.
import type { DatabaseSync } from 'node:sqlite';

export const KOPI_CHARACTERS = [
  { name: 'Kopi O', rarity: 'COMMON', units: 12, color: '#C98A5A', description: 'Black, strong, and up before everyone.' },
  { name: 'Teh Tarik', rarity: 'COMMON', units: 12, color: '#E8B77A', description: 'Pulled high, poured with flair.' },
  { name: 'Milo Dinosaur', rarity: 'COMMON', units: 12, color: '#8FE08A', description: 'Buried under a mountain of powder.' },
  { name: 'Kaya Toast', rarity: 'RARE', units: 3, color: '#FFD84D', description: 'Golden, crisp, never on time.' },
  { name: 'Durian Duke', rarity: 'SECRET', units: 1, color: '#C8A8FF', description: 'Rumoured. Smelled before seen.' },
] as const;

/** Inserts Kopi Kaki Collective (draft campaign) and the Hawker Heroes application if missing. */
export function seedPartnerDemo(db: DatabaseSync, now: number) {
  const user = db.prepare('INSERT OR IGNORE INTO users (id,name,role,created_at) VALUES (?,?,?,?)');
  user.run('kopi', 'Kopi Kaki Collective', 'BUSINESS', now);
  user.run('hawker', 'Hawker Heroes', 'COLLECTOR', now);
  db.prepare(
    'INSERT OR IGNORE INTO partners (id,name,type,owner_user_id,created_at) VALUES (?,?,?,?,?)',
  ).run('kopi-kaki', 'Kopi Kaki Collective', 'COLLECTIVE', 'kopi', now);
  db.prepare(
    'INSERT OR IGNORE INTO partner_members (partner_id,user_id,role,created_at) VALUES (?,?,?,?)',
  ).run('kopi-kaki', 'kopi', 'OWNER', now);
  if (!db.prepare("SELECT 1 FROM campaigns WHERE id='kopi-kaki-s1'").get()) {
    db.prepare(
      'INSERT INTO campaigns (id,partner_id,name,description,price,capacity,max_per_user,phase,starts_at,ends_at,trade_ends_at,game_mode,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'kopi-kaki-s1',
      'kopi-kaki',
      'Kopi Kaki',
      'Five coffee-shop regulars from a Toa Payoh kopitiam, drawn by six illustrators from the collective.',
      1600,
      40,
      2,
      'DRAFT',
      now + 86400000,
      now + 8 * 86400000,
      now + 11 * 86400000,
      'lore',
      now,
    );
    const c = db.prepare(
      'INSERT INTO characters (id,campaign_id,name,rarity,weight,units,color,description) VALUES (?,?,?,?,?,?,?,?)',
    );
    KOPI_CHARACTERS.forEach((ch, i) =>
      c.run(`kopi-kaki-s1-${i + 1}`, 'kopi-kaki-s1', ch.name, ch.rarity, 1, ch.units, ch.color, ch.description),
    );
  }
  db.prepare(
    `INSERT OR IGNORE INTO partner_applications (id,user_id,type,org_name,contact_email,website,proof_url,proposed_series,ip_statement,status,created_at)
     VALUES ('app-hawker','hawker','BRAND','Hawker Heroes','hello@hawkerheroes.example','https://hawkerheroes.example','https://hawkerheroes.example/licence','Eight hawker-centre legends as vinyl figures: satay uncle, chicken rice auntie and friends.','We own the Hawker Heroes trademark and all character artwork. Registration documents are linked above.','SUBMITTED',?)`,
  ).run(now);
}
