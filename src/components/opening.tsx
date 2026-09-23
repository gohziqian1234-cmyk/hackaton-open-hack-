'use client';
// The only loud moment in LoopBox. Presentation only: the character always comes from the server
// before any of this animates. CSS 3D for the box and pack, one <canvas> for blade and particles,
// and only transform/opacity are animated.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { LogoMark } from './shell';
import { Button, Tier } from './ui';
import { CharacterImage, ConceptBadge, ConceptCaption } from './character-image';
import { getCharacterImage } from '../lib/images';
import { splitAlong, validSlice } from '../lib/slice';
import type { CharacterInfo, ThemeInfo } from '../lib/types';

type Stage = 'box' | 'drawing' | 'opening' | 'pack' | 'slicing' | 'reveal';
type Pt = { x: number; y: number; t: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
};
type Half = { clip: string; dx: number; dy: number; rot: number };

const OPEN_MS = 1300; // squash, stretch, three shakes, lid off, burst
const HIT_STOP_MS = 80;
const SPLIT_MS = 750;
const HINT_AFTER_MS = 5000;

/** Tiny synthesised sounds (no files). Off unless the collector turns sound on. */
function useSound(on: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  return useCallback(
    (kind: 'tap' | 'tear' | 'reveal' | 'secret') => {
      if (!on) return;
      try {
        ctx.current ??= new AudioContext();
        const ac = ctx.current;
        const o = ac.createOscillator(),
          g = ac.createGain();
        const f = { tap: 220, tear: 520, reveal: 660, secret: 880 }[kind];
        o.type = kind === 'tear' ? 'sawtooth' : 'triangle';
        o.frequency.setValueAtTime(f, ac.currentTime);
        o.frequency.exponentialRampToValueAtTime(
          f * (kind === 'tap' ? 0.6 : 1.8),
          ac.currentTime + 0.25,
        );
        g.gain.setValueAtTime(0.12, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
        o.connect(g).connect(ac.destination);
        o.start();
        o.stop(ac.currentTime + 0.4);
      } catch {
        // Audio is decoration only.
      }
    },
    [on],
  );
}

function preload(srcs: string[]) {
  return Promise.all(
    srcs.filter(Boolean).map(
      (src) =>
        new Promise<void>((done) => {
          const img = new Image();
          img.onload = img.onerror = () => done();
          img.src = src;
          setTimeout(done, 2500);
        }),
    ),
  );
}

export function OpeningSequence({
  theme,
  character: given,
  capacity,
  requestDraw,
  startAt = 'box',
  animateReveal = true,
  onComplete,
  onTrade,
  keepHref,
  onKeep,
  keepLabel = 'Keep it — go to checkout',
  tradeLabel = 'Trade it',
  tradeHref,
  children,
}: {
  theme: ThemeInfo | null;
  /** The drawn character, when already known (legacy reveal, QR claim). */
  character: CharacterInfo | null;
  capacity: number;
  /** Asks the server for the draw. Called on the first tap, before anything animates. */
  requestDraw?: () => Promise<CharacterInfo | null>;
  startAt?: 'box' | 'reveal';
  /** false = show the final frame straight away (revisiting an opened box). */
  animateReveal?: boolean;
  onComplete?: (c: CharacterInfo) => void;
  onTrade?: () => void;
  keepHref?: string;
  /** Button instead of a link for the primary action (e.g. close the QR reveal). */
  onKeep?: () => void;
  keepLabel?: string;
  tradeLabel?: string;
  tradeHref?: string;
  /** Extra reveal content (duplicate note, save card). */
  children?: ReactNode;
}) {
  const [stage, setStage] = useState<Stage>(startAt === 'reveal' ? 'reveal' : 'box');
  const [character, setCharacter] = useState<CharacterInfo | null>(given);
  const [reduced, setReduced] = useState(false);
  const [sound, setSound] = useState(false);
  const [halves, setHalves] = useState<Half[] | null>(null);
  const [wobble, setWobble] = useState(0);
  const [hint, setHint] = useState('Swipe across the pack to tear it open');
  const [tearButton, setTearButton] = useState(false);
  const [wide, setWide] = useState(false);
  const [revealAnim, setRevealAnim] = useState(animateReveal);
  const play = useSound(sound);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pack = useRef<HTMLDivElement>(null);
  const boxButton = useRef<HTMLButtonElement>(null);
  const keyboard = useRef(false);
  const stroke = useRef<Pt[]>([]);
  const drawing = useRef(false);
  const particles = useRef<Particle[]>([]);
  const trail = useRef<Pt[]>([]);
  const raf = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const accent = theme?.accent ?? '#FFD84D';
  const accent2 = theme?.accent_secondary ?? '#5EEAD4';
  const rarity = (character?.rarity ?? 'COMMON').toLowerCase();
  const slow = rarity === 'secret' ? 1.5 : 1;

  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const w = matchMedia('(min-width: 900px)');
    const sync = () => {
      setReduced(m.matches);
      setWide(w.matches);
    };
    const frame = requestAnimationFrame(sync);
    m.addEventListener('change', sync);
    w.addEventListener('change', sync);
    const list = timers.current;
    return () => {
      cancelAnimationFrame(frame);
      m.removeEventListener('change', sync);
      w.removeEventListener('change', sync);
      list.forEach(clearTimeout);
      cancelAnimationFrame(raf.current);
    };
  }, []);
  useEffect(() => {
    if (stage === 'box') boxButton.current?.focus({ preventScroll: true });
    // Keyboard users land on the pack; pointer users don't get a focus ring on it.
    if (stage === 'pack' && keyboard.current) pack.current?.focus({ preventScroll: true });
  }, [stage]);
  useEffect(() => {
    // Full-screen moment: hide the site chrome behind it (also from keyboard and screen readers).
    document.body.classList.add('os-open');
    return () => document.body.classList.remove('os-open');
  }, []);

  // ---- canvas: blade trail + particles --------------------------------------------------------
  const kick = useCallback(() => {
    if (raf.current) return;
    const frame = () => {
      const c = canvas.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) {
        raf.current = 0;
        return;
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(innerWidth * dpr)) {
        c.width = Math.round(innerWidth * dpr);
        c.height = Math.round(innerHeight * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const now = performance.now();
      trail.current = trail.current.filter((p) => now - p.t < 200);
      const pts = trail.current;
      for (let i = 1; i < pts.length; i++) {
        const age = (now - pts[i].t) / 200;
        const w = (1 - age) * (i / pts.length) * 14 + 1;
        ctx.lineCap = 'round';
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 1 - age;
        ctx.lineWidth = w + 6;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = w;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      particles.current = particles.current.filter((p) => p.life < p.max);
      for (const p of particles.current) {
        p.life++;
        p.vy += 0.18;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      raf.current =
        pts.length || particles.current.length || drawing.current
          ? requestAnimationFrame(frame)
          : 0;
    };
    raf.current = requestAnimationFrame(frame);
  }, [accent]);

  const burst = useCallback(
    (x: number, y: number, n: number, spread = 9) => {
      const colors = [accent, accent2, '#F5C542', '#FFFFFF'];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2,
          v = 2 + Math.random() * spread;
        particles.current.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 4,
          life: 0,
          max: 50 + Math.random() * 40,
          size: 6 + Math.random() * 8,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.4,
          color: colors[i % colors.length],
        });
      }
      kick();
    },
    [accent, accent2, kick],
  );

  // ---- stages ----------------------------------------------------------------------------------
  const ensureCharacter = useCallback(async () => {
    if (character) return character;
    if (!requestDraw) return null;
    setStage('drawing');
    const c = await requestDraw();
    if (!c) {
      setStage('box');
      return null;
    }
    const imgs = (['card', 'hero'] as const).map(
      (v) => getCharacterImage(theme?.slug ?? c.campaign_id, c.slug ?? c.id, v).src,
    );
    await preload(imgs.filter((s) => s && !s.startsWith('data:')));
    setCharacter(c);
    return c;
  }, [character, requestDraw, theme]);

  const toReveal = useCallback(
    (c: CharacterInfo, animate: boolean) => {
      setRevealAnim(animate && !reduced);
      setStage('reveal');
      play(c.rarity === 'SECRET' ? 'secret' : 'reveal');
      onComplete?.(c);
      if (animate && !reduced) {
        const r = root.current?.getBoundingClientRect();
        later(
          () =>
            burst(
              (r?.width ?? innerWidth) / 2,
              (r?.height ?? innerHeight) * 0.42,
              c.rarity === 'SECRET' ? 120 : 60,
              11,
            ),
          c.rarity === 'SECRET' ? 350 : 200,
        );
      }
    },
    [burst, onComplete, play, reduced],
  );

  const tapBox = async (e: React.MouseEvent) => {
    if (stage !== 'box') return;
    // detail is 0 when Enter or Space activated the button.
    keyboard.current = e.detail === 0;
    play('tap');
    const c = await ensureCharacter();
    if (!c) return;
    if (reduced) {
      setStage('pack');
      return;
    }
    setStage('opening');
    const r = boxButton.current?.getBoundingClientRect();
    later(() => r && burst(r.left + r.width / 2, r.top + r.height * 0.3, 40, 8), 850);
    later(() => {
      setStage('pack');
      later(() => setTearButton(true), HINT_AFTER_MS);
    }, OPEN_MS);
  };

  const tear = useCallback(
    async (entry?: [number, number], exit?: [number, number]) => {
      const c = character;
      const el = pack.current;
      if (!c || !el || stage !== 'pack') return;
      if (reduced) {
        toReveal(c, false);
        return;
      }
      const r = el.getBoundingClientRect();
      const w = el.offsetWidth,
        h = el.offsetHeight;
      const a = entry ?? [-10, h * 0.42];
      const b = exit ?? [w + 10, h * 0.5];
      // Map from the (rotated) bounding box back into the pack's own box.
      const sx = w / r.width,
        sy = h / r.height;
      const pa: [number, number] = entry ? [a[0] * sx, a[1] * sy] : a;
      const pb: [number, number] = exit ? [b[0] * sx, b[1] * sy] : b;
      setStage('slicing');
      play('tear');
      navigator.vibrate?.(30);
      later(() => {
        setHalves(
          splitAlong(w, h, pa, pb).map((s, i) => ({
            clip: s.clip,
            dx: s.dx * 90,
            dy: s.dy * 40,
            rot: (i ? -1 : 1) * (10 + Math.random() * 10),
          })),
        );
        burst(r.left + r.width / 2, r.top + r.height / 2, 90, 10);
      }, HIT_STOP_MS);
      later(() => toReveal(c, true), HIT_STOP_MS + SPLIT_MS);
    },
    [burst, character, play, reduced, stage, toReveal],
  );

  const skip = async () => {
    const c = await ensureCharacter();
    if (c) toReveal(c, false);
  };

  // ---- swipe -----------------------------------------------------------------------------------
  const onDown = (e: React.PointerEvent) => {
    if (stage !== 'pack' || reduced) return;
    // Buttons (skip, sound, tear instead) keep their normal clicks.
    if ((e.target as HTMLElement).closest('button')) return;
    drawing.current = true;
    stroke.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    trail.current = [...stroke.current];
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    kick();
  };
  const onMove = (e: React.PointerEvent) => {
    const el = pack.current;
    if (el && stage === 'pack') {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--sheen', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
    }
    if (!drawing.current) return;
    const p = { x: e.clientX, y: e.clientY, t: performance.now() };
    stroke.current.push(p);
    trail.current.push(p);
    if (el) {
      const hit = validSlice(stroke.current, el.getBoundingClientRect());
      if (hit) {
        drawing.current = false;
        tear(hit.entry, hit.exit);
      }
    }
  };
  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (stage === 'pack' && stroke.current.length > 2) {
      setWobble((n) => n + 1);
      setHint('Swipe all the way across');
    }
  };

  const shown = stage === 'reveal' && character;
  const heroVariant = wide ? 'hero' : 'card';
  const kicker = theme?.name ?? 'LoopBox';
  return (
    <div
      ref={root}
      className={`opening stage-${stage} rarity-${rarity}${revealAnim ? ' animate' : ''}`}
      style={{
        ['--theme-accent' as string]: accent,
        ['--accent-2' as string]: accent2,
        ['--slow' as string]: slow,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="os-rays" aria-hidden="true" />
      {shown && rarity === 'secret' && revealAnim && (
        <div className="os-flash" aria-hidden="true" />
      )}
      <canvas ref={canvas} className="os-canvas" aria-hidden="true" />
      <button
        type="button"
        className="os-sound"
        aria-pressed={sound}
        onClick={() => setSound((s) => !s)}
      >
        {sound ? (
          <Volume2 size={20} aria-hidden="true" />
        ) : (
          <VolumeX size={20} aria-hidden="true" />
        )}
        <span className="visually-hidden">Sound</span>
      </button>
      {stage !== 'reveal' && (
        <button type="button" className="os-skip" onClick={skip} disabled={stage === 'drawing'}>
          Skip
        </button>
      )}

      {(stage === 'box' || stage === 'drawing' || stage === 'opening') && (
        <div className="os-box-stage">
          <h1 className="visually-hidden">Your {kicker} box</h1>
          <button
            ref={boxButton}
            type="button"
            className="os-box-btn"
            onClick={tapBox}
            disabled={stage !== 'box'}
            aria-label="Open my box"
          >
            <span className="cube-float">
              <span className="cube">
                <span className="face front">
                  <LogoMark />
                  <b>?</b>
                </span>
                <span className="face back" />
                <span className="face left">
                  <b>?</b>
                </span>
                <span className="face right">
                  <small>{kicker}</small>
                </span>
                <span className="face bottom" />
                <span className="lid">
                  <span className="face top" />
                </span>
                <span className="os-light" />
              </span>
            </span>
          </button>
          <p className="os-caption" aria-live="polite">
            {stage === 'drawing' ? 'Drawing your box…' : stage === 'opening' ? '' : 'Tap to open'}
          </p>
        </div>
      )}

      {(stage === 'pack' || stage === 'slicing') && (
        <div className="os-pack-stage">
          <h1 className="visually-hidden">Tear open the foil pack</h1>
          {!halves ? (
            <div
              ref={pack}
              className={'foil' + (wobble ? ' wobble' : '')}
              key={wobble}
              role="button"
              tabIndex={0}
              aria-label="Foil pack. Swipe across it to tear it open, or press Enter to tear it."
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  tear();
                }
              }}
            >
              <FoilFace kicker={kicker} />
            </div>
          ) : (
            <div className="foil-split" ref={pack}>
              {halves.map((h, i) => (
                <div
                  key={i}
                  className="foil-half"
                  style={{
                    clipPath: h.clip,
                    ['--dx' as string]: h.dx + 'px',
                    ['--dy' as string]: h.dy + 'px',
                    ['--rot' as string]: h.rot + 'deg',
                  }}
                >
                  <div className="foil">
                    <FoilFace kicker={kicker} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {stage === 'pack' && (
            <div className="os-hint">
              {!reduced && (
                <span className="os-hand" aria-hidden="true">
                  <span />
                </span>
              )}
              <p aria-live="polite">{reduced ? 'Your pack is ready.' : hint}</p>
              {(reduced || tearButton) && (
                <Button onClick={() => tear()}>
                  {reduced ? 'Tear open' : 'Tap here to tear instead'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {shown && (
        <div className="os-reveal-stage">
          <div className="os-figure">
            <div className="os-ring" aria-hidden="true" />
            <div className="os-figure-img">
              <CharacterImage character={character} theme={theme} variant={heroVariant} eager />
            </div>
          </div>
          <div className="os-copy">
            <p className="visually-hidden" aria-live="polite">
              You got {character.name}, {rarity}.
            </p>
            <Tier rarity={character.rarity} />
            <h1>{character.name}</h1>
            <p className="os-theme">
              {kicker} · 1 of {capacity} made in this drop
            </p>
            <ConceptBadge theme={theme} />
            {theme?.licensed && heroVariant === 'hero' && <ConceptCaption theme={theme} />}
            {children}
            <div className="os-actions">
              {keepHref && <Button href={keepHref}>{keepLabel}</Button>}
              {!keepHref && onKeep && <Button onClick={onKeep}>{keepLabel}</Button>}
              {tradeHref ? (
                <Button href={tradeHref} variant="ghost">
                  {tradeLabel}
                </Button>
              ) : (
                onTrade && (
                  <Button variant="ghost" onClick={onTrade}>
                    {tradeLabel}
                  </Button>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FoilFace({ kicker }: { kicker: string }) {
  return (
    <div className="foil-face">
      <span className="foil-sheen" aria-hidden="true" />
      <span className="foil-logo">
        <LogoMark />
        loopbox
      </span>
      <strong className="foil-title">{kicker}</strong>
      <span className="foil-sub">1 figure inside</span>
      <span className="foil-q" aria-hidden="true">
        ?
      </span>
    </div>
  );
}
