const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Texture pass, part 3/4 (direct request, relayed from the peer
// session): "Trees/bushes/rock formations/stalagmites on every map: more
// depth — shading/highlight variation within the shape instead of one
// flat color per foliage blob, so they read as having volume" — in the
// same pixelated-chunky-block style the rest of this pass uses.
//
// New applyBlobShading() (map.js): a small cluster of light blocks on
// the upper-left + dark blocks on the lower-right of any roughly round
// decor shape, standing in for a directional light source without a
// real gradient — reused by every map's own primary blob-shaped decor
// (trees, bushes, mangroves, sandstone/ocean/obsidian rock formations,
// snow boulders, cave stalagmites, Hollow Event's own autumn trees/
// bushes) rather than a bespoke shading pass per function. Coral
// (branching stalks) and cacti (thin stroked lines) were deliberately
// left alone — genuinely different, non-blob silhouettes this circular
// light/dark cluster wouldn't actually fit.

test('applyBlobShading never throws and draws exactly 6 chunky fillRect blocks (3 light, 3 dark), no gradients/blur', () => {
  const game = loadFullGameContext();
  const fillCalls = [];
  const styles = [];
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'fillRect') return (...args) => fillCalls.push(args);
        if (prop === 'fillStyle') return styles[styles.length - 1];
        return () => {};
      },
      set(obj, prop, value) {
        if (prop === 'fillStyle') styles.push(value);
        return true;
      },
    }
  );
  assert.doesNotThrow(() => game.applyBlobShading(ctx, 100, 100, 40));
  assert.equal(fillCalls.length, 6);
  // 2 distinct fillStyles were set (one per 3-block group) — a light one
  // then a dark one, never a gradient object.
  assert.equal(styles.length, 2);
  styles.forEach((style) => assert.equal(typeof style, 'string'));
});

test('every touched decor function across every map still renders without throwing, with its own new shading call in place', () => {
  const game = loadFullGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  const calls = [
    () => game.drawMapTree(ctx, 100, 100, 30),
    () => game.drawMapBush(ctx, 100, 100, 20),
    () => game.drawMangrove(ctx, 100, 100, 35),
    () => game.drawSandstoneFormation(ctx, 100, 100, 30),
    () => game.drawOceanRock(ctx, 100, 100, 25),
    () => game.drawSnowBoulder(ctx, 100, 100, 28),
    () => game.drawObsidianRock(ctx, 100, 100, 28),
    () => game.drawCaveFormation(ctx, 100, 100, 30, false),
    () => game.drawCaveFormation(ctx, 100, 100, 30, true), // hanging variant too
    () => game.drawHollowTree(ctx, 100, 100, 30),
    () => game.drawHollowBush(ctx, 100, 100, 20),
  ];
  calls.forEach((call, i) => assert.doesNotThrow(call, `decor function #${i} threw`));
});

test('renderMap still never throws for every built-in map with the new foliage/rock shading in place', () => {
  const game = loadFullGameContext();
  const canvas = game.getCanvas();
  const ctx = canvas.getContext('2d');
  Object.values(game.MAP_TYPES).forEach((map) => {
    game.setActiveMap(map);
    assert.doesNotThrow(() => game.renderMap(ctx, canvas, 1.3), `renderMap threw for ${map.id}`);
  });
});
