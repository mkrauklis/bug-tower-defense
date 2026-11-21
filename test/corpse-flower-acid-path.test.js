const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Corpse Flower's Acidic Mixture Path (direct request, mutually exclusive
// with Hazard Path): a second, independent damage source — a distinct
// acid projectile fired on its own fixed 2-second cooldown
// (ACID_SHOT_INTERVAL), completely separate from the base attack's own
// cadence, dealing its own damage AND applying a timed speed-slow debuff
// (enemy.slow) on hit — a genuinely new mechanic, distinct from the
// existing immobilizedRemaining full-stop. attackDamage: 7/15/20/20;
// acid damage: 5/10/15/15; slow: 20/30/35/35%; slow duration: 5/5/5/7s.

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod', name: 'Tiny Isopod', color: '#78909c', radius: 12,
    maxHealth: 100000, health: 100000, speed: 60, isBoss: false, bounty: 10,
    waypointIndex: 0, pathIndex: 0, spawnDelay: 0, spawned: true, x: 0, y: 0,
    immobilizedRemaining: 0, infectedRemaining: 0, isZombie: false, isPurpleZombie: false,
    markedForRemoval: false, zombieExplosionDamage: 0, tunnelInterval: 0,
    ...overrides,
  };
}

function maxOutAcidPath(game, tower, tiers = 4) {
  for (let i = 0; i < tiers; i += 1) game.purchaseUpgrade(tower, 1); // Acidic Mixture Path is pathIndex 1
}

test('Acidic Mixture Path is real (path 2) and still mutually exclusive with Hazard Path (path 1)', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  assert.ok(game.getAvailableUpgrade(tower, 1)); // Acidic Mixture Path

  game.purchaseUpgrade(tower, 1);
  assert.equal(tower.chosenPath, 1);
  assert.equal(game.getAvailableUpgrade(tower, 0), null); // Hazard Path locked out once Acidic Mixture is chosen
});

test('each tier replaces the base attack damage with its own absolute value: 7/15/20/20', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');

  game.purchaseUpgrade(tower, 1); // Acidic Mixture
  assert.equal(tower.stats.damage, 7); // deliberately BELOW the unupgraded tower's base 10

  game.purchaseUpgrade(tower, 1); // Acid Reflux
  assert.equal(tower.stats.damage, 15);

  game.purchaseUpgrade(tower, 1); // Acidtonics
  assert.equal(tower.stats.damage, 20);

  game.purchaseUpgrade(tower, 1); // Dissolvable Mixture
  assert.equal(tower.stats.damage, 20); // restated, unchanged from tier 3
});

test('tier 1 ("larger") bumps the tower\'s own size, and every tier darkens its color', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  const baseSize = tower.stats.size;
  const baseColor = tower.stats.color;

  game.purchaseUpgrade(tower, 1);
  assert.ok(Math.abs(tower.stats.size - baseSize * 1.15) < 1e-9);
  assert.notEqual(tower.stats.color, baseColor);
  const tier1Color = tower.stats.color;

  game.purchaseUpgrade(tower, 1);
  assert.notEqual(tower.stats.color, tier1Color);
  // Size doesn't change again after tier 1 — no further sizeMultiplier in later tiers.
  assert.ok(Math.abs(tower.stats.size - baseSize * 1.15) < 1e-9);
});

test('each tier replaces the acid\'s own damage/slow/duration with its own absolute values', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  assert.equal(tower.acid, null);

  game.purchaseUpgrade(tower, 1); // Acidic Mixture
  assert.deepEqual(tower.acid, { damage: 5, slowMultiplier: 0.8, slowDuration: 5, color: '#9ccc65' });
  assert.equal(tower.acidCooldown, game.ACID_SHOT_INTERVAL); // doesn't fire instantly on purchase

  game.purchaseUpgrade(tower, 1); // Acid Reflux
  assert.deepEqual(tower.acid, { damage: 10, slowMultiplier: 0.7, slowDuration: 5, color: '#9ccc65' });

  game.purchaseUpgrade(tower, 1); // Acidtonics — acid turns red
  assert.deepEqual(tower.acid, { damage: 15, slowMultiplier: 0.65, slowDuration: 5, color: '#e53935' });

  game.purchaseUpgrade(tower, 1); // Dissolvable Mixture — only duration extends, to 7s
  assert.deepEqual(tower.acid, { damage: 15, slowMultiplier: 0.65, slowDuration: 7, color: '#e53935' });
});

test('the acid fires on its own fixed 2-second cadence, independent of the base attack\'s own cooldown', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 1);

  const enemy = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(enemy);

  game.updateTowerAcidShot(tower, tower.x, tower.y, game.ACID_SHOT_INTERVAL - 0.001);
  assert.equal(game.getProjectiles().length, 0); // hasn't reached the 2s cadence yet

  game.updateTowerAcidShot(tower, tower.x, tower.y, 0.002);
  assert.equal(game.getProjectiles().length, 1);
  const acidProjectile = game.getProjectiles()[0];
  assert.equal(acidProjectile.damage, tower.acid.damage);
  assert.deepEqual(acidProjectile.slow, { multiplier: tower.acid.slowMultiplier, duration: tower.acid.slowDuration });
  assert.equal(acidProjectile.shape, 'acid');
});

test('resolving an acid projectile deals its own damage and applies the slow debuff to the target', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 1); // Acidic Mixture: 5 dmg, 20% slow, 5s

  const enemy = makeTestEnemy({ x: 10, y: 0 });
  game.spawnAcidProjectile(tower, enemy);
  const projectile = game.getProjectiles()[0];
  // Land the shot directly on the target, same convention every other
  // projectile-resolution test in this codebase uses.
  projectile.target = enemy;
  projectile.aimX = enemy.x;
  projectile.aimY = enemy.y;

  game.resolveProjectile(projectile);
  assert.equal(enemy.health, 100000 - 5);
  assert.deepEqual(enemy.slow, { multiplier: 0.8, remaining: 5 });
});

test('a slowed enemy moves at the reduced speed until the slow expires, then returns to normal', () => {
  const game = loadFullGameContext();
  const enemy = makeTestEnemy({ x: 0, y: 0, waypointIndex: 0 });
  game.getActiveEnemies().push(enemy);
  game.applySlow(enemy, { multiplier: 0.5, duration: 1 });

  // One real game map path is needed for updateEnemies' own movement
  // math — Deep Forest is the default active map, so enemy.pathIndex: 0
  // walks its real first waypoint.
  const distanceAtFullSpeed = enemy.speed * 0.1;
  game.updateEnemies(0.1);
  const distanceMoved = Math.hypot(enemy.x, enemy.y);
  assert.ok(Math.abs(distanceMoved - distanceAtFullSpeed * 0.5) < 0.5, 'enemy should move at half speed while slowed');
  assert.ok(enemy.slow && Math.abs(enemy.slow.remaining - 0.9) < 1e-9);

  // Advance past the slow's own duration — it clears, and movement
  // returns to full speed on the next tick.
  game.updateEnemies(1);
  assert.equal(enemy.slow, null);
});

test('a fresh slow application overwrites whatever slow was already active, same plain-overwrite convention as burn', () => {
  const game = loadFullGameContext();
  const enemy = makeTestEnemy();
  game.applySlow(enemy, { multiplier: 0.8, duration: 5 });
  game.applySlow(enemy, { multiplier: 0.65, duration: 7 });
  assert.deepEqual(enemy.slow, { multiplier: 0.65, remaining: 7 });
});

test('an unslowed enemy is completely unaffected — enemy.slow stays falsy', () => {
  const game = loadFullGameContext();
  const enemy = makeTestEnemy({ x: 0, y: 0 });
  game.getActiveEnemies().push(enemy);
  game.updateEnemies(0.1);
  assert.ok(!enemy.slow);
});
