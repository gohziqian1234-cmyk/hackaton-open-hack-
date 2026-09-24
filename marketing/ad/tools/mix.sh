#!/usr/bin/env bash
# Mixes music.wav + vo.wav into mix.wav: VO cleanup, music ducked under the voice, two-pass loudnorm to -14 LUFS.
# Usage: mix.sh <ffmpeg> <audio_dir>
set -euo pipefail
FF=$1; A=$2
CHAIN="[1:a]highpass=f=75,equalizer=f=220:t=q:w=1:g=-1.5,equalizer=f=3500:t=q:w=1.4:g=2.5,acompressor=threshold=0.12:ratio=3:attack=4:release=120:makeup=1.6,pan=stereo|c0=c0|c1=c0,asplit=2[vo][sc];[0:a]volume=0.4[m];[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=300:makeup=1[duck];[duck][vo]amix=inputs=2:normalize=0:weights=1 1,alimiter=limit=0.9:level=disabled"
M=$("$FF" -hide_banner -i "$A/music.wav" -i "$A/vo.wav" -filter_complex "$CHAIN,loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$M" | grep "\"$1\"" | sed 's/.*: "\(.*\)".*/\1/'; }
"$FF" -y -hide_banner -loglevel error -i "$A/music.wav" -i "$A/vo.wav" -filter_complex "$CHAIN,loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" -ar 48000 -c:a pcm_s16le "$A/mix.wav"
echo "measured: I=$(g input_i) TP=$(g input_tp)"
