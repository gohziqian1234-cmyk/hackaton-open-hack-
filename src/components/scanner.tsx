'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, Upload, X } from 'lucide-react';
import { api, messageFor, useLoop } from './provider';
import { Button } from './ui';
import type { CharacterInfo, PhysicalFigure } from '../lib/types';

export type Claimed = { figure: PhysicalFigure; character: CharacterInfo };
type CameraState = 'starting' | 'live' | 'denied' | 'none' | 'insecure' | 'off';
type Decoder = (
  data: Uint8ClampedArray,
  w: number,
  h: number,
  o?: object,
) => { data: string } | null;

let decoder: Promise<Decoder> | null = null;
/** jsQR is only downloaded when someone opens the scanner. */
const loadDecoder = () => (decoder ??= import('jsqr').then((m) => m.default as unknown as Decoder));

function decodeCanvas(decode: Decoder, canvas: HTMLCanvasElement, attemptBoth = false) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return decode(img.data, img.width, img.height, {
    inversionAttempts: attemptBoth ? 'attemptBoth' : 'dontInvert',
  })?.data;
}

/** Pulls the claim code out of whatever a QR contained (the claim URL, or a bare code). */
export const codeFromQr = (text: string) => text.trim();

/**
 * "Add more": scan the QR on a physical figure (camera), or upload a photo of it, or type the
 * code. Every failure says what happened and what to try next.
 */
export function ScannerSheet({
  open,
  onClose,
  onClaimed,
}: {
  open: boolean;
  onClose: () => void;
  onClaimed: (c: Claimed) => void;
}) {
  const { refresh } = useLoop();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const [camera, setCamera] = useState<CameraState>('off');
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const claim = useCallback(
    async (raw: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setMessage('');
      try {
        const result = await api<Claimed>({ action: 'claimPhysical', code: raw });
        await refresh().catch(() => {});
        stop();
        onClaimed(result);
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        setMessage(
          code === 'SIGN_IN_REQUIRED'
            ? 'Sign in first, then scan again.'
            : code === 'RATE_LIMITED'
              ? 'Too many tries in a minute. Wait a moment, then try again.'
              : messageFor(code),
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [onClaimed, refresh, stop],
  );

  const startCamera = useCallback(async () => {
    setMessage('');
    if (!window.isSecureContext) {
      setCamera('insecure');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('none');
      return;
    }
    setCamera('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
      }
      setCamera('live');
    } catch (e) {
      const name = (e as { name?: string }).name;
      setCamera(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'none');
    }
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      loadDecoder();
      const frame = requestAnimationFrame(() => {
        startCamera();
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!open && d.open) d.close();
  }, [open, startCamera]);

  // Scan about eight frames a second while the camera is live.
  useEffect(() => {
    if (camera !== 'live') return;
    let alive = true;
    const tick = async () => {
      const v = video.current,
        c = canvas.current;
      if (!alive || !v || !c) return;
      if (v.readyState >= 2 && v.videoWidth && !busyRef.current) {
        const scale = Math.min(1, 640 / v.videoWidth);
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        c.getContext('2d', { willReadFrequently: true })?.drawImage(v, 0, 0, c.width, c.height);
        const found = decodeCanvas(await loadDecoder(), c);
        if (found) await claim(codeFromQr(found));
      }
      if (alive) setTimeout(tick, 125);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [camera, claim]);

  useEffect(() => stop, [stop]);

  const fromPhoto = async (file: File | undefined) => {
    if (!file || !canvas.current) return;
    setMessage('');
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const c = canvas.current;
      c.width = Math.round(bitmap.width * scale);
      c.height = Math.round(bitmap.height * scale);
      c.getContext('2d', { willReadFrequently: true })?.drawImage(bitmap, 0, 0, c.width, c.height);
      const found = decodeCanvas(await loadDecoder(), c, true);
      if (found) await claim(codeFromQr(found));
      else
        setMessage(
          'We couldn’t find a QR code in that photo. Get the whole code in frame, in good light, or type the code instead.',
        );
    } catch {
      setMessage('That file couldn’t be read as a photo. Try a JPEG or PNG.');
    }
  };

  const cameraNote: Record<CameraState, string> = {
    off: '',
    starting: 'Starting the camera…',
    live: 'Point your camera at the QR code on your figure’s base or box.',
    denied:
      'Camera access is blocked. Allow the camera for this site in your browser’s address bar (the camera or lock icon), then try again — or upload a photo or type the code below.',
    none: 'No camera found on this device. Upload a photo of the QR code or type the code below.',
    insecure:
      'The camera only works on a secure (https) connection. Upload a photo of the QR code or type the code below.',
  };

  return (
    <dialog
      ref={dialog}
      className="dialog scanner"
      aria-labelledby="scan-title"
      onClose={() => {
        stop();
        setCamera('off');
        setManual(false);
        setMessage('');
        onClose();
      }}
    >
      <h2 id="scan-title">Add a physical figure</h2>
      <div className={'scan-view' + (camera === 'live' ? ' live' : '')}>
        <video ref={video} playsInline muted aria-hidden="true" />
        <span className="scan-frame" aria-hidden="true" />
        {camera !== 'live' && (
          <span className="scan-idle" aria-hidden="true">
            <Camera size={36} />
          </span>
        )}
      </div>
      <canvas ref={canvas} hidden />
      <p
        className={'scan-note' + (['denied', 'none', 'insecure'].includes(camera) ? ' warn' : '')}
        role="status"
      >
        {cameraNote[camera]}
      </p>
      {(camera === 'denied' || camera === 'none') && (
        <Button variant="ghost" onClick={startCamera}>
          Try the camera again
        </Button>
      )}
      {message && (
        <p className="scan-error" role="alert">
          {message}
        </p>
      )}
      <div className="scan-fallbacks">
        <label className="btn btn-ghost scan-upload">
          <Upload size={18} aria-hidden="true" /> Upload a photo of the QR
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              fromPhoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <Button variant="ghost" onClick={() => setManual((m) => !m)} aria-expanded={manual}>
          <Keyboard size={18} aria-hidden="true" /> Enter code manually
        </Button>
      </div>
      {manual && (
        <form
          className="scan-manual"
          onSubmit={(e) => {
            e.preventDefault();
            claim(code);
          }}
        >
          <label>
            Code on the figure’s card
            <input
              name="figureCode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="26 letters and numbers"
              maxLength={300}
            />
          </label>
          <Button type="submit" disabled={busy || !code.trim()}>
            {busy ? 'Checking…' : 'Add figure'}
          </Button>
        </form>
      )}
      <button
        type="button"
        className="dialog-close icon-btn"
        aria-label="Close scanner"
        onClick={() => dialog.current?.close()}
      >
        <X size={22} />
      </button>
    </dialog>
  );
}
