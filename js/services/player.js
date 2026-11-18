// Who is playing. Anonymous: a random id made on first visit, plus a display name the player can change.
// Stored under a SITE-level key, not a game key, so every game on the same domain sees the same player.
// There are no accounts. If accounts ever arrive, this is the one module that changes.
import { cleanName, newId, randomName, legacyIdentity } from './storage.js';

const KEY = 'site.player.v1';

function load() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { p = {}; }
  const id = (typeof p.id === 'string' && p.id.length >= 8 && p.id.length <= 64 && p.id) || legacyIdentity.id || newId();
  const name = cleanName(p.name) || legacyIdentity.name || randomName();
  return { id, name };
}

const state = load();
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable: identity lasts for this visit */ } };
store();

/** @type {import('./index.js').PlayerService} */
export const player = {
  get id() { return state.id; },
  get name() { return state.name; },
  /** One id per page load. Analytics uses it to group a visit; it is never stored. */
  sessionId: newId(),
  /** Returns the cleaned name actually saved ('' if nothing usable was given, in which case nothing changes). */
  setName(v) { const n = cleanName(v); if (n) { state.name = n; store(); } return n; },
};
