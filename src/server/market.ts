// C2C creator marketplace (AGENTS.md sections 9 and 13). Every method checks who is asking.
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DomainError } from './errors';
import { Partners } from './partners';
import type { PaymentEvent } from './service';
import { createCheckoutSession, maxChargeCents, paymentMode, refundPaymentIntent } from './stripe';
import { split } from '../domain/fee';
import { drawOne } from '../domain/draw';
import { SUSPEND_BELOW, trustScore } from '../domain/trust';
import type { ListingInput } from './validation';

const OTP_TTL_MS = 10 * 60000,
  OTP_MAX_TRIES = 5,
  OTP_PER_10_MIN = 5,
  RECEIPT_WINDOW_MS = 7 * 86400000,
  CHAT_LIMIT = 30,
  CHAT_WINDOW_MS = 10 * 60000,
  UPLOADS_PER_HOUR = 30,
  MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const SESSION_MINUTES = 31;

export type MarketOrderRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  quantity: number;
  subtotal_cents: number;
  fee_cents: number;
  seller_owed_cents: number;
  status: string;
  payout_status: string;
  fulfilment_note: string | null;
  created_at: number;
  paid_at: number | null;
  fulfilled_at: number | null;
  completed_at: number | null;
};

/** Recognises PNG, JPEG and WebP by their first bytes. The file name and declared type are ignored. */
export function sniffImage(bytes: Uint8Array) {
  const b = (i: number) => bytes[i];
  if (
    bytes.length >= 8 &&
    b(0) === 0x89 &&
    b(1) === 0x50 &&
    b(2) === 0x4e &&
    b(3) === 0x47 &&
    b(4) === 0x0d &&
    b(5) === 0x0a &&
    b(6) === 0x1a &&
    b(7) === 0x0a
  )
    return { mime: 'image/png', ext: 'png' } as const;
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' } as const;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp' } as const;
  return null;
}

export function uploadsDir() {
  const db = process.env.LOOPBOX_DB || 'data/loopbox.sqlite';
  return db === ':memory:' ? resolve('data/uploads') : join(dirname(resolve(db)), 'uploads');
}

export class Market extends Partners {
  /** Randomness for the draw; tests may inject a deterministic source. */
  random: (total: number) => number = (total) => randomInt(total);

  // ---------- 8a. Verification (simulated OTP) ----------
  isVerified(userId: string) {
    const u = this.one<{ email_verified_at: number | null; phone_verified_at: number | null }>(
      'SELECT email_verified_at,phone_verified_at FROM users WHERE id=?',
      userId,
    );
    return !!(u?.email_verified_at && u.phone_verified_at);
  }
  verificationStatus(userId: string) {
    return this.one<{
      email: string | null;
      email_verified: number;
      phone: string | null;
      phone_verified: number;
    }>(
      'SELECT email,email_verified_at IS NOT NULL AS email_verified,phone,phone_verified_at IS NOT NULL AS phone_verified FROM users WHERE id=?',
      userId,
    )!;
  }
  private otpHash(id: string, code: string) {
    return createHash('sha256')
      .update(id + ':' + code)
      .digest('hex');
  }
  /** Stores only a hash of the code. In DEMO_MODE the code is returned so it can be shown on screen. */
  sendOtp(userId: string, channel: 'EMAIL' | 'PHONE', target: string) {
    this.user(userId);
    return this.transaction(() => {
      const recent = this.one<{ n: number }>(
        'SELECT COUNT(*) AS n FROM otp_codes WHERE user_id=? AND created_at>?',
        userId,
        this.now() - OTP_TTL_MS,
      )!.n;
      if (recent >= OTP_PER_10_MIN) throw new DomainError('RATE_LIMITED', 429);
      if (
        channel === 'EMAIL' &&
        this.one('SELECT 1 FROM users WHERE email=? AND id<>?', target, userId)
      )
        throw new DomainError('EMAIL_TAKEN', 409);
      const id = randomUUID(),
        code = String(randomInt(0, 1000000)).padStart(6, '0');
      this.run(
        'INSERT INTO otp_codes (id,user_id,channel,target,code_hash,expires_at,created_at) VALUES (?,?,?,?,?,?,?)',
        id,
        userId,
        channel,
        target,
        this.otpHash(id, code),
        this.now() + OTP_TTL_MS,
        this.now(),
      );
      return this.demo ? { sent: true, demoCode: code } : { sent: true };
    });
  }
  verifyOtp(userId: string, channel: 'EMAIL' | 'PHONE', code: string) {
    return this.transaction(() => {
      const otp = this.one<{
        id: string;
        target: string;
        attempts: number;
        expires_at: number;
        consumed_at: number | null;
      }>(
        'SELECT id,target,attempts,expires_at,consumed_at FROM otp_codes WHERE user_id=? AND channel=? ORDER BY created_at DESC,rowid DESC LIMIT 1',
        userId,
        channel,
      );
      if (!otp || otp.consumed_at) throw new DomainError('OTP_NOT_FOUND', 404);
      if (otp.attempts >= OTP_MAX_TRIES) throw new DomainError('OTP_LOCKED', 429);
      if (otp.expires_at <= this.now()) throw new DomainError('OTP_EXPIRED', 410);
      const expected = this.one<{ code_hash: string }>(
        'SELECT code_hash FROM otp_codes WHERE id=?',
        otp.id,
      )!;
      if (this.otpHash(otp.id, code) !== expected.code_hash) {
        this.run('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?', otp.id);
        return { verified: false, triesLeft: OTP_MAX_TRIES - otp.attempts - 1 };
      }
      this.run('UPDATE otp_codes SET consumed_at=? WHERE id=?', this.now(), otp.id);
      if (channel === 'EMAIL') {
        if (this.one('SELECT 1 FROM users WHERE email=? AND id<>?', otp.target, userId))
          throw new DomainError('EMAIL_TAKEN', 409);
        this.run(
          'UPDATE users SET email=?,email_verified_at=? WHERE id=?',
          otp.target,
          this.now(),
          userId,
        );
      } else
        this.run(
          'UPDATE users SET phone=?,phone_verified_at=? WHERE id=?',
          otp.target,
          this.now(),
          userId,
        );
      this.audit(userId, 'user.verified', 'user', userId, { channel });
      return { verified: true };
    });
  }

  // ---------- 8b. Listings and uploads ----------
  private seller(userId: string) {
    const u = this.user(userId);
    if (u.role !== 'COLLECTOR') throw new DomainError('FORBIDDEN', 403);
    if (!this.isVerified(userId)) throw new DomainError('VERIFICATION_REQUIRED', 403);
    return u;
  }
  /** Saves image bytes after checking their magic bytes. Returns an id to attach to a listing. */
  saveUpload(userId: string, bytes: Uint8Array) {
    this.seller(userId);
    if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES)
      throw new DomainError('REQUEST_TOO_LARGE', 413);
    const kind = sniffImage(bytes);
    if (!kind) throw new DomainError('UNSUPPORTED_IMAGE', 415);
    const recent = this.one<{ n: number }>(
      'SELECT COUNT(*) AS n FROM listing_photos WHERE uploader_id=? AND created_at>?',
      userId,
      this.now() - 3600000,
    )!.n;
    if (recent >= UPLOADS_PER_HOUR) throw new DomainError('RATE_LIMITED', 429);
    const id = randomUUID();
    const dir = uploadsDir();
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${id}.${kind.ext}`);
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o640 });
    this.run(
      'INSERT INTO listing_photos (id,uploader_id,path,mime,bytes,created_at) VALUES (?,?,?,?,?,?)',
      id,
      userId,
      path,
      kind.mime,
      bytes.length,
      this.now(),
    );
    return { photoId: id };
  }
  /** Public only when attached to a visible listing; owners always see their own uploads. */
  photo(photoId: string, userId?: string) {
    const p = this.one<{
      path: string;
      mime: string;
      uploader_id: string;
      listing_id: string | null;
      status: string | null;
    }>(
      'SELECT p.path,p.mime,p.uploader_id,p.listing_id,l.status FROM listing_photos p LEFT JOIN listings l ON l.id=p.listing_id WHERE p.id=?',
      photoId,
    );
    if (!p) throw new DomainError('NOT_FOUND', 404);
    const visible = p.status === 'ACTIVE' || p.status === 'SOLD_OUT' || p.uploader_id === userId;
    if (!visible) throw new DomainError('NOT_FOUND', 404);
    return p;
  }
  saveListing(userId: string, input: ListingInput) {
    this.seller(userId);
    const total = input.characters.reduce((n, c) => n + c.declared, 0);
    if (total < 1) throw new DomainError('VALIDATION_FAILED', 422);
    return this.transaction(() => {
      let id = input.listingId;
      if (id) {
        const l = this.one<{ seller_id: string; status: string }>(
          'SELECT seller_id,status FROM listings WHERE id=?',
          id,
        );
        if (!l || l.seller_id !== userId) throw new DomainError('FORBIDDEN', 403);
        if (l.status !== 'DRAFT') throw new DomainError('LOCKED_AFTER_LIVE');
        this.run(
          'UPDATE listings SET title=?,theme=?,description=?,price_cents=?,fulfilment=?,updated_at=? WHERE id=?',
          input.title,
          input.theme,
          input.description,
          input.price,
          input.fulfilment,
          this.now(),
          id,
        );
        this.run('DELETE FROM listing_characters WHERE listing_id=?', id);
        this.run('UPDATE listing_photos SET listing_id=NULL WHERE listing_id=?', id);
      } else {
        id = 'lst-' + randomUUID().slice(0, 12);
        this.run(
          "INSERT INTO listings (id,seller_id,title,theme,description,price_cents,fulfilment,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'DRAFT',?,?)",
          id,
          userId,
          input.title,
          input.theme,
          input.description,
          input.price,
          input.fulfilment,
          this.now(),
          this.now(),
        );
      }
      input.characters.forEach((c, i) =>
        this.run(
          'INSERT INTO listing_characters (id,listing_id,position,name,rarity,color,declared,remaining) VALUES (?,?,?,?,?,?,?,?)',
          `${id}-${i + 1}`,
          id,
          i + 1,
          c.name,
          c.rarity,
          c.color,
          c.declared,
          c.declared,
        ),
      );
      for (const photoId of input.photoIds) {
        const changed = this.run(
          'UPDATE listing_photos SET listing_id=? WHERE id=? AND uploader_id=? AND listing_id IS NULL',
          id,
          photoId,
          userId,
        );
        if (Number(changed.changes) !== 1) throw new DomainError('FORBIDDEN', 403);
      }
      this.audit(userId, 'listing.saved', 'listing', id!, { characters: input.characters.length });
      return { listingId: id! };
    });
  }
  publishListing(userId: string, listingId: string) {
    this.seller(userId);
    return this.transaction(() => {
      const l = this.one<{ seller_id: string; status: string }>(
        'SELECT seller_id,status FROM listings WHERE id=?',
        listingId,
      );
      if (!l || l.seller_id !== userId) throw new DomainError('FORBIDDEN', 403);
      if (l.status === 'SUSPENDED') throw new DomainError('SUSPENDED', 403);
      if (l.status !== 'DRAFT' && l.status !== 'PAUSED') throw new DomainError('INVALID_STATE');
      const photos = this.one<{ n: number }>(
        'SELECT COUNT(*) AS n FROM listing_photos WHERE listing_id=?',
        listingId,
      )!.n;
      const chars = this.one<{ n: number; left: number }>(
        'SELECT COUNT(*) AS n,COALESCE(SUM(remaining),0) AS left FROM listing_characters WHERE listing_id=?',
        listingId,
      )!;
      if (photos < 1 || chars.n < 2 || chars.n > 12)
        throw new DomainError('VALIDATION_FAILED', 422);
      this.run(
        'UPDATE listings SET status=?,updated_at=? WHERE id=?',
        chars.left > 0 ? 'ACTIVE' : 'SOLD_OUT',
        this.now(),
        listingId,
      );
      this.audit(userId, 'listing.published', 'listing', listingId, {});
      return { status: 'ACTIVE' };
    });
  }
  pauseListing(userId: string, listingId: string) {
    this.seller(userId);
    return this.transaction(() => {
      const l = this.one<{ seller_id: string; status: string }>(
        'SELECT seller_id,status FROM listings WHERE id=?',
        listingId,
      );
      if (!l || l.seller_id !== userId) throw new DomainError('FORBIDDEN', 403);
      if (l.status !== 'ACTIVE') throw new DomainError('INVALID_STATE');
      this.run(
        "UPDATE listings SET status='PAUSED',updated_at=? WHERE id=?",
        this.now(),
        listingId,
      );
      this.audit(userId, 'listing.paused', 'listing', listingId, {});
      return { status: 'PAUSED' };
    });
  }

  // ---------- 8c. Browse ----------
  marketListings(
    filters: { q?: string; theme?: string; min?: number; max?: number; rarity?: string } = {},
  ) {
    this.sweepMarketExpired();
    const where = ["l.status IN ('ACTIVE','SOLD_OUT')"],
      args: (string | number)[] = [];
    if (filters.q) {
      where.push("l.title LIKE ? ESCAPE '\\'");
      args.push('%' + filters.q.replace(/[\\%_]/g, (m) => '\\' + m) + '%');
    }
    if (filters.theme) {
      where.push('l.theme=?');
      args.push(filters.theme);
    }
    if (filters.min !== undefined) {
      where.push('l.price_cents>=?');
      args.push(filters.min);
    }
    if (filters.max !== undefined) {
      where.push('l.price_cents<=?');
      args.push(filters.max);
    }
    if (filters.rarity) {
      where.push(
        'EXISTS(SELECT 1 FROM listing_characters c WHERE c.listing_id=l.id AND c.rarity=? AND c.remaining>0)',
      );
      args.push(filters.rarity);
    }
    const listings = this.all<{
      id: string;
      title: string;
      theme: string;
      price_cents: number;
      status: string;
      seller: string;
      trust: number;
      left: number;
      photo: string | null;
      colors: string;
    }>(
      `SELECT l.id,l.title,l.theme,l.price_cents,l.status,u.name AS seller,u.trust_score AS trust,
        (SELECT COALESCE(SUM(remaining),0) FROM listing_characters WHERE listing_id=l.id) AS left,
        (SELECT id FROM listing_photos WHERE listing_id=l.id ORDER BY created_at LIMIT 1) AS photo,
        (SELECT group_concat(color) FROM (SELECT color FROM listing_characters WHERE listing_id=l.id ORDER BY position)) AS colors
       FROM listings l JOIN users u ON u.id=l.seller_id WHERE ${where.join(' AND ')}
       ORDER BY l.status='SOLD_OUT',l.created_at DESC LIMIT 60`,
      ...args,
    );
    const themes = this.all<{ theme: string }>(
      "SELECT DISTINCT theme FROM listings WHERE status IN ('ACTIVE','SOLD_OUT') ORDER BY theme",
    ).map((t) => t.theme);
    return { listings, themes };
  }
  listingDetail(listingId: string, userId?: string) {
    this.sweepMarketExpired();
    const l = this.one<{
      id: string;
      seller_id: string;
      title: string;
      theme: string;
      description: string;
      price_cents: number;
      fulfilment: string;
      status: string;
      seller: string;
      trust: number;
    }>(
      'SELECT l.*,u.name AS seller,u.trust_score AS trust FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.id=?',
      listingId,
    );
    const admin = userId ? this.user(userId).role === 'ADMIN' : false;
    if (!l || (!['ACTIVE', 'SOLD_OUT'].includes(l.status) && l.seller_id !== userId && !admin))
      throw new DomainError('NOT_FOUND', 404);
    return {
      listing: { ...l, seller_id: undefined, isMine: l.seller_id === userId },
      characters: this.all<{
        id: string;
        name: string;
        rarity: string;
        color: string;
        declared: number;
        remaining: number;
      }>(
        'SELECT id,name,rarity,color,declared,remaining FROM listing_characters WHERE listing_id=? ORDER BY position',
        listingId,
      ),
      photos: this.all<{ id: string }>(
        'SELECT id FROM listing_photos WHERE listing_id=? ORDER BY created_at',
        listingId,
      ).map((p) => p.id),
    };
  }

  // ---------- 8d. Checkout and draw ----------
  /** Draws every box inside one BEGIN IMMEDIATE transaction; stock is held until payment or expiry. */
  private reserveMarket(userId: string, listingId: string, quantity: number) {
    const u = this.user(userId);
    if (u.role !== 'COLLECTOR') throw new DomainError('FORBIDDEN', 403);
    const l = this.one<{ seller_id: string; status: string; price_cents: number; title: string }>(
      'SELECT seller_id,status,price_cents,title FROM listings WHERE id=?',
      listingId,
    );
    if (!l) throw new DomainError('NOT_FOUND', 404);
    if (l.seller_id === userId) throw new DomainError('CANNOT_BUY_OWN', 403);
    if (l.status === 'SOLD_OUT') throw new DomainError('SOLD_OUT');
    if (l.status !== 'ACTIVE') throw new DomainError('INVALID_STATE');
    const subtotal = l.price_cents * quantity;
    if (subtotal > maxChargeCents()) throw new DomainError('SPENDING_CAP', 422);
    const money = split(subtotal);
    const orderId = 'mko-' + randomUUID();
    this.run(
      "INSERT INTO market_orders (id,listing_id,buyer_id,seller_id,quantity,subtotal_cents,fee_cents,seller_owed_cents,status,payout_status,created_at) VALUES (?,?,?,?,?,?,?,?,'PENDING_PAYMENT','NONE',?)",
      orderId,
      listingId,
      userId,
      l.seller_id,
      quantity,
      money.subtotal,
      money.fee,
      money.sellerOwed,
      this.now(),
    );
    for (let box = 1; box <= quantity; box++) {
      const stock = this.all<{ id: string; remaining: number }>(
        'SELECT id,remaining FROM listing_characters WHERE listing_id=? ORDER BY position',
        listingId,
      );
      let pick;
      try {
        pick = drawOne(stock, this.random);
      } catch {
        throw new DomainError('SOLD_OUT');
      }
      this.run(
        'UPDATE listing_characters SET remaining=remaining-1 WHERE id=? AND remaining>0',
        pick.id,
      );
      this.run(
        'INSERT INTO c2c_draws (id,market_order_id,box_index,listing_character_id,random_value,total,stock_snapshot,created_at) VALUES (?,?,?,?,?,?,?,?)',
        randomUUID(),
        orderId,
        box,
        pick.id,
        pick.random,
        pick.total,
        JSON.stringify(stock.map((s) => [s.id, s.remaining])),
        this.now(),
      );
    }
    const left = this.one<{ n: number }>(
      'SELECT COALESCE(SUM(remaining),0) AS n FROM listing_characters WHERE listing_id=?',
      listingId,
    )!.n;
    if (left === 0)
      this.run(
        "UPDATE listings SET status='SOLD_OUT',updated_at=? WHERE id=?",
        this.now(),
        listingId,
      );
    this.run(
      "INSERT INTO payments (id,kind,ref_id,user_id,amount_cents,status,expires_at,created_at,updated_at) VALUES (?,'C2C',?,?,?,'OPEN',?,?,?)",
      randomUUID(),
      orderId,
      userId,
      subtotal,
      this.now() + SESSION_MINUTES * 60000,
      this.now(),
      this.now(),
    );
    this.audit(userId, 'market_order.created', 'market_order', orderId, {
      listing: listingId,
      quantity,
      subtotal,
    });
    return { orderId, title: l.title, unit: l.price_cents };
  }
  async buyListing(
    userId: string,
    listingId: string,
    quantity: number,
    ageConfirmed: boolean,
    createSession: typeof createCheckoutSession = createCheckoutSession,
  ): Promise<{ url: string; orderId: string } | { simulated: true; orderId: string }> {
    if (ageConfirmed !== true) throw new DomainError('AGE_CONFIRMATION_REQUIRED', 400);
    const mode = paymentMode(this.demo);
    if (mode === 'unavailable') throw new DomainError('PAYMENTS_NOT_CONFIGURED', 503);
    this.sweepMarketExpired();
    const r = this.transaction(() => {
      this.run('UPDATE users SET age_confirmed_at=? WHERE id=?', this.now(), userId);
      return this.reserveMarket(userId, listingId, quantity);
    });
    if (mode === 'simulated') return { simulated: true, orderId: r.orderId };
    try {
      const session = await createSession({
        kind: 'C2C',
        orderId: r.orderId,
        userId,
        refKey: 'listing_id',
        refId: listingId,
        name: r.title + ' mystery box',
        unitAmountCents: r.unit,
        quantity,
        successPath: `/orders/${r.orderId}?`,
        cancelPath: `/market/${listingId}?cancelled=1`,
      });
      this.run(
        "UPDATE payments SET stripe_session_id=?,expires_at=?,updated_at=? WHERE kind='C2C' AND ref_id=?",
        session.id,
        session.expiresAt,
        this.now(),
        r.orderId,
      );
      return { url: session.url, orderId: r.orderId };
    } catch (e) {
      this.transaction(() => this.releaseMarket(r.orderId, 'session_failed'));
      throw e instanceof DomainError ? e : new DomainError('PAYMENT_UNAVAILABLE', 502);
    }
  }
  /** Unpaid order expired: stock goes back in the same transaction; the draws stay logged. */
  private releaseMarket(orderId: string, reason: string) {
    const o = this.one<MarketOrderRow>('SELECT * FROM market_orders WHERE id=?', orderId);
    if (!o || o.status !== 'PENDING_PAYMENT') return false;
    this.run("UPDATE market_orders SET status='EXPIRED',payout_status='VOID' WHERE id=?", orderId);
    for (const d of this.all<{ listing_character_id: string }>(
      'SELECT listing_character_id FROM c2c_draws WHERE market_order_id=?',
      orderId,
    ))
      this.run(
        'UPDATE listing_characters SET remaining=remaining+1 WHERE id=?',
        d.listing_character_id,
      );
    this.run(
      "UPDATE listings SET status='ACTIVE',updated_at=? WHERE id=? AND status='SOLD_OUT'",
      this.now(),
      o.listing_id,
    );
    this.run(
      "UPDATE payments SET status='EXPIRED',updated_at=? WHERE kind='C2C' AND ref_id=? AND status='OPEN'",
      this.now(),
      orderId,
    );
    this.audit(o.buyer_id, 'market_order.expired', 'market_order', orderId, { reason });
    return true;
  }
  /** Called by the shared webhook handler for metadata.kind = C2C, inside its transaction. */
  protected settleMarket(event: PaymentEvent, orderId: string, simulated: boolean) {
    const o = this.one<MarketOrderRow>('SELECT * FROM market_orders WHERE id=?', orderId);
    if (!o) return { outcome: 'ignored' };
    if (event.type === 'checkout.session.expired')
      return { outcome: this.releaseMarket(orderId, 'session_expired') ? 'expired' : 'ignored' };
    if (event.type !== 'checkout.session.completed' || event.session.payment_status !== 'paid')
      return { outcome: 'ignored' };
    if (o.status !== 'PENDING_PAYMENT') {
      if (o.status === 'EXPIRED') {
        // Paid after the held stock was returned: refund rather than oversell.
        this.run(
          "UPDATE market_orders SET status='REFUNDED',payout_status='VOID' WHERE id=?",
          orderId,
        );
        this.run(
          "UPDATE payments SET status='REFUNDED',payment_intent=?,updated_at=? WHERE kind='C2C' AND ref_id=?",
          event.session.payment_intent ?? null,
          this.now(),
          orderId,
        );
        this.audit(null, 'market_order.refunded', 'market_order', orderId, {
          reason: 'late_payment',
        });
        return { outcome: 'refund', paymentIntent: event.session.payment_intent ?? null };
      }
      return { outcome: 'ignored' };
    }
    this.run(
      "UPDATE market_orders SET status='PAID_HELD',payout_status='HELD',paid_at=? WHERE id=?",
      this.now(),
      orderId,
    );
    this.run(
      "UPDATE payments SET status=?,payment_intent=?,stripe_session_id=COALESCE(stripe_session_id,?),paid_at=?,updated_at=? WHERE kind='C2C' AND ref_id=?",
      simulated ? 'SIMULATED' : 'PAID',
      event.session.payment_intent ?? null,
      event.session.id,
      this.now(),
      this.now(),
      orderId,
    );
    this.run(
      'INSERT OR IGNORE INTO chat_threads (id,market_order_id,buyer_id,seller_id,created_at) VALUES (?,?,?,?,?)',
      randomUUID(),
      orderId,
      o.buyer_id,
      o.seller_id,
      this.now(),
    );
    this.audit(o.buyer_id, 'market_order.paid', 'market_order', orderId, {
      simulated,
      fee: o.fee_cents,
    });
    return { outcome: 'paid' };
  }
  /** Lazy expiry for unpaid marketplace orders. */
  sweepMarketExpired() {
    const due = this.all<{ id: string }>(
      "SELECT o.id FROM market_orders o JOIN payments p ON p.kind='C2C' AND p.ref_id=o.id WHERE o.status='PENDING_PAYMENT' AND p.expires_at<=?",
      this.now(),
    );
    if (!due.length) return 0;
    this.transaction(() => due.forEach((o) => this.releaseMarket(o.id, 'session_expired')));
    return due.length;
  }
  /** Admin sweep: expire unpaid orders, and auto-complete fulfilled orders after 7 days. */
  protected sweepMore() {
    const expired = this.sweepMarketExpired();
    const stale = this.all<{ id: string; seller_id: string }>(
      "SELECT id,seller_id FROM market_orders WHERE status='FULFILLED' AND fulfilled_at<=?",
      this.now() - RECEIPT_WINDOW_MS,
    );
    this.transaction(() => {
      for (const o of stale) {
        this.run(
          "UPDATE market_orders SET status='COMPLETED',payout_status='OWED',completed_at=? WHERE id=?",
          this.now(),
          o.id,
        );
        this.audit(null, 'market_order.auto_completed', 'market_order', o.id, {});
        this.recomputeTrust(o.seller_id);
      }
    });
    return { marketExpired: expired, autoCompleted: stale.length };
  }

  // ---------- 8e. Orders, fulfilment, receipt, reports ----------
  private marketOrder(orderId: string) {
    const o = this.one<MarketOrderRow>('SELECT * FROM market_orders WHERE id=?', orderId);
    if (!o) throw new DomainError('NOT_FOUND', 404);
    return o;
  }
  /** Buyer or seller only. Draws are hidden until payment; the seller's pick list appears after payment. */
  orderView(userId: string, orderId: string) {
    this.sweepMarketExpired();
    const o = this.marketOrder(orderId);
    const admin = this.user(userId).role === 'ADMIN';
    if (o.buyer_id !== userId && o.seller_id !== userId && !admin)
      throw new DomainError('NOT_FOUND', 404);
    const paid = !['PENDING_PAYMENT', 'EXPIRED'].includes(o.status);
    const draws = paid
      ? this.all<{ box_index: number; id: string; name: string; rarity: string; color: string }>(
          'SELECT d.box_index,c.id,c.name,c.rarity,c.color FROM c2c_draws d JOIN listing_characters c ON c.id=d.listing_character_id WHERE d.market_order_id=? ORDER BY d.box_index',
          orderId,
        )
      : [];
    const pickList = Object.values(
      draws.reduce<Record<string, { name: string; count: number }>>((acc, d) => {
        acc[d.id] = { name: d.name, count: (acc[d.id]?.count ?? 0) + 1 };
        return acc;
      }, {}),
    );
    const listing = this.one<{ title: string; fulfilment: string }>(
      'SELECT title,fulfilment FROM listings WHERE id=?',
      o.listing_id,
    )!;
    const names = this.all<{ id: string; name: string }>(
      'SELECT id,name FROM users WHERE id IN (?,?)',
      o.buyer_id,
      o.seller_id,
    );
    const thread = this.one<{ id: string }>(
      'SELECT id FROM chat_threads WHERE market_order_id=?',
      orderId,
    );
    return {
      order: o,
      role: o.buyer_id === userId ? 'BUYER' : o.seller_id === userId ? 'SELLER' : 'ADMIN',
      listing,
      buyer: names.find((n) => n.id === o.buyer_id)?.name,
      seller: names.find((n) => n.id === o.seller_id)?.name,
      draws,
      pickList,
      threadId: thread?.id ?? null,
      report:
        this.one<{ reason: string; details: string | null; status: string }>(
          'SELECT reason,details,status FROM reports WHERE market_order_id=? ORDER BY created_at DESC LIMIT 1',
          orderId,
        ) ?? null,
    };
  }
  myMarketOrders(userId: string) {
    this.sweepMarketExpired();
    const select = `SELECT o.id,o.quantity,o.subtotal_cents,o.fee_cents,o.seller_owed_cents,o.status,o.payout_status,o.created_at,l.title,b.name AS buyer,s.name AS seller
      FROM market_orders o JOIN listings l ON l.id=o.listing_id JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id`;
    return {
      buying: this.all(`${select} WHERE o.buyer_id=? ORDER BY o.created_at DESC LIMIT 50`, userId),
      selling: this.all(
        `${select} WHERE o.seller_id=? AND o.status<>'PENDING_PAYMENT' ORDER BY o.created_at DESC LIMIT 50`,
        userId,
      ),
    };
  }
  fulfil(userId: string, orderId: string, note: string) {
    return this.transaction(() => {
      const o = this.marketOrder(orderId);
      if (o.seller_id !== userId) throw new DomainError('FORBIDDEN', 403);
      if (o.status !== 'PAID_HELD') throw new DomainError('INVALID_STATE');
      this.run(
        "UPDATE market_orders SET status='FULFILLED',fulfilment_note=?,fulfilled_at=? WHERE id=?",
        note || null,
        this.now(),
        orderId,
      );
      this.audit(userId, 'market_order.fulfilled', 'market_order', orderId, {});
      return { status: 'FULFILLED' };
    });
  }
  confirmReceipt(userId: string, orderId: string) {
    return this.transaction(() => {
      const o = this.marketOrder(orderId);
      if (o.buyer_id !== userId) throw new DomainError('FORBIDDEN', 403);
      if (o.status !== 'FULFILLED' && o.status !== 'PAID_HELD')
        throw new DomainError('INVALID_STATE');
      this.run(
        "UPDATE market_orders SET status='COMPLETED',payout_status='OWED',completed_at=? WHERE id=?",
        this.now(),
        orderId,
      );
      this.audit(userId, 'market_order.completed', 'market_order', orderId, {
        owed: o.seller_owed_cents,
      });
      this.recomputeTrust(o.seller_id);
      return { status: 'COMPLETED' };
    });
  }
  report(userId: string, orderId: string, reason: string, details: string) {
    return this.transaction(() => {
      const o = this.marketOrder(orderId);
      if (o.buyer_id !== userId) throw new DomainError('FORBIDDEN', 403);
      if (o.status !== 'PAID_HELD' && o.status !== 'FULFILLED')
        throw new DomainError('INVALID_STATE');
      const id = randomUUID();
      this.run(
        "INSERT INTO reports (id,market_order_id,reporter_id,reason,details,status,created_at) VALUES (?,?,?,?,?,'OPEN',?)",
        id,
        orderId,
        userId,
        reason,
        details || null,
        this.now(),
      );
      this.run("UPDATE market_orders SET status='REPORTED' WHERE id=?", orderId);
      this.audit(userId, 'report.opened', 'report', id, { reason });
      return { reportId: id };
    });
  }
  reports(adminId: string) {
    this.admin(adminId);
    return this.all(
      `SELECT r.id,r.reason,r.details,r.status,r.created_at,r.market_order_id,l.title,s.name AS seller,s.trust_score AS trust,o.subtotal_cents
       FROM reports r JOIN market_orders o ON o.id=r.market_order_id JOIN listings l ON l.id=o.listing_id JOIN users s ON s.id=o.seller_id
       ORDER BY r.status<>'OPEN',r.created_at DESC LIMIT 100`,
    );
  }
  /** UPHOLD refunds the buyer and voids the payout; DISMISS releases the payout. Trust is recomputed. */
  async resolveReport(
    adminId: string,
    reportId: string,
    decision: 'UPHOLD' | 'DISMISS',
    refund: (paymentIntent: string) => Promise<void> = refundPaymentIntent,
  ) {
    this.admin(adminId);
    const result = this.transaction(() => {
      const r = this.one<{ market_order_id: string; status: string }>(
        'SELECT market_order_id,status FROM reports WHERE id=?',
        reportId,
      );
      if (!r) throw new DomainError('NOT_FOUND', 404);
      if (r.status !== 'OPEN') throw new DomainError('INVALID_STATE');
      const o = this.marketOrder(r.market_order_id);
      this.run(
        'UPDATE reports SET status=?,resolved_at=? WHERE id=?',
        decision === 'UPHOLD' ? 'UPHELD' : 'DISMISSED',
        this.now(),
        reportId,
      );
      this.run(
        'UPDATE market_orders SET status=?,payout_status=? WHERE id=?',
        decision === 'UPHOLD' ? 'REFUNDED' : 'RESOLVED',
        decision === 'UPHOLD' ? 'VOID' : 'OWED',
        o.id,
      );
      const payment = this.one<{ payment_intent: string | null }>(
        "SELECT payment_intent FROM payments WHERE kind='C2C' AND ref_id=?",
        o.id,
      );
      if (decision === 'UPHOLD')
        this.run(
          "UPDATE payments SET status='REFUNDED',updated_at=? WHERE kind='C2C' AND ref_id=?",
          this.now(),
          o.id,
        );
      this.audit(adminId, 'report.' + decision.toLowerCase(), 'report', reportId, { order: o.id });
      const trust = this.recomputeTrust(o.seller_id);
      return {
        decision,
        trust,
        paymentIntent: decision === 'UPHOLD' ? payment?.payment_intent : null,
      };
    });
    if (result.paymentIntent) await refund(result.paymentIntent).catch(() => undefined);
    return { decision: result.decision, trust: result.trust };
  }
  /** 100 − 25 × upheld + 2 × completed, clamped. Below 50 every listing of the seller is suspended. */
  recomputeTrust(sellerId: string) {
    const counts = this.one<{ upheld: number; completed: number }>(
      `SELECT (SELECT COUNT(*) FROM reports r JOIN market_orders o ON o.id=r.market_order_id WHERE o.seller_id=? AND r.status='UPHELD') AS upheld,
              (SELECT COUNT(*) FROM market_orders WHERE seller_id=? AND status='COMPLETED') AS completed`,
      sellerId,
      sellerId,
    )!;
    const score = trustScore(counts.upheld, counts.completed);
    this.run('UPDATE users SET trust_score=? WHERE id=?', score, sellerId);
    if (score < SUSPEND_BELOW)
      this.run(
        "UPDATE listings SET status='SUSPENDED',updated_at=? WHERE seller_id=? AND status IN ('ACTIVE','PAUSED','SOLD_OUT','DRAFT')",
        this.now(),
        sellerId,
      );
    return score;
  }
  /** Seller dashboard: listings plus money held, owed and paid in fees. */
  sellerDashboard(userId: string) {
    this.user(userId);
    return {
      verified: this.isVerified(userId),
      trust: this.one<{ trust_score: number }>('SELECT trust_score FROM users WHERE id=?', userId)!
        .trust_score,
      listings: this.all(
        `SELECT l.id,l.title,l.status,l.price_cents,(SELECT COALESCE(SUM(remaining),0) FROM listing_characters WHERE listing_id=l.id) AS left,
          (SELECT COALESCE(SUM(declared),0) FROM listing_characters WHERE listing_id=l.id) AS declared
         FROM listings l WHERE l.seller_id=? ORDER BY l.created_at DESC`,
        userId,
      ),
      money: this.one<{ held: number; owed: number; fees: number; sales: number }>(
        `SELECT COALESCE(SUM(CASE WHEN payout_status='HELD' THEN seller_owed_cents END),0) AS held,
                COALESCE(SUM(CASE WHEN payout_status='OWED' THEN seller_owed_cents END),0) AS owed,
                COALESCE(SUM(CASE WHEN payout_status IN ('HELD','OWED') THEN fee_cents END),0) AS fees,
                COUNT(CASE WHEN payout_status IN ('HELD','OWED') THEN 1 END) AS sales
         FROM market_orders WHERE seller_id=?`,
        userId,
      )!,
    };
  }

  // ---------- 8f. Chat ----------
  private thread(userId: string, threadId: string) {
    const t = this.one<{
      id: string;
      buyer_id: string;
      seller_id: string;
      market_order_id: string;
    }>('SELECT * FROM chat_threads WHERE id=?', threadId);
    if (!t || (t.buyer_id !== userId && t.seller_id !== userId))
      throw new DomainError('NOT_FOUND', 404);
    return t;
  }
  messages(userId: string, threadId: string, after = 0) {
    this.thread(userId, threadId);
    return this.all<{
      id: string;
      sender_id: string;
      sender: string;
      body: string;
      created_at: number;
    }>(
      'SELECT m.id,m.sender_id,u.name AS sender,m.body,m.created_at FROM chat_messages m JOIN users u ON u.id=m.sender_id WHERE m.thread_id=? AND m.created_at>? ORDER BY m.created_at,m.rowid LIMIT 200',
      threadId,
      after,
    );
  }
  sendMessage(userId: string, threadId: string, body: string) {
    return this.transaction(() => {
      this.thread(userId, threadId);
      const recent = this.one<{ n: number }>(
        'SELECT COUNT(*) AS n FROM chat_messages WHERE sender_id=? AND created_at>?',
        userId,
        this.now() - CHAT_WINDOW_MS,
      )!.n;
      if (recent >= CHAT_LIMIT) throw new DomainError('RATE_LIMITED', 429);
      const id = randomUUID();
      this.run(
        'INSERT INTO chat_messages (id,thread_id,sender_id,body,created_at) VALUES (?,?,?,?,?)',
        id,
        threadId,
        userId,
        body,
        this.now(),
      );
      return { id };
    });
  }
}
