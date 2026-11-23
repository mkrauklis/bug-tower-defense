const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Texture pass, part 2/4 (direct request, relayed from the peer
// session): "Water (Marshland, Whirlpool, Caves' flowing water): more
// visible texture/movement in the fill itself — ripple lines, varying
// translucency bands, etc. — beyond what you've already done for
// 'flowing' look," in the same pixelated-chunky-block style part 1
// (ground grain) already established. New drawWaterShimmer() (map.js)
// reuses a grain scatter but modulates each speck's own alpha with a
// traveling sine wave instead of a fixed one, so the layer reads as
// moving light on water rather than static grain — applied to
// Whirlpool's own caustics, Marshland's own mud puddles (clipped to each
// puddle's own blob shape, plus 2 new pulsing ripple rings), and a 3rd
// short-dash "tumbling current" layer on Caves' own flowing-water path
// effect.

test('WHIRLPOOL_SHIMMER_SPECKS/PUDDLE_SHIMMER_UNIT_SPECKS are deterministic and distinct from GROUND_GRAIN_SPECKS\' own positions', () => {
  const game = loadFullGameContext();
  assert.ok(game.WHIRLPOOL_SHIMMER_SPECKS.length > 50);
  assert.ok(game.PUDDLE_SHIMMER_UNIT_SPECKS.length > 5);
  // PUDDLE_SHIMMER_UNIT_SPECKS is centered on 0 (shifted from
  // buildGrainSpecks' own [0, 2) output), not world-space positions.
  game.PUDDLE_SHIMMER_UNIT_SPECKS.forEach((speck) => {
    assert.ok(speck.x >= -1 && speck.x < 1);
    assert.ok(speck.y >= -1 && speck.y < 1);
  });
  // Different seeds from GROUND_GRAIN_SPECKS -> not an identical scatter.
  const groundXs = game.GROUND_GRAIN_SPECKS.slice(0, 5).map((s) => s.x);
  const whirlpoolXs = game.WHIRLPOOL_SHIMMER_SPECKS.slice(0, 5).map((s) => s.x);
  assert.notDeepEqual(groundXs, whirlpoolXs);
});

test('drawWaterShimmer never throws, and its own `scale` param reuses a normalized scatter against any real size without needing a pre-scaled copy', () => {
  const game = loadFullGameContext();
  const fillCalls = [];
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'fillRect') return (x, y, w, h) => fillCalls.push({ x, y, w, h });
        return () => {};
      },
      set() {
        return true;
      },
    }
  );
  assert.doesNotThrow(() => game.drawWaterShimmer(ctx, game.PUDDLE_SHIMMER_UNIT_SPECKS, 100, 100, '#bfe8d8', 3, 1.5, 0.9, 80));
  assert.equal(fillCalls.length, game.PUDDLE_SHIMMER_UNIT_SPECKS.length);
  // Scaled by 80 around origin (100, 100) -> every fill lands within the
  // real 80px-radius circle's own bounding box, not the raw [-1, 1) range.
  fillCalls.forEach((call) => {
    assert.ok(call.x >= 100 - 80 - 3 && call.x <= 100 + 80 + 3);
    assert.ok(call.y >= 100 - 80 - 3 && call.y <= 100 + 80 + 3);
  });
});

test('drawMudPuddle still never throws with the new ripple/shimmer layers, at several different times', () => {
  const game = loadFullGameContext();
  const canvas = game.getCanvas();
  const ctx = canvas.getContext('2d');
  [0, 1.2, 5.7].forEach((time) => {
    assert.doesNotThrow(() => game.drawMudPuddle(ctx, 200, 200, 85, time), `threw at time=${time}`);
  });
});

test('renderMarshDecor forwards time through to its own puddles (no change for a caller that omits it)', () => {
  const game = loadFullGameContext();
  const canvas = game.getCanvas();
  const ctx = canvas.getContext('2d');
  const decor = game.MAP_TYPES.marshland.decor;
  assert.doesNotThrow(() => game.renderMarshDecor(ctx, decor, 3.4));
  assert.doesNotThrow(() => game.renderMarshDecor(ctx, decor)); // time omitted -> defaults to 0
});

test('renderWhirlpoolCaustics and the 3rd Caves path-flow layer still never throw', () => {
  const game = loadFullGameContext();
  const canvas = game.getCanvas();
  const ctx = canvas.getContext('2d');
  assert.doesNotThrow(() => game.renderWhirlpoolCaustics(ctx, 960, 640, 2.1));
  assert.doesNotThrow(() =>
    game.renderCavesPathEffects(ctx, game.MAP_TYPES.caves.paths, game.MAP_TYPES.caves.pathWidth, 2.1)
  );
});

test('renderMap never throws for Marshland/Whirlpool/Caves specifically, across several times, with every new water texture layer active', () => {
  const game = loadFullGameContext();
  const canvas = game.getCanvas();
  const ctx = canvas.getContext('2d');
  ['marshland', 'whirlpool', 'caves'].forEach((key) => {
    game.setActiveMap(game.MAP_TYPES[key]);
    [0, 2.3, 9.1].forEach((time) => {
      assert.doesNotThrow(() => game.renderMap(ctx, canvas, time), `${key} threw at time=${time}`);
    });
  });
});
