# HEAT CHECK! — project context

A fast, goofy browser basketball game modelled on a Three-Point Contest. 5 racks × 5 balls = 25 shots, one input (timing), max 30 points. This file is the working context for anyone (human or AI) picking the project up. `README.md` has the short run instructions.

## Run

No build step, no dependencies, no Node. Serve the folder with the bundled no-cache server (plain `python3 -m http.server` lets browsers mix old and new files after an update, which once froze a game):

```bash
python3 serve.py
```

Open http://localhost:5173. Tap / click / Space to shoot, Esc to pause. In Claude Code the preview server is the `heat-check` entry in `.claude/launch.json`, which runs the same `serve.py`. **Deploy with `python3 build.py` and upload `dist/`** (never the source folder as-is; see Production readiness).

## Stack and why

Vanilla JS (ES modules) + Canvas 2D + WebAudio. All art is drawn in code and all sound is synthesized, so there are no image or audio assets. The owner asked about rebuilding in Unreal Engine 4 and chose to stay with the browser version (UE4 no longer targets browsers, and mobile web is a first-class requirement).

## File map

| Path | What it holds |
| --- | --- |
| `js/config.js` | All tuning as plain data: meter, Heat, timing, the five rack spots |
| `js/content/characters.js` | Roster data plus the parametric cartoon rig (front view, back view, centaur body), reactions, per-character body language (`MOTIONS`) |
| `js/content/maps.js` | The three maps; each is `{ id, name, draw(ctx, L, env) }` |
| `js/content/modifiers.js` | The modifier library (data + isolated hooks), `CLASSIC`, `checkLibrary` |
| `js/content/dailies.js` | Daily rotation: pinned days, weighted pick by rarity, occasional pairs |
| `js/engine/modifiers.js`, `js/engine/modrun.js` | What a modifier is and how two combine; the runtime that feeds hooks events and an effects toolbox |
| `js/engine/rules.js` | **The scoring rules, pure.** Judging a release, Heat and score, the run record, and `verifyRun` (what a server runs). No DOM, audio or clock |
| `js/engine/game.js` | `Contest`: phases, animation, shot paths, poses. Plays through `rules.js` |
| `js/engine/render.js` | Layout, hoop, court-line projection, ball, meter, effects |
| `js/engine/audio.js` | Synthesized SFX, per-character sound kits (`VOICES`), and Heat-reactive step-sequencer music (through a low-pass filter that opens with Heat) |
| `js/engine/draw.js` | Small canvas helpers and shared constants |
| `js/services/index.js` | **The service boundary.** Builds `services` (player, daily, leaderboard, analytics, flags, ads) from local or HTTP adapters. Contract types are in its header |
| `js/services/local.js` | LOCAL MODE adapters: built-in daily schedule, device leaderboard with simulated rivals, flags |
| `js/services/ads.js` | The ad service: placements, pacing rules, reserved boxes, and a placeholder provider (`?ads=demo`). No provider is installed, so it is a no-op |
| `js/services/http.js` | PUBLIC MODE adapters for the API in `docs/API.md`. Device first, then network; cleans every response |
| `js/services/player.js` | Anonymous identity under the site-level key `site.player.v1` (shared by future games on the domain) |
| `js/services/storage.js`, `share.js` | This game's local progress; the share card |
| `docs/API.md`, `docs/DAILY_VALIDATION.md`, `docs/ANALYTICS.md`, `docs/ADS.md` | The future backend contract; how a server validates a daily run; the event catalogue; ad placements and rules |
| `js/main.js`, `index.html`, `css/style.css` | Screens, HUD, results, modals, input, main loop |
| `js/services/analytics.js` | The event catalogue (`EVENTS`), field shaping, the run summary, and the `?analytics` debug console |
| `js/services/telemetry.js` | The sink the events go to (`setSink`), plus `reportError()`. Sends nothing yet |
| `js/boot.js` | Plain script: shows a readable message if the game hasn't started after 6 s |
| `site.json` | **The one place for site details:** public address (`url`, empty until there is a domain), name, description, colours, `offline` switch |
| `build.py` | Builds `dist/`: all code under `v-<build>/`, `index.html` pointing at it, and from `site.json` the `<head>` block, manifest, `sw.js`, `robots.txt`, `sitemap.xml`, `404.html`, `_headers` |
| `site/`, `manifest.webmanifest` | Icons and the link-preview image (placeholders); the web app manifest (written by `build.py`) |
| `tools/make_site_images.py` | Redraws the placeholder icons and share image. The only thing that needs Pillow |
| `serve.py` | Local dev server: static files with `Cache-Control: no-store` |
| `.claude/launch.json` | Preview-server config for Claude Code (runs `serve.py` on port 5173) |

Adding a character, map, modifier or rack spot is one data entry in the matching file.

**Hook code in `modifiers.js` is often one line per hook: never put a `//` comment mid-line there.** It once commented out the rest of a hook and the whole game failed to load. Use `/* */` or put the comment on its own line.

## Current design (settled by the owner — do not undo without asking)

### Shooting
- **One sweep per shot.** The marker crosses the bar once in `meter.sweep` seconds; tap to release. No release = "too slow" miss.
- **Current meter tuning** (`meter` in `js/config.js`, tightened Nov 2026 with `GAME.rules` bumped to 2): sweep 0.82 s, zone half-widths make 0.0765 / good 0.0405 / perfect 0.009.
- **The zone is a chance spectrum, not pass/fail.** Inside the thin `perfect` sliver always scores. From there the make chance slides from `chance.near` (96%) to `chance.edge` (20%) at the zone's outer edge. Outside the zone always misses.
- **The meter must never reveal the result.** After release the marker and label are coloured by *odds only* (gold = perfect, white = a gamble, red = outside the zone). The outcome is only shown when the ball reaches the rim. The zone's red→green gradient is fine because it shows odds.
- **The zone moves.** It slides side to side during the sweep (`meter.drift`), starting from a different phase each shot, and its centre differs per spot (`spot.target`). Deterministic, not random.
- **Perfect must be the smallest band on screen.**
- The owner wants the game **hard**; "the appeal is better if it's harder." Bias tuning toward difficulty.

### Heat
- Normal → Heating Up → Hot → On Fire. Perfect = +2 points of heat, good = +1, rattle-in = 0; 3 points per level.
- Heat widens the zone (better odds for the same timing). It never guarantees a make.
- **Any miss resets Heat to zero** (`heat.missDrop: 4`). The Safety Net daily modifier softens this to one level.

### Heat presentation (a defining feature — escalate, never change the rules)
Each tier adds to the one before. On Fire is not a separate mode; the shot is identical.

| Layer | Heating Up | Hot | On Fire |
| --- | --- | --- | --- |
| Ball | warm halo, short yellow trail, sparks while held | hotter halo, orange trail, sparks in flight | flames, long red trail |
| Make | rim shockwave ring | bigger rings, more stars, "SIZZLING!"-type calls on perfects | fire burst, "ON FIRE!"/"NUCLEAR!"-type calls, orange flash on perfects |
| Camera | small punch-in toward the hoop on makes | bigger punch-in | biggest punch-in; flash + ring + kick on catching fire |
| Screen | faint warm edges | warm edges, embers rising | pulsing edges, heavy embers |
| Crowd | livelier | flame signs, phone flashes, gym scoreboard glows | signs everywhere, beach sun goes red, rooftop windows party |
| Music | low-pass filter opens a little | crash cymbals, filter wider | filter wide open, sub bass, lead hook, crowd "HEY!" |
| Character | bigger celebration | bigger still | personal signature move + catchphrase (`fireEmote`, `fireLine`) |

- Streak label ("5 STRAIGHT") appears above the shooter from Heating Up once the streak is 3+.
- On the shot that ignites, the ON FIRE banner replaces the normal shot call, and the character's `fireLine` pops above them.
- Missing from Hot/On Fire: fizzle sound, cold blue flash, steam, "FIRE'S OUT" (from On Fire), and the music filter slams shut.
- **The meter is sacred:** it is drawn outside the camera, so shake, punch-in and screen effects never move it, and it has no jitter at any tier.
- Particles are capped (`MAX_PARTICLES` = 320 in `game.js`) for phones.

On Fire signatures: White Knight raises both fists in a war cry ("FOR THE REALM!"), Tech Guy scribbles equations in the air with maths symbols pouring off his head ("THE MATH CHECKS OUT!"), Himmy floats off the ground with a halo, eyes glowing shut ("ONE WITH THE FLOW."), the Dark Horse rears and paws the air ("*SNORT*").

### Court and camera
- **Rack order (fixed):** 1 Left Corner → 2 Left Wing → 3 Top of the Key → 4 Right Wing → 5 Right Corner.
- **Every spot is a behind-the-shooter view.** The shooter is drawn from the back, larger and low on screen; the hoop is small, far, and **never moves** — it stays at screen centre for the whole game, including during transitions. The court turns around it.
- **Court lines are a real half court projected per spot** (`drawCourt` in `render.js`): painted key, free-throw circle, baseline, short sidelines, three-point line. The camera is fitted so the shooter and hoop land exactly where the scene draws them. Do not go back to hand-faked lane shapes.
- **The key is painted solid** (red, semi-opaque) because its projected shape is the clearest "where am I" cue: sideways in the corners, diagonal on the wings, running toward the camera at the top. Lines are thick and bright; the three-point line has a soft shadow so it reads on every map.
- The shooter must always stand **behind** the three-point line and visibly far from the hoop.

How each spot is told apart (values live in `spots` in `js/config.js`; shared depth is `BEHIND`):

| Spot | `angle` | `side` (backboard) | `shooter` (framing) | `cam` | `target` |
| --- | --- | --- | --- | --- | --- |
| Left Corner | -88 | -1 (edge-on) | -0.46 | -1 | 0.66 |
| Left Wing | -45 | -0.7 | -0.36 | -0.5 | 0.70 |
| Top of the Key | 0 | 0 (square-on) | -0.28 | 0 | 0.74 |
| Right Wing | 45 | 0.7 | 0.36 | 0.5 | 0.70 |
| Right Corner | 88 | 1 (edge-on) | 0.46 | 1 | 0.66 |

- `angle` drives the court projection; `side` should stay close to sin(angle) so the backboard agrees with the lines.
- **Framing:** the shooter stands wider out in the corners and closest in at the top. Don't bring the top-of-key shooter nearer than about -0.28, or their body covers the backboard on phones.
- **Body turn:** from behind, the upper body twists slightly toward the hoop (more in the corners); the ball follows the twist so it stays in the hands.
- **Background pan** (`PAN` = 140 in `render.js`) moves the way a camera orbiting the hoop would: walking left corner → right corner slides the background to the right. It was backwards once and made the hoop look like it was moving.
- **Wide screens:** the background is raised by `lift` (up to 70 world units, from the aspect ratio) in the behind view so the floor has room to show depth.
- Shared depth (`BEHIND`): hoop drawn at 0.58 scale and 24 units up the floor, shooter at 1.3 scale; how low the shooter stands (`sy`) is fitted to the screen unless a spot sets it.

### Pacing between racks
- Sequence: **shot → ball result → reaction → move → plant → catch → shoot**. It should feel like one continuous contest, never a pause or a screen change.
- After the money ball the reaction holds 0.12 s longer than a normal settle, then the move starts.
- The move (`timing.move`, 0.85 s) is split by `MOVE_JOG` in `game.js`:
  - **0–12%: reaction finishes** (celebration or sulk continues, facing the camera).
  - **12–76%: jog.** The character runs side-on toward the next spot while the court swings round, the background pans and the camera eases back about 3.5% (`drawScene`). The old rack has already rolled off; the last shot's ball fades out in the first 0.2 s so it doesn't bounce on a rotating floor.
  - **76–100%: plant.** Back to the camera, a small knee dip with hands up ready (the anticipation beat) while the new rack rolls in. Then the normal catch.
- **Every change of facing is a cartoon squash-turn:** the body narrows to 38% width at the switch, so front → side → back never pops. Don't let any pose change facing at full width.
- The court/camera blend finishes at about 82% of the move, so the next spot is fully settled and readable before the catch.
- **Next-rack banner** (spot name + "RACK n" / "LAST RACK") waits 0.12 s so it doesn't land on the shot calls. If a Heat banner (e.g. ON FIRE) is showing, the rack banner queues behind it (`bannerNext`) instead of cutting it off.
- From top of the key to the right wing the jogger crosses in front of the hoop for a moment; that's accepted.
- After every shot the character turns to face the camera to react, then turns back to shoot.
- A full game takes about 53 seconds.

### Characters
- **Four characters** (roster replaced Nov 2026; Gary, Blaze, Earl, Deb and Doris are retired), identical gameplay. Three are open: **White Knight** (serious / heroic / ridiculous), **Tech Guy** (analytical / awkward / obsessive), **Himmy** (chill / philosophical surfer). Old saved ids fall back to the first character (`openSetup` in `main.js`).
- **White Knight:** blonde, grey plate armour far too big to shoot in (helmet with raised visor and a huge red plume, shoulder/elbow/knee plates, steel faulds), white tabard with a basketball crest, white cape from behind. Stern by default, proud on makes, operatic on perfects, solemn on misses.
- **Tech Guy:** skinny, tall oval head, messy brown hair with a cowlick, gaming headset with mic, short-sleeve button-up with pocket protector, khakis, and a full backpack worn to the contest (his back view). Maths symbols rise off his head while he concentrates (`glyphs`).
- **Himmy:** surfer build, long sun-bleached windswept hair that moves with wind, lean and jumps (and hangs past his shoulders from behind), stubble, open Hawaiian shirt over a tank top, shell necklace, board shorts, flip-flops. Never angry, never bouncy (`calm`: floats instead of bouncing at Heat, head barely shakes). The spiritual humour is his alone; don't give it to the others. Inspired by a *type* (spiritual surfer), not any film character: keep his look and lines original.
- **The Dark Horse** is the unlockable (make 20 of 25): a centaur, bare muscled torso, dark coat, long black mane, horse ears, glowing ember eyes, snorting breath. Ominous, "a total beast", no jersey. Tagline (owner's pick): "Nobody saw him coming. He prefers it that way." Shown as "???" in silhouette until unlocked.
- **Most of a game is seen from behind**, so every character needs a back view that reads on its own (plume + cape, backpack + headset, giant hair, centaur rump). Check `BACK_TOPS` and `HAIR[...].over` when adding one.
- **Personality comes from reactions and body language, never stats.** Per character in `characters.js`:
  - `reactions` (gesture per moment) and `lines`. Ten moments: `make`, `perfect`, `money`, `hot`, `fire`, `miss`, `badMiss`, `cool` (losing Heat from Hot/On Fire), `winBig` (≥ `GOOD_GAME` = 20), `winPoor` (< `POOR_GAME` = 13).
  - `faces`: how they wear the shared expressions (Knight: focus → `stern`, crazed → `valor`; Tech: focus → `calc`; Himmy: focus → `serene`, crazed → `mystic`). Applied in `drawCharacter`, so it covers game, menus and share card.
  - `motion`: a `MOTIONS` entry with `idle` (menu), `set` (grab + meter), `jog` and `plant`. Current motions: White Knight `march`, Tech Guy `calc`, Himmy `glide`, Dark Horse `prowl` (head low, glaring, heavy gallop). Called from `shooterPose` in `game.js` and the attract pose in `render.js` via `stylePose`. **During the shot it may only touch head and face**: the hands hold the ball where the game puts it.

| | make | perfect | money | hot | fire | miss | bad miss | cool | strong game | poor game |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| White Knight | salute | raises an invisible sword | kneels, fist on heart | points the charge | war cry | solemn bow | drops to one knee | sheathes the sword | arms raised in a V | hand on heart |
| Tech Guy | nods, finger up | taps temple, points at hoop | types the data in | traces the trend line | frantic air equations | stares at his hand | hands on head | twiddles dials | robot dance | "outlier" shrug |
| Himmy | peace sign | palms to the sky | shaka | surf stance | levitates, halo | lets it go | prayer hands, small bow | deep breath | double shaka | lets it go |
| Dark Horse | arms crossed, one nod | slow fist | chest beat | paws ground | rampage | stomps | rears in fury | snort, head down | rears, arms wide | turns his back |

- Priority on one shot: entering On Fire > entering Hot > money > perfect > make; losing Heat from Hot/On Fire > bad miss (airball / way long) > miss.
- **Heat escalation:** positive reactions get intensity `k` = 0.6 + 0.35 per Heat level (+0.2 perfect, -0.15 rattle-in), extra bounce per level (a float for `calm` characters), face goes hype at Hot and crazed On Fire (through `faces`). On Fire, every make/perfect becomes the character's signature fire move.
- Lines: a bad-miss line and a losing-Heat line pop above the character in game; every game shows a quote under the results title (`#res-quote`: `winBig` / `winMid` / `winPoor`). Each moment (and `fireLine`) is a short pool read through `lineOf`; in game `Contest.say(key)` starts at a random line and steps through, so no line repeats back to back. How *often* characters speak is unchanged: add lines to a pool, not new popup moments. Picks use `Math.random`, never the seeded dice.
- Gestures live in `EMOTES` and take `(p, t, k, A)`; `A` gives body anchors (`hip`, `sh`, `chest`, `head`, `top`, `tw`) so one gesture fits every build. A gesture can set `p.handShape = { r: 'point' | 'peace' | 'shaka' }`. **Shoulder height is chin height on these rigs**: keep hands at `A.chest` or forward of the face (x ≳ 50) unless the gesture is meant to touch the face (salute, temple tap). Otherwise poses read as "hand over mouth". For the same reason the Knight's near shoulder plate is only drawn from behind.
- Rig overrides per character: `outfit.sleeve / hands / legColor / knees / sandal`, `build.legW / headW / armW`, `armored`.
- Dark Horse rig settings: `eyeGlow` (glowing ember eyes), `snort` (hot breath from the nostrils), `build.centaur` + `build.horse` (horse lower body drawn by `drawHorse` instead of legs, scaled by `horse`; body colour from `coat`), `brood` (his own face: heavy brow, flat mouth, no smile or tongue, used instead of `faces`), and `rackGap` (moves the rack further out in side-on views to make room for the long horse body; behind views ignore it).
- Reactions play during the settle and the first 12% of the move, so they never add time to the game.
- **Character sounds:** `sound: { kit, step }` on the character picks a kit in `VOICES` (`audio.js`): White Knight `armor` (clanking steps, sword shhing, herald trumpet, solemn horn), Tech Guy `tech` (sneaker squeaks, keyboard, confirm beeps, error buzzer, power-down), Himmy `surf` (flip-flop slaps, waves, wind chimes, exhale), Dark Horse `beast` (hoof clops, snorts, grunts, whinny). `Contest.voice()` plays the moment that won the reaction priority, at the rim (never earlier, so sound can't reveal a result), layered quietly a beat after the shot sounds; footsteps every `step` seconds during the jog, `plant` at the plant. Missing moments fall back (money → perfect, hot → make, winBig → fire, winPoor → miss) or stay silent. All through `play()`, so a bad kit can't break the game.
- Shooting form: elbows bend outward on each side of the body, ball rises in front to a set point above the forehead, one-arm follow-through with the guide hand staying up on the other side.

### Modes and scoring
- Regular ball 1 point, money ball (last on each rack) 2. Max is always 30; modifiers must not change it.
- Daily Challenge: map + modifier + dice seed derived from the UTC date, same for everyone. First finished run is official; later runs are practice.
- **First-daily warm-up:** a player who has never finished a game and taps TIP OFF on an unplayed daily is offered WARM UP / GO OFFICIAL (`offerWarmup` / `askWarmup` in `main.js`). The warm-up is a Classic Quick Play game on today's map, flagged `warmup` (practice, HUD "WARM-UP · doesn't count"). It never calls `daily.begin`, never uses the daily seed, doesn't count toward `save.best` and can't be shared; its results offer GO OFFICIAL / WARM UP AGAIN. Analytics: `game_started.via = 'warmup'`.
- **Daily history and streak:** `services.daily.history(date, 7)` returns the last 7 days of official results and the streak (consecutive UTC days with an official result; today unplayed doesn't break it). Shown as day chips on the daily setup and daily results (`dailyStrip`), and as "🔥 n-day streak" on the Daily button from 2 days. Built only from `save.daily`, so it can't count further back than the 60 days kept.
- Quick Play: pick character and map, replay freely.

## Known placeholders

- **Leaderboard is local.** `LocalLeaderboard` stores the player's score on-device and fills the board with deterministic simulated rivals (labelled as such in the UI). Swap in an HTTP class with the same `submit` / `fetch` methods to go global.
- The one-official-run-per-day rule is client-side only.
- `url` in `site.json` is empty until there is a domain. Until then builds leave out the canonical link, `og:url`, the link-preview image and the sitemap, and the share card prints no address.
- Icons and the share image in `site/` are generated placeholders.
- No ads, accounts, or backend. Ad placements exist but stay hidden and empty (see Ads below).
- **Caching when deployed:** handled by `build.py` (versioned folders). `serve.py` only protects local development.

## Scoring rules and the run record (keep them in one place)

- **All scoring logic lives in `js/engine/rules.js`.** `Contest` calls `rules.judge` on release and `rules.applyOutcome` when the ball lands. Never put outcome logic back into `game.js`; if a change can alter any outcome, make it in `rules.js` and bump `GAME.rules`.
- Release positions are quantized to millionths (`rules.quantize`) *before* judging, so the recorded integer is exactly what was judged and a replay is exact.
- Every finished run carries a **run record** (`r.record`, about 900 bytes): seed, dice, modifier, rules fingerprint, 25 `[position, ms]` pairs, timing, and the client's claimed totals. `rules.verifyRun(record, expect)` replays it; `expect` is what a server knows and must override the record. Without `expect` it proves nothing.
- `rules.createRandom(seed, dice)` separates the zone-motion seed from the dice seed. `dice: null` is today's behaviour; a server can issue per-attempt dice later.
- **Regression check for any change near scoring:** play 400 seeded games before and after by calling `release` / `resolve` directly with fixed positions, and compare every shot's tier and Heat. The rules extraction passed this with 400/400 identical.
- There is deliberately no client-side signature or checksum on results. It would be fake security.

## Analytics (keep it small)

- Events are a **closed catalogue** in `js/services/analytics.js`. Only declared events exist and only declared, typed fields get through; there is no free-text type, so personal data can't slip in. Full list and rationale: `docs/ANALYTICS.md`.
- **Start from a design question, not a click.** No per-shot events: `game_completed` carries all 25 outcomes plus per-spot timing bias and Heat stats (`summarizeRun`, which replays the run record through `rules.js`). Don't add events for buttons.
- Track from `main.js` only, via `services.analytics.track(name, data)`. The engine never tracks.
- Debug with `?analytics` in the URL: every event prints, with a warning for dropped fields (this caught a missing field during development). `services.analytics.recent()` returns the last 100.
- Nothing is sent in LOCAL MODE. The destination is one `setSink(...)` line in `services/index.js`.

## Modifiers and Daily Challenges (the content system)

- **A modifier has two sides, kept apart.** RULES side: `tune(cfg)` and `plan(plan, cfg)`, plain data edits applied once in `rules.configFor` and replayed identically by a server. SHOW side: `on: { start, rack, shot, release, result, heat, end, frame, draw, dispose }` hooks that get events and an effects toolbox and cannot change an outcome. Field list: `js/engine/modifiers.js`. Lifecycle and toolbox: `js/engine/modrun.js`. Library and how-to-add: `js/content/modifiers.js`.
- **The shot plan** (`cfg.plan`, 25 entries: `spot, money, sweep, zone, perfect, drift, heat`) is how a modifier changes single shots: order of racks, where money balls are, per-shot speed and zone size. `Contest` and `replay` both read it through `rules.planOf / isMoney / sweepOf / windows(cfg, level, shot)`. Everything that shows money balls (rack drawing in `render.js`, held ball, HUD pips) reads the plan too; never assume the last ball of a rack is the money ball.
- **House rules are enforced in code** (`rules.checkConfig`, run by `configFor`): 25 shots, max score exactly 30, perfect the smallest band, a rack shot from one spot. On localhost every modifier and every legal pair is checked at boot (`checkLibrary`).
- `release` hooks are not told the outcome, so no modifier can reveal a result before the rim. `draw` hooks paint under the banners and the meter.
- **Combining:** `getModifier('a.b')` is two modifiers together (library order only). Not allowed if either is `solo` or their `touches` overlap. Pairs only.
- **Daily rotation:** `js/content/dailies.js`. `PINNED` days are fixed by hand; other days are a weighted pick by `rarity`, never the same twice running, about one day in eight a pair, and occasionally Classic (`modifierId: null`). Adding a modifier reshuffles unpinned future days.
- Try one with `?mod=<id>` on localhost (Quick Play, HUD shows "test").
- Refactor check: 400 seeded games identical before and after; 264 games across every modifier and pair verify by replay and an all-perfect game scores 30 in each.
- New in this pass: Slow Burn, Closing Speed, Money Rack, Reverse Run, Clutch Time, Rapid Fire, Lights Out. `GAME.rules` was not bumped for these (old modifiers' outcomes are unchanged), but `rulesHash` now includes the plan. It was bumped to **2** later for the meter tuning (see Shooting).

## Results and sharing

- **The shared result is a summary, never the shot sequence.** Five squares, one per rack, coloured cold to hot by points scored there (`RACK_SCALE` in `share.js`: ⬛ 0-1, 🟦 2, 🟨 3, 🟧 4, 🟥 5, 🔥 6). The same scale colours the ring round each rack's pips on the results screen and the discs on the image card, so players learn it by playing.
- Share text is four lines: title + score, the five squares, `⭐perfects 💰money/5 ⚡streak` + peak Heat as 🔥 (🧊 for none), then the public link (only once `url` is set in `site.json`).
- The image card (600×630, `renderShareCard`) shows the logo, the character reacting, score, result title, peak Heat, and the five racks as discs on a three-point arc around a hoop.
- **Share is offered after every game**, Quick Play included. After a daily practice run it still shares today's official result (`shareSubject()` in `main.js`).
- The results screen has a standing line (`#res-best`) revealed with the title: "NEW BEST! · WAS n", "YOUR BEST: n", "TIED YOUR BEST", "TODAY'S OFFICIAL RESULT", or "PRACTICE · OFFICIAL: n/30".
- **Release Coach** (`#res-coach`, under the stats): one tendency and one tip from `releaseProfile` in `analytics.js` (the same replay and timing error as `summarizeRun`: average error = early/late, scatter = consistency, steadiest spot). Early/late is only called when the average is clearly beyond the player's own scatter (`coachFor` in `main.js`; ~0.013 meter units ≈ 10 ms); ≥80% perfect releases always reads LOCKED IN; 3+ unreleased balls reads LET IT FLY. It never says where the perfect window is. Thresholds were calibrated by simulating players at σ 10–70 ms.
- **Unlock progress:** `save.bestMakes` (most makes in one game, any mode, migrated from saved dailies for older saves) drives the bar on the locked card ("🔒 n/20"), the blurb, and a results badge ("🔒 ??? n/20 MAKES") only when it improves.
- No social APIs, accounts or referral codes: copy text, or the browser's own share sheet for the image. Never put the simulated leaderboard rank on a share.

## Site metadata, install and offline

- **`site.json` is the single source** for the public address, name, description and colours. `build.py` writes them into the block between the `site:head` markers in `index.html` and into `manifest.webmanifest`. Never edit that block or the manifest by hand; edit `site.json` and run `python3 build.py` (it refreshes the source copies too, without an address).
- JS that needs the public address reads the page's canonical link (`siteUrl()` in `share.js`). There is no `GAME.url`.
- The page title comes from `site.json`; `main.js` no longer sets `document.title`.
- Icons, share image, manifest, `sw.js` live at **stable root paths** in `dist/` (not under `v-<build>/`), because other sites and home screens keep their addresses.
- **Offline (service worker):** exists only in `dist/`. The page registers it only when `build.py` has put `data-offline` on `<html>`, so development never has one. Page = network first, falling back to the cached copy; versioned code = cache first; everything else and all other origins untouched; old `heatcheck-*` caches are deleted on activate. `"offline": false` in `site.json` ships a `sw.js` that removes itself.
- It stays a normal web page: installing is optional and nothing depends on it.

## Ads (prepared, not installed)

- **No ad network, no third-party scripts.** `services.ads` is built by `createAds({ provider: null })`, so every call is a no-op and the layout is untouched. Full write-up: `docs/ADS.md`.
- The game asks for a **placement** by name: `ads.show('results' | 'menu' | 'between_games')`, `ads.hide(...)`, `ads.isAvailable(placement?)`. Sizes, pacing and whether anything shows live in `PLACEMENTS` in `ads.js`, never in `main.js`.
- Placements, in priority order: `results` (banner under the results card, outside it), `between_games` (full-screen break after "Play again", not before the third game, then at most every 3 games and 120 s), `menu` (banner at the foot of the home screen, skipped on screens under 640 px tall).
- **Never** on the play or setup screens, never inside the results card, never a sticky footer (it would sit under the meter). `between_games` is refused while a game is on screen.
- Banner calls are all in `placeAds()` in `main.js`, which `show(screen)` runs on every screen change. The service reserves the exact box before asking the provider, and adds `body.ad-results` / `body.ad-menu` for the CSS (the menu one lifts the sound button into the gap above the banner).
- `?ads=demo` draws placeholder boxes and a 2 s fake break to judge layout on any screen. No standard unit fits a 320 px wide phone, so nothing shows there.
- `ads.gameCompleted()` is called in `finishGame`; `ads.configure(...)` at boot hands over audio pause/resume and analytics.

## Service boundary (keep it intact)

- `main.js` talks to the outside world only through `services` from `js/services/index.js`. The engine talks to nothing: it gets a seed and a modifier and returns a result.
- **LOCAL MODE** (default, `GAME.api` empty) uses `local.js`. **PUBLIC MODE** (`GAME.api`, or `<meta name="hc-api">`) uses `http.js`. Switching changes no gameplay code; this was verified by playing a daily through the real UI against a fake API.
- `services.daily.today()` is sync and returns plain ids (`mapId`, `modifierId`); `main.js` resolves them with `getDaily()`. `begin()` decides whether a run is official; `submit()` records it. Don't read `save.daily`, `save.tries` or the player name directly from `main.js`.
- Ads go through `services.ads` only (see Ads below). They need a provider *and* the `ads` flag; with neither, nothing happens.
- Flags (`ads`, `leaderboard`, `share`) can be forced while developing with `?flags=ads,-share`. Never put anything that affects scoring behind a flag; that goes through `GAME.rules`.
- `GAME.id` (`heatcheck`) namespaces API paths and analytics, so other games can share the site and backend.
- To test PUBLIC MODE without a server: build `createHttpServices({ api, player, local, flags, fetchFn: fake })` in the page and assign its `daily` / `leaderboard` onto `services`.

## Production readiness (audit, Nov 2026)

Done, keep it this way:
- **Versioned deploys.** `build.py` puts all code under `v-<build>/`; `index.html` is the only uncached file. This stops a browser mixing old and new modules in production. The build id is on `<html data-build>` and attached to every telemetry event.
- **Storage is untrusted input.** `storage.js` rebuilds the save field by field on load (`sanitize`, `cleanResult`, `cleanName`), keeps 60 days of dailies, merges changes from other tabs, and `persist()` reports failure instead of throwing. Never read `localStorage` anywhere else.
- **Anything from storage or a server is escaped or coerced before `innerHTML`**: strings through `esc()`, numbers through `num()`.
- **The network may fail.** `finishGame` saves locally first, then gives the leaderboard 4 s; results always show. `openLeaderboard` shows a toast on failure.
- **Results are replayable.** Every result carries a run record that `rules.verifyRun` can replay (see Scoring rules above and `docs/DAILY_VALIDATION.md`). A server recomputes the score and never trusts the claim.
- **Stable anonymous player id** (`services.player.id`) and a daily `attempt` number, both sent with `daily.submit`, so a backend can dedupe players and stop quit-and-retry.
- **Pausing restarts the sweep** (`Contest.resume()`), so pause can't be used to inspect the marker.
- **Audio lifecycle:** `initAudio()` wakes any non-running context (iOS uses `interrupted`); `suspendAudio()` / `resumeAudio()` run on tab hide/show and are what an ad break should call. Audio failing to start is not fatal.
- **Canvas** sizes from its element (not the window) with a pixel cap of 2560×1440; `prefers-reduced-motion` turns off shake, camera punches and flashes; the camera only ever zooms in, so screen edges are never unpainted.
- **`window.__app` exists only on localhost or with `?debug`.**
- Buttons blur after a click so Space (shoot) can't re-press the last button.

Still open before a public launch (in priority order):
1. **Server-side daily and leaderboard.** Scores, the one-official-run rule and the date all live on the client until a backend exists. The client side is done: the contract is in `docs/API.md`, the validation model in `docs/DAILY_VALIDATION.md`, and the rules a server needs are in `js/engine/rules.js`. What's missing is the server itself.
2. **Web font.** The rounded look depends on "Arial Rounded MT Bold", which only Apple devices have. Windows and Android fall back to a plain system font. Ship one licensed woff2.
3. **Final address and art.** Set `url` in `site.json`; replace the placeholder icons and share image in `site/`; then check a link preview and "Add to Home Screen" on a real phone. The service worker has only been tested by running its handlers in a page (the preview pane cannot register one).
4. **Freeze the daily schedule.** Maps are still picked by position in `MAPS`, and the modifier rotation (`content/dailies.js`) reshuffles unpinned days when the library changes. Pin upcoming days in `PINNED` or serve the schedule. Reset `GAME.epoch` to launch day.
5. **Real-device pass on iOS Safari and Android Chrome** (never done): audio after the silent switch or a phone call, notch safe areas, address-bar resize, 120 Hz timing feel.
6. **Slow-motion advantage.** Frame time is capped at 50 ms, so a device under 20 fps gets a slower meter. Matters once scores are public.
7. **Content-Security-Policy header.** No inline scripts exist, but a few inline `style` attributes do.
8. **Privacy/consent** before analytics or ads are switched on.

## Known limitation

On wide (landscape) screens there is little floor between shooter and hoop. `lift` and the painted key help, and all five spots now read as distinct there, but the court is still flatter than in phone portrait. Going further means giving the floor more height in landscape, which requires moving the meter.

## How things connect (for whoever edits the engine)

- `computeLayout(W, H)` gives the base layout; `spotLayout(base, view)` places shooter, hoop and depth for a spot. `Contest.L` is the *current* spot layout and is what must be passed to `drawScene` (not the base layout).
- `Contest.view` is the live blend of two spots during a move (every numeric spot field, including `angle`, is interpolated); `setBase()` recomputes `L`.
- `Contest.turn()` gives the behind-view body twist; `updateHeld()` applies the same twist to the ball so hands and ball stay together.
- Phases: `ready → rackIntro → grab → meter → flight → settle → (move →) … → finish → done`.
- A shot is a list of parabolic segments built in `buildBall`; the result is applied in `resolve()` when the ball reaches the rim. Everything at the hoop end scales with `L.hoopScale`.
- Each `Contest` has a seeded RNG: one roll per shot, in order.
- `drawScene` order: camera (shake + punch-in) wraps the map, court, hoop, shooter, balls and particles; then the camera is restored and the screen-edge glow, flash, popups and meter are drawn steady on top.
- **Sound can never break the game:** every effect in `game.js` goes through `play(name, ...)`, which skips a missing or failing sound. `resolve()` always hands off to `settle` (try/finally), and a shot can't stay in flight longer than 3 s (watchdog). Keep it that way.
- The frame loop in `main.js` schedules the next frame first and wraps the body in try/catch, so one bad frame cannot freeze the game.

## Testing notes (learned the hard way)

- **When the owner reports a freeze or glitch, read their tab's console first.** The frame loop logs caught errors as `[frame] …`, and sound failures as `[sfx] …`. Errors that go through `reportError` (`[frame]`, `[daily]`, `[leaderboard]`, `[boot]`, `[offline]`, `[config]`, `[window]`, `[promise]`) stop logging after the **first 10 per page load, counted together**, so if those look quiet, reload and reproduce before concluding nothing failed. `[sfx]` and `[modifier]` warnings are logged separately with `console.warn` and are not capped (a failing modifier hook is switched off after 3 failures). The On Fire freeze was diagnosed in one step that way.

- **Draw every frame when testing.** A crash once hid on the first frame after tap-to-start because the test stepped the game several times between draws. Step once, draw once.
- **Use the contest's layout** (`c.L`) when drawing in a test, or the test will pass while the live game is wrong.
- The owner often plays in the preview pane. **Do not reload their tab**; open a separate tab for testing. Restarting the preview server also reloads their tab, so only do it when needed and say so.
- Tests that finish a game through the UI write to `localStorage` (`heatcheck.v1`). Save and restore it.
- Use `serve.py`: it sends `Cache-Control: no-store` on every file. `Clear-Site-Data: "cache"` is sent only when the page is opened with `?clear` (e.g. `http://localhost:5173/?clear`): Chrome blocks the page until the clear finishes, which took ~30 s on every reload when it was sent always. Old cached copies once caused a new `game.js` to run against an old `audio.js` (freeze after On Fire), and later a stale `index.html` against a new `main.js` (missing results quote). Check `transferSize` in `performance.getEntriesByType('resource')`: 0 means the file came from cache.
- Changing `serve.py` itself needs a server restart (which reloads the owner's tab).
- When the preview pane is hidden, `requestAnimationFrame` is throttled; drive `contest.update(dt, ts)` manually instead of waiting for frames.
- To compare characters, draw a sheet: one row per character, one column per reaction moment, at the same `t`. That's how the hand-over-face poses and the look-alike reactions were found.
- To compare spots, render each one into its own offscreen canvas and tile them side by side; judging one spot at a time hides how similar they look.
- Performance: an offscreen test showed ~0.3 ms median draw at every Heat tier. Occasional slow frames appear equally at Normal with nothing on screen; they come from the hidden test tab, not the effects.
- Long test scripts time out at 45 s; run about three full games per call.
- To check transitions, film them: step the game in fixed increments (0.05–0.07 s) and tile the frames. That's how the replayed celebration at the end of the jog and the front→back pops were found.
- When forcing a scenario (e.g. "miss while On Fire"), hold the forced condition for the whole shot and assert the outcome actually happened. A harness once forced the miss for one frame, the shot went in, and the test "passed" without reaching the code it was meant to check.
- To test robustness, break things on purpose: remove a sound function or make one throw, then confirm all 25 shots still complete.
- Human timing cannot be simulated properly. Difficulty numbers from simulation are a guide; the owner's hands are the real test.

## Working with the owner

- Prefers changes made directly in the existing game, not rebuilds or plans.
- Gives short, concrete feedback after playing; expects the specific thing fixed and anything risky or unverified stated plainly.
- Wants original characters and art in the game's own cartoon style; reference images are mood, not something to copy.
