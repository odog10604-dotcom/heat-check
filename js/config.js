// Central tuning. Everything here is plain data so a run can clone it
// and daily modifiers can tweak the copy without touching engine code.
// Behind-the-shooter depth: the shooter is drawn from the back, larger and nearer the camera; the hoop smaller and further up the floor.
// A spot can override any of these (set back: 0, hoopScale: 1, hoopBack: 0, charScale: 1, sy: 0 for a flat side-on view).
const BEHIND = { back: 1, hoopScale: 0.58, hoopBack: 24, charScale: 1.3 };   // sy (how low the shooter stands) is fitted to the screen unless set

export const CONFIG = {
  racks: 5,
  ballsPerRack: 5,
  points: { regular: 1, money: 2 },
  // Meter positions are 0..1 across the bar. Windows are half-widths around `target`.
  // The zone is a spectrum, not a pass/fail box: a release inside `perfect` always goes in; from there the
  // make chance slides from `chance.near` (just outside perfect) down to `chance.edge` (the zone's outer edge).
  // Outside the zone is always a miss. `good` only decides clean swish vs rattle-in (and Heat gain) on a make.
  meter: { sweep: 0.82, target: 0.7, make: 0.0765, good: 0.0405, perfect: 0.009, chance: { near: 0.96, edge: 0.2 },
    // The zone slides back and forth while the marker sweeps. amp = how far each way (fraction of the bar),
    // period = seconds per full back-and-forth. Set amp to 0 for a zone that stays still.
    drift: { amp: 0.055, period: 0.8 } },
  heat: {
    perLevel: 3,                       // heat points per level
    gain: { perfect: 2, good: 1, ok: 0 },
    gainMult: 1,
    makeBonus: 0.13,                  // make window grows this much per heat level
    perfectBonus: 0.07,                // perfect window grows a little too
    missDrop: 4,                       // levels lost on a miss. 4 = everything: one miss resets Heat to zero
    startLevel: 0,
  },
  timing: { grab: 0.24, flight: 0.7, settle: 0.34, rackIntro: 0.55, move: 0.85, finish: 1.0 },
  visual: { ballScale: 1, arcScale: 1, crowdBoost: 0, hidePerfect: false, zoneFade: 0 },
  unlockMakes: 20,
  // One entry per rack, in order. Pure data: tweak or add spots here. Every spot is seen from behind the shooter,
  // and the hoop stays put in the middle of the screen: the court turns around it.
  //   angle   where the shooter stands on the arc, in degrees from the top of the key (-90 = left corner, 90 = right corner).
  //           The court lines (key, baseline, three-point line) are projected from this, so each spot gets its true view.
  //   dist    how far from the hoop the shooter stands, in feet (the line is 23.75, or 22 in the corners)
  //   side    how the backboard faces the camera: 0 = square-on, +/-1 = edge-on. Should be about sin(angle).
  //   shooter horizontal position of the shooter as a fraction of the shot distance, from screen centre.
  //           Wider out in the corners, closer in at the top, so the framing itself says where you are.
  //   cam     background camera pan, -1 (far left) .. 1 (far right)
  //   mini    dot position on the HUD court map (84x60 box)
  //   target  where the timing zone sits on the meter for this spot (falls back to meter.target)
  spots: [
    { id: 'left_corner',  name: 'LEFT CORNER',    angle: -88, dist: 24,   side: -1,   shooter: -0.46, hoop: 0, cam: -1,   target: 0.66, mini: [9, 13] },
    { id: 'left_wing',    name: 'LEFT WING',      angle: -45, dist: 25.3, side: -0.7, shooter: -0.36, hoop: 0, cam: -0.5, target: 0.70, mini: [17, 40] },
    { id: 'top_key',      name: 'TOP OF THE KEY', angle: 0,   dist: 25.3, side: 0,    shooter: -0.28, hoop: 0, cam: 0,    target: 0.74, mini: [42, 54] },
    { id: 'right_wing',   name: 'RIGHT WING',     angle: 45,  dist: 25.3, side: 0.7,  shooter: 0.36,  hoop: 0, cam: 0.5,  target: 0.70, mini: [67, 40] },
    { id: 'right_corner', name: 'RIGHT CORNER',   angle: 88,  dist: 24,   side: 1,    shooter: 0.46,  hoop: 0, cam: 1,    target: 0.66, mini: [75, 13] },
  ].map((sp) => ({ ...BEHIND, ...sp })),
};

export const HEAT_LEVELS = [
  { name: 'NORMAL', color: '#8fb4d9' },
  { name: 'HEATING UP', color: '#ffd23f' },
  { name: 'HOT', color: '#ff8a1f' },
  { name: 'ON FIRE', color: '#ff3b2f' },
];

export const GAME = {
  id: 'heatcheck',       // this game's key on the site: storage, API paths and analytics are namespaced by it
  title: 'HEAT CHECK!',
  // Base URL of the backend, e.g. 'https://api.example.com/v1'. Empty = LOCAL MODE (everything stays on the device).
  // Can also be set without touching code: <meta name="hc-api" content="..."> in index.html.
  api: '',
  // Bump whenever anything that affects scoring changes (meter, Heat, spots, modifiers, dice). Saved with every result
  // so a future server can replay a run with the right rules, and so old results are never judged by new ones.
  rules: 2,
  epoch: '2026-11-16',   // Daily #1
  // The public address is not here: it is "url" in site.json, and build.py writes it into the page.
};
