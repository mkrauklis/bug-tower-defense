const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Regression coverage for a user bug report: after buying the Mushroom's
// Rashy upgrade (Infect Path tier 1), the entire right-side canvas-UI
// panel went blank. Investigated live in the browser across many
// scenarios (desktop/mobile layout, idle/mid-wave, single/multiple
// towers, with the stun roll actually firing) with the exact committed
// files (no uncommitted changes) and could not reproduce any thrown
// exception or missing panel content — renderUI() always completed and
// drew every path column. Deliberately undefining drawInfectMushroom
// (simulating a stale cached towers.js missing it, loaded alongside a
// fresh game.js that calls it) DID reproduce the exact symptom: render()
// throws inside the tower-drawing loop, which runs before renderUI(), so
// the panel's own draw calls never happen that frame. That strongly
// points to a stale-cache mismatch on the reporter's end rather than a
// bug in the committed code (this project has no build step/cache-
// busting — plain script tags are already a known aggressive-caching
// risk here).
//
// These tests don't reproduce a caching problem (Node always loads one
// consistent set of files), but they do guard against any future
// accidental breakage of the panel-rendering path for every tower type
// and Infect Path tier specifically, since that's exactly what was
// reported broken.

// A minimal ctx stand-in: same "any property read returns a callable
// no-op" Proxy shape loadGame.js's own DOM stub uses, so canvas drawing
// calls (fillRect/fillText/measureText/etc.) all silently succeed instead
// of throwing on an undefined method.
function createStubCtx() {
  const target = {};
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      return (..._args) => createStubCtx();
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    },
  });
}

test('rendering the panel after buying each Infect Path tier never throws', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  game.setSelectedTower(mushroom);
  const ctx = createStubCtx();

  assert.doesNotThrow(() => game.renderUI(ctx)); // before any purchase

  for (let tier = 0; tier < 4; tier += 1) {
    game.purchaseUpgrade(mushroom, 2);
    assert.doesNotThrow(
      () => game.renderUI(ctx),
      `renderUI threw after buying Infect Path tier ${tier + 1} (${mushroom.infectStun && mushroom.infectStun.chance})`
    );
  }
});

test('rendering the panel after buying into each Mushroom path never throws', () => {
  [0, 1, 2].forEach((pathIndex) => {
    const game = loadFullGameContext();
    const mushroom = game.createTower('mushroom');
    game.setSelectedTower(mushroom);
    const ctx = createStubCtx();
    game.purchaseUpgrade(mushroom, pathIndex);
    assert.doesNotThrow(() => game.renderUI(ctx), `renderUI threw after buying into path ${pathIndex}`);
  });
});

test('rendering the panel after buying each Arctic Willow Brittle Path tier never throws', () => {
  const game = loadFullGameContext();
  const arcticWillow = game.createTower('arcticWillow');
  game.setSelectedTower(arcticWillow);
  const ctx = createStubCtx();

  assert.doesNotThrow(() => game.renderUI(ctx)); // before any purchase

  for (let tier = 0; tier < 4; tier += 1) {
    game.purchaseUpgrade(arcticWillow, 1); // Brittle Path
    assert.doesNotThrow(
      () => game.renderUI(ctx),
      `renderUI threw after buying Brittle Path tier ${tier + 1} (hasBrittleStems=${arcticWillow.hasBrittleStems}, hasIceCubes=${arcticWillow.hasIceCubes})`
    );
  }
});

test('rendering the panel works for every tower type with no upgrades bought', () => {
  ['sunflower', 'rose', 'mushroom'].forEach((type) => {
    const game = loadFullGameContext();
    const tower = game.createTower(type);
    game.setSelectedTower(tower);
    const ctx = createStubCtx();
    assert.doesNotThrow(() => game.renderUI(ctx), `renderUI threw for a freshly-placed ${type}`);
  });
});

test('rendering the panel with nothing selected never throws', () => {
  const game = loadFullGameContext();
  const ctx = createStubCtx();
  assert.doesNotThrow(() => game.renderUI(ctx));
});
