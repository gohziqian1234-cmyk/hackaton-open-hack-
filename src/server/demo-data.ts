// Seeded partner-portal demo data (AGENTS.md section 19). Shared by seed() and migration 7.
import type { DatabaseSync } from 'node:sqlite';
import { platformFee } from '../domain/fee';

export const KOPI_CHARACTERS = [
  {
    name: 'Kopi O',
    rarity: 'COMMON',
    units: 12,
    color: '#C98A5A',
    description: 'Black, strong, and up before everyone.',
  },
  {
    name: 'Teh Tarik',
    rarity: 'COMMON',
    units: 12,
    color: '#E8B77A',
    description: 'Pulled high, poured with flair.',
  },
  {
    name: 'Milo Dinosaur',
    rarity: 'COMMON',
    units: 12,
    color: '#8FE08A',
    description: 'Buried under a mountain of powder.',
  },
  {
    name: 'Kaya Toast',
    rarity: 'RARE',
    units: 3,
    color: '#FFD84D',
    description: 'Golden, crisp, never on time.',
  },
  {
    name: 'Durian Duke',
    rarity: 'SECRET',
    units: 1,
    color: '#C8A8FF',
    description: 'Rumoured. Smelled before seen.',
  },
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
      c.run(
        `kopi-kaki-s1-${i + 1}`,
        'kopi-kaki-s1',
        ch.name,
        ch.rarity,
        1,
        ch.units,
        ch.color,
        ch.description,
      ),
    );
  }
  db.prepare(
    `INSERT OR IGNORE INTO partner_applications (id,user_id,type,org_name,contact_email,website,proof_url,proposed_series,ip_statement,status,created_at)
     VALUES ('app-hawker','hawker','BRAND','Hawker Heroes','hello@hawkerheroes.example','https://hawkerheroes.example','https://hawkerheroes.example/licence','Eight hawker-centre legends as vinyl figures: satay uncle, chicken rice auntie and friends.','We own the Hawker Heroes trademark and all character artwork. Registration documents are linked above.','SUBMITTED',?)`,
  ).run(now);
}

type SeedListing = {
  id: string;
  seller: string;
  title: string;
  theme: string;
  description: string;
  price: number;
  fulfilment: 'SHIP' | 'MEETUP' | 'BOTH';
  characters: [string, 'COMMON' | 'RARE' | 'SECRET', string, number, number][];
};
/** name, rarity, colour, declared, remaining */
const LISTINGS: SeedListing[] = [
  {
    id: 'lst-mei',
    seller: 'mei',
    title: 'Tropical Treats',
    theme: 'Food',
    description: 'Hand-painted resin dessert friends. Each box holds one figure, about 6 cm tall.',
    price: 1200,
    fulfilment: 'BOTH',
    characters: [
      ['Mango Mochi', 'COMMON', '#FFB36B', 12, 11],
      ['Pandan Puff', 'COMMON', '#8FE08A', 10, 9],
      ['Durian Duke', 'RARE', '#E8D46A', 3, 3],
      ['Chendol Queen', 'SECRET', '#62E3C8', 1, 1],
    ],
  },
  {
    id: 'lst-jun',
    seller: 'jun',
    title: 'Night Market Cats',
    theme: 'Animals',
    description: 'Glow-in-the-dark cats from the pasar malam. Shipped in padded mailers.',
    price: 1500,
    fulfilment: 'SHIP',
    characters: [
      ['Satay Cat', 'COMMON', '#FF7F66', 8, 8],
      ['Bubble Tea Cat', 'COMMON', '#C8A8FF', 8, 8],
      ['Lantern Cat', 'RARE', '#FFD84D', 2, 2],
    ],
  },
  {
    id: 'lst-priya',
    seller: 'priya',
    title: 'Garden City Sprouts',
    theme: 'Plants',
    description: 'Tiny ceramic sprouts inspired by the Botanic Gardens. Only one rare left.',
    price: 900,
    fulfilment: 'MEETUP',
    characters: [
      ['Orchid Sprout', 'COMMON', '#FF6FB5', 6, 4],
      ['Fern Sprout', 'COMMON', '#62E3C8', 6, 5],
      ['Rain Tree', 'RARE', '#8FE08A', 2, 1],
    ],
  },
];

/** Verified sellers Mei, Jun and Priya, three live listings, and Alex's paid order from Mei. */
export function seedMarketDemo(db: DatabaseSync, now: number) {
  const user = db.prepare(
    "INSERT OR IGNORE INTO users (id,name,role,created_at,email,email_verified_at,phone,phone_verified_at,trust_score) VALUES (?,?,'COLLECTOR',?,?,?,?,?,?)",
  );
  user.run('mei', 'Mei', now, 'mei@loopbox.example', now, '+6590000011', now, 96);
  user.run('jun', 'Jun', now, 'jun@loopbox.example', now, '+6590000012', now, 88);
  user.run('priya', 'Priya', now, 'priya@loopbox.example', now, '+6590000013', now, 100);
  db.prepare(
    "UPDATE users SET email=COALESCE(email,'alex@loopbox.example'),email_verified_at=COALESCE(email_verified_at,?),phone=COALESCE(phone,'+6590000010'),phone_verified_at=COALESCE(phone_verified_at,?) WHERE id='collector'",
  ).run(now, now);
  if (db.prepare("SELECT 1 FROM listings WHERE id='lst-mei'").get()) return;
  const listing = db.prepare(
    "INSERT INTO listings (id,seller_id,title,theme,description,price_cents,fulfilment,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'ACTIVE',?,?)",
  );
  const character = db.prepare(
    'INSERT INTO listing_characters (id,listing_id,position,name,rarity,color,declared,remaining) VALUES (?,?,?,?,?,?,?,?)',
  );
  LISTINGS.forEach((l, i) => {
    listing.run(
      l.id,
      l.seller,
      l.title,
      l.theme,
      l.description,
      l.price,
      l.fulfilment,
      now - (3 - i) * 3600000,
      now,
    );
    l.characters.forEach(([name, rarity, color, declared, remaining], k) =>
      character.run(`${l.id}-${k + 1}`, l.id, k + 1, name, rarity, color, declared, remaining),
    );
  });
  // Alex already bought 2 boxes from Mei (simulated payment): Mango Mochi and Pandan Puff.
  const subtotal = 2400,
    fee = platformFee(subtotal);
  db.prepare(
    "INSERT INTO market_orders (id,listing_id,buyer_id,seller_id,quantity,subtotal_cents,fee_cents,seller_owed_cents,status,payout_status,created_at,paid_at) VALUES ('mko-seed','lst-mei','collector','mei',2,?,?,?,'PAID_HELD','HELD',?,?)",
  ).run(subtotal, fee, subtotal - fee, now - 7200000, now - 7100000);
  const snapshot1 = JSON.stringify([
    ['lst-mei-1', 12],
    ['lst-mei-2', 10],
    ['lst-mei-3', 3],
    ['lst-mei-4', 1],
  ]);
  const snapshot2 = JSON.stringify([
    ['lst-mei-1', 11],
    ['lst-mei-2', 10],
    ['lst-mei-3', 3],
    ['lst-mei-4', 1],
  ]);
  const draw = db.prepare(
    "INSERT INTO c2c_draws (id,market_order_id,box_index,listing_character_id,random_value,total,stock_snapshot,created_at) VALUES (?,'mko-seed',?,?,?,?,?,?)",
  );
  draw.run('draw-seed-1', 1, 'lst-mei-1', 4, 26, snapshot1, now - 7200000);
  draw.run('draw-seed-2', 2, 'lst-mei-2', 17, 25, snapshot2, now - 7200000);
  db.prepare(
    "INSERT INTO payments (id,kind,ref_id,user_id,amount_cents,status,expires_at,paid_at,created_at,updated_at) VALUES ('pay-mko-seed','C2C','mko-seed','collector',?,'SIMULATED',?,?,?,?)",
  ).run(subtotal, now, now - 7100000, now - 7200000, now - 7100000);
  db.prepare(
    "INSERT INTO chat_threads (id,market_order_id,buyer_id,seller_id,created_at) VALUES ('thread-seed','mko-seed','collector','mei',?)",
  ).run(now - 7100000);
  const message = db.prepare(
    "INSERT INTO chat_messages (id,thread_id,sender_id,body,created_at) VALUES (?,'thread-seed',?,?,?)",
  );
  message.run(
    'msg-seed-1',
    'mei',
    'Hi Alex, thanks for buying! I can meet at Toa Payoh MRT on Saturday.',
    now - 7000000,
  );
  message.run('msg-seed-2', 'collector', 'Saturday works. Around 2pm?', now - 6900000);
  message.run('msg-seed-3', 'mei', 'Great, see you at 2pm at exit B.', now - 6800000);
}
