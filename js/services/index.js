// The one boundary between the game and the outside world.
//
//   LOCAL MODE   (GAME.api empty)  -> local.js adapters: everything stays on the device
//   PUBLIC MODE  (GAME.api set)    -> http.js adapters:  same contracts, backed by the API in docs/API.md
//
// The app shell (main.js) only ever talks to `services`. The engine (Contest, rendering, input, scoring) talks to
// nothing: it is handed a seed and a modifier and hands back a result. Switching modes changes no gameplay code.
import { GAME } from '../config.js';
import { player } from './player.js';
import { localDaily, localLeaderboard, createFlags, dailyBoard } from './local.js';
import { createAds, demoProvider } from './ads.js';
import { createHttpServices } from './http.js';
import { setSink } from './telemetry.js';
import { createAnalytics } from './analytics.js';

/**
 * @typedef {{ id: string, name: string, sessionId: string, setName(v: string): string }} PlayerService
 *
 * @typedef {{ game: string, date: string, number: number, seed: number, rules: number,
 *             mapId: string, modifierId: string|null, source: 'local'|'server' }} DailyDef
 * @typedef {{ official: boolean, attempt: number, token: string|null }} Attempt
 * @typedef {{ official: boolean, accepted: boolean, score: number, rank: number|null, total: number|null, pending?: boolean }} Receipt
 * @typedef {Object} DailyService
 * @property {() => DailyDef} today                 Sync and instant. Never waits on a network.
 * @property {() => Promise<DailyDef>} refresh      Ask the source of truth again (a no-op locally).
 * @property {(date: string) => object|null} myResult   This player's official result for a date, from the device.
 * @property {(date: string, n?: number) => { days: { date: string, score: number|null }[], streak: number, playedToday: boolean }} history
 *           The last n days of official results up to `date` (oldest first) and the current streak, from the device.
 * @property {(def: DailyDef) => Promise<Attempt>} begin     Call when a daily run starts.
 * @property {(def: DailyDef, attempt: Attempt, result: object) => Promise<Receipt>} submit   Call when it ends.
 *
 * @typedef {{ rank: number, name: string, score: number, perfects: number, you: boolean }} Row
 * @typedef {Object} LeaderboardService
 * @property {(board: string, opts?: { limit?: number, around?: number }) =>
 *            Promise<{ board: string, top: Row[], around: Row[], you: Row|null, total: number, simulated: boolean }>} fetch
 *
 * @typedef {{ track(name: string, data?: object): void, recent(): object[], debug: boolean }} AnalyticsService   Events: see EVENTS in analytics.js
 * @typedef {{ on(name: string): boolean, get(name: string, fallback?: any): any, refresh(): Promise<void> }} FlagsService
 * @typedef {{ isAvailable(placement?: string): boolean,
 *             show(placement: string, opts?: { container?: HTMLElement, room?: { w: number, h: number } }): Promise<{ shown: boolean }>,
 *             hide(placement: string): void, gameCompleted(): void, configure(hooks: object): void }} AdsService   See ads.js
 */

function apiBase() {
  if (GAME.api) return GAME.api;
  try {
    const meta = document.querySelector('meta[name="hc-api"]');
    if (meta && meta.content) return meta.content;
    // development only: point a local copy at a test API with ?api=https://...
    if (/^(localhost$|127\.)/.test(location.hostname)) return new URLSearchParams(location.search).get('api') || '';
  } catch { /* no document */ }
  return '';
}

const api = apiBase();
const flags = createFlags();
const local = { daily: localDaily, leaderboard: localLeaderboard };
const http = api ? createHttpServices({ api, player, local, flags }) : null;

// Where analytics events go. LOCAL MODE: nowhere (add ?analytics to see them in the console). PUBLIC MODE: the API.
// To use a provider instead, replace this one line with setSink((name, data) => provider.track(name, data)).
setSink(http ? http.sink : () => {});

// Advertising. There is no ad provider, so this is a no-op service: nothing is available and nothing renders.
// Later: pass a provider adapter here (see docs/ADS.md). `?ads=demo` draws placeholder boxes to judge the layout.
const adsDemo = (() => { try { return new URLSearchParams(location.search).get('ads') === 'demo'; } catch { return false; } })();
const ads = createAds({ provider: adsDemo ? demoProvider : null, enabled: () => adsDemo || flags.on('ads') });

/** @type {{ mode: 'local'|'public', player: PlayerService, daily: DailyService, leaderboard: LeaderboardService,
 *           analytics: AnalyticsService, flags: FlagsService, ads: AdsService }} */
export const services = {
  mode: http ? 'public' : 'local',
  player,
  daily: http ? http.daily : localDaily,
  leaderboard: http ? http.leaderboard : localLeaderboard,
  analytics: createAnalytics({ sessionId: player.sessionId }),
  flags,
  ads,
};

export { dailyBoard };
