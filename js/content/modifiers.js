// THE MODIFIER LIBRARY. Each entry is one Daily Challenge twist: data first, then (if it needs any) small isolated
// behaviour. Adding one never means touching the engine.
//
// HOW TO ADD A MODIFIER
//   1. Add an entry below. The fields and their defaults are listed in engine/modifiers.js.
//   2. To change how shots are judged or scored, edit data in `tune(cfg)` (overall tuning, see config.js) and/or
//      `plan(plan, cfg)` (per-shot: spot, money, sweep, zone, perfect, drift, heat; see "THE SHOT PLAN" in rules.js).
//      These two are the rules side: pure, replayed by a server. No randomness, clock or screen in them.
//   3. To react to what happens (banners, particles, sound, drawing), add hooks under `on` (see engine/modrun.js).
//      Hooks can't change an outcome.
//   4. Load the game on localhost: every modifier and every legal pair is checked against the house rules at boot
//      (checkLibrary below) and problems are printed to the console. Try one with ?mod=<id> (or ?mod=a.b).
//
// HOUSE RULES, enforced by rules.checkConfig when a config is built:
//   - 25 shots, 5 per rack, and the maximum score is always 30.
//   - Perfect is always the smallest band. Heat never guarantees a make.
//   - The meter never reveals the result (hooks are not told the outcome until the ball reaches the rim).
//   - No progression: a modifier lasts one run and changes nothing afterwards.
import { defineModifiers, resolveModifier, canCombine, pairId, RARITY } from '../engine/modifiers.js';

const GOLD = '255,210,63';

export const MODIFIERS = defineModifiers([
  // ------------------------------------------------------------------ Heat
  { id: 'double_heat', name: 'Double Heat', icon: '🔥', kind: 'heat', difficulty: 2, theme: { color: '#ff8a1f' },
    desc: 'Heat builds twice as fast.', touches: ['heat.gain'],
    tune(c) { c.heat.gainMult = 2; } },
  { id: 'start_hot', name: 'Start Hot', icon: '🌶️', kind: 'heat', difficulty: 2, theme: { color: '#ff5a3c' },
    desc: 'You walk in already Hot. Don\'t waste it.', touches: ['heat.start'],
    tune(c) { c.heat.startLevel = 2; } },
  { id: 'safety_net', name: 'Safety Net', icon: '🪢', kind: 'heat', difficulty: 1, theme: { color: '#7fe0c0' },
    desc: 'A miss only costs ONE heat level instead of all of it.', touches: ['heat.miss'],
    tune(c) { c.heat.missDrop = 1; } },
  { id: 'slow_burn', name: 'Slow Burn', icon: '🕯️', kind: 'heat', difficulty: 3, theme: { color: '#ffb347' },
    desc: 'Heat takes longer to build, but a miss only costs one level.', touches: ['heat.gain', 'heat.miss'],
    tune(c) { c.heat.perLevel = 4; c.heat.missDrop = 1; } },

  // ------------------------------------------------------------------ timing
  { id: 'fast_meter', name: 'Faster Meter', label: 'Fast Meter', icon: '⚡', kind: 'timing', difficulty: 4, theme: { color: '#ffe14d' },
    desc: 'The meter had too much coffee.', touches: ['meter.sweep'],
    tune(c) { c.meter.sweep *= 0.8; } },
  { id: 'tiny_perfect', name: 'Tiny Perfect', icon: '🤏', kind: 'timing', difficulty: 4, theme: { color: '#ffffff' },
    desc: 'The perfect zone is half the size.', touches: ['meter.perfect'],
    tune(c) { c.meter.perfect *= 0.55; } },
  // Per-shot timing: the plan makes every rack a little quicker than the last. The show side follows with the music.
  { id: 'closing_speed', name: 'Closing Speed', icon: '⏩', kind: 'timing', difficulty: 4, rarity: 'uncommon', theme: { color: '#ff6b9d' },
    desc: 'Every rack, the meter gets a little faster.', touches: ['meter.sweep'],
    plan(plan, c) { plan.forEach((p, i) => { p.sweep = (100 - 6 * Math.floor(i / c.ballsPerRack)) / 100; }); },
    on: {
      rack(e, { fx }) { fx.music({ tempo: 1 + 0.05 * e.rack }); if (e.rack > 0) fx.popup(e.rack === 4 ? 'TOP SPEED!' : 'FASTER!', 'center', '#ff6b9d', 30); },
    } },

  // ------------------------------------------------------------------ scoring and racks
  // The real contest's "money rack": all five money balls sit on one rack. 10 points there, 5 on each of the others:
  // still 30.
  { id: 'money_rack', name: 'Money Rack', icon: '💰', kind: 'scoring', difficulty: 3, rarity: 'uncommon', theme: { color: '#ffd23f' },
    desc: 'All five money balls are on the middle rack. Ten points in one spot.', touches: ['money'],
    plan(plan, c) { const mid = Math.floor(c.racks / 2); plan.forEach((p, i) => { p.money = Math.floor(i / c.ballsPerRack) === mid; }); },
    on: {
      rack(e, { c, fx, state }) { state.live = c.isMoney; if (state.live) { fx.banner('MONEY RACK', 'EVERY BALL IS WORTH 2', '#ffd23f'); fx.crowd(0.35); fx.sound('money'); } else fx.crowd(0); },
      result(e, { fx, state }) { if (state.live && e.made) fx.burst('coin', 'hoop', 8); },
    } },
  // Shot order: the plan sends the racks the other way round the arc. No behaviour needed at all.
  { id: 'reverse_run', name: 'Reverse Run', icon: '↩️', kind: 'order', difficulty: 3, theme: { color: '#9fe8ff' },
    desc: 'Start in the right corner and work back to the left.', touches: ['order'],
    plan(plan, c) { plan.forEach((p) => { p.spot = c.spots.length - 1 - p.spot; }); } },
  // A special rule built from plan data alone: money balls are harder to make and worth more Heat.
  { id: 'clutch_time', name: 'Clutch Time', icon: '😤', kind: 'special', difficulty: 4, rarity: 'uncommon', theme: { color: '#e83f5b' },
    desc: 'Money balls have a tighter zone, but making one is worth double Heat.', touches: ['money.zone'],
    plan(plan) { plan.forEach((p) => { if (p.money) { p.zone = 0.75; p.heat = 2; } }); },
    on: {
      shot(e, { fx }) { if (e.money) { fx.crowd(-0.6); fx.popup('CLUTCH TIME', 'hoop', '#ff8d9c', 24, 0.7); /* by the hoop: the last shot's reaction may still be above the shooter */ } else fx.crowd(0); },
      result(e, { fx }) { if (!e.money) return; fx.crowd(0); if (e.made) { fx.flash(GOLD, 0.3); fx.kick(0.6); fx.popup('ICE COLD!', 'center', '#9fe8ff', 30); } },
    } },

  // ------------------------------------------------------------------ tempo
  { id: 'moon_ball', name: 'Moon Ball', icon: '🌙', kind: 'tempo', difficulty: 3, theme: { color: '#c9b8e8' },
    desc: 'Every shot is a rainbow. Enjoy the hang time.', touches: ['flight'],
    tune(c) { c.visual.arcScale = 1.7; c.timing.flight *= 1.25; } },
  // Tempo only: the time BETWEEN shots shrinks. The meter itself is untouched, so it is fair and frantic.
  { id: 'rapid_fire', name: 'Rapid Fire', icon: '💨', kind: 'tempo', difficulty: 3, theme: { color: '#7fd4ff' },
    desc: 'No time to think. The next ball is already in your hands.', touches: ['flight', 'tempo'],
    tune(c) { Object.assign(c.timing, { grab: 0.15, flight: 0.6, settle: 0.22, rackIntro: 0.4, move: 0.62 }); },
    on: { start(e, { fx }) { fx.music({ tempo: 1.14 }); } } },

  // ------------------------------------------------------------------ look and sound
  { id: 'giant_ball', name: 'Giant Ball', icon: '🏀', kind: 'visual', difficulty: 3, theme: { color: '#ff8a1f' },
    desc: 'The ball is enormous. Nobody knows why.', touches: ['ball'],
    tune(c) { c.visual.ballScale = 1.7; } },
  { id: 'rowdy', name: 'Rowdy Crowd', label: 'Rowdy', icon: '📣', kind: 'audio', difficulty: 3, theme: { color: '#ffd23f' },
    desc: 'The crowd is already losing it.', touches: ['crowd'],
    tune(c) { c.visual.crowdBoost = 0.6; },
    on: { result(e, { fx }) { if (e.made && e.tier === 'perfect') fx.sound('cheer', 1); } } },
  { id: 'stealth', name: 'Stealth Zone', label: 'Stealth', icon: '🙈', kind: 'visual', difficulty: 4, theme: { color: '#b0a4c8' },
    desc: 'The perfect zone is hidden. Trust your gut.', touches: ['meter.look'],
    tune(c) { c.visual.hidePerfect = true; } },
  // Visual effects with their own drawing and state: the arena goes dark, with spotlights on the shooter and the
  // hoop. The lights flare when a shot drops. On the meter, the zone fades out halfway through each sweep
  // (a `visual` setting the renderer already understands), so you have to remember where it was heading.
  { id: 'lights_out', name: 'Lights Out', icon: '🔦', kind: 'visual', difficulty: 4, rarity: 'uncommon', theme: { color: '#8fb4ff' },
    desc: 'Someone hit the breaker. The zone fades out mid-sweep: remember where it was going.', touches: ['meter.look'],
    tune(c) { c.visual.zoneFade = 0.5; },
    on: {
      start(e, { fx, state }) { state.glow = 1; fx.crowd(-0.25); fx.popup('LIGHTS OUT', 'center', '#8fb4ff', 34, 1.1); },
      result(e, { state }) { if (e.made) state.glow = e.tier === 'perfect' ? 1 : 0.6; },
      frame(e, { state }) { state.glow = Math.max(0, (state.glow || 0) - e.dt * 1.4); },
      draw(e, { state }) {
        if (e.layer !== 'screen') return;
        const { g, L } = e, k = 0.25;                                        // paint the dark at quarter size, then stretch it
        const cv = state.cv || (state.cv = document.createElement('canvas')), w = Math.ceil(L.w * k), h = Math.ceil(L.h * k);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        const d = cv.getContext('2d');
        d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, w, h);
        d.fillStyle = `rgba(8,6,22,${(0.8 - 0.5 * (state.glow || 0)).toFixed(3)})`; d.fillRect(0, 0, w, h);
        d.globalCompositeOperation = 'destination-out';
        for (const [x, y, r] of [[L.hoopX, L.rimY + 10, 150 * (L.hoopScale || 1) + 60], [L.shooterX, L.shooterY - 130, 210]]) {
          const s = d.createRadialGradient(x * k, y * k, r * k * 0.25, x * k, y * k, r * k);
          s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(1, 'rgba(0,0,0,0)');
          d.fillStyle = s; d.fillRect(0, 0, w, h);
        }
        g.drawImage(cv, 0, 0, L.w, L.h);
      },
      dispose(e, { state }) { state.cv = null; },
    } },
]);

/** A day with no modifier. Not in the library: its id is null in every record. */
export const CLASSIC = Object.freeze({ id: null, name: 'Classic', label: 'Classic', icon: '🏀', desc: 'No modifier today. Just you and the rim.', kind: 'special', difficulty: 3, theme: { color: '#ffffff' }, parts: [], on: {} });

const cache = new Map();
/** A modifier by id. "a.b" is two combined (see engine/modifiers.js). Unknown or illegal ids give null. */
export function getModifier(id) {
  if (id == null) return null;
  if (!cache.has(id)) cache.set(id, resolveModifier(MODIFIERS, id));
  return cache.get(id);
}
export { canCombine, RARITY };
/** The id of two modifiers played together, or null if they can't be. */
export const combinedId = (a, b) => pairId(MODIFIERS, a, b);

/**
 * Development check: build the config for every modifier and every legal pair. `configFor` is rules.configFor
 * (passed in so this file doesn't import the rules). Returns a list of problems; empty means the library is sound.
 */
export function checkLibrary(configFor) {
  const problems = [], ids = MODIFIERS.map((m) => m.id);
  MODIFIERS.forEach((a, i) => MODIFIERS.slice(i + 1).forEach((b) => { const id = combinedId(a, b); if (id) ids.push(id); }));
  for (const id of ids) { try { configFor(id); } catch (err) { problems.push(err.message); } }
  return { checked: ids.length, problems };
}
