// THE RULES OF THE GAME, and nothing else: how a release is judged, how Heat and score move, and how a finished
// run is written down and checked. Pure functions over plain data. No canvas, no audio, no DOM, no clock.
//
// The game (Contest in game.js) plays through these functions. A server can import this same file and replay a
// submitted run to recompute its score. If you change anything here that alters an outcome, bump GAME.rules.
import { CONFIG, GAME } from '../config.js';
import { mulberry32, hashStr } from '../core/rng.js';
import { getModifier } from '../content/modifiers.js';

/** Release positions are whole millionths of the meter. The game judges the same integer it records, so a replay is exact. */
export const POS_UNITS = 1e6;
export const quantize = (pos) => Math.round(Math.max(0, Math.min(1, pos)) * POS_UNITS) / POS_UNITS;

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/**
 * The SHOT PLAN: one plain-data entry per shot, in the order they are taken. Everything about a single shot that a
 * modifier may change lives here, so the rules read it the same way in the game and in a server replay.
 *   spot     index into cfg.spots: where this shot is taken from (and so where its zone sits)
 *   money    is this a money ball (worth cfg.points.money)
 *   sweep    multiplier on how long the marker takes to cross (below 1 = faster)
 *   zone     multiplier on the make and good windows
 *   perfect  multiplier on the perfect sliver
 *   drift    multiplier on how far the zone slides
 *   heat     multiplier on Heat gained by making this shot
 */
export function defaultPlan(cfg) {
  const plan = [];
  for (let r = 0; r < cfg.racks; r++) for (let b = 0; b < cfg.ballsPerRack; b++) plan.push({ spot: Math.min(r, cfg.spots.length - 1), money: b === cfg.ballsPerRack - 1, sweep: 1, zone: 1, perfect: 1, drift: 1, heat: 1 });
  return plan;
}

/** The most a run can score. The house rule: this is 30 under every modifier, so "I got 24" always means the same thing. */
export const maxScore = (cfg) => cfg.plan.reduce((n, p) => n + (p.money ? cfg.points.money : cfg.points.regular), 0);

/**
 * House rules every modifier must respect. A modifier that breaks one is rejected when its config is built, long
 * before a player meets it. Returns a list of problems (empty = fine).
 */
export function checkConfig(cfg, base = CONFIG) {
  const out = [], n = cfg.racks * cfg.ballsPerRack, num = (v) => Number.isFinite(v);
  if (cfg.racks !== base.racks || cfg.ballsPerRack !== base.ballsPerRack) out.push('racks and balls per rack are fixed');
  if (!Array.isArray(cfg.plan) || cfg.plan.length !== n) return out.concat(`the shot plan must have exactly ${n} shots`);
  const baseMax = base.racks * ((base.ballsPerRack - 1) * base.points.regular + base.points.money);
  if (maxScore(cfg) !== baseMax) out.push(`the maximum score must stay ${baseMax} (this gives ${maxScore(cfg)})`);
  cfg.plan.forEach((p, i) => {
    if (!Number.isInteger(p.spot) || !cfg.spots[p.spot]) out.push(`shot ${i + 1}: unknown spot`);
    if (cfg.plan[i - (i % cfg.ballsPerRack)].spot !== p.spot) out.push(`shot ${i + 1}: a rack is shot from one spot`);
    for (const k of ['sweep', 'zone', 'perfect', 'drift', 'heat']) if (!num(p[k]) || p[k] < 0) out.push(`shot ${i + 1}: bad ${k}`);
    if (!(p.sweep >= 0.4 && p.sweep <= 2.5)) out.push(`shot ${i + 1}: sweep multiplier out of range (0.4 to 2.5)`);
    const w = windows(cfg, 0, i);
    if (!(w.perfect > 0 && w.perfect < w.good && w.good < w.make)) out.push(`shot ${i + 1}: perfect must be the smallest band, inside good, inside the zone`);
  });
  const c = cfg.meter.chance;
  if (!(c.near <= 1 && c.edge >= 0 && c.edge <= c.near)) out.push('make chance must fall from near to edge, within 0 to 1');
  if (!(cfg.heat.perLevel >= 1 && cfg.heat.startLevel >= 0 && cfg.heat.startLevel <= 3 && cfg.heat.missDrop >= 0 && cfg.heat.gainMult >= 0)) out.push('bad Heat tuning');
  return out;
}

/**
 * The tuning a run is played under: base CONFIG, then the modifier's `tune` (overall tuning) and `plan` (per-shot
 * changes). Throws on an unknown modifier or one that breaks a house rule. The game and a server both call this.
 */
export function configFor(modifierId = null) {
  const cfg = clone(CONFIG);
  let m = null;
  if (modifierId != null) {
    m = getModifier(modifierId);
    if (!m) throw new Error('unknown modifier: ' + modifierId);
    if (m.tune) m.tune(cfg);
  }
  cfg.plan = defaultPlan(cfg);
  if (m && m.plan) m.plan(cfg.plan, cfg);
  const problems = checkConfig(cfg);
  if (problems.length) throw new Error(`modifier ${modifierId} breaks a house rule: ${problems[0]}`);
  return cfg;
}

/** Only the parts of the tuning that can change an outcome. Visuals and animation timing are left out on purpose. */
export function scoringView(cfg) {
  const m = cfg.meter, h = cfg.heat;
  return {
    racks: cfg.racks, ballsPerRack: cfg.ballsPerRack, points: [cfg.points.regular, cfg.points.money],
    meter: [m.sweep, m.target, m.make, m.good, m.perfect, m.chance.near, m.chance.edge, m.drift ? m.drift.amp : 0, m.drift ? m.drift.period : 0],
    heat: [h.perLevel, h.gain.perfect, h.gain.good, h.gain.ok, h.gainMult, h.makeBonus, h.perfectBonus, h.missDrop, h.startLevel],
    targets: cfg.spots.map((s) => s.target ?? null),
    plan: cfg.plan.map((p) => [p.spot, p.money ? 1 : 0, p.sweep, p.zone, p.perfect, p.drift, p.heat]),
  };
}
/** Fingerprint of the scoring tuning. Client and server compare it to catch "same rules number, different numbers". */
export const rulesHash = (cfg) => hashStr(JSON.stringify(scoringView(cfg))).toString(16).padStart(8, '0');

// ------------------------------------------------------------------ judging one release
export const totalShots = (cfg) => cfg.racks * cfg.ballsPerRack;
export const maxHeatPts = (cfg) => cfg.heat.perLevel * 4 - 1;
export const heatLevel = (cfg, pts) => Math.min(3, Math.floor(pts / cfg.heat.perLevel));
export const rackOf = (cfg, shot) => Math.floor(Math.min(shot, totalShots(cfg) - 1) / cfg.ballsPerRack);
/** This shot's entry in the shot plan. */
export const planOf = (cfg, shot) => cfg.plan[Math.max(0, Math.min(shot, cfg.plan.length - 1))];
export const isMoney = (cfg, shot) => planOf(cfg, shot).money;
/** Seconds the marker takes to cross the meter on this shot. */
export const sweepOf = (cfg, shot) => cfg.meter.sweep * planOf(cfg, shot).sweep;

/** Centre of the zone for this shot's spot, before it starts sliding. */
export function baseTarget(cfg, shot) {
  const spot = cfg.spots[planOf(cfg, shot).spot];
  return spot.target ?? cfg.meter.target;
}
/** Centre of the zone `t` seconds into shot number `shot`'s sweep. It slides side to side from a per-shot starting point. */
export function zoneTarget(cfg, driftSeed, shot, t) {
  const d = cfg.meter.drift, base = baseTarget(cfg, shot);
  if (!d || !d.amp) return base;
  return base + d.amp * planOf(cfg, shot).drift * Math.sin(driftSeed + shot * 2.399 + (t / d.period) * Math.PI * 2);
}
/** Timing windows (half-widths) for a shot at a Heat level. Heat widens them; it never guarantees a make. */
export function windows(cfg, level, shot) {
  const m = cfg.meter, h = cfg.heat, p = planOf(cfg, shot);
  return { make: m.make * (1 + level * h.makeBonus) * p.zone, good: m.good * (1 + level * h.makeBonus * 0.7) * p.zone, perfect: m.perfect * (1 + level * h.perfectBonus) * p.perfect };
}
/** Chance (0..1) that a release `a` away from dead centre goes in. */
export function makeChance(cfg, a, w) {
  if (a <= w.perfect) return 1;
  if (a > w.make) return 0;
  const c = cfg.meter.chance;
  return c.near + (c.edge - c.near) * ((a - w.perfect) / (w.make - w.perfect));
}
/**
 * Judge one release. `pos` must already be quantized; `roll` is this shot's dice roll (0..1).
 * Returns the outcome without changing any state.
 */
export function judge(cfg, level, target, pos, roll, shot) {
  const err = pos - target, a = Math.abs(err), w = windows(cfg, level, shot), chance = makeChance(cfg, a, w);
  const tier = a <= w.perfect ? 'perfect' : roll < chance ? (a <= w.good ? 'good' : 'ok') : 'miss';
  return { tier, err, chance };
}
/**
 * Apply a shot's outcome to a run's running totals. `s` is any object carrying
 * { score, makes, perfects, moneyMade, streak, bestStreak, heatPts, maxHeat }. Returns the points scored.
 */
export function applyOutcome(cfg, s, tier, shot) {
  const p = planOf(cfg, shot), money = p.money;
  let pts = 0;
  if (tier !== 'miss') {
    pts = money ? cfg.points.money : cfg.points.regular;
    s.score += pts; s.makes++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (money) s.moneyMade++;
    if (tier === 'perfect') s.perfects++;
    s.heatPts = Math.min(maxHeatPts(cfg), s.heatPts + cfg.heat.gain[tier] * cfg.heat.gainMult * p.heat);
  } else {
    s.streak = 0;
    s.heatPts = Math.max(0, s.heatPts - cfg.heat.missDrop * cfg.heat.perLevel);
  }
  s.maxHeat = Math.max(s.maxHeat, heatLevel(cfg, s.heatPts));
  return pts;
}

/**
 * Randomness for one run. `seed` drives the zone's motion (the shared challenge). The dice normally continue from the
 * same stream; a server can instead issue a separate `dice` seed per attempt, so no two attempts share dice.
 */
export function createRandom(seed, dice = null) {
  const zone = mulberry32(seed >>> 0);
  const driftSeed = zone() * Math.PI * 2;
  return { driftSeed, roll: dice == null ? zone : mulberry32(dice >>> 0) };
}
export function startTotals(cfg) {
  const heatPts = cfg.heat.startLevel * cfg.heat.perLevel;
  return { score: 0, makes: 0, perfects: 0, moneyMade: 0, streak: 0, bestStreak: 0, heatPts, maxHeat: heatLevel(cfg, heatPts) };
}

// ------------------------------------------------------------------ the run record
// What a finished run looks like when written down. Plain JSON, integers where exactness matters.
//
//   { v: 1, game, mode: 'daily' | 'quick',
//     rules, rulesHash, build,                       which rules and which client build produced it
//     seed, dice, modifierId,                        everything that fixes the outcome of a release
//     mapId, characterId,                            cosmetic: shown on a leaderboard, never scored
//     runId,                                         random id made when the run started
//     challenge: { id, date, number } | null,        filled in by the daily service
//     attempt, token,                                filled in by the daily service (token comes from a server)
//     startedAt, wallMs, gameMs, pauses,             timing, as the client saw it
//     shots: [[posUnits, wallMs], ... 25],           release position (millionths) and ms since the first tap
//     claim: { score, makes, perfects, moneyMade, maxHeat, bestStreak } }   what the client says happened
//
// `claim` is a convenience and a cross-check. It is never trusted: verifyRun recomputes all of it from `shots`.
export const RECORD_VERSION = 1;

/** Replay release positions under a config and seed. Returns the totals and a per-shot trace. */
export function replay(cfg, seed, dice, positions) {
  const rnd = createRandom(seed, dice), totals = startTotals(cfg), trace = [];
  for (let shot = 0; shot < positions.length; shot++) {
    const pos = quantize(positions[shot]), money = isMoney(cfg, shot);
    const target = zoneTarget(cfg, rnd.driftSeed, shot, pos * sweepOf(cfg, shot));
    const level = heatLevel(cfg, totals.heatPts);     // the Heat this shot was taken at
    const j = judge(cfg, level, target, pos, rnd.roll(), shot);
    const pts = applyOutcome(cfg, totals, j.tier, shot);
    trace.push({ shot, pos, tier: j.tier, money, pts, err: j.err, chance: j.chance, level, heatPts: totals.heatPts });
  }
  return { totals, trace };
}
const CLAIM_KEYS = ['score', 'makes', 'perfects', 'moneyMade', 'maxHeat', 'bestStreak'];
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Check a run record by replaying it. This is the function a server runs.
 *
 * `expect` holds what the SERVER knows and must override whatever the record says: { seed, dice, modifierId, rules }.
 * Without `expect` this only proves the record is self-consistent (useful locally, worthless as security).
 *
 * Returns { ok, problems, warnings, computed }. `problems` mean reject. `warnings` are weak signals for review:
 * every one of them is client-reported and can be forged, so never reject on a warning alone.
 */
export function verifyRun(rec, expect = {}) {
  const problems = [], warnings = [];
  const bad = (msg) => { problems.push(msg); return { ok: false, problems, warnings, computed: null }; };
  if (!rec || typeof rec !== 'object') return bad('not a record');
  if (rec.v !== RECORD_VERSION) return bad('unknown record version');
  if (rec.game !== GAME.id) return bad('wrong game');
  const rules = expect.rules ?? rec.rules;
  if (rules !== GAME.rules) return bad(`rules ${rules} cannot be replayed by this build (rules ${GAME.rules})`);
  const modifierId = 'modifierId' in expect ? expect.modifierId : rec.modifierId ?? null;
  if ('modifierId' in expect && (rec.modifierId ?? null) !== (expect.modifierId ?? null)) return bad('record was played with a different modifier than this challenge');
  let cfg; try { cfg = configFor(modifierId); } catch (e) { return bad(e.message); }
  if (rec.rulesHash !== rulesHash(cfg)) return bad('rules fingerprint mismatch: client and verifier are tuned differently');
  const seed = expect.seed ?? rec.seed, dice = 'dice' in expect ? expect.dice : rec.dice ?? null;
  // A record that disagrees with the challenge it was submitted for is rejected, not quietly corrected: it was either
  // played on something else or edited.
  if (expect.seed != null && rec.seed !== expect.seed) return bad('record was played on a different seed than this challenge');
  if ('dice' in expect && (rec.dice ?? null) !== (expect.dice ?? null)) return bad('record was played with different dice than this attempt');
  if (!isInt(seed, 0, 4294967295)) return bad('bad seed');
  if (dice != null && !isInt(dice, 0, 4294967295)) return bad('bad dice seed');

  const n = totalShots(cfg);
  if (!Array.isArray(rec.shots) || rec.shots.length !== n) return bad(`expected ${n} shots`);
  let last = -1;
  for (const s of rec.shots) {
    if (!Array.isArray(s) || !isInt(s[0], 0, POS_UNITS) || !isInt(s[1], 0, 86400000)) return bad('malformed shot');
    if (s[1] < last) return bad('shot times go backwards');
    last = s[1];
  }

  const { totals, trace } = replay(cfg, seed, dice, rec.shots.map((s) => s[0] / POS_UNITS));
  const computed = { score: totals.score, makes: totals.makes, perfects: totals.perfects, moneyMade: totals.moneyMade, maxHeat: totals.maxHeat, bestStreak: totals.bestStreak };
  const claim = rec.claim || {};
  for (const k of CLAIM_KEYS) if (claim[k] !== computed[k]) problems.push(`claimed ${k} ${claim[k]} but replay gives ${computed[k]}`);

  // Timing. The real client cannot release two balls closer together than a flight + settle + catch.
  const minGap = Math.round((cfg.timing.flight * 0.6 + cfg.timing.settle + cfg.timing.grab) * 1000 * 0.9);
  for (let i = 1; i < n; i++) if (rec.shots[i][1] - rec.shots[i - 1][1] < minGap) { problems.push(`shots ${i} and ${i + 1} are ${rec.shots[i][1] - rec.shots[i - 1][1]} ms apart; the game needs at least ${minGap}`); break; }
  if (isInt(rec.wallMs, 0, 86400000) && rec.wallMs < last) problems.push('run ended before its last shot');
  if (isInt(rec.wallMs, 1, 86400000) && isInt(rec.gameMs, 1, 86400000) && !rec.pauses && rec.wallMs > rec.gameMs * 1.25 + 2000) warnings.push('real time ran well ahead of game time with no pause (slow frames stretch the meter)');
  if (computed.perfects >= n - 2) warnings.push('almost every shot was perfect');

  return { ok: problems.length === 0, problems, warnings, computed, trace };
}
