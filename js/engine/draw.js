// Small shared canvas helpers.
export const OUT = '#2b1e3a';
export const FONT = '"Arial Rounded MT Bold","Nunito","Segoe UI",system-ui,sans-serif';

export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }

export function fillStroke(ctx, fill, lw = 3, stroke = OUT) {
  ctx.fillStyle = fill; ctx.fill();
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

export function outlineText(ctx, text, x, y, size, fill, lw = 6, align = 'center') {
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

export const lerp = (a, b, u) => a + (b - a) * u;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const easeOut = (u) => 1 - (1 - u) * (1 - u);
