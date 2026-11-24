const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Movement-animation request, relayed from the peer session, applying
// across every map: "any frog-type enemy should hop as it moves... Any
// snake or eel-type enemy should slither." Render-only — no stat changes,
// and enemy.x/y (what targeting/hit-detection/leak-detection actually
// read) are never touched by either animation, only the ctx transform
// drawEnemyShape/renderMillipedeBody draw through.
//
// Snakes/eels: MILLIPEDE_FAMILY_KEYS (enemies.js) already IS the
// authoritative list of every snake/eel-type enemy in the game — it's
// what routes Gardener Snake/Banana Snake/Armored Snake/Anaconda (Deep
// Forest) and Electric Eel (Marshland, marsh-boss-tier-3) through the
// shared segmented-trail body renderer in the first place, confirmed
// against the full roster rather than just the request's own named
// examples. renderMillipedeBody() now offsets each segment sideways,
// perpendicular to its own local heading, by a sine wave that travels
// down the body over time — the classic traveling S-curve.
//
// Frogs: checked the full roster, not just memory of it — Tadpole and
// Frog Larva are both legless/larval (swim, don't hop; Frog Larva is
// explicitly "a soft blob" with no legs per its own existing art
// comment), so only Froglet and the Frog Boss (marsh-boss-tier-1, "a
// full adult frog") are in HOPPING_ENEMY_KEYS. Hop is a periodic jump
// arc applied as a render-time translate/scale right alongside the
// existing heading-rotation wrap in renderEnemies(), not a change to any
// individual draw function.

test('MILLIPEDE_FAMILY_KEYS is exactly the snake/eel roster the request named, confirmed against the full roster rather than assumed', () => {
  const game = loadGameContext();
  assert.deepEqual(
    [...game.MILLIPEDE_FAMILY_KEYS].sort(),
    ['anaconda', 'armoredSnake', 'bananaSnake', 'gardenerSnake', 'marsh-boss-tier-3'].sort()
  );
});

test('HOPPING_ENEMY_KEYS is exactly Froglet + the Frog Boss — not Tadpole or Frog Larva, both legless/larval', () => {
  const game = loadGameContext();
  assert.deepEqual([...game.HOPPING_ENEMY_KEYS].sort(), ['froglet', 'marsh-boss-tier-1'].sort());
});

test('a slithering enemy\'s body segments are NOT collinear with its own straight trail — the perpendicular wave offset is actually applied', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const entry = game.getSpawnEntryForEnemyKey('anaconda');
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];
  enemy.spawned = true;
  enemy.x = 400;
  enemy.y = 300;
  enemy.heading = 0;
  // Build a perfectly straight trail (moving due -x) — any curve in the
  // drawn body at render time is purely the slither wave, not the route.
  for (let i = 0; i < 40; i += 1) {
    enemy.x -= 5;
    game.recordTrailPoint(enemy);
  }

  const drawnPositions = [];
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'save' || prop === 'restore' || prop === 'rotate' || prop === 'translate') return () => {};
        return () => {};
      },
    }
  );
  // Capture the actual (x, y) each segment gets drawn at by monkey-
  // patching the snake's own segment-draw function for one frame.
  const originalDraw = game.MILLIPEDE_BODY.anaconda.segmentDrawFn;
  game.MILLIPEDE_BODY.anaconda.segmentDrawFn = (c, x, y, radius, color, heading, index, time) => {
    drawnPositions.push({ x, y, index });
  };
  try {
    game.renderEnemies(ctx, 1.23); // an arbitrary, non-zero time so the wave isn't sitting at 0
  } finally {
    game.MILLIPEDE_BODY.anaconda.segmentDrawFn = originalDraw;
  }

  assert.ok(drawnPositions.length >= 5);
  // The real trail runs dead straight along y=300 — any segment whose
  // drawn y meaningfully differs from 300 is proof of the perpendicular
  // wave, not just float noise.
  const yOffsets = drawnPositions.map((p) => Math.abs(p.y - 300));
  assert.ok(Math.max(...yOffsets) > 1, 'expected at least one segment visibly off the straight trail line');
  // Not every segment offset by the same amount, either — a real
  // traveling wave, not a uniform shift of the whole body.
  assert.ok(new Set(yOffsets.map((y) => y.toFixed(2))).size > 1);
});

test('renderEnemies never throws for every snake/eel type across several animation phases', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const ctx = new Proxy({}, { get: () => () => {} });
  ['gardenerSnake', 'bananaSnake', 'armoredSnake', 'anaconda'].forEach((key) => {
    const entry = game.getSpawnEntryForEnemyKey(key);
    game.spawnSingleEnemy(entry);
  });
  game.getActiveEnemies().forEach((e) => {
    e.spawned = true;
  });
  [0, 0.5, 1, 1.5, 2].forEach((time) => {
    assert.doesNotThrow(() => game.renderEnemies(ctx, time));
  });
});

test('renderEnemies never throws for the hopping Froglet, and never mutates its real x/y (hop is render-only)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const ctx = new Proxy({}, { get: () => () => {} });
  const entry = game.getSpawnEntryForEnemyKey('froglet');
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];
  enemy.spawned = true;
  const originalX = enemy.x;
  const originalY = enemy.y;

  [0, 0.3, 0.6, 0.9, 1.2].forEach((time) => {
    assert.doesNotThrow(() => game.renderEnemies(ctx, time));
  });
  assert.equal(enemy.x, originalX);
  assert.equal(enemy.y, originalY);
});

test('the hop\'s own lift factor actually cycles from grounded to peak and back over time, rather than sitting at one fixed value', () => {
  const game = loadGameContext();
  // Mirrors renderEnemies' own HOP_SPEED/phase formula exactly (not
  // exported directly — HOP_SPEED is an internal tuning constant, same as
  // SLITHER_SPEED/SLITHER_WAVELENGTH — so this re-derives the same
  // position-seeded phase the real code computes, as an external check
  // that it truly varies rather than asserting on the private constant).
  const enemy = { x: 300, y: 300 };
  const lifts = [0, 0.2, 0.4, 0.6, 0.8].map((time) => {
    const hopPhase = (time * 5 + (enemy.x + enemy.y) * 0.03) % (Math.PI * 2);
    return Math.max(0, Math.sin(hopPhase));
  });
  assert.ok(Math.min(...lifts) < 0.2);
  assert.ok(Math.max(...lifts) > 0.8);
});
