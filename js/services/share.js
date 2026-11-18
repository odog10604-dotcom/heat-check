// Sharing a result: a short emoji text and a rendered image card.
//
// The shared result is a SUMMARY, not a replay: five squares, one per rack, coloured cold to hot by the points scored
// there. It says how the game went (and where it went wrong) without giving away the shot-by-shot sequence.
import { GAME, HEAT_LEVELS } from '../config.js';
import { FONT, rr, circ } from '../engine/draw.js';
import { applyEmote, drawCharacter } from '../content/characters.js';
import * as rules from '../engine/rules.js';
import { getModifier, CLASSIC } from '../content/modifiers.js';

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
  fitText(ctx, d ? `DAILY #${d.number} · ${where} · ${((getModifier(r.modifierId) || CLASSIC).label).toUpperCase()}` : `QUICK PLAY · ${where}`, W / 2, 116, 20, W - 100);

  // ---- the character, reacting to the score
  if (info.character) {
    const good = r.score >= 20, poor = r.score < 13;
    const pose = { t: 0.55, crouch: 0, jump: 0 };
    try {
      applyEmote(info.character, pose, { type: poor ? 'sad' : 'celebrate', name: good ? 'winBig' : poor ? 'winPoor' : 'make', t: 0.55, tier: r.score >= 26 ? 'perfect' : 'good' }, r.score >= 26 ? 3 : good ? 2 : r.score >= 14 ? 1 : 0);
      pose.jump = Math.min(pose.jump || 0, 12);
      ctx.save(); ctx.beginPath(); ctx.rect(20, 128, 262, 226); ctx.clip();
      drawCharacter(ctx, info.character, 150, 350, 0.94, pose);
      ctx.restore();
    } catch { ctx.restore(); /* the card is still complete without the character */ }
  }

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
