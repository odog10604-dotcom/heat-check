// The contest: 5 racks x 5 balls, one timing input, Heat. No content knowledge lives here —
// characters / maps / modifiers are passed in as data.
import { CONFIG, HEAT_LEVELS, GAME } from '../config.js';
import { sfx, setMusicHeat } from './audio.js';
import { applyEmote, reachTop, stylePose, lineOf } from '../content/characters.js';
import { lerp, clamp, easeOut } from './draw.js';
import { spotLayout } from './render.js';
import * as rules from './rules.js';
import { createModifierRuntime } from './modrun.js';
import { madeDistance, REACT } from '../content/distance.js';

const CALLS = {
  perfect: ['PERFECT!', 'SPLASH!', 'WET!', "CHEF'S KISS!", 'PURE!'],
  good: ['NICE!', 'SWISH!', 'BUCKET!', 'CASH!'],
  ok: ['RATTLED IN', 'IT COUNTS', 'UGLY BUT IN', "SHOOTER'S ROLL"],
  rim: ['RIM OUT', 'SO CLOSE', 'IN AND OUT', 'RUDE'],
  air: ['AIRBALL', 'NOT CLOSE', 'WHO WAS THAT TO?'],
  board: ['BRICK', 'CLANK', 'BUILDING A HOUSE'],
  long: ['WAY LONG', 'TOO STRONG', 'CALM DOWN'],
};
// Heat-flavoured calls replace the normal ones on a clean make once you're Hot / On Fire.
const HOT_CALLS = ['SIZZLING!', 'COOKING!', 'TOO HOT!', 'SCORCHER!'];
const FIRE_CALLS = ['ON FIRE!', 'NUCLEAR!', 'CALL 911!', 'UNSTOPPABLE!', 'INFERNO!', 'HEAT CHECK!'];
const pick = (arr, i) => arr[i % arr.length];
// End-of-game reaction thresholds (out of 30). Shared with the results screen.
export const GOOD_GAME = 20, POOR_GAME = 13;
const MOVE_JOG = [0.12, 0.76];   // fraction of the move spent reacting / jogging / planting
const MAX_PARTICLES = 320;   // hard cap so On Fire never bogs down a phone
// Sound must never be able to break the game: a missing (e.g. stale cached audio.js) or failing effect is skipped.
const play = (name, ...args) => { try { const f = sfx[name]; if (typeof f === 'function') f(...args); } catch (e) { console.warn('[sfx]', name, e); } };

/** Body motion while the meter runs: crouch, then rise so the jump peaks at the target. */
export function meterPose(pos, target) {
  const a = pos / target;
  const crouch = a < 0.5 ? easeOut(a / 0.5) : Math.max(0, 1 - (a - 0.5) / 0.3);
  const jump = a < 0.6 ? 0 : a <= 1 ? 40 * Math.sin(((a - 0.6) / 0.4) * Math.PI / 2) : 40 * Math.max(0, 1 - Math.pow((a - 1) / 0.43, 2));
  const l = clamp((a - 0.25) / 0.7, 0, 1), lift = l * l * (3 - 2 * l);
  return { crouch, jump, lift };
}

function newRunId() {
  try { return crypto.randomUUID(); } catch { return 'r-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
}

export class Contest {
  constructor({ character, map, mode = 'quick', format = 'contest', modifier = null, practice = false, seed = null, dice = null, layout, onDone }) {
    // The run's tuning and shot plan come from the rules, built exactly as a server would build them. The modifier's
    // rules side is already baked in; `this.mod` runs its show side (see modrun.js).
    // format 'distance' (the Daily): one shot per stage, farther each time, over at the first miss. See rules.distanceConfig.
    seed = (seed ?? Math.random() * 2 ** 32) >>> 0;
    if (format === 'distance') modifier = null;
    const cfg = (this.cfg = rules.configForRun({ format, modifierId: modifier ? modifier.id : null, seed }));
    this.format = format; this.distance = format === 'distance';
    Object.assign(this, { character, map, mode, modifier, practice, onDone });
    this.shot = 0; this.crowdMod = 0;
    this.spots = cfg.spots.map((sp) => ({ back: 0, hoopScale: 1, hoopBack: 0, charScale: 1, angle: 0, dist: 25, ...sp })); this.view = { ...this.spot }; this.moveFrom = null; this.moveDir = 1; this.rackEmpty = false;
    this.setBase(layout);
    // One dice roll per shot, drawn in order. Daily runs share a seed so the same timing gets the same bounce for everyone.
    this.seed = seed; this.dice = dice == null ? null : dice >>> 0;
    const random = rules.createRandom(this.seed, this.dice);
    this.rng = random.roll; this.driftSeed = random.driftSeed; this.zoneT = 0;
    // identity and timing for the run record (see rules.js). None of it affects play.
    this.runId = newRunId(); this.startedAt = null; this.startWall = null; this.startTime = 0; this.pauses = 0;
    this.total = cfg.racks * cfg.ballsPerRack;
    this.maxHeatPts = cfg.heat.perLevel * 4 - 1;
    this.phase = 'ready'; this.t = 0; this.time = 0; this.lastTs = 0;
    this.shot = 0; this.score = 0; this.makes = 0; this.perfects = 0; this.moneyMade = 0; this.streak = 0; this.bestStreak = 0;
    this.heatPts = cfg.heat.startLevel * cfg.heat.perLevel; this.maxHeat = this.heatLevel;
    this.shots = []; this.balls = []; this.particles = []; this.popups = []; this.banner = null;
    this.said = {};   // per moment: which of the character's lines comes next (words only, never the seeded dice)
    this.meterPos = 0; this.lastRelease = null; this.held = null; this.heldLocal = null; this.emote = null; this.jumpAtRelease = 0;
    this.kick = 0; this.flash = 0; this.flashColor = '255,190,90';   // camera punch-in and full-screen flash (never on the meter)
    this.netSwish = 0; this.shake = 0; this.rackSlide = 0; this.settleExtra = 0; this.dirty = true; this.paused = false;
    this.env = { t: 0, hype: 0, burst: 0, groan: 0, heat: this.heatLevel, score: 0, rack: 1 };
    setMusicHeat(this.heatLevel);
    this.mod = createModifierRuntime(modifier, this);
  }

  /** The run is over or abandoned: let the modifier clean up. Safe to call twice. */
  dispose() { this.mod.dispose(); }

  /** Screen layout changed (resize / rotate): re-place everything for the current spot. */
  /** The character's next line for a moment: starts somewhere random each game, then steps through the list so
   *  the same line never comes twice in a row. Math.random is fine here: words never touch an outcome. */
  say(key) {
    if (!(key in this.said)) this.said[key] = Math.floor(Math.random() * 6);
    return lineOf(this.character, key, this.said[key]++);
  }
  setBase(base) { this.base = base; this.L = spotLayout(base, this.view); if (!this.L.back) this.L.rackX -= this.L.dir * (this.character.rackGap || 0) * this.L.charScale; }   // side-on only: room for a long body
  /** Where the timing zone sits for the current spot. */
  /** How far the shooter's upper body twists toward the hoop in the behind view (a skew factor). */
  turn() { const L = this.L; return 0.12 * Math.min(1, Math.abs(L.hoopX - L.shooterX) / L.d); }

  get baseTarget() { return rules.baseTarget(this.cfg, this.shot); }
  /** Zone centre `t` seconds into this shot's sweep. It slides side to side, starting from a different point each shot. */
  targetAt(t) {
    return rules.zoneTarget(this.cfg, this.driftSeed, this.shot, t);
  }
  /** Where the zone is right now (frozen at the moment of release once the ball is away). */
  get target() { return this.targetAt(this.zoneT); }
  get spot() { return this.spots[rules.planOf(this.cfg, this.shot).spot]; }

  get heatLevel() { return Math.min(3, Math.floor(this.heatPts / this.cfg.heat.perLevel)); }
  get rack() { return Math.floor(Math.min(this.shot, this.total - 1) / this.cfg.ballsPerRack); }
  get ballInRack() { return this.shot % this.cfg.ballsPerRack; }
  get isMoney() { return rules.isMoney(this.cfg, this.shot); }
  get lastInRack() { return this.ballInRack === this.cfg.ballsPerRack - 1; }
  /** Seconds the marker takes to cross the meter on this shot. */
  get sweep() { return rules.sweepOf(this.cfg, this.shot); }

  /** Timing windows (half-widths) at the current Heat. Heat widens them; it never auto-makes. */
  windows() { return rules.windows(this.cfg, this.heatLevel, this.shot); }

  /** Chance (0..1) that a release `a` away from dead centre goes in. */
  makeChance(a, w = this.windows()) { return rules.makeChance(this.cfg, a, w); }

  setPhase(p) { this.phase = p; this.t = 0; }

  slotPos(i) {
    const L = this.L;
    return { x: L.rackX + L.dir * (-30 + i * 15 - (1 - this.rackSlide) * 260), y: L.shooterY - 100 };
  }

  pause() { if (!this.paused) this.pauses++; this.paused = true; }
  /** Unpause. A paused sweep restarts from the catch: otherwise pausing would be a free look at where the marker is. */
  resume() {
    this.paused = false;
    if (this.phase === 'meter') { this.heldLocal = null; this.held = null; this.setPhase('grab'); }
  }

  input(nowTs) {
    if (this.paused) return;
    if (this.phase === 'ready') { this.startWall = nowTs; this.startTime = this.time; this.startedAt = Date.now(); this.setPhase('rackIntro'); play('rack'); this.banner = { text: this.spot.name, sub: this.spot.sub || 'RACK 1', t: 0, dur: 0.8, color: '#fff' }; this.mod.fire('start'); this.mod.fire('rack', { rack: 0, spot: this.spot.id, name: this.spot.name }); return; }
    if (this.phase === 'meter') {
      // sub-frame accuracy: account for time elapsed since the last rendered frame
      const extra = clamp((nowTs - this.lastTs) / 1000, 0, 0.05);
      this.release(Math.min(1, (this.t + extra) / this.sweep), nowTs);
    }
  }

  release(pos, at = this.lastTs) {
    pos = rules.quantize(pos);                         // judge exactly the value that gets recorded
    this.zoneT = pos * this.sweep;
    const cfg = this.cfg, { tier, err, chance } = rules.judge(cfg, this.heatLevel, this.target, pos, this.rng(), this.shot);
    const wall = this.startWall == null ? 0 : Math.max(0, Math.round(at - this.startWall));
    const mp = meterPose(pos, this.baseTarget);
    this.meterPos = pos; this.updateHeld(mp);
    this.lastRelease = { pos, tier, err, chance, time: this.time };
    this.jumpAtRelease = mp.jump;
    this.pending = { tier, err, pos, wall, money: this.isMoney };
    const ball = this.buildBall(tier, err, this.isMoney, this.heatLevel >= 3); ball.heat = this.heatLevel; ball.trail = [];
    this.balls.push(ball);
    this.held = null; this.emote = null;
    play('release');
    this.mod.fire('release', { shot: this.shot, pos });   // the outcome is deliberately not passed: nothing may reveal it before the rim
    this.setPhase('flight');
  }

  /**
   * Ball position through the shooting motion (shooter-local). It dips at the chest, sweeps up in front of the body
   * and arrives at a set point just above the forehead, as high as this character's arms actually reach.
   */
  updateHeld(mp) {
    const L = this.L, u = mp.lift, v = 1 - u, top = reachTop(this.character) - 9;
    const lx = v * v * 18 + 2 * v * u * 50 + u * u * 18, ly = v * v * -104 + 2 * v * u * -150 + u * u * top;
    const bx = L.back ? lx * 0.45 : lx, cs = L.charScale;   // seen from behind, the ball rides the body's centre line
    const tw = L.back ? this.turn() * -ly : 0;                // ...and follows the body's twist toward the hoop
    this.heldLocal = [bx, ly];
    this.held = { x: L.shooterX + L.dir * (bx + tw) * cs, y: L.shooterY + (ly - mp.jump) * cs };
  }

  buildBall(tier, err, money, fire) {
    const L = this.L, cfg = this.cfg, sc = cfg.visual.ballScale;
    const k = L.hoopScale, br = 14 * sc * k, r0 = 14 * sc * L.charScale;   // k < 1 = far hoop: everything at the hoop end shrinks with it
    const C = { x: L.hoopX, y: L.rimY }, rw = L.rimHalf, fl = this.spot.flight || cfg.timing.flight, pk = 135 * cfg.visual.arcScale;
    const dir = L.dir, sd = L.side;                    // dir: which way the shot travels; sd: how the backboard faces us
    const floor = L.hoopBaseY + 6 * k - br, side = (err < 0 ? -1 : 1) * dir, a = Math.abs(err), mk = this.windows().make;
    const segs = []; let x = this.held.x, y = this.held.y;
    const to = (x1, y1, peak, dur, o = {}) => { segs.push({ x0: x, y0: y, x1, y1, peak, dur, ...o }); x = x1; y = y1; };
    const res = (t, kind) => () => this.resolve(t, kind);
    const thud = () => play('bounce');
    const bounces = (d) => { to(x + d * 46 * k, floor, 42 * k, 0.36, { onEnd: () => play('bounce', 0.08) }); to(x + d * 30 * k, floor, 14 * k, 0.26, { fade: 1 }); };
    const drop = () => { to(C.x, C.y + 58 * k, 0, 0.15, { fall: 1, behind: 1 }); to(C.x - 4 * dir * k, floor, 0, 0.26, { fall: 1, onEnd: thud }); bounces(-dir); };

    if (tier === 'perfect' || tier === 'good') {
      to(C.x, C.y - 3 * k, pk, fl, { onEnd: res(tier, 'swish') }); drop();
    } else if (tier === 'ok') {
      to(C.x + side * (rw - 7 * k), C.y - br + 3 * k, pk, fl, { onEnd: () => play('rim') });
      to(C.x, C.y - 2 * k, 26 * k, 0.26, { onEnd: res('ok', 'rattle') }); drop();
    } else if (a < mk + 0.06) {                        // rim-out
      to(C.x + side * (rw + k), C.y - br + 2 * k, pk, fl, { onEnd: res('miss', 'rim') });
      if (err < 0) to(C.x - dir * 125 * k, floor, 55 * k, 0.5, { onEnd: thud });
      else if (this.shot % 2) { to(C.x - dir * (rw - 2 * k), C.y - br + 2 * k, 34 * k, 0.22, { onEnd: () => play('rim') }); to(C.x - dir * 110 * k, floor, 60 * k, 0.5, { onEnd: thud }); }
      else to(C.x - dir * 95 * k, floor, 120 * k, 0.7, { onEnd: thud });
      bounces(-dir);
    } else if (err < 0) {                              // airball, short
      to(C.x - dir * (rw + 36 * k), floor, pk + 95 * k, fl * 1.12, { at: 0.72, onAt: res('miss', 'air'), onEnd: thud }); bounces(dir);
    } else if (a < 0.22) {                             // backboard brick
      to(C.x + sd * (rw + 8 * k - br), C.y - 58 * k, pk * 1.05, fl, { onEnd: res('miss', 'board') });
      to(C.x - dir * 140 * k, floor, 24 * k, 0.5, { onEnd: thud }); bounces(-dir);
    } else {                                           // way long (also: never released)
      to(C.x + dir * (rw + 95 * k), floor, pk + 150 * k, fl * 1.2, { at: 0.62, onAt: res('miss', 'long'), onEnd: thud }); bounces(dir);
    }
    return { segs, i: 0, t: 0, x: this.held.x, y: this.held.y, rot: 0, spin: -9, money, fire, r: r0, r0, r1: br, alpha: 1, behind: false };
  }

  resolve(tier, kind) {
    if (!this.pending) return;
    try { this.applyResult(tier, kind); }
    finally { if (this.phase === 'flight') { this.dirty = true; this.setPhase('settle'); } }   // never leave the game waiting on a ball that's done
  }

  applyResult(tier, kind) {
    const { money, err, pos, wall } = this.pending; this.pending = null;
    const cfg = this.cfg, L = this.L, made = tier !== 'miss', before = this.heatLevel, fire = before >= 3;
    const px = L.hoopX - 10 * L.dir, py = L.rimY - 74;
    this.shots.push({ tier, money, err, pos, wall });
    const pts = rules.applyOutcome(cfg, this, tier, this.shot);   // score, streak and Heat: the shared rules, same as a server replay
    if (made) {
      this.netSwish = tier === 'ok' ? 0.6 : 1;
      this.env.burst = Math.min(1, (tier === 'perfect' ? 0.85 : tier === 'good' ? 0.55 : 0.35) + (money ? 0.25 : 0) + before * 0.1);
      this.env.groan = 0;
      play('swish', tier, before);
      if (tier === 'perfect') play('perfect'); else if (tier === 'good') play('good');
      if (money) play('money');
      play('cheer', this.env.burst);
      const col = tier === 'perfect' ? '#ffd23f' : tier === 'good' ? '#a6f56b' : '#ffffff';
      const clean = tier !== 'ok', call = clean && before >= 3 ? pick(FIRE_CALLS, this.shot) : clean && before >= 2 && tier === 'perfect' ? pick(HOT_CALLS, this.shot) : pick(CALLS[tier], this.shot);
      const igniting = before === 2 && this.heatPts >= 3 * cfg.heat.perLevel;   // this make sets you on fire: the ON FIRE banner is the call
      if (!igniting) this.popup(call, px, py, before >= 3 && clean ? '#ff7a2a' : col, (tier === 'perfect' ? 40 : 30) + (before >= 3 ? 6 : 0));
      if (this.streak >= 3 && before >= 1 && !igniting) this.popup(`${this.streak} STRAIGHT`, L.shooterX, L.shooterY - 300 * L.charScale, HEAT_LEVELS[Math.max(1, before)].color, 24, 0.9, 0.1);
      this.popup(money ? `+${pts} MONEY!` : `+${pts}`, L.hoopX + 6, L.rimY + 34, money ? '#ffd23f' : '#fff', money ? 30 : 24, 0.9, 0.12);
      this.emit('spark', L.hoopX, L.rimY + 20, tier === 'perfect' ? 16 : 8, { color: col });
      if (tier === 'perfect') this.emit('star', L.hoopX, L.rimY, 8 + before * 4, {});
      // shockwave rings off the rim grow with Heat (perfects get a second ring)
      const ringCol = before ? HEAT_LEVELS[before].color : '#ffffff', hs = L.hoopScale || 1;
      if (before >= 1 || tier === 'perfect') this.emit('ring', L.hoopX, L.rimY + 4 * hs, 1, { color: ringCol, size: (40 + before * 22) * hs });
      if (tier === 'perfect' && before >= 1) this.emit('ring', L.hoopX, L.rimY + 4 * hs, 1, { color: '#fff3a0', size: (70 + before * 30) * hs, delay: 0.08 });
      this.kick = Math.max(this.kick, [0.15, 0.3, 0.5, 0.85][before] * (tier === 'perfect' ? 1 : tier === 'good' ? 0.7 : 0.4));
      if (before >= 3 && tier === 'perfect') { this.flash = Math.max(this.flash, 0.35); this.flashColor = '255,170,70'; }
      if (money) this.emit('coin', L.hoopX, L.rimY + 10, 10, {});
      if (fire) { this.emit('fire', L.hoopX, L.rimY + 20, tier === 'perfect' ? 44 : 30, { spread: 70 }); this.shake = Math.max(this.shake, 0.5); }
      this.emote = { type: 'celebrate', name: money ? 'money' : tier === 'perfect' ? 'perfect' : 'make', t: 0, tier };
    } else {
      this.env.groan = 1; this.env.burst = 0;
      if (kind === 'rim') play('rim'); else if (kind === 'board') play('backboard'); else play('airball');
      play('groan'); if (kind !== 'rim') play('missVoice');
      if (before >= 2) { play('fizzle', before); this.flash = before >= 3 ? 0.3 : 0.15; this.flashColor = '150,200,255'; }
      this.popup(pick(CALLS[kind], this.shot), px, py, '#ff8d8d', 30);
      const bad = kind === 'air' || kind === 'long';
      this.emote = { type: 'sad', name: bad ? 'badMiss' : 'miss', t: 0, big: bad };
      const line = bad && before < 2 && this.say('badMiss');
      if (line) this.popup(line, L.shooterX, L.shooterY - 300 * L.charScale, '#fff', 22, 1.0, 0.15);
      if (kind === 'board') this.shake = Math.max(this.shake, 0.35);
    }
    const after = this.heatLevel;
    this.maxHeat = Math.max(this.maxHeat, after);
    this.settleExtra = this.lastInRack && !this.isOver ? 0.12 : 0;   // last ball of a rack: hold the reaction a beat before moving
    if (this.emote) this.emote.heat = after;
    if (after > before && after >= 2) this.emote.name = after === 3 ? 'fire' : 'hot';      // entering Hot / On Fire beats the shot's own reaction
    if (after < before && before >= 2) this.emote.name = 'cool';                           // losing real Heat beats a plain miss
    this.voice(this.emote.name, after);                                                     // the character's own sound for the moment that won
    if (after > before) {
      const hl = HEAT_LEVELS[after];
      this.banner = { text: hl.name + (after === 3 ? '!!!' : '!'), t: 0, dur: after === 3 ? 1.3 : 0.9, color: hl.color, big: after === 3 };
      play('heatUp', after);
      if (after === 3) {
        play('onFire'); this.shake = 1; this.env.burst = 1; this.kick = 1; this.flash = 1; this.flashColor = '255,190,90';
        this.emit('fire', L.shooterX, L.shooterY - 60, 60, { spread: 90 });
        this.emit('ring', L.shooterX, L.shooterY - 120 * L.charScale, 1, { color: '#ff5a1f', size: 260 });
        const fireLine = this.say('fire');
        if (fireLine) this.popup(fireLine, L.shooterX, L.shooterY - 330 * L.charScale, '#ffd23f', 26, 1.4, 0.35);
        this.settleExtra = 0.45;
      } else {
        this.settleExtra = 0.15; this.kick = Math.max(this.kick, after === 2 ? 0.5 : 0.3);
        this.emit('ember', L.shooterX, L.shooterY - 100 * L.charScale, after === 2 ? 26 : 12, { spread: 120 });
      }
    } else if (after < before) {
      play('cool');
      this.popup(before >= 3 ? "FIRE'S OUT" : 'COOLED OFF', L.shooterX + 10, L.shooterY - 270, '#9fdcff', before >= 3 ? 32 : 24, 1.0);
      const coolLine = before >= 2 && this.say('cool');
      if (coolLine) this.popup(coolLine, L.shooterX, L.shooterY - 300 * L.charScale, '#fff', 22, 1.0, 0.3);
      this.emit('steam', L.shooterX, L.shooterY - 150, 10 + before * 8, { spread: 30 + before * 20 });
    }
    setMusicHeat(after);
    this.env.heat = after; this.env.score = this.score;
    this.dirty = true;
    this.mod.fire('result', { shot: this.shot, tier, made, money, pts, kind: kind || null, heatBefore: before, heatAfter: after, streak: this.streak, score: this.score });
    if (after !== before) this.mod.fire('heat', { from: before, to: after });
    this.setPhase('settle');
  }

  /** The character's own sound for a reaction moment (through play(), so a bad kit can never break the game). */
  voice(moment, heat) { const snd = this.character.sound; if (snd && moment) play('voice', snd.kit, moment, heat); }

  popup(text, x, y, color, size, dur = 0.85, delay = 0) { this.popups.push({ text, x, y, color, size, t: -delay, dur }); }

  emit(type, x, y, n, o) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) return;
      const ang = Math.random() * 6.28, sp = 60 + Math.random() * 200, sprd = o.spread || 14;
      const p = { type, x: x + (Math.random() - 0.5) * sprd, y: y + (Math.random() - 0.5) * sprd * 0.6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 80, life: 0, max: 0.4 + Math.random() * 0.4, size: 3 + Math.random() * 4, color: o.color || '#fff', rot: Math.random() * 6 };
      if (type === 'fire') { p.vx *= 0.35; p.vy = -60 - Math.random() * 160; p.size = 6 + Math.random() * 9; p.max = 0.3 + Math.random() * 0.45; }
      if (type === 'steam') { p.vx *= 0.2; p.vy = -40 - Math.random() * 60; p.size = 8 + Math.random() * 8; p.max = 0.7 + Math.random() * 0.4; }
      if (type === 'coin' || type === 'star') { p.vy -= 140; p.max += 0.3; p.size = type === 'star' ? 9 : 6; }
      if (type === 'ring') { p.vx = p.vy = 0; p.size = o.size; p.max = 0.45; p.life = -(o.delay || 0); }
      if (type === 'ember') { p.vx = (Math.random() - 0.5) * 30; p.vy = -40 - Math.random() * 70; p.size = 1.6 + Math.random() * 2.2; p.max = 0.9 + Math.random() * 1.1; p.color = Math.random() < 0.5 ? '#ffd23f' : '#ff8a1f'; }
      this.particles.push(p);
    }
  }

  /** The run has ended (with the shot just landed counted): the last shot, or a miss in a distance run. */
  get isOver() { return rules.runOver(this.cfg, this, this.shots.length); }
  /** Feet made so far in a distance run (0 in a contest). */
  get feet() { return this.distance ? madeDistance(this.makes) : 0; }

  advance() {
    const over = this.isOver;
    this.shot++;
    this.dirty = true;
    if (over) {
      this.setPhase('finish');
      this.mod.fire('end', { score: this.score });
      const s = this.score;
      // distance runs react to feet made; a beaten Daily gets the biggest celebration
      const big = this.distance ? this.feet >= REACT.big : s >= GOOD_GAME, poor = this.distance ? this.feet < REACT.poor : s < POOR_GAME;
      const top = this.distance ? this.makes >= this.total : s >= 26;
      const name = big ? 'winBig' : poor ? 'winPoor' : 'make';
      this.emote = { type: name === 'winPoor' ? 'sad' : 'celebrate', name, t: 0, tier: top ? 'perfect' : 'good', heat: top ? 3 : big ? 2 : 1 };
      this.voice(name, this.heatLevel);
      return;
    }
    if (this.ballInRack === 0) {                      // rack done: jog round the arc to the next spot
      const next = this.spot;
      this.moveFrom = { ...this.view }; this.moveDir = Math.sign(next.shooter - this.view.shooter) || 0;
      if (this.distance) this.moveDir = -this.L.dir;   // backing away from the hoop
      this.env.rack = this.rack + 1;
      const spotBanner = { text: next.name, sub: next.sub || (this.rack === this.cfg.racks - 1 ? 'LAST RACK' : `RACK ${this.rack + 1}`), t: -0.12, dur: 0.95, color: '#fff' };
      if (this.banner && this.banner.color !== '#fff') { spotBanner.t = 0; spotBanner.dur = 0.8; this.bannerNext = spotBanner; }
      else this.banner = spotBanner;
      play('rack'); this.setPhase('move');
      this.mod.fire('rack', { rack: this.rack, spot: next.id, name: next.name });
    } else { this.heldLocal = null; this.setPhase('grab'); }
  }

  update(dt, nowTs) {
    this.lastTs = nowTs;
    if (this.paused) return;
    this.time += dt; this.t += dt;
    const cfg = this.cfg, e = this.env, heat = this.heatLevel;
    e.t = this.time; e.burst = Math.max(0, e.burst - dt * 1.0); e.groan = Math.max(0, e.groan - dt * 1.2);
    e.hype = clamp([0.1, 0.3, 0.55, 0.95][heat] + cfg.visual.crowdBoost + this.crowdMod + e.burst * 0.7, 0, 1) * (1 - e.groan * 0.6);
    this.netSwish = Math.max(0, this.netSwish - dt * 2.6);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.kick = Math.max(0, this.kick - dt * 3.2); this.flash = Math.max(0, this.flash - dt * 2.6);
    if (this.emote) this.emote.t += dt;
    this.mod.fire('frame', { dt });

    switch (this.phase) {
      case 'rackIntro':
        this.rackSlide = easeOut(clamp(this.t / cfg.timing.rackIntro, 0, 1));
        if (this.t >= cfg.timing.rackIntro) { this.rackSlide = 1; this.heldLocal = null; this.setPhase('grab'); }
        break;
      case 'move': {
        const u = clamp(this.t / cfg.timing.move, 0, 1), to = this.spot, from = this.moveFrom;
        let k = clamp((u - MOVE_JOG[0]) / (MOVE_JOG[1] - MOVE_JOG[0] + 0.06), 0, 1); k = k * k * (3 - 2 * k);
        if (u >= MOVE_JOG[0] && this.emote) this.emote = null;   // reaction is over once the jog starts
        const snd = this.character.sound;                         // footsteps while jogging, then the plant
        if (snd && u >= MOVE_JOG[0] && u < MOVE_JOG[1] && this.time - (this.lastStep || 0) >= (snd.step || 0.2)) { this.lastStep = this.time; play('step', snd.kit, (this.steps = (this.steps || 0) + 1) % 2); }
        if (snd && u >= MOVE_JOG[1] && !this.planted) { this.planted = true; play('voice', snd.kit, 'plant'); }
        if (u < MOVE_JOG[1]) this.planted = false;
        const prevHoop = this.L.hoopX;
        for (const key of ['side', 'shooter', 'hoop', 'sy', 'cam', 'back', 'hoopScale', 'hoopBack', 'charScale', 'angle', 'dist']) if (Number.isFinite(to[key]) && Number.isFinite(from[key])) this.view[key] = lerp(from[key], to[key], k);
        this.setBase(this.base);
        const dx = this.L.hoopX - prevHoop;           // loose balls ride along with the hoop
        if (dx) for (const b of this.balls) for (const sg of b.segs) { sg.x0 += dx; sg.x1 += dx; }
        this.rackEmpty = u < 0.5;                     // old (empty) rack rolls away, a full one rolls in
        this.rackSlide = u < 0.22 ? 1 - u / 0.22 : u > 0.68 ? easeOut((u - 0.68) / 0.32) : 0;
        if (u >= 1) { this.view = { ...to }; this.setBase(this.base); this.rackSlide = 1; this.rackEmpty = false; this.heldLocal = null; this.setPhase('grab'); }
        break;
      }
      case 'grab': {
        const u = clamp(this.t / cfg.timing.grab, 0, 1), s = this.slotPos(this.ballInRack), L = this.L, k = easeOut(u);
        this.held = { x: lerp(s.x, L.shooterX + L.dir * (L.back ? 8 : 18) * L.charScale, k), y: lerp(s.y, L.shooterY - 104 * L.charScale, k) - Math.sin(u * Math.PI) * 16 };
        this.heldLocal = [((this.held.x - L.shooterX) * L.dir) / L.charScale, (this.held.y - L.shooterY) / L.charScale];
        this.meterPos = 0; this.zoneT = 0;
        if (u >= 1) { play('catch'); this.emote = null; this.setPhase('meter'); this.mod.fire('shot', { shot: this.shot, rack: this.rack, ball: this.ballInRack, money: this.isMoney }); }
        break;
      }
      case 'meter': {
        const pos = this.t / this.sweep;
        if (pos >= 1) { this.release(1); break; }
        this.meterPos = pos; this.zoneT = this.t; this.updateHeld(meterPose(pos, this.baseTarget));
        break;
      }
      case 'flight': if (this.t > 3) { if (this.pending) this.resolve('miss', 'long'); else this.setPhase('settle'); } break;   // watchdog
      case 'settle': if (this.t >= cfg.timing.settle + this.settleExtra) this.advance(); break;
      case 'finish': if (this.t >= cfg.timing.finish) { this.setPhase('done'); this.dispose(); this.onDone && this.onDone(this.stats()); } break;
    }

    // loose balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i]; b.t += dt;
      let seg = b.segs[b.i];
      while (seg && b.t >= seg.dur) {
        b.t -= seg.dur;
        if (seg.onAt && !seg.fired) { seg.fired = 1; seg.onAt(); }
        seg.onEnd && seg.onEnd();
        seg = b.segs[++b.i];
      }
      if (!seg) { this.balls.splice(i, 1); continue; }
      const u = b.t / seg.dur;
      if (seg.onAt && !seg.fired && u >= seg.at) { seg.fired = 1; seg.onAt(); }
      b.x = lerp(seg.x0, seg.x1, u);
      b.y = lerp(seg.y0, seg.y1, seg.fall ? u * u : u) - seg.peak * 4 * u * (1 - u);
      b.behind = !!seg.behind; b.alpha = seg.fade ? 1 - u : 1; b.rot += dt * b.spin;
      b.r = b.i === 0 ? lerp(b.r0, b.r1, u) : b.r1;        // the ball shrinks as it flies away from the camera
      if (this.phase === 'move') { if (this.t > 0.2) { this.balls.splice(i, 1); continue; } b.alpha *= 1 - this.t / 0.2; }   // last shot's ball fades as we move on
      if (b.fire && b.i === 0) this.emit('fire', b.x, b.y, 2, { spread: 10 });
      if (b.heat >= 1) {                                // heat trail behind the flying ball
        if (b.i === 0) b.trail.push(b.x, b.y);
        if (b.trail.length > [0, 10, 16, 24][b.heat] || (b.i > 0 && b.trail.length)) b.trail.splice(0, 2);
        if (b.heat === 2 && b.i === 0 && Math.random() < 0.5) this.emit('spark', b.x, b.y, 1, { color: '#ffb347', spread: 6 });
      }
    }
    // ambient heat: sparks off the held ball from Heating Up, embers rising across the court from Hot
    if (this.held && heat >= 1 && heat < 3 && Math.random() < dt * [0, 4, 10][heat]) this.emit('spark', this.held.x, this.held.y, 1, { color: heat === 2 ? '#ff8a1f' : '#ffd23f', spread: 14 });
    if (heat >= 2 && Math.random() < dt * (heat === 3 ? 16 : 5)) this.emit('ember', Math.random() * this.L.w, this.L.h - 10, 1, { spread: 0 });
    if (heat >= 3) {
      if (this.held) this.emit('fire', this.held.x, this.held.y - 6, 1, { spread: 12 });
      if (Math.random() < 0.5) this.emit('fire', this.L.shooterX + (Math.random() - 0.5) * 50, this.L.shooterY, 1, { spread: 6 });
    }
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      if (p.life < 0) continue;                       // delayed ring
      if (p.type === 'ember') p.vx += Math.sin(p.life * 5 + p.rot) * 60 * dt;
      else if (p.type !== 'fire' && p.type !== 'steam' && p.type !== 'ring') p.vy += 620 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 8;
    }
    for (let i = this.popups.length - 1; i >= 0; i--) { const p = this.popups[i]; p.t += dt; if (p.t >= p.dur) this.popups.splice(i, 1); }
    if (this.banner) { this.banner.t += dt; if (this.banner.t >= this.banner.dur) { this.banner = this.bannerNext || null; this.bannerNext = null; } }
  }

  shooterPose() {
    const heat = this.heatLevel, p = { crouch: 0, jump: 0, lean: 0, expr: 'neutral', t: this.time, facing: this.L.dir };
    const hold = () => { if (!this.heldLocal) return; const [bx, by] = this.heldLocal; p.hands = { r: [bx + 10, by + 8], l: [bx - 12, by + 3] }; };
    const sinceRel = this.lastRelease ? this.time - this.lastRelease.time : 99;
    if (this.phase === 'grab') {
      const u = clamp(this.t / this.cfg.timing.grab, 0, 1);
      p.lean = -0.1 * (1 - u); hold();
      if (this.emote && this.emote.type === 'celebrate') p.expr = heat >= 3 ? 'crazed' : 'happy'; else p.expr = 'focus';
      stylePose(this.character, p, 'set', this.time);
    } else if (this.phase === 'meter') {
      const m = meterPose(this.meterPos, this.baseTarget);
      p.crouch = m.crouch; p.jump = m.jump; p.expr = heat >= 3 ? 'crazed' : 'focus';
      hold(); stylePose(this.character, p, 'set', this.time);   // face and head only: the ball stays in the hands
    } else if (this.phase === 'move') {
      // reaction -> turn -> jog -> turn -> plant. Each change of facing happens while the body is squashed edge-on
      // (a cartoon turn), so nothing pops.
      const u = clamp(this.t / this.cfg.timing.move, 0, 1), J0 = MOVE_JOG[0], J1 = MOVE_JOG[1];
      const squash = Math.max(0.38, Math.min(1, Math.min(Math.abs(u - J0), Math.abs(u - J1)) / 0.07));
      if (u < J0) {                                   // finish the reaction
        p.jump = Math.max(0, this.jumpAtRelease * (1 - sinceRel / 0.22));
        if (this.emote) applyEmote(this.character, p, this.emote, heat);
      } else if (u < J1) {                            // jog to the next spot
        const sw = Math.sin(this.time * 22);
        if (this.moveDir) p.facing = this.moveDir;
        p.jump = Math.abs(sw) * 8; p.lean = 0.13; p.hands = { r: [26 + sw * 24, -104], l: [-18 - sw * 24, -104] }; p.wind = 1;
        p.expr = heat >= 3 ? 'crazed' : 'happy';
        stylePose(this.character, p, 'jog', this.time, { sw });   // each character's own way of getting there
        if (heat >= 3) p.expr = 'crazed';
      } else {                                        // plant: back to the camera, knees dip, hands up ready for the ball
        const v = (u - J1) / (1 - J1);
        p.crouch = 0.28 * Math.sin(Math.PI * v); p.hands = { r: [20, -112 - p.crouch * 20], l: [-12, -108 - p.crouch * 20] };
        p.expr = 'focus'; p.plant = true;
        stylePose(this.character, p, 'plant', this.time, { v });
      }
      p.flipX = (p.flipX ?? 1) * squash;
    } else if (this.phase !== 'ready') {
      p.jump = Math.max(0, this.jumpAtRelease * (1 - sinceRel / 0.22));
      if (this.emote) applyEmote(this.character, p, this.emote, heat);
      else if (sinceRel < 1.5) {                       // follow-through: shooting arm snaps up and forward, guide hand stays up on the other side
        const top = reachTop(this.character), k = clamp(sinceRel / 0.12, 0, 1);
        p.hands = { r: [lerp(28, 46, k), top + 4 + k * 8], l: [lerp(6, -14, k), top + 14 + k * 22] };
        p.expr = heat >= 3 ? 'crazed' : 'focus'; p.lean = 0.05 * k;
      }
    }
    p.back = p.back || this.L.back && (p.plant || (!this.emote && (this.phase === 'grab' || this.phase === 'meter' || this.phase === 'flight' || this.phase === 'settle')));
    if (p.back) p.turn = this.turn();
    if (heat >= 3 && !p.headShake) p.headShake = Math.sin(this.time * 38) * 1.6;
    return p;
  }

  /** The run written down for storage or submission. Format and meaning: see "the run record" in rules.js. */
  record() {
    const wallMs = this.startWall == null ? 0 : Math.max(0, Math.round(this.lastTs - this.startWall));
    return {
      v: rules.RECORD_VERSION, game: GAME.id, mode: this.mode, format: this.format, rules: GAME.rules, rulesHash: rules.rulesHash(this.cfg), build: null,
      seed: this.seed, dice: this.dice, modifierId: this.modifier ? this.modifier.id : null,
      mapId: this.map.id, characterId: this.character.id,
      runId: this.runId, challenge: null, attempt: 1, token: null,
      startedAt: this.startedAt, wallMs, gameMs: Math.round((this.time - this.startTime) * 1000), pauses: this.pauses,
      shots: this.shots.map((s) => [Math.round(s.pos * rules.POS_UNITS), s.wall || 0]),
      claim: { score: this.score, makes: this.makes, perfects: this.perfects, moneyMade: this.moneyMade, maxHeat: this.maxHeat, bestStreak: this.bestStreak },
    };
  }

  stats() {
    return {
      score: this.score, makes: this.makes, total: this.total, perfects: this.perfects, moneyMade: this.moneyMade,
      maxHeat: this.maxHeat, bestStreak: this.bestStreak,
      // pos = where on the meter each ball was released. With seed + rules + modifier that is everything needed to
      // replay the run and recompute the score, so a server never has to trust the number the client sends.
      shots: this.shots.map((s) => ({ tier: s.tier, money: s.money, pos: s.pos })),
      seed: this.seed, rules: GAME.rules,
      record: this.record(),
      mode: this.mode, practice: this.practice, mapId: this.map.id, characterId: this.character.id,
      modifierId: this.modifier ? this.modifier.id : null,
      format: this.format,
      // Daily Distance: how far the run got. `stage` = stages made, `distance` = feet of the last one made.
      ...(this.distance ? { stage: this.makes, stages: this.total, distance: this.feet, completed: this.makes >= this.total } : {}),
    };
  }
}
