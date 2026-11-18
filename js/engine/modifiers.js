// THE MODIFIER SYSTEM: what a modifier is, how two combine, and how one is looked up. Pure data handling: no DOM,
// audio or clock, because rules.js (and so a server) imports this. The library itself is content/modifiers.js; the
// part that runs a modifier's show hooks during a game is engine/modrun.js.
//
// A modifier has TWO sides, kept apart on purpose:
//
//   RULES side   `tune(cfg)` and `plan(plan, cfg)`. Plain edits to plain data, applied once when the run's config is
//                built (rules.configFor). This is the ONLY way a modifier can change an outcome, and it is replayed
//                identically by a server. It may never look at the clock, the screen or randomness.
//   SHOW side    `on: { start, rack, shot, release, result, heat, end, frame, draw, dispose }`. Reactions to what
//                happens: banners, particles, sound, crowd, drawing. It cannot change an outcome, because nothing it
//                is handed can: it gets events and an effects toolbox (see modrun.js), never the rules.
//
// Everything else is description: how it is named and shown, how hard it is, how often the daily rotation may pick
// it, and what it may be combined with.

export const KINDS = ['timing', 'heat', 'racks', 'order', 'scoring', 'tempo', 'visual', 'audio', 'special'];
/** How often the daily rotation picks a modifier, as a relative weight. */
export const RARITY = { common: 6, uncommon: 3, rare: 1 };

const DEFAULTS = {
  label: '',              // short name for tight UI (the HUD tag). Falls back to `name`.
  icon: '🏀',
  desc: '',
  kind: 'special',        // one of KINDS: which part of the game it mainly changes
  difficulty: 3,          // 1 (friendlier than Classic) .. 3 (about the same) .. 5 (brutal)
  theme: { color: '#ffd23f' },   // visual identity: tints the HUD tag and the daily banner
  daily: true,            // may the daily rotation pick it? false = only when scheduled by hand
  rarity: 'common',       // see RARITY
  solo: false,            // true = never combined with another modifier
  touches: [],            // what it owns ('meter.sweep', 'order', ...). Two modifiers that touch the same thing don't mix.
  tune: null,             // (cfg) => void           overall tuning
  plan: null,             // (plan, cfg) => void     per-shot changes: see "THE SHOT PLAN" in rules.js
  on: {},                 // show hooks: see modrun.js
};

/** Fill in defaults and catch mistakes in a library when it loads (a typo should fail loudly, not on day 47). */
export function defineModifiers(list) {
  const seen = new Set();
  return list.map((raw) => {
    const m = { ...DEFAULTS, ...raw, theme: { ...DEFAULTS.theme, ...(raw.theme || {}) }, on: { ...(raw.on || {}) }, touches: [...(raw.touches || [])] };
    if (!/^[a-z][a-z0-9_]{1,18}$/.test(m.id || '')) throw new Error(`modifier id "${m.id}" must be 2-19 chars: a-z, 0-9, _`);
    if (seen.has(m.id)) throw new Error(`duplicate modifier id "${m.id}"`);
    seen.add(m.id);
    if (!m.name) throw new Error(`modifier ${m.id} needs a name`);
    if (!KINDS.includes(m.kind)) throw new Error(`modifier ${m.id}: unknown kind "${m.kind}"`);
    if (!(m.rarity in RARITY)) throw new Error(`modifier ${m.id}: unknown rarity "${m.rarity}"`);
    if (!(m.difficulty >= 1 && m.difficulty <= 5)) throw new Error(`modifier ${m.id}: difficulty is 1 to 5`);
    m.label = m.label || m.name;
    m.parts = [m];
    return Object.freeze(m);
  });
}

/** May these two be played together? Not if either is standalone, or they both change the same thing. */
export function canCombine(a, b) {
  if (!a || !b || a.id === b.id || a.solo || b.solo) return false;
  if (a.parts.length > 1 || b.parts.length > 1) return false;          // pairs only: three at once is noise, not a challenge
  return !a.touches.some((t) => b.touches.includes(t));
}

/** Two modifiers as one. Its id is "first.second" in library order, so every pair has exactly one id. */
function combine(a, b) {
  const each = (key) => (...args) => { for (const m of [a, b]) if (m[key]) m[key](...args); };
  return Object.freeze({
    ...DEFAULTS,
    id: `${a.id}.${b.id}`, name: `${a.name} + ${b.name}`, label: `${a.label} + ${b.label}`, icon: a.icon + b.icon,
    desc: `${a.desc} ${b.desc}`, kind: a.kind, theme: a.theme, daily: a.daily && b.daily,
    difficulty: Math.min(5, Math.max(a.difficulty, b.difficulty) + (Math.min(a.difficulty, b.difficulty) >= 3 ? 1 : 0)),
    rarity: 'rare', solo: true, touches: [...a.touches, ...b.touches],
    tune: each('tune'), plan: each('plan'), on: {}, parts: [a, b],
  });
}

/**
 * Look a modifier up by id in a library. "a.b" is the combination of two, valid only in library order and only if
 * they may be combined. Returns null for anything else.
 */
export function resolveModifier(library, id) {
  if (typeof id !== 'string') return null;
  const ids = id.split('.');
  if (ids.length === 1) return library.find((m) => m.id === id) || null;
  if (ids.length !== 2) return null;
  const ia = library.findIndex((m) => m.id === ids[0]), ib = library.findIndex((m) => m.id === ids[1]);
  if (ia < 0 || ib < 0 || ia >= ib || !canCombine(library[ia], library[ib])) return null;
  return combine(library[ia], library[ib]);
}

/** The id two modifiers have together, or null if they don't mix. */
export function pairId(library, a, b) {
  if (!canCombine(a, b)) return null;
  return library.indexOf(a) < library.indexOf(b) ? `${a.id}.${b.id}` : `${b.id}.${a.id}`;
}
