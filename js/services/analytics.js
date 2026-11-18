// Game analytics: a small, provider-agnostic event layer. Nothing here sends anything.
//
//   analytics.track('game_started', { mode: 'quick', character: 'knight', ... })
//
// Three ideas keep it honest and cheap:
//   1. A CATALOGUE. Only events listed in EVENTS exist, and only their listed fields get through, each coerced to
//      a declared type. Free text cannot leak into an event by accident, so neither can personal information.
//   2. FEW, DENSE EVENTS. No per-shot events: one `game_completed` carries every shot's outcome and timing in
//      about 300 bytes. Events answer design questions; they are not a click log.
//   3. A SINK. Where events go is decided in one place (telemetry.setSink): nowhere today, a provider later.
//
// Debugging: add ?analytics to the URL (or run localStorage.setItem('hc.analytics', '1')) to print each event to
// the console. `analytics.recent()` returns the last 100 events.
import { GAME } from '../config.js';
import { track as emit, BUILD } from './telemetry.js';
import * as rules from '../engine/rules.js';

// Field types: 'id' short identifier, 'int', 'bool', 'ints' short list of integers, 'code' compact encoded string.
// A trailing '?' means optional. Anything not listed is dropped.
export const EVENTS = {
  // -------- funnel
  game_loaded: {
    why: 'Who arrives, on what, and how fast the game is ready.',
    fields: { w: 'int', h: 'int', dpr: 'int', touch: 'bool', returning: 'bool', games: 'int', loadMs: 'int', reducedMotion: 'bool', muted: 'bool', standalone: 'bool' },
  },
  game_started: {
    why: 'What people choose to play, and how many games a visit holds (nth).',
    fields: { mode: 'id', practice: 'bool', character: 'id', map: 'id', modifier: 'id?', daily: 'int?', date: 'id?', warmup: 'bool?', nth: 'int', via: 'id' },
  },
  game_completed: {
    why: 'The one that matters: difficulty, timing habits, Heat, and which spots hurt. See summarizeRun().',
    fields: {
      mode: 'id', practice: 'bool', character: 'id', map: 'id', modifier: 'id?', daily: 'int?', date: 'id?', warmup: 'bool?', nth: 'int',
      score: 'int', makes: 'int', perfects: 'int', money: 'int', maxHeat: 'int', streak: 'int',
      shots: 'code',      // 25 letters, one per shot: p perfect, g good, o rattle-in, m miss (capital = money ball)
      rack: 'ints',       // points scored at each of the five spots
      bias: 'ints',       // per spot: average release error in thousandths of the meter. Negative = early.
      spread: 'ints',     // per spot: average size of that error (how inconsistent, regardless of direction)
      atHeat: 'ints',     // shots taken at each Heat level [normal, heating, hot, fire]
      madeAtHeat: 'ints', // makes at each Heat level: does being hot actually help?
      fireAt: 'int',      // shot number that first reached On Fire, or 0 if never
      late: 'int',        // shots that ran off the end of the meter (never released)
      durS: 'int', pauses: 'int',
    },
  },
  game_abandoned: {
    why: 'Where people give up. The clearest difficulty and boredom signal.',
    fields: { mode: 'id', practice: 'bool', character: 'id', map: 'id', modifier: 'id?', daily: 'int?', date: 'id?', warmup: 'bool?', nth: 'int', shot: 'int', score: 'int', shots: 'code', how: 'id' },
  },
  // -------- daily
  daily_official: {
    why: 'The official daily attempt: was it recorded, and where did it rank.',
    fields: { daily: 'int', modifier: 'id?', score: 'int', attempt: 'int', accepted: 'bool', pending: 'bool', rank: 'int?', total: 'int?' },
  },
  daily_viewed: {
    why: 'How many look at the Daily, and how many of those then play it (compare with daily_started).',
    fields: { daily: 'int', date: 'id', modifier: 'id?', played: 'bool' },
  },
  daily_started: {
    why: 'The official Daily run begins. Practice re-runs are game_started with practice: true.',
    fields: { daily: 'int', date: 'id', character: 'id', map: 'id', modifier: 'id?' },
  },
  daily_completed: {
    why: 'The official Daily run finished: participation and score by modifier.',
    fields: { daily: 'int', date: 'id', score: 'int', makes: 'int', character: 'id', map: 'id', modifier: 'id?', durS: 'int' },
  },
  daily_warmup_started: {
    why: 'A first-time player took the warm-up offer (or warmed up again).',
    fields: { date: 'id', character: 'id', map: 'id' },
  },
  daily_warmup_to_official: {
    why: 'After warming up in this visit, the player started the official Daily. Does the warm-up convert?',
    fields: { date: 'id', character: 'id', warmups: 'int' },
  },
  replay_clicked: {
    why: 'Straight replays from the results screen (Play again / Run it back / Warm up again).',
    fields: { mode: 'id', practice: 'bool', warmup: 'bool', score: 'int' },
  },
  character_selected: {
    why: 'Which hoopers people pick on the setup screen (only real changes of selection).',
    fields: { character: 'id', mode: 'id' },
  },
  leaderboard_viewed: {
    why: 'Do people care about the board, and do they look before or after playing.',
    fields: { daily: 'int', played: 'bool' },
  },
  share_clicked: {
    why: 'Sharing is growth. `how` separates opening the card from actually copying or sending it.',
    fields: { mode: 'id', daily: 'int?', score: 'int', how: 'id' },
  },
  // -------- progression
  new_high_score: {
    why: 'How fast players improve, and after how many games.',
    fields: { score: 'int', previous: 'int', games: 'int' },
  },
  character_unlocked: {
    why: 'How long the 20-make unlock takes. Too fast or never both mean the bar is wrong.',
    fields: { character: 'id', games: 'int' },
  },
  dark_horse_progress: {
    why: 'Best-game makes crossed 5 / 10 / 15 / 20 while the Dark Horse was locked. Once per milestone per device.',
    fields: { milestone: 'int', unlocked: 'bool', games: 'int' },
  },
  dark_horse_unlocked: {
    why: 'The Dark Horse unlock itself, and how many games it took.',
    fields: { games: 'int', makes: 'int' },
  },
  // -------- advertising (nothing fires until an ad provider exists)
  ad_shown: {
    why: 'Which placements actually fill, and how often a visit is interrupted. Compare with games per visit.',
    fields: { placement: 'id', kind: 'id', w: 'int?', h: 'int?' },
  },
  // -------- health
  error: {
    why: 'Something broke in the field.',
    fields: { where: 'id', message: 'code' },
  },
};

const COERCE = {
  id: (v) => (typeof v === 'string' && /^[\w.:-]{1,40}$/.test(v) ? v : undefined),
  int: (v) => (Number.isFinite(+v) && v !== null && v !== '' && typeof v !== 'boolean' ? Math.round(+v) : undefined),
  bool: (v) => (typeof v === 'boolean' ? v : undefined),
  ints: (v) => (Array.isArray(v) ? v.slice(0, 32).map((n) => (Number.isFinite(+n) ? Math.round(+n) : 0)) : undefined),
  code: (v) => (typeof v === 'string' ? v.slice(0, 200) : undefined),
};

/** Keep only an event's declared fields, each forced to its declared type. Returns { data, dropped }. */
export function shape(name, raw = {}) {
  const def = EVENTS[name];
  if (!def) return null;
  const data = {}, dropped = [];
  for (const [key, spec] of Object.entries(def.fields)) {
    const optional = spec.endsWith('?'), v = raw[key];
    if (v === undefined || v === null) { if (!optional) dropped.push(key + ' (missing)'); continue; }
    const out = COERCE[optional ? spec.slice(0, -1) : spec](v);
    if (out === undefined) dropped.push(key + ' (wrong type)'); else data[key] = out;
  }
  for (const key of Object.keys(raw)) if (!(key in def.fields)) dropped.push(key + ' (not in catalogue)');
  return { data, dropped };
}

// ------------------------------------------------------------------ the service
const debugOn = () => {
  try { return /[?&]analytics\b/.test(location.search) || localStorage.getItem('hc.analytics') === '1'; } catch { return false; }
};

export function createAnalytics({ sessionId }) {
  const started = typeof performance !== 'undefined' ? performance.now() : 0, recent = [];
  const debug = debugOn();
  let seq = 0;
  return {
    /** Record an event. Unknown names and undeclared fields never leave this function. Never throws. */
    track(name, raw) {
      try {
        const shaped = shape(name, raw);
        if (!shaped) { if (debug) console.warn(`[analytics] "${name}" is not in the catalogue: add it to EVENTS in analytics.js`); return; }
        // every event: which game and build, which visit, its order in the visit, and seconds since the page loaded
        const event = { ...shaped.data, game: GAME.id, build: BUILD, session: sessionId, seq: ++seq, at: Math.round(((typeof performance !== 'undefined' ? performance.now() : 0) - started) / 1000) };
        recent.push({ name, data: event }); if (recent.length > 100) recent.shift();
        if (debug) {
          console.log(`%c[analytics] ${name}`, 'color:#ff8a1f;font-weight:bold', event);
          if (shaped.dropped.length) console.warn(`[analytics] ${name} dropped: ${shaped.dropped.join(', ')}`);
        }
        emit(name, event);
      } catch { /* analytics never breaks the game */ }
    },
    /** The last 100 events, oldest first. For debugging and tests. */
    recent: () => recent.slice(),
    debug,
  };
}

// ------------------------------------------------------------------ run summary
const LETTER = { perfect: 'p', good: 'g', ok: 'o', miss: 'm' };
/** One letter per shot so far: p perfect, g good, o rattle-in, m miss; a capital marks a money ball. */
export const shotCode = (shots) => shots.map((s) => (s.money ? LETTER[s.tier].toUpperCase() : LETTER[s.tier])).join('');

/**
 * Boil a finished run down to what helps tune the game. Works from the run record by replaying it through the rules,
 * so it reports exactly what the game judged: per-spot scoring, timing error (direction and consistency), and how
 * Heat went. Returns {} if the record can't be replayed.
 */
export function summarizeRun(result) {
  try {
    const rec = result.record, cfg = rules.configFor(rec.modifierId);
    const { trace } = rules.replay(cfg, rec.seed, rec.dice, rec.shots.map((s) => s[0] / rules.POS_UNITS));
    const racks = cfg.racks, per = cfg.ballsPerRack;
    const rack = Array(racks).fill(0), sum = Array(racks).fill(0), abs = Array(racks).fill(0), n = Array(racks).fill(0);
    const atHeat = [0, 0, 0, 0], madeAtHeat = [0, 0, 0, 0];
    let fireAt = 0, late = 0;
    trace.forEach((t, i) => {
      const r = rules.planOf(cfg, i).spot;              // by SPOT, so a modifier that reorders the racks still lines up
      rack[r] += t.pts; atHeat[t.level]++; if (t.tier !== 'miss') madeAtHeat[t.level]++;
      if (!fireAt && rules.heatLevel(cfg, t.heatPts) >= 3) fireAt = i + 1;
      if (t.pos >= 1) { late++; return; }               // never released: not a timing error, it would swamp the average
      const e = Math.max(-0.2, Math.min(0.2, t.err));
      sum[r] += e; abs[r] += Math.abs(e); n[r]++;
    });
    const avg = (a) => a.map((v, i) => (n[i] ? Math.round((v / n[i]) * 1000) : 0));
    return { shots: shotCode(result.shots), rack, bias: avg(sum), spread: avg(abs), atHeat, madeAtHeat, fireAt, late,
      durS: Math.round((rec.wallMs || 0) / 1000), pauses: rec.pauses || 0 };
  } catch { return {}; }
}

/**
 * The player's release habits over a whole run, for the results screen's coach. Same replay and the same timing error
 * as summarizeRun (meter units, negative = early, clamped to ±0.2, never-released shots counted apart), but over all
 * shots: `bias` is the average error (direction), `sd` how much releases scatter around that average (consistency),
 * `steadiest` the spot index with the smallest average miss-by (at least 3 releases there), or -1; `perfects` how
 * many releases were judged perfect.
 * Returns null if the record can't be replayed.
 */
export function releaseProfile(result) {
  try {
    const rec = result.record, cfg = rules.configFor(rec.modifierId);
    const { trace } = rules.replay(cfg, rec.seed, rec.dice, rec.shots.map((s) => s[0] / rules.POS_UNITS));
    const errs = [], spotAbs = {};
    let slow = 0, perfects = 0;
    trace.forEach((t, i) => {
      if (t.pos >= 1) { slow++; return; }
      if (t.tier === 'perfect') perfects++;
      const e = Math.max(-0.2, Math.min(0.2, t.err)), sp = rules.planOf(cfg, i).spot;
      errs.push(e); (spotAbs[sp] = spotAbs[sp] || []).push(Math.abs(e));
    });
    const n = errs.length;
    if (!n) return { n, slow, perfects, bias: 0, sd: 0, steadiest: -1 };
    const bias = errs.reduce((a, e) => a + e, 0) / n;
    const sd = Math.sqrt(errs.reduce((a, e) => a + (e - bias) ** 2, 0) / n);
    let steadiest = -1, low = Infinity;
    for (const [sp, list] of Object.entries(spotAbs)) {
      const m = list.reduce((a, e) => a + e, 0) / list.length;
      if (list.length >= 3 && m < low) { low = m; steadiest = +sp; }
    }
    return { n, slow, perfects, bias, sd, steadiest };
  } catch { return null; }
}
