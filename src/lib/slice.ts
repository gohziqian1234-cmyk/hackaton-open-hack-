// Pure geometry for the swipe-to-tear foil pack (OpeningSequence). No DOM access.

/** Sutherland–Hodgman clip of a polygon against one side of the line through `a` along `d`. */
function clipSide(
  poly: [number, number][],
  a: [number, number],
  d: [number, number],
  side: 1 | -1,
) {
  const inside = (p: [number, number]) => side * (d[0] * (p[1] - a[1]) - d[1] * (p[0] - a[0])) >= 0;
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i],
      prev = poly[(i + poly.length - 1) % poly.length];
    const cin = inside(cur),
      pin = inside(prev);
    if (cin !== pin) {
      const e: [number, number] = [cur[0] - prev[0], cur[1] - prev[1]];
      const den = d[0] * e[1] - d[1] * e[0];
      if (den !== 0) {
        const t = (d[0] * (prev[1] - a[1]) - d[1] * (prev[0] - a[0])) / -den;
        out.push([prev[0] + e[0] * t, prev[1] + e[1] * t]);
      }
    }
    if (cin) out.push(cur);
  }
  return out;
}
/** Two clip-path polygons (in %) that split a w×h box along the line entry → exit. */
export function splitAlong(w: number, h: number, entry: [number, number], exit: [number, number]) {
  const rect: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const d: [number, number] = [exit[0] - entry[0], exit[1] - entry[1]];
  const len = Math.hypot(d[0], d[1]) || 1;
  const normal: [number, number] = [-d[1] / len, d[0] / len];
  const toClip = (p: [number, number][]) =>
    'polygon(' +
    p.map(([x, y]) => `${((x / w) * 100).toFixed(2)}% ${((y / h) * 100).toFixed(2)}%`).join(',') +
    ')';
  return ([1, -1] as const).map((side) => ({
    clip: toClip(clipSide(rect, entry, d, side)),
    dx: normal[0] * side,
    dy: normal[1] * side,
  }));
}
/** Did this stroke cross the pack: start outside, go in, leave, and span ≥ 60% of its width? */
export function validSlice(
  points: { x: number; y: number }[],
  r: { left: number; top: number; right: number; bottom: number; width: number },
) {
  const inRect = (p: { x: number; y: number }) =>
    p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  const first = points.findIndex(inRect);
  if (first <= 0) return null;
  let last = first;
  while (last + 1 < points.length && inRect(points[last + 1])) last++;
  if (last + 1 >= points.length) return null;
  const entry = points[first],
    exit = points[last];
  if (Math.hypot(exit.x - entry.x, exit.y - entry.y) < r.width * 0.6) return null;
  return {
    entry: [entry.x - r.left, entry.y - r.top] as [number, number],
    exit: [exit.x - r.left, exit.y - r.top] as [number, number],
  };
}
