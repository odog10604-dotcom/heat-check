# HEAT CHECK! — service boundary and future API

The game runs entirely on the device today. This document describes the one boundary a backend will plug into, and the HTTP contract the client already speaks. Nothing here exists server-side yet.

## The boundary

```
main.js (app shell) ──► services (js/services/index.js) ──► LOCAL MODE:  local.js   (device only)
                                                        └─► PUBLIC MODE: http.js    (this API)
engine (Contest, rendering, input, scoring) ──► nothing. It gets a seed + modifier and returns a result.
```

- **Mode switch:** set `GAME.api` in `js/config.js`, or add `<meta name="hc-api" content="https://…/v1">` to `index.html`. Empty means local mode. On localhost, `?api=…` works for testing.
- **Rule 1: device first.** A result is saved on the device before any request is made. A slow or dead server never blocks or loses a game.
- **Rule 2: trust nothing.** `http.js` cleans and type-checks every response. `storage.js` does the same for anything read from the device.
- **Rule 3: no gameplay code changes** when a service is swapped. Verified by playing a daily through the real UI against a fake API.

## Client contracts

Defined as JSDoc types at the top of `js/services/index.js`. Any adapter must match these.

| Service | Methods | Local adapter | Notes |
| --- | --- | --- | --- |
| `player` | `id`, `name`, `sessionId`, `setName(v)` | `player.js` (`site.player.v1`) | Anonymous. Site-level key, shared by every game on the domain. |
| `daily` | `today()` sync, `refresh()`, `myResult(date)`, `begin(def)`, `submit(def, attempt, result)` | `local.js` | `today()` never waits; it returns the built-in schedule until a server answers. |
| `leaderboard` | `fetch(board, { limit, around })` | `local.js` (your score + simulated rivals) | Read-only. Writes go through `daily.submit`. |
| `analytics` | `track(name, data)` | buffered, sent nowhere | Stamped with game, session and build. No personal data in payloads. |
| `flags` | `on(name)`, `get(name, fallback)`, `refresh()` | defaults + `?flags=ads,-share` | Current flags: `ads`, `leaderboard`, `share`. |
| `ads` | `isAvailable(placement?)`, `show(placement, opts)`, `hide(placement)` | no-op (no provider) | Placements `results`, `between_games`, `menu`. Client-side only; see [ADS.md](ADS.md). |

Local progress (best score, unlocks, settings) stays in `storage.js` and is not a service. If progress ever syncs across devices, add a `progress` service; don't route it through these.

## HTTP API (v1)

Base URL is `GAME.api`. All paths are namespaced by game so the same backend can serve other games: `/games/{game}/…` with `game = heatcheck`.

Every request carries:

- `X-Player-Id`: the anonymous player id (a random UUID made on first visit)
- `X-Client-Build`: the build id from `build.py`
- No cookies (`credentials: omit`)

### `GET /games/{game}/daily`

Today's challenge. The server owns the date, so the device clock no longer matters.

```json
{ "date": "2026-12-01", "number": 99, "seed": 777, "rules": 2,
  "mapId": "rooftop", "modifierId": "giant_ball", "nextAt": "2026-12-02T00:00:00Z" }
```

- `mapId` / `modifierId` must be ids the client build knows. `modifierId` may be `null` (a Classic day) or two ids joined by a dot for a combined pair (`"double_heat.money_rack"`), which the client accepts only if that pair is allowed (`getModifier` in `js/content/modifiers.js`).
- Once a server sends the daily, it owns the schedule; `js/content/dailies.js` is only the offline fallback.
- `rules` must equal the client's `GAME.rules`. On a mismatch the client ignores the response and falls back to its built-in schedule, so bump both together and expect old clients to play unranked until they reload.
- `nextAt` tells the client when to stop using this response.

### `POST /games/{game}/daily/{date}/attempts`

Called when a daily run starts.

```json
// request
{ "playerId": "…" }
// response
{ "official": true, "attempt": 1, "token": "opaque-string" }
```

- `official` is true for the player's first attempt of the day only. This is where quit-and-retry is stopped: the second call returns `official: false`.
- `token` is single-use and ties the later result to this attempt (and its start time).
- If this call fails, the client plays the run as practice and says so.

### `POST /games/{game}/daily/{date}/results`

Called when an official run ends.

```json
// request
{ "playerId": "…", "name": "WobblySandal88", "token": "opaque-string",
  "run": { …the run record… } }
// response
{ "accepted": true, "score": 23, "rank": 3, "total": 4821 }
```

`run` is the run record: 25 release positions with times, plus the seed, modifier, rules fingerprint and the client's claimed totals. Its format, and exactly how the server should check it, are in [DAILY_VALIDATION.md](DAILY_VALIDATION.md).

**The server must not trust the claimed score.** It replays the release positions with its own seed and modifier (`verifyRun` in `js/engine/rules.js`, which the server can run unchanged) and stores the recomputed score.

`name` is display text chosen by the player. Moderate it server-side; the client only strips markup and caps it at 16 characters.

### `GET /games/{game}/leaderboards/{board}?limit=10&around=2`

`board` is a string key. The only one today is `daily:{date}`. Friends or all-time boards later are just new keys.

```json
{ "top":    [ { "rank": 1, "name": "RealRival", "score": 30, "perfects": 19 }, … ],
  "around": [ … rows near the player, empty if they are in `top` or unranked … ],
  "you":    { "rank": 3, "name": "WobblySandal88", "score": 23, "perfects": 13 },
  "total":  4821 }
```

The player is identified by the `X-Player-Id` header. `you` is `null` if they have no official result.

### `GET /games/{game}/config`

```json
{ "flags": { "ads": false, "leaderboard": true, "share": true } }
```

Unknown flag names are kept by the client, so a new flag can exist before the client release that reads it. Do not use this for anything that affects scoring; scoring changes go through `rules`.

### `POST /events`

Analytics, batched and best-effort (sent with `sendBeacon`, including on page hide). Never required for gameplay.

```json
{ "game": "heatcheck", "playerId": "…", "sessionId": "…",
  "events": [ { "name": "game_end", "t": 1794885173022, "data": { "score": 23, "mode": "daily", "build": "9cf1e20b24" } } ] }
```

The events and their fields are defined in [ANALYTICS.md](ANALYTICS.md).

## Anti-cheat summary

| Cheat | Stopped by |
| --- | --- |
| Editing the score before sending | Server recomputes from the shot log |
| Quitting a bad daily and retrying | One official attempt token per player per day |
| Changing the device clock | Server owns the date and the seed |
| Pausing to inspect the meter | Client restarts the sweep on resume |
| Replaying someone else's result | Token is bound to player and attempt |
| A bot sending perfect release positions | Not stopped by this design. Needs rate limits and plausibility checks; accept that a determined cheater can still post a 30 |
| Running the game in slow motion | Compare token start time with submit time |

## Not designed yet

- Accounts or cross-device identity (the id is per browser; clearing storage makes a new player).
- Retrying a result that failed to send (`submit` returns `pending: true` and stops there).
- Syncing a name change to results already on a leaderboard.
- An ad-network adapter, and the consent flow ads and analytics will need.
