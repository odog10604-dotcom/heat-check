// Character roster + the parametric cartoon rig that draws them.
// Characters are pure data: add a new entry to CHARACTERS and it shows up everywhere.
// New looks = new entries in the HAIR / ACCESSORIES / TOPS / BACK_TOPS / EMOTES / MOTIONS registries below.
// Characters never change gameplay: every field here is looks, animation and words.
import { OUT, rr, circ, fillStroke, FONT, lerp } from '../engine/draw.js';

// Optional character fields (beyond the obvious ones):
//   faces   { expression: replacement } — how this character wears the shared expressions ('focus' -> 'calc', ...)
//   motion  key into MOTIONS: how they stand, set, jog and plant (body language only; never the ball or the timing)
//   sound   { kit, step }: a sound kit in audio.js (VOICES) and seconds between jogging footsteps
//   calm    floaty instead of bouncy at Heat, and the head barely shakes (Himmy)
//   glyphs  little equations float off the head while thinking (Tech Guy)
//   armored grey arms with elbow plates and big shoulder plates (White Knight)
//   outfit.sleeve / hands / legColor / knees / sandal, build.legW / headW / armW: per-character rig overrides
//   lines   { badMiss, cool, winBig, winMid, winPoor }: each a string or a short list (read with lineOf); fireLine too
export const CHARACTERS = [
  {
    // Treats a three-point contest as a sacred quest. Serious about it. Very serious.
    id: 'knight', name: 'White Knight', tagline: 'Swore an oath to defend the three-point line. Nobody asked him to.',
    skin: '#f4c9a4', hair: { style: 'helm', color: '#f6d660' }, helm: '#b4bdc8', plume: '#e83f5b', acc: ['chin'], armored: true,
    faces: { neutral: 'stern', focus: 'stern', happy: 'proud', smug: 'proud', hype: 'valor', crazed: 'valor', sad: 'solemn', angry: 'solemn' },
    outfit: { top: 'armor', topColor: '#aeb7c2', tabard: '#f7f3e8', trim: '#f2b632', cape: '#f7f3e8', sleeve: 'long', hands: '#8d97a4',
      bottom: 'faulds', bottomColor: '#959fac', legColor: '#aeb7c2', knees: true, shoes: '#7f8995', socks: null },
    build: { leg: 62, torsoW: 64, torsoH: 70, head: 30, headW: 1.06, belly: 0, armW: 14, legW: 15 },
    motion: 'march', sound: { kit: 'armor', step: 0.19 }, emote: 'salute', fireEmote: 'warCry', fireLine: ['FOR THE REALM!', 'CHARGE!!!', 'BY MY OATH!'],
    reactions: { make: 'salute', perfect: 'swordRaise', money: 'kneelOath', hot: 'chargePoint', fire: 'warCry', miss: 'solemnBow', badMiss: 'kneelDefeat', cool: 'sheathe', winBig: 'triumph', winPoor: 'handOnHeart' },
    lines: {
      badMiss: ['A WORTHY FOE.', 'MY GAUNTLET SLIPPED.', 'THE RIM IS ENCHANTED!'],
      cool: ['THE FLAME RETREATS... FOR NOW.', 'REGROUP! REGROUP!', 'A TACTICAL WITHDRAWAL.'],
      winBig: ['The rim has been defended. Honor is restored.', 'Let the bards sing of this day.'],
      winMid: ["An honest day's work for an honest knight.", 'The kingdom is... adequately defended.'],
      winPoor: ['I have brought shame upon my helmet.', 'Tell the king I tried.'],
    },
  },
  {
    // Has modelled the contest. The contest has not read the model.
    id: 'tech', name: 'Tech Guy', tagline: 'Ran 10,000 simulations. Considers this a solved problem.',
    skin: '#f0c39b', hair: { style: 'messy', color: '#6b4228' }, acc: ['headset'], glyphs: true,
    faces: { focus: 'calc' },
    outfit: { top: 'techshirt', topColor: '#8fd3dc', pack: '#2f3e66', sleeve: 'short', bottom: 'pants', bottomColor: '#cdb98d', shoes: '#f4f4f4', socks: null },
    build: { leg: 82, torsoW: 40, torsoH: 72, head: 33, headW: 0.9, belly: 0, armW: 8, legW: 10 },
    motion: 'calc', sound: { kit: 'tech', step: 0.12 }, emote: 'nodConfirm', fireEmote: 'frantic', fireLine: ['THE MATH CHECKS OUT!', 'P < 0.05!!!', 'STATISTICALLY HOT!'],
    reactions: { make: 'nodConfirm', perfect: 'calcWorked', money: 'typeFast', hot: 'graphUp', fire: 'frantic', miss: 'checkMath', badMiss: 'handsOnHead', cool: 'recalibrate', winBig: 'robot', winPoor: 'outlier' },
    lines: {
      badMiss: ["THAT'S NOT IN THE MODEL.", 'UNEXPECTED VARIABLE.', 'FIRMWARE ISSUE.'],
      cool: ['RECALIBRATING...', 'REGRESSION TO THE MEAN.', 'REBOOTING...'],
      winBig: ['Exactly as projected. Within margin of error.', "I'll be publishing this."],
      winMid: ['Solidly average. I can work with average.', 'Data collected. Adjusting parameters.'],
      winPoor: ['Small sample size. Proves nothing.', 'The hoop was clearly 0.3 inches too small.'],
    },
  },
  {
    // Wandered in off the beach. Believes every shot is part of a longer journey.
    id: 'himmy', name: 'Himmy', tagline: 'Find your flow. Trust the flow. The flow finds the bucket.',
    skin: '#d99c68', hair: { style: 'flow', color: '#b0733a', tips: '#f4d892' }, acc: ['scruff'], calm: true,
    faces: { neutral: 'chill', focus: 'serene', happy: 'chill', smug: 'chill', hype: 'serene', crazed: 'mystic', sad: 'chill', angry: 'chill', shock: 'chill', wince: 'chill' },
    outfit: { top: 'hawaiian', topColor: '#27a98f', tank: '#f4efe6', flower: '#ffd23f', sleeve: 'short', bottom: 'boardshorts', bottomColor: '#ff7a3d',
      shoes: '#d99c68', sandal: '#4a3324', socks: null },
    build: { leg: 70, torsoW: 58, torsoH: 66, head: 30, belly: 0, armW: 12, legW: 13 },
    motion: 'glide', sound: { kit: 'surf', step: 0.24 }, emote: 'peaceSign', fireEmote: 'levitate', fireLine: ['ONE WITH THE FLOW.', 'I AM THE WAVE.', 'THE BUCKET AND I ARE ONE.'],
    reactions: { make: 'peaceSign', perfect: 'palmsUp', money: 'shaka', hot: 'surfStance', fire: 'levitate', miss: 'letItGo', badMiss: 'bowToRim', cool: 'deepBreath', winBig: 'doubleShaka', winPoor: 'letItGo' },
    lines: {
      badMiss: ['NO MISS. ONLY THE NEXT SHOT.', 'THE BALL HAD OTHER PLANS.', 'EVEN THE OCEAN WIPES OUT.'],
      cool: ['THE WAVE COMES BACK, BRO.', 'BREATHE IN... BREATHE OUT.', 'TIDE GOES OUT. TIDE COMES IN.'],
      winBig: ['The universe knew. I just listened.', "Didn't even try, man. That's the secret."],
      winMid: ["Some go in, some don't. Both are beautiful.", 'Good vibes. Medium buckets.'],
      winPoor: ["The flow wasn't with us today. That's cool too.", 'The rim needed it more than me.'],
    },
  },
  {
    // The unlockable: a centaur. Stays "???" and in silhouette until earned.
    id: 'darkhorse', name: '???', unlockedName: 'The Dark Horse', tagline: 'Nobody saw him coming. He prefers it that way.',
    locked: true, unlock: { type: 'makes', value: 20 },
    skin: '#5f4133', coat: '#33222a', hair: { style: 'mane', color: '#120c14' }, acc: [], brood: true, eyeGlow: '#ff5a1f', snort: true,
    outfit: { top: 'bare', topColor: '#5f4133', bottom: 'none', bottomColor: '#33222a', shoes: '#0c080d', socks: null },
    build: { leg: 82, torsoW: 66, torsoH: 70, head: 31, belly: 0, centaur: true, armW: 16, horse: 1.18 }, rackGap: 34, motion: 'prowl', sound: { kit: 'beast', step: 0.09 }, emote: 'rear', fireEmote: 'rampage', fireLine: ['*SNORT*', '*THUNDER*', '*THE LIGHTS FLICKER*'],
    reactions: { make: 'coldNod', perfect: 'slowFist', money: 'chestBeat', hot: 'pawGround', fire: 'rampage', miss: 'stomp', badMiss: 'rearFury', cool: 'snortStill', winBig: 'rearWide', winPoor: 'turnAway' },
    lines: {
      badMiss: ['*STOMP*', '*HOOF SCRAPE*', '...HM.'],
      cool: ['...', '*LOW GROWL*', '*EMBERS DIM*'],
      winBig: ['They never saw it coming.', 'Again.'],
      winMid: ['Enough. For now.', 'Hm.'],
      winPoor: ['This changes nothing.', 'You saw nothing.'],
    },
  },
];

export const getCharacter = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

/** One of a character's lines for a moment. `lines.x` and `fireLine` may be a string or a list; `n` picks from the
 *  list (any integer, wraps). Words only: never chosen with the game's seeded dice. Returns '' if there is none. */
export function lineOf(def, key, n = 0) {
  const v = key === 'fire' ? def.fireLine : (def.lines || {})[key];
  if (Array.isArray(v)) return v.length ? String(v[((n % v.length) + v.length) % v.length]) : '';
  return typeof v === 'string' ? v : '';
}

// ---------- personality reactions ----------
// Every character reacts through the same ten moments; `reactions` on the character picks a gesture for each.
// Gestures are short pose functions (p, t, k, A): k = intensity (grows with Heat), A = body anchors so poses fit every build.
// A gesture may also set p.handShape = { r: 'point' | 'peace' | 'shaka' } for simple finger shapes.
export const REACTION_MOMENTS = ['make', 'perfect', 'money', 'hot', 'fire', 'miss', 'badMiss', 'cool', 'winBig', 'winPoor'];
const POSITIVE = new Set(['make', 'perfect', 'money', 'hot', 'fire', 'winBig']);
const DEFAULT_REACTIONS = { make: 'fistpump', perfect: 'fistpump', money: 'fistpump', hot: 'fistpump', fire: 'fistpump', miss: 'handsOnHips', badMiss: 'handsOnHead', cool: 'deflate', winBig: 'fistpump', winPoor: 'shrug' };

/** Key body points for a character, in the rig's local space (feet at 0, up is negative). */
// These cartoons have big, low heads: shoulder height is chin height, so "chest" is chest (sh + 20) and anything
// held up near the face must sit forward of it (face reaches x ~ 45) or it reads as a hand over the mouth.
function anchors(def) {
  const b = def.build, hip = -b.leg, sh = hip - b.torsoH + 18;
  return { hip, sh, chest: sh + 22, head: sh - 38, top: reachTop(def), tw: b.torsoW };
}
const atSide = (A, s) => [s * (A.tw / 2 + 6), A.hip + 4];
const bounce = (t, f) => Math.abs(Math.sin(t * f));
const ease = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

export const EMOTES = {
  // ---- shared fallbacks
  fistpump(p, t, k) { p.hands = { r: [28, -185 - Math.abs(Math.sin(t * 10)) * 34 * k], l: [-36, -112] }; p.jump += Math.abs(Math.sin(t * 10)) * 9 * k; },
  shrug(p, t, k, A) { const b = bounce(t, 6); p.hands = { r: [42, A.sh - 2 - b * 8], l: [-40, A.sh - 2 - b * 8] }; p.headTilt = 0.16; p.expr = 'neutral'; },
  handsOnHips(p, t, k, A) { p.hands = { r: [A.tw / 2 + 2, A.hip], l: [-A.tw / 2 - 2, A.hip] }; p.headShake = Math.sin(t * 9) * 2.5; p.expr = 'sad'; },
  handsOnHead(p, t, k, A) { p.hands = { r: [14, A.head - 24], l: [-12, A.head - 24] }; p.crouch = 0.1; p.expr = 'shock'; },
  deflate(p, t, k, A) { p.hands = { r: [A.tw / 2 + 2, A.hip + 14], l: [-A.tw / 2 - 2, A.hip + 14] }; p.crouch = 0.2; p.lean = 0.12; p.headTilt = 0.3; p.expr = 'sad'; },
  deepBreath(p, t, k, A) { const s = Math.sin(t * 5); p.hands = { r: [42, A.sh + 22 + s * 10], l: [22, A.sh + 24 + s * 10] }; p.expr = 'happy'; },

  // ---- White Knight: honour, duty, absolutely no chill. Restrained on a make, operatic on a perfect.
  salute(p, t, k, A) { const u = ease(t * 5); p.hands = { r: [lerp(30, 50, u), lerp(A.chest, A.head - 8, u)], l: atSide(A, -1) }; p.headTilt = -0.07; p.expr = 'proud'; },
  swordRaise(p, t, k, A) { const u = ease(t * 4); p.hands = { r: [lerp(40, 26, u), lerp(A.chest, A.top + 2, u) - bounce(t, 5) * 4], l: [-A.tw / 2 - 2, A.hip] }; p.lean = -0.08 * u; p.jump += u * 6 * k; p.expr = 'valor'; },
  kneelOath(p, t, k, A) { p.crouch = 0.5; p.hands = { r: [16, A.chest], l: [44, A.hip + 24] }; p.headTilt = 0.18 + Math.sin(t * 3) * 0.03; p.expr = 'proud'; },
  chargePoint(p, t, k, A) { p.hands = { r: [88, A.sh - 30 - bounce(t, 6) * 6], l: [-A.tw / 2 - 2, A.hip] }; p.lean = 0.1; p.jump += bounce(t, 6) * 4 * k; p.expr = 'valor'; },
  warCry(p, t, k, A) { const y = A.top + 16 - bounce(t, 9) * 16; p.hands = { r: [30, y], l: [-18, y + 4] }; p.lean = -0.12; p.jump += bounce(t, 9) * 16; p.expr = 'valor'; },   // On Fire signature
  solemnBow(p, t, k, A) { p.hands = { r: [24, A.hip + 12], l: [14, A.hip + 14] }; p.headTilt = 0.3; p.crouch = 0.05; p.expr = 'solemn'; },
  kneelDefeat(p, t, k, A) { p.crouch = 0.5; p.hands = { r: [40, A.hip + 26], l: [-A.tw / 2, A.hip + 20] }; p.headTilt = 0.42; p.expr = 'solemn'; },
  sheathe(p, t, k, A) { const u = ease(t * 2.2); p.hands = { r: [lerp(50, -A.tw / 2 + 6, u), lerp(A.chest - 14, A.hip + 2, u)], l: [-A.tw / 2 - 2, A.hip + 2] }; p.headTilt = 0.24; p.expr = 'solemn'; },
  triumph(p, t, k, A) { p.hands = { r: [56, A.top + 24], l: [-44, A.top + 24] }; p.lean = -0.1; p.jump += bounce(t, 5) * 8 * k; p.expr = 'valor'; },
  handOnHeart(p, t, k, A) { p.hands = { r: [14, A.chest], l: atSide(A, -1) }; p.headTilt = 0.26; p.expr = 'solemn'; },

  // ---- Tech Guy: confirms rather than celebrates; when reality disagrees, reality is checked for bugs.
  nodConfirm(p, t, k, A) { p.hands = { r: [58, A.sh - 18], l: [-A.tw / 2 - 2, A.hip + 4] }; p.handShape = { r: 'point' }; p.headTilt = 0.12 * bounce(t, 8); p.expr = 'smug'; },
  calcWorked(p, t, k, A) {   // taps his temple, then points at the hoop: called it
    const tap = (t * 2.4) % 1 < 0.5;
    p.hands = { r: tap ? [34, A.head - 8] : [90, A.sh - 22], l: [-A.tw / 2 - 2, A.hip] }; p.handShape = { r: 'point' };
    p.jump += tap ? 0 : 4 * k; p.expr = 'smug';
  },
  typeFast(p, t, k, A) { p.hands = { r: [56 + Math.sin(t * 40) * 3, A.chest + 6 + Math.sin(t * 37) * 3], l: [38 + Math.sin(t * 33) * 3, A.chest + 8 + Math.cos(t * 41) * 3] }; p.headTilt = 0.16; p.expr = 'hype'; },   // logs the data point
  graphUp(p, t, k, A) { const u = (t * 1.6) % 1; p.hands = { r: [lerp(24, 86, u), lerp(A.hip, A.top + 22, u)], l: atSide(A, -1) }; p.handShape = { r: 'point' }; p.expr = 'hype'; },   // traces the trend line
  frantic(p, t, k, A) {   // On Fire signature: scribbles equations in the air, faster and faster
    p.hands = { r: [62 + Math.sin(t * 31) * 16, A.sh - 30 + Math.cos(t * 27) * 14], l: [30 + Math.cos(t * 29) * 14, A.sh - 10 + Math.sin(t * 35) * 12] };
    p.handShape = { r: 'point' }; p.jump += bounce(t, 10) * 10; p.headShake = Math.sin(t * 38) * 2; p.expr = 'crazed';
  },
  checkMath(p, t, k, A) { p.hands = { r: [60, A.head + 6], l: [-A.tw / 2 - 2, A.hip] }; p.headTilt = 0.14 + Math.sin(t * 3) * 0.04; p.expr = 'shock'; },   // stares at his own hand: the hardware failed
  recalibrate(p, t, k, A) { p.hands = { r: [56, A.chest - 4 + Math.sin(t * 10) * 3], l: [40, A.chest + Math.cos(t * 9) * 3] }; p.headTilt = 0.2; p.expr = 'calc'; },
  robot(p, t, k, A) {   // stiff, snappy, deeply unironic robot dance
    const step = Math.floor(t * 4) % 4;
    const P = [[[54, A.sh - 30], [-32, A.chest]], [[30, A.chest], [-40, A.sh - 30]], [[60, A.chest - 8], [-50, A.chest - 8]], [[36, A.sh - 40], [-28, A.sh - 40]]][step];
    p.hands = { r: P[0], l: P[1] }; p.headTilt = [0.12, -0.12, 0, 0.06][step]; p.jump += step === 3 ? 4 * k : 0; p.expr = 'hype';
  },
  outlier(p, t, k, A) { p.hands = { r: [52, A.sh], l: [-46, A.sh] }; p.headTilt = 0.12; p.expr = 'calc'; },

  // ---- Himmy: nothing rattles him. A make is a nod to the universe; a miss is part of the journey.
  peaceSign(p, t, k, A) { p.hands = { r: [58, A.sh - 10 + Math.sin(t * 4) * 3], l: atSide(A, -1) }; p.handShape = { r: 'peace' }; p.headTilt = 0.06 * Math.sin(t * 3); p.expr = 'chill'; },
  palmsUp(p, t, k, A) { const u = ease(t * 1.8); p.hands = { r: [lerp(40, 58, u), lerp(A.chest, A.top + 30, u)], l: [lerp(-30, -46, u), lerp(A.chest, A.top + 34, u)] }; p.headTilt = -0.16 * u; p.jump += u * 4; p.expr = 'serene'; },   // the universe aligned
  shaka(p, t, k, A) { p.hands = { r: [62, A.sh - 14 + Math.sin(t * 12) * 5], l: atSide(A, -1) }; p.handShape = { r: 'shaka' }; p.lean = Math.sin(t * 3) * 0.04; p.expr = 'chill'; },
  surfStance(p, t, k, A) { const s = Math.sin(t * 4); p.crouch = 0.3; p.hands = { r: [70, A.sh + 4 + s * 10], l: [-62, A.sh + 4 - s * 10] }; p.lean = s * 0.07; p.expr = 'serene'; },
  levitate(p, t, k, A) { p.jump += 18 + Math.sin(t * 3) * 6; p.crouch = 0.22; p.hands = { r: [56, A.hip - 12], l: [-50, A.hip - 12] }; p.expr = 'mystic'; },   // On Fire signature: simply floats
  letItGo(p, t, k, A) { p.hands = { r: [40, A.hip + 2 + Math.sin(t * 3) * 4], l: [-30, A.hip + 4] }; p.headTilt = -0.08; p.expr = 'chill'; },
  bowToRim(p, t, k, A) { p.hands = { r: [32, A.chest - 4], l: [26, A.chest - 2] }; p.headTilt = 0.26; p.crouch = 0.08; p.expr = 'serene'; },
  doubleShaka(p, t, k, A) { const s = Math.sin(t * 10) * 6; p.hands = { r: [60, A.sh - 20 + s], l: [-50, A.sh - 20 - s] }; p.handShape = { r: 'shaka', l: 'shaka' }; p.lean = Math.sin(t * 5) * 0.06; p.jump += bounce(t, 5) * 5 * k; p.expr = 'serene'; },

  // ---- The Dark Horse: says nothing, feels everything
  rear(p, t, k) {   // rears up on the hind legs
    const up = Math.abs(Math.sin(t * 7));
    p.lean = -0.3 * Math.min(1, k) * up; p.jump += up * 14 * k;
    p.hands = { r: [44, -188 - up * 22], l: [-30, -184 - up * 22] };
  },
  rampage(p, t, k) {     // On Fire signature: rears right back and paws the air
    const up = Math.abs(Math.sin(t * 6));
    p.lean = -0.42 * up; p.jump += up * 26;
    p.hands = { r: [52, -210 - up * 30 + Math.sin(t * 24) * 10], l: [-40, -205 - up * 30 - Math.sin(t * 24) * 10] };
    p.headShake = Math.sin(t * 40) * 2.5;
  },
  coldNod(p, t, k, A) { p.hands = { r: [-8, A.sh + 20], l: [12, A.sh + 24] }; p.headTilt = 0.12 * Math.sin(Math.min(Math.PI, t * 7)); p.expr = 'neutral'; },
  slowFist(p, t, k, A) { p.hands = { r: [34, lerp(A.sh + 10, A.top + 12, Math.min(1, t * 2.5))], l: atSide(A, -1) }; p.expr = 'hype'; },
  chestBeat(p, t, k, A) { const s = Math.sin(t * 18); p.hands = { r: [16 + Math.max(0, s) * 16, A.sh + 16], l: [-4 - Math.max(0, -s) * 16, A.sh + 18] }; p.jump += Math.abs(s) * 5 * k; p.headShake = s * 1.5; p.expr = 'hype'; },
  pawGround(p, t, k, A) { p.lean = 0.1; p.crouch = 0.1 + bounce(t, 14) * 0.15; p.hands = { r: [44, A.sh + 4], l: [-30, A.sh + 4] }; p.expr = 'hype'; },
  stomp(p, t, k, A) { p.crouch = bounce(t, 14) * 0.25; p.headShake = Math.sin(t * 30) * 2; p.hands = { r: [32, A.hip + 6], l: [-32, A.hip + 6] }; p.expr = 'angry'; },
  rearFury(p, t, k, A) { const up = bounce(t, 6); p.lean = -0.3 * up; p.jump += up * 16; p.hands = { r: [52, A.sh + 28], l: [-46, A.sh + 28] }; p.headShake = Math.sin(t * 40) * 2.5; p.expr = 'angry'; },
  snortStill(p, t, k, A) { p.hands = { r: [A.tw / 2 + 4, A.hip + 8], l: [-A.tw / 2 - 4, A.hip + 8] }; p.headTilt = 0.28; p.expr = 'neutral'; },
  rearWide(p, t, k, A) { const up = bounce(t, 5); p.lean = -0.36 * up; p.jump += 18 * up; p.hands = { r: [62, A.top + 30], l: [-56, A.top + 30] }; p.expr = 'crazed'; },
  turnAway(p, t, k, A) { p.back = true; p.hands = { r: atSide(A, 1), l: atSide(A, -1) }; p.headTilt = 0.12; p.expr = 'neutral'; },
};

/**
 * Pose a character for a reaction. `emote.name` is one of REACTION_MOMENTS; positive moments get louder with Heat
 * (and On Fire makes switch to the character's signature fire move). Older emotes without a name still work.
 */
export function applyEmote(def, p, emote, heat) {
  const t = emote.t, A = anchors(def);
  if (emote.name) {
    const h = emote.heat ?? heat, pos = POSITIVE.has(emote.name);
    let name = emote.name;
    if (pos && h >= 3 && (name === 'make' || name === 'perfect')) name = 'fire';   // On Fire: every make is the signature move
    const gesture = EMOTES[(def.reactions || {})[name]] || EMOTES[DEFAULT_REACTIONS[name]] || EMOTES.fistpump;
    const k = pos ? 0.6 + h * 0.35 + (emote.tier === 'perfect' ? 0.2 : 0) - (emote.tier === 'ok' ? 0.15 : 0) : 1;
    p.expr = pos ? 'happy' : 'sad';
    gesture(p, t, k, A);
    if (pos) {                                       // Heat layer: bouncier, wilder face, then losing their mind
      if (h >= 1) p.jump += (def.calm ? (0.5 - 0.5 * Math.cos(t * 4)) * 3 : bounce(t, 12) * 4) * h;   // the calm ones float instead
      if (h >= 2 && (p.expr === 'happy' || p.expr === 'neutral')) p.expr = 'hype';
      if (h >= 3) { p.expr = 'crazed'; p.headShake = p.headShake || Math.sin(t * 46) * 3.5; }
    }
    return;
  }
  if (emote.type === 'celebrate') {
    const k = 0.55 + heat * 0.38 + (emote.tier === 'perfect' ? 0.25 : 0);
    const name = heat >= 3 && def.fireEmote ? def.fireEmote : def.emote;   // On Fire: each character's signature move
    (EMOTES[name] || EMOTES.fistpump)(p, t, k, A);
    p.expr = heat >= 3 ? 'crazed' : (heat >= 2 || emote.tier === 'perfect') ? 'hype' : 'happy';
    if (heat >= 3) { p.headShake = p.headShake || Math.sin(t * 46) * 3.5; p.jump += Math.abs(Math.sin(t * 17)) * 8; }
  } else if (emote.type === 'sad') {
    p.crouch = Math.max(p.crouch, 0.18); p.lean = 0.14; p.headTilt = 0.22;
    p.hands = emote.big ? { r: [20, -205], l: [-14, -205] } : { r: [34, -62], l: [-20, -62] };
    p.expr = emote.big ? 'shock' : 'sad';
  }
}

// ---------- body language between the reactions ----------
// How each character stands, sets up, jogs and plants. These only touch head, face and the free hands:
// during the shot the hands hold the ball where the game puts it, so no motion here can move the ball or the timing.
// phase: 'idle' (menu), 'set' (grab + meter), 'jog' (between racks, extra.sw = stride), 'plant' (extra.v = 0..1)
const MOTIONS = {
  march: {   // White Knight: chin up, marches to the next spot like it's a battle line
    idle(p) { p.headTilt = -0.07; p.expr = 'stern'; },
    set(p) { p.headTilt = (p.headTilt || 0) - 0.06; },
    jog(p, t, A, { sw }) { const s = Math.sin(t * 11); p.lean = 0.02; p.jump = Math.abs(s) * 5; p.headTilt = -0.06; p.expr = 'stern'; p.hands = { r: [30 + s * 16, A.chest + 6 - Math.max(0, s) * 26], l: [-8 - s * 16, A.chest + 6 - Math.max(0, -s) * 26] }; },
    plant(p, t, A, { v }) { p.headTilt = -0.06; p.crouch *= 1.15; p.expr = 'stern'; },
  },
  calc: {    // Tech Guy: stiff, deliberate, quick little re-alignments of the head
    idle(p, t) { p.headTilt = 0.08 * Math.sign(Math.sin(t * 1.7)); p.expr = 'calc'; },
    set(p, t) { p.headTilt = (p.headTilt || 0) + 0.05 * Math.sign(Math.sin(t * 2.6)); },
    jog(p, t, A) { const s = Math.sin(t * 16); p.lean = 0.04; p.jump = Math.abs(s) * 2; p.expr = 'calc'; p.hands = { r: [24 + s * 10, A.chest + 2], l: [-6 - s * 10, A.chest + 2] }; },
    plant(p, t, A, { v }) { p.crouch *= 0.6; p.headTilt = 0.08; p.expr = 'calc'; },
  },
  glide: {   // Himmy: loose, unhurried, hair doing most of the moving
    idle(p, t) { p.headTilt = Math.sin(t * 1.4) * 0.08; p.expr = 'chill'; },
    set(p, t) { p.headTilt = (p.headTilt || 0) + Math.sin(t * 1.6) * 0.05; },
    jog(p, t, A) { const s = Math.sin(t * 7); p.lean = -0.03; p.jump = (0.5 + 0.5 * s) * 6; p.expr = 'chill'; p.hands = { r: [28 + s * 10, A.hip + 2], l: [-20 - s * 10, A.hip + 4] }; },
    plant(p, t, A, { v }) { p.crouch *= 0.7; p.headTilt = Math.sin(t * 1.6) * 0.06; p.expr = 'serene'; },
  },
  prowl: {   // The Dark Horse: head low, glaring from under the brow, a heavy gallop and a slow lift of the head on the plant
    idle(p, t) { p.headTilt = 0.12 + Math.sin(t * 0.9) * 0.03; p.expr = 'neutral'; },
    set(p) { p.headTilt = (p.headTilt || 0) + 0.08; },
    jog(p, t, A) { const s = Math.sin(t * 9); p.lean = 0.18; p.jump = Math.abs(s) * 4; p.headTilt = 0.1; p.expr = 'neutral'; p.hands = { r: [30 + s * 8, A.chest + 4], l: [-8 - s * 8, A.chest + 4] }; },
    plant(p, t, A, { v }) { p.crouch *= 1.25; p.headTilt = 0.14 * (1 - v); p.expr = 'focus'; },
  },
};

/** Layer a character's own body language onto a pose for one phase (see MOTIONS). Safe for characters without one. */
export function stylePose(def, p, phase, t, extra = {}) {
  const f = (MOTIONS[def.motion] || {})[phase];
  if (f) f(p, t, anchors(def), extra);
  return p;
}

// ---------- rig ----------
function ik(sx, sy, hx, hy, a, b, dir) {
  let dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy) || 0.001;
  const max = a + b - 1;
  if (d > max) { hx = sx + (dx / d) * max; hy = sy + (dy / d) * max; d = max; dx = hx - sx; dy = hy - sy; }
  const A = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const ang = Math.atan2(dy, dx) + dir * A;
  return { ex: sx + Math.cos(ang) * a, ey: sy + Math.sin(ang) * a, hx, hy };
}

function strokePath(ctx, pts, w, color, outline = true) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  if (outline) { ctx.strokeStyle = OUT; ctx.lineWidth = w + 5; ctx.stroke(); }
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
}

/** Centaur lower half: tail, four legs with hooves and a barrel body. Replaces the human legs. */
function drawHorse(ctx, def, hipY, cr, back, t) {
  const k = def.build.horse || 1, lw = 11 * k;
  const coat = def.coat || '#3a2e40', hoof = def.outfit.shoes, mane = def.hair.color, sway = Math.sin(t * 2.2) * 5;
  const leg = (hx, fx, bend) => {
    ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx, hipY + 8); ctx.quadraticCurveTo((hx + fx) / 2 + bend, hipY / 2, fx, -8);
    ctx.strokeStyle = OUT; ctx.lineWidth = lw + 5; ctx.stroke(); ctx.strokeStyle = coat; ctx.lineWidth = lw; ctx.stroke();
    rr(ctx, fx - 8 * k, -12, 16 * k, 12, 4); fillStroke(ctx, hoof, 2.5);
  };
  const tail = (x, y, dx) => {
    ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + dx * 1.4 + sway, y + 14, x + dx + sway * 1.6, y + 54);
    ctx.strokeStyle = OUT; ctx.lineWidth = 15; ctx.stroke(); ctx.strokeStyle = mane; ctx.lineWidth = 10; ctx.stroke();
  };
  if (back) {            // seen from behind: rump toward the camera, tail down the middle
    leg(-19 * k, -21 * k, 0); leg(19 * k, 21 * k, 0);
    ctx.beginPath(); ctx.ellipse(0, hipY + 4, 37 * k, 27 * k, 0, 0, 7); fillStroke(ctx, coat, 3);
    tail(0, hipY - 8, 3);
    return;
  }
  tail(-62 * k, hipY - 4, -18);
  leg(-52 * k, -58 * k, -cr * 14); leg(8, 4, cr * 16);                    // far-side legs
  ctx.beginPath(); ctx.ellipse(-22 * k, hipY + 4, 44 * k, 23 * k, 0, 0, 7); fillStroke(ctx, coat, 3);
  ctx.fillStyle = 'rgba(255,150,80,.2)'; ctx.beginPath(); ctx.ellipse(-26 * k, hipY - 8 * k, 30 * k, 7, 0, 0, 7); ctx.fill();   // rim light along the back
  leg(-40 * k, -44 * k, -cr * 14); leg(20, 22, cr * 16);                   // near-side legs
}

const SLEEVES = { armor: 'long', techshirt: 'short', hawaiian: 'short' };

const ARM = 43;   // upper arm and forearm length

/** Local Y of the highest point a hand can reach overhead (used to place the shot's set point). */
export function reachTop(def) { return -(def.build.leg + def.build.torsoH - 18) - (ARM * 2 - 6); }

/** Simple finger shapes, drawn before the hand so the fist covers their roots. Directions are in rig space (up = -y). */
const FINGERS = { point: [[0.35, -1]], peace: [[-0.3, -1], [0.3, -1]], shaka: [[-0.8, -0.7], [0.95, 0.25]] };

/** `out` = which side this arm belongs to (-1 back/left, +1 front/right). The elbow always bends away from the body. */
function drawArm(ctx, def, sx, sy, hand, out, shape, back) {
  const a = ik(sx, sy, hand[0], hand[1], ARM, ARM, 1), b = ik(sx, sy, hand[0], hand[1], ARM, ARM, -1);
  const j = (a.ex - b.ex) * out >= 0 ? a : b;
  const o = def.outfit, sl = o.sleeve || SLEEVES[o.top] || 'none', col = o.topColor;
  const aw = def.build.armW || 11, handCol = o.hands || def.skin, hr = aw > 13 ? 9 : aw < 10 ? 6 : 7;
  strokePath(ctx, [sx, sy, j.ex, j.ey, j.hx, j.hy], aw, sl === 'long' ? col : def.skin);
  if (aw > 13 && sl !== 'long') strokePath(ctx, [sx, sy, (sx * 0.35 + j.ex * 0.65), (sy * 0.35 + j.ey * 0.65)], aw + 4, def.skin, false);   // bulging upper arm
  if (sl === 'short') strokePath(ctx, [sx, sy, (sx + j.ex) / 2, (sy + j.ey) / 2], aw + 3, col, false);
  if (def.armored) {   // elbow plate and a shoulder plate far too big to shoot in
    circ(ctx, j.ex, j.ey, 8); fillStroke(ctx, col, 2.5);
  }
  if (def.armored && (back || out < 0)) {   // facing us, the near shoulder plate would sit right under the chin, so only the far one shows
    const px = sx + out * 7, py = sy + 13;   // sits below the chin and out to the side: on these rigs shoulder height is chin height
    ctx.beginPath(); ctx.ellipse(px, py, 15, 10, out * 0.35, 0, 7); fillStroke(ctx, col, 3);
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(px, py + 4, 13, 7, out * 0.35, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px - 2, py - 3, 9, 5, out * 0.35, 1.1 * Math.PI, 1.7 * Math.PI); ctx.stroke();
  }
  for (const [fx, fy] of FINGERS[shape] || []) strokePath(ctx, [j.hx, j.hy, j.hx + fx * (hr + 7), j.hy + fy * (hr + 7)], 4.5, handCol);
  circ(ctx, j.hx, j.hy, hr); fillStroke(ctx, handCol, 2.5);
}

// Front-view torso details, drawn over the torso fill. (ctx, def, torsoW, shoulderY, hipY, t)
const TOPS = {
  armor(ctx, d, tw, shY, hipY) {
    const o = d.outfit;
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-tw * 0.18, shY + 16, 10, 7, -0.4, 0, 7); ctx.fill();   // shine on the breastplate
    ctx.beginPath(); ctx.moveTo(-tw * 0.22, shY + 8); ctx.lineTo(tw * 0.36, shY + 8); ctx.lineTo(tw * 0.32, hipY + 4); ctx.lineTo(4, hipY + 14); ctx.lineTo(-tw * 0.18, hipY + 4); ctx.closePath();
    fillStroke(ctx, o.tabard, 2.5);                                                                                                // tabard
    ctx.strokeStyle = o.trim; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-tw * 0.15, shY + 13); ctx.lineTo(tw * 0.29, shY + 13); ctx.stroke();
    const cx = 6, cy = (shY + hipY) / 2 + 2;                                                                                       // crest: a basketball on a shield
    ctx.beginPath(); ctx.moveTo(cx - 12, cy - 12); ctx.lineTo(cx + 12, cy - 12); ctx.lineTo(cx + 12, cy + 2); ctx.quadraticCurveTo(cx + 10, cy + 12, cx, cy + 16); ctx.quadraticCurveTo(cx - 10, cy + 12, cx - 12, cy + 2); ctx.closePath();
    fillStroke(ctx, o.trim, 2);
    circ(ctx, cx, cy, 6.5); fillStroke(ctx, '#ff8a1f', 2);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx - 6.5, cy); ctx.lineTo(cx + 6.5, cy); ctx.moveTo(cx, cy - 6.5); ctx.lineTo(cx, cy + 6.5); ctx.stroke();
    rr(ctx, -tw / 2 + 2, hipY - 10, tw - 4, 8, 3); fillStroke(ctx, '#7a5230', 2);                                                 // sword belt
    rr(ctx, 0, hipY - 11, 10, 10, 2); fillStroke(ctx, o.trim, 2);
    ctx.beginPath(); ctx.ellipse(4, shY + 2, 16, 6, 0, 0, Math.PI); fillStroke(ctx, d.helm || o.topColor, 2.5);                    // gorget
  },
  techshirt(ctx, d, tw, shY, hipY) {
    const o = d.outfit;
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(5, shY + 4); ctx.lineTo(5, hipY - 2); ctx.stroke();                                              // button placket
    ctx.fillStyle = OUT; for (let i = 0; i < 3; i++) { circ(ctx, 8, shY + 16 + i * 14, 1.6); ctx.fill(); }
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(5, shY + 1); ctx.lineTo(5 + s * 11, shY + 1); ctx.lineTo(5 + s * 6, shY + 11); ctx.closePath(); fillStroke(ctx, o.topColor, 2); }   // collar
    rr(ctx, -tw / 2 + 5, shY + 18, 11, 12, 2); fillStroke(ctx, '#ffffff', 2);                                                    // pocket protector + pens
    for (const [i, c] of [[0, '#e83f5b'], [1, '#3b82f6'], [2, '#2b1e3a']]) { rr(ctx, -tw / 2 + 6 + i * 3.4, shY + 12, 2.6, 9, 1); ctx.fillStyle = c; ctx.fill(); }
    ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.lineCap = 'round';                                                             // backpack straps
    ctx.beginPath(); ctx.moveTo(tw / 2 - 7, shY + 2); ctx.lineTo(tw / 2 - 6, hipY - 16); ctx.stroke();
    ctx.strokeStyle = o.pack; ctx.lineWidth = 4.5; ctx.stroke();
  },
  hawaiian(ctx, d, tw, shY, hipY) {
    const o = d.outfit;
    rr(ctx, -1, shY + 2, 15, hipY - shY - 2, 4); fillStroke(ctx, o.tank, 2);                                                    // tank top under the open shirt
    const flower = (x, y, r) => { ctx.fillStyle = o.flower; for (let i = 0; i < 5; i++) { const a = i * 1.2566; circ(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75); ctx.fill(); } ctx.fillStyle = '#ff6fa8'; circ(ctx, x, y, r * 0.6); ctx.fill(); };
    flower(-tw / 2 + 9, shY + 18, 3.6); flower(-tw / 2 + 13, shY + 44, 3.2); flower(tw / 2 - 6, shY + 26, 3.2); flower(-tw / 2 + 6, hipY - 8, 2.8);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(6 + s * 7, shY + 1); ctx.lineTo(6 + s * 15, shY + 2); ctx.lineTo(6 + s * 8, shY + 20); ctx.closePath(); fillStroke(ctx, o.topColor, 2); }   // open collar
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-6, shY + 6); ctx.quadraticCurveTo(6, shY + 20, 18, shY + 6); ctx.stroke();   // shell necklace
    ctx.fillStyle = '#fffaf0'; for (let i = 0; i <= 6; i++) { const u = i / 6, x = lerp(-6, 18, u), y = shY + 6 + Math.sin(u * Math.PI) * 7; circ(ctx, x, y, 2.2); ctx.fill(); }
  },
  bare(ctx, d, tw, shY, hipY) {
    const cx = 3, line = 'rgba(10,4,8,.5)';
    ctx.fillStyle = 'rgba(255,170,110,.13)'; ctx.beginPath(); ctx.ellipse(cx - 12, shY + 18, 13, 9, -0.2, 0, 7); ctx.ellipse(cx + 14, shY + 18, 13, 9, 0.2, 0, 7); ctx.fill();   // sheen on the chest
    ctx.strokeStyle = line; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx - 13, shY + 14, 15, 0.25 * Math.PI, 0.8 * Math.PI); ctx.stroke();        // pecs
    ctx.beginPath(); ctx.arc(cx + 13, shY + 14, 15, 0.2 * Math.PI, 0.75 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, shY + 12); ctx.lineTo(cx, hipY - 6); ctx.stroke();                    // centre line
    for (let i = 0; i < 3; i++) { const y = shY + 36 + i * 10; ctx.beginPath(); ctx.moveTo(cx - 11, y); ctx.lineTo(cx - 3, y + 1); ctx.moveTo(cx + 3, y + 1); ctx.lineTo(cx + 11, y); ctx.stroke(); }   // abs
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 2;                                          // old scar
    ctx.beginPath(); ctx.moveTo(cx - 20, shY + 8); ctx.lineTo(cx - 6, shY + 26); ctx.stroke();
  },
};

// Back-view torso details: this is what the player looks at for most of a game, so each one must read on its own.
const BACK_TOPS = {
  armor(ctx, d, tw, shY, hipY, t) {   // a cape, of course
    const o = d.outfit, s = Math.sin(t * 2.2) * 4, w0 = tw / 2 + 4, w1 = tw / 2 + 14, y1 = hipY + 34;
    ctx.beginPath(); ctx.moveTo(-w0, shY + 4); ctx.lineTo(w0, shY + 4);
    ctx.quadraticCurveTo(w1 + 2, (shY + y1) / 2, w1 + s, y1);
    ctx.quadraticCurveTo(w1 / 2 + s, y1 - 7, s * 0.5, y1 + 2); ctx.quadraticCurveTo(-w1 / 2 + s, y1 - 7, -w1 + s, y1);
    ctx.quadraticCurveTo(-w1 - 2, (shY + y1) / 2, -w0, shY + 4); ctx.closePath();
    fillStroke(ctx, o.cape, 3);
    ctx.strokeStyle = o.trim; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w1 - 4 + s, y1 - 6); ctx.quadraticCurveTo(w1 / 2 + s, y1 - 13, s * 0.5, y1 - 4); ctx.quadraticCurveTo(-w1 / 2 + s, y1 - 13, -w1 + 4 + s, y1 - 6); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, shY + 14); ctx.lineTo(-10 + s, y1 - 10); ctx.moveTo(10, shY + 14); ctx.lineTo(12 + s, y1 - 10); ctx.stroke();   // folds
    const cy = (shY + hipY) / 2;                                                                                                  // the crest again, on the cape
    circ(ctx, 0, cy, 9); fillStroke(ctx, '#ff8a1f', 2.5);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-9, cy); ctx.lineTo(9, cy); ctx.moveTo(0, cy - 9); ctx.lineTo(0, cy + 9); ctx.stroke();
  },
  techshirt(ctx, d, tw, shY, hipY) {   // a full backpack, worn to a shooting contest
    const o = d.outfit, w = tw * 1.12, h = (hipY - shY) * 0.8, x = -w / 2, y = shY + 6;
    ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, y + 2, 7, Math.PI, 0); ctx.stroke();                    // grab loop
    rr(ctx, x, y, w, h, 11); fillStroke(ctx, o.pack, 3);
    rr(ctx, x + 6, y + h * 0.5, w - 12, h * 0.42, 7); fillStroke(ctx, '#3d4f80', 2.5);                                            // front pocket
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 9, y + h * 0.5 + 5); ctx.lineTo(x + w - 9, y + h * 0.5 + 5); ctx.stroke();
    circ(ctx, w * 0.22, y + h * 0.26, 6); fillStroke(ctx, '#7ee8ff', 2);                                                          // sticker
    ctx.fillStyle = OUT; ctx.font = `900 9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('π', w * 0.22, y + h * 0.26 + 0.5);
  },
  hawaiian(ctx, d, tw, shY, hipY) {
    const o = d.outfit, cx = 0, cy = (shY + hipY) / 2 - 4;
    const small = (x, y, r) => { ctx.fillStyle = o.flower; for (let i = 0; i < 5; i++) { const a = i * 1.2566; circ(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75); ctx.fill(); } ctx.fillStyle = '#ff6fa8'; circ(ctx, x, y, r * 0.6); ctx.fill(); };
    small(-tw / 2 + 9, shY + 14, 3.4); small(tw / 2 - 9, shY + 20, 3.4); small(-tw / 2 + 8, hipY - 10, 3); small(tw / 2 - 8, hipY - 14, 3);
    for (let i = 0; i < 5; i++) { const a = i * 1.2566 - Math.PI / 2; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, 8, 5.5, a, 0, 7); fillStroke(ctx, '#ff6fa8', 1.8); }   // big hibiscus
    circ(ctx, cx, cy, 4); fillStroke(ctx, o.flower, 1.5);
  },
  bare(ctx, d, tw, shY, hipY) {
    ctx.strokeStyle = 'rgba(10,4,8,.5)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, shY + 8); ctx.lineTo(0, hipY - 8); ctx.stroke();                       // spine
    ctx.beginPath(); ctx.arc(-15, shY + 22, 13, -0.3 * Math.PI, 0.5 * Math.PI); ctx.stroke();             // shoulder blades
    ctx.beginPath(); ctx.arc(15, shY + 22, 13, 0.5 * Math.PI, 1.3 * Math.PI); ctx.stroke();
  },
};

// Hair: back() draws behind the head, front() over the face side, over() on top of everything on the head
// (helmets). All get (ctx, def, rx, ry, o) with o = { t, flow, lift, back }: flow < 0..1+ pushes hair backwards
// (wind, lean), lift raises it on a jump. `mirrorBack` draws back() on both sides in the behind view.
const HAIR = {
  helm: {   // White Knight: blonde hair spilling out of a grey helmet with a plume
    mirrorBack: true,
    back(ctx, d, rx, ry, o) {
      const f = o.flow * 6;
      ctx.beginPath(); ctx.moveTo(-rx * 0.3, -ry * 0.55);
      ctx.quadraticCurveTo(-rx * 1.35, -ry * 0.4, -rx * 1.25 - f, ry * 0.5);
      ctx.quadraticCurveTo(-rx * 1.3 - f * 1.4, ry * 1.0, -rx * 1.0 - f * 1.6, ry * 1.25);
      ctx.quadraticCurveTo(-rx * 0.85 - f, ry * 0.95, -rx * 0.6 - f, ry * 1.1);
      ctx.quadraticCurveTo(-rx * 0.5, ry * 0.6, -rx * 0.1, ry * 0.5); ctx.closePath();
      fillStroke(ctx, d.hair.color, 3);
    },
    over(ctx, d, rx, ry, o) {
      const steel = d.helm, f = o.flow * 6, sway = Math.sin(o.t * 2.6) * 3;
      if (o.back) {
        ctx.beginPath(); ctx.ellipse(0, -2, rx * 1.08, ry * 1.1, 0, Math.PI * 1.04, Math.PI * 1.96); ctx.closePath(); fillStroke(ctx, steel, 3);
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -2, rx * 0.8, ry * 0.85, 0, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
        rr(ctx, -6, -ry * 1.12, 12, ry * 0.95, 6); fillStroke(ctx, d.plume, 2.5);                                                 // the plume's crest, seen from behind
        ctx.beginPath(); ctx.moveTo(-9, -ry * 1.05); ctx.quadraticCurveTo(-14 + sway, -ry * 1.75, sway * 2, -ry * 1.9); ctx.quadraticCurveTo(14 + sway, -ry * 1.75, 9, -ry * 1.05); ctx.closePath();
        fillStroke(ctx, d.plume, 2.5);
        return;
      }
      ctx.fillStyle = d.hair.color;                                                                                                // fringe peeking out under the brim
      ctx.beginPath(); ctx.moveTo(-rx * 0.85, -ry * 0.25); ctx.lineTo(rx * 0.55, -ry * 0.55); ctx.lineTo(rx * 0.2, -ry * 0.3); ctx.lineTo(-rx * 0.1, -ry * 0.38); ctx.lineTo(-rx * 0.5, -ry * 0.12); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -2, rx * 1.08, ry * 1.1, 0, Math.PI * 0.96, Math.PI * 1.88);                                // dome
      ctx.lineTo(rx * 0.9, -ry * 0.48); ctx.lineTo(-rx * 0.7, -ry * 0.02); ctx.closePath(); fillStroke(ctx, steel, 3);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -2, rx * 0.82, ry * 0.85, 0, Math.PI * 1.2, Math.PI * 1.55); ctx.stroke();
      strokePath(ctx, [rx * 1.0, -ry * 0.56, -rx * 0.55, -ry * 0.12], 8, '#8d97a4');                                               // raised visor
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx * 0.75, -ry * 0.55); ctx.lineTo(rx * 0.1, -ry * 0.38); ctx.stroke();   // eye slit
      circ(ctx, -rx * 0.55, -ry * 0.12, 4); fillStroke(ctx, '#f2b632', 2);                                                        // hinge rivet
      ctx.beginPath(); ctx.moveTo(rx * 0.12, -ry * 1.06);                                                                          // plume: far too big
      ctx.quadraticCurveTo(rx * 0.05, -ry * 1.95, -rx * 0.9 - f + sway, -ry * 1.6);
      ctx.quadraticCurveTo(-rx * 1.55 - f * 1.5 + sway, -ry * 1.3, -rx * 1.8 - f * 2 + sway, -ry * 0.4);
      ctx.quadraticCurveTo(-rx * 1.15 - f, -ry * 0.95, -rx * 0.4, -ry * 1.0); ctx.closePath();
      fillStroke(ctx, d.plume, 2.5);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-rx * 0.1, -ry * 1.2); ctx.quadraticCurveTo(-rx * 0.9, -ry * 1.4, -rx * 1.5 - f + sway, -ry * 0.7); ctx.stroke();
    },
  },
  messy: {  // Tech Guy: hasn't thought about his hair since 2019
    mirrorBack: true,
    back(ctx, d, rx, ry) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) { const a = Math.PI * (0.88 + i * 0.075), r = i % 2 ? 1.22 : 1.0; const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r - 2; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.lineTo(0, 0); ctx.closePath(); fillStroke(ctx, d.hair.color, 3);
    },
    front(ctx, d, rx, ry) {
      ctx.fillStyle = d.hair.color;
      ctx.beginPath(); ctx.ellipse(-3, -ry * 0.5, rx * 0.98, ry * 0.56, -0.1, Math.PI, 0); ctx.closePath(); ctx.fill();
      for (const [x0, len, tip] of [[-rx * 0.2, 0.35, -4], [rx * 0.18, 0.5, 3], [rx * 0.5, 0.36, 6], [rx * 0.78, 0.22, 4]]) {      // uneven fringe
        ctx.beginPath(); ctx.moveTo(x0 - 9, -ry * 0.62); ctx.lineTo(x0 + 9, -ry * 0.62); ctx.lineTo(x0 + tip, -ry * 0.62 + ry * len); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(-rx * 0.1, -ry * 1.0); ctx.quadraticCurveTo(rx * 0.1, -ry * 1.45, rx * 0.35, -ry * 1.3); ctx.quadraticCurveTo(rx * 0.2, -ry * 1.15, rx * 0.25, -ry * 0.95); ctx.closePath(); fillStroke(ctx, d.hair.color, 2.5);   // the cowlick
    },
    over(ctx, d, rx, ry, o) { if (o.back) { ctx.beginPath(); ctx.moveTo(-4, -ry * 0.95); ctx.quadraticCurveTo(2, -ry * 1.5, 12, -ry * 1.32); ctx.quadraticCurveTo(6, -ry * 1.15, 8, -ry * 0.92); ctx.closePath(); fillStroke(ctx, d.hair.color, 2.5); } },
  },
  flow: {   // Himmy: the flow. Moves with wind, lean and every jump
    mirrorBack: true,
    back(ctx, d, rx, ry, o) {
      const f = o.flow * 10, L = o.lift * 14;
      ctx.beginPath(); ctx.moveTo(rx * 0.5, -ry * 0.95);
      ctx.bezierCurveTo(rx * 0.1, -ry * 1.55 - L, -rx * 1.2 - f * 0.5, -ry * 1.5 - L, -rx * 1.45 - f, -ry * 0.7 - L * 0.5);   // windswept over the top
      ctx.quadraticCurveTo(-rx * 1.75 - f * 1.3, ry * 0.3, -rx * 1.6 - f * 1.8, ry * 2.3 - L * 0.6);                            // long locks with ragged ends
      ctx.lineTo(-rx * 1.28 - f * 1.1, ry * 1.55 - L * 0.4);
      ctx.lineTo(-rx * 1.1 - f * 1.6, ry * 2.45 - L * 0.6);
      ctx.lineTo(-rx * 0.82 - f * 0.8, ry * 1.5 - L * 0.4);
      ctx.lineTo(-rx * 0.58 - f * 1.2, ry * 2.1 - L * 0.5);
      ctx.quadraticCurveTo(-rx * 0.35, ry * 1.1, rx * 0.05, ry * 0.35); ctx.closePath();
      fillStroke(ctx, d.hair.color, 3);
      ctx.strokeStyle = d.hair.tips; ctx.lineWidth = 3; ctx.lineCap = 'round';                                                     // sun-bleached streaks
      ctx.beginPath(); ctx.moveTo(-rx * 0.4, -ry * 1.25 - L); ctx.quadraticCurveTo(-rx * 1.35 - f, -ry * 0.8, -rx * 1.3 - f * 1.6, ry * 1.9 - L * 0.5);
      ctx.moveTo(-rx * 0.95, -ry * 1.05 - L); ctx.quadraticCurveTo(-rx * 1.0 - f * 1.2, ry * 0.2, -rx * 0.85 - f * 1.4, ry * 1.8 - L * 0.5); ctx.stroke();
    },
    front(ctx, d, rx, ry, o) {
      const f = o.flow * 6, L = o.lift * 8;
      ctx.fillStyle = d.hair.color;
      ctx.beginPath(); ctx.ellipse(-3, -ry * 0.52, rx * 1.0, ry * 0.56, -0.1, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-rx * 0.4, -ry * 0.95 - L);                                                                     // swooping bangs
      ctx.quadraticCurveTo(rx * 0.9 - f, -ry * 1.15 - L, rx * 1.08 - f, -ry * 0.22);
      ctx.quadraticCurveTo(rx * 0.62 - f, -ry * 0.5, rx * 0.15, -ry * 0.45); ctx.closePath(); fillStroke(ctx, d.hair.color, 2.5);
      ctx.strokeStyle = d.hair.tips; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-rx * 0.1, -ry * 0.9 - L); ctx.quadraticCurveTo(rx * 0.7 - f, -ry * 0.95 - L, rx * 0.92 - f, -ry * 0.35); ctx.stroke();
    },
    over(ctx, d, rx, ry, o) {
      if (!o.back) return;
      const f = Math.sin(o.t * 1.7) * 8 + o.flow * 4, L = o.lift * 10;                                                            // from behind: hangs down past the shoulders
      ctx.beginPath(); ctx.moveTo(-rx * 1.05, -ry * 0.3);
      ctx.bezierCurveTo(-rx * 1.4 + f, ry * 0.8, -rx * 1.25 + f * 1.4, ry * 1.5 - L, -rx * 0.95 + f * 1.8, ry * 2.0 - L);
      ctx.quadraticCurveTo(-rx * 0.45 + f * 1.6, ry * 1.6 - L, f * 1.8, ry * 2.1 - L);
      ctx.quadraticCurveTo(rx * 0.45 + f * 1.6, ry * 1.6 - L, rx * 0.95 + f * 1.8, ry * 2.0 - L);
      ctx.bezierCurveTo(rx * 1.25 + f * 1.4, ry * 1.5 - L, rx * 1.4 + f, ry * 0.8, rx * 1.05, -ry * 0.3);
      ctx.closePath(); fillStroke(ctx, d.hair.color, 3);
      ctx.strokeStyle = d.hair.tips; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-rx * 0.5, -ry * 0.6); ctx.quadraticCurveTo(-rx * 0.7 + f, ry * 0.9, -rx * 0.5 + f * 1.7, ry * 1.75 - L);
      ctx.moveTo(rx * 0.4, -ry * 0.6); ctx.quadraticCurveTo(rx * 0.55 + f, ry * 0.9, rx * 0.45 + f * 1.7, ry * 1.75 - L); ctx.stroke();
    },
  },
  mane: {
    mirrorBack: true,
    back(ctx, d, rx, ry) {
      // long wild mane streaming down behind the neck
      ctx.beginPath(); ctx.moveTo(rx * 0.3, -ry * 1.12);
      ctx.quadraticCurveTo(-rx * 1.5, -ry * 1.35, -rx * 1.35, ry * 0.2);
      ctx.quadraticCurveTo(-rx * 1.85, ry * 1.1, -rx * 1.2, ry * 2.0);
      ctx.quadraticCurveTo(-rx * 0.95, ry * 1.5, -rx * 0.6, ry * 1.75);
      ctx.quadraticCurveTo(-rx * 0.7, ry * 1.2, -rx * 0.15, ry * 0.7); ctx.closePath();
      fillStroke(ctx, d.hair.color, 3);
      for (const ex of [-rx * 0.55, rx * 0.35]) {   // ears
        ctx.beginPath(); ctx.moveTo(ex - 9, -ry * 0.7); ctx.quadraticCurveTo(ex - 6, -ry * 1.45, ex + 3, -ry * 1.62); ctx.quadraticCurveTo(ex + 11, -ry * 1.3, ex + 10, -ry * 0.75); ctx.closePath();
        fillStroke(ctx, d.coat || d.hair.color, 3);
        ctx.beginPath(); ctx.moveTo(ex - 3, -ry * 0.85); ctx.quadraticCurveTo(ex, -ry * 1.3, ex + 3, -ry * 1.42); ctx.quadraticCurveTo(ex + 6, -ry * 1.2, ex + 5, -ry * 0.88); ctx.closePath();
        ctx.fillStyle = '#6d4f5f'; ctx.fill();
      }
    },
    front(ctx, d, rx, ry) {
      ctx.fillStyle = d.hair.color;
      ctx.beginPath(); ctx.ellipse(-3, -ry * 0.55, rx * 0.97, ry * 0.52, -0.1, Math.PI, 0); ctx.closePath(); ctx.fill();
      for (const [x0, len] of [[-rx * 0.5, 0.5], [-rx * 0.1, 0.32], [rx * 0.3, 0.42], [rx * 0.62, 0.26]]) {   // loose strands over the brow
        ctx.beginPath(); ctx.moveTo(x0 - 8, -ry * 0.6); ctx.lineTo(x0 + 9, -ry * 0.6); ctx.lineTo(x0 + 3, -ry * 0.6 + ry * len); ctx.closePath(); ctx.fill();
      }
    },
  },
};

// Face-side accessories (front view) and their behind-view versions.
const ACCESSORIES = {
  chin(ctx, d, rx, ry) {   // a jaw built for oaths
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(rx * 0.6, ry * 0.8); ctx.lineTo(rx * 0.63, ry * 0.95); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-rx * 0.2, ry * 0.72); ctx.quadraticCurveTo(rx * 0.1, ry * 0.95, rx * 0.4, ry * 0.92); ctx.stroke();
  },
  headset(ctx, d, rx, ry) {
    const dark = '#2b2f3a';
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-rx * 0.86, -6); ctx.quadraticCurveTo(-rx * 0.85, -ry * 1.15, -rx * 0.05, -ry * 1.12); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-rx * 0.7, 10); ctx.quadraticCurveTo(-rx * 0.05, ry * 0.9, rx * 0.36, ry * 0.68); ctx.stroke();   // mic boom
    circ(ctx, rx * 0.38, ry * 0.68, 3.8); fillStroke(ctx, dark, 2);
    rr(ctx, -rx * 0.86 - 9, -9, 18, 24, 7); fillStroke(ctx, dark, 2.5);                                                          // ear cup
    ctx.fillStyle = '#58e0ff'; circ(ctx, -rx * 0.86, 3, 3); ctx.fill();
  },
  scruff(ctx, d, rx, ry) {   // a few days of beach stubble along the jaw, and a little chin patch
    ctx.fillStyle = 'rgba(70,40,20,.55)';
    for (let i = 0; i < 22; i++) { const a = 0.02 * Math.PI + i * 0.042 * Math.PI, r = 0.8 + (i % 3) * 0.06; circ(ctx, Math.cos(a) * rx * r, Math.sin(a) * ry * r, 1.6); ctx.fill(); }
    ctx.fillStyle = d.hair.color; ctx.beginPath(); ctx.ellipse(rx * 0.44, ry * 0.86, 6, 4, 0.2, 0, 7); ctx.fill();
  },
};
const ACC_BACK = {
  headset(ctx, d, rx, ry) {
    const dark = '#2b2f3a';
    ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.98, ry * 1.08, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = 4; ctx.stroke();
    for (const s of [-1, 1]) { rr(ctx, s * rx * 0.98 - 8, -8, 16, 22, 7); fillStroke(ctx, dark, 2.5); }
  },
};

// Back-of-head hair for the behind-the-shooter view: [top, bottom] of the hair as fractions of head height, or null for bald.
const BACK_HAIR = { helm: [-0.4, 1], messy: [-1, 0.3], flow: [-1, 1], mane: [-1, 1] };

const GLYPHS = ['π', 'Σ', '√', '∫', '%', 'Δ', 'x²', 'θ'];
/** Tech Guy thinking: little equations rise off his head. More of them, faster, when he loses it. */
function drawGlyphs(ctx, rx, ry, t, n) {
  const flipped = ctx.getTransform().a < 0;
  ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const u = (t * (n > 3 ? 1.4 : 0.7) + i / n) % 1, x = rx * (-0.9 + 1.8 * ((i * 0.618 + 0.3) % 1)) + Math.sin(t * 3 + i) * 4, y = -ry * 1.35 - u * 34;
    ctx.save(); ctx.globalAlpha = Math.sin(u * Math.PI); ctx.translate(x, y); if (flipped) ctx.scale(-1, 1);
    ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.strokeText(GLYPHS[(i + Math.floor(t * 0.7)) % GLYPHS.length], 0, 0);
    ctx.fillStyle = '#7ee8ff'; ctx.fillText(GLYPHS[(i + Math.floor(t * 0.7)) % GLYPHS.length], 0, 0);
    ctx.restore();
  }
}

function drawFace(ctx, def, rx, ry, expr, t) {
  const x1 = rx * 0.12, x2 = rx * 0.66, ey = -ry * 0.12, mx = rx * 0.42, my = ry * 0.46;
  const glow = def.eyeGlow;
  const halo = (x, r) => { const g = ctx.createRadialGradient(x, ey, 0, x, ey, r * 3.2); g.addColorStop(0, glow); g.addColorStop(1, 'rgba(255,90,30,0)'); ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 5); ctx.fillStyle = g; circ(ctx, x, ey, r * 3.2); ctx.fill(); ctx.globalAlpha = 1; };
  const dot = (x, r) => { if (glow) { halo(x, r); ctx.fillStyle = glow; circ(ctx, x, ey, r + 0.6); ctx.fill(); ctx.fillStyle = '#ffe9b0'; circ(ctx, x, ey, r * 0.4); ctx.fill(); return; } ctx.fillStyle = OUT; circ(ctx, x, ey, r); ctx.fill(); };
  const big = (x, r, pr, jx = 0, jy = 0) => { if (glow) halo(x, r * 0.8); circ(ctx, x, ey, r); fillStroke(ctx, glow || '#fff', 2.2); ctx.fillStyle = OUT; circ(ctx, x + r * 0.2 + jx, ey + jy, glow ? pr * 0.7 : pr); ctx.fill(); };
  const brow = (x, a, b, lift = 0) => { ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 6, ey - 10 - lift + a); ctx.lineTo(x + 6, ey - 10 - lift + b); ctx.stroke(); };
  const line = (ax, ay, bx, by, w = 3) => { ctx.strokeStyle = OUT; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); };
  const closedEye = (x, down) => { ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.beginPath(); down ? ctx.arc(x, ey - 3, 5, 0.15 * Math.PI, 0.85 * Math.PI) : ctx.arc(x, ey + 2, 5, Math.PI, 0); ctx.stroke(); };
  const smile = (r, w = 3) => { ctx.strokeStyle = OUT; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(mx, my - 5, r, 0.22 * Math.PI, 0.78 * Math.PI); ctx.stroke(); };
  const openMouth = (w, h) => {
    ctx.beginPath(); ctx.ellipse(mx, my + h * 0.3, w, h, 0, 0, 7); fillStroke(ctx, '#5a1a2b', 2.5);
    ctx.save(); ctx.clip(); ctx.fillStyle = '#ff7a8a'; ctx.beginPath(); ctx.ellipse(mx, my + h * 1.05, w * 0.8, h * 0.55, 0, 0, 7); ctx.fill();
    if (h > 11) { ctx.fillStyle = '#fff'; ctx.fillRect(mx - w, my - h * 0.75, w * 2, h * 0.42); }
    ctx.restore();
  };
  ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.lineCap = 'round';
  switch (expr) {
    case 'focus':
      dot(x1, 3.4); dot(x2, 3.2); brow(x1, -2, 3); brow(x2, -2, 3);
      ctx.beginPath(); ctx.moveTo(mx - 6, my); ctx.lineTo(mx + 6, my); ctx.stroke();
      if (!def.brood) { ctx.fillStyle = '#ff7a8a'; ctx.beginPath(); ctx.arc(mx + 4, my + 1, 4.5, 0, Math.PI); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); }   // concentrating tongue (the beast keeps his in)
      break;
    case 'happy':
      if (def.brood) {
        dot(x1, 3.6); dot(x2, 3.4); brow(x1, -2, 4, -4); brow(x2, -2, 4, -4);
        rr(ctx, mx - 9, my - 4, 19, 9, 3); fillStroke(ctx, '#f4efe6', 2.5);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 1; i < 4; i++) { ctx.moveTo(mx - 9 + i * 4.75, my - 4); ctx.lineTo(mx - 9 + i * 4.75, my + 5); } ctx.stroke();
        break;
      }
      closedEye(x1); closedEye(x2);
      ctx.beginPath(); ctx.arc(mx, my - 3, 9, 0, Math.PI); ctx.closePath(); fillStroke(ctx, '#5a1a2b', 2.5);
      break;
    case 'hype':
      big(x1, 7, 2.8); big(x2, 6.5, 2.6); brow(x1, 0, 0, 6); brow(x2, 0, 0, 6); openMouth(9, 10);
      break;
    case 'crazed': {
      const j = Math.sin(t * 40) * 1.5;
      big(x1, 10, 1.9, j, -j); big(x2, 7, 1.7, -j, j); openMouth(12, 14);
      break;
    }
    case 'sad':
      dot(x1, 3.2); dot(x2, 3); brow(x1, 2, -3); brow(x2, -3, 2);
      ctx.beginPath(); ctx.arc(mx, my + 9, 8, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
      ctx.fillStyle = '#7fd3ff'; ctx.beginPath(); ctx.ellipse(-rx * 0.55, -ry * 0.3 + ((t * 30) % 14), 3.5, 5.5, 0, 0, 7); ctx.fill();
      break;
    case 'smug':
      dot(x1, 3.2); dot(x2, 3); ctx.strokeStyle = OUT; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(x1 - 6, ey - 2); ctx.lineTo(x1 + 6, ey - 2); ctx.moveTo(x2 - 5, ey - 2); ctx.lineTo(x2 + 5, ey - 2); ctx.stroke();   // heavy lids
      brow(x1, 0, 0, 2); brow(x2, -3, -3, 5);
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mx + 3, my - 5, 8, 0.12 * Math.PI, 0.62 * Math.PI); ctx.stroke();   // one-sided smirk
      break;
    case 'angry':
      dot(x1, 3.4); dot(x2, 3.2); brow(x1, -3, 4); brow(x2, 4, -3);
      ctx.beginPath(); ctx.arc(mx, my + 9, 7, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      break;
    case 'wince':
      ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(x1 - 5, ey - 4); ctx.lineTo(x1 + 4, ey); ctx.lineTo(x1 - 5, ey + 4);
      ctx.moveTo(x2 + 5, ey - 4); ctx.lineTo(x2 - 4, ey); ctx.lineTo(x2 + 5, ey + 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - 8, my + 2); for (let i = 1; i <= 4; i++) ctx.lineTo(mx - 8 + i * 4, my + (i % 2 ? -2 : 2)); ctx.stroke();
      break;
    case 'shock':
      big(x1, 6.5, 2); big(x2, 6, 2); brow(x1, 0, 0, 7); brow(x2, 0, 0, 7);
      circ(ctx, mx, my + 3, 5.5); fillStroke(ctx, '#5a1a2b', 2.5);
      break;
    // ---- character-specific expressions (picked through `faces` on the character)
    case 'stern':    // White Knight at rest: low level brows, mouth a straight line
      dot(x1, 3.4); dot(x2, 3.2); brow(x1, 0, 1, -3); brow(x2, 1, 0, -3); line(mx - 7, my, mx + 7, my);
      break;
    case 'proud':    // restrained: a small closed smile, chin up
      dot(x1, 3.4); dot(x2, 3.2); brow(x1, 0, 0, 2); brow(x2, 0, 0, 2); smile(8, 3.2);
      break;
    case 'valor':    // heroic fury: wide eyes, brows down, mid battle cry
      big(x1, 6.5, 2.8); big(x2, 6, 2.6); brow(x1, -4, 3, 2); brow(x2, 3, -4, 2); openMouth(9, 11);
      break;
    case 'solemn':   // eyes closed, a quiet moment for the fallen shot
      closedEye(x1, true); closedEye(x2, true); brow(x1, 2, -2, 1); brow(x2, -2, 2, 1); line(mx - 6, my + 2, mx + 6, my + 1);
      break;
    case 'calc':     // one eye narrowed, one brow up, mouth pulled to the side: computing
      line(x1 - 5, ey, x1 + 5, ey); dot(x2, 3.4); brow(x1, 1, 2, -2); brow(x2, -1, -4, 6); line(mx - 6, my + 3, mx + 5, my - 1, 2.6);
      break;
    case 'chill':    // Himmy's default: half-lidded, a lazy little smile
      ctx.fillStyle = OUT; circ(ctx, x1, ey + 1.5, 3); ctx.fill(); circ(ctx, x2, ey + 1.5, 2.8); ctx.fill();
      line(x1 - 5, ey - 1, x1 + 5, ey - 1, 3.2); line(x2 - 5, ey - 1, x2 + 5, ey - 1, 3.2); smile(7, 2.8);
      break;
    case 'serene':   // eyes closed, at peace with the universe
      closedEye(x1, true); closedEye(x2, true); smile(8);
      break;
    case 'mystic': { // On Fire, Himmy-style: eyes glowing shut, a halo of light
      const a = 0.6 + 0.3 * Math.sin(t * 4);
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(-2, -ry * 1.95, rx * 0.75, 7, 0, 0, 7); ctx.stroke();
      const g = ctx.createRadialGradient(rx * 0.4, ey, 0, rx * 0.4, ey, rx * 0.9); g.addColorStop(0, 'rgba(255,230,140,.75)'); g.addColorStop(1, 'rgba(255,230,140,0)');
      ctx.fillStyle = g; circ(ctx, rx * 0.4, ey, rx * 0.9); ctx.fill(); ctx.restore();
      closedEye(x1, true); closedEye(x2, true); smile(8);
      break;
    }
    default:
      dot(x1, 3.4); dot(x2, 3.2);
      if (def.brood) { brow(x1, -1, 3, -4); brow(x2, -1, 3, -4); ctx.beginPath(); ctx.moveTo(mx - 7, my + 1); ctx.lineTo(mx + 6, my); ctx.stroke(); }   // heavy brow, no smile
      else { ctx.beginPath(); ctx.arc(mx, my - 5, 8, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke(); }
  }
}

/**
 * pose: { crouch 0..1, jump px, lean rad, hands:{l:[x,y],r:[x,y]} (local, feet origin, y up = negative),
 *         expr, headTilt, headShake, flipX, t, back, turn, wind (0..1 hair pushed back), handShape }
 */
export function drawCharacter(ctx, def, x, y, scale, pose = {}) {
  const b = def.build, o = def.outfit, t = pose.t || 0, cr = pose.crouch || 0, back = !!pose.back;
  const expr = (def.faces || {})[pose.expr || 'neutral'] || pose.expr || 'neutral';
  ctx.save();
  ctx.translate(x, y - (pose.jump || 0) * scale);
  let fx = (pose.flipX === undefined ? 1 : pose.flipX) * (pose.facing || 1);
  if (Math.abs(fx) < 0.18) fx = fx < 0 ? -0.18 : 0.18;
  ctx.scale(scale * fx, scale);
  ctx.rotate(pose.lean || 0);
  if (back && pose.turn) ctx.transform(1, 0, -pose.turn, 1, 0, 0);   // seen from behind, the upper body twists toward the hoop

  const tw = b.torsoW, legH = b.leg * (1 - 0.36 * cr);
  const hipY = -legH, shY = hipY - b.torsoH + 6;
  const breathe = Math.sin(t * 2.4) * 1.2;
  const sway = Math.sin(t * 2) * 2;
  const hands = pose.hands || { l: [-tw / 2 - 8, hipY + 6 + sway], r: [tw / 2 + 10, hipY + 6 - sway] };
  const shape = pose.handShape || {};

  // back arm
  drawArm(ctx, def, -tw * 0.3, shY + 12, hands.l, -1, shape.l, back);

  if (b.centaur) drawHorse(ctx, def, hipY, cr, back, t);
  else {
    // legs
    const legCol = o.legColor || (o.bottom === 'pants' ? o.bottomColor : def.skin), lw = b.legW || 13;
    for (const s of [-1, 1]) {
      const hx = s * 10, fxp = s * 13 + 2, kx = (hx + fxp) / 2 + cr * 22, ky = hipY / 2;
      ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx, hipY + 2); ctx.quadraticCurveTo(kx, ky, fxp, -6);
      ctx.strokeStyle = OUT; ctx.lineWidth = lw + 5; ctx.stroke(); ctx.strokeStyle = legCol; ctx.lineWidth = lw; ctx.stroke();
      if (o.knees) { circ(ctx, 0.25 * hx + 0.5 * kx + 0.25 * fxp, 0.25 * (hipY + 2) + 0.5 * ky - 1.5, 8); fillStroke(ctx, legCol, 2.5); }   // knee plates
      if (o.socks) { ctx.beginPath(); ctx.moveTo(fxp, -20); ctx.lineTo(fxp, -8); ctx.strokeStyle = o.socks; ctx.lineWidth = lw; ctx.lineCap = 'butt'; ctx.stroke(); }
      if (o.sandal) { ctx.beginPath(); ctx.ellipse(fxp + (back ? 0 : 6), -1.5, back ? 12 : 15, 3.5, 0, 0, 7); fillStroke(ctx, o.sandal, 2); }   // flip-flops
      ctx.beginPath(); ctx.ellipse(fxp + (back ? 0 : 6), o.sandal ? -6 : -5, back ? 11 : (o.sandal ? 12 : 14), o.sandal ? 6 : 7.5, 0, 0, 7); fillStroke(ctx, o.shoes, 3);
      if (o.sandal) { ctx.strokeStyle = o.sandal; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fxp + (back ? -6 : 2), -8); ctx.lineTo(fxp + (back ? 6 : 10), -8); ctx.stroke(); }
    }

    // bottoms
    if (o.bottom === 'pants') {
      rr(ctx, -tw / 2 + 2, hipY - 14, tw - 4, 22, 8); fillStroke(ctx, o.bottomColor, 3);
    } else if (o.bottom !== 'none') {
      const len = { skirt: 34, boardshorts: 32, faulds: 24 }[o.bottom] || 24, flare = { skirt: 8, faulds: 7, boardshorts: 2 }[o.bottom] || 3;
      ctx.beginPath(); ctx.moveTo(-tw / 2 + 3, hipY - 12); ctx.lineTo(tw / 2 - 3, hipY - 12); ctx.lineTo(tw / 2 + flare, hipY + len);
      if (o.bottom === 'boardshorts') { ctx.lineTo(4, hipY + len); ctx.lineTo(1, hipY + 10); ctx.lineTo(-2, hipY + len); }   // two legs, not a skirt
      ctx.lineTo(-tw / 2 - flare, hipY + len); ctx.closePath();
      fillStroke(ctx, o.bottomColor, 3);
      if (o.bottom === 'faulds') {   // overlapping steel bands
        ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        for (const v of [0.4, 0.72]) { const yy = hipY - 12 + (len + 12) * v, w = tw / 2 - 3 + (flare + 3) * v; ctx.beginPath(); ctx.moveTo(-w, yy); ctx.lineTo(w, yy); ctx.stroke(); }
      } else if (o.bottom === 'boardshorts') {   // side stripe and a drawstring
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tw / 2 - 5, hipY - 10); ctx.lineTo(tw / 2 + flare - 3, hipY + len - 2); ctx.moveTo(-tw / 2 + 5, hipY - 10); ctx.lineTo(-tw / 2 - flare + 3, hipY + len - 2); ctx.stroke();
        if (!back) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(4, hipY - 8); ctx.lineTo(1, hipY + 2); ctx.moveTo(7, hipY - 8); ctx.lineTo(10, hipY + 2); ctx.stroke(); }
      }
    }
  }

  // torso (+ belly)
  const th = hipY - shY + 2 + breathe * 0.3;
  ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.fillStyle = o.topColor;
  rr(ctx, -tw / 2, shY, tw, th, 16); ctx.stroke();
  if (b.belly) { ctx.beginPath(); ctx.ellipse(back ? 0 : tw * 0.1, hipY - 24, tw * 0.5 + b.belly * (back ? 4 : 7), 27, 0, 0, 7); ctx.stroke(); ctx.fill(); }
  rr(ctx, -tw / 2, shY, tw, th, 16); ctx.fill();
  ((back ? BACK_TOPS : TOPS)[o.top] || (() => {}))(ctx, def, tw, shY, hipY, t);

  // head
  const rx = b.head * 1.02 * (b.headW || 1), ry = b.head;
  const hairO = { t, back, lift: Math.min(1.2, Math.max(0, (pose.jump || 0) / 30)), flow: Math.sin(t * 1.7) * 0.5 + (pose.lean || 0) * 4 + (pose.wind || 0) * 1.2 };
  ctx.save();
  ctx.translate((back ? (pose.turn ? 4 : 0) : 4) + (pose.headShake || 0) * (def.calm ? 0.15 : 1), shY - ry * 0.78 + breathe);
  ctx.rotate(pose.headTilt || 0);
  const hair = HAIR[def.hair.style] || {};
  hair.back && hair.back(ctx, def, rx, ry, hairO);
  if (back) {
    // seen from behind: both ears, no face, hair wrapping the back of the head
    if (hair.back && hair.mirrorBack) { ctx.save(); ctx.scale(-1, 1); hair.back(ctx, def, rx, ry, hairO); ctx.restore(); }
    circ(ctx, -rx * 0.9, 4, 7); fillStroke(ctx, def.skin, 3); circ(ctx, rx * 0.9, 4, 7); fillStroke(ctx, def.skin, 3);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); fillStroke(ctx, def.skin, 3);
    const cap = BACK_HAIR[def.hair.style];
    if (cap) {
      ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, rx - 1.5, ry - 1.5, 0, 0, 7); ctx.clip();
      ctx.fillStyle = def.hair.color; ctx.fillRect(-rx, cap[0] * ry, rx * 2, (cap[1] - cap[0]) * ry);
      ctx.restore();
    }
    hair.over && hair.over(ctx, def, rx, ry, hairO);
    for (const a of def.acc || []) ACC_BACK[a] && ACC_BACK[a](ctx, def, rx, ry);
  } else {
    circ(ctx, -rx * 0.86, 4, 7); fillStroke(ctx, def.skin, 3);                       // ear
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); fillStroke(ctx, def.skin, 3);
    circ(ctx, rx * 0.96, 5, 5.5); fillStroke(ctx, def.skin, 2.5);                      // nose
    hair.front && hair.front(ctx, def, rx, ry, hairO);
    if (def.snort) {   // hot breath from the nostrils
      for (let i = 0; i < 2; i++) { const u = (t * 0.9 + i * 0.5) % 1; ctx.globalAlpha = (1 - u) * 0.5; ctx.fillStyle = '#e9e2ee'; ctx.beginPath(); ctx.ellipse(rx * 1.1 + u * 26, 10 + u * 8 - i * 3, 4 + u * 9, 3 + u * 6, 0, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    drawFace(ctx, def, rx, ry, expr, t);
    for (const a of def.acc || []) ACCESSORIES[a] && ACCESSORIES[a](ctx, def, rx, ry);
    hair.over && hair.over(ctx, def, rx, ry, hairO);
  }
  if (def.glyphs && (expr === 'calc' || expr === 'crazed' || expr === 'shock')) drawGlyphs(ctx, rx, ry, t, expr === 'crazed' ? 5 : expr === 'shock' ? 3 : 2);
  ctx.restore();

  // front arm
  drawArm(ctx, def, tw * 0.3, shY + 12, hands.r, 1, shape.r, back);
  ctx.restore();
}

/** Portrait for menus. `locked` renders a mystery silhouette. */
export function drawPortrait(canvas, def, { locked = false, pose = {} } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 100, h = canvas.clientHeight || 120;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const s = h / 245;
  drawCharacter(ctx, def, w / 2 - 4 + (def.build.centaur ? h * 0.1 : 0), h - 6, s * (def.build.centaur ? 0.92 : 1), pose);
  if (locked) {
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#2b1e3a'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = `900 ${h * 0.34}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23f'; ctx.fillText('?', w / 2, h * 0.42);
  }
}
