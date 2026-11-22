const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Running per-tower damage-dealt counter (direct request, relayed from the
// peer session): "track total damage each individual placed tower has
// inflicted over its lifetime, and display it... in the Selected Tower
// panel." tower.totalDamageDealt (towers.js's createTower()) is incremented
// in exactly one place — damageEnemy() in enemies.js, the single choke
// point every damage source in the game already funnels through (see its
// own comment) — via a new optional third `sourceTower` argument every
// call site in game.js now passes itself as. These tests exercise each
// distinct damage pathway (direct/ray, projectile, DoT/burn, and a sampling
// of the periodic AoE/single-target "second effect" mechanics) rather than
// re-deriving every tower's own full combat behavior, which the other test
// files already cover.

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod', name: 'Tiny Isopod', color: '#78909c', radius: 12,
    maxHealth: 100000, health: 100000, speed: 0, isBoss: false, bounty: 10,
    waypointIndex: 0, spawnDelay: 0, spawned: true, x: 0, y: 0,
    immobilizedRemaining: 0, isZombie: false, isPurpleZombie: false,
    markedForRemoval: false, zombieExplosionDamage: 0, armorThreshold: 0,
    ...overrides,
  };
}

test('a freshly created tower starts with a zero damage-dealt counter', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  assert.equal(tower.totalDamageDealt, 0);
});

test('damageEnemy credits its optional sourceTower with the damage actually applied', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  const enemy = makeTestEnemy();

  game.damageEnemy(enemy, 12, tower);
  assert.equal(tower.totalDamageDealt, 12);
  assert.equal(enemy.health, 100000 - 12);

  game.damageEnemy(enemy, 8.5, tower);
  assert.equal(tower.totalDamageDealt, 20.5);
});

test('damageEnemy with no sourceTower never throws and attributes nothing', () => {
  const game = loadFullGameContext();
  const enemy = makeTestEnemy();
  assert.doesNotThrow(() => game.damageEnemy(enemy, 10));
  assert.equal(enemy.health, 100000 - 10);
});

test('a hit armor fully negates is never credited to the tower — 0 real damage, 0 counted', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  const armored = makeTestEnemy({ armorThreshold: 50 });

  game.damageEnemy(armored, 10, tower); // below the threshold — fully blocked
  assert.equal(armored.health, 100000); // confirms the hit really was negated
  assert.equal(tower.totalDamageDealt, 0);
});

test('two different towers hitting two different enemies track their own totals independently', () => {
  const game = loadFullGameContext();
  const towerA = game.createTower('sunflower');
  const towerB = game.createTower('rose');
  const enemyA = makeTestEnemy();
  const enemyB = makeTestEnemy();

  game.damageEnemy(enemyA, 15, towerA);
  game.damageEnemy(enemyB, 40, towerB);

  assert.equal(towerA.totalDamageDealt, 15);
  assert.equal(towerB.totalDamageDealt, 40);
});

test('a ray tower\'s instant hit (no projectile) credits itself directly via updateTowerAttack', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunlitConductor'); // baseAttackType: 'ray'
  tower.x = 0;
  tower.y = 0;
  assert.equal(tower.attackType, 'ray');

  const enemy = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(enemy);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.stats.attackInterval);
  assert.equal(tower.totalDamageDealt, tower.stats.damage);
  assert.equal(enemy.health, 100000 - tower.stats.damage);
});

test('an ordinary projectile tower credits its own counter only once the projectile resolves, not on firing', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  tower.x = 0;
  tower.y = 0;

  const enemy = makeTestEnemy({ x: 50, y: 0 });
  game.spawnProjectile(tower, enemy);
  assert.equal(tower.totalDamageDealt, 0); // still in flight — nothing credited yet

  const projectile = game.getProjectiles()[0];
  assert.equal(projectile.sourceTower, tower);
  projectile.target = enemy;
  projectile.aimX = enemy.x;
  projectile.aimY = enemy.y;

  game.resolveProjectile(projectile);
  assert.equal(tower.totalDamageDealt, projectile.damage);
});

test('a burn DoT tick credits the tower whose attack applied the burn, ticks later, with no tower reference in scope', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  const enemy = makeTestEnemy();

  game.applyBurn(enemy, { damagePerSecond: 10, duration: 3 }, tower);
  assert.equal(enemy.burn.sourceTower, tower);

  game.getActiveEnemies().push(enemy);
  game.updateEnemies(1); // one full second of burn ticking

  assert.ok(Math.abs(tower.totalDamageDealt - 10) < 1e-9);
});

test("Corpse Flower's gas ring ticks credit the Amorphophallus titanum tower that fired them", () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;

  // Inside the ring band (between innerRadius and outerRadius).
  const enemy = makeTestEnemy({ x: (tower.gasRing.innerRadius + tower.gasRing.outerRadius) / 2, y: 0 });
  game.getActiveEnemies().push(enemy);

  // gasRingCooldown starts at the full GAS_CLOUD_TICK_INTERVAL (createTower
  // in towers.js), not 0 — spending exactly that much delta is what brings
  // it down to the "fire now" threshold.
  game.updateTowerGasRing(tower, tower.x, tower.y, tower.gasRingCooldown);
  assert.equal(tower.totalDamageDealt, tower.gasRing.damagePerTick);
});

test("the bloom attack's acid projectiles credit the Amorphophallus titanum tower once they resolve", () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;

  const enemy = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(enemy);

  // bloomCooldown starts at the full tower.bloom.interval, same deal as
  // gasRingCooldown above — spend exactly that much to make it fire now.
  game.updateTowerBloom(tower, tower.x, tower.y, tower.bloomCooldown);
  assert.equal(tower.totalDamageDealt, 0); // the projectile is still in flight

  const projectile = game.getProjectiles().find((p) => p.target === enemy);
  assert.ok(projectile);
  assert.equal(projectile.sourceTower, tower);
  projectile.aimX = enemy.x;
  projectile.aimY = enemy.y;

  game.resolveProjectile(projectile);
  assert.equal(tower.totalDamageDealt, projectile.damage);
});

test('an unupgraded tower with no secondary mechanics only ever gets credited through its base attack', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('mushroom');
  tower.x = 0;
  tower.y = 0;

  const enemy = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(enemy);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.stats.attackInterval);
  for (let i = 0; i < 120; i += 1) game.updateProjectiles(1 / 60);

  assert.ok(Math.abs(tower.totalDamageDealt - tower.stats.damage) < 1e-9);
});

test('selling and re-buying (a brand-new createTower instance) starts the counter back at 0', () => {
  const game = loadFullGameContext();
  const first = game.createTower('sunflower');
  game.damageEnemy(makeTestEnemy(), 99, first);
  assert.equal(first.totalDamageDealt, 99);

  const second = game.createTower('sunflower'); // a fresh instance, as if re-bought after selling
  assert.equal(second.totalDamageDealt, 0);
});
