const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Arctic Willow's Brittle Path (direct follow-up request, relayed from
// the peer session): its 2nd of 3 upgrade paths, mutually exclusive with
// Frosted Path (the existing single chosenPath lock already handles
// that generically — see getAvailableUpgrade()/purchaseUpgrade() in
// towers.js, untouched). A hard-CC/burst path rather than Frosted Path's
// gentler stacking slow: every ordinary hit applies a FULL freeze (a
// complete stop, not a percentage slow) for a flat 1 second, reusing the
// existing full-stop/stun machinery's own SHAPE (immobilizedRemaining/
// infectedRemaining both already block movement while > 0) via a new
// 3rd field, frozenRemaining — not a reuse of either existing field,
// per the request's own reasoning that each effect should keep its own
// distinct visual. While frozen, the enemy also takes freeze.tickDamage
// every 0.25s (4 ticks across the 1s freeze), a genuinely new mechanic
// (Infect Path's own stun deals no damage at all) — see applyFreeze()/
// the frozenTick timer in enemies.js. Base attack damage is an absolute
// replace each tier (5 -> 6 -> 9 -> 12), unlike Frosted Path's own
// compounding damageMultiplier, since literal numbers were given here.

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod', name: 'Tiny Isopod', color: '#78909c', radius: 12,
    maxHealth: 100000, health: 100000, speed: 60, isBoss: false, bounty: 10,
    waypointIndex: 0, spawnDelay: 0, spawned: true, x: 0, y: 0,
    immobilizedRemaining: 0, infectedRemaining: 0, frozenRemaining: 0, frozenTick: null,
    isZombie: false, isPurpleZombie: false,
    markedForRemoval: false, zombieExplosionDamage: 0,
    ...overrides,
  };
}

// --- Upgrade tiers -----------------------------------------------------

test('Brittle Path is Arctic Willow\'s 2nd path (index 1) — Frosted Path (index 0) is unaffected', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  assert.ok(game.getAvailableUpgrade(tower, 0)); // Frosted Path, still designed
  assert.ok(game.getAvailableUpgrade(tower, 1)); // Brittle Path, newly designed
  assert.equal(game.getAvailableUpgrade(tower, 2), null); // 3rd path still undesigned
});

test('Brittle (tier 1): slightly purple, bigger, a 1s full freeze dealing 2 dmg/tick, base damage 5', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');

  game.purchaseUpgrade(tower, 1);
  assert.equal(tower.chosenPath, 1);
  assert.equal(tower.stats.color, '#b39ddb');
  assert.ok(Math.abs(tower.stats.size - 20 * 1.15) < 1e-9);
  assert.deepEqual(tower.freeze, { duration: 1, tickDamage: 2 });
  assert.equal(tower.stats.damage, 5); // absolute replace, not compounding off the base 3
  assert.equal(tower.hasBrittleStems, false);
  assert.equal(tower.hasIceCubes, false);
});

test('Super-brittle (tier 2): even more purple, bigger again, grows new stems, freeze 4 dmg/tick, base damage 6', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  game.purchaseUpgrade(tower, 1); // Brittle

  game.purchaseUpgrade(tower, 1); // Super-brittle
  assert.equal(tower.stats.color, '#8e5fc9');
  assert.ok(Math.abs(tower.stats.size - 20 * 1.15 * 1.15) < 1e-9);
  assert.equal(tower.hasBrittleStems, true);
  assert.deepEqual(tower.freeze, { duration: 1, tickDamage: 4 });
  assert.equal(tower.stats.damage, 6);
});

test('Fractured Ice (tier 3): glowing purple, ice cubes on its body, freeze 5 dmg/tick, base damage 9 — no size change this tier', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  game.purchaseUpgrade(tower, 1);
  game.purchaseUpgrade(tower, 1);
  const sizeBeforeTier3 = tower.stats.size;

  game.purchaseUpgrade(tower, 1); // Fractured Ice
  assert.equal(tower.glow, '#9c4dcc');
  assert.equal(tower.hasIceCubes, true);
  assert.equal(tower.stats.size, sizeBeforeTier3); // tier 3 never mentions size
  assert.deepEqual(tower.freeze, { duration: 1, tickDamage: 5 });
  assert.equal(tower.stats.damage, 9);
});

test('Cryo-fracture (tier 4): bigger again, same glow as tier 3, freeze 10 dmg/tick, base damage 12', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  game.purchaseUpgrade(tower, 1);
  game.purchaseUpgrade(tower, 1);
  game.purchaseUpgrade(tower, 1);
  const sizeBeforeTier4 = tower.stats.size;

  game.purchaseUpgrade(tower, 1); // Cryo-fracture
  assert.ok(Math.abs(tower.stats.size - sizeBeforeTier4 * 1.2) < 1e-9);
  assert.equal(tower.glow, '#9c4dcc'); // unchanged — the same glow continuing, not a 2nd one
  assert.deepEqual(tower.freeze, { duration: 1, tickDamage: 10 });
  assert.equal(tower.stats.damage, 12);
});

test('Brittle Path and Frosted Path are mutually exclusive — buying one locks out the other', () => {
  const game = loadFullGameContext();
  const brittleTower = game.createTower('arcticWillow');
  game.purchaseUpgrade(brittleTower, 1);
  assert.equal(game.getAvailableUpgrade(brittleTower, 0), null); // Frosted Path locked out

  const frostedTower = game.createTower('arcticWillow');
  game.purchaseUpgrade(frostedTower, 0);
  assert.equal(game.getAvailableUpgrade(frostedTower, 1), null); // Brittle Path locked out
});

// --- The freeze mechanic itself -----------------------------------------

test('applyFreeze sets a full stop and a 0.25s tick timer carrying the source tower', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  game.purchaseUpgrade(tower, 1); // Brittle: tickDamage 2
  const enemy = makeTestEnemy();

  game.applyFreeze(enemy, tower.freeze, tower);
  assert.equal(enemy.frozenRemaining, 1);
  assert.deepEqual(enemy.frozenTick, { damage: 2, timer: 0.25, sourceTower: tower });
});

test('a frozen enemy does not move at all, even over a full second', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  game.purchaseUpgrade(tower, 1);
  const enemy = makeTestEnemy({ x: 0, y: 0 });
  game.getActiveEnemies().push(enemy);

  game.applyFreeze(enemy, tower.freeze, tower);
  game.updateEnemies(1); // a full second — enemy.speed=60 would otherwise move it 60px

  assert.equal(enemy.x, 0);
  assert.equal(enemy.y, 0);
});

test('a frozen enemy takes exactly 4 damage ticks over the 1s freeze, each crediting the source tower', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  game.purchaseUpgrade(tower, 1); // Brittle: 2 dmg/tick
  const enemy = makeTestEnemy();
  game.getActiveEnemies().push(enemy);

  game.applyFreeze(enemy, tower.freeze, tower);
  for (let i = 0; i < 240; i += 1) game.updateEnemies(1 / 60); // 4 seconds, well past the 1s freeze

  // 4 ticks x 2 damage = 8 total, all credited to this tower.
  assert.ok(Math.abs(enemy.health - (100000 - 8)) < 1e-9);
  assert.ok(Math.abs(tower.totalDamageDealt - 8) < 1e-9);
});

test('once the freeze ends, the enemy moves again and ticking stops', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  game.purchaseUpgrade(tower, 1);
  const enemy = makeTestEnemy({ x: 0, y: 0 });
  game.getActiveEnemies().push(enemy);

  game.applyFreeze(enemy, tower.freeze, tower);
  // One single 1-second tick (not 60 stepped 1/60 frames) — avoids any
  // floating-point accumulation risk around landing exactly on 0 that
  // repeated small-delta subtraction could introduce.
  game.updateEnemies(1);
  assert.equal(enemy.frozenRemaining, 0);
  assert.equal(enemy.frozenTick, null);

  const healthAfterFreeze = enemy.health;
  const xBeforeMoving = enemy.x;
  game.updateEnemies(0.1); // should move normally now
  assert.ok(enemy.x !== xBeforeMoving);
  assert.equal(enemy.health, healthAfterFreeze); // no more ticks once unfrozen
});

test('a fresh freeze replaces whatever was ticking, rather than stacking (same plain-overwrite convention as applyBurn/applySlow)', () => {
  const game = loadFullGameContext();
  const towerA = game.createTower('arcticWillow');
  game.purchaseUpgrade(towerA, 1); // 2 dmg/tick
  const towerB = game.createTower('arcticWillow');
  game.purchaseUpgrade(towerB, 1);
  game.purchaseUpgrade(towerB, 1);
  game.purchaseUpgrade(towerB, 1);
  game.purchaseUpgrade(towerB, 1); // Cryo-fracture: 10 dmg/tick
  const enemy = makeTestEnemy();

  game.applyFreeze(enemy, towerA.freeze, towerA);
  game.applyFreeze(enemy, towerB.freeze, towerB); // overwrites, doesn't stack
  assert.deepEqual(enemy.frozenTick, { damage: 10, timer: 0.25, sourceTower: towerB });
  assert.equal(enemy.frozenRemaining, 1); // still just 1s, not 2
});

// --- The generalized projectile.freeze pipeline -------------------------

test('a tower\'s ordinary attack projectile carries tower.freeze once Brittle Path is bought', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 1); // Brittle

  const target = makeTestEnemy({ x: 50, y: 0 });
  game.spawnProjectile(tower, target);
  const projectile = game.getProjectiles()[0];
  assert.deepEqual(projectile.freeze, tower.freeze);
  assert.equal(projectile.slow, null); // mutually exclusive with Frosted Path's own field
});

test('resolving that projectile applies both the direct damage and the full freeze', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 1); // Brittle: base damage 5, freeze {duration:1, tickDamage:2}

  const enemy = makeTestEnemy({ x: 10, y: 0 });
  game.spawnProjectile(tower, enemy);
  const projectile = game.getProjectiles()[0];
  projectile.target = enemy;
  projectile.aimX = enemy.x;
  projectile.aimY = enemy.y;

  game.resolveProjectile(projectile);
  assert.ok(Math.abs(enemy.health - (100000 - 5)) < 1e-9);
  assert.deepEqual(enemy.frozenTick, { damage: 2, timer: 0.25, sourceTower: tower });
  assert.equal(enemy.frozenRemaining, 1);
});

test('an unupgraded Arctic Willow never freezes anything — tower.freeze is null and the projectile carries none', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  tower.x = 0;
  tower.y = 0;

  const enemy = makeTestEnemy({ x: 10, y: 0 });
  game.spawnProjectile(tower, enemy);
  const projectile = game.getProjectiles()[0];
  assert.equal(projectile.freeze, null);

  projectile.target = enemy;
  projectile.aimX = enemy.x;
  projectile.aimY = enemy.y;
  game.resolveProjectile(projectile);
  assert.equal(enemy.frozenRemaining, 0);
  assert.equal(enemy.frozenTick, null);
});

test('every OTHER tower\'s projectile is completely unaffected by the freeze generalization — still null', () => {
  const game = loadFullGameContext();
  const sunflower = game.createTower('sunflower');
  sunflower.x = 0;
  sunflower.y = 0;
  const target = makeTestEnemy({ x: 50, y: 0 });

  game.spawnProjectile(sunflower, target);
  const projectile = game.getProjectiles()[0];
  assert.equal(projectile.freeze, null);
});

test('updateTowerAttack fires an ordinary attack that fully freezes its target end to end, once Brittle Path is bought', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 1); // Brittle

  const enemy = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(enemy);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.stats.attackInterval);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(enemy.frozenRemaining, 1);
  assert.deepEqual(enemy.frozenTick, { damage: 2, timer: 0.25, sourceTower: tower });
});
