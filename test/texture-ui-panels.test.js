const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Texture pass, part 5/5 (final part, direct request relayed from the
// peer session): "UI panels/backgrounds: a bit more surface detail
// (subtle grain/gradient) instead of flat fills, consistent with the
// button-bevel polish you already did." In the same pixelated-chunky-
// block style every other part of this pass uses, and reusing the exact
// same buildGrainSpecks()/drawGrain() primitive (map.js) every terrain/
// tower surface in this pass already draws with, rather than a new
// technique just for UI.
//
// New drawUIPanelGrain() (js/ui.js): clips to the caller's given rect
// and draws the shared UI_GRAIN_SPECKS scatter over it — one precomputed
// scatter reused at any panel/tooltip size via a clip, rather than a
// fresh allocation per call. Applied to the two actual flat-fill "panel"
// backgrounds in the game: the main gameplay control panel (renderUI)
// and the tooltip box (uiDrawTooltip). Deliberately left the map-select
// card alone — its own comment already explains the real map art is
// drawn over that fill immediately after, so a grain layer there would
// just be painted over and wasted — and left the main-menu/mode-select
// buttons alone, since those already got the button-bevel treatment in
// an earlier pass and the request calls out panels/backgrounds as the
// next thing, not a second pass over buttons.

test('UI_GRAIN_SPECKS is snapped to the stated 3px grid, same chunky-pixel convention as every other grain scatter in this pass', () => {
  const game = loadFullGameContext();
  assert.ok(game.UI_GRAIN_SPECKS.length > 0);
  game.UI_GRAIN_SPECKS.forEach((speck) => {
    assert.equal(speck.x % 3, 0);
    assert.equal(speck.y % 3, 0);
  });
});

test('drawUIPanelGrain draws exactly one fillRect per speck, clipped to the given rect, no gradients', () => {
  const game = loadFullGameContext();
  const fillCalls = [];
  const styles = [];
  let clipped = false;
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'fillRect') return (...args) => fillCalls.push(args);
        if (prop === 'clip')
          return () => {
            clipped = true;
          };
        return () => {};
      },
      set(obj, prop, value) {
        if (prop === 'fillStyle') styles.push(value);
        return true;
      },
    }
  );
  assert.doesNotThrow(() => game.drawUIPanelGrain(ctx, 10, 20, 320, 760, '#12161c'));
  assert.equal(fillCalls.length, game.UI_GRAIN_SPECKS.length);
  assert.ok(clipped);
  styles.forEach((style) => assert.equal(typeof style, 'string')); // never a gradient object
});

test('renderUI and uiDrawTooltip never throw with the new panel grain in place', () => {
  const game = loadFullGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  game.setMoney(500);
  assert.doesNotThrow(() => game.renderUI(ctx));
  assert.doesNotThrow(() => game.uiDrawTooltip(ctx, 100, 100, ['A tooltip line'], 960, 640));
  assert.doesNotThrow(() => game.uiDrawTooltip(ctx, 100, 100, [], 960, 640)); // the empty-lines early-return path
});
