const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// The enemy roster (ENEMY_TYPES/BOSS_TYPES/ENEMY_ORDER*) was deliberately
// emptied — see js/enemies.js's own header comment. These tests cover the
// generic engine around that empty roster (wave generation degrading
// gracefully, movement/combat/targeting, the millipede-family trail
// mechanism) rather than any specific enemy type, since there isn't one
// right now.

test('getTotalWaveSize scales from 5 at round 1 up to 25 at round 25, then holds flat', () => {
  const game = loadGameContext();
  assert.equal(game.getTotalWaveSize(1), 5);
  assert.equal(game.getTotalWaveSize(25), 25);
  assert.equal(game.getTotalWaveSize(60), 25); // capped, not still climbing
  assert.ok(game.getTotalWaveSize(13) > game.getTotalWaveSize(1) && game.getTotalWaveSize(13) < game.getTotalWaveSize(25));
});

test('getRoundScaling keeps climbing regardless of round size — +10% health every 3 rounds', () => {
  const game = loadGameContext();
  assert.equal(game.getRoundScaling(1).healthMultiplier, 1);
  assert.ok(game.getRoundScaling(10).healthMultiplier > game.getRoundScaling(1).healthMultiplier);
});

test('getUnlockedEnemyTypes returns no types for any round — the roster is currently empty', () => {
  const game = loadGameContext();
  assert.deepEqual(game.getUnlockedEnemyTypes(1), []);
  assert.deepEqual(game.getUnlockedEnemyTypes(25), []);
  assert.deepEqual(game.getUnlockedEnemyTypes(26), []);
  assert.deepEqual(game.getUnlockedEnemyTypes(1000), []);
});

test('generateWave degrades to an empty wave on a non-boss round — no regular types to draw from', () => {
  const game = loadGameContext();
  assert.deepEqual(game.generateWave(1), []);
  assert.deepEqual(game.generateWave(24), []);
});

test('every 25th round is still flagged as a boss round, independent of whether a boss is designed', () => {
  const game = loadGameContext();
  assert.equal(game.isBossRound(24), false);
  assert.equal(game.isBossRound(25), true);
  assert.equal(game.isBossRound(50), true);
});

test('getBossForRound returns null — no boss tier is currently designed', () => {
  const game = loadGameContext();
  assert.equal(game.getBossForRound(25), null);
  assert.equal(game.getBossForRound(50), null);
});

test('generateWave degrades to an empty wave on a boss round too, rather than spawning a broken boss', () => {
  const game = loadGameContext();
  assert.deepEqual(game.generateWave(25), []);
  assert.deepEqual(game.generateWave(50), []);
});

test('getSpawnEntryForEnemyKey returns null for every key — nothing is spawnable with an empty roster', () => {
  const game = loadGameContext();
  // Not exported from the light context — exercised via the full context
  // in game-modes.test.js instead. Covered here indirectly: an unknown
  // key always resolving to "nothing" is exactly today's roster state for
  // every key, not just a made-up one — see getSpawnEntryForEnemyKey
  // itself in enemies.js, unchanged by the roster removal.
  assert.deepEqual(game.ENEMY_TYPES, {});
  assert.deepEqual(game.BOSS_TYPES, {});
});

test('spawnWave lays out the right number of enemy instances from a manual composition, staggered', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 5, health: 2, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const active = game.getActiveEnemies();

  assert.equal(active.length, 5);
  assert.equal(active[0].spawnDelay, 0);
  assert.ok(active[1].spawnDelay > active[0].spawnDelay);
});

test('updateEnemies moves a spawned enemy toward the next waypoint', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  const startX = enemy.x;

  game.updateEnemies(0.1); // enemy.speed = BASE_SPEED * 1 = 60px/s -> 6px this tick
  assert.ok(enemy.x > startX);
});

test('an immobilized enemy (Rose Root Path\'s grab) does not move, but still takes burn damage', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1000, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  enemy.spawned = true;
  enemy.immobilizedRemaining = 2;
  enemy.burn = { damagePerSecond: 10, remaining: 5 };
  const startX = enemy.x;

  game.updateEnemies(1);

  assert.equal(enemy.x, startX); // held in place — movement is skipped entirely
  assert.equal(enemy.health, 990); // burn still ticks while immobilized
  assert.equal(enemy.immobilizedRemaining, 1); // counts down toward 0
});

test('an already-dead enemy does not move or take further burn damage before being swept up', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1000, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  enemy.spawned = true;
  enemy.health = -1;
  enemy.burn = { damagePerSecond: 999, remaining: 5 };
  const xBefore = enemy.x;

  const killed = game.updateEnemies(1); // a full second — plenty to move or burn-tick if allowed to

  assert.equal(enemy.x, xBefore); // didn't move
  assert.equal(enemy.health, -1); // no extra burn damage either
  assert.equal(killed.length, 1);
});

test('updateEnemies returns enemies that died, separately from ones that reached the goal', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();

  game.damageEnemy(enemy, 999); // kill it without moving it
  const killed = game.updateEnemies(0.0001);

  assert.equal(killed.length, 1);
  assert.equal(killed[0], enemy);
  assert.equal(game.getActiveEnemies().length, 0);
});

test('an enemy that reaches the final waypoint is removed but not reported as killed', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1000, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);

  // Push it straight past the end of the path in one giant tick rather
  // than simulating the whole walk.
  const killed = game.updateEnemies(1000);

  assert.equal(killed.length, 0); // reached the goal, not killed
  assert.equal(game.getActiveEnemies().length, 0);
});

test('findNearestEnemyInRange ignores unspawned, dead, and out-of-range enemies', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 3, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [a, b, c] = game.getActiveEnemies();
  a.spawned = true; a.x = 0; a.y = 0;
  b.spawned = true; b.x = 5; b.y = 0; b.health = 0; // dead
  c.spawned = false; c.x = 1; c.y = 0; // not spawned yet

  const found = game.findNearestEnemyInRange(0, 0, 100);
  assert.equal(found, a);
});

test('getEnemiesInRadius returns every live enemy within range, not just the nearest', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 2, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [a, b] = game.getActiveEnemies();
  a.spawned = true; a.x = 0; a.y = 0;
  b.spawned = true; b.x = 10; b.y = 0;

  assert.equal(game.getEnemiesInRadius(0, 0, 20).length, 2);
  assert.equal(game.getEnemiesInRadius(0, 0, 5).length, 1);
});

test('applyBurn sets a fresh damage-over-time window on the enemy', () => {
  const game = loadGameContext();
  const enemy = { health: 100 };
  game.applyBurn(enemy, { damagePerSecond: 10, duration: 5 });
  assert.deepEqual(enemy.burn, { damagePerSecond: 10, duration: 5 });
});

// --- Millipede-family trail mechanism (generic engine, no real type left) --

test('MILLIPEDE_FAMILY_KEYS is empty — no current type opts into the segmented-trail rendering', () => {
  const game = loadGameContext();
  assert.deepEqual([...game.MILLIPEDE_FAMILY_KEYS], []);
});

test('an enemy whose key is in MILLIPEDE_FAMILY_KEYS gets a trail array; others get null', () => {
  const game = loadGameContext();
  game.MILLIPEDE_FAMILY_KEYS.add('testSegmentedBug'); // simulates a future type opting in
  game.spawnWave([
    { enemyKey: 'testSegmentedBug', name: 'Test Segmented Bug', color: '#000', radius: 7, count: 1, health: 60, speedMultiplier: 0.7, isBoss: false, bounty: 30 },
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 11, count: 1, health: 50, speedMultiplier: 0.6, isBoss: false, bounty: 25 },
  ]);
  const [segmented, plain] = game.getActiveEnemies();
  assert.deepEqual(segmented.trail, []);
  assert.equal(plain.trail, null);
});

test('recordTrailPoint only adds a point once the enemy has moved far enough', () => {
  const game = loadGameContext();
  const enemy = { x: 0, y: 0, radius: 7, enemyKey: 'testSegmentedBug', trail: [] };

  game.recordTrailPoint(enemy); // first point always recorded
  assert.equal(enemy.trail.length, 1);

  enemy.x = 1; // well under TRAIL_POINT_SPACING (4px)
  game.recordTrailPoint(enemy);
  assert.equal(enemy.trail.length, 1); // too soon, no new point

  enemy.x = 10; // now far enough from the last recorded point
  game.recordTrailPoint(enemy);
  assert.equal(enemy.trail.length, 2);
});

test('recordTrailPoint falls back to a default body config for a key with no MILLIPEDE_BODY entry', () => {
  const game = loadGameContext();
  const enemy = { x: 0, y: 0, radius: 7, enemyKey: 'someKeyNotInMilliBody', trail: [] };
  // Would throw if recordTrailPoint assumed MILLIPEDE_BODY[enemy.enemyKey] always exists.
  game.recordTrailPoint(enemy);
  assert.equal(enemy.trail.length, 1);
});

test('getTrailPointAtDistance walks back through the trail by arc length, interpolating between points', () => {
  const game = loadGameContext();
  const enemy = {
    x: 20, y: 0,
    trail: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  };

  // 5px behind the head (20,0): between the trail's (10,0) and the head itself.
  const halfway = game.getTrailPointAtDistance(enemy, 5);
  assert.ok(Math.abs(halfway.x - 15) < 1e-9);
  assert.ok(Math.abs(halfway.y - 0) < 1e-9);

  // Exactly at the oldest trail point (20px behind the head).
  const atOldest = game.getTrailPointAtDistance(enemy, 20);
  assert.ok(Math.abs(atOldest.x - 0) < 1e-9);
});

test('getTrailPointAtDistance returns the oldest point when asked for more distance than the trail has', () => {
  const game = loadGameContext();
  const enemy = { x: 5, y: 0, trail: [{ x: 0, y: 0 }] };
  const result = game.getTrailPointAtDistance(enemy, 1000);
  assert.deepEqual(result, { x: 0, y: 0 });
});

test('a segmented-family enemy that walks around a corner leaves a trail that actually bends, not a straight line', () => {
  const game = loadGameContext();
  game.MILLIPEDE_FAMILY_KEYS.add('testSegmentedBug'); // simulates a future type opting in
  game.spawnWave([
    { enemyKey: 'testSegmentedBug', name: 'Test Segmented Bug', color: '#000', radius: 7, count: 1, health: 60, speedMultiplier: 1, isBoss: false, bounty: 30 },
  ]);
  const [enemy] = game.getActiveEnemies();
  enemy.spawned = true;
  enemy.x = 215; // just before the path's first corner at (220, 80) -> (220, 300)
  enemy.y = 80;
  enemy.waypointIndex = 0;

  for (let i = 0; i < 180; i += 1) game.updateEnemies(1 / 60); // walk well past the corner

  // The trail should contain points from both the horizontal approach
  // (y ~ 80) and the vertical departure (x ~ 220) — i.e. it actually
  // curls around the corner instead of being a single straight run.
  const nearHorizontal = enemy.trail.some((p) => Math.abs(p.y - 80) < 2);
  const nearVertical = enemy.trail.some((p) => Math.abs(p.x - 220) < 2 && p.y > 85);
  assert.ok(nearHorizontal, 'expected some trail points still on the horizontal approach');
  assert.ok(nearVertical, 'expected some trail points on the vertical departure past the corner');
});
