// Advertising, without an ad network. The game asks for a PLACEMENT; this service decides whether anything shows.
//
//   ads.isAvailable()            is advertising on at all?
//   ads.isAvailable('results')   could this placement show something right now?
//   ads.show('results', { container, room })   -> Promise<{ shown }>   (never throws, never blocks play for long)
//   ads.hide('results')
//
// What lives HERE, so no provider can get it wrong:
//   - where ads may appear (PLACEMENTS) and where they may not (never while a game is being played)
//   - how often a full-screen break may happen
//   - sound off for the length of a break
//   - reserved, fixed-size boxes so the page never jumps when an ad arrives, and boxes that vanish when none does
//
// What a PROVIDER supplies (see docs/ADS.md): `banner({ placement, size, el })` and `interstitial({ placement })`.
// With no provider this is a no-op service: nothing is available, nothing renders, the layout is untouched.
// Nothing here loads a third-party script.

/** Where an ad may appear. Sizes are standard ad units, largest first; the first that fits the space is used. */
export const PLACEMENTS = {
  results: {
    kind: 'banner', sizes: [[300, 250], [320, 100], [320, 50]],
    ifNoRoom: 'smallest',     // sits below the last button, so on a short screen it may scroll below the fold
    why: 'The game is over and the player is reading their score. The natural pause in the loop.',
  },
  menu: {
    kind: 'banner', sizes: [[728, 90], [320, 50]],
    ifNoRoom: 'skip', minViewportH: 640,   // short phones and landscape have no spare room on the home screen
    why: 'Before a session starts. Low value, low annoyance.',
  },
  between_games: {
    kind: 'interstitial', afterGames: 2, everyGames: 3, minGapS: 120,
    why: 'Between two games, after the player chose to play again. Never the first games of a visit.',
  },
};

const LABEL = 'Advertisement';

function pickSize(def, room) {
  const fitsW = def.sizes.filter(([w]) => w <= room.w);
  const fits = fitsW.find(([, h]) => h + 18 <= room.h);          // 18 = the "Advertisement" label above the box
  if (fits) return fits;
  return def.ifNoRoom === 'smallest' && fitsW.length ? fitsW[fitsW.length - 1] : null;
}

export function createAds({ provider = null, enabled = () => true } = {}) {
  const hooks = { pauseAudio() {}, resumeAudio() {}, canInterrupt: () => true, track() {} };
  const live = {};                                                // placement -> { container, cleanup }
  const breaks = { games: 0, lastGame: -Infinity, lastAt: -Infinity };
  const on = () => !!provider && !!enabled();

  function breakAllowed(def) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    return breaks.games >= def.afterGames && breaks.games - breaks.lastGame >= def.everyGames && now - breaks.lastAt >= def.minGapS;
  }

  const api = {
    provider: provider ? provider.name : 'none',
    /** The game tells the service how to silence itself and when it must not be interrupted. */
    configure(h) { Object.assign(hooks, h); },
    /** Call once per finished game: full-screen breaks are paced by games played. */
    gameCompleted() { breaks.games++; },

    isAvailable(placement) {
      if (!on()) return false;
      if (placement === undefined) return true;
      const def = PLACEMENTS[placement];
      if (!def) return false;
      if (def.minViewportH && window.innerHeight < def.minViewportH) return false;
      if (def.kind === 'interstitial' && (!hooks.canInterrupt() || !breakAllowed(def))) return false;
      try { return provider.isReady ? !!provider.isReady(placement) : true; } catch { return false; }
    },

    /**
     * Show a placement if the rules allow it. Banners need `container` (an element) and `room` ({ w, h } free space).
     * Always resolves; `shown` says whether anything appeared.
     */
    async show(placement, { container = null, room = null } = {}) {
      const def = PLACEMENTS[placement];
      try {
        if (def && def.kind === 'banner') api.hide(placement);
        if (!def || !api.isAvailable(placement)) return { shown: false };

        if (def.kind === 'interstitial') {
          hooks.pauseAudio();
          let shown = false;
          try { shown = !!(await Promise.race([provider.interstitial({ placement }), new Promise((r) => setTimeout(() => r(false), 30000))])); }
          finally { hooks.resumeAudio(); }
          if (shown) { breaks.lastGame = breaks.games; breaks.lastAt = performance.now() / 1000; hooks.track('ad_shown', { placement, kind: 'interstitial' }); }
          return { shown };
        }

        if (!container) return { shown: false };
        const size = pickSize(def, room || { w: window.innerWidth - 16, h: Infinity });
        if (!size) return { shown: false };
        // reserve the exact box first, so nothing on the page moves when the ad itself arrives
        container.innerHTML = '';
        const label = document.createElement('div'); label.className = 'ad-label'; label.textContent = LABEL;
        const frame = document.createElement('div'); frame.className = 'ad-frame'; frame.style.width = size[0] + 'px'; frame.style.height = size[1] + 'px';
        container.append(label, frame); container.hidden = false;
        document.body.classList.add('ad-' + placement); document.body.style.setProperty(`--ad-${placement}-h`, size[1] + 18 + 'px');
        live[placement] = { container, cleanup: null };
        const cleanup = await provider.banner({ placement, size, el: frame });
        if (live[placement] && live[placement].container !== container) return { shown: false };   // replaced while loading
        if (!cleanup) { api.hide(placement); return { shown: false }; }                             // no ad came back: give the space back
        if (!live[placement]) { try { cleanup(); } catch { /* ignore */ } return { shown: false }; } // hidden while loading
        live[placement].cleanup = cleanup;
        hooks.track('ad_shown', { placement, kind: 'banner', w: size[0], h: size[1] });
        return { shown: true };
      } catch (err) {
        if (def && def.kind === 'banner') api.hide(placement);
        try { console.warn('[ads]', placement, err); } catch { /* ignore */ }
        return { shown: false };
      }
    },

    /** Remove a banner and give its space back. Safe to call when nothing is showing. */
    hide(placement) {
      const l = live[placement];
      if (l) {
        try { l.cleanup && l.cleanup(); } catch { /* provider's problem */ }
        l.container.hidden = true; l.container.innerHTML = '';
        delete live[placement];
      }
      if (typeof document !== 'undefined') { document.body.classList.remove('ad-' + placement); document.body.style.removeProperty(`--ad-${placement}-h`); }
    },
  };
  return api;
}

// ------------------------------------------------------------------ demo provider (development only)
// Draws labelled placeholder boxes at real ad sizes and a 2-second fake break, so placement and layout can be judged
// on any screen. No network, no scripts. Turn on with ?ads=demo.
export const demoProvider = {
  name: 'demo',
  isReady: () => true,
  banner({ placement, size, el }) {
    el.classList.add('ad-demo');
    el.textContent = `AD PLACEHOLDER · ${size[0]}×${size[1]} · ${placement}`;
    return () => { el.textContent = ''; el.classList.remove('ad-demo'); };
  },
  interstitial({ placement }) {
    return new Promise((resolve) => {
      const o = document.createElement('div'); o.className = 'ad-demo-break';
      o.innerHTML = `<div><b>AD BREAK (placeholder)</b><span>${placement} · back to the game in 2 seconds</span></div>`;
      document.body.appendChild(o);
      setTimeout(() => { o.remove(); resolve(true); }, 2000);
    });
  },
};
