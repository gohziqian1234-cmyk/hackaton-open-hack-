# LoopBox — 30-second ad

| File | What it is |
|---|---|
| `loopbox-ad-9x16.mp4` | Main version: 1080×1920, 30 fps, 30.8 s, H.264 + AAC, mixed to −14 LUFS (Reels, TikTok, Shorts) |
| `loopbox-ad-16x9.mp4` | Same cut at 1920×1080 (YouTube, pitch deck, big screen) |
| `vo/vo-1.wav … vo-9.wav` | The nine voice-over lines as separate files |
| `ad.html` | The animation. Each frame is drawn by `window.render(t)` |
| `timeline.json` | When each voice line and each shot starts, in seconds |
| `tools/` | Scripts that rebuild the video (see below) |

## Shots

1. **Hook:** a matte-black LoopBox box under a spotlight, then a pull-back to rows of boxes. Caption: "SURPRISE IS FUN."
2. **Problem:** a warehouse aisle, an UNSOLD carton, duplicate figures, boxes piling up. Then "GUESS DEMAND → PRODUCE → HOPE" gets struck out.
3. **Switch:** the scene shatters to white and the LoopBox logo forms from gold light streaks.
4. **Game:** a phone shows the Astral Kin drop page (a real app screenshot), then Fragment Run, then "QUEST CLEARED — DROP SLOT UNLOCKED".
5. **Reveal and trade:** the box cracks and explodes to show "RARE — ECLIPSE KNIGHT · Published draw ✓". Next, a collection with a duplicate, "Find a trade", "RARE ⇄ RARE", "MATCH FOUND".
6. **Production:** the final manifest counts up (Nova Scout ×18, Moss Oracle ×14, Eclipse Knight ×11, Aurora Warden ×9), flies into a 3D printer, and the figure prints layer by layer.
7. **System and end frame:** BRAND → LOOPBOX DROP → COLLECTORS → CONFIRMED DEMAND → IN-HOUSE PRODUCTION, then "NO SPECULATIVE OVERSTOCK". End frame: logo, "Keep the surprise. Make only what's wanted.", "Demand-first collectibles".

The ad uses only LoopBox's own Astral Kin characters. The concept drops (Naruto, Edgerunners) are not in it.

## About the voice

The brief asked for ElevenLabs. The build environment couldn't reach ElevenLabs (the network blocked it and there was no API key). The voice is **Kokoro-82M**, voice `af_heart`, at 1.2× speed: a neural text-to-speech voice that ran offline. Music and sound effects are synthesized in `tools/score.py`, with no samples.

### Swapping in an ElevenLabs voice

1. In ElevenLabs, generate the nine lines from `tools/tts.py` as nine separate files. Settings to start from:
   - A warm, confident narrator voice. "Brian", "Adam" and "Rachel" are common picks.
   - Model: Multilingual v2. Stability about 0.45, similarity about 0.8, style about 0.2.
2. Save them as `vo/vo-1.wav … vo-9.wav`. Any sample rate works.
3. Run `python tools/schedule.py vo timeline.json`. This re-times the shots to the new line lengths.
4. Rebuild with the steps below.

## Rebuilding

Tools needed: Node, the repo's Playwright + Chromium, Python with `numpy`, and `ffmpeg`.

```bash
node tools/render.mjs v /tmp/fv 30          # 1080×1920 frames (h = 1920×1080)
for i in 1 2 3 4 5 6 7 8 9; do ffmpeg -i vo/vo-$i.wav -ar 48000 -ac 1 /tmp/vo48/vo-$i.wav; done
python tools/score.py /tmp/vo48 /tmp/audio  # music.wav + vo.wav on the timeline
tools/mix.sh ffmpeg /tmp/audio              # ducked, loudness-normalised mix.wav
ffmpeg -framerate 30 -i /tmp/fv/f%05d.jpg -i /tmp/audio/mix.wav -c:v libx264 -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest loopbox-ad-9x16.mp4
```
