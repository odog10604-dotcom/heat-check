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

export const MAPS = [gym, beach, rooftop];
export const getMap = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
