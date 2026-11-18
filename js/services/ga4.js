// Google Analytics 4: the only file that knows about Google. It is a sink for the event catalogue (analytics.js):
// main.js tracks catalogue events as always, and this turns the ones listed in GA_EVENTS into GA4 events.
// Anything not listed here never reaches Google.
//
//   const send = createGa4('G-XXXXXXXXXX');   // null if the id is missing or malformed: analytics stays off
//   send('game_completed', shapedEvent);       // fire and forget, never throws
//
// The measurement id is not in the code. build.py writes it into dist/index.html as <meta name="hc-ga4"> from the
// GA4_MEASUREMENT_ID environment variable (Vercel) or "ga4" in site.json. Source and dev pages have no id, so local
// play never sends anything (try it on localhost with ?ga4=G-XXXXXXXXXX). See docs/ANALYTICS.md.
//
// GA4 itself provides page_view, session_start, first_visit, device, country, traffic source and retention.
// gtag.js loads after the page has finished loading, so it never delays the game; events made before then queue
// in dataLayer. If the script is blocked, the queue just sits there: nothing waits on it.

export const GA_ID = /^G-[A-Z0-9]{4,20}$/;

// Only these query parameters may appear in the page address GA4 sees (campaign attribution). Debug switches,
// test ids and anything else are stripped.
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'];
export function cleanLocation(loc = location) {
  const q = new URLSearchParams(loc.search), keep = new URLSearchParams();
  for (const k of UTM) if (q.get(k)) keep.set(k, q.get(k).slice(0, 100));
  const qs = keep.toString();
  return loc.origin + loc.pathname + (qs ? '?' + qs : '');
}

const yes = (b) => (b ? 'true' : 'false');
const mode = (d) => (d.mode === 'daily' ? 'daily' : 'quick_play');
const runType = (d) => (d.warmup ? 'warmup' : d.mode === 'daily' ? (d.practice ? 'practice' : 'official') : 'quick');
const modifier = (m) => m || 'classic';
const game = (d) => ({ mode: mode(d), run_type: runType(d), format: d.format, character: d.character, map: d.map, modifier: modifier(d.modifier), daily_date: d.date });
// Daily Distance: how far the run got (see the catalogue in analytics.js)
const reach = (d) => ({ daily_stage_reached: d.stage, daily_distance_reached: d.distance, daily_shots_survived: d.survived });

/** Catalogue event -> [GA4 event name, params]. Params are short ids and numbers only. */
export const GA_EVENTS = {
  game_started: (d) => ['game_started', { ...game(d), entry: d.via, game_number: d.nth }],
  game_completed: (d) => ['game_completed', { ...game(d), score: d.score, makes: d.makes, perfects: d.perfects, money_balls: d.money,
    heat_level_reached: d.maxHeat, best_streak: d.streak, shots: typeof d.shots === 'string' ? d.shots.length : undefined,
    duration_seconds: d.durS, game_number: d.nth, replay_number: d.nth - 1 }],
  game_abandoned: (d) => ['game_abandoned', { ...game(d), shots: d.shot, score: d.score, reason: d.how, game_number: d.nth }],
  daily_viewed: (d) => ['daily_viewed', { daily_date: d.date, daily_number: d.daily, already_played: yes(d.played) }],
  daily_started: (d) => ['daily_started', { daily_date: d.date, daily_number: d.daily, character: d.character, map: d.map, format: d.format }],
  daily_completed: (d) => ['daily_completed', { daily_date: d.date, daily_number: d.daily, score: d.score, makes: d.makes, character: d.character,
    map: d.map, format: d.format, duration_seconds: d.durS, ...reach(d), daily_full_court_made: d.completed == null ? undefined : yes(d.completed), perfects: d.perfects }],
  daily_abandoned: (d) => ['daily_abandoned', { daily_date: d.date, daily_number: d.daily, ...reach(d), reason: d.how }],
  daily_full_court_made: (d) => ['daily_full_court_made', { daily_date: d.date, daily_number: d.daily, character: d.character, perfects: d.perfects,
    duration_seconds: d.durS, run_type: d.official ? 'official' : 'practice' }],
  daily_warmup_started: (d) => ['daily_warmup_started', { daily_date: d.date, character: d.character, map: d.map }],
  daily_warmup_to_official: (d) => ['daily_warmup_to_official', { daily_date: d.date, character: d.character, warmups: d.warmups }],
  replay_clicked: (d) => ['replay_clicked', { previous_mode: mode(d), previous_run_type: runType(d), previous_score: d.score }],
  share_clicked: (d) => ['share_clicked', { mode: mode(d), method: d.how, score: d.score, daily_number: d.daily }],
  character_selected: (d) => ['character_selected', { character: d.character, mode: mode(d) }],
  dark_horse_progress: (d) => ['dark_horse_progress', { milestone: d.milestone, unlocked: yes(d.unlocked), games_played: d.games }],
  dark_horse_unlocked: (d) => ['dark_horse_unlocked', { games_played: d.games, makes: d.makes }],
  new_high_score: (d) => ['new_high_score', { score: d.score, previous_best: d.previous, games_played: d.games }],
  leaderboard_viewed: (d) => ['leaderboard_viewed', { daily_number: d.daily, already_played: yes(d.played) }],
  error: (d) => ['app_error', { where: d.where }],   // where it broke only: error messages can contain anything
};

/** Translate one catalogue event, or null if it isn't sent to GA4. Drops empty params; adds the build id. */
export function toGa(name, d) {
  const f = GA_EVENTS[name];
  if (!f) return null;
  const [gaName, raw] = f(d || {}), params = {};
  for (const [k, v] of Object.entries(raw)) if (v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && !Number.isFinite(v))) params[k] = v;
  if (d && d.build) params.app_build = d.build;
  return [gaName, params];
}

/** Start GA4 for a measurement id. Returns a sink `(name, data) => void`, or null if analytics stays off. */
export function createGa4(id, { debug = false } = {}) {
  if (typeof window === 'undefined' || !GA_ID.test(id || '')) return null;
  try {
    const w = window;
    w.dataLayer = w.dataLayer || [];
    // gtag.js reads `arguments` objects from dataLayer, so this must stay a plain function
    w.gtag = w.gtag || function gtag() { w.dataLayer.push(arguments); };
    const loc = cleanLocation();
    w.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });   // no ads, no ad profiles
    w.gtag('js', new Date());
    w.gtag('set', { page_location: loc });
    w.gtag('config', id, { page_location: loc, allow_google_signals: false, allow_ad_personalization_signals: false, ...(debug ? { debug_mode: true } : {}) });
    const load = () => {
      try {
        const s = document.createElement('script');
        s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
        s.onerror = () => { if (debug) console.warn('[analytics] gtag.js did not load (blocked or offline): GA4 is off for this visit'); };
        document.head.appendChild(s);
      } catch { /* analytics never breaks the game */ }
    };
    if (document.readyState === 'complete') setTimeout(load, 0); else w.addEventListener('load', load, { once: true });
    return (name, data) => {
      try {
        const e = toGa(name, data);
        if (!e) return;
        w.gtag('event', e[0], e[1]);
        if (debug) console.log(`%c[ga4] ${e[0]}`, 'color:#4285f4;font-weight:bold', e[1]);
      } catch { /* analytics never breaks the game */ }
    };
  } catch { return null; }
}
