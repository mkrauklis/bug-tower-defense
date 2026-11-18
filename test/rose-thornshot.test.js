const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod',
    name: 'Tiny Isopod',
    color: '#78909c',
    radius: 12,
    maxHealth: 10000,
    health: 10000,
    speed: 0,
    isBoss: false,
    bounty: 10,
    waypointIndex: 0,
    spawnDelay: 0,
    spawned: true,
    x: 0,
    y: 0,
    ...overrides,
  };
}

test('thorn-shot fires a travel-time projectile that deals no damage until it arrives', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 2); // Poke
  game.purchaseUpgrade(tower, 2); // Projectiles
  tower.attackCooldown = 999; // suppress the base attack

  const target = makeTestEnemy({ x: 150, y: 0 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.thornShotInterval); // triggers the shot

  assert.equal(target.health, 10000); // no damage yet — still in flight
  assert.equal(game.getProjectiles().length, 1);
  assert.equal(game.getProjectiles()[0].damage, tower.thornShotDamage);

  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60); // well past the ~0.375s flight

  assert.equal(target.health, 10000 - tower.thornShotDamage);
  assert.equal(game.getProjectiles().length, 0);
});

test('Even More Projectiles fires 3 thorns at once, each able to hit the same single nearby target', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 2); // Poke
  game.purchaseUpgrade(tower, 2); // Projectiles
  game.purchaseUpgrade(tower, 2); // Even More Projectiles: thornShotCount -> 3
  tower.attackCooldown = 999;

  const target = makeTestEnemy({ x: 150, y: 0 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.thornShotInterval);
  assert.equal(game.getProjectiles().length, 3);

  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.health, 10000 - tower.thornShotCount * tower.thornShotDamage);
});

test('Poison Projectiles applies a burn DoT on hit, on top of the direct thorn-shot damage', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  for (let i = 0; i < 4; i += 1) game.purchaseUpgrade(tower, 2); // through Poison Projectiles
  tower.attackCooldown = 999;

  const target = makeTestEnemy({ x: 150, y: 0 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.thornShotInterval);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.health, 10000 - tower.thornShotDamage); // direct hit applied
  assert.deepEqual(target.burn, { damagePerSecond: 5, remaining: 3 }); // poison applied on top
});

test('a thorn-shot projectile fizzles if its target dies before it arrives, same as other projectiles', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 2);
  game.purchaseUpgrade(tower, 2);
  tower.attackCooldown = 999;

  const target = makeTestEnemy({ x: 150, y: 0, health: 5 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.thornShotInterval);
  target.health = -1; // something else kills it mid-flight
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.health, -1); // untouched by the thorn
});
