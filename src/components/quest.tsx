'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Pause,
  Play,
  Check,
  RotateCcw,
  VolumeX,
} from 'lucide-react';
import { questConfig, lore } from '../lib/catalog';
import { wave, waveDuration } from '../lib/game';
import { useLoop } from './provider';
import { KinArt } from './art';
type Session = { id: string; seed: number; mode: string };
type Result = { won: boolean; score: number; accessId?: string };
export default function Quest() {
  const { data, login, act, busy } = useLoop(),
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
    const g = await act<Session>({ action: 'start', mode });
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
  const currentWave = Math.min(questConfig.waves - 1, Math.floor(tick / waveDuration)),
    w = wave(session?.seed ?? 0, currentWave),
    depth = (tick % waveDuration) / waveDuration;
  return (
    <section className="page quest-page">
      <div className="breadcrumb">
        <Link href="/drop">
          <ArrowLeft size={14} /> Astral Kin
        </Link>
        <span>/</span>Launch Quest
      </div>
      <div className="quest-heading">
        <div>
          <p className="eyebrow">YOUR PLACE AMONG THE STARS</p>
          <h1>
            The fragment run<span>.</span>
          </h1>
        </div>
        <p>
          Find your rhythm. Gather the light.
          <br />
          Earn your place in the first constellation.
        </p>
      </div>
      <div className="quest-layout">
        <div className={'quest-arena ' + (mode === 'lore' ? 'lore-arena' : '')}>
          <div className="arena-head">
            <span>
              <span className="live-dot" /> ASTRAL KIN / LAUNCH QUEST
            </span>
            <VolumeX size={17} />
          </div>
          {result ? (
            <div className="quest-result">
              <div className="result-symbol">
                {result.won ? <Check size={40} /> : <RotateCcw size={35} />}
              </div>
              <p className="eyebrow">
                {result.won ? 'YOUR CONSTELLATION IS CALLING' : 'EVERY STAR STARTS SOMEWHERE'}
              </p>
              <h2>{result.won ? 'Quest cleared.' : 'Another orbit?'}</h2>
              <p>
                {result.won
                  ? 'One preorder access, earned by you.'
                  : 'You’re getting closer. Take another free run, or try the untimed challenge.'}
              </p>
              {result.won ? (
                <>
                  <div className="access-ticket">
                    <span>ASTRAL KIN / SERIES 01</span>
                    <strong>+1 PREORDER ACCESS</strong>
                    <small>Valid for 15 minutes · Subject to availability</small>
                  </div>
                  <Link className="button primary" href="/checkout">
                    Claim preorder slot <ArrowUpRight size={19} />
                  </Link>
                </>
              ) : (
                <button className="button primary" onClick={start}>
                  Try again <RotateCcw size={18} />
                </button>
              )}
            </div>
          ) : mode === 'lore' && session ? (
            <div className="lore-panel">
              <p className="eyebrow">UNTIMED CHALLENGE · {Math.min(answers.length + 1, 3)} / 3</p>
              <h2>{lore[answers.length]?.question || 'Checking your constellation…'}</h2>
              <div className="lore-options">
                {lore[answers.length]?.options.map((option, i) => (
                  <button disabled={busy} key={option} onClick={() => answer(i)}>
                    <span>0{i + 1}</span>
                    {option}
                    <ArrowRight size={17} />
                  </button>
                ))}
              </div>
              <p className="fine">
                Take all the time you need. Answers are in the drop’s “How it works” story.
              </p>
            </div>
          ) : (
            <>
              <div className="star-field" />
              <div className="arena-horizon">
                <i />
                <i />
                <i />
              </div>
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
                  <KinArt id="nova" />
                </div>
              </div>
              {!running && !session ? (
                <div className="arena-intro">
                  <div className="quest-orbit">✧</div>
                  <span className="eyebrow">30 SECONDS. YOUR OWN LITTLE ODYSSEY.</span>
                  <h2>Follow the light.</h2>
                  <p>
                    Collect {questConfig.requiredScore} fragments.
                    <br />
                    Avoid the shadows. Find your way in.
                  </p>
                  <button className="button primary" disabled={busy} onClick={start}>
                    Start quest <Play size={17} />
                  </button>
                </div>
              ) : countdown > 0 && running ? (
                <div className="countdown">{countdown}</div>
              ) : paused ? (
                <div className="arena-intro">
                  <h2>Take a breath.</h2>
                  <button className="button primary" onClick={() => setPaused(false)}>
                    Resume <Play size={18} />
                  </button>
                </div>
              ) : null}
              {running && (
                <div className="game-hud">
                  <div>
                    <span>FRAGMENTS</span>
                    <strong>
                      {score.toString().padStart(2, '0')}{' '}
                      <small>/ {questConfig.requiredScore}</small>
                    </strong>
                  </div>
                  <div>
                    <span>TIME LEFT</span>
                    <strong>
                      {Math.ceil(questConfig.duration - tick)
                        .toString()
                        .padStart(2, '0')}
                      <small>s</small>
                    </strong>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Pause quest"
                    onClick={() => setPaused(!paused)}
                  >
                    <Pause size={19} />
                  </button>
                </div>
              )}
            </>
          )}
          {mode === 'lore' && !session && !result && (
            <div className="lore-panel">
              <span className="eyebrow">SAME ACCESS. YOUR OWN PACE.</span>
              <h2>
                A thoughtful
                <br />
                kind of quest.
              </h2>
              <p>
                Three questions about the LoopBox journey.
                <br />
                No timer. No reflexes required.
              </p>
              <button className="button primary" disabled={busy} onClick={start}>
                Start lore challenge <ArrowRight size={18} />
              </button>
            </div>
          )}
          <div className="arena-footer">
            <span>01 — THE FIRST CONSTELLATION</span>
            <span>LOOPBOX ORIGINALS</span>
          </div>
        </div>
        <aside className="quest-aside">
          <span className="eyebrow">MISSION BRIEF</span>
          <h2>
            A place,
            <br />
            earned by play.
          </h2>
          <p>
            Complete either challenge to unlock one blind-box preorder. The collectible remains a
            surprise.
          </p>
          <div className="mission-rules">
            <div>
              <span className="fragment-icon">✧</span>
              <p>
                Gather fragments<small>+1 each · Reach {questConfig.requiredScore}</small>
              </p>
            </div>
            <div>
              <span className="hazard-icon">◇</span>
              <p>
                Avoid shadows<small>−1 on contact</small>
              </p>
            </div>
            <div>
              <span>↔</span>
              <p>
                Find your lane<small>← → or A / D · Touch controls below</small>
              </p>
            </div>
          </div>
          <div className="mode-switch">
            <span className="eyebrow">CHOOSE YOUR PACE</span>
            <button
              disabled={running || busy}
              className={mode === 'run' ? 'selected' : ''}
              onClick={() => {
                setMode('run');
                setSession(null);
                setResult(null);
              }}
            >
              Fragment run <span>30 sec</span>
            </button>
            <button
              disabled={running || busy}
              className={mode === 'lore' ? 'selected' : ''}
              onClick={() => {
                setMode('lore');
                setSession(null);
                setResult(null);
              }}
            >
              Untimed lore challenge <span>Accessible</span>
            </button>
          </div>
          <p className="fine">
            Always free to retry. Access expires after 15 minutes and does not reserve stock.
          </p>
        </aside>
      </div>
      {running && (
        <div className="touch-controls">
          <button
            aria-label="Move left"
            disabled={paused}
            onClick={() => move(laneRef.current - 1)}
          >
            <ArrowLeft /> Move left
          </button>
          <button
            aria-label="Move right"
            disabled={paused}
            onClick={() => move(laneRef.current + 1)}
          >
            Move right <ArrowRight />
          </button>
        </div>
      )}
    </section>
  );
}
