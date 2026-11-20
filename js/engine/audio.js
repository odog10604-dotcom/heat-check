// Fully synthesized audio: zero asset downloads. SFX are one-shot functions; music is a
// tiny step sequencer whose layers and tempo follow the Heat level.
let ctx = null, master, sfxBus, musicBus, musicFilter, noiseBuf, muted = false;

let failed = false;
const wake = () => { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* stays silent */ } };

/** Call from a user gesture. Creates the audio graph once; afterwards just wakes it if the browser put it to sleep. */
export function initAudio() {
  // iOS parks the context as 'interrupted' (not 'suspended') after a call, Siri, or a trip to the home screen
  if (ctx) { if (ctx.state !== 'running' && !document.hidden) wake(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || failed) return;
  try { ctx = new AC(); } catch { failed = true; ctx = null; return; }   // no audio device / blocked: the game plays on in silence
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.85; sfxBus.connect(master);
  // music runs through a low-pass filter that opens up as Heat rises: muffled and calm at Normal, wide open On Fire
  musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.Q.value = 0.9; musicFilter.frequency.value = MUSIC_CUTOFF[0]; musicFilter.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_GAIN[0]; musicBus.connect(musicFilter);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

const MUSIC_CUTOFF = [1500, 3400, 8000, 18000], MUSIC_GAIN = [0.26, 0.29, 0.32, 0.36];

/** Tab hidden, or an ad / overlay is taking over: stop all sound (music included) until resumeAudio(). */
export function suspendAudio() { try { if (ctx && ctx.state === 'running') { const p = ctx.suspend(); if (p && p.catch) p.catch(() => {}); } } catch { /* ignore */ } }
export function resumeAudio() { if (ctx && ctx.state !== 'running' && !document.hidden) wake(); }

export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02); }
export const isMuted = () => muted;

function tone({ f = 440, f2, type = 'sine', t = 0, d = 0.15, v = 0.3, a = 0.005, bus, at }) {
  if (!ctx) return;
  const t0 = (at ?? ctx.currentTime) + t, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + d);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g); g.connect(bus || sfxBus); o.start(t0); o.stop(t0 + d + 0.03);
}

function noise({ t = 0, d = 0.2, v = 0.3, f = 1000, f2, q = 1, type = 'bandpass', a = 0.005, bus, at }) {
  if (!ctx) return;
  const t0 = (at ?? ctx.currentTime) + t, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + d);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  s.connect(fl); fl.connect(g); g.connect(bus || sfxBus); s.start(t0, Math.random() * 0.5); s.stop(t0 + d + 0.03);
}

export const sfx = {
  click() { tone({ f: 660, f2: 990, type: 'triangle', d: 0.07, v: 0.2 }); },
  rack() { noise({ f: 300, f2: 1400, d: 0.3, v: 0.16 }); tone({ f: 1320, type: 'triangle', t: 0.28, d: 0.3, v: 0.16 }); tone({ f: 1760, type: 'triangle', t: 0.36, d: 0.35, v: 0.12 }); },
  catch() { noise({ f: 500, type: 'lowpass', d: 0.06, v: 0.3 }); tone({ f: 190, f2: 120, d: 0.07, v: 0.25 }); },
  release() { noise({ f: 500, f2: 2200, d: 0.16, v: 0.14, q: 0.8 }); tone({ f: 300, f2: 620, type: 'triangle', d: 0.1, v: 0.1 }); },
  swish(tier, heat = 0) {
    const fire = heat >= 3;
    if (heat >= 1) [2093, 2637, 3136].slice(0, heat).forEach((f, i) => tone({ f, type: 'sine', t: 0.04 + i * 0.04, d: 0.25, v: 0.05 + heat * 0.012 }));   // sparkle on top, one more note per Heat level
    if (heat === 2) tone({ f: 120, f2: 60, d: 0.22, v: 0.25 });
    const v = tier === 'perfect' ? 0.42 : tier === 'good' ? 0.32 : 0.24;
    noise({ f: 2200, f2: 7000, type: 'highpass', d: tier === 'perfect' ? 0.34 : 0.24, v, a: 0.01 });
    noise({ f: 900, f2: 400, d: 0.18, v: v * 0.5 });
    if (fire) { noise({ f: 200, f2: 1800, d: 0.5, v: 0.3, q: 0.5 }); tone({ f: 90, f2: 45, d: 0.4, v: 0.4 }); }
  },
  rim() { tone({ f: 523, type: 'square', d: 0.14, v: 0.13 }); tone({ f: 784, type: 'triangle', d: 0.22, v: 0.16 }); tone({ f: 1109, type: 'sine', d: 0.3, v: 0.08 }); noise({ f: 3000, d: 0.05, v: 0.12 }); },
  backboard() { noise({ f: 350, type: 'lowpass', d: 0.14, v: 0.5 }); tone({ f: 150, f2: 90, d: 0.16, v: 0.4 }); tone({ f: 420, type: 'square', d: 0.06, v: 0.08 }); },
  bounce(v = 0.16) { tone({ f: 120, f2: 70, d: 0.09, v }); noise({ f: 400, type: 'lowpass', d: 0.04, v: v * 0.6 }); },
  airball() { tone({ f: 950, f2: 260, d: 0.45, v: 0.16 }); },
  missVoice() {  // sad trombone, abbreviated
    tone({ f: 233, f2: 220, type: 'sawtooth', d: 0.2, v: 0.1 }); tone({ f: 207, f2: 150, type: 'sawtooth', t: 0.2, d: 0.38, v: 0.1 });
  },
  perfect() { [1319, 1760, 2093, 2637].forEach((f, i) => tone({ f, type: 'triangle', t: i * 0.045, d: 0.3, v: 0.14 })); },
  good() { tone({ f: 880, type: 'triangle', d: 0.16, v: 0.12 }); tone({ f: 1319, type: 'triangle', t: 0.06, d: 0.2, v: 0.1 }); },
  money() { tone({ f: 988, type: 'square', d: 0.09, v: 0.12 }); tone({ f: 1319, type: 'square', t: 0.08, d: 0.4, v: 0.12 }); tone({ f: 2637, t: 0.08, d: 0.5, v: 0.06 }); },
  heatUp(level) {
    const base = [0, 392, 494, 587][level] || 392;
    [1, 1.25, 1.5, 2].forEach((m, i) => tone({ f: base * m, type: 'sawtooth', t: i * 0.06, d: 0.22, v: 0.1 }));
    noise({ f: 400, f2: 3000, d: 0.35, v: 0.14, q: 0.7 });
  },
  onFire() {
    noise({ f: 150, f2: 5000, d: 0.7, v: 0.4, q: 0.4 }); tone({ f: 70, f2: 35, d: 0.9, v: 0.5 });
    [392, 494, 587, 784, 988, 1175].forEach((f, i) => tone({ f, type: 'sawtooth', t: 0.1 + i * 0.05, d: 0.6, v: 0.09 }));
    [784, 988, 1175].forEach((f) => tone({ f, type: 'square', t: 0.45, d: 0.7, v: 0.07 }));
  },
  fizzle(level) {   // the fire going out: a hiss and a falling tone, bigger from On Fire
    noise({ f: 6000, f2: 900, type: 'highpass', d: 0.4 + level * 0.15, v: 0.12 + level * 0.05, a: 0.01 });
    tone({ f: 320 + level * 60, f2: 70, type: 'sawtooth', d: 0.5, v: 0.07 + level * 0.02 });
  },
  cool() { tone({ f: 700, f2: 180, d: 0.35, v: 0.14 }); noise({ f: 5000, f2: 1500, type: 'highpass', d: 0.5, v: 0.12, a: 0.03 }); },
  cheer(k = 0.5) {
    noise({ f: 1100, f2: 1700, d: 0.5 + k * 0.9, v: 0.08 + k * 0.2, q: 0.5, a: 0.08 });
    noise({ f: 2600, d: 0.4 + k * 0.6, v: 0.03 + k * 0.08, q: 0.8, a: 0.1 });
    const n = 1 + Math.round(k * 3);
    for (let i = 0; i < n; i++) tone({ f: 480 + Math.random() * 260, f2: 800 + Math.random() * 500, t: Math.random() * 0.2, d: 0.3 + Math.random() * 0.3, v: 0.035 + k * 0.03, a: 0.05 });
  },
  groan() {
    noise({ f: 420, f2: 260, d: 0.7, v: 0.2, q: 0.9, a: 0.08 });
    for (let i = 0; i < 3; i++) tone({ f: 230 + i * 40 + Math.random() * 30, f2: 140 + i * 20, type: 'sawtooth', t: Math.random() * 0.08, d: 0.55, v: 0.035, a: 0.08 });
  },
  tick(i = 0) { tone({ f: 520 + i * 28, type: 'square', d: 0.05, v: 0.08 }); },
  fanfare(good) {
    if (good) { [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'sawtooth', t: i * 0.1, d: 0.25, v: 0.11 })); [523, 659, 784, 1047].forEach((f) => tone({ f, type: 'triangle', t: 0.42, d: 0.9, v: 0.1 })); sfx.cheer(0.9); }
    else { tone({ f: 311, f2: 294, type: 'sawtooth', d: 0.3, v: 0.11 }); tone({ f: 277, f2: 262, type: 'sawtooth', t: 0.3, d: 0.3, v: 0.11 }); tone({ f: 247, f2: 160, type: 'sawtooth', t: 0.6, d: 0.7, v: 0.11 }); }
  },
  unlock() { [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => tone({ f, type: 'triangle', t: i * 0.07, d: 0.4, v: 0.13 })); },
  // Arena cues (hooks for the official Daily's casino arena: maps name them in `audio`). Kept short and warm on purpose;
  // a proper luxury sound pass can replace these without touching the game.
  arenaEnter() {   // lights up: a low boom as the house lights hit, a warm brass chord swelling in, polite applause
    tone({ f: 55, f2: 41, type: 'sine', d: 0.9, v: 0.22, a: 0.01 }); noise({ f: 180, type: 'lowpass', d: 0.5, v: 0.12 });
    [131, 196, 262, 330, 392].forEach((f, i) => tone({ f, type: 'sawtooth', t: 0.2 + i * 0.03, d: 1.1, v: 0.032, a: 0.4 }));
    [523, 659, 784].forEach((f, i) => tone({ f, type: 'triangle', t: 0.6 + i * 0.07, d: 0.8, v: 0.045, a: 0.05 }));
    noise({ f: 1500, t: 0.7, d: 1.0, v: 0.05, q: 0.6, a: 0.25 });
  },
  arenaJackpot() {   // beat the Daily: a bright brass arpeggio over a warm chord, and the room on its feet (no slot-machine bells)
    [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', t: i * 0.06, d: 0.5, v: 0.11 }));
    [262, 392, 523, 659].forEach((f) => tone({ f, type: 'sawtooth', t: 0.42, d: 1.2, v: 0.045, a: 0.08 }));
    sfx.cheer(1);
  },
  arenaHalf() {   // reaching half court: the crowd goes "ooooh" (a rising vowel-ish swell) over one low note
    noise({ f: 380, f2: 620, d: 1.1, v: 0.09, q: 4, a: 0.3 }); noise({ f: 760, f2: 1100, d: 1.0, v: 0.04, q: 5, a: 0.3 });
    tone({ f: 131, type: 'triangle', t: 0.1, d: 1.0, v: 0.07, a: 0.15 });
  },
  arenaFinal() {   // the final shot: the room goes quiet under a low held note
    tone({ f: 98, type: 'triangle', d: 1.4, v: 0.12, a: 0.2 }); tone({ f: 147, type: 'sine', t: 0.1, d: 1.3, v: 0.06, a: 0.3 });
    noise({ f: 400, type: 'lowpass', d: 0.9, v: 0.05, a: 0.2 });
  },
  /** A character's own flavour on a reaction moment (layered on top of the outcome sounds, so it starts a beat late). */
  voice(kit, moment, heat = 0) { const k = VOICES[kit]; const f = k && (k[moment] || (moment === 'money' ? k.perfect : moment === 'hot' ? k.make : moment === 'winBig' ? k.fire : moment === 'winPoor' ? k.miss : null)); if (f) f(heat); },
  /** One footstep while jogging to the next rack; `i` alternates left / right. */
  step(kit, i = 0) { const k = VOICES[kit]; if (k && k.step) k.step(i); },
};

// ---------- character sound kits ----------
// Each kit is optional per moment: make, perfect, money, hot, fire, miss, badMiss, cool, winBig, winPoor, plant, step.
// Missing moments fall back (see sfx.voice) or stay silent. Kept quiet: these flavour the shot sounds, never cover them.
const clink = (f, t = 0, v = 0.07, d = 0.18) => { tone({ f, type: 'square', t, d: d * 0.4, v: v * 0.6 }); tone({ f: f * 1.51, t, d, v }); tone({ f: f * 2.76, t, d: d * 0.8, v: v * 0.5 }); };
const VOICES = {
  armor: {   // White Knight: clanking plate, a drawn sword, a herald's trumpet
    step(i) { clink(i ? 1900 : 1700, 0, 0.05, 0.12); noise({ f: 4200, type: 'highpass', d: 0.05, v: 0.05 }); },
    plant() { clink(1500, 0, 0.08, 0.25); clink(2100, 0.04, 0.06, 0.2); noise({ f: 300, type: 'lowpass', d: 0.08, v: 0.14 }); },
    make() { noise({ f: 2500, f2: 9000, type: 'highpass', t: 0.12, d: 0.22, v: 0.07 }); clink(2400, 0.3, 0.06, 0.45); },        // sword drawn: shhing
    perfect() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'square', t: 0.12 + i * 0.09, d: i === 3 ? 0.4 : 0.11, v: 0.06 })); },   // herald's trumpet
    fire() { [392, 523, 659, 784, 659, 1047].forEach((f, i) => tone({ f, type: 'square', t: 0.25 + i * 0.1, d: i === 5 ? 0.6 : 0.12, v: 0.07 })); noise({ f: 2500, f2: 9000, type: 'highpass', t: 0.2, d: 0.25, v: 0.07 }); },
    miss() { tone({ f: 233, f2: 220, type: 'triangle', t: 0.2, d: 0.7, v: 0.09, a: 0.08 }); },                                   // a single solemn horn
    badMiss() { clink(1300, 0.15, 0.09, 0.3); clink(1100, 0.27, 0.08, 0.3); noise({ f: 250, type: 'lowpass', t: 0.3, d: 0.12, v: 0.18 }); },   // drops to one knee: clank
    cool() { [1900, 1600, 1350, 1100].forEach((f, i) => clink(f, 0.15 + i * 0.08, 0.05, 0.15)); },
  },
  tech: {    // Tech Guy: sneaker squeaks, keyboards, confirmation beeps and error buzzers
    step(i) { tone({ f: i ? 2300 : 2000, f2: i ? 3100 : 2700, d: 0.04, v: 0.03 }); },
    plant() { [0, 0.05, 0.09].forEach((t) => noise({ f: 3500, t, d: 0.025, v: 0.06, q: 2 })); },
    make() { tone({ f: 1047, type: 'square', t: 0.15, d: 0.06, v: 0.05 }); tone({ f: 1568, type: 'square', t: 0.23, d: 0.1, v: 0.05 }); },   // confirmed
    perfect() { [1047, 1319, 1568, 2093].forEach((f, i) => tone({ f, type: 'square', t: 0.12 + i * 0.06, d: 0.07, v: 0.045 })); for (let i = 0; i < 6; i++) noise({ f: 3500, t: 0.45 + i * 0.05, d: 0.02, v: 0.05, q: 2 }); },
    fire() { const n = [0, 7, 12, 4, 9, 16, 7, 12, 19, 11, 16, 24]; n.forEach((s, i) => tone({ f: 880 * Math.pow(2, s / 12), type: 'square', t: 0.25 + i * 0.045, d: 0.04, v: 0.04 })); },   // data spewing
    miss() { tone({ f: 150, type: 'square', t: 0.2, d: 0.12, v: 0.05 }); tone({ f: 150, type: 'square', t: 0.36, d: 0.12, v: 0.05 }); },   // error, error
    badMiss() { tone({ f: 120, type: 'sawtooth', t: 0.15, d: 0.5, v: 0.05 }); tone({ f: 127, type: 'sawtooth', t: 0.15, d: 0.5, v: 0.04 }); },
    cool() { tone({ f: 900, f2: 90, t: 0.15, d: 0.6, v: 0.07 }); },                                                              // powering down
  },
  surf: {    // Himmy: flip-flops, waves, wind chimes
    step(i) { noise({ f: 1400, d: 0.035, v: i ? 0.08 : 0.06, q: 1.5 }); tone({ f: 220, f2: 140, d: 0.04, v: 0.04 }); },          // slap
    plant() { noise({ f: 400, f2: 1400, type: 'lowpass', d: 0.4, v: 0.05, a: 0.15 }); },
    make() { noise({ f: 300, f2: 1600, type: 'lowpass', t: 0.1, d: 0.9, v: 0.08, a: 0.35 }); },                                   // a wave rolling in
    perfect() { [2637, 3136, 3520, 2349, 3951].forEach((f, i) => tone({ f, t: 0.15 + i * 0.11, d: 0.9, v: 0.04 })); noise({ f: 300, f2: 1600, type: 'lowpass', t: 0.1, d: 0.9, v: 0.06, a: 0.35 }); },   // wind chimes
    fire() { noise({ f: 200, f2: 2400, type: 'lowpass', t: 0.2, d: 1.6, v: 0.12, a: 0.6 }); [1319, 1568, 1760, 2093, 2349, 2637].forEach((f, i) => tone({ f, t: 0.4 + i * 0.13, d: 1.1, v: 0.045 })); },
    miss() { noise({ f: 900, f2: 500, t: 0.2, d: 0.8, v: 0.05, a: 0.25, q: 0.7 }); },                                             // a long exhale
    cool() { noise({ f: 1600, f2: 250, type: 'lowpass', t: 0.15, d: 1.2, v: 0.08, a: 0.2 }); },                                  // the wave going back out
  },
  beast: {   // The Dark Horse: hooves, snorts, low grunts
    step(i) { tone({ f: i ? 820 : 640, type: 'triangle', d: 0.05, v: 0.08 }); noise({ f: 900, d: 0.03, v: 0.06 }); },              // clop
    plant() { noise({ f: 700, f2: 300, t: 0, d: 0.16, v: 0.12, q: 0.8 }); noise({ f: 700, f2: 300, t: 0.2, d: 0.2, v: 0.1, q: 0.8 }); },   // snort snort
    make() { tone({ f: 85, f2: 70, type: 'sawtooth', t: 0.15, d: 0.25, v: 0.05 }); },                                          // a low grunt
    perfect() { tone({ f: 70, f2: 55, type: 'sawtooth', t: 0.15, d: 0.4, v: 0.06 }); noise({ f: 700, f2: 300, t: 0.5, d: 0.2, v: 0.1, q: 0.8 }); },
    fire() { tone({ f: 420, f2: 880, type: 'sawtooth', t: 0.25, d: 0.25, v: 0.035 }); tone({ f: 880, f2: 330, type: 'sawtooth', t: 0.5, d: 0.5, v: 0.035 }); [0.9, 1.05, 1.2].forEach((t) => tone({ f: 60, f2: 40, t, d: 0.12, v: 0.2 })); },   // whinny, then stamping
    miss() { tone({ f: 60, f2: 38, t: 0.15, d: 0.18, v: 0.22 }); },                                                              // stomp
    badMiss() { [0.15, 0.3].forEach((t) => tone({ f: 58, f2: 36, t, d: 0.18, v: 0.24 })); noise({ f: 700, f2: 250, t: 0.5, d: 0.3, v: 0.12, q: 0.8 }); },
    cool() { noise({ f: 600, f2: 200, t: 0.15, d: 0.5, v: 0.1, q: 0.8 }); },
  },
};

// ---------------------------------------------------------------- music
const music = { on: false, heat: 0, step: 0, next: 0, timer: null, tempo: 1 };
const BPM = [104, 112, 122, 136];
const ROOTS = [45, 45, 41, 43];                                  // A A F G
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const BASS = [
  [0, , , , , , 0, , , , 12, , , , , ,],
  [0, , , 0, , , 12, , 0, , , , 7, , 10, ,],
  [0, , 0, , 12, , 0, , , 0, , 12, , 7, , 10],
  [0, 0, 12, 0, , 12, 0, 7, 0, 0, 12, 0, 10, 12, 7, 10],
];
const ARP = [0, 7, 12, 15, 12, 7, 15, 19, 12, 7, 15, 12, 19, 15, 12, 7];
const HOOK = [12, , 15, , 19, , 17, 15, 12, , 10, , 12, , , ,];   // On Fire lead line

function playStep(step, at) {
  const s = step % 16, bar = Math.floor(step / 16) % 4, h = music.heat, root = ROOTS[bar], bus = musicBus;
  const kick = h >= 2 ? s % 4 === 0 : (s === 0 || s === 8 || (h === 1 && s === 10));
  if (kick) { tone({ f: 150, f2: 42, d: 0.16, v: 0.7, bus, at }); }
  if (h >= 1 && (s === 4 || s === 12)) { noise({ f: 1800, d: 0.12, v: 0.3, q: 0.7, bus, at }); tone({ f: 200, f2: 120, d: 0.08, v: 0.2, bus, at }); }
  const hat = h === 0 ? s % 4 === 2 : h < 3 ? s % 2 === 0 : true;
  if (hat) noise({ f: 8000, type: 'highpass', d: 0.035, v: s % 4 === 2 ? 0.13 : 0.07, bus, at });
  const b = BASS[h][s];
  if (b !== undefined) tone({ f: mtof(root - 12 + b), type: 'sawtooth', d: 0.16, v: 0.26, bus, at });
  if (s === 0) [0, 7, 15].forEach((n) => tone({ f: mtof(root + 12 + n), type: 'triangle', d: 0.5, v: 0.05 + h * 0.012, a: 0.03, bus, at }));
  if (h >= 2 && (h === 3 || s % 2 === 0)) tone({ f: mtof(root + 24 + ARP[s] + (h === 3 && bar % 2 ? 12 : 0)), type: 'square', d: 0.09, v: h === 3 ? 0.06 : 0.045, bus, at });
  if (h === 1 && s % 4 === 3) tone({ f: mtof(root + 24 + ARP[s]), type: 'triangle', d: 0.14, v: 0.06, bus, at });
  if (h >= 2 && s === 0 && bar % 2 === 0) noise({ f: 5000, type: 'highpass', d: 0.7, v: 0.13, bus, at });   // crash
  if (h === 3) {
    if (kick) tone({ f: 55, d: 0.3, v: 0.4, bus, at });                                              // sub under the kick
    const n = HOOK[s];
    if (n !== undefined) { tone({ f: mtof(root + 12 + n), type: 'sawtooth', d: 0.2, v: 0.05, bus, at }); tone({ f: mtof(root + 12 + n) * 1.006, type: 'sawtooth', d: 0.2, v: 0.04, bus, at }); }
    if (s === 4 || s === 12) noise({ f: 750, q: 2.5, d: 0.16, v: 0.16, a: 0.01, bus, at });           // crowd "HEY!" on the backbeat
  }
}

function tickMusic() {
  if (!ctx || ctx.state !== 'running') return;
  if (music.next < ctx.currentTime - 0.3) music.next = ctx.currentTime + 0.05;   // tab was asleep
  while (music.next < ctx.currentTime + 0.12) {
    playStep(music.step, music.next);
    music.next += 60 / (BPM[music.heat] * music.tempo) / 4;
    music.step = (music.step + 1) % 64;
  }
}

// ------------------------------------------------------------------ ambience (the Daily arena's room tone)
// A looping bed under the music: a well-dressed crowd murmuring in a big room (filtered noise with a slow swell), and now
// and then a glass clinking somewhere. `setAmbienceLevel` raises it as the shots get longer and hushes it for the final
// shot. Everything is wrapped: if audio is unavailable or anything throws, the game carries on in silence.
let amb = null;
const KINDS = {
  casino: { f: 420, q: 0.55, v: 0.05, swell: 0.35, clink: true },
};
export function startAmbience(kind = 'casino') {
  try {
    if (!ctx || amb || !KINDS[kind]) return;
    const k = KINDS[kind], src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    bp.type = 'bandpass'; bp.frequency.value = k.f; bp.Q.value = k.q; lp.type = 'lowpass'; lp.frequency.value = 1400;
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.linearRampToValueAtTime(k.v, ctx.currentTime + 1.2);
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();                 // the murmur rises and falls
    lfo.frequency.value = 0.13; lfoGain.gain.value = k.v * k.swell; lfo.connect(lfoGain); lfoGain.connect(g.gain);
    src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(master);
    src.start(); lfo.start();
    amb = { src, lfo, lfoGain, g, k, level: 1, timer: k.clink ? setInterval(() => { try { if (amb && Math.random() < 0.45) glassClink(); } catch { /* skip */ } }, 2600) : null };
  } catch { amb = null; }
}
/** 0 = silent, 1 = normal room, 2 = the place is buzzing. */
export function setAmbienceLevel(level) {
  try { if (!amb) return; amb.level = Math.max(0, Math.min(2.2, level)); amb.g.gain.setTargetAtTime(amb.k.v * amb.level, ctx.currentTime, 0.6); amb.lfoGain.gain.setTargetAtTime(amb.k.v * amb.k.swell * amb.level, ctx.currentTime, 0.6); } catch { /* ignore */ }
}
export function stopAmbience() {
  try {
    if (!amb) return;
    const a = amb; amb = null; clearInterval(a.timer);
    a.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
    a.src.stop(ctx.currentTime + 1.2); a.lfo.stop(ctx.currentTime + 1.2);
  } catch { amb = null; }
}
function glassClink() {   // a glass, somewhere across the room
  const f = 2400 + Math.random() * 1400, v = 0.012 + Math.random() * 0.012;
  tone({ f, type: 'sine', d: 0.5, v }); tone({ f: f * 1.51, type: 'sine', t: 0.004, d: 0.35, v: v * 0.5 });
}

export function startMusic() {
  if (!ctx || music.on) return;
  music.on = true; music.step = 0; music.next = ctx.currentTime + 0.08;
  music.timer = setInterval(tickMusic, 30);
}
export function stopMusic() { music.on = false; clearInterval(music.timer); }
/** Per-run music changes (a modifier's doing): `tempo` is a multiplier on the beat. Reset with { tempo: 1 }. */
export function setMusicStyle({ tempo = 1 } = {}) { music.tempo = Math.max(0.6, Math.min(1.6, +tempo || 1)); }
export function setMusicHeat(h) {
  music.heat = Math.max(0, Math.min(3, h | 0));
  if (musicFilter) {   // open up quickly when you heat up; slam shut when the fire goes out
    musicFilter.frequency.setTargetAtTime(MUSIC_CUTOFF[music.heat], ctx.currentTime, music.heat ? 0.25 : 0.06);
    musicBus.gain.setTargetAtTime(MUSIC_GAIN[music.heat], ctx.currentTime, 0.2);
  }
}
