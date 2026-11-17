const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod',
    name: 'Tiny Isopod',
    color: '#78909c',
    radius: 12,
    maxHealth: 1000,
    health: 1000,
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

test('a non-ray attack does not damage its target at fire time', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  tower.x = 500;
  tower.y = 320;

  const target = makeTestEnemy({ x: 650, y: 320 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);

  assert.equal(target.health, 1000); // unchanged
  assert.equal(game.getProjectiles().length, 1);
});

test('damage applies once the projectile has had time to travel', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  tower.x = 500;
  tower.y = 320;

  const target = makeTestEnemy({ x: 650, y: 320 }); // 150px away
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60); // +0.5s, well past the ~0.375s flight

  assert.equal(target.health, 1000 - tower.stats.damage);
  assert.equal(game.getProjectiles().length, 0);
});

test('a target killed mid-flight makes the projectile fizzle (no extra damage)', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  tower.x = 500;
  tower.y = 320;

  const target = makeTestEnemy({ x: 650, y: 320, health: 5 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);
  target.health = -1; // something else kills it before the projectile lands
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.health, -1); // untouched by the projectile
  assert.equal(game.getProjectiles().length, 0);
});

test('a target that drifts far from the aimed-at point is missed', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  tower.x = 500;
  tower.y = 320;

  const target = makeTestEnemy({ x: 650, y: 320 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60); // aims at (650, 320)
  target.y += 200; // walks well outside the hit tolerance before arrival
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.health, 1000); // missed
});

test('a small drift within tolerance still lands', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  tower.x = 500;
  tower.y = 320;

  const target = makeTestEnemy({ x: 650, y: 320 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);
  target.y += 5; // small drift, well within radius (12) + tolerance (20)
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.health, 1000 - tower.stats.damage);
});

test('a ray attack still hits instantly and spawns no projectile', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  tower.x = 500;
  tower.y = 320;
  game.purchaseUpgrade(tower, 0); // Glare
  game.purchaseUpgrade(tower, 0); // Precision Rays -> attackType 'ray'
  assert.equal(tower.attackType, 'ray');

  const target = makeTestEnemy({ x: 650, y: 320 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);

  assert.equal(target.health, 1000 - tower.stats.damage); // instant
  assert.equal(game.getProjectiles().length, 0);
});
