/** Singapore is UTC+8 all year (no daylight saving). */
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Epoch ms of the most recent 00:00 in Asia/Singapore at or before `now`. */
export function startOfSgtDay(now: number) {
  return Math.floor((now + SGT_OFFSET_MS) / DAY_MS) * DAY_MS - SGT_OFFSET_MS;
}
