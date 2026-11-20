// App shell: screens, HUD, input, main loop. Game rules live in engine/game.js.
import { CONFIG, HEAT_LEVELS } from './config.js';
import { CHARACTERS, getCharacter, drawPortrait, applyEmote, lineOf } from './content/characters.js';
import { MAPS, getMap, DAILY_ARENA } from './content/maps.js';
import { Contest, GOOD_GAME, POOR_GAME } from './engine/game.js';
import { computeLayout, drawScene } from './engine/render.js';
import { initAudio, sfx, startMusic, setMusicHeat, setMuted, suspendAudio, resumeAudio } from './engine/audio.js';
import { getModifier, checkLibrary } from './content/modifiers.js';
import * as rules from './engine/rules.js';
import { save, persist } from './services/storage.js';          // this game's local progress (best score, unlocks, settings)
import { reportError, BUILD } from './services/telemetry.js';
import { services, dailyBoard } from './services/index.js';     // everything that could one day be a server
import { summarizeRun, shotCode, releaseProfile } from './services/analytics.js';
import { shareText, renderShareCard, rackPoints, rackLevel, rackMax, RACK_SCALE } from './services/share.js';
import { STAGES, madeDistance, distanceResult, REACT } from './content/distance.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const canvas = $('#game'), ctx = canvas.getContext('2d');
let L = null, dpr = 1, lastTs = 0;

const app = {
  screen: 'home', contest: null, time: 0,
  scene: { map: MAPS[0], character: CHARACTERS[0], env: { t: 0, hype: 0.25, burst: 0, groan: 0, heat: 0, score: 0, rack: 1 } },
  setup: { mode: 'quick', charId: save.lastChar, mapId: save.lastMap },
  lastOpts: null, results: null, attractT: 0, attractI: 0,
};
// Debug handle for the console. Local development only (or ?debug): nothing public should depend on it.
const DEV = /^(localhost$|127\.|\[::1\])/.test(location.hostname) || /[?&]debug\b/.test(location.search);
if (DEV) {
  window.__app = app;
  // every modifier, and every pair that may be combined, is checked against the house rules (30 max, perfect smallest…)
  try { const lib = checkLibrary(rules.configFor); if (lib.problems.length) console.error('[modifiers]', lib.problems); } catch (err) { console.error('[modifiers]', err); }
}
const track = (name, data) => services.analytics.track(name, data);
/** Today's challenge from the daily service (plain ids), resolved against this build's maps. The Daily is Daily
 *  Distance (content/distance.js): no modifier, the walk back from the rim is the challenge. */
function getDaily() {
  const def = services.daily.today();
  return { ...def, format: 'distance', map: getMap(def.mapId) };
}
const isDistance = (r) => !!r && r.format === 'distance';
/** "47 FT", or "FULL COURT" for a beaten Daily. Numbers coerced: the result may come from storage. */
const feetText = (r) => distanceResult(num(r.stage)).line;   // "47 FT", "HALF COURT", "BEAT THE DAILY", "MISSED THE LAYUP"
const num = (v) => (Number.isFinite(+v) ? +v : 0);   // anything read back from storage or a server is coerced before it touches innerHTML
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

const isUnlocked = (c) => !c.locked || save.unlocked.includes(c.id);
const charName = (c) => (c.locked && isUnlocked(c) ? c.unlockedName : c.name);

// ------------------------------------------------------------------ canvas / loop
const MAX_PIXELS = 2560 * 1440;
function resize() {
  // Size from the canvas element, not the window: if a banner or a portal frame ever takes part of the screen,
  // that becomes a CSS change. Total pixels are capped so 4K / high-density screens don't pay for detail nobody sees.
  const W = canvas.clientWidth || window.innerWidth, H = canvas.clientHeight || window.innerHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / Math.max(1, W * H)));
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  L = computeLayout(W, H);
  if (app.contest) app.contest.setBase(L);
}
window.addEventListener('resize', resize);
let adResize = 0;   // banners are re-fitted after a rotation or window resize, not on every pixel of a drag
window.addEventListener('resize', () => { clearTimeout(adResize); adResize = setTimeout(() => placeAds(), 300); });
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if ((canvas.clientWidth || 0) * dpr !== canvas.width) resize(); }).observe(canvas);

function frame(ts) {
  requestAnimationFrame(frame);          // schedule first: one bad frame must never stop the game
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0); lastTs = ts;
  app.time += dt; app.dt = dt;
  try {
    const c = app.contest;
    if (c) { c.update(dt, ts); if (c.dirty) updateHud(); }
    else {
      const e = app.scene.env; e.t = app.time; e.hype = 0.25 + Math.sin(app.time * 0.6) * 0.1;
      if (app.screen === 'home') { app.attractT += dt; if (app.attractT > 4) { app.attractT = 0; const pool = CHARACTERS.filter(isUnlocked); app.attractI = (app.attractI + 1) % pool.length; app.scene.character = pool[app.attractI]; } }
    }
    ctx.setTransform(dpr * L.s, 0, 0, dpr * L.s, 0, 0);
    ctx.globalAlpha = 1;
    drawScene(ctx, app.contest ? app.contest.L : L, { map: app.scene.map, character: app.scene.character, contest: app.contest, time: app.time, env: app.scene.env });
    if (app.screen === 'results' && app.results) drawResultChar();
  } catch (err) {
    reportError('frame', err);
    ctx.setTransform(1, 0, 0, 1, 0, 0);   // unwind any half-finished save()/transform
    for (let i = 0; i < 40; i++) ctx.restore();
  }
}

// ------------------------------------------------------------------ input
function shoot(e) {
  initAudio(); startMusic();
  if (app.screen !== 'play' || !app.contest) return;
  if (e) e.preventDefault();
  app.contest.input(performance.now());
}
canvas.addEventListener('pointerdown', shoot);
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if ((e.code === 'Space' || e.code === 'Enter') && app.screen === 'play' && $('#modal').classList.contains('hidden')) shoot(e);
  if (e.code === 'Escape' && app.screen === 'play') pauseGame();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  initAudio(); startMusic(); sfx.click();
  b.blur();   // otherwise Space (the shoot key) would also re-press whichever button was clicked last, e.g. mute
}, true);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());   // long-press / right-click menu over the game
function onHidden() { suspendAudio(); if (app.screen === 'play' && app.contest && app.contest.phase !== 'ready') pauseGame(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) onHidden(); else resumeAudio(); });
window.addEventListener('pagehide', () => { onHidden(); if (app.screen === 'play') abandoned('left'); });

// ------------------------------------------------------------------ screens
function show(screen) {
  app.screen = screen;
  for (const id of ['home', 'setup', 'results']) $('#' + id).classList.toggle('hidden', id !== screen);
  $('#hud').classList.toggle('hidden', screen !== 'play');
  closeModal();
  placeAds();
  syncBack();
}

// Browser back button. While off the home screen there is exactly one extra history entry (the "guard"), so back
// stays in the game: popup → closed, setup/results → home, playing → pause menu (never an instant quit). On home the
// guard is removed, so back leaves the site as normal.
let guarded = false;
function syncBack() {
  try {
    if (app.screen !== 'home' && !guarded) { history.pushState({ hc: 1 }, ''); guarded = true; }
    else if (app.screen === 'home' && guarded) { guarded = false; history.back(); }
  } catch { /* history unavailable: back just leaves, as before */ }
}
window.addEventListener('popstate', (e) => {
  guarded = false;
  if (e.state && e.state.hc) { if (app.screen === 'home') history.back(); else guarded = true; return; }   // forward button: nothing ahead to go to
  if (app.screen === 'home') return;
  if (!$('#modal').classList.contains('hidden') && !(app.contest && app.contest.paused)) closeModal();
  else if (app.screen === 'play') pauseGame();
  else goHome();
  syncBack();
});

// Banner placements belong to a screen: `results` under the results card, `menu` at the foot of the home screen.
// Nothing is ever placed on the play or setup screens. With no ad provider this returns at the first check.
function placeAds(force) {
  const { ads } = services, key = `${app.screen}:${app.gamesPlayed || 0}:${window.innerWidth}x${window.innerHeight}`;
  if (key === app.adKey && !force) return;
  app.adKey = key;
  ads.hide('results'); ads.hide('menu');
  if (!ads.isAvailable()) return;
  if (app.screen === 'results') {
    // free height under the card, keeping room for the badge row that appears after the score count-up
    const s = $('#results'), cs = getComputedStyle(s);
    const free = s.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - $('.res-panel').offsetHeight - 12 - 34;
    ads.show('results', { container: $('#ad-results'), room: { w: s.clientWidth - 32, h: free } });
  } else if (app.screen === 'home') {
    // only if the open scene between the tagline and the buttons stays at least 120 px tall
    const s = $('#home'), gap = $('.home-btns').getBoundingClientRect().top - $('.tagline').getBoundingClientRect().bottom;
    ads.show('menu', { container: $('#ad-menu'), room: { w: s.clientWidth - 32, h: gap - 120 - 12 } });
  }
}

function goHome() {
  if (app.contest) app.contest.dispose();
  app.contest = null; setMusicHeat(0);
  const d = getDaily();
  renderDailyCard(d);
  $('#quick-sub').textContent = save.best ? `Your best: ${save.best}/30` : 'Pick a hooper. Shoot your shot.';
  app.scene.map = d.map;
  show('home');
}

/** The Daily is the headline act: today's challenge, or today's result once the official run is in, with the streak,
 *  the personal best and (once played) when the next one opens. Quick Play's button is unchanged. */
function renderDailyCard(d = getDaily()) {
  app.homeDate = d.date;
  const mine = services.daily.myResult(d.date), h = dailyHistory(d.date), streak = num(h.streak), best = num(h.best);
  $('#daily-kicker').textContent = mine ? `TODAY'S DAILY · ✓ COMPLETED` : `TODAY'S CHALLENGE · #${d.number}`;
  $('#daily-sub').textContent = mine ? (mine.completed ? 'YOU BEAT THE DAILY 🏆' : `YOU MADE IT TO ${feetText(mine)}`) : 'HOW FAR CAN YOU GET?';
  $('#daily-meta').textContent = [streak ? `🔥 ${streak}-DAY STREAK${mine ? '' : ' · KEEP IT ALIVE'}` : '', best ? `BEST ${best} FT` : ''].filter(Boolean).join('  ·  ')
    + (mine ? `\nNEXT DAILY IN ${untilTomorrow()}` : '');
  $('#daily-cta').textContent = mine ? "PRACTICE TODAY'S RUN" : 'ENTER THE DAILY';
  $('#btn-daily').classList.toggle('done', !!mine);
}
// Sitting on the menu: the countdown keeps ticking, and when midnight UTC passes the card turns into the new Daily.
setInterval(() => {
  try { if (app.screen !== 'home') return; const d = getDaily(); if (d.date !== app.homeDate) goHome(); else renderDailyCard(d); }
  catch (err) { reportError('daily', err); }
}, 30000);

// ---- setup
function openSetup(mode) {
  app.setup.mode = mode;
  const d = getDaily(), daily = mode === 'daily';
  if (!CHARACTERS.some((c) => c.id === app.setup.charId) || !isUnlocked(getCharacter(app.setup.charId))) app.setup.charId = CHARACTERS[0].id;   // retired or locked: back to the first hooper
  $('#setup-title').textContent = daily ? `DAILY #${d.number}` : 'QUICK PLAY';
  $('#map-block').classList.toggle('hidden', daily);
  const info = $('#daily-info'); info.classList.toggle('hidden', !daily);
  if (daily) {
    const mine = services.daily.myResult(d.date);
    track('daily_viewed', { daily: d.number, date: d.date, modifier: null, played: !!mine });
    // The pre-game: the stakes in one glance. Official or practice is said here, on the button, and on the court.
    info.classList.toggle('practice', !!mine);
    info.innerHTML = mine
      ? `<div><b>PRACTICE TODAY'S RUN</b><small class="diff">SAME ${STAGES.length} STAGES · ${esc(d.map.name.toUpperCase())}</small><span class="stakes"><i>DOESN'T COUNT</i><i>OFFICIAL: ${esc(feetText(mine))}</i></span></div>`
      : `<div><b>DAILY DISTANCE</b><small class="diff">HOW FAR CAN YOU GET?</small><span class="stakes"><i>TODAY'S RUN</i><i>ONE MISS = DONE</i><i>RIM → FULL COURT</i></span><span class="run-kind official">OFFICIAL · YOUR ONE SHOT TODAY</span></div>`;
    app.scene.map = d.map;                                 // the arena is saved for the entrance
  }
  const hist = $('#daily-hist');
  if (hist) { hist.classList.toggle('hidden', !daily); hist.innerHTML = daily ? dailyStrip(d.date) : ''; }
  renderChars(); if (!daily) renderMaps();
  $('#btn-go .big').textContent = !daily ? 'TIP OFF!' : services.daily.myResult(d.date) ? "PRACTICE TODAY'S RUN" : 'ENTER THE ARENA';
  $('#btn-go').classList.toggle('btn-daily', daily && !services.daily.myResult(d.date));
  show('setup');
}

function renderChars() {
  const row = $('#char-row'); row.innerHTML = '';
  for (const c of CHARACTERS) {
    const unlocked = isUnlocked(c);
    const b = el('button', 'card char-card' + (c.id === app.setup.charId ? ' sel' : '') + (unlocked ? '' : ' locked'));
    const cv = el('canvas'); b.appendChild(cv); row.appendChild(b);
    drawPortrait(cv, c, { locked: !unlocked, pose: { t: 0, expr: c.id === app.setup.charId ? 'happy' : 'neutral' } });
    const goal = unlockGoal(c);
    if (!unlocked && goal) b.appendChild(el('div', 'lock-prog', `<i style="width:${Math.round((goal.have / goal.need) * 100)}%"></i><span>🔒 ${goal.have}/${goal.need}</span>`));
    b.onclick = () => {
      if (!unlocked) { $('#char-blurb').innerHTML = `<b>??? — Locked</b>Make ${num(c.unlock.value)} of 25 shots in one game to unlock.${goal ? ` Your best so far: <b class="inl">${goal.have}/${goal.need}</b>` : ''}`; return; }
      if (c.id !== app.setup.charId) track('character_selected', { character: c.id, mode: app.setup.mode });
      app.setup.charId = c.id; app.scene.character = c; renderChars();
    };
  }
  const c = getCharacter(app.setup.charId); app.scene.character = c;
  $('#char-blurb').innerHTML = `<b>${esc(charName(c))}</b>${esc(c.tagline)}`;
}

function renderMaps() {
  const row = $('#map-row'); row.innerHTML = '';
  const add = (id, name, map) => {
    const b = el('button', 'card map-card' + (id === app.setup.mapId ? ' sel' : ''));
    if (map) {
      const cv = el('canvas'); b.appendChild(cv);
      const d = Math.min(2, window.devicePixelRatio || 1); cv.width = 128 * d; cv.height = 78 * d;
      const c2 = cv.getContext('2d'), s = (128 * d) / 560; c2.setTransform(s, 0, 0, s, 0, 0);
      map.draw(c2, { w: 560, h: 341, groundY: 280, shooterX: 150, hoopX: 420 }, { t: 1, hype: 0.3, burst: 0, groan: 0, heat: 0, score: 0, rack: 1 });
      map._c = null;   // thumbnail layout differs from the live one
    } else b.appendChild(el('div', 'rand', '🎲'));
    b.appendChild(el('span', '', name));
    b.onclick = () => { app.setup.mapId = id; if (map) app.scene.map = map; renderMaps(); };
    row.appendChild(b);
  };
  add('random', 'Surprise me', null);
  for (const m of MAPS) add(m.id, m.name, m);
}

// ---- play
async function startGame(opts) {
  if (app.starting) return;                          // a second tap while the first is still being set up
  app.starting = true;
  try {
    const { daily: dailyService } = services;
    // Ad break point: between games, never during one. The ad service decides whether a break is due, silences the
    // game for it, and always resolves. With no provider it returns at once.
    await services.ads.show('between_games');
    app.lastOpts = opts;
    const d = getDaily(), daily = opts.mode === 'daily';
    // The daily service decides whether this run is the official one. Locally: the first of the day. Online: the server.
    let attempt = null;
    if (daily) {
      try { attempt = await withTimeout(dailyService.begin(d), 4000); }
      catch (err) { reportError('daily', err); attempt = { official: false, attempt: 1, token: null, offline: true }; }
      if (attempt.offline) toast("Can't reach the server: this run is practice.", 2600);
    }
    const warmup = !daily && !!opts.warmup;          // practice before a first daily: Classic Quick Play that never counts
    const practice = (daily && !attempt.official) || warmup;
    // The official Daily is played in the casino arena; practice and the warm-up use the day's normal map. Same game.
    const map = daily && !practice ? DAILY_ARENA : daily ? d.map : opts.mapId === 'random' ? MAPS[(Math.random() * MAPS.length) | 0] : getMap(opts.mapId);
    const character = getCharacter(opts.charId);
    save.lastChar = character.id; if (!daily && !warmup) save.lastMap = opts.mapId; persist();
    map._c = null;
    app.scene.map = map; app.scene.character = character;
    app.daily = daily ? d : null; app.attempt = attempt;
    if (app.contest) app.contest.dispose();
    // The Daily, and the warm-up before a first Daily, are Daily Distance runs. The warm-up gets its own random seed, so it
    // never previews today's stages. Quick Play is the 5 x 5 contest, exactly as before.
    const format = daily || warmup ? 'distance' : 'contest';
    const modifier = format === 'distance' ? null : devModifier();
    app.contest = new Contest({ character, map, mode: opts.mode, format, modifier, seed: daily ? d.seed : null, practice, layout: L, onDone: finishGame });
    app.runMeta = { mode: opts.mode, format, practice, character: character.id, map: map.id, modifier: modifier ? modifier.id : null, daily: daily ? d.number : null, date: daily || warmup ? d.date : null, warmup, nth: (app.gamesStarted = (app.gamesStarted || 0) + 1) };
    track('game_started', { ...app.runMeta, via: opts.via || 'setup' });
    if (warmup) { app.warmups = (app.warmups || 0) + 1; track('daily_warmup_started', { date: d.date, character: character.id, map: map.id }); }
    if (daily && !practice) {
      track('daily_started', { daily: d.number, date: d.date, character: character.id, map: map.id, modifier: null, format });
      if (app.warmups) track('daily_warmup_to_official', { date: d.date, character: character.id, warmups: app.warmups });
    }
    const dist = format === 'distance';
    buildPips($('#hud-pips'), null, app.contest.cfg.plan, dist); buildCourt(); hudScore = -1; app.results = null;
    $('#hud-court').classList.toggle('hidden', dist);
    $('.hud-score .lbl').textContent = dist ? 'DISTANCE' : 'SCORE';
    $('.hud-score').classList.toggle('dist', dist);
    const kind = daily ? (practice ? 'practice' : 'official') : warmup ? 'practice' : '';
    $('#hud-tag').textContent = daily ? (practice ? "PRACTICE · DOESN'T COUNT" : '★ OFFICIAL DAILY') : warmup ? "WARM-UP · DOESN'T COUNT" : modifier ? `${modifier.icon} ${modifier.label} · test` : '';
    $('#hud-tag').className = kind ? 'run-kind ' + kind : '';
    $('#hud-tag').style.color = modifier && modifier.theme ? modifier.theme.color : '';
    // said on the court before the first tap too, so nobody starts their official run thinking it's practice
    if (map.arena) app.contest.enterArena();
    if (dist) { app.contest.readyNote = daily && !practice ? 'OFFICIAL DAILY · ONE MISS ENDS IT' : daily ? "PRACTICE · DOESN'T COUNT" : "WARM-UP · DOESN'T COUNT"; app.contest.readyColor = daily && !practice ? '#ffd23f' : '#9fe8ff'; }
    updateHud();
    show('play');
  } finally { app.starting = false; }
}

/** Development only: ?mod=<id> plays Quick Play with a modifier (or ?mod=a.b for a pair), to try one without waiting for its day. */
function devModifier() {
  if (!DEV) return null;
  try { return getModifier(new URLSearchParams(location.search).get('mod')); } catch { return null; }
}

/** Shot dots, one group per rack. Which are money balls comes from the finished shots, else the run's shot plan.
 *  Daily Distance: one dot per stage, in one row. */
function buildPips(root, shots, plan, distance = false) {
  root.innerHTML = '';
  if (distance) {
    const g = el('div', 'pg dist'), n = plan ? plan.length : STAGES.length;
    for (let i = 0; i < n; i++) { const p = el('i', 'pip'), s = shots && shots[i]; if (s) p.classList.add(s.tier === 'miss' ? 'miss' : s.tier === 'perfect' ? 'perfect' : 'make'); g.appendChild(p); }
    root.appendChild(g); return;
  }
  for (let r = 0; r < CONFIG.racks; r++) {
    const g = el('div', 'pg');
    for (let b = 0; b < CONFIG.ballsPerRack; b++) {
      const i = r * CONFIG.ballsPerRack + b, money = shots && shots[i] ? shots[i].money : plan ? plan[i].money : b === CONFIG.ballsPerRack - 1, p = el('i', 'pip' + (money ? ' money' : ''));
      if (shots && shots[i]) p.classList.add(shots[i].tier === 'miss' ? 'miss' : shots[i].tier === 'perfect' ? 'perfect' : 'make');
      g.appendChild(p);
    }
    root.appendChild(g);
  }
}

/** Tiny top-down half court with one dot per rack spot. */
function buildCourt() {
  const dots = CONFIG.spots.map((sp) => `<circle class="dot" cx="${sp.mini[0]}" cy="${sp.mini[1]}" r="4.6"/>`).join('');
  $('#hud-court').innerHTML = `<svg viewBox="0 0 84 60"><rect x="1.5" y="1.5" width="81" height="57" rx="8" fill="rgba(43,30,58,.82)" stroke="#fff" stroke-width="2"/>
    <path d="M9 4V20A33 33 0 0 0 75 20V4" fill="none" stroke="#fff" stroke-width="2" opacity=".85"/>
    <rect x="33" y="4" width="18" height="19" fill="rgba(255,255,255,.14)" stroke="#fff" stroke-width="1.5" opacity=".85"/>
    <line x1="35" y1="7" x2="49" y2="7" stroke="#fff" stroke-width="2"/><circle cx="42" cy="11" r="3" fill="none" stroke="#ff7a3a" stroke-width="2"/>${dots}</svg>`;
}

let hudScore = -1;
function updateHud() {
  const c = app.contest; if (!c) return; c.dirty = false;
  // Daily Distance: the hero is how far you're shooting from right now. It ticks up the moment you start backing away.
  const sc = $('#hud-score'), shown = c.distance ? c.spot.dist : c.score;
  if (shown !== hudScore) {
    if (c.distance) sc.innerHTML = `${shown}<small>FT</small>`; else sc.textContent = shown;
    if (hudScore >= 0 && shown > hudScore) { sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); } hudScore = shown;
  }
  if (c.distance) { const sp = c.spot; $('#hud-rack').textContent = `STAGE ${Math.min(c.shot, c.total - 1) + 1}/${c.total}${sp.name.endsWith(' FT') ? '' : ` · ${sp.name}`}`; $('.hud-score').classList.toggle('final', !!sp.final); $('.hud-score').classList.toggle('far', sp.dist >= 42); $('.hud-score').classList.toggle('absurd', sp.dist >= 60); }
  else $('#hud-rack').textContent = `RACK ${c.rack + 1}/${c.cfg.racks} · ${c.spot.name}`;
  if (!c.distance) $('#hud-court').querySelectorAll('.dot').forEach((d, i) => { const at = c.cfg.plan.findIndex((p) => p.spot === i), played = Math.floor(at / c.cfg.ballsPerRack);   // which rack (in play order) is shot from this spot
    d.classList.toggle('done', played < c.rack || c.shot >= c.total); d.classList.toggle('cur', played === c.rack && c.shot < c.total); });
  const pips = $('#hud-pips').querySelectorAll('.pip');
  pips.forEach((p, i) => {
    const s = c.shots[i]; p.classList.remove('cur', 'make', 'perfect', 'miss');
    if (s) p.classList.add(s.tier === 'miss' ? 'miss' : s.tier === 'perfect' ? 'perfect' : 'make'); else if (i === c.shot) p.classList.add('cur');
  });
  const h = c.heatLevel, hl = HEAT_LEVELS[h];
  $('#hud-heat-name').textContent = h === 3 ? '🔥 ON FIRE 🔥' : hl.name;
  const fill = $('#hud-heat-fill'); fill.style.width = `${Math.min(100, ((c.heatPts + (h === 3 ? 1 : 0)) / (c.cfg.heat.perLevel * 4)) * 100)}%`; fill.style.background = hl.color;
  $('.hud-heat').className = `hud-box hud-heat h${h}`;
}

/** The player left a game unfinished. Where they stopped is the most useful difficulty signal we get. */
function abandoned(how) {
  const c = app.contest;
  if (!c || !app.runMeta || c.phase === 'ready' || c.phase === 'finish' || c.phase === 'done' || c.abandonSent) return;
  c.abandonSent = true;
  track('game_abandoned', { ...app.runMeta, shot: c.shot, score: c.score, shots: shotCode(c.shots), how });
  if (c.distance && app.daily && app.attempt && app.attempt.official) track('daily_abandoned', { daily: app.daily.number, date: app.daily.date, stage: Math.min(c.shot, c.total - 1) + 1, distance: c.feet, survived: c.makes, how });
}

function pauseGame() {
  const c = app.contest; if (!c || c.phase === 'done' || c.paused) return;
  c.pause();
  openModal(`<h2>PAUSED</h2><p>The ball will wait. The crowd will not.</p><div class="modal-btns"><button class="btn btn-plain small" id="m-quit"><span class="big">QUIT</span></button><button class="btn btn-hot small" id="m-resume"><span class="big">RESUME</span></button></div>`);
  $('#m-resume').onclick = () => { closeModal(); c.resume(); };
  $('#m-quit').onclick = () => { closeModal(); abandoned('quit'); goHome(); };
}

// ---- progress helpers (unlocks, daily history, first-daily warm-up)
/** Progress toward a locked hooper's 'makes' unlock, from the best single game saved on this device. */
function unlockGoal(c) {
  if (!c.locked || !c.unlock || c.unlock.type !== 'makes') return null;
  const need = num(c.unlock.value);
  return { need, have: Math.min(need, num(save.bestMakes)) };
}

/** Time until the next Daily opens (midnight UTC), e.g. "7H 12M". */
function untilTomorrow() {
  const now = Date.now(), next = Math.ceil((now + 1) / 864e5) * 864e5, m = Math.max(1, Math.round((next - now) / 6e4));
  return m >= 60 ? `${Math.floor(m / 60)}H ${m % 60}M` : `${m}M`;
}

/** The last 7 days of official dailies and the streak, from the daily service. Never throws. */
function dailyHistory(date) {
  try { return services.daily.history(date, 7); } catch (err) { reportError('daily', err); return { days: [], streak: 0, playedToday: false }; }
}

// cold to hot, like the rack colours: the strip reads at a glance without numbers
const dayColor = (s) => (s >= 26 ? '#ff4d2e' : s >= 20 ? '#ff9a2e' : s >= 13 ? '#ffd23f' : '#7fb6ff');
const feetColor = (ft) => (ft >= REACT.big ? '#ff4d2e' : ft >= 24 ? '#ff9a2e' : ft >= REACT.poor ? '#ffd23f' : '#7fb6ff');   // same cold-to-hot idea, in feet
/** A row of seven day chips (oldest first, today last) and the streak line. Scores are coerced before use. */
function dailyStrip(date, caption = true) {   // caption: true = the standard streak line, false = none, a string = that line
  const h = dailyHistory(date);
  if (!h.days.length) return '';
  const chips = h.days.map((day, i) => {
    const today = i === h.days.length - 1, played = day.score != null, sc = num(day.score), dist = day.format === 'distance', ft = num(day.distance);
    const dow = 'SMTWTFS'[new Date(Date.parse(day.date)).getUTCDay()] || '';
    // distance days show feet made (🏆 for a beaten Daily); days from the old 25-shot Daily keep their score
    const shown = !played ? (today ? '?' : '·') : dist ? (day.completed ? '🏆' : ft) : sc, color = dist ? feetColor(ft) : dayColor(sc);
    return `<span class="dchip${played ? ' played' : today ? ' today' : ''}"${played ? ` style="--c:${color}"` : ''} title="${esc(day.date)}: ${played ? (dist ? `${ft} ft` : `${sc}/30`) : 'not played'}"><b>${shown}</b><i>${today ? 'TODAY' : dow}</i></span>`;
  }).join('');
  const label = (h.streak >= 1 ? `🔥 ${num(h.streak)}-DAY STREAK${h.playedToday ? '' : ' · PLAY TODAY TO KEEP IT'}` : 'PLAY DAILY TO START A STREAK') + (num(h.best) > 0 ? ` · BEST ${num(h.best)} FT` : '');
  return `<div class="dchips">${chips}</div>${caption ? `<div class="dlabel">${esc(typeof caption === 'string' ? caption : label)}</div>` : ''}`;
}

/** First daily ever, from a player who hasn't finished a game yet: offer a warm-up before the run that counts. */
const offerWarmup = () => num(save.games) === 0 && !services.daily.myResult(getDaily().date);
function askWarmup(opts) {
  openModal(`<h2>WARM UP FIRST?</h2><p>Your first finished Daily run is your official result. Take a practice walk first? Different shots, and it won't count.</p>
    <div class="modal-btns"><button class="btn btn-cool small" id="m-warm"><span class="big">WARM UP</span></button><button class="btn btn-hot small" id="m-official"><span class="big">GO OFFICIAL</span></button></div>`);
  $('#m-warm').onclick = () => { closeModal(); startGame({ mode: 'quick', charId: opts.charId, mapId: getDaily().map.id, warmup: true, via: 'warmup' }); };
  $('#m-official').onclick = () => { closeModal(); startGame(opts); };
}

/**
 * The results screen's coach: one tendency and one tip, from releaseProfile (meter units; ~0.013 is about 10 ms).
 * Direction is only called when the average is clearly beyond what this player's own scatter would give by chance,
 * so a steady player who got unlucky isn't told they're late. Nothing here says where the perfect window is.
 */
function coachFor(p) {
  if (!p) return null;
  if (p.slow >= 3) return { tag: 'LET IT FLY', text: `You let ${num(p.slow)} balls go by. The meter won't wait for you.` };
  if (p.n < 5) return null;
  const sure = Math.abs(p.bias) >= Math.max(0.012, (2 * p.sd) / Math.sqrt(p.n)), big = Math.abs(p.bias) >= 0.026, late = p.bias > 0;
  const spot = p.steadiest >= 0 && !p.distance && CONFIG.spots[p.steadiest] ? `Steadiest spot: ${CONFIG.spots[p.steadiest].name}` : '';
  const pick = (tag, text) => ({ tag, text, note: spot });
  if (p.perfects >= p.n * 0.8) return pick('LOCKED IN', 'Perfect after perfect. Nothing to fix. Do it again.');   // a tiny lean inside perfect isn't worth a tip
  if (sure && late) return big ? pick('RUNNING LATE', "You're letting it go late. Tap a beat sooner.") : pick('A HAIR LATE', 'Just a touch late on average. Tap a little earlier.');
  if (sure) return big ? pick('JUMPING THE GUN', "You're firing early. Hold it a beat longer.") : pick('A HAIR EARLY', 'Just a touch early on average. Hold it a little longer.');
  if (p.sd < 0.02) return pick('LOCKED IN', 'Centred and steady. That release is a metronome.');
  if (p.sd < 0.035) return pick('DIALED IN', 'Well centred. Keep that rhythm and tighten it up.');
  if (p.sd < 0.06) return pick('STREAKY', 'Centred on average, but streaky. Watch the zone, not a count in your head.');
  return pick('ALL OVER THE PLACE', 'Your timing is all over the map. Watch the zone move and stay patient.');
}

// ---- results
const TITLES =[[30, 'FLAWLESS. FRAME IT.'], [26, 'ABSOLUTE BUCKET MERCHANT'], [22, 'CERTIFIED SHOOTER'], [18, 'RESPECTABLE HOOPER'], [14, 'PRETTY MID, HONESTLY'], [9, 'BRICKLAYER (UNION)'], [0, 'THE RIM FILED A COMPLAINT']];

async function finishGame(r) {
  const contest = app.contest, badges = [];
  save.games++; app.gamesPlayed = (app.gamesPlayed || 0) + 1; services.ads.gameCompleted();
  if (r.record) r.record.build = BUILD;
  const warmup = !!(app.lastOpts && app.lastOpts.warmup), dist = isDistance(r);
  const prevBest = save.best, newBest = r.mode === 'quick' && !warmup && !dist && r.score > prevBest;
  // the Dark Horse unlock is "makes out of 25": only contest games count toward it, never a Daily Distance run
  const prevMakes = save.bestMakes; if (!dist) save.bestMakes = Math.max(save.bestMakes, num(r.makes));
  const horse = CHARACTERS.find((c) => c.id === 'darkhorse');
  if (horse && !isUnlocked(horse) && horse.unlock) {      // unlock milestones, each once per device (best makes only goes up)
    for (const m of [5, 10, 15, 20]) if (m <= horse.unlock.value && prevMakes < m && save.bestMakes >= m) track('dark_horse_progress', { milestone: m, unlocked: m >= horse.unlock.value, games: save.games });
  }
  if (newBest) {
    if (prevBest > 0) track('new_high_score', { score: r.score, previous: prevBest, games: save.games });
    save.best = r.score;
  }
  let unlockedNow = null;
  for (const c of CHARACTERS) if (!dist && c.locked && !isUnlocked(c) && c.unlock.type === 'makes' && r.makes >= c.unlock.value) { save.unlocked.push(c.id); unlockedNow = c; track('character_unlocked', { character: c.id, games: save.games }); if (c.id === 'darkhorse') track('dark_horse_unlocked', { games: save.games, makes: r.makes }); }
  const meta = app.runMeta || {};
  const summary = summarizeRun(r);
  track('game_completed', { ...meta, score: r.score, makes: r.makes, perfects: r.perfects, money: r.moneyMade, maxHeat: r.maxHeat, streak: r.bestStreak, ...summary });
  let rankInfo = null;
  let prevDaily = 0;
  if (r.mode === 'daily') {
    // The daily service keeps the device copy first, then (online) sends it. Either step may be slow or fail:
    // results still show.
    const d = app.daily, attempt = app.attempt || { official: false, attempt: 1, token: null };
    prevDaily = num(dailyHistory(d.date).best);    // personal Daily Distance best before this run
    let receipt = null;
    try { receipt = await withTimeout(services.daily.submit(d, attempt, r), 4000); } catch (err) { reportError('daily', err); }
    if (attempt.official) track('daily_completed', { daily: d.number, date: d.date, score: r.score, makes: r.makes, character: r.characterId, map: r.mapId, modifier: r.modifierId, durS: summary.durS,
      format: r.format, stage: Math.min(r.stage + 1, r.stages), distance: r.distance, survived: r.makes, completed: r.completed, perfects: r.perfects, newBest: prevDaily > 0 && num(r.distance) > prevDaily });
    if (attempt.official) track('daily_official', { daily: d.number, modifier: r.modifierId, score: r.score, attempt: attempt.attempt, accepted: !!(receipt && receipt.accepted), pending: !receipt || !!receipt.pending, rank: receipt ? receipt.rank : null, total: receipt ? receipt.total : null });
    try { rankInfo = await withTimeout(services.leaderboard.fetch(dailyBoard(d.date)), 4000); } catch (err) { reportError('leaderboard', err); }
  }
  if (dist && r.completed && (r.mode === 'daily' || warmup)) track('daily_full_court_made', { daily: app.daily ? app.daily.number : 0, date: (app.daily || getDaily()).date, character: r.characterId, perfects: r.perfects, durS: summary.durS, official: !!(app.attempt && app.attempt.official && r.mode === 'daily') });
  persist();
  if (app.contest !== contest) return;             // the player left while we waited
  if (dist) {                                     // Daily Distance badges: how the walk went
    // kept short on purpose: the distance is the result; personal best and streak live in the standing line and stats.
    // The rank is the official result's, so it only shows on the official run.
    if (rankInfo && rankInfo.you && !r.practice) badges.unshift([`DAILY RANK #${num(rankInfo.you.rank)} of ${num(rankInfo.total)}`, 'cool']);
    return showResults(r, badges, null, { prevBest, newBest: false, warmup, prevDaily });
  }
  if (r.perfects >= 10) badges.push([`${r.perfects} PERFECTS`, '']);
  if (r.moneyMade === 5) badges.push(['ALL 5 MONEY BALLS', '']);
  if (r.maxHeat === 3) badges.push(['🔥 CAUGHT FIRE', '']);
  if (r.bestStreak >= 8) badges.push([`${r.bestStreak} STRAIGHT`, '']);
  if (rankInfo && rankInfo.you) badges.unshift([`DAILY RANK #${num(rankInfo.you.rank)} of ${num(rankInfo.total)}`, 'cool']);
  // closer to a locked hooper than ever before (only when it moved, so it never nags)
  for (const c of CHARACTERS) { const g = unlockGoal(c); if (g && !isUnlocked(c) && num(r.makes) > prevMakes) badges.push([`🔒 ??? ${g.have}/${g.need} MAKES`, 'cool']); }
  showResults(r, badges, unlockedNow, { prevBest, newBest, warmup });
}

function showResults(r, badges, unlockedNow, best = { prevBest: 0, newBest: false, warmup: false }) {
  const d = app.daily, map = getMap(r.mapId), warmup = !!best.warmup, dist = isDistance(r);
  // how the character reacts: score out of 30 in a contest, feet made in Daily Distance
  const big = dist ? r.distance >= REACT.big : r.score >= GOOD_GAME, poor = dist ? r.distance < REACT.poor : r.score < POOR_GAME, top = dist ? r.completed : r.score >= 26;
  const moment = big ? 'winBig' : poor ? 'winPoor' : 'make';
  app.results = { r, t: 0, emote: { type: moment === 'winPoor' ? 'sad' : 'celebrate', name: moment, t: 0, tier: top ? 'perfect' : 'good' }, heat: top ? 3 : big ? 2 : !poor ? 1 : 0, newBest: best.newBest };
  const quote = lineOf(getCharacter(r.characterId), moment === 'make' ? 'winMid' : moment, Math.floor(Math.random() * 6));
  let quoteEl = $('#res-quote');
  if (!quoteEl) { quoteEl = el('div', 'res-quote'); $('#res-title').after(quoteEl); }   // tolerate an older cached index.html
  quoteEl.textContent = '';
  // How this run stands: against the player's best (Quick Play), or as today's official result or a practice (Daily).
  let bestEl = $('#res-best');
  if (!bestEl) { bestEl = el('div', 'res-best'); $('#res-title').before(bestEl); }       // tolerate an older cached index.html
  const official = r.mode === 'daily' ? services.daily.myResult(d.date) : null;
  const dd = dist ? (d || getDaily()) : null, hist = dist ? dailyHistory(dd.date) : null, res = dist ? distanceResult(num(r.stage)) : null;
  // Personal best, only when it's true: an official run past every earlier official result (a first ever result isn't a "new best")
  const prevD = num(best.prevDaily), pb = dist && r.mode === 'daily' && !r.practice && prevD > 0 && num(r.distance) > prevD;
  const bestFt = dist ? Math.max(num(hist.best), r.mode === 'daily' && !r.practice ? num(r.distance) : 0) : 0;
  const standing = dist
    ? (r.mode !== 'daily' ? ["WARM-UP · DOESN'T COUNT", 'practice']
      : r.practice ? [official && num(r.stage) > num(official.stage) ? `PRACTICE · FARTHER THAN YOUR OFFICIAL ${feetText(official)}` : `PRACTICE · OFFICIAL: ${official ? feetText(official) : '—'}`, 'practice']
      : pb ? [`★ PERSONAL BEST · PREVIOUS: ${prevD} FT`, 'gold'] : prevD ? [`★ OFFICIAL · YOUR BEST: ${bestFt} FT`, 'cool'] : ['★ OFFICIAL · YOUR FIRST DAILY RESULT', 'cool'])
    : r.mode === 'daily'
    ? (r.practice ? [`PRACTICE${official ? ` · OFFICIAL: ${feetText(official)}` : ''}`, ''] : ["TODAY'S OFFICIAL RESULT", 'cool'])
    : warmup ? ["WARM-UP · DOESN'T COUNT", '']
    : best.newBest ? [best.prevBest > 0 ? `NEW BEST! · WAS ${num(best.prevBest)}` : 'NEW BEST!', 'gold']
      : r.score === best.prevBest ? (best.prevBest > 0 ? ['TIED YOUR BEST', ''] : ['', '']) : [`YOUR BEST: ${num(best.prevBest)}`, ''];
  bestEl.textContent = ''; bestEl.className = 'res-best';
  $('#res-context').textContent = dist ? (r.mode === 'daily' ? `Daily #${dd.number} · ${r.practice ? 'Practice' : 'Official'} · ${map.name}` : `Daily Distance warm-up · ${map.name}`)
    : r.mode === 'daily' ? `Daily #${d.number} · ${map.name}${r.practice ? ' · practice' : ''}` : `${warmup ? 'Warm-up' : 'Quick Play'} · ${map.name}`;
  $('#res-title').textContent = ''; $('#res-badges').innerHTML = '';
  let kickEl = $('#res-kicker');
  if (!kickEl) { kickEl = el('div', 'res-kicker'); $('.res-score').before(kickEl); }   // tolerate an older cached index.html
  kickEl.textContent = dist ? (pb && !r.completed ? (res.words ? 'NEW BEST · REACHED' : 'NEW BEST') : res.kicker) : ''; kickEl.classList.toggle('hidden', !dist);
  kickEl.classList.toggle('gold', !!pb);
  $('.res-score').classList.toggle('dist', dist); $('.res-score').classList.toggle('beat', !!(dist && r.completed));
  $('.res-panel').classList.toggle('beat', !!(dist && r.completed));   // beat the Daily: the whole card goes gold
  const unit = document.querySelector('.res-score span'); if (unit) unit.textContent = dist ? '' : '/30';
  const peak = [['NONE', 'WARM', 'HOT', '🔥FIRE'][num(r.maxHeat)] || 'NONE', 'Peak heat'];
  $('#res-stats').classList.toggle('hidden', dist);
  if (dist) {
    // Daily hierarchy: hero distance → shots survived (title line) → best (the pill) → streak (under the day chips) →
    // the stage dots. No score, racks, money or Heat: those are Quick Play's.
    buildPips($('#res-pips'), r.shots, Array.from({ length: num(r.stages) || STAGES.length }), true);
  } else {
  buildPips($('#res-pips'), r.shots);
  const rMax = rackMax(r);
  rackPoints(r).forEach((p, i) => { const g = $('#res-pips').children[i]; if (g) { g.style.boxShadow = `0 0 0 3px ${RACK_SCALE[rackLevel(p, rMax[i])].color}`; g.title = `Rack ${i + 1}: ${p}/${rMax[i]}`; } });
  $('#res-stats').innerHTML = [[`${num(r.makes)}/25`, 'Makes'], [num(r.perfects), 'Perfect'], [`${num(r.moneyMade)}/5`, 'Money'], peak]
    .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  }
  let coachEl = $('#res-coach');
  if (!coachEl) { coachEl = el('div', 'res-coach'); $('#res-stats').after(coachEl); }    // tolerate an older cached index.html
  const prof = releaseProfile(r); if (prof) prof.distance = dist;
  const coach = coachFor(prof);
  coachEl.classList.toggle('hidden', !coach || dist);   // Daily Distance keeps its results to "how far did I get?"
  coachEl.innerHTML = coach ? `<b>🎯 ${esc(coach.tag)}</b><span>${esc(coach.text)}</span>${coach.note ? `<small>${esc(coach.note)}</small>` : ''}` : '';
  let histEl = $('#res-hist');
  if (!histEl) { histEl = el('div', 'res-hist'); $('#res-badges').after(histEl); }      // tolerate an older cached index.html
  histEl.classList.toggle('hidden', r.mode !== 'daily');
  // the streak, and the habit: today is done, tomorrow's Daily keeps it going
  const sk = dist && hist ? num(hist.streak) : 0;
  const streakLine = !dist ? true : !hist.playedToday ? (sk ? `🔥 ${sk}-DAY STREAK` : true) : sk >= 2 ? `🔥 ${sk}-DAY STREAK · BACK TOMORROW FOR ${sk + 1}` : '🔥 STREAK STARTED · SEE YOU TOMORROW';
  histEl.innerHTML = r.mode === 'daily' ? dailyStrip(d.date, streakLine) : '';
  const { flags } = services;
  // Share is offered after every game; the leaderboard only exists for the daily.
  const canShare = flags.on('share') && ((r.mode === 'quick' && !warmup) || !!official), canBoard = r.mode === 'daily' && flags.on('leaderboard');
  $('#res-daily-row').classList.toggle('hidden', !(canShare || canBoard)); $('#res-daily-row').classList.toggle('single', canShare !== canBoard);
  $('#res-share').classList.toggle('hidden', !canShare); $('#res-board').classList.toggle('hidden', !canBoard);
  $('#res-again').querySelector('.big').textContent = warmup ? 'GO OFFICIAL' : r.mode === 'daily' ? "PRACTICE TODAY'S RUN" : 'PLAY AGAIN';
  $('#res-again').classList.toggle('long', r.mode === 'daily');
  $('#res-share').querySelector('.big').textContent = dist ? 'SHARE RESULT' : 'SHARE';
  $('#res-home').querySelector('.big').textContent = dist ? 'MENU' : 'HOME';
  $('#res-other').querySelector('.big').textContent = warmup ? 'WARM UP AGAIN' : r.mode === 'daily' ? 'QUICK PLAY' : 'DAILY DISTANCE';
  show('results');
  setMusicHeat(0);
  // score reveal: quick count-up, then the punchline. Daily Distance counts up stage by stage, in feet.
  const sc = $('#res-score'); sc.classList.remove('done', 'words', 'long'); sc.textContent = '0';
  const steps = dist ? STAGES.slice(0, num(r.stage)).map((st) => st.dist) : Array.from({ length: num(r.score) }, (_, i) => i + 1);
  let n = 0; const step = Math.max(dist ? 70 : 30, 900 / Math.max(1, steps.length));
  const tick = () => {
    if (app.results?.r !== r) return;
    if (n < steps.length) { sc.textContent = steps[n++]; sfx.tick(n); setTimeout(tick, step); return; }
    if (dist) { sc.textContent = res.big; sc.classList.toggle('words', res.words); sc.classList.toggle('long', res.big.length > 11); if (unit) unit.textContent = res.unit ? ' ' + res.unit : ''; }
    sc.classList.add('done');
    if (dist && r.completed) { sfx.arenaJackpot(); goldBurst(); } else sfx.fanfare(dist ? r.distance >= 24 : r.score >= 14);
    const shots = num(r.makes);
    $('#res-title').textContent = dist ? (r.completed ? `ALL ${shots} SHOTS SURVIVED` : shots ? `${shots} ${shots === 1 ? 'SHOT' : 'SHOTS'} SURVIVED` : 'NO SHOTS SURVIVED') : TITLES.find(([min]) => r.score >= min)[1];
    bestEl.textContent = standing[0]; if (standing[1]) bestEl.classList.add(standing[1]);
    if (quote) quoteEl.textContent = `“${quote}” — ${charName(getCharacter(r.characterId))}`;
    badges.forEach(([text, cls], i) => { const b = el('span', 'badge ' + cls, esc(text)); b.style.animationDelay = `${i * 0.1}s`; $('#res-badges').appendChild(b); });
    if (unlockedNow) setTimeout(() => { sfx.unlock(); toast(`🔓 NEW HOOPER UNLOCKED<br>${esc(unlockedNow.unlockedName || unlockedNow.name)}`, 3500); }, 700);
  };
  setTimeout(tick, 350);
}

/** Beat the Daily: a short burst of gold over the results card (about 1.6 s, then removed). Off with reduced motion. */
function goldBurst() {
  try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch { /* old browser: go ahead */ }
  const panel = $('.res-panel'); if (!panel) return;
  const box = el('div', 'gold-burst');
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + Math.random() * 0.3, d = 90 + Math.random() * 130, p = el('i');
    p.style.setProperty('--x', `${Math.cos(a) * d}px`); p.style.setProperty('--y', `${Math.sin(a) * d * 0.8 - 30}px`);
    p.style.animationDelay = `${Math.random() * 0.15}s`; if (i % 3 === 0) p.className = 'star';
    box.appendChild(p);
  }
  panel.appendChild(box);
  setTimeout(() => box.remove(), 2000);
}

function drawResultChar() {
  const res = app.results; res.t += app.dt || 1 / 60; res.emote.t = res.t;   // real frame time: same speed on 60 Hz and 120 Hz screens
  const pose = { t: res.t, crouch: 0, jump: 0 };
  applyEmote(app.scene.character, pose, res.emote, res.heat);
  pose.jump = Math.min(pose.jump, 26);
  drawPortrait($('#res-char'), app.scene.character, { pose });
}

// ---- modals
function openModal(html) { $('#modal-body').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !(app.contest && app.contest.paused)) closeModal(); });
let toastTimer;
function toast(html, ms = 2000) { const t = $('#toast'); t.innerHTML = html; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms); }

async function openLeaderboard() {
  const d = getDaily();
  let data;
  try { data = await withTimeout(services.leaderboard.fetch(dailyBoard(d.date), { limit: 10, around: 2 }), 5000); }
  catch (err) { reportError('leaderboard', err); toast("Couldn't load the leaderboard. Try again in a moment.", 2600); return; }
  track('leaderboard_viewed', { daily: d.number, played: !!services.daily.myResult(d.date) });
  const rows = [], you = data.you;
  // names come from other players once the board is online: always escaped, numbers always coerced
  // the Daily board ranks stages made; it shows them as feet (🏆 for a beaten Daily)
  const show = (sc) => (num(sc) >= STAGES.length ? '🏆' : `${madeDistance(num(sc))} FT`);
  const row = (e) => `<div class="lb-row${e.you ? ' you' : ''}"><span class="rk">#${num(e.rank)}</span><span>${esc(e.name)}${e.you ? ' (you)' : ''}</span><span>${show(e.score)}</span></div>`;
  data.top.forEach((e) => rows.push(row(e)));
  if (data.around.length) { rows.push('<div class="lb-row gap">⋯</div>'); data.around.forEach((e) => rows.push(row(e))); }
  openModal(`<h2>GLOBAL · DAILY #${d.number}</h2>
    ${data.simulated ? '<div class="lb-note">Preview board: rivals are simulated until the online leaderboard is connected. Your score is saved on this device.</div>' : ''}
    <div class="lb-name">Your name <input id="lb-name" maxlength="16" value="${esc(services.player.name)}"></div>
    <div class="lb-list">${rows.join('')}</div>
    ${you ? '' : '<p>Play today\'s Daily Distance to get on the board.</p>'}
    <div class="modal-btns" style="grid-template-columns:1fr"><button class="btn btn-hot small" id="m-close"><span class="big">CLOSE</span></button></div>`);
  $('#m-close').onclick = closeModal;
  $('#lb-name').onchange = (e) => { if (services.player.setName(e.target.value)) openLeaderboard(); };
}

// What gets shared: the run on screen, except that after a daily practice run it is still today's official result.
function shareSubject() {
  const res = app.results, r = res && res.r;
  if (r && r.mode === 'quick' && !(app.lastOpts && app.lastOpts.warmup)) return { r, daily: null, newBest: !!res.newBest };
  const d = getDaily(), official = services.daily.myResult(d.date);
  if (!official) return null;
  const h = dailyHistory(d.date);   // a new personal best only if today's official beat every earlier day's
  return { r: official, daily: d, newBest: num(h.bestBefore) > 0 && num(official.distance) > num(h.bestBefore) };
}

function openShare() {
  const s = shareSubject(); if (!s) return;
  const { r, daily: d } = s;
  const info = { daily: d, newBest: s.newBest, map: getMap(r.mapId), character: getCharacter(r.characterId), title: isDistance(r) ? distanceResult(num(r.stage)).title : TITLES.find(([min]) => r.score >= min)[1],
    streak: d ? num(dailyHistory(d.date).streak) : 0 };
  const text = shareText(r, info);
  const shared = (how) => track('share_clicked', { mode: r.mode, daily: d ? d.number : null, score: num(r.score), how, distance: isDistance(r) ? num(r.distance) : null, newBest: isDistance(r) ? !!s.newBest : null, completed: isDistance(r) ? !!r.completed : null });
  shared('open');
  openModal(`<h2>${d ? "SHARE TODAY'S RESULT" : 'SHARE YOUR SCORE'}</h2><canvas id="share-canvas"></canvas><div class="share-text">${esc(text)}</div>
    <div class="share-key">${isDistance(r) ? 'One square per stage, rim to full court: 🟧 made, ❌ the miss, ⬛ still to go.' : 'The squares are your five racks, from ice cold ⬛ to a perfect rack 🔥.'}</div>
    <div class="modal-btns"><button class="btn btn-hot small" id="m-copy"><span class="big">COPY TEXT</span></button><button class="btn btn-cool small" id="m-img"><span class="big">SHARE IMAGE</span></button></div>
    <div class="modal-btns" style="grid-template-columns:1fr"><button class="btn btn-plain small" id="m-close"><span class="big">CLOSE</span></button></div>`);
  const cv = $('#share-canvas'); renderShareCard(cv, r, info);
  $('#m-close').onclick = closeModal;
  $('#m-copy').onclick = async () => { shared('copy'); try { await navigator.clipboard.writeText(text); toast('Copied! Go brag.'); } catch { toast('Select the text above to copy it.'); } };
  $('#m-img').onclick = () => { shared('image'); cv.toBlob(async (blob) => {
    const file = new File([blob], d ? `heat-check-daily-${d.number}.png` : 'heat-check.png', { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; } } catch { return; }
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }); };
}

// ------------------------------------------------------------------ wiring
$('#btn-daily').onclick = () => openSetup('daily');
$('#btn-quick').onclick = () => openSetup('quick');
$('#setup-back').onclick = goHome;
$('#btn-go').onclick = () => {
  const opts = { mode: app.setup.mode, charId: app.setup.charId, mapId: app.setup.mapId };
  if (opts.mode === 'daily' && offerWarmup()) askWarmup(opts); else startGame(opts);
};
$('#btn-pause').onclick = pauseGame;
/** A straight replay from the results screen (not GO OFFICIAL after a warm-up: that is daily_warmup_to_official). */
const replayed = () => { const m = app.runMeta || {}, r = app.results && app.results.r; track('replay_clicked', { mode: m.mode, practice: !!m.practice, warmup: !!m.warmup, score: r ? r.score : 0 }); };
$('#res-again').onclick = () => {
  if (app.lastOpts.warmup) return startGame({ mode: 'daily', charId: app.lastOpts.charId, via: 'warmup' });
  replayed(); return startGame({ ...app.lastOpts, via: 'again' });
};
$('#res-home').onclick = goHome;
$('#res-other').onclick = () => {
  if (app.lastOpts.warmup) { replayed(); return startGame({ ...app.lastOpts, via: 'again' }); }
  return openSetup(app.lastOpts.mode === 'daily' ? 'quick' : 'daily');
};
$('#res-share').onclick = openShare;
$('#res-board').onclick = openLeaderboard;
const muteBtn = $('#btn-mute');
const syncMute = () => { muteBtn.textContent = save.muted ? '🔇' : '🔊'; setMuted(save.muted); };
muteBtn.onclick = () => { save.muted = !save.muted; persist(); syncMute(); };

services.ads.configure({ pauseAudio: suspendAudio, resumeAudio, canInterrupt: () => app.screen !== 'play', track });
syncMute(); resize(); goHome();
// Ask the outside world for today's challenge and feature switches. Locally this is instant and changes nothing;
// online it replaces the built-in schedule once the server answers.
Promise.all([services.daily.refresh(), services.flags.refresh()]).then(() => { if (app.screen === 'home') goHome(); }).catch((err) => reportError('boot', err));
window.__hcReady = true;   // tells boot.js the game started
// Offline play. Only a built deploy has a service worker (build.py writes it and marks the page); development never
// registers one, so a cache can't hide new code.
if (document.documentElement.dataset.offline && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((err) => reportError('offline', err));
const mq = (q) => { try { return window.matchMedia(q).matches; } catch { return false; } };
track('game_loaded', { w: window.innerWidth, h: window.innerHeight, dpr: Math.round(window.devicePixelRatio || 1), touch: mq('(pointer: coarse)'), returning: save.games > 0, games: save.games,
  loadMs: performance.now(), reducedMotion: mq('(prefers-reduced-motion: reduce)'), muted: !!save.muted, standalone: mq('(display-mode: standalone)') });
requestAnimationFrame((ts) => { lastTs = ts; requestAnimationFrame(frame); });
