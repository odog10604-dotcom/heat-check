// PUBLIC MODE adapters: the same contracts as local.js, backed by the HTTP API described in docs/API.md.
// Rules of the house:
//   - The device copy is written first, then the network. A slow or dead server never blocks or loses a game.
//   - Everything a server sends back is cleaned and type-checked here before the game sees it.
//   - No cookies, no accounts: the anonymous player id travels in a header.
import { GAME } from '../config.js';
import { MAPS } from '../content/maps.js';
import { getModifier } from '../content/modifiers.js';
import { cleanName } from './storage.js';
import { sealRecord } from './local.js';
import { reportError, BUILD } from './telemetry.js';

const int = (v, lo, hi, d = lo) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);

export function createHttpServices({ api, player, local, flags, fetchFn }) {
  const base = api.replace(/\/+$/, ''), game = `/games/${GAME.id}`;
  const doFetch = fetchFn || ((...a) => fetch(...a));

  async function call(method, path, body, ms = 5000) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), ms);
    try {
      const res = await doFetch(base + path, {
        method, credentials: 'omit', signal: ctl ? ctl.signal : undefined,
        headers: { 'Content-Type': 'application/json', 'X-Player-Id': player.id, 'X-Client-Build': BUILD },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
      return res.status === 204 ? null : await res.json();
    } finally { clearTimeout(timer); }
  }

  // ---------------------------------------------------------------- daily
  let served = null;   // the server's challenge, once we have it
  function cleanDef(d) {
    if (!d || typeof d !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return null;
    if (!MAPS.some((m) => m.id === d.mapId)) return null;                              // content this build doesn't have
    if (d.modifierId != null && !getModifier(d.modifierId)) return null;
    if (int(d.rules, 0, 9999) !== GAME.rules) { reportError('daily', new Error('rules mismatch: reload for the latest version')); return null; }
    return { game: GAME.id, date: d.date, number: int(d.number, 1, 1e6), seed: int(d.seed, 0, 4294967295), rules: GAME.rules,
      mapId: d.mapId, modifierId: d.modifierId ?? null, source: 'server', until: Date.parse(d.nextAt) || Date.now() + 3600e3 };
  }
  const daily = {
    /** Sync, never waits: the server's challenge if we hold a current one, otherwise the built-in schedule. */
    today() { return served && Date.now() < served.until ? served : local.daily.today(); },
    async refresh() {
      try { const d = cleanDef(await call('GET', `${game}/daily`)); if (d) served = d; }
      catch (err) { reportError('daily', err); }
      return this.today();
    },
    myResult: (date) => local.daily.myResult(date),
    history: (date, n) => local.daily.history(date, n),             // the device's copy of past official results
    async begin(def) {
      try {
        const r = await call('POST', `${game}/daily/${def.date}/attempts`, { playerId: player.id });
        return { official: !!r.official, attempt: int(r.attempt, 1, 999, 1), token: typeof r.token === 'string' ? r.token.slice(0, 512) : null };
      } catch (err) { reportError('daily', err); return { official: false, attempt: 1, token: null, offline: true }; }   // can't prove an official attempt offline: it's practice
    },
    async submit(def, attempt, result) {
      sealRecord(result, def, attempt);                                  // which challenge, which attempt, which token
      const mine = await local.daily.submit(def, attempt, result);       // device copy first (also stamps the run record)
      if (!attempt.official || !attempt.token) return mine;
      try {
        const r = await call('POST', `${game}/daily/${def.date}/results`, { playerId: player.id, name: player.name, token: attempt.token, run: result.record });
        return { official: true, accepted: !!r.accepted, score: int(r.score, 0, 30, result.score), rank: r.rank == null ? null : int(r.rank, 1, 1e9), total: r.total == null ? null : int(r.total, 0, 1e9) };
      } catch (err) { reportError('daily', err); return { ...mine, pending: true }; }
    },
  };

  // ---------------------------------------------------------------- leaderboard
  const row = (e) => ({ rank: int(e && e.rank, 1, 1e9), name: cleanName(e && e.name) || 'Player', score: int(e && e.score, 0, 30), perfects: int(e && e.perfects, 0, 25), you: !!(e && e.you) });
  const leaderboard = {
    async fetch(board, { limit = 10, around = 2 } = {}) {
      const d = await call('GET', `${game}/leaderboards/${encodeURIComponent(board)}?limit=${limit}&around=${around}`);
      const top = Array.isArray(d.top) ? d.top.slice(0, 100).map(row) : [];
      return { board, top, around: Array.isArray(d.around) ? d.around.slice(0, 20).map(row) : [], you: d.you ? { ...row(d.you), you: true } : null, total: int(d.total, 0, 1e9), simulated: false };
    },
  };

  // ---------------------------------------------------------------- analytics (batched, best effort)
  const queue = [];
  function flush() {
    if (!queue.length) return;
    const body = JSON.stringify({ game: GAME.id, playerId: player.id, sessionId: player.sessionId, events: queue.splice(0, 50) });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(base + '/events', new Blob([body], { type: 'application/json' }))) return;
      doFetch(base + '/events', { method: 'POST', body, keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    } catch { /* analytics never breaks the game */ }
  }
  const sink = (name, data) => { queue.push({ name, data, t: Date.now() }); if (queue.length >= 20) flush(); };
  setInterval(flush, 15000);
  window.addEventListener('pagehide', flush);

  // ---------------------------------------------------------------- remote config (flags)
  flags.refresh = async () => {
    try { const c = await call('GET', `${game}/config`); flags.apply(c && c.flags); }
    catch (err) { reportError('config', err); }
  };

  return { daily, leaderboard, sink, flush };
}
