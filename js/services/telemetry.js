// The single seam for analytics and error reporting. Nothing is sent anywhere yet.
//   track('game_end', { score: 24 })   -> call from anywhere; safe before a sink exists (events are buffered)
//   setSink((name, data) => ...)       -> plug in an analytics provider later, in one place
//   reportError('where', err)          -> logs (first few only, so a per-frame error can't flood) and tracks
// Keep event payloads free of personal data: ids, scores and settings only.
export const BUILD = (typeof document !== 'undefined' && document.documentElement.dataset.build) || 'dev';

let sink = null;
const buffer = [];
export function setSink(fn) { sink = fn; for (const e of buffer.splice(0)) { try { fn(e.name, e.data); } catch { /* sink's problem */ } } }
export function track(name, data = {}) {
  const payload = { ...data, build: BUILD };
  try { if (sink) sink(name, payload); else if (buffer.length < 200) buffer.push({ name, data: payload }); } catch { /* never let analytics break the game */ }
}

let errors = 0;
export function reportError(where, err) {
  if (errors++ >= 10) return;
  console.error(`[${where}]`, err);
  track('error', { where, message: String((err && err.message) || err).slice(0, 200) });
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => reportError('window', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => reportError('promise', e.reason));
}
