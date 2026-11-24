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
// full adult frog") are in HOPPING_ENEMY_KEYS.
//
// Hop is a two-part design, corrected after an initial render-only pass
// was (correctly) called out as "continuously sliding forward with a
// hop animation layered on top": (1) getHopState(enemy, time) is a pure
// function of a STABLE per-enemy hopSeed (set once at spawn, never
// derived from x/y) that reports isAirborne/lift/squash for the current
// point in HOP_PERIOD; renderEnemies() uses it to apply a render-time
// translate/scale, same as before, not a change to any individual draw
// function. (2) updateEnemies() now ALSO reads the same getHopState to
// gate real per-frame movement for HOPPING_ENEMY_KEYS — zero distance
// budget while resting, boosted by 1/HOP_AIRBORNE_FRACTION while
// airborne so the enemy's average speed over a full cycle still matches
// its configured stat. enemyMovementClock is a clock local to
// enemies.js (not game.js's animationTime) so this file's own light
// test harness, which loads enemies.js without game.js, can drive
// updateEnemies/getHopState with no cross-file dependency.

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

test('renderEnemies never throws for the hopping Froglet, and never itself mutates its real x/y (the render pass only transforms the ctx; actual movement gating happens in updateEnemies, tested below)', () => {
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

test('getHopState\'s own lift cycles from grounded to peak and back across the airborne window, and is exactly 0 for the rest of the cycle (a real pause, not just a soft landing)', () => {
  const game = loadGameContext();
  const enemy = { hopSeed: 0 };
  const samples = [];
  for (let t = 0; t <= game.HOP_PERIOD; t += game.HOP_PERIOD / 40) {
    samples.push(game.getHopState(enemy, t));
  }
  const airborneSamples = samples.filter((s) => s.isAirborne);
  const restingSamples = samples.filter((s) => !s.isAirborne);
  assert.ok(airborneSamples.length > 0 && restingSamples.length > 0);
  assert.ok(Math.max(...airborneSamples.map((s) => s.lift)) > 0.8); // genuinely reaches a real peak
  restingSamples.forEach((s) => assert.equal(s.lift, 0)); // grounded means grounded, not "barely off the floor"
});

test('direct follow-up fix: a frog-type enemy\'s real x/y only advances during the airborne portion of its own hop cycle — a genuine pause at ground level in between, not just a visual bob on top of continuous movement', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const entry = game.getSpawnEntryForEnemyKey('froglet');
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];
  enemy.spawned = true;

  const samples = [];
  for (let i = 0; i < 120; i += 1) {
    game.updateEnemies(1 / 60);
    samples.push({ x: enemy.x, y: enemy.y, isAirborne: game.getHopState(enemy, game.getEnemyMovementClock()).isAirborne });
  }

  // Never moves across two consecutive RESTING frames.
  for (let i = 1; i < samples.length; i += 1) {
    if (!samples[i].isAirborne && !samples[i - 1].isAirborne) {
      assert.equal(samples[i].x, samples[i - 1].x, `moved while resting at frame ${i}`);
      assert.equal(samples[i].y, samples[i - 1].y, `moved while resting at frame ${i}`);
    }
  }
  // Does actually move at some point while airborne — not permanently stuck.
  const movedWhileAirborne = samples.some((s, i) => i > 0 && s.isAirborne && (s.x !== samples[i - 1].x || s.y !== samples[i - 1].y));
  assert.equal(movedWhileAirborne, true);
  // A real resting stretch of more than just one frame exists.
  let maxRestingRun = 0;
  let run = 0;
  samples.forEach((s) => {
    run = s.isAirborne ? 0 : run + 1;
    maxRestingRun = Math.max(maxRestingRun, run);
  });
  assert.ok(maxRestingRun > 5, `expected a real multi-frame pause, longest resting run was ${maxRestingRun} frames`);
});

test('a hopping enemy still makes reasonable average forward progress over a full cycle (the airborne-window speed boost compensates for the pauses)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const entry = game.getSpawnEntryForEnemyKey('froglet');
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];
  enemy.spawned = true;
  const startX = enemy.x;

  // Run for several full hop-rest cycles.
  const ticks = Math.ceil((game.HOP_PERIOD * 4) / (1 / 60));
  for (let i = 0; i < ticks; i += 1) game.updateEnemies(1 / 60);

  const actualDistance = Math.abs(enemy.x - startX);
  const expectedDistance = enemy.speed * game.HOP_PERIOD * 4; // same average speed as a non-hopping enemy would cover
  // Within a generous tolerance (frame quantization, the final partial
  // cycle) rather than an exact match.
  assert.ok(
    Math.abs(actualDistance - expectedDistance) < expectedDistance * 0.25,
    `expected roughly ${expectedDistance}px of progress, got ${actualDistance}px`
  );
});
