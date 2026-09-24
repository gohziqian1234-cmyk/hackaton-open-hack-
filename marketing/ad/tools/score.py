"""Synthesizes the LoopBox ad soundtrack (music + SFX) and places the VO lines, from timeline.json.

Usage: python score.py <vo_dir_48k> <out_dir>
Writes music.wav (stereo) and vo.wav (mono), both 48 kHz float32 WAV, aligned to the picture.
Everything is generated from code (numpy only): no samples, no third-party audio.
"""
import json, sys, wave
from pathlib import Path
import numpy as np

SR = 48000
HERE = Path(__file__).resolve().parent
TL = json.loads((HERE.parent / "timeline.json").read_text())
END = TL["end"] + 0.4
N = int(END * SR)
S = {k: v[0] for k, v in TL["shots"].items()}
BEAT = 60 / 116
rng = np.random.default_rng(7)

L = np.zeros(N); R = np.zeros(N)  # music bus


def t_(d): return np.arange(int(d * SR)) / SR
def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))
def env(n, a, d, s=0.0, r=0.0, hold=None):
    """ADSR in seconds over n samples (hold = sustain time; default fills)."""
    e = np.zeros(n); A, D, Rr = int(a * SR), int(d * SR), int(r * SR)
    H = n - A - D - Rr if hold is None else int(hold * SR)
    H = max(H, 0)
    seq = [np.linspace(0, 1, A, endpoint=False), np.linspace(1, s, D, endpoint=False), np.full(H, s), np.linspace(s, 0, Rr)]
    c = np.concatenate(seq)[:n]; e[: len(c)] = c
    return e
def hz(note):  # MIDI -> Hz
    return 440.0 * 2 ** ((note - 69) / 12)
def fft_filter(x, lo=None, hi=None, slope=4):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); g = np.ones_like(f)
    if hi: g *= 1 / (1 + (f / hi) ** slope)
    if lo: g *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** slope)
    return np.fft.irfft(X * g, len(x))
def sweep_filter(x, lo_path, hi_path, block=2048):
    """Time-varying band filter by windowed overlap-add; lo/hi are functions of time (s)."""
    out = np.zeros(len(x) + block); win = np.hanning(block); hop = block // 2
    for i in range(0, len(x), hop):
        seg = x[i:i + block]
        if len(seg) < block: seg = np.pad(seg, (0, block - len(seg)))
        tt = i / SR
        out[i:i + block] += fft_filter(seg * win, lo_path(tt), hi_path(tt))
    return out[: len(x)]
def saw(f, d, harmonics=24, detune=0.0):
    tt = t_(d); y = np.zeros_like(tt)
    for k in range(1, harmonics + 1):
        if f * k > SR / 2.2: break
        y += np.sin(2 * np.pi * f * k * tt * (1 + detune)) / k
    return y * 0.6
def noise(d): return rng.standard_normal(int(d * SR))
def reverb(x, secs=2.2, wet=0.3, bright=6000):
    ir = noise(secs) * np.exp(-t_(secs) * 6.9 / secs); ir = fft_filter(ir, 200, bright); ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    n = len(x) + len(ir); y = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[: len(x) + len(ir) - 1]
    out = np.zeros(len(y)); out[: len(x)] += x * (1 - wet); out += y * wet * 0.5
    return out

# ---- instruments --------------------------------------------------------------------------
def kick(g=1.0):
    d = 0.42; tt = t_(d); f = 44 + 90 * np.exp(-tt * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-tt * 7.5) + 0.25 * fft_filter(noise(d), 1500, 6000) * np.exp(-tt * 120)
    return np.tanh(y * 1.6) * g
def clap():
    d = 0.3; y = np.zeros(int(d * SR))
    for k, off in enumerate([0, 0.011, 0.022]):
        b = noise(0.25) * np.exp(-t_(0.25) * (60 if k < 2 else 16)); i = int(off * SR); y[i:i + len(b)] += b[: len(y) - i]
    return fft_filter(y, 900, 5000, 2) * 0.55
def hat(open_=False):
    d = 0.25 if open_ else 0.06; return fft_filter(noise(d), 7000, None, 2) * np.exp(-t_(d) * (14 if open_ else 70)) * 0.22
def bass(note, d):
    y = fft_filter(saw(hz(note), d, 12), None, 700, 2) + 0.5 * np.sin(2 * np.pi * hz(note) * t_(d))
    return np.tanh(y * 1.4) * env(len(y), 0.005, 0.12, 0.6, 0.05) * 0.5
def pluck(note, d=0.35, bright=1.0):
    tt = t_(d); f = hz(note); y = np.zeros_like(tt)
    for k in range(1, 9): y += np.sin(2 * np.pi * f * k * tt) * np.exp(-tt * (6 + k * 5 / bright)) / k
    return y * env(len(tt), 0.002, 0.05, 0.7, 0.05) * 0.35
def pad(notes, d, cutoff=1800, att=0.8, rel=1.2):
    y = sum(saw(hz(n), d, 16, dt) for n in notes for dt in (-0.004, 0.004))
    return fft_filter(y, 80, cutoff, 2) * env(len(y), att, 0.3, 0.85, rel) * 0.09
def bell(note, d=1.6, g=0.4):
    tt = t_(d); f = hz(note)
    y = sum(a * np.sin(2 * np.pi * f * m * tt) * np.exp(-tt * dec) for m, a, dec in [(1, 1, 3), (2.76, 0.5, 5), (5.4, 0.25, 8), (8.93, 0.12, 11)])
    return y * env(len(tt), 0.002, 0.02, 1, 0.1) * g
def whoosh(d, f0, f1, g=0.4):
    x = noise(d); x = sweep_filter(x, lambda tt: f0 + (f1 - f0) * tt / d * 0.5, lambda tt: f0 * 2 + (f1 - f0) * tt / d)
    return x * np.sin(np.pi * np.linspace(0, 1, len(x))) ** 1.5 * g
def riser(d, g=0.35):
    x = noise(d); y = sweep_filter(x, lambda tt: 300 + 3000 * (tt / d) ** 2, lambda tt: 800 + 9000 * (tt / d) ** 2)
    tone = saw(hz(45), d, 20) * 0.0
    tt = t_(d); f = 110 * 2 ** (3 * tt / d); tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return (y + tone[: len(y)]) * (tt[: len(y)] / d) ** 2 * g
def impact(g=1.0, dark=False):
    d = 1.6; tt = t_(d); f = 38 + 60 * np.exp(-tt * 18)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 3.2)
    crack = fft_filter(noise(d), 60, 1800 if dark else 5000, 2) * np.exp(-tt * 10)
    return np.tanh((sub + 0.7 * crack) * 1.5) * g
def glass(g=0.6):
    d = 1.4; tt = t_(d); y = fft_filter(noise(d), 2500, None, 2) * np.exp(-tt * 9) * 0.6
    for k in range(40):
        f = 2500 + rng.random() * 7000; at = rng.random() * 0.25; i = int(at * SR)
        tt2 = np.arange(len(y) - i) / SR
        y[i:] += np.sin(2 * np.pi * f * tt2) * np.exp(-tt2 * (12 + rng.random() * 25)) * 0.08
    return y * g
def tick(g=0.25): return fft_filter(noise(0.02), 2000, 9000, 2) * np.exp(-t_(0.02) * 300) * g
def blip(note, g=0.18): tt = t_(0.12); return np.sin(2 * np.pi * hz(note) * tt) * np.exp(-tt * 30) * g + np.sin(4 * np.pi * hz(note) * tt) * np.exp(-tt * 45) * g * 0.3

# ---- the score ----------------------------------------------------------------------------
# S1 hook (0–2.45): dark drone, shimmer, dust sparkles
add(pad([33, 40, 45], S["s2"] + 0.5, 600, 0.6, 0.5), 0, 1.2)
add(np.sin(2 * np.pi * 55 * t_(2.9)) * env(int(2.9 * SR), 0.5, 0.2, 0.8, 0.6) * 0.18, 0)
for i in range(10): add(bell(81 + [0, 4, 7, 12, 16][i % 5], 1.2, 0.05), 0.2 + i * 0.21, 1, (i % 3 - 1) * 0.6)
add(whoosh(1.2, 200, 4000, 0.35), S["s2"] - 0.9)

# S2 problem (2.45–7.23): uneasy low cluster, clock ticks, a hit on every quick cut, scratches on the strike
d2 = S["s3"] - S["s2"]
add(pad([34, 35, 41], d2 + 0.3, 900, 0.3, 0.3), S["s2"], 1.4)
for k in range(int(d2 / 0.5)): add(tick(0.22 if k % 2 else 0.3), S["s2"] + 0.1 + k * 0.5, 1, 0.3 if k % 2 else -0.3)
for c in [1.75, 2.15, 2.55, 2.95, 3.35]:
    add(impact(0.55, dark=True), S["s2"] + c); add(whoosh(0.25, 800, 5000, 0.2), S["s2"] + c - 0.12)
for i in range(3):
    sc = sweep_filter(noise(0.3), lambda tt: 1500 + tt * 8000, lambda tt: 4000 + tt * 12000) * np.exp(-t_(0.3) * 9) * 0.5
    add(sc, S["s2"] + 3.8 + i * 0.14, 1, (i - 1) * 0.5)
add(riser(S["s3"] - (S["s2"] + 3.9) + 0.1, 0.3), S["s2"] + 3.9)

# S3 switch (7.23–9.64): glass shatter, streak riser, logo lands on a bright hit
add(impact(0.9), S["s3"] + 0.02); add(glass(0.7), S["s3"] + 0.02, 1, 0.1)
add(riser(1.1, 0.3), S["s3"] + 0.25)
logo_t = S["s3"] + 1.18
add(impact(0.7), logo_t); add(reverb(bell(69, 2.0, 0.35), 2.5, 0.45), logo_t, 1, -0.1); add(reverb(bell(76, 2.0, 0.25), 2.5, 0.45), logo_t + 0.02, 1, 0.1)
add(pad([57, 61, 64, 69], S["s4"] - logo_t + 0.4, 2600, 0.05, 0.4), logo_t, 1.2)

# Groove sections: 116 BPM, A major (A – E – F#m – D)
PROG = [(45, [57, 61, 64]), (40, [56, 59, 64]), (42, [57, 61, 66]), (38, [57, 62, 66])]
def groove(t0, t1, drums=True, full=True):
    nb = int((t1 - t0) / BEAT + 1e-6)
    for b in range(nb):
        bt = t0 + b * BEAT; root, triad = PROG[(b // 4) % 4]
        if drums:
            add(kick(0.9), bt)
            if b % 2 == 1: add(clap(), bt, 1, 0.05)
            add(hat(), bt + BEAT / 2, 1, 0.35); add(hat(), bt, 0.6, -0.35)
            if b % 4 == 3: add(hat(True), bt + BEAT * 0.75, 0.8, 0.4)
        for e in range(2): add(bass(root + (12 if e else 0), BEAT / 2 * 0.95), bt + e * BEAT / 2)
        if full:
            arp = [triad[0] + 12, triad[1] + 12, triad[2] + 12, triad[1] + 12]
            for q in range(4): add(pluck(arp[q], 0.3), bt + q * BEAT / 4, 0.9, (q % 2 - 0.5) * 0.7)
        if b % 4 == 0: add(pad(triad, BEAT * 4 + 0.2, 2200, 0.05, 0.3), bt, 0.9)

# S4 game (9.64–12.27): groove kicks in, pickups on the beat, win chime
groove(S["s4"], S["s5a"] - 0.02, drums=True, full=False)
g0 = S["s4"] + 0.85
for k in range(int((S["s5a"] - 0.75 - g0) / BEAT) + 1): add(blip(81 + [0, 4, 7, 12][k % 4]), g0 + k * BEAT, 1, (k % 3 - 1) * 0.4)
win_t = S["s5a"] - 0.75
for i, n in enumerate([69, 73, 76, 81, 85]): add(bell(n, 1.0, 0.16), win_t + i * 0.06, 1, (i - 2) * 0.3)
add(impact(0.4), win_t)

# S5a reveal (12.27–15.84): the beat drops out; tension, crack, slow-motion explosion, shimmer
explode = S["s5a"] + 1.0
add(pad([45, 52, 57], S["s5b"] - S["s5a"] + 0.3, 1400, 0.1, 0.8), S["s5a"], 1.3)
add(riser(explode - S["s5a"], 0.35), S["s5a"])
for i in range(6): add(tick(0.2), S["s5a"] + 0.45 + i * 0.09, 1, (i % 2 - 0.5) * 0.6)
add(impact(1.0), explode); add(glass(0.5), explode, 1, -0.2)
shim = sum(reverb(bell(n, 2.5, 0.12), 3.0, 0.55) for n in [81, 85, 88, 93])
add(shim, explode + 0.05)
for i in range(14): add(bell(88 + [0, 3, 5, 7, 10, 12][i % 6], 0.8, 0.03), explode + 0.3 + i * 0.12, 1, np.sin(i) * 0.7)
add(reverb(bell(69, 3.0, 0.3), 3.0, 0.5), explode + 1.1)

# S5b collection + trade (15.84–20.02): groove back, tap, card whoosh, snap, match chime
groove(S["s5b"], S["s6"])
add(tick(0.35), S["s5b"] + 0.8)
trade_t = S["s5b"] + 1.45
add(whoosh(0.6, 400, 6000, 0.35), trade_t - 0.1)
add(impact(0.45), trade_t + 0.75); add(tick(0.4), trade_t + 0.75)
for i, n in enumerate([76, 81, 85, 88]): add(bell(n, 1.2, 0.14), trade_t + 1.2 + i * 0.07, 1, (i - 1.5) * 0.4)

# S6 production (20.02–23.35): groove continues; manifest ticks, whoosh into printer, printer whir
groove(S["s6"], S["s7a"])
for i in range(16): add(tick(0.12), S["s6"] + 0.4 + i * 0.06, 1, 0.2)
add(whoosh(0.6, 300, 5000, 0.3), S["s6"] + 1.4)
wd = S["s7a"] - (S["s6"] + 1.95); tt = t_(wd)
whir = (np.sin(2 * np.pi * (180 + 30 * np.sin(2 * np.pi * 11 / (2 * np.pi) * tt)) * tt) * 0.5 + fft_filter(noise(wd), 1500, 4000) * 0.3) * env(len(tt), 0.1, 0.1, 0.8, 0.2) * 0.12
add(whir, S["s6"] + 1.95)
for i in range(int(wd / 0.13)): add(tick(0.06), S["s6"] + 1.95 + i * 0.13, 1, 0.5)

# S7a system chain (23.35–26.52): groove, a pop per node; cut to the empty warehouse on a big hit
cut = TL["shots"]["s7b"][0] - 0.95
groove(S["s7a"], cut)
step = min(0.44, (cut - S["s7a"] - 0.2) / 5)
for i in range(5): add(bell([69, 73, 76, 81, 85][i], 0.6, 0.12), S["s7a"] + i * step + 0.05, 1, (i - 2) * 0.3)
add(impact(0.9), cut); add(reverb(pad([45, 52, 57, 64], 1.2, 1200, 0.01, 0.8), 2.5, 0.5), cut, 1.0)

# S7b end frame (26.52–end): warm A-major add9 resolve, logo ding, soft tail
e0 = S["s7b"]
add(pad([45, 57, 61, 64, 71], END - e0, 3000, 0.4, 1.8), e0, 1.4)
add(reverb(bell(81, 3.0, 0.25), 3.0, 0.5), e0 + 0.05, 1, -0.15); add(reverb(bell(88, 3.0, 0.14), 3.0, 0.5), e0 + 0.12, 1, 0.15)
for i, n in enumerate([69, 73, 76, 81, 76, 73]): add(pluck(n, 0.6, 0.6), e0 + 1.0 + i * BEAT / 2, 0.7, (i % 2 - 0.5) * 0.5)
add(np.sin(2 * np.pi * 55 * t_(END - e0)) * env(int((END - e0) * SR), 0.3, 0.2, 0.7, 1.5) * 0.12, e0)

# master fade and gentle glue
fade = np.ones(N); fn = int(1.2 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 2
M = np.stack([L, R]) * fade
M = np.tanh(M / (np.max(np.abs(M)) + 1e-9) * 1.3) * 0.7

# ---- VO: place each line at its start ---------------------------------------------------------
vo_dir, out = Path(sys.argv[1]), Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
VO = np.zeros(N)
def read_wav(p):
    with wave.open(str(p)) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1, p
        raw = w.readframes(w.getnframes())
        return np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768 if w.getsampwidth() == 2 else np.frombuffer(raw, dtype=np.float32).astype(np.float64)
for i, v in enumerate(TL["vo"], 1):
    x = read_wav(vo_dir / f"vo-{i}.wav"); j = int(v["start"] * SR); x = x[: N - j]; VO[j:j + len(x)] += x
VO = reverb(VO, 0.6, 0.07, 5000)[:N]
def write(p, data):
    data = np.atleast_2d(data); pcm = (np.clip(data.T, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(p), "wb") as w:
        w.setnchannels(data.shape[0]); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
write(out / "music.wav", M); write(out / "vo.wav", VO / (np.max(np.abs(VO)) + 1e-9) * 0.9)
print("ok", N / SR, "s")
