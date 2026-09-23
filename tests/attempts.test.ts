import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/server/db';
import { DomainError, Loopbox } from '../src/server/service';
import { startOfSgtDay } from '../src/domain/time';
import { wave } from '../src/lib/game';
import { winRate, sellThrough, partnerShareCents, revenueCents } from '../src/domain/metrics';

const open: Loopbox[] = [];
afterEach(() => {
  while (open.length) open.pop()!.db.close();
});
function make(demo: boolean, now: () => number) {
  const service = new Loopbox(createDatabase(':memory:'), now, demo);
  open.push(service);
  return service;
}
function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return `${e.code}:${e.status}`;
    throw e;
  }
  return 'no error';
}

describe('daily attempt limit (SGT calendar day)', () => {
  it('allows attempts_per_day plays, then returns 429 ATTEMPT_LIMIT', () => {
    let now = Date.UTC(2026, 8, 23, 2, 0, 0);
    const s = make(false, () => now);
    for (let i = 0; i < 5; i++) {
      s.startGame('collector', 'lore');
      now += 1000;
    }
    expect(codeOf(() => s.startGame('collector', 'lore'))).toBe('ATTEMPT_LIMIT:429');
    expect(s.snapshot(s.user('collector')).attemptsLeft).toBe(0);
  });
  it('resets at midnight Singapore time, not UTC', () => {
    // 15:30 UTC is 23:30 in Singapore; 16:10 UTC is 00:10 the next Singapore day.
    let now = Date.UTC(2026, 8, 23, 15, 30, 0);
    const s = make(false, () => now);
    s.run('UPDATE campaigns SET attempts_per_day=1,starts_at=0,ends_at=?', now + 86400000 * 3);
    s.startGame('collector', 'lore');
    expect(codeOf(() => s.startGame('collector', 'lore'))).toBe('ATTEMPT_LIMIT:429');
    now = Date.UTC(2026, 8, 23, 16, 10, 0);
    expect(s.startGame('collector', 'lore').id).toBeTruthy();
  });
  it('uses the campaign setting and a relaxed limit of 50 in demo mode', () => {
    const now = Date.now();
    const live = make(false, () => now);
    expect(live.attemptLimit(live.campaign())).toBe(5);
    const demo = make(true, () => now);
    expect(demo.attemptLimit(demo.campaign())).toBe(50);
  });
  it('computes the start of the Singapore day', () => {
    expect(startOfSgtDay(Date.UTC(2026, 8, 23, 15, 59, 59))).toBe(Date.UTC(2026, 8, 22, 16));
    expect(startOfSgtDay(Date.UTC(2026, 8, 23, 16, 0, 0))).toBe(Date.UTC(2026, 8, 23, 16));
  });
});

describe('demo instant win', () => {
  it('does not exist outside demo mode', () => {
    const s = make(false, () => Date.now());
    expect(codeOf(() => s.demoWin('collector'))).toBe('NOT_FOUND:404');
    expect(s.all('SELECT * FROM access')).toHaveLength(0);
  });
  it('records a winning session and one slot exactly like a real win', () => {
    const s = make(true, () => Date.now());
    const result = s.demoWin('collector');
    expect(result.won).toBe(true);
    expect(s.all('SELECT * FROM access WHERE id=?', result.accessId)).toHaveLength(1);
    const game = s.one<{ won: number; score: number }>(
      'SELECT won,score FROM game_sessions WHERE user_id=?',
      'collector',
    )!;
    expect(game).toEqual({ won: 1, score: 10 });
    expect(s.demoWin('collector').accessId).toBe(result.accessId);
  });
  it('is still refused for non-collectors', () => {
    const s = make(true, () => Date.now());
    expect(codeOf(() => s.demoWin('business'))).toBe('COLLECTOR_ONLY:403');
  });
});

describe('studio formulas', () => {
  it('win rate is wins / plays as a percentage with one decimal', () => {
    expect(winRate(0, 0)).toBe(0);
    expect(winRate(1, 3)).toBe(33.3);
    expect(winRate(2, 3)).toBe(66.7);
    expect(winRate(5, 5)).toBe(100);
  });
  it('sell-through, revenue and partner share use integer cents', () => {
    expect(sellThrough(94, 100)).toBe(94);
    expect(revenueCents(94, 1890)).toBe(177660);
    expect(partnerShareCents(177660, 3000)).toBe(53298);
    expect(partnerShareCents(101, 3333)).toBe(33);
  });
  it('analytics reports plays, wins and win rate from game sessions', () => {
    const now = Date.now();
    const s = make(true, () => now);
    const lost = s.startGame('collector', 'lore');
    s.completeGame('collector', lost.id, [0, 0, 0]);
    const won = s.startGame('collector', 'lore');
    s.completeGame('collector', won.id, [1, 0, 2]);
    const a = s.analytics('business');
    expect([a.plays, a.wins, a.winRate]).toEqual([2, 1, 50]);
  });
  it('run wins use the campaign required score', () => {
    let now = Date.now();
    const s = make(true, () => now);
    // Catch 14 of 15 stars: the last wave moves to the lane that is neither star nor shard.
    const fourteen = (seed: number) =>
      Array.from({ length: 15 }, (_, i) => {
        const w = wave(seed, i);
        return i < 14 ? w.lane : 3 - w.lane - w.hazard;
      });
    const easy = s.startGame('collector', 'run');
    now += 30000;
    expect(s.completeGame('collector', easy.id, fourteen(easy.seed))).toMatchObject({
      won: true,
      score: 14,
    });
    s.run("UPDATE access SET status='EXPIRED'");
    s.edit('business', { ...editable(s), required_score: 15 });
    const hard = s.startGame('collector', 'run');
    now += 30000;
    expect(s.completeGame('collector', hard.id, fourteen(hard.seed))).toMatchObject({
      won: false,
      score: 14,
    });
  });
});

function editable(s: Loopbox) {
  const c = s.campaign();
  return {
    name: c.name,
    description: c.description,
    price: c.price,
    capacity: c.capacity,
    max_per_user: c.max_per_user,
    starts_at: c.starts_at,
    ends_at: c.ends_at,
    trade_ends_at: c.trade_ends_at,
    weights: [18, 17, 14, 16, 12, 11, 5],
  };
}
