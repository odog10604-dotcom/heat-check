# HEAT CHECK! — advertising

**There are no ads and no ad provider.** The game has an ad *service* with named placements, and today that service is a no-op: nothing is available, nothing renders, no layout changes, no network requests. This document says where ads could go later, why, and how to plug a provider in.

- Code: `js/services/ads.js` (placements, rules, the service, and a placeholder provider for layout testing).
- Call sites: `placeAds()` and `startGame()` in `js/main.js`. The engine knows nothing about ads.

## The interface the game uses

```js
services.ads.isAvailable()             // is advertising on at all?
services.ads.isAvailable('results')    // could this placement show something right now?
services.ads.show('results', { container, room })   // -> Promise<{ shown }>. Never throws.
services.ads.show('between_games')     // resolves when play may continue
services.ads.hide('results')
```

The game asks for a **placement** by name. Whether anything shows, which size, and how often is decided inside the service. The game never names a provider.

## Placements

| Placement | Kind | Where | Why here |
| --- | --- | --- | --- |
| `results` (priority 1) | Banner: 300×250, else 320×100, else 320×50 | Under the results card, outside it | The game is over and the player is reading their score. It is the one natural pause in the loop, and the most valuable spot. |
| `between_games` (priority 2) | Full-screen break | After "Play again" / "Go", before the next game loads | The player has already chosen to continue, and nothing is in motion. Paced so it is rare (see below). |
| `menu` (priority 3) | Banner: 728×90, else 320×50 | Foot of the home screen, under the buttons | Before a session starts. Low value, but costs the player nothing. |

Adding a placement is one entry in `PLACEMENTS` plus a container and a `show()` call.

## Where ads never go

- **Not while a game is being played.** No banner is ever placed on the play screen, and `between_games` is refused while `app.screen === 'play'` (`canInterrupt`). Verified: zero ad elements across five simulated games.
- **Not near the timing meter.** The meter exists only on the play screen, so this follows from the rule above. Do not add a "sticky footer" banner: it would sit directly under the meter.
- **Not right before a shot.** The break happens before the game is created, so the "tap to start" beat still belongs to the player.
- **No pop-ups over content, no rewarded prompts mid-game, no ad on the setup screen** (it is ten seconds of choosing a character; an ad there only slows the loop).
- **Not inside the results card.** An ad between the score and "Play again" pushes the button down and invites mis-taps.

## Rules the service enforces (so a provider can't get them wrong)

- **Pacing of the full-screen break:** none before the third game of a visit, then at most one every 3 finished games and never within 120 seconds of the last one (`afterGames`, `everyGames`, `minGapS`). A game is about 53 seconds, so this is roughly one break per three minutes of play at most. Abandoned games don't count.
- **Sound stops** for the length of a break and resumes after (`suspendAudio` / `resumeAudio`).
- **A break can't hang the game:** it is abandoned after 30 seconds, and any provider error resolves as "not shown".
- **No layout shift:** a banner's exact box is reserved before the provider is asked for an ad. If no ad comes back, the box is removed.
- **Every slot is labelled "Advertisement".**
- **Off by default:** needs both a provider and the `ads` flag. Consent should gate the same switch (`enabled` in `createAds`).

## Mobile layout

Measured with placeholder ads (`?ads=demo`) by playing games through the real UI.

| Screen | Home (`menu`) | Results (`results`) | Notes |
| --- | --- | --- | --- |
| 375×812 phone | 320×50 under the buttons | 320×100 under the card, no scrolling, on both Quick Play and the taller Daily card | Buttons move up 84 px into open scene. The sound button moves up into the gap between the buttons and the banner. |
| 320×568 small phone | none | none | No standard unit fits 288 px of usable width, and the home screen has no spare height. Layout is identical to no-ads. |
| 844×390 landscape phone | none (`minViewportH: 640`) | 320×50 below the fold | The card already fills the screen, so the banner is reached by scrolling. "Play again" does not move. |
| 1280×800 desktop | 728×90 | 320×100 | 300×250 only appears when there are 268 px free under the card (tall windows). |

How it holds together:

- The card and the results banner are centred **as a group**, so the card moves up by half the banner's height and nothing overlaps.
- The size is chosen from the real free space: `room.w` is the screen width minus side padding; `room.h` is the space under the card minus 34 px kept for the badge row that appears after the score count-up.
- The menu banner only appears if at least 120 px of open scene remains between the tagline and the buttons.
- Banners are re-fitted 300 ms after a rotation or window resize. A provider should expect a new `banner()` call then.
- Bottom safe-area insets are already part of each screen's padding, so banners clear the home indicator.

## Adding a provider later

A provider is a small object. It is the only place a third-party script would be loaded.

```js
const myProvider = {
  name: 'example',
  isReady: (placement) => true,                  // optional
  // Put an ad into `el` (already sized to `size`). Return a cleanup function, or nothing if no ad filled.
  async banner({ placement, size, el }) { /* … */ return () => { /* remove */ }; },
  // Show a full-screen ad. Resolve true when it has closed, false if none was shown.
  async interstitial({ placement }) { /* … */ return true; },
};
```

Then, in `js/services/index.js`:

```js
const ads = createAds({ provider: myProvider, enabled: () => flags.on('ads') && hasConsent() });
```

No other file changes. Before doing this:

1. **Consent and privacy** for your regions; most ad networks set identifiers. Nothing should load before consent.
2. **Content-Security-Policy** must allow the provider's script and frame origins (see the audit list in `CLAUDE.md`).
3. **Load the provider's script lazily**, on the first `banner()` / `interstitial()` call, never at boot, so ads can't slow the first game.
4. **Game portals** often supply their own ad SDK and forbid others; that is just another provider.
5. Re-check the layout table above on real phones.

## Seeing the placements now

Add `?ads=demo` to the URL. Labelled placeholder boxes appear at real ad sizes, and a 2-second placeholder break appears before the third game. It draws local boxes only: no scripts, no requests. Add `&analytics` to see the `ad_shown` events.

## Measuring

One event, `ad_shown` (`placement`, `kind`, `w`, `h`), fires when something actually appeared. Compared with `game_started.nth` and `game_abandoned`, it answers the only question that matters: do ads shorten visits? Revenue numbers come from the provider's own reporting.

## Not done

- No provider, consent flow, or CSP changes.
- No rewarded ads. They need a reward worth having, and nothing in this game should be buyable with attention.
- Never tested on a real phone, or with a real ad that loads slowly or resizes itself.
