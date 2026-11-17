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

test('an enemy that steps on a root trap takes its damage and the root is consumed', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  tower.attackCooldown = 999; // suppress the base attack so it doesn't confound the health delta
  tower.roots = [{ x: 50, y: 0, damage: 2 }];

  const victim = makeTestEnemy({ x: 50, y: 0 }); // standing right on the trap
  game.getActiveEnemies().push(victim);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);

  assert.equal(victim.health, 10000 - 2);
  assert.equal(tower.roots.length, 0); // single-use — consumed
});

test('a root does nothing until an enemy actually gets within its trigger radius', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  tower.attackCooldown = 999;
  tower.roots = [{ x: 50, y: 0, damage: 2 }];

  const farEnemy = makeTestEnemy({ x: 200, y: 0 }); // well outside the trigger radius
  game.getActiveEnemies().push(farEnemy);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);

  assert.equal(farEnemy.health, 10000); // untouched
  assert.equal(tower.roots.length, 1); // still armed
});

test('each root only consumes once — a second enemy on the same now-empty spot takes no damage', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  tower.attackCooldown = 999;
  tower.roots = [{ x: 50, y: 0, damage: 2 }];

  const first = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(first);
  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);
  assert.equal(tower.roots.length, 0);

  const second = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(second);
  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);

  assert.equal(second.health, 10000); // nothing left to trigger
});

test('multiple roots can each trigger independently in the same tick', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  tower.attackCooldown = 999;
  tower.roots = [
    { x: 50, y: 0, damage: 2 },
    { x: -50, y: 0, damage: 2 },
    { x: 0, y: 60, damage: 2 },
  ];

  const onA = makeTestEnemy({ x: 50, y: 0 });
  const onB = makeTestEnemy({ x: -50, y: 0 });
  // Nothing standing on the third root.
  game.getActiveEnemies().push(onA, onB);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);

  assert.equal(onA.health, 10000 - 2);
  assert.equal(onB.health, 10000 - 2);
  assert.equal(tower.roots.length, 1); // the untouched third root is still armed
  assert.equal(tower.roots[0].x, 0);
  assert.equal(tower.roots[0].y, 60);
});

test('a tower with no roots never touches root logic (no crash, nothing changes)', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose'); // tower.roots is []
  tower.x = 0;
  tower.y = 0;
  tower.attackCooldown = 999;

  const enemy = makeTestEnemy({ x: 0, y: 0 });
  game.getActiveEnemies().push(enemy);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);

  assert.equal(enemy.health, 10000);
  assert.deepEqual(tower.roots, []);
});
