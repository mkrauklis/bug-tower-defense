// Seeded PRNG so the simulation can be made reproducible once something in
// the game actually needs randomness (e.g. wandering ambient wildlife).
// Nothing in the game calls Math.random() today, but this exists so that
// when something does, it goes through here instead — keep it that way:
// new gameplay randomness should call `random()`, never Math.random().
//
// mulberry32 — small, fast, good enough statistical quality for a game
// like this (not cryptographic, doesn't need to be).
function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// `?seed=12345` in the URL reproduces a specific run; otherwise a fresh
// seed is picked and logged/displayed so that run itself can be
// reproduced afterward.
const GAME_SEED = (() => {
  const fromUrl = new URLSearchParams(location.search).get('seed');
  if (fromUrl !== null && !Number.isNaN(Number(fromUrl))) return Number(fromUrl) >>> 0;
  return Date.now() >>> 0;
})();

const random = createRandom(GAME_SEED);
console.log(`Game seed: ${GAME_SEED} (add ?seed=${GAME_SEED} to the URL to reproduce this run)`);
