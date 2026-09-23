import { randomUUID, randomInt } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { lore, phases, questConfig } from '../lib/catalog';
import { scoreRun } from '../lib/game';
import { startOfSgtDay } from '../domain/time';
import { winRate } from '../domain/metrics';
import type { Allocation, Campaign, User, Snapshot, Match, Access, Analytics } from '../lib/types';

export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
type GameSession = {
  id: string;
  user_id: string;
  mode: string;
  started_at: number;
  completed_at: number | null;
  seed: number;
};
export class Loopbox {
  constructor(
    public db: DatabaseSync,
    private now = () => Date.now(),
    public demo = process.env.DEMO_MODE !== 'false',
  ) {}
  one<T>(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).get(...args) as T | undefined;
  }
  all<T>(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).all(...args) as T[];
  }
  run(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).run(...args);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  campaign() {
    return this.one<Campaign>(
      'SELECT c.*, (SELECT COUNT(*) FROM orders WHERE campaign_id=c.id) AS confirmed FROM campaigns c WHERE id=?',
      'astral',
    )!;
  }
  user(id: string) {
    const user = this.one<User>('SELECT id,name,role FROM users WHERE id=?', id);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    return user;
  }
  business(id: string) {
    if (this.user(id).role !== 'BUSINESS') throw new DomainError('BUSINESS_ONLY', 403);
  }
  collector(id: string) {
    if (this.user(id).role !== 'COLLECTOR') throw new DomainError('COLLECTOR_ONLY', 403);
  }
  purchases(id: string) {
    return this.one<{ n: number }>(
      'SELECT COUNT(*) AS n FROM orders WHERE user_id=? AND campaign_id=?',
      id,
      'astral',
    )!.n;
  }
  eligible(id: string) {
    this.collector(id);
    const c = this.campaign();
    if (c.phase !== 'ACTIVE_PREORDER' || this.now() < c.starts_at || this.now() >= c.ends_at)
      throw new DomainError('PREORDER_CLOSED');
    if (c.confirmed >= c.capacity) throw new DomainError('SOLD_OUT');
    if (this.purchases(id) >= c.max_per_user) throw new DomainError('PURCHASE_LIMIT');
    return c;
  }
  login(id: 'collector' | 'business' | 'demo-0') {
    if (!this.demo) throw new DomainError('DEMO_DISABLED', 403);
    this.user(id);
    const token = randomUUID();
    this.run('INSERT INTO sessions VALUES (?,?,?)', token, id, this.now() + 86400000);
    return token;
  }
  identity(token?: string) {
    return token
      ? (this.one<User>(
          'SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE token=? AND expires_at>?',
          token,
          this.now(),
        ) ?? null)
      : null;
  }
  /** Daily play limit per campaign. Demo mode allows 50 so rehearsals never lock anyone out. */
  attemptLimit(c: Campaign) {
    return this.demo ? 50 : c.attempts_per_day;
  }
  attemptsUsed(id: string, campaignId: string) {
    return this.one<{ n: number }>(
      'SELECT COUNT(*) AS n FROM game_sessions WHERE user_id=? AND campaign_id=? AND started_at>=?',
      id,
      campaignId,
      startOfSgtDay(this.now()),
    )!.n;
  }
  private checkAttempts(id: string, c: Campaign) {
    if (this.attemptsUsed(id, c.id) >= this.attemptLimit(c))
      throw new DomainError('ATTEMPT_LIMIT', 429);
  }
  private grantAccess(id: string, campaignId: string, gameId: string) {
    const existing = this.one<Access>(
      "SELECT * FROM access WHERE user_id=? AND campaign_id=? AND status='AVAILABLE' AND expires_at>?",
      id,
      campaignId,
      this.now(),
    );
    if (existing) return existing.id;
    const accessId = randomUUID();
    this.run(
      'INSERT INTO access (id,user_id,campaign_id,game_id,earned_at,expires_at,status) VALUES (?,?,?,?,?,?,?)',
      accessId,
      id,
      campaignId,
      gameId,
      this.now(),
      this.now() + 15 * 60000,
      'AVAILABLE',
    );
    return accessId;
  }
  startGame(id: string, mode: 'run' | 'lore') {
    return this.transaction(() => {
      const c = this.eligible(id);
      this.checkAttempts(id, c);
      const recent = this.one<{ n: number }>(
        'SELECT COUNT(*) AS n FROM game_sessions WHERE user_id=? AND started_at>?',
        id,
        this.now() - 60000,
      )!.n;
      if (recent >= 10) throw new DomainError('TRY_AGAIN_SHORTLY', 429);
      const session = { id: randomUUID(), seed: randomInt(0, 10000), mode };
      this.run(
        'INSERT INTO game_sessions (id,user_id,campaign_id,mode,started_at,seed) VALUES (?,?,?,?,?,?)',
        session.id,
        id,
        'astral',
        mode,
        this.now(),
        session.seed,
      );
      return session;
    });
  }
  completeGame(id: string, sessionId: string, values: number[]) {
    return this.transaction(() => {
      const c = this.eligible(id);
      const g = this.one<GameSession>(
        'SELECT * FROM game_sessions WHERE id=? AND user_id=?',
        sessionId,
        id,
      );
      if (!g) throw new DomainError('INVALID_SESSION', 403);
      if (g.completed_at !== null) throw new DomainError('SESSION_ALREADY_USED');
      const elapsed = this.now() - g.started_at;
      if (elapsed > 3600000) throw new DomainError('SESSION_EXPIRED');
      if (
        g.mode === 'run' &&
        (elapsed < questConfig.duration * 1000 - 500 || values.length !== questConfig.waves)
      )
        throw new DomainError('INVALID_RUN', 400);
      if (g.mode === 'lore' && values.length !== lore.length)
        throw new DomainError('INCOMPLETE_CHALLENGE', 400);
      const score =
        g.mode === 'run'
          ? scoreRun(g.seed, values)
          : values.filter((v, i) => v === lore[i].answer).length;
      const won = g.mode === 'run' ? score >= c.required_score : score === lore.length;
      this.run(
        'UPDATE game_sessions SET completed_at=?,score=?,won=? WHERE id=?',
        this.now(),
        score,
        won ? 1 : 0,
        g.id,
      );
      if (!won) return { won: false, score };
      return { won: true, score, accessId: this.grantAccess(id, c.id, g.id) };
    });
  }
  /** DEMO_MODE only: records a winning session exactly like a real win, without playing. */
  demoWin(id: string) {
    if (!this.demo) throw new DomainError('NOT_FOUND', 404);
    return this.transaction(() => {
      const c = this.eligible(id);
      this.checkAttempts(id, c);
      const gameId = randomUUID();
      this.run(
        'INSERT INTO game_sessions (id,user_id,campaign_id,mode,started_at,completed_at,score,seed,won) VALUES (?,?,?,?,?,?,?,?,1)',
        gameId,
        id,
        c.id,
        'run',
        this.now(),
        this.now(),
        c.required_score,
        randomInt(0, 10000),
      );
      return { won: true, score: c.required_score, accessId: this.grantAccess(id, c.id, gameId) };
    });
  }
  preorder(id: string, accessId: string) {
    return this.transaction(() => {
      const c = this.eligible(id);
      const a = this.one<Access & { user_id: string; campaign_id: string }>(
        'SELECT * FROM access WHERE id=?',
        accessId,
      );
      if (!a || a.user_id !== id || a.campaign_id !== c.id)
        throw new DomainError('INVALID_ACCESS', 403);
      if (a.status !== 'AVAILABLE') throw new DomainError('ACCESS_ALREADY_USED');
      if (a.expires_at <= this.now()) throw new DomainError('ACCESS_EXPIRED');
      const orderId = randomUUID(),
        allocationId = randomUUID();
      // The advertised golden path is deterministic in demo mode. Live allocation is weighted.
      let character = 'eclipse';
      if (!this.demo) {
        const choices = this.all<{ id: string; weight: number }>(
          'SELECT id,weight FROM characters WHERE campaign_id=?',
          c.id,
        );
        const total = choices.reduce((s, v) => s + v.weight, 0);
        let point = (randomInt(1000000) / 1000000) * total;
        character = choices[choices.length - 1].id;
        for (const ch of choices) {
          point -= ch.weight;
          if (point < 0) {
            character = ch.id;
            break;
          }
        }
      }
      this.run('UPDATE access SET status=? WHERE id=?', 'REDEEMED', a.id);
      this.run(
        'INSERT INTO orders VALUES (?,?,?,?,?,?,?)',
        orderId,
        id,
        c.id,
        a.id,
        c.price,
        'DEMO_PAID',
        this.now(),
      );
      this.run(
        'INSERT INTO allocations VALUES (?,?,?,?,?,?,?,?,?)',
        allocationId,
        orderId,
        c.id,
        id,
        id,
        character,
        'OWNED',
        0,
        this.now(),
      );
      return { orderId, allocationId };
    });
  }
  owned(id: string, allocationId: string) {
    const a = this.one<Allocation>(
      'SELECT * FROM allocations WHERE id=? AND owner_id=?',
      allocationId,
      id,
    );
    if (!a) throw new DomainError('ALLOCATION_NOT_FOUND', 404);
    return a;
  }
  reveal(id: string, allocationId: string) {
    const a = this.owned(id, allocationId);
    this.run('UPDATE allocations SET revealed=1 WHERE id=?', a.id);
    return { ...a, revealed: 1 };
  }
  trading() {
    const c = this.campaign();
    if (
      !['ACTIVE_PREORDER', 'PREORDER_CLOSED', 'TRADE_WINDOW'].includes(c.phase) ||
      this.now() >= c.trade_ends_at
    )
      throw new DomainError('TRADE_WINDOW_CLOSED');
  }
  listTrade(id: string, allocationId: string, wants: string[]) {
    return this.transaction(() => {
      this.trading();
      const a = this.owned(id, allocationId);
      if (!a.revealed) throw new DomainError('OPEN_BOX_FIRST');
      if (!['OWNED', 'TRADE_LISTED'].includes(a.status))
        throw new DomainError('ALLOCATION_UNAVAILABLE');
      const source = this.one<{ rarity: string; campaign_id: string }>(
        'SELECT * FROM characters WHERE id=?',
        a.character_id,
      )!;
      for (const want of wants) {
        const target = this.one<{ rarity: string; campaign_id: string }>(
          'SELECT * FROM characters WHERE id=?',
          want,
        );
        if (
          !target ||
          target.rarity !== source.rarity ||
          target.campaign_id !== source.campaign_id ||
          want === a.character_id
        )
          throw new DomainError('SAME_RARITY_REQUIRED', 400);
      }
      this.run('DELETE FROM preferences WHERE allocation_id=?', a.id);
      for (const want of new Set(wants))
        this.run('INSERT INTO preferences VALUES (?,?)', a.id, want);
      this.run("UPDATE allocations SET status='TRADE_LISTED' WHERE id=?", a.id);
      const partner = this.one<Allocation>(
        `SELECT b.* FROM allocations b JOIN characters cb ON cb.id=b.character_id WHERE b.owner_id<>? AND b.campaign_id=? AND b.status='TRADE_LISTED' AND b.revealed=1 AND cb.rarity=? AND EXISTS(SELECT 1 FROM preferences WHERE allocation_id=? AND character_id=b.character_id) AND EXISTS(SELECT 1 FROM preferences WHERE allocation_id=b.id AND character_id=?) ORDER BY b.created_at,b.id LIMIT 1`,
        id,
        source.campaign_id,
        source.rarity,
        a.id,
        a.character_id,
      );
      if (!partner) return { matched: false };
      const matchId = randomUUID();
      this.run(
        'INSERT INTO matches VALUES (?,?,?,?,?,?,?,?,?,?)',
        matchId,
        source.campaign_id,
        a.id,
        partner.id,
        id,
        partner.owner_id,
        0,
        this.demo && partner.owner_id === 'demo-0' ? 1 : 0,
        'PENDING',
        this.now(),
      );
      this.run("UPDATE allocations SET status='TRADE_PENDING' WHERE id IN (?,?)", a.id, partner.id);
      return { matched: true, matchId };
    });
  }
  cancelListing(id: string, allocationId: string) {
    return this.transaction(() => {
      this.trading();
      const a = this.owned(id, allocationId);
      if (a.status === 'TRADE_PENDING' || a.status === 'LOCKED_FOR_PRODUCTION')
        throw new DomainError('ALLOCATION_UNAVAILABLE');
      this.run('DELETE FROM preferences WHERE allocation_id=?', a.id);
      this.run("UPDATE allocations SET status='OWNED' WHERE id=?", a.id);
      return { ok: true };
    });
  }
  respond(id: string, matchId: string, accept: boolean) {
    return this.transaction(() => {
      this.trading();
      const m = this.one<Match>(
        'SELECT * FROM matches WHERE id=? AND (a_user=? OR b_user=?)',
        matchId,
        id,
        id,
      );
      if (!m) throw new DomainError('MATCH_NOT_FOUND', 404);
      if (m.status !== 'PENDING') throw new DomainError('MATCH_ALREADY_RESOLVED');
      if (!accept) {
        this.run("UPDATE matches SET status='DECLINED' WHERE id=?", m.id);
        this.run("UPDATE allocations SET status='OWNED' WHERE id IN (?,?)", m.a_id, m.b_id);
        this.run('DELETE FROM preferences WHERE allocation_id IN (?,?)', m.a_id, m.b_id);
        return { status: 'DECLINED' };
      }
      this.run(
        `UPDATE matches SET ${id === m.a_user ? 'a_accept' : 'b_accept'}=1 WHERE id=?`,
        m.id,
      );
      const updated = this.one<Match>('SELECT * FROM matches WHERE id=?', m.id)!;
      if (updated.a_accept && updated.b_accept) {
        const a = this.owned(m.a_user, m.a_id),
          b = this.owned(m.b_user, m.b_id);
        if (a.status !== 'TRADE_PENDING' || b.status !== 'TRADE_PENDING')
          throw new DomainError('ALLOCATION_UNAVAILABLE');
        this.run("UPDATE allocations SET owner_id=?,status='OWNED' WHERE id=?", m.b_user, a.id);
        this.run("UPDATE allocations SET owner_id=?,status='OWNED' WHERE id=?", m.a_user, b.id);
        this.run('DELETE FROM preferences WHERE allocation_id IN (?,?)', a.id, b.id);
        this.run("UPDATE matches SET status='ACCEPTED' WHERE id=?", m.id);
        return { status: 'ACCEPTED' };
      }
      return { status: 'PENDING' };
    });
  }
  advance(id: string) {
    this.business(id);
    return this.transaction(() => {
      const c = this.campaign();
      const next = phases[phases.indexOf(c.phase) + 1];
      if (!next) throw new DomainError('CAMPAIGN_COMPLETE');
      if (next === 'ALLOCATION_LOCKED') {
        this.run("UPDATE matches SET status='EXPIRED' WHERE status='PENDING'");
        this.run('DELETE FROM preferences');
        this.run("UPDATE allocations SET status='LOCKED_FOR_PRODUCTION' WHERE campaign_id=?", c.id);
      }
      this.run('UPDATE campaigns SET phase=? WHERE id=?', next, c.id);
      return { phase: next };
    });
  }
  edit(
    id: string,
    changes: {
      name: string;
      description: string;
      price: number;
      capacity: number;
      max_per_user: number;
      starts_at: number;
      ends_at: number;
      trade_ends_at: number;
      weights: number[];
      required_score?: number;
      attempts_per_day?: number;
    },
  ) {
    this.business(id);
    return this.transaction(() => {
      const c = this.campaign();
      if (!['UPCOMING', 'ACTIVE_PREORDER'].includes(c.phase))
        throw new DomainError('CAMPAIGN_NOT_EDITABLE');
      if (changes.capacity < c.confirmed) throw new DomainError('CAP_BELOW_CONFIRMED');
      if (changes.starts_at >= changes.ends_at || changes.ends_at > changes.trade_ends_at)
        throw new DomainError('INVALID_DATES', 400);
      this.run(
        'UPDATE campaigns SET name=?,description=?,price=?,capacity=?,max_per_user=?,starts_at=?,ends_at=?,trade_ends_at=? WHERE id=?',
        changes.name,
        changes.description,
        changes.price,
        changes.capacity,
        changes.max_per_user,
        changes.starts_at,
        changes.ends_at,
        changes.trade_ends_at,
        c.id,
      );
      if (changes.required_score !== undefined || changes.attempts_per_day !== undefined)
        this.run(
          'UPDATE campaigns SET required_score=?,attempts_per_day=? WHERE id=?',
          changes.required_score ?? c.required_score,
          changes.attempts_per_day ?? c.attempts_per_day,
          c.id,
        );
      this.all<{ id: string }>('SELECT id FROM characters ORDER BY rowid').forEach((ch, i) =>
        this.run('UPDATE characters SET weight=? WHERE id=?', changes.weights[i], ch.id),
      );
      return { ok: true };
    });
  }
  snapshot(user: User | null): Snapshot {
    const c = this.campaign();
    const id = user?.id ?? '';
    return {
      serverTime: this.now(),
      campaign: c,
      weights: this.all<{ weight: number }>(
        'SELECT weight FROM characters WHERE campaign_id=? ORDER BY rowid',
        c.id,
      ).map((row) => row.weight),
      user,
      demo: this.demo,
      purchases: this.purchases(id),
      access: this.all<Access>(
        "SELECT id,expires_at,status FROM access WHERE user_id=? AND status='AVAILABLE' AND expires_at>?",
        id,
        this.now(),
      ),
      collection: this.all<Allocation>(
        "SELECT id,CASE WHEN revealed=1 THEN character_id ELSE '' END AS character_id,owner_id,status,revealed,order_id FROM allocations WHERE owner_id=? ORDER BY created_at DESC",
        id,
      ),
      matches: this.all<Match>(
        `SELECT m.*,a.character_id AS offered,b.character_id AS requested,u.name AS partner FROM matches m JOIN allocations a ON a.id=m.a_id JOIN allocations b ON b.id=m.b_id JOIN users u ON u.id=CASE WHEN m.a_user=? THEN m.b_user ELSE m.a_user END WHERE m.a_user=? OR m.b_user=? ORDER BY m.created_at DESC`,
        id,
        id,
        id,
      ),
      waitlisted: !!this.one('SELECT user_id FROM waitlist WHERE user_id=?', id),
      attemptLimit: this.attemptLimit(c),
      attemptsLeft: Math.max(0, this.attemptLimit(c) - this.attemptsUsed(id, c.id)),
    };
  }
  analytics(id: string): Analytics {
    this.business(id);
    const count = (sql: string) => this.one<{ n: number }>(sql)!.n;
    const c = this.campaign();
    const plays = count('SELECT COUNT(*) AS n FROM game_sessions'),
      wins = count('SELECT COUNT(*) AS n FROM game_sessions WHERE won=1');
    return {
      orders: c.confirmed,
      plays,
      wins,
      winRate: winRate(wins, plays),
      players: count('SELECT COUNT(DISTINCT user_id) AS n FROM game_sessions'),
      completions: count('SELECT COUNT(*) AS n FROM game_sessions WHERE completed_at IS NOT NULL'),
      unlocks: count('SELECT COUNT(*) AS n FROM access'),
      opened: count('SELECT COUNT(*) AS n FROM allocations WHERE revealed=1'),
      listings: count(
        "SELECT COUNT(*) AS n FROM allocations WHERE status IN ('TRADE_LISTED','TRADE_PENDING')",
      ),
      trades: count("SELECT COUNT(*) AS n FROM matches WHERE status='ACCEPTED'"),
      distribution: this.all(
        'SELECT c.id,c.name,c.rarity,COUNT(a.id) AS quantity FROM characters c LEFT JOIN allocations a ON a.character_id=c.id GROUP BY c.id ORDER BY c.rowid',
      ),
    };
  }
}
