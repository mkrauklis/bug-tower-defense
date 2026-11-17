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

test("Conductor's spark hits only the single closest enemy in range", () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  tower.x = 0;
  tower.y = 0;
  for (let i = 0; i < 3; i += 1) game.purchaseUpgrade(tower, 2); // Jolt, Shock, Conductor

  const near = makeTestEnemy({ x: 50, y: 0 });
  const far = makeTestEnemy({ x: 100, y: 0 });
  game.getActiveEnemies().push(near, far);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.spark.interval); // let the spark's cooldown elapse exactly once

  assert.equal(near.health, 1000 - tower.spark.damage);
  assert.equal(far.health, 1000); // untouched — spark is single-target, not AoE
});

test("Shockwave hits every enemy in range at once, and Conductor's spark keeps ticking alongside it", () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  tower.x = 0;
  tower.y = 0;
  for (let i = 0; i < 4; i += 1) game.purchaseUpgrade(tower, 2); // through Shockwave

  const closer = makeTestEnemy({ x: 50, y: 0 });
  const farther = makeTestEnemy({ x: -60, y: 0 });
  game.getActiveEnemies().push(closer, farther);

  // Advance by the shockwave's own interval so both periodic effects fire.
  game.updateTowerAttack(tower, tower.x, tower.y, tower.shockwave.interval);

  // The closer enemy takes both the AoE shockwave and the single-target spark.
  assert.equal(closer.health, 1000 - tower.shockwave.damage - tower.spark.damage);
  // The farther one only takes the AoE shockwave — the spark never reaches it.
  assert.equal(farther.health, 1000 - tower.shockwave.damage);
});

test('a target outside tower range is untouched by either periodic effect', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  tower.x = 0;
  tower.y = 0;
  for (let i = 0; i < 4; i += 1) game.purchaseUpgrade(tower, 2);

  const outOfRange = makeTestEnemy({ x: tower.stats.range + 50, y: 0 });
  game.getActiveEnemies().push(outOfRange);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.shockwave.interval);

  assert.equal(outOfRange.health, 1000);
});
