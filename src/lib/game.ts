import { questConfig } from './catalog';
export function wave(seed: number, index: number) {
  const lane = (seed + index * 7 + Math.floor(index / 3)) % 3;
  return { lane, hazard: (lane + 1 + (index % 2)) % 3 };
}
export function scoreRun(seed: number, lanes: number[]) {
  return lanes.reduce((score, lane, i) => {
    const w = wave(seed, i);
    return Math.max(0, score + (lane === w.lane ? 1 : lane === w.hazard ? -1 : 0));
  }, 0);
}
export const waveDuration = questConfig.duration / questConfig.waves;
