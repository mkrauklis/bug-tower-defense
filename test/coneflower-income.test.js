const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Coneflower is a different kind of tower: passive income, no combat.
// updateTowerIncome() is the new generic mechanism — it sums every
// tower's incomeRate (0 for every type except Coneflower today) and
// credits it to `money`, gated on activeEnemies.length > 0, the exact
// same condition the "Next Round" button's own waveInProgress check
// already uses. These tests cover the accrual logic itself and each
// Quality Path tier's absolute (not additive) rate.

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod',
    health: 1000,
    maxHealth: 1000,
    speed: 0,
    isBoss: false,
    bounty: 1,
    waypointIndex: 0,
    spawnDelay: 0,
    spawned: true,
    x: 0,
    y: 0,
    isZombie: false,
    tunneledRemaining: 0,
    ...overrides,
  };
}

test('a fresh Coneflower starts with the base $2/sec income rate', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  assert.equal(coneflower.incomeRate, 2);
});

test('every other tower type has a 0 income rate by default', () => {
  const game = loadFullGameContext();
  ['sunflower', 'rose', 'mushroom'].forEach((type) => {
    assert.equal(game.createTower(type).incomeRate, 0);
  });
});

test('updateTowerIncome adds nothing while no wave is active (activeEnemies is empty)', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  game.getTowers().push(coneflower);
  game.setMoney(100);

  game.updateTowerIncome(1); // a full second, but nothing is on the map

  assert.equal(game.getMoney(), 100);
});

test('updateTowerIncome credits incomeRate * deltaSeconds while a wave is active', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  game.getTowers().push(coneflower);
  game.setMoney(100);
  game.getActiveEnemies().push(makeTestEnemy()); // "a wave is active"

  game.updateTowerIncome(0.5);

  assert.equal(game.getMoney(), 100 + 2 * 0.5); // 101
});

test('two Coneflowers\' income rates add together', () => {
  const game = loadFullGameContext();
  game.getTowers().push(game.createTower('coneflower'), game.createTower('coneflower'));
  game.setMoney(0);
  game.getActiveEnemies().push(makeTestEnemy());

  game.updateTowerIncome(1);

  assert.equal(game.getMoney(), 4); // 2 + 2
});

test('a combat tower with no income never affects money via updateTowerIncome', () => {
  const game = loadFullGameContext();
  game.getTowers().push(game.createTower('sunflower'));
  game.setMoney(50);
  game.getActiveEnemies().push(makeTestEnemy());

  game.updateTowerIncome(5);

  assert.equal(game.getMoney(), 50);
});

test('income stops the instant activeEnemies empties out (e.g. the wave just cleared)', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  game.getTowers().push(coneflower);
  game.setMoney(0);
  const enemy = makeTestEnemy();
  game.getActiveEnemies().push(enemy);

  game.updateTowerIncome(1);
  assert.equal(game.getMoney(), 2);

  game.getActiveEnemies().length = 0; // wave cleared
  game.updateTowerIncome(1);
  assert.equal(game.getMoney(), 2); // unchanged — no wave in progress
});

test('each Quality Path tier sets incomeRate to its own absolute rate, replacing the previous tier\'s', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');

  game.purchaseUpgrade(coneflower, 0); // Quality Control
  assert.equal(coneflower.incomeRate, 5);

  game.purchaseUpgrade(coneflower, 0); // High Standard
  assert.equal(coneflower.incomeRate, 12);
  assert.equal(coneflower.hasExtraStems, true);

  game.purchaseUpgrade(coneflower, 0); // Quality Market
  assert.equal(coneflower.incomeRate, 20);
  assert.equal(coneflower.stats.color, '#ffd54f'); // gold

  game.purchaseUpgrade(coneflower, 0); // Perfect Condition
  assert.equal(coneflower.incomeRate, 35);
  assert.equal(coneflower.hasRedMist, true);
  assert.equal(coneflower.stats.color, '#c62828'); // ruby red
});

test('Coneflower\'s other two paths are not yet designed (same convention as every other tower)', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  assert.equal(game.purchaseUpgrade(coneflower, 1), false);
  assert.equal(game.purchaseUpgrade(coneflower, 2), false);
});

test('Coneflower never attacks: zero range means it never acquires a target even with enemies nearby', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  coneflower.x = 0;
  coneflower.y = 0;
  game.getTowers().push(coneflower);
  game.getActiveEnemies().push(makeTestEnemy({ x: 1, y: 0 })); // right next to it

  game.updateTowerAttack(coneflower, coneflower.x, coneflower.y, 1);

  assert.equal(coneflower.target, null);
  assert.equal(game.getProjectiles().length, 0);
});
