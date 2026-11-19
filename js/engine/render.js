// Scene renderer: map -> hoop -> rack -> shooter -> balls -> net -> effects -> meter.
import { CONFIG, HEAT_LEVELS } from '../config.js';
import { drawCharacter, stylePose } from '../content/characters.js';
import { OUT, rr, circ, fillStroke, outlineText, clamp, lerp, FONT } from './draw.js';

// How far the background slides either way as you walk the arc (world units). The camera orbits the hoop, so the
// far wall moves the same way you walk: left corner -> right corner slides the background to the right.
const PAN = 140;
// "Reduce motion" (an OS accessibility setting): no screen shake, camera punches or full-screen flashes.
let calm = false;
try { const mq = window.matchMedia('(prefers-reduced-motion: reduce)'); calm = mq.matches; mq.addEventListener && mq.addEventListener('change', (e) => { calm = e.matches; }); } catch { /* old browser */ }

/** World layout. One code path for portrait phones and wide desktops. */
export function computeLayout(W, H) {
  const s = Math.min(W / 580, H / 600), w = W / s, h = H / s;
  const groundY = Math.min(h * 0.78, Math.max(468, h * 0.6));
  const d = clamp(w * 0.5, 330, 520);
  const below = h - groundY;
  const mw = Math.min(w - 56, 470);
  // wide screens have little floor below the crowd: in the behind-the-shooter view the background is raised by `lift`
  // so the court has room to show its depth (key, baseline and arc read flat otherwise)
  const lift = Math.round(clamp((w / h - 1.15) * 90, 0, 70));
  const base = {
    s, w, h, d, groundY, lift, portrait: h > w * 1.1, rimY: groundY - 250, rimHalf: 27,
    meter: { x: (w - mw) / 2, y: groundY + Math.min(200, below * 0.45), w: mw, h: 30 },
  };
  return spotLayout(base, CONFIG.spots[0]);
}

/** Place shooter, hoop and rack for a rack spot (or a blend of two spots mid-transition). */
export function spotLayout(base, v) {
  const cx = base.w / 2;
  const shooterX = cx + v.shooter * base.d, hoopX = cx + v.hoop * base.d, dir = hoopX >= shooterX ? 1 : -1;
  // behind-the-shooter spots stand as low as the screen allows (just above the meter): more floor between shooter and hoop
  const sy = Number.isFinite(v.sy) ? v.sy : (v.back ?? 0) > 0.5 ? clamp(base.meter.y - base.groundY - 28, 26, 96) : 0;
  const floorY = base.groundY - (v.back ?? 0) * (base.lift || 0);                 // where the far floor meets the crowd
  const hs = v.hoopScale ?? 1, cs = v.charScale ?? 1, hoopBaseY = floorY - (v.hoopBack ?? 0);   // depth: a far hoop is smaller and sits further up the floor
  return { ...base, shooterX, hoopX, dir, side: v.side, cam: v.cam, shooterY: base.groundY + sy, angle: v.angle ?? 0, dist: v.dist ?? 25, rackX: shooterX - dir * 82 * cs,
    hoopScale: hs, charScale: cs, hoopBaseY, floorY, rimY: hoopBaseY - 250 * hs, rimHalf: 27 * hs, back: (v.back ?? 0) > 0.5, mark: v.mark || null };
}

export function drawBall(ctx, x, y, r, rot, { money = false, fire = false, alpha = 1, heat = 0 } = {}) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
  if (!fire && heat >= 1) {                       // Heating Up: a warm halo; Hot: a hotter, wider one
    const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * (heat === 2 ? 2.4 : 1.9));
    g.addColorStop(0, heat === 2 ? 'rgba(255,140,40,.55)' : 'rgba(255,210,80,.32)'); g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g; circ(ctx, 0, 0, r * 2.4); ctx.fill();
  }
  if (fire) {
    const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.8);
    g.addColorStop(0, 'rgba(255,170,30,.75)'); g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g; circ(ctx, 0, 0, r * 2.8); ctx.fill();
  } else if (money) {
    const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.1);
    g.addColorStop(0, 'rgba(255,230,110,.55)'); g.addColorStop(1, 'rgba(255,220,80,0)');
    ctx.fillStyle = g; circ(ctx, 0, 0, r * 2.1); ctx.fill();
  }
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  if (money) { g.addColorStop(0, '#fff7b8'); g.addColorStop(0.6, '#ffc928'); g.addColorStop(1, '#d98a00'); }
  else { g.addColorStop(0, '#ffbd6b'); g.addColorStop(0.6, '#f47a1c'); g.addColorStop(1, '#c9530a'); }
  circ(ctx, 0, 0, r); ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip(); ctx.rotate(rot);
  ctx.strokeStyle = money ? '#b33a2e' : OUT; ctx.lineWidth = Math.max(1.4, r * 0.13);
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
  ctx.beginPath(); ctx.arc(-r * 1.25, 0, r, -1, 1); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 1.25, 0, r, Math.PI - 1, Math.PI + 1); ctx.stroke();
  ctx.restore();
  circ(ctx, 0, 0, r); ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(2, r * 0.18); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.45, r * 0.26, r * 0.15, -0.6, 0, 7); ctx.fill();
  ctx.restore();
}

function netPath(ctx, L, swish, t, front) {
  const { hoopX: x, rimY: y, rimHalf: rw } = L;
  const drop = 46 + swish * 16, wob = Math.sin(t * 30) * swish * 5, bw = rw * (0.56 - swish * 0.12);
  ctx.strokeStyle = front ? 'rgba(255,255,255,.95)' : 'rgba(225,225,240,.6)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const n = 6, sign = front ? 1 : -1;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI, tx = x - Math.cos(a) * rw, ty = y + sign * Math.sin(a) * 6;
    const bx = x - Math.cos(a) * bw + wob, by = y + drop + sign * Math.sin(a) * 3;
    ctx.moveTo(tx, ty); ctx.quadraticCurveTo((tx + bx) / 2 + wob * 0.5, (ty + by) / 2, bx, by);
    if (i < n) { const a2 = ((i + 1) / n) * Math.PI; ctx.moveTo(tx, ty + 1); ctx.lineTo(x - Math.cos(a2) * (rw + bw) / 2 + wob * 0.5, y + drop * 0.5 + sign * Math.sin(a2) * 4); }
  }
  ctx.stroke();
}

function hoopBack(ctx, L, swish, t) {
  const { hoopX: x, rimY: y, rimHalf: rw, groundY: gy } = L, sd = L.side ?? 1, f = 1 - Math.abs(sd);
  const bcx = x + sd * (rw + 17), hw = lerp(9, 62, f), px = x + sd * (rw + 54);   // backboard centre / half-width, pole
  const shift = (e) => -12 * Math.max(0, e * sd);                                // far edge sits a little higher when seen side-on
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(px - sd * 12, gy + 4, 44, 9, 0, 0, 7); ctx.fill();
  // pole + arm
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(px, gy + 2); ctx.lineTo(px, y - 30); ctx.lineTo(bcx + sd * hw * 0.5, y - 46);
  ctx.strokeStyle = OUT; ctx.lineWidth = 15; ctx.stroke(); ctx.strokeStyle = '#7d7f96'; ctx.lineWidth = 9; ctx.stroke();
  rr(ctx, px - 24, gy - 12, 48, 18, 6); fillStroke(ctx, '#55576e', 3);
  // backboard: a thin slab from the corners, a full rectangle from the top of the key
  const quad = (k, top, bot) => { ctx.beginPath(); ctx.moveTo(bcx - hw * k, top + shift(-1)); ctx.lineTo(bcx + hw * k, top + shift(1)); ctx.lineTo(bcx + hw * k, bot + shift(1)); ctx.lineTo(bcx - hw * k, bot + shift(-1)); ctx.closePath(); };
  quad(1, y - 104, y + 16); fillStroke(ctx, '#f4f6ff', 4);
  quad(0.5, y - 58, y - 14); ctx.strokeStyle = '#e83f5b'; ctx.lineWidth = 3; ctx.stroke();
  // rim back half + back net
  netPath(ctx, L, swish, t, false);
  ctx.beginPath(); ctx.ellipse(x, y, rw, 6, 0, Math.PI, 0); ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = '#ff5a2a'; ctx.lineWidth = 4.5; ctx.stroke();
  if (Math.abs(sd) > 0.3) { ctx.beginPath(); ctx.moveTo(x + sd * rw, y); ctx.lineTo(bcx - sd * hw + sd * 2, y); ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = '#ff5a2a'; ctx.lineWidth = 4.5; ctx.stroke(); }
}

/** Painted lane under the hoop. It points at the shooter from the corners and at the camera from the top. */
function drawLane(ctx, L) {
  const sd = L.side ?? 1, f = 1 - Math.abs(sd), k = L.hoopScale ?? 1, baseY = L.hoopBaseY ?? L.groundY;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (L.back) {
    // baseline: runs straight across from the top of the key, and swings round to point at the camera from the corners
    const ang = (1 - f) * 1.25, vx = (sd < 0 ? -1 : 1) * Math.cos(ang), vy = Math.sin(ang), px = L.hoopX + sd * 30 * k, py = baseY - 2;
    const up = vy > 0.05 ? -6 / vy : -3000;
    ctx.beginPath(); ctx.moveTo(px + vx * up, py + vy * up); ctx.lineTo(px + vx * 3000, py + vy * 3000);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 4; ctx.stroke();
  }
  // lane: points away from the backboard. Side-on it is a flat sliver; square-on it runs toward the camera and widens.
  const bx = L.hoopX + sd * 16 * k, by = baseY - 4;
  const ax = -sd * 170 * (L.back ? k * 1.15 : 1), ay = 14 + f * 96, wx = 8 + f * 62, wy = Math.abs(sd) * 20 * (L.back ? k : 1);
  const far = L.back ? 1 - 0.5 * f : 1, near = L.back ? 1 + 0.25 * f : 1;
  ctx.beginPath(); ctx.moveTo(bx - wx * far, by - wy); ctx.lineTo(bx + wx * far, by + wy); ctx.lineTo(bx + ax + wx * near, by + ay + wy); ctx.lineTo(bx + ax - wx * near, by + ay - wy); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,.13)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 4; ctx.stroke();
}

/**
 * Court markings for the behind-the-shooter view. The half court is laid out in feet around the hoop and projected through
 * a camera standing behind the shooter, fitted so the shooter and the hoop land exactly where the scene already draws them.
 * The hoop never moves; turning `angle` swings the key, baseline and three-point line around it.
 */
function drawCourt(ctx, L) {
  const hs = L.hoopScale, cs = L.charScale; if (!(cs > hs)) return;
  const a = (L.angle * Math.PI) / 180, dist = L.dist, back = dist / (cs / hs - 1), zh = back + dist, inv = 1 / back - 1 / zh;
  const K = (L.shooterY - L.hoopBaseY) / inv, hor = L.hoopBaseY - K / zh;          // vertical: ground depth -> screen y
  const f = 36 * hs * zh, fo = (L.hoopX - L.shooterX) / inv, x0 = L.hoopX + fo / zh; // horizontal, with the over-the-shoulder offset
  const ux = Math.sin(a), uy = Math.cos(a), cgx = ux * zh, cgy = uy * zh, dx = -ux, dy = -uy;
  const proj = (px, py) => { const ex = px - cgx, ey = py - cgy, z = ex * dx + ey * dy; if (z < 4) return null; return [x0 + (f * (ex * -dy + ey * dx) - fo) / z, hor + K / z]; };
  const path = (pts) => {            // court-space polyline, finely subdivided so it bends correctly and clips at the camera
    let pen = false;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.5));
      for (let j = i ? 1 : 0; j <= n; j++) { const p = proj(ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n); if (!p) { pen = false; continue; } pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; }
    }
  };
  const arc = (cx, cy, r, a0, a1) => { const out = []; for (let i = 0; i <= 28; i++) { const t = a0 + ((a1 - a0) * i) / 28; out.push([cx + Math.sin(t) * r, cy + Math.cos(t) * r]); } return out; };
  const BL = -5.25, FT = 13.75, C3 = Math.asin(22 / 23.75);                        // baseline, free-throw line, where the arc meets the corner lines
  ctx.save(); ctx.beginPath(); ctx.rect(-200, (L.floorY ?? L.groundY) - 28, L.w + 400, L.h); ctx.clip();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); path([[-8, BL], [8, BL], [8, FT], [-8, FT], [-8, BL]]); ctx.fillStyle = 'rgba(214,52,78,.42)'; ctx.fill();   // the painted key: its shape is the clearest 'where am I' cue
  ctx.beginPath(); path(arc(0, 0, 23.75, -C3, C3).concat([[22, BL], [-22, BL]])); ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();   // faint wash inside the arc
  ctx.strokeStyle = 'rgba(43,30,58,.35)'; ctx.lineWidth = 8;
  ctx.beginPath(); path([[-22, BL], ...arc(0, 0, 23.75, -C3, C3), [22, BL]]); ctx.stroke();   // shadow under the three-point line so it reads on any floor
  ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 4.5;
  ctx.beginPath();
  path([[-8, BL], [8, BL], [8, FT], [-8, FT], [-8, BL]]);
  path(arc(0, FT, 6, 0, Math.PI * 2));                                              // free-throw circle
  path([[-25, 20], [-25, BL], [25, BL], [25, 20]]);                                 // sidelines (kept short so they never swing past the camera) + baseline
  path([[-22, BL], ...arc(0, 0, 23.75, -C3, C3), [22, BL]]);                        // three-point line
  path(arc(0, 0, 4, -Math.PI / 2, Math.PI / 2));                                    // restricted arc under the hoop
  if (dist > 26) {                                                                  // Daily Distance: the rest of the court comes into play
    const HC = 47 + BL, FB = 94 + BL, far = Math.min(FB, dist + 14);                 // half-court line, far baseline (feet from this hoop)
    path([[-25, 20], [-25, far]]); path([[25, 20], [25, far]]);
    if (far > HC) { path([[-25, HC], [25, HC]]); path(arc(0, HC, 6, 0, Math.PI * 2)); }
    if (dist > 50) {                                                                // the far half, mirrored: key, arc, baseline
      path([[-8, FB], [-8, FB - 19], [8, FB - 19], [8, FB]]); path(arc(0, FB - 19, 6, 0, Math.PI * 2));
      path([[-22, FB], ...arc(0, FB + BL, 23.75, Math.PI + C3, Math.PI - C3), [22, FB]]);
      if (far >= FB) path([[-25, FB], [25, FB]]);
    }
  }
  ctx.stroke();
  // Daily Distance landmark: the line the shooter is standing on glows gold (free-throw line, arc, half court, far baseline)
  if (L.mark) {
    const HC = 47 + BL, FB = 94 + BL, line = { ft: [[-6, FT], [6, FT]], arc: [[-22, BL], ...arc(0, 0, 23.75, -C3, C3), [22, BL]], half: [[-25, HC], [25, HC]], baseline: [[-25, FB], [25, FB]] }[L.mark];
    if (line) {
      ctx.beginPath(); path(line);
      ctx.strokeStyle = 'rgba(255,210,63,.35)'; ctx.lineWidth = 16; ctx.stroke();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 6; ctx.stroke();
    }
  }
  ctx.restore();
}

function hoopFront(ctx, L, swish, t) {
  const { hoopX: x, rimY: y, rimHalf: rw } = L;
  netPath(ctx, L, swish, t, true);
  ctx.beginPath(); ctx.ellipse(x, y, rw, 6, 0, 0, Math.PI); ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = '#ff7a3a'; ctx.lineWidth = 4.5; ctx.stroke();
}

function drawRack(ctx, L, c) {
  const off = -L.dir * (1 - c.rackSlide) * 260, x = L.rackX + off, gy = L.shooterY, n = c.cfg.ballsPerRack;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, gy + 4, 50, 8, 0, 0, 7); ctx.fill();
  ctx.lineCap = 'round';
  for (const lx of [-34, 34]) { ctx.beginPath(); ctx.moveTo(x + lx, gy - 84); ctx.lineTo(x + lx, gy - 4); ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = '#c9cbe0'; ctx.lineWidth = 4.5; ctx.stroke(); circ(ctx, x + lx, gy - 2, 6); fillStroke(ctx, '#3a3350', 2.5); }
  const started = c.phase !== 'ready' && c.phase !== 'rackIntro';
  const first = c.shot >= c.total || c.rackEmpty ? n : c.ballInRack + (started && (c.phase === 'grab' || c.phase === 'meter' || c.phase === 'flight' || c.phase === 'settle') ? 1 : 0);
  const sc = c.cfg.visual.ballScale > 1 ? 1.15 : 1;
  const plan = c.cfg.plan, base = c.rack * n;   // money balls come from the shot plan (modifiers can move them)
  for (let i = n - 1; i >= first; i--) { const s = c.slotPos(i); drawBall(ctx, s.x, s.y, 12 * sc, 0.4 + i, { money: plan ? !!(plan[base + i] && plan[base + i].money) : i === n - 1 }); }
  rr(ctx, x - 44, gy - 92, 88, 9, 4); fillStroke(ctx, '#e83f5b', 3);
  rr(ctx, x - 44, gy - 50, 88, 7, 3); fillStroke(ctx, '#c9cbe0', 3);
}

const TRAIL = [null, '255,210,80', '255,140,40', '255,80,20'];
/** Fading streak behind a ball shot while hot. Longer and redder the hotter you were. */
function drawTrail(ctx, b) {
  const tr = b.trail, n = tr && tr.length / 2; if (!n || n < 2) return;
  const col = TRAIL[b.heat]; ctx.lineCap = 'round';
  for (let i = 1; i < n; i++) {
    const u = i / n; ctx.strokeStyle = `rgba(${col},${(u * (b.heat === 3 ? 0.75 : 0.5)).toFixed(3)})`; ctx.lineWidth = b.r * (0.4 + u * 1.3);
    ctx.beginPath(); ctx.moveTo(tr[i * 2 - 2], tr[i * 2 - 1]); ctx.lineTo(tr[i * 2], tr[i * 2 + 1]); ctx.stroke();
  }
}

function drawParticles(ctx, ps, hot) {
  for (const p of ps) {
    if ((p.type === 'fire') !== hot || p.life < 0) continue;
    const u = p.life / p.max; ctx.globalAlpha = 1 - u;
    if (p.type === 'ring') {
      const e = 1 - (1 - u) * (1 - u); ctx.globalAlpha = (1 - u) * 0.9;
      ctx.strokeStyle = p.color; ctx.lineWidth = 3 + (1 - u) * 5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * (0.2 + e), p.size * (0.2 + e) * 0.35, 0, 0, 7); ctx.stroke();
      continue;
    }
    if (p.type === 'ember') { ctx.globalAlpha = Math.min(1, (1 - u) * 1.6); ctx.fillStyle = p.color; circ(ctx, p.x, p.y, p.size); ctx.fill(); continue; }
    if (p.type === 'fire') {
      ctx.fillStyle = u < 0.2 ? '#ffe066' : u < 0.55 ? '#ff9a1f' : '#ff4a1c';
      circ(ctx, p.x, p.y, p.size * (1 - u * 0.7)); ctx.fill();
    } else if (p.type === 'steam') {
      ctx.globalAlpha = (1 - u) * 0.5; ctx.fillStyle = '#e8f6ff'; circ(ctx, p.x, p.y, p.size * (0.6 + u)); ctx.fill();
    } else if (p.type === 'star') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = '#fff3a0'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? p.size * 0.45 : p.size, a = (i / 10) * 6.283; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    } else if (p.type === 'coin') {
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * Math.abs(Math.cos(p.rot)) + 1, p.size, 0, 0, 7); fillStroke(ctx, '#ffd23f', 2);
    } else { ctx.fillStyle = p.color; circ(ctx, p.x, p.y, p.size * (1 - u * 0.5)); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

function drawMeter(ctx, L, c) {
  const m = L.meter, { x, y, w, h } = m, win = c.windows(), tgt = c.target, heat = c.heatLevel, t = c.time;
  const hc = HEAT_LEVELS[heat].color, live = c.phase === 'meter';
  ctx.save();
  // flames licking the bar when hot
  if (heat >= 2) {
    for (let i = 0; i < 22; i++) {
      const fx = x + (i + 0.5) * (w / 22), fh = (heat === 3 ? 22 : 10) * (0.5 + 0.5 * Math.abs(Math.sin(t * 9 + i * 1.7)));
      ctx.fillStyle = i % 2 ? '#ff8a1f' : '#ffd23f'; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(fx - 10, y - h / 2); ctx.quadraticCurveTo(fx + Math.sin(t * 12 + i) * 5, y - h / 2 - fh * 2, fx + 10, y - h / 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  rr(ctx, x - 7, y - h / 2 - 7, w + 14, h + 14, h / 2 + 7); ctx.fillStyle = OUT; ctx.fill();
  if (heat > 0) { ctx.strokeStyle = hc; ctx.lineWidth = 3; ctx.stroke(); }
  rr(ctx, x, y - h / 2, w, h, h / 2); ctx.fillStyle = '#4a3b66'; ctx.fill();
  ctx.save(); ctx.clip();
  // travelled portion
  if (live || c.phase === 'flight' || c.phase === 'settle') { ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x, y - h / 2, w * c.meterPos, h); }
  // the zone is a spectrum: red at the risky edges, through orange and yellow, to green beside the perfect sliver
  const zx = x + (tgt - win.make) * w, zw = win.make * 2 * w, pf = (win.perfect / win.make) / 2;
  const g = ctx.createLinearGradient(zx, 0, zx + zw, 0);
  const ramp = [[0, '#d63c3c'], [0.2, '#ff8a2a'], [0.36, '#ffd23f'], [0.5 - pf - 0.005, '#2fd06f']];
  for (const [o, col] of ramp) { g.addColorStop(Math.max(0, o), col); g.addColorStop(Math.min(1, 1 - o), col); }
  // `visual.zoneFade` (a modifier setting): the zone fades out once the marker passes that fraction of the sweep, and
  // comes back after the release, where it shows the odds you took as usual.
  const fadeAt = c.cfg.visual.zoneFade, za = live && fadeAt ? clamp(1 - (c.meterPos - fadeAt) / 0.1, 0, 1) : 1;
  ctx.globalAlpha = za;
  ctx.fillStyle = g; ctx.fillRect(zx, y - h / 2, zw, h);
  if (!c.cfg.visual.hidePerfect) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + (tgt - win.perfect) * w, y - h / 2, win.perfect * 2 * w, h); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x, y - h / 2, w, h * 0.35);
  ctx.restore();
  // perfect notch
  const tx = x + tgt * w;
  if (!c.cfg.visual.hidePerfect && za > 0.02) { ctx.globalAlpha = za; ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(tx - 8, y - h / 2 - 15); ctx.lineTo(tx + 8, y - h / 2 - 15); ctx.lineTo(tx, y - h / 2 - 4); ctx.closePath(); fillStroke(ctx, '#ffffff', 2.5); ctx.globalAlpha = 1; }
  // indicator
  const ix = x + clamp(c.meterPos, 0, 1) * w, rel = c.lastRelease, frozen = !live && rel && (c.phase === 'flight' || c.phase === 'settle');
  if (live || frozen) {
    // Colour shows WHERE you released (the odds), never whether the shot went in: that stays a surprise until the rim.
    const col = frozen && rel.chance >= 1 ? '#ffd23f' : '#ffffff';
    rr(ctx, ix - 6, y - h / 2 - 11, 12, h + 22, 6); fillStroke(ctx, col, 3.5);
    if (live) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; for (let i = 1; i < 4; i++) { ctx.globalAlpha = 0.3 - i * 0.07; rr(ctx, ix - 6 - i * 9, y - h / 2 - 6, 10, h + 12, 5); ctx.fill(); } ctx.globalAlpha = 1; }
  }
  // timing feedback
  if (frozen) {
    const side = rel.err < 0 ? 'EARLY' : 'LATE', pct = Math.round((rel.chance || 0) * 100);
    const label = rel.chance >= 1 ? 'PERFECT' : pct > 0 ? `${side} \u00b7 ${pct}% SHOT` : rel.pos >= 1 ? 'TOO SLOW!' : `TOO ${side}`;
    const col = rel.chance >= 1 ? '#ffd23f' : rel.chance > 0 ? '#ffffff' : '#ff8d8d';   // gold = certain, white = a gamble, red = outside the zone
    outlineText(ctx, label, clamp(ix, x + 70, x + w - 70), y + h / 2 + 30, 20, col, 5);
  }
  if (c.finalStage && (live || c.phase === 'grab')) outlineText(ctx, 'FINAL SHOT · BEAT THE DAILY', x + w / 2, y - h / 2 - 34, 22, '#ffd23f', 6);   // Daily Distance, full court
  if (c.phase === 'ready') {
    const b = 1 + Math.sin(t * 5) * 0.04;
    ctx.save(); ctx.translate(x + w / 2, y - h / 2 - 44); ctx.scale(b, b);
    outlineText(ctx, 'TAP TO START', 0, 0, 30, '#ffd23f', 7); ctx.restore();
    outlineText(ctx, c.readyNote || 'Closer to the centre = better odds', x + w / 2, y + h / 2 + 30, 17, c.readyNote ? c.readyColor || '#fff' : '#fff', 5);
  }
  ctx.restore();
}

function drawOverlays(ctx, L, c) {
  for (const p of c.popups) {
    if (p.t < 0) continue;
    const u = p.t / p.dur, pop = u < 0.15 ? 0.5 + (u / 0.15) * 0.7 : 1.2 - Math.min(1, (u - 0.15) / 0.1) * 0.2;
    // keep the whole line on screen: long character lines were clipped at the edge on phones
    ctx.font = `900 ${p.size}px ${FONT}`;
    const half = (ctx.measureText(p.text).width + 7) * 0.6, fit = Math.min(1, (L.w / 2 - 12) / half), edge = Math.max(90, half * fit + 12);
    ctx.save(); ctx.globalAlpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1; ctx.translate(clamp(p.x, edge, L.w - edge), p.y - u * 34); ctx.scale(pop * fit, pop * fit); ctx.rotate(-0.05);
    outlineText(ctx, p.text, 0, 0, p.size, p.color, 7); ctx.restore();
  }
  const b = c.banner;
  if (b && b.t >= 0) {
    const u = b.t / b.dur, sc = u < 0.14 ? 0.3 + (u / 0.14) * 0.95 : 1.25 - Math.min(1, (u - 0.14) / 0.1) * 0.25;
    const maxSize = (L.w - 40) / (b.text.length * 0.62), size = Math.min(b.big ? 78 : 56, maxSize);
    ctx.save(); ctx.globalAlpha = u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
    ctx.translate(L.w / 2, L.groundY - 330 + (b.big ? Math.sin(c.time * 40) * 3 : 0)); ctx.scale(sc, sc); ctx.rotate(-0.04);
    outlineText(ctx, b.text, 0, 0, size, b.color, 10);
    if (b.sub) outlineText(ctx, b.sub, 0, size * 0.75, size * 0.36, '#ffd23f', 6);
    ctx.restore();
  }
}

/** scene: { map, character, contest|null, time, env (attract only) } */
export function drawScene(ctx, L, scene) {
  const c = scene.contest, t = scene.time, env = c ? c.env : scene.env;
  const swish = c ? c.netSwish : 0;
  ctx.save();
  const shake = c && !calm ? c.shake : 0;
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 12, (Math.random() - 0.5) * shake * 12);
  // camera zoom about the hoop: punches in on a make (more the hotter you are) and pushes in a touch while you move
  // between racks. It only ever zooms IN (and covers the shake), so the edges of the screen are never left unpainted.
  // The meter is drawn outside this, so it never moves.
  const moveU = c && c.phase === 'move' ? clamp(c.t / c.cfg.timing.move, 0, 1) : 0;
  // Daily Distance: push in during the reaction, then ease out over the backpedal, so the camera reads as pulling back
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const moveZ = c && c.distance ? 0.05 * (moveU < 0.15 ? sm(moveU / 0.15) : 1 - sm((moveU - 0.15) / 0.67)) : 0.03 * Math.sin(Math.PI * moveU);
  const z = c && !calm ? (1 + c.kick * 0.045) * (1 + moveZ) * (1 + shake * 0.04) : 1;
  if (z !== 1) { const fx = L.hoopX, fy = L.rimY; ctx.translate(fx, fy); ctx.scale(z, z); ctx.translate(-fx, -fy); }
  // background camera: the map is drawn wider than the screen and slid sideways as you move round the arc
  const camX = (1 - (L.cam ?? 0)) * PAN;
  ctx.save(); ctx.translate(-camX, 0);
  scene.map.draw(ctx, { ...L, w: L.w + PAN * 2, groundY: L.floorY ?? L.groundY, shooterX: L.shooterX + camX, hoopX: L.hoopX + camX }, env);
  ctx.restore();
  if (L.back) drawCourt(ctx, L); else drawLane(ctx, L);
  // the hoop is drawn at full size in its own space, then shrunk about its base when it is far away
  const hoop = (fn) => { const k = L.hoopScale ?? 1; ctx.save(); ctx.translate(L.hoopX, L.hoopBaseY ?? L.groundY); ctx.scale(k, k); ctx.translate(-L.hoopX, -L.groundY); fn({ ...L, rimY: L.groundY - 250, rimHalf: 27 }); ctx.restore(); };
  hoop((H) => hoopBack(ctx, H, swish, t));
  if (c) drawRack(ctx, L, c);

  const pose = c ? c.shooterPose() : stylePose(scene.character, { t, expr: 'happy', hands: { r: [38, -112 + Math.sin(t * 3) * 3], l: [14, -108 + Math.sin(t * 3) * 3] } }, 'idle', t);
  const heat = c ? c.heatLevel : 0, jump = pose.jump || 0;
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(L.shooterX + 4 * L.dir, L.shooterY + 4, 38 - jump * 0.25, 9 - jump * 0.06, 0, 0, 7); ctx.fill();
  if (heat >= 2) {   // heat aura
    const g = ctx.createRadialGradient(L.shooterX, L.shooterY - 110, 20, L.shooterX, L.shooterY - 110, 170);
    g.addColorStop(0, heat === 3 ? 'rgba(255,120,20,.5)' : 'rgba(255,190,60,.28)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g; ctx.fillRect(L.shooterX - 180, L.shooterY - 290, 360, 310);
  }
  const cs = L.charScale ?? 1, heldR = c ? 14 * c.cfg.visual.ballScale * cs : 14;
  const heldFirst = c && c.held && pose.back;       // from behind, the ball is on the far side of the body
  if (heldFirst) drawBall(ctx, c.held.x, c.held.y, heldR, c.time * 2, { money: c.isMoney, fire: heat >= 3, heat });
  drawCharacter(ctx, scene.character, L.shooterX, L.shooterY, cs, pose);

  if (c) {
    const fire = heat >= 3;
    drawParticles(ctx, c.particles, true);
    for (const b of c.balls) drawTrail(ctx, b);
    for (const b of c.balls) if (b.behind) drawBall(ctx, b.x, b.y, b.r, b.rot, b);
    if (c.held && !heldFirst) drawBall(ctx, c.held.x, c.held.y, heldR, c.time * 2, { money: c.isMoney, fire, heat });
    for (const b of c.balls) if (!b.behind) drawBall(ctx, b.x, b.y, b.r, b.rot, b);
  } else {
    drawBall(ctx, L.shooterX + 26 * cs, L.shooterY + (-112 + Math.sin(t * 3) * 3) * cs, 14 * cs, t * 2, {});
  }
  hoop((H) => hoopFront(ctx, H, swish, t));
  if (c) drawParticles(ctx, c.particles, false);
  if (c && c.mod.draws) c.mod.fire('draw', { layer: 'scene', g: ctx, L, t });
  ctx.restore();                                   // end of camera (shake + kick): everything below stays steady

  if (c) {
    if (c.mod.draws) { ctx.save(); c.mod.fire('draw', { layer: 'screen', g: ctx, L, t }); ctx.restore(); }   // under the banners and the meter, always
    if (heat >= 1) {   // warm screen edges: barely there when Heating Up, pulsing when On Fire
      const a = heat === 3 ? 0.3 + Math.sin(t * 6) * 0.08 : heat === 2 ? 0.15 : 0.07;
      const g = ctx.createRadialGradient(L.w / 2, L.h / 2, Math.min(L.w, L.h) * 0.4, L.w / 2, L.h / 2, Math.max(L.w, L.h) * 0.75);
      g.addColorStop(0, 'rgba(255,90,0,0)'); g.addColorStop(1, `rgba(255,${heat === 1 ? 150 : 70},0,${a})`);
      ctx.fillStyle = g; ctx.fillRect(-20, -20, L.w + 40, L.h + 40);
    }
    if (c.flash > 0.01 && !calm) { ctx.fillStyle = `rgba(${c.flashColor},${(c.flash * 0.45).toFixed(3)})`; ctx.fillRect(-20, -20, L.w + 40, L.h + 40); }
    drawOverlays(ctx, L, c);
    if (c.phase !== 'done' && c.phase !== 'finish') drawMeter(ctx, L, c);
  }
}
