'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, Pause, Play, RotateCcw } from 'lucide-react';
import { questConfig, lore } from '../lib/catalog';
import { wave, waveDuration } from '../lib/game';
import { useCampaign, useLoop } from './provider';
import { useSearchParams } from 'next/navigation';
import { KinArt } from './art';
import { hasOriginalArt } from '../lib/images';
import { dropHref, themeFor } from '../lib/links';
import { Button } from './ui';
import { Pending } from './shell';
type Session = { id: string; seed: number; mode: string };
type Result = { won: boolean; score: number; accessId?: string };
export default function Quest() {
  const campaignId = useSearchParams().get('campaign') || 'astral',
    query = campaignId === 'astral' ? '' : '?campaign=' + campaignId,
    data = useCampaign(campaignId),
    { login, act, busy, loadFailed } = useLoop(),
    [mode, setMode] = useState<'run' | 'lore'>('run'),
    [session, setSession] = useState<Session | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [answers, setAnswers] = useState<number[]>([]),
    [running, setRunning] = useState(false),
    [paused, setPaused] = useState(false),
    [tick, setTick] = useState(0),
    [score, setScore] = useState(0),
    [lane, setLane] = useState(1),
    [countdown, setCountdown] = useState(3);
  const lanes = useRef<number[]>([]),
    laneRef = useRef(1),
    elapsed = useRef(0),
    lastWave = useRef(-1),
    finishing = useRef(false);
  const start = async () => {
    if (!data?.user || data.user.role !== 'COLLECTOR') await login('collector');
    const g = await act<Session>({ action: 'start', mode, campaignId });
    if (g) {
      setSession(g);
      setAnswers([]);
      setResult(null);
      setScore(0);
      setTick(0);
      setLane(1);
      laneRef.current = 1;
      lanes.current = [];
      elapsed.current = 0;
      lastWave.current = -1;
      finishing.current = false;
      setCountdown(3);
      setPaused(false);
      setRunning(mode === 'run');
    }
  };
  const move = (next: number) => {
    laneRef.current = Math.max(0, Math.min(2, next));
    setLane(laneRef.current);
  };
  useEffect(() => {
    if (!running) return;
    const handler = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', ' '].includes(e.key)) {
        e.preventDefault();
        if (e.key === ' ') setPaused((p) => !p);
        else move(laneRef.current + (['ArrowLeft', 'a'].includes(e.key) ? -1 : 1));
      }
    };
    const hide = () => {
      if (document.hidden) setPaused(true);
    };
    window.addEventListener('keydown', handler);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('keydown', handler);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [running]);
  useEffect(() => {
    if (!running || !session || paused) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      elapsed.current += Math.min(100, now - previous);
      previous = now;
      const seconds = elapsed.current / 1000;
      setCountdown(Math.max(0, 3 - Math.floor(seconds)));
      if (seconds < 3) return;
      const gameSeconds = seconds - 3;
      setTick(Math.min(questConfig.duration, gameSeconds));
      const completedWave = Math.min(
        questConfig.waves - 1,
        Math.floor(gameSeconds / waveDuration) - 1,
      );
      if (completedWave > lastWave.current) {
        lastWave.current = completedWave;
        lanes.current.push(laneRef.current);
        const w = wave(session.seed, completedWave);
        setScore((s) =>
          Math.max(0, s + (laneRef.current === w.lane ? 1 : laneRef.current === w.hazard ? -1 : 0)),
        );
      }
      if (gameSeconds >= questConfig.duration && !finishing.current) {
        finishing.current = true;
        setRunning(false);
        act<Result>({ action: 'complete', sessionId: session.id, values: lanes.current }).then(
          (r) => {
            if (r) setResult(r);
          },
        );
      }
    }, 40);
    return () => clearInterval(timer);
  }, [running, session, paused, act]);
  const answer = async (value: number) => {
    const next = [...answers, value];
    setAnswers(next);
    if (next.length === lore.length && session) {
      const r = await act<Result>({ action: 'complete', sessionId: session.id, values: next });
      if (r) setResult(r);
    }
  };
  // The drop data failed to load: show the shared error state with a retry.
  if (loadFailed) return <Pending />;
  const theme = themeFor(data?.themes, campaignId);
  const currentWave = Math.min(questConfig.waves - 1, Math.floor(tick / waveDuration)),
    w = wave(session?.seed ?? 0, currentWave),
    depth = (tick % waveDuration) / waveDuration;
  return (
    <section
      className="wrap quest"
      style={theme ? { ['--theme-accent' as string]: theme.accent } : undefined}
    >
      <div className="quest-heading">
        {theme && <p className="quest-theme">{theme.name} quest</p>}
        <h1>{mode === 'run' ? 'The fragment run.' : 'The lore challenge.'}</h1>
        <p className="lead">Win to unlock one preorder slot. Free to play, no purchase needed.</p>
        {data && (
          <p className="tries" role="status">
            {data.attemptsLeft > 0
              ? `Free to play. You have ${data.attemptsLeft} ${data.attemptsLeft === 1 ? 'try' : 'tries'} left today.`
              : 'You have used all your tries for today.'}
          </p>
        )}
      </div>
      <div className="quest-layout">
        <div className={'arena ' + (mode === 'lore' ? 'lore-arena' : '')}>
          {!result && !session && data?.attemptsLeft === 0 ? (
            <div className="quest-result">
              <div className="result-symbol">
                <Clock size={36} aria-hidden="true" />
              </div>
              <h2>That’s all for today.</h2>
              <p>
                Each collector gets {data.attemptLimit} free tries a day so bots can’t farm slots.
                Your tries reset at midnight, Singapore time.
              </p>
              <Button href={dropHref(data.themes, campaignId)} variant="ghost">
                Back to the drop
              </Button>
            </div>
          ) : result ? (
            <div className="quest-result">
              <div className={result.won ? 'result-symbol won' : 'result-symbol'}>
                {result.won ? <Check size={40} /> : <RotateCcw size={35} />}
              </div>
              <h2>{result.won ? 'Quest cleared.' : 'So close. Try again?'}</h2>
              <p>
                {result.won
                  ? `You unlocked one preorder slot. It is held for ${theme?.slot_hold_minutes ?? 15} minutes. Open your box next.`
                  : `You scored ${result.score}. Playing again is free, or try the untimed lore challenge.`}
              </p>
              {result.won ? (
                <>
                  <div className="access-ticket">
                    <span>{data?.campaign.name ?? 'Astral Kin'}, series 01</span>
                    <strong>1 preorder slot</strong>
                    <small>Held for 15 minutes, while boxes last</small>
                  </div>
                  <Button href={result.accessId ? '/open/' + result.accessId : '/checkout' + query}>
                    Claim preorder slot
                  </Button>
                </>
              ) : (
                <Button onClick={start}>
                  Try again <RotateCcw size={18} aria-hidden="true" />
                </Button>
              )}
            </div>
          ) : mode === 'lore' && session ? (
            <div className="lore-panel">
              <p className="lore-step">Question {Math.min(answers.length + 1, 3)} of 3</p>
              <h2>{lore[answers.length]?.question || 'Checking your answers…'}</h2>
              <div className="lore-options">
                {lore[answers.length]?.options.map((option, i) => (
                  <button disabled={busy} key={option} onClick={() => answer(i)}>
                    <span>{i + 1}</span>
                    {option}
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <p className="note">Take your time. There is no timer on this challenge.</p>
            </div>
          ) : mode === 'lore' ? (
            <div className="lore-panel">
              <h2>Three questions. No timer.</h2>
              <p>
                Answer three questions about how a LoopBox drop works. No quick reflexes needed.
              </p>
              <Button disabled={busy} onClick={start}>
                Start lore challenge
              </Button>
            </div>
          ) : (
            <>
              <div className="star-field" />
              <div className="run-track">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="track-lane" />
                ))}
                {running && countdown === 0 && (
                  <>
                    <div
                      className="fragment"
                      style={{
                        left: 18 + w.lane * 32 + '%',
                        top: 14 + depth * 65 + '%',
                        transform: `translate(-50%,-50%) scale(${0.3 + depth})`,
                      }}
                    >
                      ✧
                    </div>
                    <div
                      className="hazard"
                      style={{
                        left: 18 + w.hazard * 32 + '%',
                        top: 14 + depth * 65 + '%',
                        transform: `translate(-50%,-50%) rotate(45deg) scale(${0.3 + depth})`,
                      }}
                    />
                  </>
                )}
                <div className="runner" style={{ left: 18 + lane * 32 + '%' }}>
                  {theme && !hasOriginalArt(theme.slug) ? (
                    <span className="runner-orb" aria-hidden="true" />
                  ) : (
                    <KinArt id="nova" />
                  )}
                </div>
              </div>
              {!running && !session ? (
                <div className="arena-intro">
                  <h2>Follow the light.</h2>
                  <p>
                    Catch {questConfig.requiredScore} of {questConfig.waves} stars in{' '}
                    {questConfig.duration} seconds. Dodge the dark shards.
                  </p>
                  <Button disabled={busy} onClick={start}>
                    Start quest <Play size={18} aria-hidden="true" />
                  </Button>
                </div>
              ) : countdown > 0 && running ? (
                <div className="countdown">{countdown}</div>
              ) : paused ? (
                <div className="arena-intro">
                  <h2>Paused.</h2>
                  <Button onClick={() => setPaused(false)}>
                    Resume <Play size={18} aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
              {running && (
                <div className="game-hud">
                  <div>
                    <span>Stars</span>
                    <strong>
                      {score.toString().padStart(2, '0')}
                      <small>/{questConfig.requiredScore}</small>
                    </strong>
                  </div>
                  <div>
                    <span>Time</span>
                    <strong>
                      {Math.ceil(questConfig.duration - tick)
                        .toString()
                        .padStart(2, '0')}
                      <small>s</small>
                    </strong>
                  </div>
                  <button
                    className="hud-pause"
                    aria-label="Pause quest"
                    onClick={() => setPaused(!paused)}
                  >
                    <Pause size={20} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <aside className="card quest-aside">
          <h2 className="h3">How to win</h2>
          <ul className="rules">
            <li>
              <span className="rule-icon fragment-icon" aria-hidden="true">
                ✧
              </span>
              <span>
                Catch stars <small>+1 each. Reach {questConfig.requiredScore}.</small>
              </span>
            </li>
            <li>
              <span className="rule-icon hazard-icon" aria-hidden="true">
                ◆
              </span>
              <span>
                Dodge dark shards <small>−1 if you hit one.</small>
              </span>
            </li>
            <li>
              <span className="rule-icon" aria-hidden="true">
                ↔
              </span>
              <span>
                Change lanes <small>Arrow keys, A and D, or the buttons below.</small>
              </span>
            </li>
          </ul>
          <fieldset className="mode-switch">
            <legend>Choose a challenge</legend>
            <button
              disabled={running || busy}
              className={mode === 'run' ? 'selected' : ''}
              aria-pressed={mode === 'run'}
              onClick={() => {
                setMode('run');
                setSession(null);
                setResult(null);
              }}
            >
              Fragment run <span>30 seconds</span>
            </button>
            <button
              disabled={running || busy}
              className={mode === 'lore' ? 'selected' : ''}
              aria-pressed={mode === 'lore'}
              onClick={() => {
                setMode('lore');
                setSession(null);
                setResult(null);
              }}
            >
              Untimed lore challenge <span>Accessible</span>
            </button>
          </fieldset>
          <p className="note">
            Both challenges unlock the same slot. A slot lasts 15 minutes and does not hold a box
            until you pay.
          </p>
          {data?.demo && !running && !result && (
            <Button
              variant="quiet"
              disabled={busy}
              onClick={async () => {
                if (!data.user || data.user.role !== 'COLLECTOR') await login('collector');
                const r = await act<Result>({ action: 'demoWin', campaignId });
                if (r) {
                  setSession(null);
                  setResult(r);
                }
              }}
            >
              Demo: win instantly
            </Button>
          )}
        </aside>
      </div>
      {running && (
        <div className="touch-controls">
          <button
            aria-label="Move left"
            disabled={paused}
            onClick={() => move(laneRef.current - 1)}
          >
            <ArrowLeft aria-hidden="true" /> Left
          </button>
          <button
            aria-label="Move right"
            disabled={paused}
            onClick={() => move(laneRef.current + 1)}
          >
            Right <ArrowRight aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
