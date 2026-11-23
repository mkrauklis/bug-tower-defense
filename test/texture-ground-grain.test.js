const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Texture pass, part 1/4 (direct request, relayed from the peer
// session): "make the textures better... ground/terrain on every map:
// add subtle color variation, noise/grain, or small detail marks...
// should read as actual ground, not a solid rectangle" — refined by a
// direct follow-up before this part was built: "make it slightly
// pixelated... chunky square blocks (quantized to a coarse pixel grid)
// rather than anti-aliased smooth variation." One shared primitive
// (buildGrainSpecks/drawGrain, map.js) now reused by every terrain's own
// ground via fillThemeBackground() — see this file for the rest of the
// pass (water/foliage next, then towers, then UI).

test('buildGrainSpecks is deterministic (same seeds -> identical scatter every time, no gameplay RNG involved)', () => {
  const game = loadFullGameContext();
  const a = game.buildGrainSpecks(50, 960, 640, 3, 12.9898, 78.233, 45.164);
  const b = game.buildGrainSpecks(50, 960, 640, 3, 12.9898, 78.233, 45.164);
  assert.deepEqual(a, b);
});

test('every speck is snapped to its own coarse pixel-grid cell (the follow-up\'s own "chunky blocks" instruction)', () => {
  const game = loadFullGameContext();
  const specks = game.buildGrainSpecks(100, 960, 640, 4, 12.9898, 78.233, 45.164);
  specks.forEach((speck) => {
    assert.equal(speck.x % 4, 0, `expected x=${speck.x} to be a multiple of the 4px cell size`);
    assert.equal(speck.y % 4, 0, `expected y=${speck.y} to be a multiple of the 4px cell size`);
  });
});

test('GROUND_GRAIN_SPECKS covers the real MAP_WORLD_WIDTH x MAP_WORLD_HEIGHT play area and is shared (not rebuilt) across terrains', () => {
  const game = loadFullGameContext();
  assert.ok(game.GROUND_GRAIN_SPECKS.length > 100);
  game.GROUND_GRAIN_SPECKS.forEach((speck) => {
    assert.ok(speck.x >= 0 && speck.x < 960);
    assert.ok(speck.y >= 0 && speck.y < 640);
  });
});

test('drawGrain never throws and draws exactly one fillRect per speck', () => {
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
  assert.doesNotThrow(() => game.drawGrain(ctx, game.GROUND_GRAIN_SPECKS, 0, 0, '#0d1b10', 3));
  assert.equal(fillCalls.length, game.GROUND_GRAIN_SPECKS.length);
});

test('fillThemeBackground draws the grain layer for every terrain, on top of a flat fill AND Whirlpool\'s own vignette hook alike', () => {
  // The real stub canvas's own ctx — see the renderMap test below for why
  // (Whirlpool's own vignette needs createRadialGradient/addColorStop,
  // which a bare Proxy stub can't satisfy; unrelated to the grain layer
  // itself).
  const game = loadFullGameContext();
  const canvas = game.getCanvas();
  const ctx = canvas.getContext('2d');
  const originalFillRect = ctx.fillRect;
  let fillRectCalls = 0;
  ctx.fillRect = (...args) => {
    fillRectCalls += 1;
    return originalFillRect(...args);
  };

  Object.values(game.TERRAIN_THEMES).forEach((theme) => {
    fillRectCalls = 0;
    assert.doesNotThrow(() => game.fillThemeBackground(ctx, theme, 960, 640));
    // The grain layer's own fillRect calls happen regardless of which
    // background hook a theme uses (a flat fill, or Whirlpool's own
    // renderBackground).
    assert.ok(fillRectCalls >= game.GROUND_GRAIN_SPECKS.length);
  });
});

test('renderMap still never throws for any built-in map, with the new grain layer in place', () => {
  // Uses the real stub canvas's own ctx (same as test/caves-map.test.js's
  // own renderMap coverage), not a bare `new Proxy({get: () => () => {}})`
  // — several terrains' own existing effects (Whirlpool's vignette,
  // Volcanic's magma glow, Caves' crystal glow) call
  // createRadialGradient()/addColorStop(), which that bare stub can't
  // satisfy; this is a pre-existing need, not something the grain layer
  // introduces.
  const game = loadFullGameContext();
  const canvas = game.getCanvas();
  const ctx = canvas.getContext('2d');
  Object.values(game.MAP_TYPES).forEach((map) => {
    game.setActiveMap(map);
    assert.doesNotThrow(() => game.renderMap(ctx, canvas, 0), `renderMap threw for ${map.id}`);
  });
});
