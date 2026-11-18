# HEAT CHECK!

A fast, goofy three-point contest for the browser. 5 racks × 5 balls, one input (timing), max 30 points.

Controls: tap / click anywhere, or Space. Esc pauses.

## Run

No build step, no dependencies. Serve the folder with the bundled server (it turns browser caching off, which a
plain static server does not):

```bash
python3 serve.py
```

Then open http://localhost:5173.

## Deploy

```bash
python3 build.py
```

Before the first real deploy, put the site's address in `site.json` (`"url": "https://…"`). The build turns
`site.json` into the page's title, description, link-preview tags and the web app manifest, and adds offline
support. Without an address it still builds, minus the link preview.

Upload the contents of `dist/`. Every build puts all code under a folder named after that build, so a returning
player's browser can never mix files from two versions. Don't upload the source folder as-is.

## Where things live

| Want to change… | File |
| --- | --- |
| Timing windows, Heat rules, pacing | `js/config.js` |
| The five rack spots around the arc (position, hoop angle, camera) | `spots` in `js/config.js` |
| Characters (data, cartoon rig, reactions) | `js/content/characters.js` |
| Maps | `js/content/maps.js` |
| Daily modifiers (the twist each day gets) | `js/content/modifiers.js` (how-to at the top) |
| Which modifier each day gets, pinned days | `js/content/dailies.js` |
| How a modifier is defined, combined and run | `js/engine/modifiers.js`, `js/engine/modrun.js` |
| Scoring rules: judging a shot, Heat, the run record, replay | `js/engine/rules.js` |
| Contest flow, animation, shot paths | `js/engine/game.js` |
| Drawing (court, hoop, ball, meter, effects) | `js/engine/render.js` |
| Sound effects + adaptive music | `js/engine/audio.js` |
| Daily, leaderboard, player, flags (local and HTTP adapters) | `js/services/` |
| Analytics events | `js/services/analytics.js` |
| Ad placements and pacing | `js/services/ads.js` |
| Screens, HUD, results | `js/main.js`, `index.html`, `css/style.css` |
| Site address, name, description, colours | `site.json` (then run `python3 build.py`) |
| Icons and link-preview image | `site/` (redraw placeholders with `python3 tools/make_site_images.py`) |

Adding a character, map, or modifier means adding one entry to the matching `content/` file.

`CLAUDE.md` holds the full design context and the decisions that are settled.

## Development switches

Add these to the URL:

| Switch | What it does |
| --- | --- |
| `?analytics` | Prints every analytics event to the console |
| `?ads=demo` | Draws placeholder ad boxes and a 2-second fake ad break, to judge layout |
| `?flags=ads,-share` | Forces feature flags on or off |
| `?debug` | Exposes `window.__app` (always on at localhost) |
| `?mod=<id>` | Quick Play with a modifier, e.g. `?mod=lights_out` or a pair `?mod=double_heat.money_rack` (localhost / `?debug` only) |

## Going online later

The game runs fully on the device and sends nothing anywhere. `js/services/index.js` is the single boundary the
outside world plugs into. Set `GAME.api` in `js/config.js` to switch from local to HTTP adapters.

| Topic | Document |
| --- | --- |
| The backend API the client already speaks | `docs/API.md` |
| How a server validates a daily run | `docs/DAILY_VALIDATION.md` |
| The analytics event catalogue | `docs/ANALYTICS.md` |
| Where ads may go, and the provider contract | `docs/ADS.md` |

## Known placeholders

- **Leaderboard is local.** `js/services/local.js` stores your score on-device and fills the board with
  simulated rivals. The HTTP adapter (`js/services/http.js`) is written but has no server to talk to yet.
- **Daily attempt lock** is client-side only (first finished run counts); a server should enforce it.
- **Analytics go nowhere.** Events are shaped and can be printed, but no provider is connected.
- **No ads.** The placements exist (results screen, home screen, between games) but no ad provider is
  installed, so nothing shows and the layout is unchanged.
- The public address is `https://www.gameheatcheck.com` (`url` in `site.json`); the icons and share image in `site/` are placeholders.
