// DAILY DISTANCE: the stages of the daily journey from the rim to the far baseline. Pure data plus two small pure
// helpers. The rules (engine/rules.js `distanceConfig`) turn this into a run's config; nothing else reads difficulty.
//
// HOW TO TUNE
//   - Add, remove or move a stage: edit STAGES. `dist` is feet from the hoop on a real court (the three-point line is
//     23.75, half court 41.75, the far baseline 88.75). Stages must get strictly farther.
//   - Make the whole journey easier or harder: edit DIFFICULTY. Every stage reads its difficulty off this curve by
//     distance (linear between anchors). A stage can override any field for itself, e.g. { ..., zone: 0.3 }.
//   - Anything that can change an outcome here changes the run's rulesHash; bump GAME.rules once the mode is public.
//
// Difficulty fields are the shot plan's multipliers (see "THE SHOT PLAN" in rules.js), relative to Quick Play:
//   zone     size of the make zone (and the clean-make band inside it)
//   perfect  size of the perfect sliver (always kept the smallest band)
//   sweep    how long the marker takes to cross (below 1 = faster)
//   drift    how far the zone slides
//   near     make chance just outside perfect     (Quick Play: 0.96)
//   edge     make chance at the zone's outer edge  (Quick Play: 0.20)
// Quick Play's own tuning is the 24 ft row with every multiplier at 1; this mode is slightly kinder there because one
// miss ends the run, and far harder beyond it.

export const STAGES = [
  { id: 'layup',      dist: 4,  label: 'LAYUP',            shotType: 'layup', landmark: true },
  { id: 'short',      dist: 9,  label: 'SHORT JUMPER',     shotType: 'jumper' },
  { id: 'free_throw', dist: 15, label: 'FREE THROW',       shotType: 'jumper', landmark: true },
  { id: 'mid',        dist: 19, label: 'MID-RANGE',        shotType: 'jumper' },
  { id: 'three',      dist: 24, label: 'THREE-POINTER',    shotType: 'three', landmark: true },
  { id: 'deep_three', dist: 27, label: 'DEEP THREE',       shotType: 'three' },
  { id: 'logo',       dist: 30, label: 'LOGO THREE',       shotType: 'three' },
  { id: 'd33',        dist: 33, label: '33 FT',            shotType: 'heave' },
  { id: 'd36',        dist: 36, label: '36 FT',            shotType: 'heave' },
  { id: 'd39',        dist: 39, label: '39 FT',            shotType: 'heave' },
  { id: 'half',       dist: 42, label: 'HALF COURT',       shotType: 'heave', landmark: true },
  { id: 'past_half',  dist: 47, label: 'PAST HALF COURT',  shotType: 'heave' },
  { id: 'd52',        dist: 52, label: '52 FT',            shotType: 'heave' },
  { id: 'd58',        dist: 58, label: '58 FT',            shotType: 'heave' },
  { id: 'd64',        dist: 64, label: '64 FT',            shotType: 'heave' },
  { id: 'd70',        dist: 70, label: '70 FT',            shotType: 'heave' },
  { id: 'd76',        dist: 76, label: '76 FT',            shotType: 'heave' },
  { id: 'd82',        dist: 82, label: '82 FT',            shotType: 'heave' },
  { id: 'full',       dist: 88, label: 'FULL COURT',       shotType: 'heave', landmark: true, final: true },
];

/** Difficulty by distance. Simulated (Nov 2026) for players with release error σ 15-70 ms: σ 50 ms averages ~3 stages,
 *  σ 25 ms ~6 (past the arc), σ 15 ms makes half court about 1 time in 3 and full court about 1 in 260. */
export const DIFFICULTY = [
  { at: 4,  zone: 2.4,  perfect: 2.0,  sweep: 1.2,  drift: 0.3,  near: 0.99, edge: 0.45 },
  { at: 15, zone: 1.6,  perfect: 1.5,  sweep: 1.08, drift: 0.65, near: 0.97, edge: 0.30 },
  { at: 24, zone: 1.15, perfect: 1.1,  sweep: 1.0,  drift: 0.9,  near: 0.96, edge: 0.22 },
  { at: 42, zone: 0.8,  perfect: 0.9,  sweep: 0.93, drift: 1.1,  near: 0.92, edge: 0.14 },
  { at: 60, zone: 0.58, perfect: 0.75, sweep: 0.87, drift: 1.2,  near: 0.84, edge: 0.08 },
  { at: 88, zone: 0.36, perfect: 0.55, sweep: 0.80, drift: 1.35, near: 0.60, edge: 0.03 },
];
const KEYS = ['zone', 'perfect', 'sweep', 'drift', 'near', 'edge'];

/** The difficulty fields for a stage: the curve at its distance, then the stage's own overrides. */
export function stageDifficulty(stage) {
  const d = stage.dist, A = DIFFICULTY;
  let out;
  if (d <= A[0].at) out = { ...A[0] };
  else if (d >= A[A.length - 1].at) out = { ...A[A.length - 1] };
  else {
    const i = A.findIndex((a) => a.at >= d), a = A[i - 1], b = A[i], u = (d - a.at) / (b.at - a.at);
    out = {}; for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * u;
  }
  const r = {};
  for (const k of KEYS) r[k] = Math.round((k in stage ? stage[k] : out[k]) * 1e4) / 1e4;   // rounded: the rules fingerprint stays stable
  return r;
}

/**
 * Where the camera and shooter stand for a stage. `side` (-1 left, 1 right) and `u` (0..1) come from the daily seed:
 * which side of the court today's walk goes up, and how far off the centre line this stage sits. Same numbers for
 * everyone on the same date.
 */
export function stageView(stage, side, u, targetU) {
  const dist = stage.dist;
  // stay inside the court: far out, only a narrow angle keeps you between the sidelines
  const maxDeg = Math.min(stage.spread ?? 38, dist > 20 ? (Math.asin(Math.min(1, 19 / dist)) * 180) / Math.PI : 38);
  const angle = Math.round(side * maxDeg * u), a = (angle * Math.PI) / 180, s = Math.sin(a);
  // the hoop shrinks and sits further up the floor as you back away: the clearest "I'm far now" cue
  const hoopScale = Math.max(0.24, Math.min(0.74, 0.58 * Math.pow(24 / dist, 0.6)));
  return {
    id: stage.id, name: stage.label, sub: stage.final ? `${dist} FT · FINAL SHOT` : `${dist} FT`,
    dist, angle, side: Math.round(s * 100) / 100,
    // far out the small hoop would hide behind the shooter's head: stand wider so it stays clear
    shooter: Math.round(side * (0.28 + 0.16 * Math.abs(s) + 0.14 * Math.max(0, Math.min(1, (dist - 24) / 50))) * 100) / 100, hoop: 0, cam: Math.round(s * 80) / 100,
    target: Math.round((0.64 + 0.12 * targetU) * 1000) / 1000,
    back: 1, charScale: 1.3, hoopScale: Math.round(hoopScale * 1000) / 1000, hoopBack: Math.round(24 + Math.max(-8, Math.min(30, (dist - 24) * 0.6))),
    flight: Math.round((0.6 + dist * 0.006) * 100) / 100,   // long shots hang in the air a little longer (cosmetic)
  };
}

/** Feet made: the distance of the last stage made (0 if the first shot missed). */
export const madeDistance = (stagesMade) => (stagesMade > 0 ? STAGES[Math.min(stagesMade, STAGES.length) - 1].dist : 0);

/** The headline for a finished run: "YOU BEAT THE DAILY", "YOU REACHED HALF COURT", "MADE IT TO 47 FT"... */
export function distanceHeadline(stagesMade) {
  if (stagesMade >= STAGES.length) return 'YOU BEAT THE DAILY';
  if (stagesMade <= 0) return 'MISSED THE LAYUP';
  if (stagesMade === 1) return 'MADE THE LAYUP. THAT\'S IT.';
  const st = STAGES[stagesMade - 1];
  return st.landmark ? `YOU REACHED ${st.label}` : `MADE IT TO ${st.dist} FT`;
}

/** End-of-run reaction thresholds, in feet made (the distance mode's GOOD_GAME / POOR_GAME). */
export const REACT = { big: 42, poor: 15 };
