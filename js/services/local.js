// LOCAL MODE adapters: everything stays on this device. These are the reference implementations of the contracts
// in index.js, and the fallback the HTTP adapters lean on when the network is down.
import { hashStr, mulberry32 } from '../core/rng.js';
import { MAPS } from '../content/maps.js';
import { pinnedMapId } from '../content/dailies.js';
import { STAGES } from '../content/distance.js';
import { GAME } from '../config.js';
import { save, persist } from './storage.js';
import { player } from './player.js';

// ------------------------------------------------------------------ daily
export const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);   // the daily flips at midnight UTC
// Daily Distance boards are new keys: a board from the old 25-shot Daily (`daily:<date>`) never mixes with them.
export const dailyBoard = (date) => `distance:${date}`;
/** Is this stored daily result a Daily Distance run? Older saves hold 25-shot Daily results under the same dates. */
export const isDistance = (r) => !!r && r.format === 'distance';
const shiftDay = (date, k) => new Date(Date.parse(date) + k * 86400000).toISOString().slice(0, 10);   // 'YYYY-MM-DD' parses as UTC

/** The built-in schedule: date -> today's challenge, as plain ids. A server will own this later.
 *  The Daily is Daily Distance: the seed drives its stage variation, the map is cosmetic, and there is no modifier
 *  (the distance progression is the twist). The modifier rotation in content/dailies.js stays for a later return. */
export function scheduleFor(date) {
  const h = hashStr('heatcheck:' + date);
  const number = Math.max(1, Math.round((Date.parse(date) - Date.parse(GAME.epoch)) / 86400000) + 1);
  return {
    game: GAME.id, date, number, seed: h, rules: GAME.rules,
    mapId: pinnedMapId(date) || MAPS[(number + (h % 2)) % MAPS.length].id,
    format: 'distance', modifierId: null, stages: STAGES.length,
    source: 'local',
  };
}

export const challengeId = (def) => `${def.game}:daily:${def.date}`;
/** Stamp a finished run's record with which challenge and which attempt it belongs to. */
export function sealRecord(result, def, attempt) {
  if (result.record) Object.assign(result.record, { challenge: { id: challengeId(def), date: def.date, number: def.number }, attempt: attempt.attempt, token: attempt.token || null });
  return result;
}

export const localDaily = {
  today: () => scheduleFor(todayKey()),
  refresh() { return Promise.resolve(this.today()); },
  /** Today's official Daily Distance result, if any (an old 25-shot result on the same date doesn't count). */
  myResult: (date) => (isDistance(save.daily[date]) ? save.daily[date] : null),
  /** The last `n` days up to `date` (oldest first) with the official score or null, and the run of consecutive days
   *  played. Today not played yet doesn't break the streak: it counts back from yesterday. Device history only
   *  goes back KEEP_DAILIES (60) days, so a longer streak shows as 60. */
  history(date, n = 7) {
    const days = [];
    // a day counts for the streak whichever Daily it was (old 25-shot days keep their score, distance days their feet)
    for (let i = n - 1; i >= 0; i--) {
      const k = shiftDay(date, -i), r = save.daily[k];
      days.push({ date: k, score: r ? r.score : null, format: r ? (isDistance(r) ? 'distance' : 'contest') : null, distance: isDistance(r) ? r.distance : null, completed: isDistance(r) && !!r.completed });
    }
    let streak = 0;
    for (let k = save.daily[date] ? date : shiftDay(date, -1); save.daily[k] && streak < 999; k = shiftDay(k, -1)) streak++;
    // personal Daily Distance best (feet) over everything kept on the device, up to `date`
    // and the best before `date`, so "new personal best" is only ever claimed when it's true
    const bestOf = (keep) => Object.keys(save.daily).filter((k) => keep(k) && isDistance(save.daily[k])).reduce((m, k) => Math.max(m, save.daily[k].distance || 0), 0);
    return { days, streak, playedToday: isDistance(save.daily[date]), best: bestOf((k) => k <= date), bestBefore: bestOf((k) => k < date) };
  },
  /** Called when a daily run starts. The first run of the day is the official one. */
  begin(def) {
    const official = !isDistance(save.daily[def.date]);
    if (official) { save.tries[def.date] = (save.tries[def.date] || 0) + 1; persist(); }
    return Promise.resolve({ official, attempt: Math.max(1, save.tries[def.date] || 1), token: null });
  },
  /** Called when a daily run ends. Only an official attempt is recorded. */
  async submit(def, attempt, result) {
    if (!attempt.official || isDistance(save.daily[def.date])) return { official: false, accepted: false, score: result.score, rank: null, total: null };
    result.attempt = attempt.attempt; sealRecord(result, def, attempt);
    save.daily[def.date] = result;
    save.boards[dailyBoard(def.date)] = { name: player.name, score: result.score, perfects: result.perfects };
    persist();
    const b = await localLeaderboard.fetch(dailyBoard(def.date));
    return { official: true, accepted: true, score: result.score, rank: b.you ? b.you.rank : null, total: b.total };
  },
};

// ------------------------------------------------------------------ leaderboard (your score + simulated rivals)
const A = ['Sweaty', 'Clutch', 'Wobbly', 'Greasy', 'Humble', 'Spicy', 'Sleepy', 'Turbo', 'Crusty', 'Soggy', 'Big', 'Lil', 'Uncle', 'Coach', 'Sir', 'DJ'];
const B = ['Pickle', 'Pigeon', 'Noodle', 'Bucket', 'Sandal', 'Waffle', 'Goblin', 'Dad', 'Biscuit', 'Walrus', 'Kneepad', 'Meatball', 'Brick', 'Swish', 'Toaster', 'Gravy'];

function simulated(board) {
  const r = mulberry32(hashStr(board)), n = 70 + ((r() * 60) | 0), out = [];
  if (board.startsWith('distance:')) {               // stages made: most fall early, a few get deep, almost nobody beats it
    for (let i = 0; i < n; i++) {
      const score = Math.min(STAGES.length - 1, Math.floor(-Math.log(1 - r() * 0.999) * 3.4));
      out.push({ name: `${A[(r() * A.length) | 0]}${B[(r() * B.length) | 0]}${(r() * 99) | 0}`, score, perfects: Math.round(score * r() * 0.5) });
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    const g = (r() + r() + r() + r() - 2) * 1.9;            // ~normal
    const score = Math.max(2, Math.min(29, Math.round(15.5 + g * 5)));
    out.push({ name: `${A[(r() * A.length) | 0]}${B[(r() * B.length) | 0]}${(r() * 99) | 0}`, score, perfects: Math.round(score * (0.2 + r() * 0.3)) });
  }
  return out;
}

export const localLeaderboard = {
  /** Top of the board, plus a few rows around the player when they are outside the top. */
  async fetch(board, { limit = 10, around = 2 } = {}) {
    const mine = save.boards[board];
    const all = simulated(board).map((e) => ({ ...e, you: false }));
    if (mine) all.push({ ...mine, name: player.name, you: true });
    all.sort((a, b) => b.score - a.score || b.perfects - a.perfects || (a.you ? -1 : 1));
    all.forEach((e, i) => (e.rank = i + 1));
    const you = all.find((e) => e.you) || null;
    return {
      board, top: all.slice(0, limit), you, total: all.length, simulated: true,
      around: you && you.rank > limit ? all.slice(Math.max(limit, you.rank - 1 - around), you.rank + around) : [],
    };
  },
};

// ------------------------------------------------------------------ flags
const DEFAULT_FLAGS = { ads: false, leaderboard: true, share: true };

/** Feature switches. Local defaults, overridable while developing with ?flags=ads,-share */
export function createFlags(defaults = DEFAULT_FLAGS) {
  const values = { ...defaults };
  try {
    for (const f of (new URLSearchParams(location.search).get('flags') || '').split(',').filter(Boolean)) values[f.replace(/^-/, '')] = !f.startsWith('-');
  } catch { /* no location */ }
  return {
    on: (name) => !!values[name],
    get: (name, fallback) => (name in values ? values[name] : fallback),
    /** Merge switches from a server. Unknown names are kept so new flags need no client release to exist. */
    apply(remote) { if (remote && typeof remote === 'object') for (const k of Object.keys(remote)) values[k] = remote[k]; },
    refresh: () => Promise.resolve(),
  };
}
