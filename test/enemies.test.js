const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

test('round 1 wave is just Ants, scaled to a baseline count/health', () => {
  const game = loadGameContext();
  const wave = game.generateWave(1);

  assert.equal(wave.length, 1);
  assert.equal(wave[0].enemyKey, 'ant');
  assert.equal(wave[0].count, 3);
  assert.equal(wave[0].health, 1);
  assert.equal(wave[0].bounty, game.ENEMY_TYPES.ant.bounty);
});

test('wave size per enemy type stays flat across rounds — only health scales up', () => {
  const game = loadGameContext();
  const round1Count = game.generateWave(1)[0].count;
  const round10Counts = game.generateWave(10).map((entry) => entry.count);
  const round40Counts = game.generateWave(40).map((entry) => entry.count);

  round10Counts.concat(round40Counts).forEach((count) => assert.equal(count, round1Count));

  // Health, meanwhile, keeps climbing — the one remaining scaling lever
  // besides unlocking new enemy types.
  const round1Health = game.generateWave(1)[0].health;
  const round10Health = game.generateWave(10).find((entry) => entry.enemyKey === 'ant').health;
  assert.ok(round10Health > round1Health);
});

test('more enemy types unlock as rounds progress', () => {
  const game = loadGameContext();
  assert.deepEqual(game.getUnlockedEnemyTypes(5), ['ant']);
  assert.deepEqual(game.getUnlockedEnemyTypes(6), ['ant', 'worm']);
  assert.deepEqual(game.getUnlockedEnemyTypes(11), ['ant', 'worm', 'tinyIsopod']);
  // Tier 1 stays maxed out through round 25 — tier 2 hasn't started yet.
  assert.deepEqual(game.getUnlockedEnemyTypes(25), ['ant', 'worm', 'tinyIsopod']);
});

test('tier-2 enemies unlock progressively starting the round after the round-25 boss', () => {
  const game = loadGameContext();
  const tier1 = ['ant', 'worm', 'tinyIsopod'];
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

  assert.equal(active.length, 3); // 3 Ants
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
