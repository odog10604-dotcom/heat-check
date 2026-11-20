// Maps are purely cosmetic. Each one is { id, name, blurb, draw(ctx, L, env) }.
// L   = layout  { w, h, groundY, shooterX, hoopX, ... } in world units
// env = live mood { t, hype 0..1, burst 0..1, groan 0..1, heat 0..3, score, rack }
// To add Map 4: write another object with a draw() and push it into MAPS.
import { mulberry32 } from '../core/rng.js';
import { OUT, rr, circ, fillStroke, FONT } from '../engine/draw.js';

const SHIRTS = ['#e83f5b', '#3fb6a8', '#ffd23f', '#6c7bff', '#ff8a1f', '#9b5de5', '#f15bb5', '#ffffff'];
const SKINS = ['#f2b98f', '#b97a50', '#8a5a3c', '#f7d2b0', '#d99a6c'];

function makeFans(seed, rows) {
  const r = mulberry32(seed), out = [];
  for (const row of rows) {
    for (let x = row.x0; x <= row.x1; x += row.step) {
      if (r() < (row.skip || 0)) continue;
      out.push({ x: x + (r() - 0.5) * row.step * 0.4, y: row.y + (r() - 0.5) * 4, s: row.s || 1, ph: r() * 6.28, th: 0.25 + r() * 0.6,
        shirt: SHIRTS[(r() * SHIRTS.length) | 0], skin: SKINS[(r() * SKINS.length) | 0] });
    }
  }
  return out;
}

function fan(ctx, f, env) {
  const hy = env.hype, g = env.groan, s = f.s;
  const bob = Math.abs(Math.sin(env.t * (4 + hy * 8) + f.ph)) * (2 + hy * 13) * s * (1 - g);
  const x = f.x, y = f.y - bob + g * 6 * s;
  ctx.lineCap = 'round'; ctx.strokeStyle = f.skin; ctx.lineWidth = 5 * s; ctx.beginPath();
  if (g > 0.3) { ctx.moveTo(x - 9 * s, y - 6 * s); ctx.lineTo(x - 7 * s, y - 24 * s); ctx.moveTo(x + 9 * s, y - 6 * s); ctx.lineTo(x + 7 * s, y - 24 * s); }
  else if (hy > f.th) { const w = Math.sin(env.t * 12 + f.ph) * 4 * s; ctx.moveTo(x - 9 * s, y - 6 * s); ctx.lineTo(x - 16 * s + w, y - 32 * s); ctx.moveTo(x + 9 * s, y - 6 * s); ctx.lineTo(x + 16 * s + w, y - 32 * s); }
  ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = OUT;
  ctx.beginPath(); ctx.ellipse(x, y, 12 * s, 16 * s, 0, 0, 7); ctx.fillStyle = f.shirt; ctx.fill(); ctx.stroke();
  circ(ctx, x, y - 21 * s, 9.5 * s); ctx.fillStyle = f.skin; ctx.fill(); ctx.stroke();
  ctx.fillStyle = OUT;
  circ(ctx, x - 3 * s, y - 23 * s, 1.4 * s); ctx.fill(); circ(ctx, x + 4 * s, y - 23 * s, 1.4 * s); ctx.fill();
  if (g > 0.3) { ctx.beginPath(); ctx.arc(x + 0.5 * s, y - 15 * s, 3 * s, Math.PI * 1.15, Math.PI * 1.85); ctx.lineWidth = 1.5; ctx.stroke(); }
  else if (hy > 0.45) { circ(ctx, x + 0.5 * s, y - 17.5 * s, 2.6 * s); ctx.fill(); }
  const heat = env.heat || 0;
  if (heat >= 2 && g < 0.3 && f.th < (heat === 3 ? 0.5 : 0.33)) {   // Hot: some fans hold up flame signs; On Fire: lots of them
    const sx = x + Math.sin(env.t * 6 + f.ph) * 3 * s, sy = y - 50 * s;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.fillRect(sx - 11 * s, sy - 8 * s, 22 * s, 15 * s); ctx.strokeRect(sx - 11 * s, sy - 8 * s, 22 * s, 15 * s);
    ctx.fillStyle = '#ff6a1f'; ctx.beginPath(); ctx.moveTo(sx, sy - 6 * s); ctx.quadraticCurveTo(sx + 7 * s, sy + 1 * s, sx, sy + 5 * s); ctx.quadraticCurveTo(sx - 7 * s, sy + 1 * s, sx, sy - 6 * s); ctx.fill();
  }
  if (heat >= 2 && Math.sin(env.t * 2.3 + f.ph * 9) > (heat === 3 ? 0.97 : 0.99)) {   // phone camera flashes in the stands
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 2 * s : 7 * s, a = (i / 8) * 6.283; ctx.lineTo(x + 6 * s + Math.cos(a) * r, y - 24 * s + Math.sin(a) * r); }
    ctx.fill();
  }
}

function cached(map, L, build) {
  const key = Math.round(L.w) + 'x' + Math.round(L.groundY);
  if (!map._c || map._c.key !== key) { map._c = build(); map._c.key = key; }
  return map._c;
}

/** Three-point line on the floor: sweeps behind the shooter from the wings, wraps in front from the top. */
function arcLine(ctx, L) {
  // An ellipse centred under the hoop whose near edge crosses the floor just in FRONT of the shooter's toes,
  // so the shooter always reads as standing behind the line. It opens up as the view turns face-on.
  if (L.back) return;   // behind-the-shooter spots get fully projected court lines from the renderer
  const sd = L.side ?? 1, f = 1 - Math.abs(sd), gy = L.groundY, d = L.hoopX >= L.shooterX ? 1 : -1;
  const reach = Math.abs(L.hoopX - L.shooterX), cx = L.hoopX + sd * 24, rx = Math.abs(cx - L.shooterX) - 50, ry = 46 + f * 34;
  ctx.save(); ctx.beginPath(); ctx.rect(-50, gy - 30, L.w + 100, L.h); ctx.clip();
  ctx.beginPath(); ctx.ellipse(cx, gy + 28, Math.max(60, rx), ry, 0, d > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, d > 0 ? Math.PI * 1.5 : Math.PI * 0.5); ctx.stroke();
  ctx.restore();
}

function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

// ------------------------------------------------------------------ SCHOOL GYM
const gym = {
  id: 'gym', name: 'School Gym', blurb: 'Home of the Fighting Pigeons.',
  draw(ctx, L, env) {
    const { w, h, groundY: gy } = L;
    const c = cached(this, L, () => ({
      fans: makeFans(11, [0, 1, 2].map((r) => ({ y: gy - 122 + r * 32, x0: 14, x1: w - 10, step: 36, skip: 0.08 }))),
    }));
    // wall
    ctx.fillStyle = vgrad(ctx, 0, gy, [[0, '#f3d08a'], [1, '#f9e3b0']]); ctx.fillRect(0, 0, w, gy);
    ctx.fillStyle = '#3fb6a8'; ctx.fillRect(0, gy - 236, w, 22);
    ctx.fillStyle = '#e83f5b'; ctx.fillRect(0, gy - 214, w, 6);
    ctx.strokeStyle = 'rgba(160,110,40,.14)'; ctx.lineWidth = 2;
    for (let y = gy - 260; y > 0; y -= 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // high windows
    for (let x = 60; x < w; x += 190) {
      rr(ctx, x, gy - 520, 110, 70, 8); fillStroke(ctx, '#bfe9ff', 4);
      ctx.beginPath(); ctx.moveTo(x + 55, gy - 520); ctx.lineTo(x + 55, gy - 450); ctx.stroke();
    }
    // banners
    const banners = [['CHAMPS', "'87", '#e83f5b'], ['GO', 'PIGEONS', '#3fb6a8'], ['2ND PLACE', '(ONCE)', '#6c7bff'], ['SPIRIT', 'WEEK', '#ff8a1f']];
    const bw = 92, gap = Math.max(18, (w - banners.length * bw) / (banners.length + 1));
    banners.forEach((b, i) => {
      const x = gap + i * (bw + gap), y = gy - 400 + Math.sin(env.t * 1.5 + i) * 2;
      if (Math.abs(x + bw / 2 - w / 2) < 120) return;                   // keep clear of the scoreboard
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + 92); ctx.lineTo(x + bw / 2, y + 116); ctx.lineTo(x, y + 92); ctx.closePath();
      fillStroke(ctx, b[2], 3.5);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 15px ${FONT}`; ctx.fillText(b[0], x + bw / 2, y + 34); ctx.fillText(b[1], x + bw / 2, y + 56);
    });
    // scoreboard (shows the real score)
    const sx = w / 2 - 100, sy = gy - 410;
    rr(ctx, sx, sy, 200, 96, 12); fillStroke(ctx, '#2b1e3a', 5, env.heat >= 2 ? (env.heat === 3 && Math.sin(env.t * 10) > 0 ? '#ff5a1f' : '#ff9a3a') : '#57466e');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 13px ${FONT}`; ctx.fillStyle = '#b9a9d6'; ctx.fillText('HOME', sx + 52, sy + 20); ctx.fillText('RACK', sx + 150, sy + 20);
    const flash = env.burst > 0.5 && Math.sin(env.t * 30) > 0;
    ctx.font = `900 46px ${FONT}`; ctx.fillStyle = flash ? '#fff' : '#ffd23f'; ctx.fillText(String(env.score ?? 0).padStart(2, '0'), sx + 52, sy + 58);
    ctx.fillStyle = '#ff5a4d'; ctx.fillText(String(env.rack ?? 1), sx + 150, sy + 58);
    // bleachers + students
    for (let r = 0; r < 3; r++) {
      const y = gy - 122 + r * 32;
      ctx.fillStyle = r % 2 ? '#a9683a' : '#96592f'; ctx.fillRect(0, y + 6, w, 34);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, y + 36, w, 4);
    }
    for (const f of c.fans) fan(ctx, f, env);
    ctx.fillStyle = '#7b4826'; ctx.fillRect(0, gy - 48, w, 16);
    // mascot: a person in a pigeon suit who is doing their best
    this.mascot(ctx, w * 0.5 + Math.sin(env.t * 0.7) * 30, gy - 30, env);
    // floor
    ctx.fillStyle = vgrad(ctx, gy - 34, h, [[0, '#e6aa62'], [1, '#c8823b']]); ctx.fillRect(0, gy - 34, w, h - gy + 34);
    ctx.strokeStyle = 'rgba(120,70,20,.18)'; ctx.lineWidth = 2;
    for (let x = -h; x < w + h; x += 46) { ctx.beginPath(); ctx.moveTo(x, gy - 34); ctx.lineTo(x - (h - gy) * 0.5, h); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 5;
    arcLine(ctx, L);
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(0, gy - 34, w, 5);
  },
  mascot(ctx, x, y, env) {
    const hy = env.hype, bob = Math.abs(Math.sin(env.t * (5 + hy * 6))) * (4 + hy * 16) * (1 - env.groan);
    const yy = y - bob, flap = Math.sin(env.t * (8 + hy * 10)) * (0.3 + hy * 0.8);
    ctx.strokeStyle = '#f39c2d'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 9, yy - 4); ctx.lineTo(x - 11, y + 8); ctx.moveTo(x + 9, yy - 4); ctx.lineTo(x + 11, y + 8); ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(x + s * 22, yy - 40); ctx.rotate(s * (0.5 - flap));
      ctx.beginPath(); ctx.ellipse(s * 12, 6, 16, 8, 0, 0, 7); fillStroke(ctx, '#8d93a8', 3); ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(x, yy - 32, 26, 32, 0, 0, 7); fillStroke(ctx, '#a9afc4', 3);
    ctx.beginPath(); ctx.ellipse(x, yy - 22, 16, 18, 0, 0, 7); ctx.fillStyle = '#d6d9e6'; ctx.fill();
    circ(ctx, x + 2, yy - 70, 20); fillStroke(ctx, '#a9afc4', 3);
    ctx.beginPath(); ctx.moveTo(x + 14, yy - 72); ctx.lineTo(x + 36, yy - 66); ctx.lineTo(x + 14, yy - 60); ctx.closePath(); fillStroke(ctx, '#f39c2d', 3);
    circ(ctx, x - 2, yy - 76, 6.5); fillStroke(ctx, '#fff', 2); circ(ctx, x + 11, yy - 77, 5.5); fillStroke(ctx, '#fff', 2);
    ctx.fillStyle = OUT; const gx = env.groan > 0.3 ? 0 : Math.sin(env.t * 9) * 2 * hy;
    circ(ctx, x - 1 + gx, yy - 76, 2.2); ctx.fill(); circ(ctx, x + 12 - gx, yy - 77, 2); ctx.fill();
  },
};

// ------------------------------------------------------------------ BEACH
const beach = {
  id: 'beach', name: 'Boardwalk Beach', blurb: 'Sand in places sand should not be.',
  draw(ctx, L, env) {
    const { w, h, groundY: gy } = L, hz = gy - 150, t = env.t;
    const c = cached(this, L, () => {
      const r = mulberry32(22);
      return {
        fans: makeFans(22, [{ y: gy - 52, x0: 20, x1: w - 10, step: 44, skip: 0.22 }]),
        umbrellas: Array.from({ length: Math.ceil(w / 210) }, (_, i) => ({ x: 70 + i * 210 + r() * 60, col: SHIRTS[(r() * 6) | 0] })),
        clouds: Array.from({ length: 4 }, () => ({ x: r() * w, y: hz - 120 - r() * 260, s: 0.7 + r() * 0.7, v: 4 + r() * 6 })),
      };
    });
    ctx.fillStyle = vgrad(ctx, 0, hz, [[0, '#3fb4ef'], [0.7, '#a8e4ff'], [1, '#ffefc2']]); ctx.fillRect(0, 0, w, hz + 1);
    // sun
    const sx = w * 0.72, sy = hz - 150, pulse = 1 + env.hype * 0.12 * Math.sin(t * 8);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 0.2);
    ctx.fillStyle = 'rgba(255,220,90,.35)';
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, -(84 + env.hype * 30) * pulse); ctx.lineTo(9, 0); ctx.fill(); }
    ctx.restore();
    circ(ctx, sx, sy, 46 * pulse); fillStroke(ctx, env.heat >= 3 ? '#ff8a2a' : '#ffd23f', 4, env.heat >= 3 ? '#e8401f' : '#f5a623');
    ctx.fillStyle = OUT; // the sun is wearing sunglasses. obviously.
    rr(ctx, sx - 30, sy - 12, 26, 15, 6); ctx.fill(); rr(ctx, sx + 4, sy - 12, 26, 15, 6); ctx.fill(); ctx.fillRect(sx - 6, sy - 8, 12, 4);
    ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(sx, sy + 12, 14, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    // clouds
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (const cl of c.clouds) {
      const x = ((cl.x + t * cl.v) % (w + 200)) - 100;
      ctx.beginPath(); ctx.ellipse(x, cl.y, 46 * cl.s, 18 * cl.s, 0, 0, 7); ctx.ellipse(x + 30 * cl.s, cl.y - 12 * cl.s, 30 * cl.s, 18 * cl.s, 0, 0, 7); ctx.ellipse(x - 28 * cl.s, cl.y - 6 * cl.s, 24 * cl.s, 14 * cl.s, 0, 0, 7); ctx.fill();
    }
    // sea
    ctx.fillStyle = vgrad(ctx, hz, gy - 78, [[0, '#1c9fd6'], [1, '#56d2e8']]); ctx.fillRect(0, hz, w, 74);
    ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 3;
    for (let r = 0; r < 4; r++) {
      const y = hz + 12 + r * 17; ctx.beginPath();
      for (let x = -20; x <= w + 20; x += 20) { const yy = y + Math.sin(x * 0.03 + t * (1.5 + r * 0.3) + r) * 3; x === -20 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.setLineDash([26, 34 + r * 9]); ctx.lineDashOffset = -t * 20 * (r % 2 ? 1 : -1); ctx.stroke();
    }
    ctx.setLineDash([]);
    // floatie guy, bobbing, unbothered
    const fx = w * 0.3 + Math.sin(t * 0.25) * 40, fy = hz + 30 + Math.sin(t * 2) * 3;
    ctx.beginPath(); ctx.ellipse(fx, fy, 24, 9, 0, 0, 7); fillStroke(ctx, '#f15bb5', 3);
    circ(ctx, fx, fy - 15, 9); fillStroke(ctx, SKINS[0], 2.5);
    if (env.hype > 0.5) { ctx.strokeStyle = SKINS[0]; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(fx - 8, fy - 6); ctx.lineTo(fx - 16, fy - 28); ctx.moveTo(fx + 8, fy - 6); ctx.lineTo(fx + 16, fy - 28); ctx.stroke(); }
    // sand
    ctx.fillStyle = vgrad(ctx, gy - 80, gy - 20, [[0, '#ffe7a8'], [1, '#f4cf7c']]); ctx.fillRect(0, gy - 80, w, 60);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath();
    for (let x = 0; x <= w; x += 24) ctx.lineTo(x, gy - 80 + Math.sin(x * 0.05 + t * 1.3) * 3);
    ctx.lineTo(w, gy - 74); ctx.lineTo(0, gy - 74); ctx.fill();
    // palms
    for (const [px, lean] of [[36, 0.12], [w - 44, -0.14]]) this.palm(ctx, px, gy - 58, lean, t, env.hype);
    // umbrellas + beachgoers
    for (const u of c.umbrellas) {
      ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(u.x, gy - 40); ctx.lineTo(u.x + 6, gy - 122); ctx.stroke();
      ctx.beginPath(); ctx.arc(u.x + 6, gy - 116, 44, Math.PI, 0); ctx.closePath(); fillStroke(ctx, u.col, 3);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(u.x + 6, gy - 160); ctx.arc(u.x + 6, gy - 116, 44, Math.PI * 1.35, Math.PI * 1.65); ctx.closePath(); ctx.fill();
    }
    for (const f of c.fans) fan(ctx, f, env);
    // boardwalk court
    ctx.fillStyle = vgrad(ctx, gy - 30, h, [[0, '#edc98f'], [1, '#c99a5b']]); ctx.fillRect(0, gy - 30, w, h - gy + 30);
    ctx.strokeStyle = 'rgba(110,70,30,.22)'; ctx.lineWidth = 2;
    for (let y = gy - 30; y < h; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = '#b98850'; ctx.fillRect(0, gy - 34, w, 6);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 5; arcLine(ctx, L);
    // crab hype-man
    const cx = w * 0.5 + Math.sin(t * (1 + env.hype * 3)) * 60, cy = gy - 20, up = env.hype > 0.4 && env.groan < 0.3;
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx + s * 8, cy); ctx.lineTo(cx + s * (16 + i * 4), cy + 8 + Math.sin(t * 20 + i) * 2); ctx.stroke(); }
    for (const s of [-1, 1]) { const ay = up ? cy - 22 - Math.abs(Math.sin(t * 14)) * 6 : cy - 6; ctx.beginPath(); ctx.moveTo(cx + s * 10, cy - 4); ctx.lineTo(cx + s * 20, ay); ctx.stroke(); circ(ctx, cx + s * 21, ay - 3, 6); fillStroke(ctx, '#e74c3c', 2.5); }
    ctx.beginPath(); ctx.ellipse(cx, cy - 2, 15, 10, 0, 0, 7); fillStroke(ctx, '#e74c3c', 3);
    ctx.fillStyle = '#fff'; circ(ctx, cx - 5, cy - 12, 4); ctx.fill(); circ(ctx, cx + 5, cy - 12, 4); ctx.fill();
    ctx.fillStyle = OUT; circ(ctx, cx - 5, cy - 12, 1.8); ctx.fill(); circ(ctx, cx + 5, cy - 12, 1.8); ctx.fill();
    // seagull
    const gxp = ((t * 60) % (w + 300)) - 150, gyp = hz - 60 + Math.sin(t * 1.3) * 20, fl = Math.sin(t * 9) * 8;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(gxp - 16, gyp - fl); ctx.quadraticCurveTo(gxp - 6, gyp - 6, gxp, gyp); ctx.quadraticCurveTo(gxp + 6, gyp - 6, gxp + 16, gyp - fl); ctx.stroke();
  },
  palm(ctx, x, y, lean, t, hype) {
    const top = { x: x + lean * 240, y: y - 230 }, sway = Math.sin(t * (1.2 + hype * 2)) * (0.04 + hype * 0.08);
    ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.quadraticCurveTo(x + lean * 60, y - 120, top.x - 6, top.y); ctx.lineTo(top.x + 6, top.y); ctx.quadraticCurveTo(x + lean * 60 + 16, y - 120, x + 11, y); ctx.closePath();
    fillStroke(ctx, '#a9743f', 3);
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.translate(top.x, top.y); ctx.rotate(-Math.PI / 2 + (i - 2.5) * 0.62 + sway * (i % 2 ? 1 : -1));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(46, -26, 96, 12); ctx.quadraticCurveTo(46, 2, 0, 0); fillStroke(ctx, i % 2 ? '#3fae5a' : '#2f9a4c', 3); ctx.restore();
    }
    circ(ctx, top.x - 6, top.y + 6, 7); fillStroke(ctx, '#7b4a22', 2.5); circ(ctx, top.x + 7, top.y + 8, 7); fillStroke(ctx, '#7b4a22', 2.5);
  },
};

// ------------------------------------------------------------------ ROOFTOP
const rooftop = {
  id: 'rooftop', name: 'Midnight Rooftop', blurb: 'The pigeons have seen things.',
  draw(ctx, L, env) {
    const { w, h, groundY: gy } = L, t = env.t, base = gy - 60;
    const c = cached(this, L, () => {
      const r = mulberry32(33), far = [], near = [];
      for (let x = -20; x < w + 40;) { const bw = 50 + r() * 60; far.push({ x, w: bw, h: 160 + r() * 260, seed: (r() * 1e6) | 0 }); x += bw + 4; }
      for (let x = -30; x < w + 40;) { const bw = 70 + r() * 80; near.push({ x, w: bw, h: 70 + r() * 150, seed: (r() * 1e6) | 0 }); x += bw + 10 + r() * 30; }
      return {
        far, near,
        stars: Array.from({ length: 70 }, () => ({ x: r() * w, y: r() * (gy - 220), s: 0.6 + r() * 1.6, ph: r() * 6 })),
        fans: makeFans(33, [{ y: gy - 74, x0: 30, x1: w - 20, step: 52, skip: 0.3 }]),
        pigeons: Array.from({ length: Math.max(4, Math.floor(w / 150)) }, (_, i) => ({ x: 60 + i * 150 + r() * 60, ph: r() * 6 })),
      };
    });
    ctx.fillStyle = vgrad(ctx, 0, base, [[0, '#140f33'], [0.55, '#43266b'], [0.85, '#b2496f'], [1, '#f58a5c']]); ctx.fillRect(0, 0, w, base + 1);
    for (const s of c.stars) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.ph)); ctx.fillStyle = '#fff'; circ(ctx, s.x, s.y, s.s); ctx.fill(); }
    ctx.globalAlpha = 1;
    const mx = w * 0.2, my = Math.max(70, gy - 470);
    ctx.fillStyle = 'rgba(255,244,200,.15)'; circ(ctx, mx, my, 60); ctx.fill();
    circ(ctx, mx, my, 38); ctx.fillStyle = '#fff4c8'; ctx.fill();
    ctx.fillStyle = 'rgba(200,180,120,.5)'; circ(ctx, mx - 10, my - 8, 8); ctx.fill(); circ(ctx, mx + 12, my + 10, 5); ctx.fill();
    // skyline
    const party = env.heat >= 3;
    const windows = (b, colBase, lit, cw, ch) => {
      const r = mulberry32(b.seed);
      for (let yy = base - b.h + 12; yy < base - 10; yy += ch + 8) for (let xx = b.x + 8; xx < b.x + b.w - cw; xx += cw + 7) {
        const v = r(); if (v > lit + env.hype * 0.35) continue;
        ctx.fillStyle = party ? `hsl(${(v * 360 + t * 300) % 360},90%,65%)` : (v < 0.08 ? '#9fe8ff' : colBase);
        ctx.fillRect(xx, yy, cw, ch);
      }
    };
    for (const b of c.far) { ctx.fillStyle = '#2a1c50'; ctx.fillRect(b.x, base - b.h, b.w, b.h); windows(b, '#f7c66b', 0.3, 6, 8); }
    // water tower
    const tx = w * 0.84, ty = base - 250;
    ctx.strokeStyle = '#150f2b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(tx - 24, ty + 60); ctx.lineTo(tx - 30, base); ctx.moveTo(tx + 24, ty + 60); ctx.lineTo(tx + 30, base); ctx.moveTo(tx - 26, ty + 100); ctx.lineTo(tx + 28, ty + 140); ctx.stroke();
    rr(ctx, tx - 34, ty, 68, 62, 6); fillStroke(ctx, '#6d4a3a', 4, '#150f2b');
    ctx.beginPath(); ctx.moveTo(tx - 40, ty + 2); ctx.lineTo(tx, ty - 30); ctx.lineTo(tx + 40, ty + 2); ctx.closePath(); fillStroke(ctx, '#8a5d49', 4, '#150f2b');
    for (const b of c.near) { ctx.fillStyle = '#1b1238'; ctx.fillRect(b.x, base - b.h, b.w, b.h); windows(b, '#ffd98a', 0.4, 10, 13); }
    // string lights
    ctx.strokeStyle = '#150f2b'; ctx.lineWidth = 2; ctx.beginPath();
    const sag = (x) => gy - 330 + Math.sin((x / w) * Math.PI) * 46;
    for (let x = 0; x <= w; x += 20) x === 0 ? ctx.moveTo(x, sag(x)) : ctx.lineTo(x, sag(x));
    ctx.stroke();
    const cols = ['#ffd23f', '#ff5a4d', '#3fe0c5', '#f15bb5'];
    for (let x = 20, i = 0; x < w; x += 48, i++) {
      const on = 0.55 + 0.45 * Math.sin(t * (2 + env.hype * 10) + i * 1.7);
      ctx.globalAlpha = 0.25 * on; ctx.fillStyle = cols[i % 4]; circ(ctx, x, sag(x) + 8, 16); ctx.fill();
      ctx.globalAlpha = 0.5 + 0.5 * on; circ(ctx, x, sag(x) + 8, 6); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // nosy neighbours peeking over the parapet
    for (const f of c.fans) fan(ctx, f, env);
    ctx.fillStyle = '#4a4560'; ctx.fillRect(0, gy - 64, w, 40);
    ctx.fillStyle = '#6a6485'; ctx.fillRect(0, gy - 70, w, 10);
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 2;
    for (let x = 30; x < w; x += 70) { ctx.beginPath(); ctx.moveTo(x, gy - 60); ctx.lineTo(x, gy - 24); ctx.stroke(); }
    // pigeons
    for (const p of c.pigeons) {
      const scared = env.burst > 0.35, up = scared ? env.burst * 60 + Math.sin(t * 6 + p.ph) * 8 : 0;
      const x = p.x + (scared ? Math.sin(t * 3 + p.ph) * 14 : 0), y = gy - 70 - up, peck = scared ? 0 : Math.max(0, Math.sin(t * 2 + p.ph)) * 4;
      if (scared) { const fl = Math.sin(t * 30 + p.ph) * 10; ctx.strokeStyle = '#b7bdd1'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 16, y - 12 - fl); ctx.lineTo(x, y - 8); ctx.lineTo(x + 16, y - 12 - fl); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(x, y - 8, 11, 8, 0, 0, 7); fillStroke(ctx, '#9aa1b8', 2.5);
      circ(ctx, x + 9, y - 16 + peck, 6); fillStroke(ctx, '#b7bdd1', 2.5);
      ctx.fillStyle = '#f39c2d'; ctx.beginPath(); ctx.moveTo(x + 14, y - 17 + peck); ctx.lineTo(x + 20, y - 15 + peck); ctx.lineTo(x + 14, y - 13 + peck); ctx.fill();
      ctx.fillStyle = OUT; circ(ctx, x + 10, y - 17 + peck, 1.4); ctx.fill();
    }
    // roof floor
    ctx.fillStyle = vgrad(ctx, gy - 26, h, [[0, '#6f6b86'], [1, '#4b4763']]); ctx.fillRect(0, gy - 26, w, h - gy + 26);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 5; ctx.setLineDash([22, 14]);
    arcLine(ctx, L); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * 0.15, gy + 20); ctx.lineTo(w * 0.2, gy + 44); ctx.lineTo(w * 0.17, gy + 70); ctx.moveTo(w * 0.7, gy + 50); ctx.lineTo(w * 0.76, gy + 64); ctx.stroke();
    // AC unit
    const ax = w - 200, ay = gy - 58;
    { rr(ctx, ax, ay, 78, 50, 6); fillStroke(ctx, '#8d89a6', 3.5); ctx.save(); ctx.translate(ax + 39, ay + 25); ctx.rotate(t * (3 + env.hype * 14)); ctx.strokeStyle = OUT; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.rotate(2.094); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -17); ctx.stroke(); } ctx.restore(); circ(ctx, ax + 39, ay + 25, 19); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke(); }
  },
};

// ------------------------------------------------------------------ GRAND CASINO ARENA (official Daily only)
// A luxury casino ballroom with a basketball court in the middle of it. Told through materials and light, not props:
// cream marble columns and arches, burgundy velvet, walnut panelling, brass trim, crystal chandeliers, a backlit
// HEAT CHECK! DAILY sign and a well-dressed crowd in silhouette. Dark overall, with warm pools of light.
// Extra fields the renderer reads (all optional, so every other map is unaffected):
//   court   colours for the projected court lines and the centre-court logo (render.js drawCourt)
//   light   the arena lighting pass: darkness at the edges, a spotlight pool on the shooter and the hoop (render.js)
//   intro   seconds of the "lights come up" entrance before the first tap
//   audio   sfx names for the arena's moments (engine/audio.js); a missing one is simply skipped
// env.dist (feet, live during moves), env.final (last stage) and env.lights (0..1, the entrance) shape it as you go.
const BRASS = '#c9a24e', BRASS_HI = '#f1d58c', BRASS_LO = '#7a5a22', MARBLE = '#efe4cf', MARBLE_SH = '#cdb894';
const VELVET = '#4d0f1d', VELVET_LO = '#260610', WALNUT = '#3b2116', WALNUT_LO = '#22120b', NIGHT = '#120a0d';
const DRESS = ['#6e1426', '#1c1622', '#b48a3c', '#2a2f4a', '#4a1630', '#efe4cf'];

function crowdRow(r, x0, x1, step, y, s, skip) {
  const out = [];
  for (let x = x0; x <= x1; x += step) { if (r() < skip) continue; out.push({ x: x + (r() - 0.5) * step * 0.5, y: y + (r() - 0.5) * 3, s: s * (0.9 + r() * 0.2), ph: r() * 6.28, dress: DRESS[(r() * DRESS.length) | 0], tie: r() < 0.5, th: r() }); }
  return out;
}

/** One guest in silhouette: head and shoulders, a hint of what they're wearing, a warm rim of light on top. */
function guest(ctx, g, env, rim) {
  const s = g.s, up = env.burst > 0.35 && g.th < env.burst * 0.8;      // a big moment: some of them stand and applaud
  const y = g.y - (up ? 6 * s : 0) - Math.sin(env.t * 0.8 + g.ph) * 0.8 * s, x = g.x;
  ctx.fillStyle = NIGHT;
  ctx.beginPath(); ctx.moveTo(x - 15 * s, y + 18 * s); ctx.quadraticCurveTo(x - 15 * s, y - 2 * s, x, y - 3 * s); ctx.quadraticCurveTo(x + 15 * s, y - 2 * s, x + 15 * s, y + 18 * s); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y - 13 * s, 8 * s, 9.5 * s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = g.dress; ctx.globalAlpha = 0.55 * rim;
  if (g.tie) { ctx.beginPath(); ctx.moveTo(x - 3 * s, y - 2 * s); ctx.lineTo(x + 3 * s, y - 2 * s); ctx.lineTo(x, y + 9 * s); ctx.fill(); }
  else { ctx.beginPath(); ctx.ellipse(x, y + 8 * s, 10 * s, 7 * s, 0, Math.PI, 0); ctx.fill(); }
  ctx.globalAlpha = 0.5 * rim; ctx.strokeStyle = '#ffcf8a'; ctx.lineWidth = 1.6 * s;
  ctx.beginPath(); ctx.arc(x, y - 13 * s, 8.5 * s, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  if (up) { ctx.globalAlpha = 1; ctx.strokeStyle = NIGHT; ctx.lineWidth = 4 * s; ctx.lineCap = 'round'; const c = Math.sin(env.t * 18 + g.ph) * 3 * s; ctx.beginPath(); ctx.moveTo(x - 8 * s, y + 4 * s); ctx.lineTo(x - 3 * s + c, y - 26 * s); ctx.moveTo(x + 8 * s, y + 4 * s); ctx.lineTo(x + 3 * s - c, y - 26 * s); ctx.stroke(); }
  ctx.globalAlpha = 1;
}

/** A crystal chandelier: brass crown and arms, candle bulbs, strands of crystal drops. Precomputed, gently swaying. */
function makeChandelier(r, size) {
  const drops = [];
  for (const [ry, n, len] of [[0, 20, 5], [26, 15, 4], [50, 9, 3]]) {
    const rx = (78 - ry * 0.9) * size;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r() * 0.2; drops.push({ x: Math.cos(a) * rx, y: (ry + 8 + Math.sin(a) * 6) * size, len: len + ((r() * 2) | 0), front: Math.sin(a) > 0, ph: r() * 6 }); }
  }
  return { size, drops, ph: r() * 6 };
}
/** Draw a chandelier's body (crown, rings, bulbs, crystal) centred on (cx, bodyY), with its warm halo. Used once per
 *  chandelier size to bake a sprite; the game then only rotates the sprite and adds a few sparkles. */
function chandelier(ctx, cx, bodyY, ch) {
  const s = ch.size;
  const g = ctx.createRadialGradient(cx, bodyY + 30 * s, 10 * s, cx, bodyY + 30 * s, 190 * s);
  g.addColorStop(0, 'rgba(255,214,150,.32)'); g.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - 200 * s, bodyY - 170 * s, 400 * s, 400 * s);
  const drop = (d) => {
    const x = cx + d.x, y = bodyY + d.y, yy = y + d.len * 5 * s;
    ctx.strokeStyle = 'rgba(255,236,200,.5)'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, yy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,248,230,.85)'; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 2.6 * s, yy + 4 * s); ctx.lineTo(x, yy + 9 * s); ctx.lineTo(x - 2.6 * s, yy + 4 * s); ctx.fill();
  };
  for (const d of ch.drops) if (!d.front) drop(d);
  for (const [ry, rx] of [[0, 78], [26, 56], [50, 34]]) {
    ctx.beginPath(); ctx.ellipse(cx, bodyY + ry * s, rx * s, 9 * s, 0, 0, 7); ctx.lineWidth = 4 * s; ctx.strokeStyle = BRASS; ctx.stroke(); ctx.lineWidth = 1.5 * s; ctx.strokeStyle = BRASS_HI; ctx.stroke();
  }
  // a slim brass stem with a crystal finial: the crystal, not the metal, should be what you notice
  ctx.beginPath(); ctx.moveTo(cx - 9 * s, bodyY - 30 * s); ctx.quadraticCurveTo(cx, bodyY - 40 * s, cx + 9 * s, bodyY - 30 * s); ctx.lineTo(cx + 4 * s, bodyY + 60 * s); ctx.lineTo(cx - 4 * s, bodyY + 60 * s); ctx.closePath();
  ctx.fillStyle = BRASS; ctx.fill(); ctx.lineWidth = 1.5 * s; ctx.strokeStyle = BRASS_LO; ctx.stroke();
  ctx.fillStyle = 'rgba(255,250,235,.95)'; ctx.beginPath(); ctx.moveTo(cx, bodyY + 58 * s); ctx.lineTo(cx + 6 * s, bodyY + 72 * s); ctx.lineTo(cx, bodyY + 92 * s); ctx.lineTo(cx - 6 * s, bodyY + 72 * s); ctx.fill();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, x = cx + Math.cos(a) * 78 * s, y = bodyY + Math.sin(a) * 9 * s - 10 * s;
    ctx.fillStyle = 'rgba(255,214,140,.3)'; ctx.beginPath(); ctx.arc(x, y, 12 * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff4d6'; ctx.beginPath(); ctx.ellipse(x, y, 2.6 * s, 4 * s, 0, 0, 7); ctx.fill();
  }
  for (const d of ch.drops) if (d.front) drop(d);
}

/** Bake a drawing into an offscreen canvas covering world rect (x0, y0, w, h) at `res` pixels per world unit. */
function bake(x0, y0, w, h, res, paint) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * res)); cv.height = Math.max(1, Math.ceil(h * res));
  const g = cv.getContext('2d'); g.setTransform(res, 0, 0, res, -x0 * res, -y0 * res); paint(g);
  return { cv, x0, y0, w, h };
}
const blit = (ctx, b) => ctx.drawImage(b.cv, b.x0, b.y0, b.w, b.h);

const casino = {
  id: 'casino', name: 'Grand Casino Arena', blurb: 'Tonight\'s featured attraction.', arena: true,
  court: { key: 'rgba(116,18,38,.66)', wash: 'rgba(255,214,150,.05)', line: 'rgba(233,203,135,.95)', shadow: 'rgba(0,0,0,.5)', circle: 'rgba(116,18,38,.8)', logo: 'HEAT CHECK!', logoSub: 'DAILY', logoColor: '#e9c97a' },
  light: { vignette: 0.72, final: 0.88, pool: '255,206,140' },
  intro: 1.2,
  audio: { enter: 'arenaEnter', half: 'arenaHalf', final: 'arenaFinal', ambience: null },
  /**
   * PERFORMANCE: everything that doesn't move (the hall, the guests, the sign, each chandelier) is painted once into
   * offscreen canvases when the layout changes, then drawn as images. Per frame there are only a few images, the
   * floor, a handful of animated guests and sparkles: about the cost of the other maps.
   */
  build(L, res) {
    const { w, groundY: gy } = L, cx = w / 2, r = mulberry32(77), oy = gy - 40, top = gy - 640, archTop = gy - 520, balc = gy - 170;
    const span = w * 1.6, x0 = cx - span / 2, x1 = cx + span / 2, cols = [];
    for (let x = x0; x <= x1; x += 190) cols.push(Math.round(x));
    const balcony = crowdRow(r, x0, x1, 30, gy - 196, 0.8, 0.12), floor = crowdRow(r, x0, x1, 40, gy - 54, 1.05, 0.18);
    const alive = (g, i) => i % 7 === 3;                                        // these few are drawn live, so the room breathes
    const still = { t: 0, burst: 0 };
    // the hall: everything in the "group" that shrinks as you back away (k), at k = 1
    const hx0 = cx - w * 0.72, hy0 = oy - oy / 0.72 - 20, hall = bake(hx0, hy0, w * 1.44, balc + 40 - hy0, res, (ctx) => {
      ctx.fillStyle = WALNUT_LO; ctx.fillRect(hx0, hy0, w * 1.44, top + 30 - hy0);
      ctx.fillStyle = BRASS; ctx.fillRect(hx0, top + 22, w * 1.44, 5); ctx.fillStyle = BRASS_LO; ctx.fillRect(hx0, top + 27, w * 1.44, 3);
      for (let i = 0; i < cols.length - 1; i++) {                                // arches: velvet, folds, a sconce glow, brass trim
        const a = cols[i] + 26, b = cols[i + 1] - 26, m = (a + b) / 2, rw = (b - a) / 2;
        ctx.beginPath(); ctx.moveTo(a, balc); ctx.lineTo(a, archTop + rw); ctx.arc(m, archTop + rw, rw, Math.PI, 0); ctx.lineTo(b, balc); ctx.closePath();
        ctx.fillStyle = vgrad(ctx, archTop, balc, [[0, VELVET], [1, VELVET_LO]]); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 7;
        for (let x = a + 12; x < b; x += 22) { ctx.beginPath(); ctx.moveTo(x, archTop); ctx.quadraticCurveTo(x + 5, (archTop + balc) / 2, x - 2, balc); ctx.stroke(); }
        const sg = ctx.createRadialGradient(m, archTop + rw * 0.9, 4, m, archTop + rw * 0.9, rw * 1.6);
        sg.addColorStop(0, 'rgba(255,200,130,.32)'); sg.addColorStop(1, 'rgba(255,170,90,0)'); ctx.fillStyle = sg; ctx.fillRect(a, archTop, b - a, balc - archTop);
        ctx.restore();
        ctx.beginPath(); ctx.arc(m, archTop + rw, rw + 3, Math.PI, 0); ctx.lineWidth = 5; ctx.strokeStyle = BRASS; ctx.stroke();
        circ(ctx, m, archTop - 3, 5); ctx.fillStyle = BRASS_HI; ctx.fill();
      }
      for (const x of cols) {                                                     // marble columns, brass capitals and bases
        ctx.fillStyle = vgrad(ctx, top, balc, [[0, MARBLE_SH], [0.5, MARBLE], [1, MARBLE_SH]]); ctx.fillRect(x - 24, top + 30, 48, balc - top - 30);
        ctx.fillStyle = 'rgba(120,90,50,.18)'; ctx.fillRect(x - 24, top + 30, 9, balc - top - 30); ctx.fillRect(x + 15, top + 30, 9, balc - top - 30);
        ctx.strokeStyle = 'rgba(150,120,80,.28)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 6, top + 80); ctx.bezierCurveTo(x + 12, top + 160, x - 14, top + 260, x + 4, top + 380); ctx.stroke();
        ctx.fillStyle = BRASS; rr(ctx, x - 32, top + 26, 64, 18, 4); ctx.fill(); ctx.fillStyle = BRASS_HI; ctx.fillRect(x - 30, top + 28, 60, 3);
        ctx.fillStyle = BRASS; rr(ctx, x - 30, balc - 14, 60, 14, 3); ctx.fill();
      }
      // the upper hall falls away into darkness, so the chandeliers and the sign are what glows up there
      ctx.fillStyle = vgrad(ctx, hy0, balc, [[0, 'rgba(6,3,5,1)'], [0.45, 'rgba(6,3,5,.8)'], [0.8, 'rgba(6,3,5,.35)'], [1, 'rgba(6,3,5,.1)']]);
      ctx.fillRect(hx0, hy0, w * 1.44, balc - hy0);
      balcony.forEach((g, i) => { if (!alive(g, i)) guest(ctx, g, still, 1); });
      ctx.fillStyle = WALNUT; ctx.fillRect(hx0, balc, w * 1.44, 36);
      ctx.fillStyle = BRASS; ctx.fillRect(hx0, balc - 2, w * 1.44, 4); ctx.fillRect(hx0, balc + 33, w * 1.44, 3);
      ctx.strokeStyle = BRASS_LO; ctx.lineWidth = 2.5; ctx.beginPath(); for (let x = hx0; x < hx0 + w * 1.44; x += 16) { ctx.moveTo(x, balc - 26); ctx.lineTo(x, balc - 2); } ctx.stroke();
      ctx.fillStyle = BRASS; ctx.fillRect(hx0, balc - 29, w * 1.44, 4);
    });
    // the lower wall and the courtside guests (not scaled with distance)
    const lower = bake(0, gy - 160, w, 130, res, (ctx) => {
      ctx.fillStyle = vgrad(ctx, gy - 134, gy - 30, [[0, WALNUT], [1, WALNUT_LO]]); ctx.fillRect(0, gy - 134, w, 104);
      ctx.strokeStyle = 'rgba(201,162,78,.35)'; ctx.lineWidth = 2;
      for (let x = ((cx % 120) + 120) % 120 - 120; x < w; x += 120) { rr(ctx, x + 10, gy - 120, 100, 70, 4); ctx.stroke(); }
      floor.forEach((g, i) => { if (!alive(g, i)) guest(ctx, g, still, 1); });
    });
    // the sign: tonight's featured attraction, backlit brass letters on black (the glow is the expensive part: baked)
    const sign = bake(-280, -200, 560, 400, res, (ctx) => {
      const halo = ctx.createRadialGradient(0, 0, 20, 0, 0, 260); halo.addColorStop(0, 'rgba(255,200,120,.26)'); halo.addColorStop(1, 'rgba(255,180,100,0)');
      ctx.fillStyle = halo; ctx.fillRect(-280, -200, 560, 400);
      rr(ctx, -165, -48, 330, 96, 10); ctx.fillStyle = '#0b0608'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = BRASS; ctx.stroke();
      rr(ctx, -157, -40, 314, 80, 6); ctx.lineWidth = 1.5; ctx.strokeStyle = BRASS_LO; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 44px ${FONT}`; ctx.shadowColor = 'rgba(255,190,90,.8)'; ctx.shadowBlur = 14;
      ctx.fillStyle = vgrad(ctx, -34, 6, [[0, '#fff0c2'], [0.55, BRASS_HI], [1, '#d8ad55']]); ctx.fillText('HEAT CHECK!', 0, -10);
      ctx.shadowBlur = 0; ctx.font = `900 15px ${FONT}`; ctx.fillStyle = '#e9c97a'; ctx.fillText('D  A  I  L  Y', 0, 26);
      ctx.fillStyle = BRASS; ctx.fillRect(-120, 25, 60, 1.5); ctx.fillRect(60, 25, 60, 1.5);
    });
    const chand = [1.35, 1.05].map((size) => { const ch = makeChandelier(r, size); ch.sprite = bake(-200 * size, -170 * size, 400 * size, 400 * size, res, (ctx) => chandelier(ctx, 0, 0, ch)); return ch; });
    return { res, top, balc, oy, hall, lower, sign, chand, live: { balcony: balcony.filter(alive), floor: floor.filter(alive) } };
  },
  draw(ctx, L, env) {
    const { w, h, groundY: gy } = L, t = env.t, cx = w / 2, lights = env.lights ?? 1, fin = env.final ? 1 : 0;
    let a = 1; try { a = Math.abs(ctx.getTransform().a) || 1; } catch { /* old browser: 1 */ }
    const res = Math.min(1.25, Math.max(0.5, Math.round(a * 4) / 4));
    let c = cached(this, L, () => this.build(L, res));
    if (c.res !== res) { this._c = null; c = cached(this, L, () => this.build(L, res)); }
    // the room: dark at the top, warm towards the court
    ctx.fillStyle = vgrad(ctx, 0, gy, [[0, '#0d0709'], [0.55, '#1d0f12'], [1, '#2c1610']]); ctx.fillRect(0, 0, w, gy);
    // As you back away from the hoop the hall keeps getting bigger: the architecture shrinks toward the court, so more
    // columns, arches and chandeliers come into view (a camera feel only; distances are the game's).
    const far = Math.max(0, Math.min(1, ((env.dist ?? 4) - 4) / 84)), k = 1 - 0.26 * far, oy = c.oy;
    ctx.save(); ctx.translate(cx, oy); ctx.scale(k, k); ctx.translate(-cx, -oy);
    blit(ctx, c.hall);
    // The sign sits in the clear band between the HUD (top ~140 css px) and the backboard, at its own size when it fits,
    // smaller when it nearly does. Where there's no band at all (landscape close-ups) it fades into brass lettering on
    // the balcony instead. Worked out in screen space, then mapped into this shrinking group (k).
    const toG = (y) => oy + (y - oy) / k, hudLim = 140 / (L.s || 1);
    const bb = (L.rimY ?? gy - 250) - 104 * (L.hoopScale ?? 1), avail = bb - 10 - hudLim;
    const want = oy + (gy - 390 - oy) * k, signA = Math.max(0, Math.min(1, (avail - 58) / 30));
    if (signA > 0) {
      const ss = Math.min(1, Math.max(0.6, avail / (96 * k))), half = 48 * ss * k, sY = Math.max(hudLim + half, Math.min(want, bb - 10 - half));
      ctx.save(); ctx.translate(cx, toG(sY)); ctx.scale(ss, ss); ctx.globalAlpha = signA * (0.85 + 0.15 * fin); blit(ctx, c.sign); ctx.restore();
    }
    if (signA < 1) {
      ctx.save(); ctx.globalAlpha = 1 - signA; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 22px ${FONT}`;
      ctx.fillStyle = '#e9c97a'; ctx.fillText('HEAT CHECK!  ·  DAILY', cx, c.balc + 17); ctx.restore();
    }
    // chandeliers, clear of the hoop and the sign: a slow sway, and the odd crystal catching the light
    const hang = Math.max(-40, c.top + 40);
    [[-1.45, 1], [-0.72, 0], [0.72, 0], [1.45, 1]].forEach(([fx, i], n) => {
      const ch = c.chand[i], s = ch.size, x = cx + fx * 400, bodyY = hang + (Math.abs(fx) > 1 ? 10 : 40) + 90 * s, sway = Math.sin(t * 0.45 + n * 1.7) * 0.012;
      ctx.save(); ctx.translate(x, hang); ctx.rotate(sway); ctx.translate(-x, -hang);
      ctx.strokeStyle = BRASS_LO; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(x, hang - 400); ctx.lineTo(x, bodyY - 30 * s); ctx.stroke();
      ctx.translate(x, bodyY); blit(ctx, ch.sprite);
      for (let j = 0; j < 4; j++) {
        const d = ch.drops[(j * 7 + n * 3) % ch.drops.length], tw = Math.max(0, Math.sin(t * (1.1 + j * 0.3) + d.ph * 3 + n));
        if (tw < 0.85) continue;
        const px = d.x, py = d.y + d.len * 5 * s + 4 * s, r = (tw - 0.85) * 40 * s;
        ctx.fillStyle = `rgba(255,252,240,${(tw - 0.85) * 5})`; ctx.beginPath(); ctx.moveTo(px, py - r); ctx.lineTo(px + r * 0.25, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r * 0.25, py); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(px - r, py); ctx.lineTo(px, py + r * 0.25); ctx.lineTo(px + r, py); ctx.lineTo(px, py - r * 0.25); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    });
    const rim = (0.55 + 0.45 * lights) * (1 + 0.5 * fin + 0.4 * far);   // the crowd leans in as the shots get sillier
    for (const g of c.live.balcony) guest(ctx, g, env, rim);
    ctx.restore();
    blit(ctx, c.lower);
    for (const g of c.live.floor) guest(ctx, g, env, rim);
    // the floor: polished dark walnut with a burgundy carpet apron, the chandeliers reflected in the varnish
    ctx.fillStyle = '#5a1020'; ctx.fillRect(0, gy - 36, w, 12); ctx.fillStyle = BRASS; ctx.fillRect(0, gy - 37, w, 2); ctx.fillRect(0, gy - 25, w, 2);
    ctx.fillStyle = vgrad(ctx, gy - 24, h, [[0, '#4a2a19'], [0.4, '#3a2014'], [1, '#26140c']]); ctx.fillRect(0, gy - 24, w, h - gy + 24);
    ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 2;
    const vx = L.hoopX, vy = gy - 380, f0 = (gy - 24 - vy) / (h - vy);                 // planks run toward the hoop
    ctx.beginPath(); for (let i = -24; i <= 24; i++) { const x = vx + i * 60; ctx.moveTo(vx + (x - vx) * f0, gy - 24); ctx.lineTo(x, h); } ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createLinearGradient(0, gy - 24, 0, gy + 260); rg.addColorStop(0, `rgba(255,200,130,${0.16 * lights})`); rg.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = rg; ctx.beginPath();
    for (const fx of [-0.72, 0.72, 0]) { const x = cx + fx * 400 * k; ctx.moveTo(x - 18, gy - 24); ctx.lineTo(x + 18, gy - 24); ctx.lineTo(x + 60, gy + 260); ctx.lineTo(x - 60, gy + 260); ctx.closePath(); }
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(233,203,135,.6)'; ctx.lineWidth = 4; arcLine(ctx, L);
  },
};

export const MAPS = [gym, beach, rooftop];
/** Environments that are not in the Quick Play list or the daily map rotation. The casino arena is the official Daily's. */
export const ARENAS = [casino];
export const DAILY_ARENA = casino;
export const getMap = (id) => MAPS.find((m) => m.id === id) || ARENAS.find((m) => m.id === id) || MAPS[0];
