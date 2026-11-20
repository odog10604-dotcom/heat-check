// Sharing a result: a short emoji text and a rendered image card.
//
// The shared result is a SUMMARY, not a replay: five squares, one per rack, coloured cold to hot by the points scored
// there. It says how the game went (and where it went wrong) without giving away the shot-by-shot sequence.
import { GAME, HEAT_LEVELS } from '../config.js';
import { FONT, rr, circ } from '../engine/draw.js';
import { applyEmote, drawCharacter } from '../content/characters.js';
import * as rules from '../engine/rules.js';
import { getModifier, CLASSIC } from '../content/modifiers.js';
import { STAGES, distanceResult } from '../content/distance.js';

const isDistance = (r) => !!r && r.format === 'distance';
/** Daily Distance progress as squares: 🟧 made, ❌ the miss, ⬛ never reached (🏆 at the end if it was beaten). */
export function distanceSquares(r) {
  const n = r.stages || STAGES.length, made = Math.min(n, r.stage ?? r.makes ?? 0);
  return Array.from({ length: n }, (_, i) => (i < made ? '🟧' : i === made ? '❌' : '⬛')).join('') + (made >= n ? '🏆' : '');
}

/** Address printed on shares: the site's public address (site.json, via the page's canonical link) if set,
 *  otherwise wherever the game is being served from (never a local address). */
function siteUrl() {
  try {
    const canon = document.querySelector('link[rel="canonical"]');
    if (canon && canon.href) return canon.href.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const h = location.hostname;
    if (location.protocol === 'file:' || !h || h === 'localhost' || /^(127\.|10\.|192\.168\.|\[?::1)/.test(h)) return '';
    return (location.host + location.pathname).replace(/\/(index\.html)?$/, '');
  } catch { return ''; }
}
/** The same address as a full link, so it is tappable when pasted into a chat. */
const siteLink = () => { const u = siteUrl(); return u ? 'https://' + u : ''; };

// ------------------------------------------------------------------ the rack scale (shared by text, card and results)
/** Points scored at each of the five racks (0-6 each: four 1-point balls and a 2-point money ball). */
export function rackPoints(r) {
  const out = [0, 0, 0, 0, 0];
  (r.shots || []).forEach((s, i) => { if (s.tier !== 'miss' && i < 25) out[Math.floor(i / 5)] += s.money ? 2 : 1; });
  return out;
}
/** The most each rack could have scored (6 normally; a modifier may move the money balls around). */
export function rackMax(r) {
  const out = [0, 0, 0, 0, 0];
  (r.shots || []).forEach((s, i) => { if (i < 25) out[Math.floor(i / 5)] += s.money ? 2 : 1; });
  return out.map((v) => v || 6);
}
/** Which spot (0 = left corner .. 4 = right corner) each rack was shot from. A modifier may reorder them. */
export function rackSpots(r) {
  try { const cfg = rules.configFor(r.modifierId ?? null); return [0, 1, 2, 3, 4].map((k) => cfg.plan[k * cfg.ballsPerRack].spot); } catch { return [0, 1, 2, 3, 4]; }
}
/** Cold to hot. Index = level. On a normal 6-point rack: 0 (0-1 pts), 1 (2), 2 (3), 3 (4), 4 (5), 5 (all 6: a perfect rack). */
export const RACK_SCALE = [
  { emoji: '⬛', color: '#463861', text: '#c9b8e8' },
  { emoji: '🟦', color: '#4f8fd6', text: '#fff' },
  { emoji: '🟨', color: '#ffd23f', text: '#2b1e3a' },
  { emoji: '🟧', color: '#ff8a1f', text: '#2b1e3a' },
  { emoji: '🟥', color: '#ff3b2f', text: '#fff' },
  { emoji: '🔥', color: '#ff3b2f', text: '#fff' },
];
export const rackLevel = (pts, max = 6) => (pts >= max ? 5 : Math.max(0, Math.min(4, Math.ceil((pts / max) * 6) - 1)));

/**
 * The text version, four short lines:
 *   🏀 HEAT CHECK! Daily #2 — 23/30
 *   🟧🟨🔥🟧🟦                 one square per rack, cold to hot
 *   ⭐13 💰4/5 ⚡8 🔥🔥🔥        perfects, money balls, best streak, peak Heat
 *   https://…                  only once the site has a public address
 * `info`: { daily: today's challenge or null for Quick Play, newBest: bool }
 */
export function shareText(r, info = {}) {
  const d = info.daily;
  if (isDistance(r)) {
    // Daily Distance, written for someone who has never played: what it is, how far, and a dare.
    //   🏀 HEAT CHECK! DAILY #5
    //   📏 52 FT · 11 SHOTS            (· NEW BEST when it is one)
    //   🟧🟧🟧🟧🟧🟧🟧🟧🟧🟧🟧❌⬛⬛⬛⬛⬛⬛⬛
    //   🔥 4-DAY STREAK                 (from 2 days)
    //   Can you beat me? https://…
    // Beating it: 🏆 FULL COURT ✓ / I beat today's challenge. Can you?
    const res = distanceResult(r.stage || 0), shots = r.makes || 0, streak = info.streak || 0, link = siteLink();
    const head = r.completed ? '🏆 FULL COURT ✓' : shots ? `📏 ${res.line} · ${shots} ${shots === 1 ? 'SHOT' : 'SHOTS'}${info.newBest ? ' · NEW BEST' : ''}` : '🧱 MISSED THE LAYUP';
    return [
      `🏀 ${GAME.title} DAILY${d ? ` #${d.number}` : ''}`,
      head,
      r.completed ? "I beat today's challenge. Can you?" : '',
      distanceSquares(r),
      streak >= 2 ? `🔥 ${streak}-DAY STREAK` : '',
      r.completed ? link : `Can you beat me?${link ? ' ' + link : ''}`,
    ].filter(Boolean).join('\n');
  }
  return [
    `🏀 ${GAME.title} ${d ? `Daily #${d.number} ` : ''}— ${r.score}/30${info.newBest ? ' (new best!)' : ''}`,
    rackPoints(r).map((p, i) => RACK_SCALE[rackLevel(p, rackMax(r)[i])].emoji).join(''),
    `⭐${r.perfects} 💰${r.moneyMade}/5 ⚡${r.bestStreak} ${r.maxHeat ? '🔥'.repeat(r.maxHeat) : '🧊'}`,
    siteLink(),
  ].filter(Boolean).join('\n');
}

function fitText(ctx, text, x, y, size, maxW, weight = 900) {
  do { ctx.font = `${weight} ${size}px ${FONT}`; } while (ctx.measureText(text).width > maxW && --size > 10);
  ctx.fillText(text, x, y);
}

/**
 * The image version (600x630). `info`: { daily or null, map, character, title, newBest }.
 * Top: logo and which game. Middle: the character reacting, the score and the result title. Bottom: the five racks
 * on a three-point arc around a hoop, each a disc coloured by the rack scale with its points.
 */
export function renderShareCard(canvas, r, info = {}) {
  if (isDistance(r)) return renderDailyCard(canvas, r, info);
  const W = 600, H = 630; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'), d = info.daily, INK = '#2b1e3a';
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#ff8a1f'); g.addColorStop(1, '#e83f5b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.1; ctx.fillStyle = '#fff';
  for (let i = -H; i < W; i += 60) { ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + 30, H); ctx.lineTo(i + H + 30, 0); ctx.lineTo(i + H, 0); ctx.fill(); }
  ctx.globalAlpha = 1;
  rr(ctx, 20, 20, W - 40, H - 40, 34); ctx.fillStyle = INK; ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';

  // ---- logo and which game
  ctx.font = `900 50px ${FONT}`;
  const [a, b] = GAME.title.split(' '), wa = ctx.measureText(a + ' ').width, wb = ctx.measureText(b || '').width, lx = W / 2 - (wa + wb) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd23f'; ctx.fillText(a, lx, 76);
  ctx.fillStyle = '#ff7a1a'; ctx.fillText(b || '', lx + wa, 76);
  ctx.textAlign = 'center'; ctx.fillStyle = '#c9b8e8';
  const where = info.map ? info.map.name.toUpperCase() : '';
  fitText(ctx, isDistance(r) ? `${d ? `DAILY #${d.number} · ` : ''}DAILY DISTANCE · ${where}` : d ? `DAILY #${d.number} · ${where} · ${((getModifier(r.modifierId) || CLASSIC).label).toUpperCase()}` : `QUICK PLAY · ${where}`, W / 2, 116, 20, W - 100);

  // ---- the character, reacting to the score
  if (info.character) {
    const good = isDistance(r) ? r.distance >= 42 : r.score >= 20, poor = isDistance(r) ? r.distance < 15 : r.score < 13;
    const pose = { t: 0.55, crouch: 0, jump: 0 };
    try {
      applyEmote(info.character, pose, { type: poor ? 'sad' : 'celebrate', name: good ? 'winBig' : poor ? 'winPoor' : 'make', t: 0.55, tier: r.score >= 26 ? 'perfect' : 'good' }, r.score >= 26 ? 3 : good ? 2 : r.score >= 14 ? 1 : 0);
      pose.jump = Math.min(pose.jump || 0, 12);
      ctx.save(); ctx.beginPath(); ctx.rect(20, 128, 262, 226); ctx.clip();
      drawCharacter(ctx, info.character, 150, 350, 0.94, pose);
      ctx.restore();
    } catch { ctx.restore(); /* the card is still complete without the character */ }
  }

  if (isDistance(r)) { distanceCard(ctx, r, info, W, INK); return; }   // (only reached by older callers: see renderShareCard)
  // ---- score, title, peak Heat
  const sx = 408;
  ctx.font = `900 128px ${FONT}`;
  const sw = ctx.measureText(String(r.score)).width;
  ctx.lineWidth = 14; ctx.strokeStyle = '#1c1326'; ctx.strokeText(String(r.score), sx - 34, 218);
  ctx.fillStyle = '#fff'; ctx.fillText(String(r.score), sx - 34, 218);
  ctx.font = `900 40px ${FONT}`; ctx.fillStyle = '#8f7fb3'; ctx.textAlign = 'left'; ctx.fillText('/30', sx - 34 + sw / 2 + 8, 244); ctx.textAlign = 'center';
  if (info.title) { ctx.fillStyle = '#ffd23f'; fitText(ctx, info.title, sx, 296, 22, 300); }
  const heat = HEAT_LEVELS[r.maxHeat] || HEAT_LEVELS[0], pill = `PEAK HEAT: ${heat.name}`;
  ctx.font = `900 17px ${FONT}`;
  const pw = ctx.measureText(pill).width + 28;
  rr(ctx, sx - pw / 2, 318, pw, 30, 15); ctx.fillStyle = heat.color; ctx.fill();
  ctx.fillStyle = r.maxHeat === 3 ? '#fff' : INK; ctx.fillText(pill, sx, 334);
  if (info.newBest) {
    ctx.save(); ctx.translate(W - 96, 158); ctx.rotate(0.16);
    rr(ctx, -62, -19, 124, 38, 12); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#1c1326'; ctx.stroke();
    ctx.fillStyle = INK; ctx.font = `900 18px ${FONT}`; ctx.fillText('NEW BEST!', 0, 1);
    ctx.restore();
  }

  // ---- five racks on the arc
  const hx = W / 2, hy = 392, R = 214, pts = rackPoints(r), max = rackMax(r), spots = rackSpots(r);
  const spot = (deg) => [hx + R * Math.sin(deg * Math.PI / 180), hy + R * Math.cos(deg * Math.PI / 180) * 0.56];
  ctx.beginPath();
  for (let deg = -84; deg <= 84; deg += 4) { const [x, y] = spot(deg); deg === -84 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.stroke();
  rr(ctx, hx - 30, hy - 26, 60, 34, 4); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill();          // backboard
  ctx.beginPath(); ctx.ellipse(hx, hy + 12, 19, 7, 0, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = '#ff7a1a'; ctx.stroke();   // rim
  const ARC = [-80, -40, 0, 40, 80];
  pts.forEach((p, i) => {                                    // each rack's disc sits where it was actually shot from
    const [x, y] = spot(ARC[spots[i]] ?? ARC[i]), lvl = rackLevel(p, max[i]), sc = RACK_SCALE[lvl];
    circ(ctx, x, y, 35); ctx.fillStyle = sc.color; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = lvl === 5 ? '#ffd23f' : '#1c1326'; ctx.stroke();
    ctx.fillStyle = sc.text; ctx.font = `900 34px ${FONT}`; ctx.fillText(String(pts[i]), x, y + 2);
  });

  // ---- the numbers, and where to play
  ctx.fillStyle = '#c9b8e8';
  fitText(ctx, `${r.makes}/25 MADE · ${r.perfects} PERFECT · ${r.moneyMade}/5 MONEY · ${r.bestStreak} STRAIGHT`, W / 2, 556, 19, W - 90);
  const url = siteUrl();
  if (url) { ctx.fillStyle = '#8f7fb3'; fitText(ctx, url, W / 2, 586, 17, W - 120); }
}

/** The Daily Distance half of the image card: feet made, the headline, and the walk back as a row of stage dots. */
function distanceCard(ctx, r, info, W, INK) {
  const sx = 408, res = distanceResult(r.stage || 0);
  ctx.fillStyle = '#c9b8e8'; fitText(ctx, res.kicker, sx, 150, 22, 300);
  if (res.words) {                                  // HALF COURT / YOU BEAT THE DAILY / LAYUP: words as the hero, up to two lines
    const words = res.big.split(' '), lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [res.big];
    lines.forEach((ln, k) => {
      let size = 64; do { ctx.font = `900 ${size}px ${FONT}`; } while (ctx.measureText(ln).width > 290 && --size > 20);
      const y = lines.length > 1 ? 196 + k * 60 : 226;
      ctx.lineWidth = 12; ctx.strokeStyle = '#1c1326'; ctx.strokeText(ln, sx, y);
      ctx.fillStyle = r.completed ? '#ffd23f' : '#fff'; ctx.fillText(ln, sx, y);
    });
  } else {
    ctx.font = `900 128px ${FONT}`;
    const sw = ctx.measureText(res.big).width;
    ctx.lineWidth = 14; ctx.strokeStyle = '#1c1326'; ctx.strokeText(res.big, sx - 30, 218);
    ctx.fillStyle = '#fff'; ctx.fillText(res.big, sx - 30, 218);
    ctx.font = `900 40px ${FONT}`; ctx.fillStyle = '#8f7fb3'; ctx.textAlign = 'left'; ctx.fillText(res.unit, sx - 30 + sw / 2 + 8, 244); ctx.textAlign = 'center';
  }
  ctx.fillStyle = '#ffd23f'; fitText(ctx, res.title, sx, 296, 22, 300);
  const heat = HEAT_LEVELS[r.maxHeat] || HEAT_LEVELS[0], pill = `PEAK HEAT: ${heat.name}`;
  ctx.font = `900 17px ${FONT}`;
  const pw = ctx.measureText(pill).width + 28;
  rr(ctx, sx - pw / 2, 318, pw, 30, 15); ctx.fillStyle = heat.color; ctx.fill();
  ctx.fillStyle = r.maxHeat === 3 ? '#fff' : INK; ctx.fillText(pill, sx, 334);
  // the walk back: hoop on the left, one dot per stage, spaced by real distance
  const n = r.stages || STAGES.length, made = Math.min(n, r.stage || 0), x0 = 70, x1 = W - 60, y = 450, far = STAGES[STAGES.length - 1].dist;
  const xs = (i) => x0 + ((STAGES[i] ? STAGES[i].dist : far) / far) * (x1 - x0);
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x0 - 16, y, 7, 16, 0, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = '#ff7a1a'; ctx.stroke();   // the rim, edge-on
  for (let i = 0; i < n; i++) {
    const done = i < made, miss = i === made;
    circ(ctx, xs(i), y, done ? 10 : 8); ctx.fillStyle = done ? '#ff8a1f' : miss ? '#ff3b2f' : '#463861'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#1c1326'; ctx.stroke();
  }
  const lx = made ? xs(made - 1) : x0;
  ctx.fillStyle = '#fff'; ctx.font = `900 18px ${FONT}`; ctx.fillText(made ? `${r.distance} FT` : 'NO MAKE', Math.max(x0 + 30, Math.min(x1 - 30, lx)), y - 34);
  if (r.completed) { ctx.font = `900 30px ${FONT}`; ctx.fillText('🏆', x1 + 4, y - 30); }
  ctx.fillStyle = '#8f7fb3'; ctx.font = `900 15px ${FONT}`; ctx.fillText('RIM', x0 - 16, y + 34); ctx.fillText('FULL COURT', x1 - 30, y + 34);
  ctx.fillStyle = '#c9b8e8';
  const streak = info.streak || 0;
  fitText(ctx, `${made} ${made === 1 ? 'SHOT' : 'SHOTS'} MADE · STAGE ${Math.min(made + 1, n)}/${n}${streak >= 2 ? ` · 🔥 ${streak}-DAY STREAK` : ''}${r.completed ? ' · BEAT THE DAILY' : ''}`, W / 2, 556, 19, W - 90);
  const url = siteUrl();
  if (url) { ctx.fillStyle = '#8f7fb3'; fitText(ctx, url, W / 2, 586, 17, W - 120); }
}

/**
 * The Daily Distance card (600x630) in the casino arena's look: dark velvet, a brass frame, the event's name, the
 * character reacting, the distance as the hero, and the walk back from the rim to full court. `info`: { daily, map,
 * character, newBest, streak }.
 */
function renderDailyCard(canvas, r, info = {}) {
  const W = 600, H = 630; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'), d = info.daily, res = distanceResult(r.stage || 0), shots = r.makes || 0, streak = info.streak || 0;
  const BRASS = '#c9a24e', GOLD = '#f1d58c', DIM = '#8c7a5a';
  const bg = ctx.createRadialGradient(W / 2, 250, 40, W / 2, 300, 520); bg.addColorStop(0, '#4a1020'); bg.addColorStop(0.55, '#22070f'); bg.addColorStop(1, '#0b0407');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 0, 10, W / 2, 0, 320); glow.addColorStop(0, 'rgba(255,205,130,.22)'); glow.addColorStop(1, 'rgba(255,205,130,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 320);
  rr(ctx, 16, 16, W - 32, H - 32, 26); ctx.lineWidth = 4; ctx.strokeStyle = BRASS; ctx.stroke();
  rr(ctx, 26, 26, W - 52, H - 52, 20); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(201,162,78,.55)'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  // the event's name
  ctx.font = `900 46px ${FONT}`; const tg = ctx.createLinearGradient(0, 56, 0, 96); tg.addColorStop(0, '#fff0c2'); tg.addColorStop(1, '#d8ad55');
  ctx.shadowColor = 'rgba(255,190,90,.6)'; ctx.shadowBlur = 12; ctx.fillStyle = tg; ctx.fillText(GAME.title, W / 2, 78); ctx.shadowBlur = 0;
  ctx.font = `900 15px ${FONT}`; ctx.fillStyle = GOLD; ctx.fillText('D  A  I  L  Y     D  I  S  T  A  N  C  E', W / 2, 112);
  ctx.fillStyle = BRASS; ctx.fillRect(W / 2 - 200, 111, 40, 1.5); ctx.fillRect(W / 2 + 160, 111, 40, 1.5);
  ctx.fillStyle = DIM; fitText(ctx, `${d ? `#${d.number} · ` : ''}${info.map ? info.map.name.toUpperCase() : ''}`, W / 2, 138, 14, W - 120);
  // the character, reacting
  if (info.character) {
    const good = r.distance >= 42, poor = r.distance < 15, pose = { t: 0.55, crouch: 0, jump: 0 };
    try {
      applyEmote(info.character, pose, { type: poor ? 'sad' : 'celebrate', name: good ? 'winBig' : poor ? 'winPoor' : 'make', t: 0.55, tier: r.completed ? 'perfect' : 'good' }, r.completed ? 3 : good ? 2 : poor ? 0 : 1);
      pose.jump = Math.min(pose.jump || 0, 12);
      ctx.save(); ctx.beginPath(); ctx.rect(28, 150, 250, 250); ctx.clip();
      const pool = ctx.createRadialGradient(150, 392, 4, 150, 392, 110); pool.addColorStop(0, 'rgba(255,206,140,.35)'); pool.addColorStop(1, 'rgba(255,206,140,0)');
      ctx.save(); ctx.translate(150, 392); ctx.scale(1, 0.32); ctx.translate(-150, -392); ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(150, 392, 110, 0, Math.PI * 2); ctx.fill(); ctx.restore();   // a soft pool of light at his feet
      drawCharacter(ctx, info.character, 150, 392, 0.9, pose); ctx.restore();
    } catch { ctx.restore(); }
  }
  // the hero: how far
  const sx = 412;
  ctx.fillStyle = info.newBest && !r.completed ? GOLD : '#c9b8a0'; fitText(ctx, info.newBest && !r.completed ? 'NEW PERSONAL BEST' : res.kicker, sx, 182, 18, 280);
  if (res.words) {
    const words = res.big.split(' '), lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [res.big];
    lines.forEach((ln, k) => {
      let size = 62; do { ctx.font = `900 ${size}px ${FONT}`; } while (ctx.measureText(ln).width > 290 && --size > 20);
      const y = lines.length > 1 ? 232 + k * 58 : 252;
      ctx.lineWidth = 10; ctx.strokeStyle = '#0b0407'; ctx.strokeText(ln, sx, y);
      ctx.fillStyle = r.completed ? GOLD : '#fff6e0'; ctx.fillText(ln, sx, y);
    });
  } else {
    ctx.font = `900 130px ${FONT}`;
    const sw = ctx.measureText(res.big).width;
    ctx.lineWidth = 12; ctx.strokeStyle = '#0b0407'; ctx.strokeText(res.big, sx - 26, 256); ctx.fillStyle = '#fff6e0'; ctx.fillText(res.big, sx - 26, 256);
    ctx.font = `900 40px ${FONT}`; ctx.fillStyle = BRASS; ctx.textAlign = 'left'; ctx.fillText(res.unit, sx - 26 + sw / 2 + 8, 284); ctx.textAlign = 'center';
  }
  ctx.fillStyle = GOLD; fitText(ctx, r.completed ? "I BEAT TODAY'S CHALLENGE" : shots ? `${shots} ${shots === 1 ? 'SHOT' : 'SHOTS'} SURVIVED` : 'NO SHOTS SURVIVED', sx, 334, 22, 290);
  if (streak >= 2) { const pill = `🔥 ${streak}-DAY STREAK`; ctx.font = `900 16px ${FONT}`; const pw = ctx.measureText(pill).width + 28; rr(ctx, sx - pw / 2, 354, pw, 28, 14); ctx.fillStyle = 'rgba(201,162,78,.18)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = BRASS; ctx.stroke(); ctx.fillStyle = GOLD; ctx.fillText(pill, sx, 369); }
  // the walk back: the rim on the left, one dot per stage, spaced by real distance
  const n = r.stages || STAGES.length, made = Math.min(n, r.stage || 0), x0 = 78, x1 = W - 62, y = 462, far = STAGES[STAGES.length - 1].dist;
  const xs = (i) => x0 + ((STAGES[i] ? STAGES[i].dist : far) / far) * (x1 - x0);
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(201,162,78,.35)'; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x0 - 18, y, 6, 15, 0, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = '#ff7a3a'; ctx.stroke();
  for (let i = 0; i < n; i++) {
    const done = i < made, miss = i === made;
    circ(ctx, xs(i), y, done ? 9 : 7); ctx.fillStyle = done ? GOLD : miss ? '#b0213c' : 'rgba(255,255,255,.12)'; ctx.fill();
    if (done) { ctx.lineWidth = 2; ctx.strokeStyle = '#7a5a22'; ctx.stroke(); }
  }
  if (made) { ctx.fillStyle = '#fff6e0'; ctx.font = `900 17px ${FONT}`; ctx.fillText(`${r.distance} FT`, Math.max(x0 + 30, Math.min(x1 - 30, xs(made - 1))), y - 30); }
  if (r.completed) { ctx.font = `900 28px ${FONT}`; ctx.fillText('🏆', x1 + 2, y - 30); }
  ctx.fillStyle = DIM; ctx.font = `900 13px ${FONT}`; ctx.fillText('RIM', x0 - 18, y + 30); ctx.fillText('FULL COURT', x1 - 30, y + 30);
  // the dare, and where to play
  ctx.fillStyle = GOLD; fitText(ctx, r.completed ? 'CAN YOU?' : 'CAN YOU BEAT ME?', W / 2, 540, 22, W - 120);
  const url = siteUrl(); if (url) { ctx.fillStyle = DIM; fitText(ctx, url, W / 2, 576, 16, W - 120); }
}
