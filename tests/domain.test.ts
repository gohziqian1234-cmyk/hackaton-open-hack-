import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { createDatabase } from '../src/server/db';
import { Loopbox } from '../src/server/service';
import { wave } from '../src/lib/game';
import { actionSchema } from '../src/server/validation';
let service: Loopbox;
let now: number;
beforeEach(() => {
  now = Date.now();
  service = new Loopbox(createDatabase(':memory:'), () => now, true);
});
afterEach(() => service.db.close());
function win(user = 'collector') {
  const g = service.startGame(user, 'lore');
  return service.completeGame(user, g.id, [1, 0, 2]).accessId!;
}
function buy() {
  return service.preorder('collector', win()).allocationId;
}
describe('server-owned purchase and quest rules', () => {
  it('creates exactly one entitlement and prevents replay', () => {
    const g = service.startGame('collector', 'lore');
    service.completeGame('collector', g.id, [1, 0, 2]);
    expect(() => service.completeGame('collector', g.id, [1, 0, 2])).toThrow(
      'SESSION_ALREADY_USED',
    );
    expect(service.all('SELECT * FROM access')).toHaveLength(1);
  });
  it('losing creates no entitlement', () => {
    const g = service.startGame('collector', 'lore');
    expect(service.completeGame('collector', g.id, [0, 0, 0]).won).toBe(false);
    expect(service.all('SELECT * FROM access')).toHaveLength(0);
  });
  it('recomputes run score and rejects implausible duration', () => {
    const g = service.startGame('collector', 'run');
    const lanes = Array.from({ length: 15 }, (_, i) => wave(g.seed, i).lane);
    expect(() => service.completeGame('collector', g.id, lanes)).toThrow('INVALID_RUN');
    now += 30000;
    expect(service.completeGame('collector', g.id, lanes).won).toBe(true);
  });
  it('rejects arbitrary scores and invalid lanes at the API boundary', () => {
    expect(
      actionSchema.safeParse({ action: 'complete', sessionId: 'x', values: [99999] }).success,
    ).toBe(false);
  });
  it('does not stack repeated wins into unlimited access', () => {
    win();
    win();
    expect(service.all('SELECT * FROM access')).toHaveLength(1);
  });
  it('consumes access once and creates one immutable allocation', () => {
    const access = win();
    const result = service.preorder('collector', access);
    expect(service.campaign().confirmed).toBe(94);
    service.run('UPDATE campaigns SET max_per_user=3');
    expect(() => service.preorder('collector', access)).toThrow('ACCESS_ALREADY_USED');
    expect(service.reveal('collector', result.allocationId).character_id).toBe('eclipse');
    expect(service.reveal('collector', result.allocationId).character_id).toBe('eclipse');
  });
  it('rejects expired access and foreign access', () => {
    const access = win();
    expect(() => service.preorder('demo-0', access)).toThrow();
    now += 16 * 60000;
    expect(() => service.preorder('collector', access)).toThrow('ACCESS_EXPIRED');
  });
  it('enforces the user purchase limit', () => {
    buy();
    expect(() => service.startGame('collector', 'lore')).toThrow('PURCHASE_LIMIT');
  });
  it('rejects checkout at capacity and database rejects bypasses', () => {
    const access = win();
    service.run('UPDATE campaigns SET capacity=93');
    expect(() => service.preorder('collector', access)).toThrow('SOLD_OUT');
    expect(() =>
      service.run(
        "INSERT INTO orders VALUES ('bad','collector','astral',NULL,1890,'DEMO_PAID',?)",
        now,
      ),
    ).toThrow('SOLD_OUT');
  });
  it('only one contender can claim the final unit', () => {
    service.run('UPDATE campaigns SET max_per_user=20');
    const a = win(),
      b = win('demo-1');
    service.run('UPDATE campaigns SET capacity=94');
    service.preorder('collector', a);
    expect(() => service.preorder('demo-1', b)).toThrow('SOLD_OUT');
    expect(service.campaign().confirmed).toBe(94);
  });
  it('hides unopened identity and rejects cross-user reveal', () => {
    const id = buy();
    expect(
      service.snapshot(service.user('collector')).collection.find((a) => a.id === id)?.character_id,
    ).toBe('');
    expect(() => service.reveal('demo-0', id)).toThrow('ALLOCATION_NOT_FOUND');
  });
});
describe('matching and manufacturing', () => {
  it('rejects non-owner and cross-rarity listing', () => {
    expect(() => service.listTrade('demo-0', 'starter-eclipse', ['aurora'])).toThrow(
      'ALLOCATION_NOT_FOUND',
    );
    expect(() => service.listTrade('collector', 'starter-eclipse', ['nova'])).toThrow(
      'SAME_RARITY_REQUIRED',
    );
  });
  it('detects reciprocal direct match and swaps exactly two owners', () => {
    const { matchId } = service.listTrade('collector', 'starter-eclipse', ['aurora']);
    expect(matchId).toBeTruthy();
    expect(service.respond('collector', matchId!, true).status).toBe('ACCEPTED');
    expect(service.owned('collector', 'sarah-aurora').character_id).toBe('aurora');
    expect(service.owned('demo-0', 'starter-eclipse').character_id).toBe('eclipse');
    expect(() => service.respond('collector', matchId!, true)).toThrow('MATCH_ALREADY_RESOLVED');
    expect(service.campaign().confirmed).toBe(93);
  });
  it('requires both consents outside simulated Sarah', () => {
    service.demo = false;
    const { matchId } = service.listTrade('collector', 'starter-eclipse', ['aurora']);
    expect(service.respond('collector', matchId!, true).status).toBe('PENDING');
    expect(service.respond('demo-0', matchId!, true).status).toBe('ACCEPTED');
  });
  it('rejects outsider consent and releases rejected trades', () => {
    const { matchId } = service.listTrade('collector', 'starter-eclipse', ['aurora']);
    expect(() => service.respond('demo-1', matchId!, true)).toThrow('MATCH_NOT_FOUND');
    service.respond('collector', matchId!, false);
    expect(service.owned('collector', 'starter-eclipse').status).toBe('OWNED');
  });
  it('returns an honest no-match state', () => {
    service.run('DELETE FROM preferences');
    expect(service.listTrade('collector', 'starter-eclipse', ['aurora']).matched).toBe(false);
  });
  it('locks pending allocations, stops trades and advances in order', () => {
    service.listTrade('collector', 'starter-eclipse', ['aurora']);
    for (let i = 0; i < 3; i++) service.advance('business');
    expect(service.campaign().phase).toBe('ALLOCATION_LOCKED');
    expect(service.owned('collector', 'starter-eclipse').status).toBe('LOCKED_FOR_PRODUCTION');
    expect(() => service.listTrade('collector', 'starter-eclipse', ['aurora'])).toThrow(
      'TRADE_WINDOW_CLOSED',
    );
    expect(service.all("SELECT * FROM matches WHERE status='PENDING'")).toHaveLength(0);
  });
  it('production counts equal all confirmed allocations after trades', () => {
    const { matchId } = service.listTrade('collector', 'starter-eclipse', ['aurora']);
    service.respond('collector', matchId!, true);
    const data = service.analytics('business');
    expect(data.distribution.reduce((n, d) => n + d.quantity, 0)).toBe(data.orders);
    expect(data.trades).toBe(1);
    expect(service.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('rejects collector business operations and campaign phase bypass', () => {
    expect(() => service.advance('collector')).toThrow('BUSINESS_ONLY');
    service.advance('business');
    expect(() => service.startGame('collector', 'lore')).toThrow('PREORDER_CLOSED');
  });
  it('persists configured weights and rejects a cap below confirmed demand', () => {
    const c = service.campaign();
    const changes = {
      name: c.name,
      description: c.description,
      price: c.price,
      capacity: c.capacity,
      max_per_user: c.max_per_user,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      trade_ends_at: c.trade_ends_at,
      weights: [20, 17, 14, 16, 12, 11, 5],
    };
    service.edit('business', changes);
    expect(service.snapshot(service.user('business')).weights[0]).toBe(20);
    expect(() => service.edit('business', { ...changes, capacity: 92 })).toThrow(
      'CAP_BELOW_CONFIRMED',
    );
  });
  it('resolves identity from unguessable server sessions', () => {
    expect(service.identity('collector')).toBeNull();
    const token = service.login('collector');
    expect(service.identity(token)?.id).toBe('collector');
    now += 86400001;
    expect(service.identity(token)).toBeNull();
  });
});
