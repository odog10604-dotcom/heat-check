// Which modifier each day gets. Two layers:
//
//   PINNED    days set by hand: { 'YYYY-MM-DD': { modifierId, mapId? } }. A pinned day never changes, whatever is
//             added to the library later. Use it for events, and to freeze days that have already been played.
//   ROTATION  every other day: a weighted pick from the modifiers marked `daily`, by rarity, never the same one two
//             days running, and now and then two that mix.
//
// The rotation is a pure function of the date, so every device agrees. But it depends on the library: ADDING OR
// REMOVING A MODIFIER RESHUFFLES UNPINNED FUTURE DAYS. Once the game is public, a server should own the schedule
// (docs/API.md) or upcoming days should be pinned here.
import { hashStr, mulberry32 } from '../core/rng.js';
import { MODIFIERS, getModifier, canCombine, combinedId, RARITY } from './modifiers.js';

export const PINNED = {
  '2026-11-17': { modifierId: 'double_heat' },     // Daily #2, already played before the rotation changed
};

/** One day in `COMBO_EVERY` (on average) plays two modifiers at once. */
const COMBO_EVERY = 8;
/** `null` = a Classic day with no modifier. Its weight in the rotation, next to RARITY's. */
const CLASSIC_WEIGHT = 2;

function weighted(pool, rnd) {
  const total = pool.reduce((n, p) => n + p.w, 0);
  let x = rnd() * total;
  for (const p of pool) { x -= p.w; if (x < 0) return p.m; }
  return pool[pool.length - 1].m;
}
function single(date, not = null) {
  const rnd = mulberry32(hashStr(`heatcheck:mod:${date}${not ? ':again' : ''}`));
  const pool = MODIFIERS.filter((m) => m.daily && m !== not).map((m) => ({ m, w: RARITY[m.rarity] })).concat({ m: null, w: CLASSIC_WEIGHT });
  return { first: weighted(pool, rnd), rnd };
}
const dayBefore = (date) => new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10);

/** The modifier id for a date (null = Classic), from PINNED or the rotation. */
export function dailyModifierId(date) {
  const pin = PINNED[date];
  if (pin && 'modifierId' in pin && (pin.modifierId === null || getModifier(pin.modifierId))) return pin.modifierId;
  let { first, rnd } = single(date);
  const prevPin = PINNED[dayBefore(date)], yesterday = prevPin && 'modifierId' in prevPin ? getModifier(prevPin.modifierId) : single(dayBefore(date)).first;
  if (first && yesterday && first === yesterday) ({ first, rnd } = single(date, yesterday));   // not the same twist two days running
  if (!first) return null;
  if (rnd() < 1 / COMBO_EVERY) {
    const mates = MODIFIERS.filter((m) => m.daily && canCombine(first, m)).map((m) => ({ m, w: RARITY[m.rarity] }));
    if (mates.length) return combinedId(first, weighted(mates, rnd));
  }
  return first.id;
}
/** A hand-picked map for a date, if one is pinned. */
export const pinnedMapId = (date) => (PINNED[date] && PINNED[date].mapId) || null;
