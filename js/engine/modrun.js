// Runs a modifier's SHOW side during one game: delivers events to its hooks and hands them a small effects toolbox.
//
// LIFECYCLE of a modifier in one run (the rules side is already baked into the config by rules.configFor):
//
//   created     with the Contest. Each part of the modifier gets an empty private `state` object.
//   start       the first tap: the run begins
//   rack        a rack begins                          e: { rack, spot, name }            rack = 0..4 in play order
//   shot        the meter starts sweeping              e: { shot, rack, ball, money }
//   release     the ball leaves the hand               e: { shot, pos }                   (the outcome is NOT known here:
//                                                                                          nothing may reveal it early)
//   result      the ball reaches the rim               e: { shot, tier, made, money, pts, kind, heatBefore, heatAfter, streak, score }
//   heat        the Heat level changed                 e: { from, to }
//   end         the 25th shot has landed               e: { score }
//   frame       every frame while the game runs        e: { dt }
//   draw        every frame, to paint                  e: { layer: 'scene' | 'screen', g, L, t }
//                 'scene'  inside the camera, over the court and players
//                 'screen' steady, over the scene. The banners and the METER are drawn after it, so a modifier can
//                          never cover the meter.
//   dispose     the run is over or was abandoned. Anything the toolbox changed (music tempo, crowd) is undone
//               automatically; a hook is only needed for a modifier's own leftovers.
//
// Every hook is called as hook(e, run) where run = { c, fx, state }:
//   c      the Contest, to READ (score, shot, heatLevel, L, cfg, time). Don't write to it: use fx.
//   fx     the effects toolbox below
//   state  this modifier's own scratch object for the run
//
// A hook that throws is skipped and, after three failures, switched off for the rest of the run. A modifier can be
// wrong; it cannot freeze the game.
import { sfx, setMusicStyle } from './audio.js';

const HOOKS = ['start', 'rack', 'shot', 'release', 'result', 'heat', 'end', 'frame', 'draw', 'dispose'];

function toolbox(c) {
  const at = (where) => {
    const L = c.L;
    if (where === 'hoop') return [L.hoopX, L.rimY - 60];
    if (where === 'center') return [L.w / 2, L.h * 0.4];
    return [L.shooterX, L.shooterY - 300 * (L.charScale || 1)];        // 'shooter': above their head
  };
  return {
    /** Big centre-screen banner. Waits its turn behind a banner that is already showing. */
    banner(text, sub = '', color = '#ffd23f') {
      const b = { text, sub, t: 0, dur: 0.9, color };
      if (c.banner && c.banner.t < c.banner.dur) c.bannerNext = b; else c.banner = b;
    },
    /** Floating text at 'shooter', 'hoop' or 'center'. */
    popup(text, where = 'shooter', color = '#fff', size = 24, dur = 0.9) { const [x, y] = at(where); c.popup(text, x, y, color, size, dur); },
    /** Full-screen flash. `rgb` is "r,g,b". */
    flash(rgb = '255,255,255', strength = 0.4) { c.flash = Math.max(c.flash, strength); c.flashColor = rgb; },
    shake(k = 0.4) { c.shake = Math.max(c.shake, k); },
    /** Camera punch-in toward the hoop. */
    kick(k = 0.4) { c.kick = Math.max(c.kick, k); },
    /** Particles: 'spark', 'star', 'coin', 'fire', 'steam', 'ember', 'ring'. */
    burst(type, where = 'hoop', n = 10, opts = {}) { const [x, y] = at(where); c.emit(type, x, y + (where === 'hoop' ? 60 : 0), n, opts); },
    /** Any sound effect by name (see sfx in audio.js). A missing one is skipped. */
    sound(name, ...args) { try { if (typeof sfx[name] === 'function') sfx[name](...args); } catch { /* sound never breaks the game */ } },
    /** Push the crowd up or down for the rest of the run (or until changed): -1 silent .. +1 losing it. */
    crowd(k = 0) { c.crowdMod = k; },
    /** Music changes for this run: { tempo } as a multiplier. Undone when the run ends. */
    music(style) { try { setMusicStyle(style); } catch { /* ignore */ } },
  };
}

export function createModifierRuntime(modifier, contest) {
  const fx = toolbox(contest);
  const parts = (modifier ? modifier.parts || [modifier] : []).map((m) => ({ m, run: { c: contest, fx, state: {} }, fails: 0 }));
  let disposed = false;
  const fire = (name, e = {}) => {
    for (const p of parts) {
      const hook = p.m.on && p.m.on[name];
      if (!hook || p.fails >= 3) continue;
      try { hook(e, p.run); } catch (err) { p.fails++; try { console.warn(`[modifier] ${p.m.id}.${name}`, err); } catch { /* ignore */ } }
    }
  };
  return {
    fire,
    /** True if any part paints, so the renderer can skip the call entirely otherwise. */
    draws: parts.some((p) => p.m.on && p.m.on.draw),
    dispose() {
      if (disposed) return;
      disposed = true;
      fire('dispose');
      contest.crowdMod = 0;
      try { setMusicStyle({ tempo: 1 }); } catch { /* ignore */ }
    },
  };
}
export { HOOKS };
