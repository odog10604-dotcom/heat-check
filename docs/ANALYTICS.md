# HEAT CHECK! — analytics events

A small, provider-agnostic event layer. **Nothing is sent anywhere today.** Events are shaped, optionally printed, and handed to a sink that currently does nothing.

- Code: `js/services/analytics.js` (catalogue, shaping, run summary), `js/services/telemetry.js` (the sink).
- Call site: `services.analytics.track(name, data)` from `main.js`. The engine never tracks anything.

## See events while developing

Add `?analytics` to the URL, or run `localStorage.setItem('hc.analytics', '1')` once. Each event prints to the console, with a warning for any field that was dropped. `services.analytics.recent()` returns the last 100.

## Design rules

1. **Start from a question, not a click.** An event exists because it answers something about the game's design. Selecting a character is not an event; *playing a game with* that character is.
2. **Few, dense events.** A full session is about a dozen events. There are no per-shot events: `game_completed` carries all 25 outcomes and their timing in about 400 bytes.
3. **A closed catalogue.** Only events in `EVENTS` exist. Only their declared fields get through, each forced to a declared type (`id`, `int`, `bool`, `ints`, `code`). There is no free-text type.
4. **No personal information.** No names, no player-typed text, no precise location, no device fingerprinting. The catalogue makes this structural: an undeclared field such as `email` is dropped before the event leaves `track()`.

## Events

Every event also carries: `game`, `build`, `session` (random per page load, never stored), `seq` (order within the visit) and `at` (seconds since load).

| Event | When | Fields | Answers |
| --- | --- | --- | --- |
| `game_loaded` | Page ready | `w`, `h`, `dpr`, `touch`, `returning`, `games`, `loadMs`, `reducedMotion`, `muted`, `standalone` | Who arrives, on what, how fast it loads, how many come back |
| `game_started` | A game begins | `mode` (`quick`/`daily`), `practice`, `character`, `map`, `modifier`, `daily`, `nth`, `via` (`setup`/`again`/`warmup`) | What people choose; games per visit; how often "Play again" is used |
| `game_completed` | 25th shot lands | The fields above, plus `score`, `makes`, `perfects`, `money`, `maxHeat`, `streak`, and the run summary below | Difficulty, timing habits, Heat, problem spots |
| `game_abandoned` | Quit from pause, or page closed mid-game | `mode`, `practice`, `character`, `map`, `modifier`, `daily`, `nth`, `shot`, `score`, `shots`, `how` (`quit`/`left`) | Where people give up |
| `daily_official` | Official daily result recorded | `daily`, `modifier`, `score`, `attempt`, `accepted`, `pending`, `rank`, `total` | Daily participation; which modifiers score high or low |
| `leaderboard_viewed` | Leaderboard opened | `daily`, `played` | Interest in the board, before or after playing |
| `share_clicked` | Share card opened, text copied, or image shared | `mode`, `daily` (daily only), `score`, `how` (`open`/`copy`/`image`) | Share rate, and which scores get shared |
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
| `character_selected`, `map_selected` | Browsing clicks are noise. What was actually played is on `game_started`. |
| `daily_started`, `quick_play_started`, `daily_completed` | These are `game_started` / `game_completed` with `mode`. One event with a property is easier to query than three names. |
| Pause, mute, menu buttons | No design decision depends on them. `pauses` and `muted` are already carried as fields. |

## Connecting a provider later

One line in `js/services/index.js` decides where events go:

```js
setSink(http ? http.sink : () => {});
```

Replace it with a function that forwards to a provider, for example `setSink((name, data) => provider.track(name, data))`. In PUBLIC MODE the built-in HTTP sink batches events to `POST /events` (see `API.md`). The game code does not change either way.

Before turning anything on: decide the consent approach for your audience and region, and confirm the provider is not adding its own identifiers or collecting IP-derived location beyond what you intend. The player's anonymous id is deliberately *not* in event payloads; the HTTP sink attaches it at the batch level, and a provider integration should make that choice explicitly.

## Adding an event

1. Write down the question it answers. If you can't, don't add it.
2. Add it to `EVENTS` with its fields and types.
3. Call `track()` at the moment it happens, in `main.js`.
4. Load with `?analytics` and check the console for dropped-field warnings.
5. Add it to the table above.
