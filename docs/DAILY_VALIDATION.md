# Daily Challenge — validation model

How a future server should decide whether a submitted daily run is real, and what the client already does to make that straightforward. No server exists yet; the game plays entirely locally and unchanged.

## The principle

**Nothing the client says about its own result is trusted.** The client sends *what the player did* (25 release positions and when), and the server works out *what that scored* by running the same rules. There is no client-side signature, checksum or secret: anything shipped in the page can be read and reproduced, so a signature would be fake security.

This works because the game is deterministic. Given the tuning, a seed and 25 release positions, every outcome is fixed. Verified: 400 games (10,000 shots, every modifier) produce identical results through the engine and through a replay.

## Who owns what

| Thing | Today (local) | With a server |
| --- | --- | --- |
| Which day it is | Device clock, UTC | **Server.** The device clock stops mattering. |
| Challenge id, number, map, modifier | Built-in schedule from the date | **Server**, from its own schedule |
| Seed for the zone's motion | Hash of the date (public, predictable) | **Server.** May stay shared so everyone sees the same zone motion. |
| Seed for the dice | Same stream as the zone seed | **Server, per attempt** (recommended; see below) |
| Whether a run is the official one | First finished run on this device | **Server**: one attempt token per player per day |
| Rules version and tuning | `GAME.rules` + tuning in the client build | **Server** runs the same `rules.js`; fingerprints must match |
| What the modifier changes | `tune` and `plan` in `content/modifiers.js`, applied by `rules.configFor` | **Server** imports the same files. Only these two functions can change an outcome; a modifier's show hooks cannot |
| Release positions and times | Client | Client. This is the only real input. |
| Score, makes, perfects, Heat, streak | Client | **Server recomputes.** The client's numbers are a cross-check only. |
| Character | Client | Client. Cosmetic; shown on the board, never scored. |
| Submission time | n/a | **Server clock** |
| Player id, display name | Client (anonymous id) | Client supplies; server moderates the name |

## The run record

Every finished run produces one (`Contest.record()`; format defined in `js/engine/rules.js`). It is plain JSON, about 900 bytes.

```json
{ "v": 1, "game": "heatcheck", "mode": "daily",
  "rules": 2, "rulesHash": "f0ebc2fe", "build": "9cf1e20b24",
  "seed": 3147694423, "dice": null, "modifierId": "double_heat",
  "mapId": "gym", "characterId": "tech",
  "runId": "75b41e0b-39a5-4de0-9230-3a292fd31134",
  "challenge": { "id": "heatcheck:daily:2026-11-17", "date": "2026-11-17", "number": 2 },
  "attempt": 1, "token": null,
  "startedAt": 1794882040752, "wallMs": 59267, "gameMs": 56267, "pauses": 1,
  "shots": [[653027, 1388], [695952, 3310], … 25 pairs],
  "claim": { "score": 29, "makes": 24, "perfects": 11, "moneyMade": 5, "maxHeat": 3, "bestStreak": 18 } }
```

| Field | Meaning | Used for |
| --- | --- | --- |
| `shots[i][0]` | Release position in millionths of the meter (integer 0–1,000,000) | **The replay.** The game judges this exact integer, so there is no rounding gap between play and replay. |
| `shots[i][1]` | Milliseconds from the first tap to this release | Timing plausibility |
| `seed`, `dice`, `modifierId` | What fixed the outcomes | Must equal the server's own values, or the record is rejected |
| `rules`, `rulesHash` | Rules version and a fingerprint of the scoring tuning | Catch a client and server tuned differently |
| `claim` | What the client says happened | Compared with the replay; any difference is a rejection |
| `wallMs`, `gameMs`, `pauses` | Real time, in-game time, pause count | Weak signals only |
| `runId`, `attempt`, `token` | Identity of this attempt | Bind the result to one server-issued attempt |
| `mapId`, `characterId`, `build`, `startedAt` | Context | Display and debugging; never scored |

Heat progression is not sent. It follows from the shots and the server recomputes it (the verifier returns a per-shot trace).

## What the server does

`verifyRun(record, expect)` in `js/engine/rules.js` is the reference implementation. It is pure (no browser APIs), so a JavaScript server can import the file as-is; any other language should port it and test against it.

On `POST …/attempts` (run start):

1. Check the player has no official attempt today. If they do, answer `official: false`.
2. Create the attempt: token, start time (server clock), and the dice seed for this attempt.
3. Return `{ official, attempt, token }` (plus the dice seed once per-attempt dice are switched on).

On `POST …/results` (run end):

1. Look up the attempt by token. Reject if unknown, already used, expired, or issued to another player.
2. Build `expect` from the server's own records: `{ seed, dice, modifierId, rules }`. Never read these from the request.
3. Run `verifyRun(record, expect)`. It rejects when:
   - the record's seed, dice or modifier differ from `expect`;
   - the rules version or tuning fingerprint don't match;
   - there aren't exactly 25 well-formed shots, or shot times go backwards;
   - any claimed total differs from the replay;
   - two releases are closer together than the game physically allows (a flight, a settle and a catch: about 0.9 s).
4. Compare times against the server's clock: the submission can't arrive sooner after the token was issued than the run claims to have lasted, and shouldn't arrive hours later.
5. Store the **recomputed** score, mark the token used, and return rank.

Tested against a real run: an honest record passes; a raised score, inflated perfects, a swapped seed, a swapped modifier, the wrong dice, a dropped shot, a 5-second run, and records from other tuning or other rules are all rejected with a specific reason.

## What this does not stop

Stated plainly, so nobody builds on a false assumption:

- **A bot.** A script can compute the ideal release position for every shot, wait out realistic gaps, and submit a record that is indistinguishable from an exceptional human. Tested: the verifier accepts it. Timing checks only force the bot to take as long as a person. Mitigations are operational, not cryptographic: rate limits, flagging scores at the very top, reviewing implausibly consistent release times, and accepting that the top of a public board will need moderation.
- **Reading the dice.** The client must know the seed to show each shot's outcome immediately, so a modified client can see every roll in advance. Per-attempt dice (below) limit how useful that is.
- **Slow motion.** The meter runs on in-game time, which stretches when frames are slow. `wallMs` versus `gameMs` reveals it, but both numbers come from the client. Treat it as a flag for review.
- **Self-verification.** Running `verifyRun` with no `expect` only proves a record is internally consistent. A record with an edited seed and a recomputed claim passes that check. It is useful for tests, and worthless as security.

## Recommended next step: per-attempt dice

Today one seed drives both the zone's motion and the dice, and it is derived from the date, so it is public. Two consequences: a player who quits and retries faces the same dice, and players can tell each other which shots are "bad rolls".

`rules.js` already accepts a separate dice seed (`createRandom(seed, dice)`; `Contest` takes a `dice` option). With `dice: null` the behaviour is exactly today's. When a server exists, issue a fresh dice seed with each attempt token. Everyone still gets the same map, modifier and zone motion; the bounces become personal, and retrying or sharing tells you nothing.

The trade-off is fairness of luck: two players with identical timing may no longer get identical results. That's a product decision.

## Before building the server

- **Freeze the schedule.** The built-in rotation (`content/dailies.js`) is weighted by rarity over the current library, so adding or removing a modifier reshuffles unpinned future days. The server should own a schedule keyed by id, or upcoming days should be pinned in `PINNED`.
- **Modifier changes are rule changes.** Editing a modifier's `tune` or `plan` changes outcomes: bump `GAME.rules`. `rulesHash` includes the whole shot plan, so a mismatch is caught either way.
- **Bump `GAME.rules` whenever an outcome can change**, and deploy client and server together. `rulesHash` catches tuning that drifted without a bump.
- **Floating point.** The zone's motion uses `Math.sin`, which is not guaranteed bit-identical across JavaScript engines. Positions are integers and the dice are integer-exact, so a disagreement would need a release within about 1e-15 of a boundary. If a replay ever differs from a claim by a single shot's tier, check that shot's distance from the boundary before calling it cheating. Running the server on V8 (Node) avoids the question for Chrome users.
- **Practice runs** are never submitted and need no validation.
