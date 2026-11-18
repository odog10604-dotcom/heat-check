# HEAT CHECK! — analytics events

A small, provider-agnostic event layer with **Google Analytics 4** as its provider. Events are shaped by a closed catalogue, optionally printed, and handed to a sink. When the deployed page carries a GA4 measurement ID, the sink forwards a mapped subset to GA4; without an ID, nothing is sent anywhere.

- Code: `js/services/analytics.js` (catalogue, shaping, run summary), `js/services/telemetry.js` (the sink seam), `js/services/ga4.js` (the GA4 adapter: the only file that knows about Google), `js/services/index.js` (wires the sink).
- Call site: `services.analytics.track(name, data)` from `main.js`. The engine never tracks anything.

## Google Analytics 4

### Turning it on (Vercel)

1. In Google Analytics, create a GA4 property with a **Web** data stream for `https://www.gameheatcheck.com`. Copy its measurement ID (`G-XXXXXXXXXX`).
2. In Vercel: **Project → Settings → Environment Variables**, add `GA4_MEASUREMENT_ID` = `G-XXXXXXXXXX` for **Production** (add Preview too only if preview deploys should count).
3. **Redeploy** (Deployments → ⋯ → Redeploy, or push a commit). The ID is read at build time, so changing the variable does nothing until the next build.

How it flows: Vercel runs `python3 build.py`, which reads `GA4_MEASUREMENT_ID` (or `"ga4"` in `site.json` if the variable is unset) and writes `<meta name="hc-ga4" content="G-…">` into `dist/index.html` only. `services/index.js` reads that tag and starts `ga4.js`. A malformed ID fails the build with a clear message, so the live site keeps the previous deploy. No ID means analytics off. The source `index.html` never gets the tag, so local development never sends anything.

To switch it off: delete the variable (and leave `"ga4"` empty) and redeploy.

### What GA4 gets

- **Automatically from GA4:** `page_view` (on load), `session_start`, `first_visit`, `user_engagement`, device category, browser, country, traffic source/medium/campaign (from the referrer and `utm_*` parameters), and the standard user, retention and cohort reports. The game does not build its own sessions or user ids.
- **From the game:** the events in the table below marked **GA4**, translated in `GA_EVENTS` (`ga4.js`) to snake_case parameters. Every one also carries `app_build`. Catalogue events not in `GA_EVENTS` (for example `game_loaded`, `daily_official`, `ad_shown`) are not sent to GA4.

Common parameters on the game events: `mode` (`quick_play` / `daily`), `run_type` (`quick` / `official` / `practice` / `warmup`), `character`, `map`, `modifier` (`classic` when none), `daily_date` (daily and warm-up only).

To see custom parameters in standard reports, register them in GA4 (**Admin → Custom definitions**) as event-scoped dimensions (`mode`, `run_type`, `character`, `map`, `modifier`, `daily_date`, `method`, `previous_run_type`) and metrics (`score`, `makes`, `heat_level_reached`, `duration_seconds`, `milestone`). They are recorded either way; registering only makes them reportable. It is not retroactive.

Recommended GA4 settings: **Admin → Data streams → Enhanced measurement**: turn off *Page changes based on browser history events* (the back-button guard uses `history.pushState`; it does not change the URL, but this keeps page views to real loads), and *Site search*, *Form interactions*, *Video engagement* (none apply).

### Privacy boundaries

- Sent: short ids (character, map, modifier, mode), integers (scores, counts, seconds), dates, booleans as `"true"`/`"false"`. Nothing typed by the player, no player name, no player id, no localStorage contents, no clipboard or share text, no shot-by-shot timing (the per-shot `shots` code and timing arrays stay out of GA4).
- The page address GA4 sees is origin + path + `utm_*` parameters only (`cleanLocation`): debug switches and every other query parameter are stripped. Cross-site referrers are already trimmed to their origin by the browser's default referrer policy (`strict-origin-when-cross-origin`, also sent as a header).
- `app_error` sends only *where* an error happened, never its message.
- Consent defaults: `ad_storage`, `ad_user_data` and `ad_personalization` are **denied**; Google signals and ad personalisation are off. `analytics_storage` is granted, so GA4 sets its usual first-party `_ga` cookies; nothing else is added.
- **Still open:** EU/UK visitors need consent before analytics cookies. There is no consent banner yet (it would be new UI). Until there is one, either accept that risk for the soft launch or limit GA4 to regions that don't require it (GA4 Admin → Data collection → regional settings).

### If GA4 is unavailable

`gtag.js` is injected after the page's `load` event, so it never delays first paint or game start. Events queue in `window.dataLayer` until it arrives. If it is blocked (ad blocker, network), the queue just sits there. Every call is wrapped so a failure is swallowed, and a sink that throws is skipped. Tested: games complete normally with `gtag.js` blocked, with `gtag` throwing on every call, and with no ID at all.

### Testing

- **Locally, no Google:** add `?analytics` to the URL. Each catalogue event prints as `[analytics] …` with a warning for any dropped field, and `services.analytics.recent()` returns the last 100.
- **Locally, through GA4:** on localhost only, `?ga4=G-XXXXXXXXXX&analytics` starts GA4 with that ID. GA4-bound events also print as `[ga4] …`, `debug_mode` is on, so they appear in GA4 **Admin → DebugView**. Use a test property, not production. `window.dataLayer` shows exactly what was handed to Google.
- **Built site:** `GA4_MEASUREMENT_ID=G-XXXXXXXXXX python3 build.py`, then serve `dist/`; `dist/index.html` should contain `<meta name="hc-ga4">`.
- **Production:** after the redeploy, view source on the live page and look for `<meta name="hc-ga4" content="G-…">`. Open the game in a browser without an ad blocker, play one game, then check GA4 **Reports → Realtime** (events appear within a minute or so) or **DebugView** with `?analytics` added (which turns on `debug_mode`). In devtools, Network: requests to `google-analytics.com/g/collect` carry `en=game_completed` etc. Standard reports take 24–48 hours to fill.

## See events while developing

Add `?analytics` to the URL, or run `localStorage.setItem('hc.analytics', '1')` once. Each event prints to the console, with a warning for any field that was dropped. `services.analytics.recent()` returns the last 100.

## Design rules

1. **Start from a question, not a click.** An event exists because it answers something about the game's design. Selecting a character is not an event; *playing a game with* that character is.
2. **Few, dense events.** A full session is about a dozen events. There are no per-shot events: `game_completed` carries all 25 outcomes and their timing in about 400 bytes.
3. **A closed catalogue.** Only events in `EVENTS` exist. Only their declared fields get through, each forced to a declared type (`id`, `int`, `bool`, `ints`, `code`). There is no free-text type.
4. **No personal information.** No names, no player-typed text, no precise location, no device fingerprinting. The catalogue makes this structural: an undeclared field such as `email` is dropped before the event leaves `track()`.

## Events

Every event also carries: `game`, `build`, `session` (random per page load, never stored), `seq` (order within the visit) and `at` (seconds since load). These stay in the catalogue; GA4 gets `app_build` only and uses its own session and user handling.

`game_started`, `game_completed` and `game_abandoned` also carry `date` (daily and warm-up) and `warmup` (true for a warm-up game).

Sent to GA4: `game_started`, `game_completed`, `game_abandoned`, `daily_viewed`, `daily_started`, `daily_completed`, `daily_abandoned`, `daily_full_court_made`, `daily_warmup_started`, `daily_warmup_to_official`, `replay_clicked`, `share_clicked`, `character_selected`, `dark_horse_progress`, `dark_horse_unlocked`, `new_high_score`, `leaderboard_viewed`, and `error` (as `app_error`). GA4's `game_completed` gets the totals (`score`, `makes`, `perfects`, `money_balls`, `heat_level_reached`, `best_streak`, `shots` = shots taken, `duration_seconds`, `game_number`, `replay_number` = games before this one in the visit), not the run summary.

| Event | When | Fields | Answers |
| --- | --- | --- | --- |
| `game_loaded` | Page ready | `w`, `h`, `dpr`, `touch`, `returning`, `games`, `loadMs`, `reducedMotion`, `muted`, `standalone` | Who arrives, on what, how fast it loads, how many come back |
| `game_started` | A game begins | `mode` (`quick`/`daily`), `practice`, `character`, `map`, `modifier`, `daily`, `nth`, `via` (`setup`/`again`/`warmup`) | What people choose; games per visit; how often "Play again" is used |
| `game_completed` | 25th shot lands | The fields above, plus `score`, `makes`, `perfects`, `money`, `maxHeat`, `streak`, and the run summary below | Difficulty, timing habits, Heat, problem spots |
| `game_abandoned` | Quit from pause, or page closed mid-game | `mode`, `practice`, `character`, `map`, `modifier`, `daily`, `nth`, `shot`, `score`, `shots`, `how` (`quit`/`left`) | Where people give up |
| `daily_official` | Official daily result recorded | `daily`, `modifier`, `score`, `attempt`, `accepted`, `pending`, `rank`, `total` | Daily participation; which modifiers score high or low |
| `leaderboard_viewed` | Leaderboard opened | `daily`, `played` | Interest in the board, before or after playing |
| `share_clicked` | Share card opened, text copied, or image shared | `mode`, `daily` (daily only), `score`, `how` (`open`/`copy`/`image`) | Share rate, and which scores get shared |
| `daily_viewed` | Daily setup screen opened | `daily`, `date`, `modifier`, `played` | How many look at the Daily vs. play it |
| `daily_started` | The **official** daily run begins (practice re-runs are `game_started` with `practice: true`) | `daily`, `date`, `character`, `map`, `format` | Daily participation |
| `daily_completed` | The official Daily Distance run finishes | `daily`, `date`, `score`, `makes`, `character`, `map`, `durS`, `format`, `stage`, `distance`, `survived`, `completed`, `perfects` | How far players get. GA4 params `daily_stage_reached`, `daily_distance_reached`, `daily_shots_survived`, `daily_full_court_made` |
| `daily_abandoned` | The official Daily Distance run was quit or the page left mid-run | `daily`, `date`, `stage`, `distance`, `survived`, `how` | Where official runs are given up |
| `daily_full_court_made` | A Daily Distance run beat the final full-court stage (official, practice or warm-up; `official` says which) | `daily`, `date`, `character`, `perfects`, `durS`, `official` | Checks the top of the difficulty curve: should be very rare |
| `daily_warmup_started` | A warm-up game starts (WARM UP or WARM UP AGAIN) | `date`, `character`, `map` | Warm-up uptake |
| `daily_warmup_to_official` | The official daily starts after at least one warm-up **in the same visit** | `date`, `character`, `warmups` | Does the warm-up convert into an official run? |
| `replay_clicked` | Play again / Run it back / Warm up again on the results screen | `mode`, `practice`, `warmup`, `score` (of the game just played) | Replay rate, and whether bad or good games get replayed |
| `character_selected` | A different (unlocked) hooper tapped on setup | `character`, `mode` | Picking vs. playing: compare with `game_started.character` |
| `dark_horse_progress` | Best single-game makes first crosses 5 / 10 / 15 / 20 while the Dark Horse is locked | `milestone`, `unlocked` (true at 20), `games` | How far players get toward the unlock, and how fast |
| `dark_horse_unlocked` | The unlock itself | `games`, `makes` | Same as `character_unlocked`, named for the GA4 reports |
| `new_high_score` | Quick Play best beaten (not the first game) | `score`, `previous`, `games` | How fast players improve |
| `character_unlocked` | The 20-make unlock | `character`, `games` | Whether the unlock bar is too low or too high |
| `ad_shown` | An ad actually appeared (never fires today: there is no ad provider) | `placement`, `kind` (`banner`/`interstitial`), `w`, `h` | Whether ads shorten visits, compared with `nth` and `game_abandoned` |
| `error` | A caught error | `where`, `message` | What breaks in the field |

### The run summary (`game_completed`)

Built by `summarizeRun()` from the run record, by replaying it through the game's own rules, so it reports exactly what the game judged.

| Field | Example | Meaning |
| --- | --- | --- |
| `shots` | `ggppPppgpGgommMpgppPmpggP` | One letter per shot: `p` perfect, `g` good, `o` rattle-in, `m` miss. A capital is a money ball. |
| `rack` | `[6,6,2,6,5]` | Points at each of the five spots |
| `bias` | `[9,9,62,6,13]` | Per spot: average release error in thousandths of the meter. Negative is early, positive is late. |
| `spread` | `[9,9,62,6,13]` | Per spot: average size of the error, ignoring direction (consistency) |
| `atHeat` | `[9,5,3,8]` | Shots taken at each Heat level: Normal, Heating Up, Hot, On Fire |
| `madeAtHeat` | `[7,5,3,6]` | Makes at each Heat level |
| `fireAt` | `6` | Shot number that first reached On Fire; `0` if never |
| `late` | `1` | Shots that ran off the end of the meter unreleased (left out of `bias` and `spread`) |
| `durS`, `pauses` | `56`, `0` | Length of the game in seconds; pause count |

What these are for:

- **`bias` by spot** shows whether a spot's zone is mistuned or players systematically jump early or late there. A consistent `+60` at the top of the key means that zone sits too early.
- **`spread`** separates "this spot is hard to read" from "this spot is placed wrong".
- **`atHeat` versus `madeAtHeat`** shows whether Heat actually helps, and how long players stay hot.
- **`fireAt`** and `maxHeat` show how rare On Fire is, the main tension knob since a miss resets Heat.
- **`shots`** allows any question not anticipated here: streak lengths, money-ball conversion, first-shot nerves, late-game fatigue.

## Deliberately not tracked

| Suggested event | Why not |
| --- | --- |
| `shot_taken`, `shot_result`, `perfect_shot`, `money_ball_made` | 50+ events per game. All of it is in `game_completed.shots`, and in `game_abandoned.shots` for unfinished games. |
| `heat_level_reached` | `fireAt`, `maxHeat` and `atHeat` cover it. |
| `rack_completed` | `rack` gives every spot's score in one field. |
| `map_selected` | What was actually played is on `game_started.map`. (`character_selected` was added for the GA4 funnel.) |
| `modifier_selected` | Players never choose a modifier: the Daily sets it. It is on every game event as `modifier`. |
| `session_started`, custom `page_view` | GA4 sends `session_start` and `page_view` itself. |
| `quick_play_started` | `game_started` with `mode`. (`daily_started` / `daily_completed` exist for the official run only.) |
| Pause, mute, menu buttons | No design decision depends on them. `pauses` and `muted` are already carried as fields. |

## Sinks

`js/services/index.js` builds the sink list: GA4 (when the page has an ID) and, in PUBLIC MODE, the built-in HTTP sink that batches events to `POST /events` (see `API.md`). Each event goes to every sink; one that throws is skipped. Another provider is one more adapter like `ga4.js` added to that list. The game code does not change either way. The player's anonymous id is deliberately *not* in event payloads, and GA4 never gets it.

## Adding an event

1. Write down the question it answers. If you can't, don't add it.
2. Add it to `EVENTS` with its fields and types.
3. Call `track()` at the moment it happens, in `main.js`.
4. Load with `?analytics` and check the console for dropped-field warnings.
5. Add it to the table above.
6. To send it to GA4, add a line to `GA_EVENTS` in `ga4.js` (GA4 names: ≤ 40 characters, snake_case; ≤ 25 parameters, short values).

## Daily Distance (Nov 2026)

The Daily is now Daily Distance (`js/content/distance.js`). How far a run got is three numbers carried on its end event, never one event per stage:
`stage` (the stage the run ended on, 1-based: the missed one, or the last if beaten), `distance` (feet of the last stage made, 0 = missed the layup) and `survived` (shots made).
`game_started` / `game_completed` / `game_abandoned` carry `format` (`contest` = Quick Play, `distance` = Daily or its warm-up). In a distance run, `game_completed.rack`, `bias` and `spread` have one entry per stage instead of per rack.
