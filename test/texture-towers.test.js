const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Texture pass, part 4/4 (direct request, relayed from the peer
// session): "Tower bodies: similar treatment where it makes sense (bark
// texture on stems, petal shading, mushroom cap texture, etc.) without
// undoing the per-path color theming you already built," in the same
// pixelated-chunky-block style every other part of this pass uses.
//
// New applyStemBarkTexture() (js/towers.js): a row of short, alternating-
// side bark ticks along a stem's own rectangle — plain fillRect ticks, no
// gradients — drawn in `shadeColor(stemColor, -18)` rather than a fixed
// color, so it still reads as "this tower's own bark" after a path
// recolors the stem (e.g. Arctic Willow's Frosted/Brittle Path both
// recolor the whole plant) instead of undoing that theming. Applied to
// every stem-bodied tower: Sunflower, Rose, Mushroom (its own tapered
// stem was skipped — not a plain rectangle, applyStemBarkTexture assumes
// one — in favor of the cap texture below), Corpse Flower, Arctic
// Willow. Reused applyBlobShading() (map.js, part 3 of this pass) for
// "petal shading"/"mushroom cap texture" on Sunflower's seed-head,
// Rose's bloom center, Mushroom's cap, and Corpse Flower's petals —
// cross-file reuse, same shared global script scope every other function
// in this project already relies on.

test('applyStemBarkTexture never throws and its own tick count follows stemHeight (more ticks on a taller stem)', () => {
  const game = loadFullGameContext();
  const fillCalls = [];
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'fillRect') return (...args) => fillCalls.push(args);
        return () => {};
      },
      set() {
        return true;
      },
    }
  );
  assert.doesNotThrow(() => game.applyStemBarkTexture(ctx, 100, 100, 6, 30, '#2e7d32'));
  const shortStemCount = fillCalls.length;

  fillCalls.length = 0;
  game.applyStemBarkTexture(ctx, 100, 100, 6, 90, '#2e7d32');
  const tallStemCount = fillCalls.length;

  assert.ok(tallStemCount > shortStemCount);
});

test('applyStemBarkTexture darkens the given stem color rather than drawing a fixed bark color (stays correct after a path recolors the stem)', () => {
  const game = loadFullGameContext();
  const styles = [];
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'fillRect') return () => {};
        return () => {};
      },
      set(obj, prop, value) {
        if (prop === 'fillStyle') styles.push(value);
        return true;
      },
    }
  );
  game.applyStemBarkTexture(ctx, 100, 100, 6, 30, '#2e7d32');
  // Every tick uses the SAME darkened shade of the color passed in, not a
  // hardcoded literal — different stem colors produce different styles.
  assert.ok(styles.every((s) => s === styles[0]));
  game.applyStemBarkTexture(ctx, 100, 100, 6, 30, '#b39ddb'); // a Brittle-Path-recolored stem
  assert.notEqual(styles[styles.length - 1], styles[0]);
});

test('every touched tower still renders without throwing, across several paths/tiers worth of color/glow combinations', () => {
  const game = loadFullGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  const calls = [
    () => game.drawSunflower(ctx, 100, 100, 20, '#e6c229', null, 1.2, 0),
    () => game.drawSunflower(ctx, 100, 100, 20, '#39ff14', '#ffe066', 1.2, 1), // Solar Ray tier, glowing + mid-attack-flash
    () => game.drawRose(ctx, 100, 100, 18, '#c2185b', null, 1.2, 0, false, false, 0, false),
    () => game.drawRose(ctx, 100, 100, 18, '#2e7d32', null, 1.2, 0, true, true, 4, true), // maxed Root Path
    () => game.drawMushroom(ctx, 100, 100, 18, '#a1887f', null, 1.2, 0, 1, false, null),
    () => game.drawMushroom(ctx, 100, 100, 18, '#8e24aa', '#ce93d8', 1.2, 0, 1.15, true, '#9c27b0', 1.15, true, 80, true), // maxed paths
    () => game.drawCorpseFlower(ctx, 100, 100, 26, '#8c3522', null, 1.2, 0, false, 0),
    () => game.drawCorpseFlower(ctx, 100, 100, 26, '#c9a227', '#ffeb3b', 1.2, 0, true, 4, 4, 0), // maxed Hazard Path
    () => game.drawArcticWillow(ctx, 100, 100, 20, '#eef3f6', null, 1.2, 0, 0, false, 0, false, false),
    () => game.drawArcticWillow(ctx, 100, 100, 20, '#9c4dcc', '#9c4dcc', 1.2, 0, 0, false, 0, true, true), // maxed Brittle Path
  ];
  calls.forEach((call, i) => assert.doesNotThrow(call, `tower draw call #${i} threw`));
});

test('renderTower never throws for a fresh tower of every type, with the new texture calls in place', () => {
  const game = loadFullGameContext();
  game.setMoney(1000000);
  const ctx = new Proxy({}, { get: () => () => {} });
  ['sunflower', 'rose', 'mushroom', 'corpseFlower', 'arcticWillow'].forEach((typeKey) => {
    const tower = game.createTower(typeKey);
    tower.x = 100;
    tower.y = 100;
    assert.doesNotThrow(() => game.renderTower(ctx, tower, tower.x, tower.y, 1.2), `renderTower threw for ${typeKey}`);
  });
});
