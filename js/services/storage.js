// Local persistence for THIS GAME's progress. One JSON blob in localStorage. (Who the player is lives in player.js.)
// Everything read back is treated as untrusted (it can be hand-edited, truncated, or written by an older build):
// load() rebuilds a clean object field by field, so a bad value can never crash the game or reach the page.
const KEY = 'heatcheck.v1';
const KEEP_DAILIES = 60;                      // days of Daily history kept on the device
const ADJ = ['Sweaty', 'Clutch', 'Wobbly', 'Greasy', 'Humble', 'Spicy', 'Sleepy', 'Turbo', 'Crusty', 'Soggy', 'Big', 'Lil'];
const NOUN = ['Pickle', 'Pigeon', 'Noodle', 'Bucket', 'Sandal', 'Waffle', 'Goblin', 'Dad', 'Biscuit', 'Walrus', 'Kneepad', 'Meatball'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v, lo, hi, d = lo) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);
const str = (v, d, max = 32) => (typeof v === 'string' && v.length <= max ? v : d);

/** Player-chosen display name: plain text, no markup or control characters, 16 chars max. */
export function cleanName(v) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) : ''; }

export function newId() {
  try { return crypto.randomUUID(); } catch { return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
}
export const randomName = () => `${ADJ[(Math.random() * ADJ.length) | 0]}${NOUN[(Math.random() * NOUN.length) | 0]}${10 + ((Math.random() * 89) | 0)}`;

const TIERS = ['perfect', 'good', 'ok', 'miss'];
const MAX_SHOTS = 40;                         // 25 in a contest; a Daily Distance run has one per stage (19 today)
const format = (v) => (v === 'distance' ? 'distance' : 'contest');
/** A stored game result, rebuilt so later readers (share card, home screen, a future upload) can rely on its shape. */
function cleanResult(r) {
  const shots = Array.isArray(r.shots) ? r.shots.slice(0, MAX_SHOTS).map((s) => ({ tier: TIERS.includes(s && s.tier) ? s.tier : 'miss', money: !!(s && s.money), pos: Number.isFinite(+(s && s.pos)) ? Math.max(0, Math.min(1, +s.pos)) : 0 })) : [];
  const fmt = format(r.format);
  return {
    score: int(r.score, 0, fmt === 'distance' ? MAX_SHOTS : 30), makes: int(r.makes, 0, MAX_SHOTS), total: int(r.total, 1, MAX_SHOTS, 25), perfects: int(r.perfects, 0, MAX_SHOTS), moneyMade: int(r.moneyMade, 0, 5),
    maxHeat: int(r.maxHeat, 0, 3), bestStreak: int(r.bestStreak, 0, MAX_SHOTS), shots, format: fmt,
    // Daily Distance only: stages made, how many there were, feet of the last one made, and whether the run beat it
    ...(fmt === 'distance' ? { stage: int(r.stage, 0, MAX_SHOTS), stages: int(r.stages, 1, MAX_SHOTS, 19), distance: int(r.distance, 0, 200), completed: !!r.completed } : {}),
    mode: r.mode === 'daily' ? 'daily' : 'quick', practice: !!r.practice, mapId: str(r.mapId, 'gym'), characterId: str(r.characterId, 'knight'),
    modifierId: typeof r.modifierId === 'string' ? str(r.modifierId, null, 40) : null,
    seed: int(r.seed, 0, 4294967295, 0), rules: int(r.rules, 0, 9999, 0), attempt: int(r.attempt, 1, 999, 1),
    record: cleanRecord(r.record),
  };
}

/** The run record (format: engine/rules.js), rebuilt field by field. Returns null if it isn't one. */
function cleanRecord(c) {
  if (!isObj(c) || !Array.isArray(c.shots)) return null;
  const idOrNull = (v, max = 64) => (typeof v === 'string' && v.length <= max ? v : null);
  const claim = isObj(c.claim) ? c.claim : {}, ch = isObj(c.challenge) ? c.challenge : null;
  return {
    v: int(c.v, 0, 999), game: str(c.game, ''), mode: c.mode === 'daily' ? 'daily' : 'quick', format: format(c.format),
    rules: int(c.rules, 0, 9999), rulesHash: str(c.rulesHash, '', 16), build: idOrNull(c.build, 40),
    seed: int(c.seed, 0, 4294967295), dice: c.dice == null ? null : int(c.dice, 0, 4294967295), modifierId: idOrNull(c.modifierId, 40),
    mapId: str(c.mapId, 'gym'), characterId: str(c.characterId, 'knight'),
    runId: idOrNull(c.runId), challenge: ch ? { id: str(ch.id, '', 64), date: DATE.test(ch.date) ? ch.date : '', number: int(ch.number, 0, 1e6) } : null,
    attempt: int(c.attempt, 1, 999, 1), token: idOrNull(c.token, 512),
    startedAt: c.startedAt == null ? null : int(c.startedAt, 0, 1e14), wallMs: int(c.wallMs, 0, 86400000), gameMs: int(c.gameMs, 0, 86400000), pauses: int(c.pauses, 0, 9999),
    shots: c.shots.slice(0, MAX_SHOTS).map((s) => [int(s && s[0], 0, 1e6), int(s && s[1], 0, 86400000)]),
    claim: { score: int(claim.score, 0, MAX_SHOTS), makes: int(claim.makes, 0, MAX_SHOTS), perfects: int(claim.perfects, 0, MAX_SHOTS), moneyMade: int(claim.moneyMade, 0, 5), maxHeat: int(claim.maxHeat, 0, 3), bestStreak: int(claim.bestStreak, 0, MAX_SHOTS) },
  };
}

function sanitize(raw) {
  const s = isObj(raw) ? raw : {};
  const out = {
    v: 1,
    unlocked: Array.isArray(s.unlocked) ? [...new Set(s.unlocked.filter((x) => typeof x === 'string').map((x) => (x === 'mystery' ? 'darkhorse' : x)))].slice(0, 50) : [],
    best: int(s.best, 0, 30), games: int(s.games, 0, 1e9), muted: !!s.muted,
    bestMakes: int(s.bestMakes, 0, 25),          // most makes in one game, any mode: progress toward a 'makes' unlock
    lastChar: str(s.lastChar, 'knight') === 'mystery' ? 'darkhorse' : str(s.lastChar, 'knight'),   // a retired character id is replaced in main.js (openSetup)
    lastMap: str(s.lastMap, 'random'),
    daily: {}, tries: {}, boards: {},
  };
  const days = isObj(s.daily) ? Object.keys(s.daily).filter((k) => DATE.test(k) && isObj(s.daily[k]) && Number.isFinite(+s.daily[k].score)).sort().slice(-KEEP_DAILIES) : [];
  for (const k of days) out.daily[k] = cleanResult(s.daily[k]);
  // saves from before bestMakes existed: the daily results kept on the device are the only makes we still know about
  for (const k of days) if (out.daily[k].format === 'contest') out.bestMakes = Math.max(out.bestMakes, out.daily[k].makes);   // a distance run's makes aren't "of 25"
  if (isObj(s.tries)) for (const k of Object.keys(s.tries).filter((x) => DATE.test(x)).sort().slice(-KEEP_DAILIES)) out.tries[k] = int(s.tries[k], 0, 999);
  if (isObj(s.boards)) for (const k of days) for (const pre of ['daily:', 'distance:']) { const b = s.boards[pre + k]; if (isObj(b)) out.boards[pre + k] = { name: cleanName(b.name), score: int(b.score, 0, MAX_SHOTS), perfects: int(b.perfects, 0, MAX_SHOTS) }; }
  return out;
}

function read() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }

const raw = read();
/** Identity an older build kept inside the game save. player.js adopts it once, then owns identity. */
export const legacyIdentity = { id: isObj(raw) ? str(raw.id, '', 64) : '', name: isObj(raw) ? cleanName(raw.name) : '' };
export const save = sanitize(raw);

let warned = false;
/** Write the save. Returns false if the browser refused (private mode, storage full, storage disabled). */
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); return true; }
  catch (err) { if (!warned) { warned = true; console.warn('[storage] progress cannot be saved on this browser', err); } return false; }
}
persist();

// Another tab finished a game: fold its progress in so the two tabs don't overwrite each other.
try {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    let other; try { other = sanitize(JSON.parse(e.newValue)); } catch { return; }
    save.best = Math.max(save.best, other.best); save.games = Math.max(save.games, other.games); save.bestMakes = Math.max(save.bestMakes, other.bestMakes);
    for (const id of other.unlocked) if (!save.unlocked.includes(id)) save.unlocked.push(id);
    for (const k of Object.keys(other.daily)) if (!save.daily[k]) save.daily[k] = other.daily[k];
    for (const k of Object.keys(other.boards)) if (!save.boards[k]) save.boards[k] = other.boards[k];
    for (const k of Object.keys(other.tries)) save.tries[k] = Math.max(save.tries[k] || 0, other.tries[k]);
  });
} catch { /* no window (tests) */ }
