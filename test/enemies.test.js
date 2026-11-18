const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

test('round 1 wave is just 5 Ants, scaled to a baseline count/health', () => {
  const game = loadGameContext();
  const wave = game.generateWave(1);

  assert.equal(wave.length, 1);
  assert.equal(wave[0].enemyKey, 'ant');
  assert.equal(wave[0].count, 5); // WAVE_SIZE_AT_ROUND_1, undivided (1 unlocked type)
  assert.equal(wave[0].health, 2); // Ant's doubled base health
  assert.equal(wave[0].bounty, game.ENEMY_TYPES.ant.bounty);
});

test('total wave size scales from 5 at round 1 up to 25 at round 25, then holds flat', () => {
  const game = loadGameContext();
  const totalAt = (round) => game.generateWave(round).reduce((sum, entry) => sum + entry.count, 0);

  const round1Total = totalAt(1);
  const round13Total = totalAt(13); // midpoint
  const round25Total = totalAt(25);
  const round60Total = totalAt(60); // well past 25

  assert.equal(round1Total, 5);
  assert.ok(round13Total > round1Total && round13Total < round25Total);
  assert.equal(round25Total, 25);
  assert.equal(round60Total, 25); // capped, not still climbing

  // Health, meanwhile, keeps climbing regardless — the count curve is an
  // additional lever on top of it, not a replacement for it.
  const round1Health = game.generateWave(1)[0].health;
  const round10Health = game.generateWave(10).find((entry) => entry.enemyKey === 'ant').health;
  assert.ok(round10Health > round1Health);
});

test('more enemy types unlock as rounds progress, Fly joining last in tier 1', () => {
  const game = loadGameContext();
  assert.deepEqual(game.getUnlockedEnemyTypes(5), ['ant']);
  assert.deepEqual(game.getUnlockedEnemyTypes(6), ['ant', 'worm']);
  assert.deepEqual(game.getUnlockedEnemyTypes(11), ['ant', 'worm', 'tinyIsopod']);
  // Tier 1 stays at 3 types through round 15 — Fly hasn't unlocked yet.
  assert.deepEqual(game.getUnlockedEnemyTypes(15), ['ant', 'worm', 'tinyIsopod']);
  assert.deepEqual(game.getUnlockedEnemyTypes(16), ['ant', 'worm', 'tinyIsopod', 'fly']);
  // Tier 1 stays maxed out (all 4) through round 25 — tier 2 hasn't started yet.
  assert.deepEqual(game.getUnlockedEnemyTypes(25), ['ant', 'worm', 'tinyIsopod', 'fly']);
});

test('tier-2 enemies unlock progressively starting the round after the round-25 boss', () => {
  const game = loadGameContext();
  const tier1 = ['ant', 'worm', 'tinyIsopod', 'fly'];
  assert.deepEqual(game.getUnlockedEnemyTypes(26), [...tier1, 'tadpole']);
  assert.deepEqual(game.getUnlockedEnemyTypes(31), [...tier1, 'tadpole', 'babyFrog']);
  assert.deepEqual(game.getUnlockedEnemyTypes(36), [...tier1, 'tadpole', 'babyFrog', 'poisonDartFrog']);
  // Never unlocks more than either roster has, however high the round.
  assert.deepEqual(game.getUnlockedEnemyTypes(1000), [...tier1, 'tadpole', 'babyFrog', 'poisonDartFrog']);
});

test('every 25th round is a boss wave, carrying the boss\'s own bounty', () => {
  const game = loadGameContext();
  assert.equal(game.isBossRound(24), false);
  assert.equal(game.isBossRound(25), true);
  assert.equal(game.isBossRound(50), true);

  const wave = game.generateWave(25);
  assert.equal(wave.length, 1);
  assert.equal(wave[0].isBoss, true);
  assert.equal(wave[0].name, 'Giant Beetle');
  assert.equal(wave[0].bounty, game.BOSS_TYPES[1].bounty);
});

test('round 50 spawns the tier-2 boss (Boss Toad), not a tier-1 fallback', () => {
  const game = loadGameContext();
  const round50Wave = game.generateWave(50);
  assert.equal(round50Wave[0].name, 'Boss Toad');
  assert.equal(round50Wave[0].bounty, game.BOSS_TYPES[2].bounty);
});

test('an undesigned boss tier (beyond the highest designed one) falls back, not a new boss', () => {
  const game = loadGameContext();
  const round75Wave = game.generateWave(75); // tier 3, not designed yet
  assert.equal(round75Wave[0].name, 'Boss Toad'); // falls back to the strongest designed tier
});

test('spawnWave lays out the right number of enemy instances, staggered', () => {
  const game = loadGameContext();
  game.spawnWave(game.generateWave(1));
  const active = game.getActiveEnemies();

  assert.equal(active.length, 5); // 5 Ants (round 1's wave size)
  assert.equal(active[0].spawnDelay, 0);
  assert.ok(active[1].spawnDelay > active[0].spawnDelay);
});

test('updateEnemies moves a spawned enemy toward the next waypoint', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'ant', name: 'Ant', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  const startX = enemy.x;

  game.updateEnemies(0.1); // enemy.speed = BASE_SPEED * 1 = 60px/s -> 6px this tick
  assert.ok(enemy.x > startX);
});

test('an immobilized enemy (Rose Root Path\'s grab) does not move, but still takes burn damage', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'ant', name: 'Ant', color: '#000', radius: 8, count: 1, health: 1000, speedMultiplier: 1, isBoss: false, bounty: 2 },
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
    { enemyKey: 'ant', name: 'Ant', color: '#000', radius: 8, count: 1, health: 1000, speedMultiplier: 1, isBoss: false, bounty: 2 },
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
    { enemyKey: 'ant', name: 'Ant', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
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
    { enemyKey: 'ant', name: 'Ant', color: '#000', radius: 8, count: 1, health: 1000, speedMultiplier: 1, isBoss: false, bounty: 2 },
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
    { enemyKey: 'ant', name: 'Ant', color: '#000', radius: 8, count: 3, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
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
    { enemyKey: 'ant', name: 'Ant', color: '#000', radius: 8, count: 2, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
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

test('tier-3 enemies unlock progressively starting the round after the round-50 boss', () => {
  const game = loadGameContext();
  const tier1and2 = ['ant', 'worm', 'tinyIsopod', 'fly', 'tadpole', 'babyFrog', 'poisonDartFrog'];
  assert.deepEqual(game.getUnlockedEnemyTypes(50), tier1and2); // round 50 itself is still the boss round's gate
  assert.deepEqual(game.getUnlockedEnemyTypes(51), [...tier1and2, 'hammerheadWorm']);
  assert.deepEqual(game.getUnlockedEnemyTypes(56), [...tier1and2, 'hammerheadWorm', 'babyMillipede']);
  assert.deepEqual(game.getUnlockedEnemyTypes(61), [...tier1and2, 'hammerheadWorm', 'babyMillipede', 'armoredMillipede']);
  assert.deepEqual(
    game.getUnlockedEnemyTypes(66),
    [...tier1and2, 'hammerheadWorm', 'babyMillipede', 'armoredMillipede', 'giantCentipede']
  );
});

test('round 50 is a boss wave (Boss Toad), not the tier-3 regular roster', () => {
  const game = loadGameContext();
  const wave = game.generateWave(50);
  assert.equal(wave.length, 1);
  assert.equal(wave[0].isBoss, true);
  assert.equal(wave[0].name, 'Boss Toad');
});

test('tier-3 bounties follow the ~HP/2 convention', () => {
  const game = loadGameContext();
  assert.equal(game.ENEMY_TYPES.hammerheadWorm.bounty, 25); // 50/2
  assert.equal(game.ENEMY_TYPES.babyMillipede.bounty, 30); // 60/2
  assert.equal(game.ENEMY_TYPES.armoredMillipede.bounty, 50); // 100/2
  assert.equal(game.ENEMY_TYPES.giantCentipede.bounty, 125); // 250/2
});

test('only the 3 milli/centipede types are in the millipede family, not Hammerhead Worm', () => {
  const game = loadGameContext();
  assert.deepEqual(
    [...game.MILLIPEDE_FAMILY_KEYS].sort(),
    ['armoredMillipede', 'babyMillipede', 'giantCentipede']
  );
  assert.equal(game.MILLIPEDE_FAMILY_KEYS.has('hammerheadWorm'), false);
});

test('a millipede-family enemy gets a trail array; a non-millipede enemy does not', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'babyMillipede', name: 'Baby Millipede', color: '#000', radius: 7, count: 1, health: 60, speedMultiplier: 0.7, isBoss: false, bounty: 30 },
    { enemyKey: 'hammerheadWorm', name: 'Hammerhead Worm', color: '#000', radius: 11, count: 1, health: 50, speedMultiplier: 0.6, isBoss: false, bounty: 25 },
  ]);
  const [millipede, worm] = game.getActiveEnemies();
  assert.deepEqual(millipede.trail, []);
  assert.equal(worm.trail, null);
});

test('recordTrailPoint only adds a point once the enemy has moved far enough', () => {
  const game = loadGameContext();
  const enemy = { x: 0, y: 0, radius: 7, enemyKey: 'babyMillipede', trail: [] };

  game.recordTrailPoint(enemy); // first point always recorded
  assert.equal(enemy.trail.length, 1);

  enemy.x = 1; // well under TRAIL_POINT_SPACING (4px)
  game.recordTrailPoint(enemy);
  assert.equal(enemy.trail.length, 1); // too soon, no new point

  enemy.x = 10; // now far enough from the last recorded point
  game.recordTrailPoint(enemy);
  assert.equal(enemy.trail.length, 2);
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

test('a millipede that walks around a corner leaves a trail that actually bends, not a straight line', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'babyMillipede', name: 'Baby Millipede', color: '#000', radius: 7, count: 1, health: 60, speedMultiplier: 1, isBoss: false, bounty: 30 },
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
