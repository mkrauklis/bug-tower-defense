const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Coneflower is a different kind of tower: passive income, no combat.
// updateTowerIncome() is the generic mechanism — every tower with a
// positive incomeRate pays out that many dollars, as a lump sum, once
// every incomeTickInterval seconds (1 by default), gated on
// activeEnemies.length > 0 — the exact same condition the "Next Round"
// button's own waveInProgress check already uses. These tests cover the
// payout/tick logic itself, each Quality Path tier's absolute (not
// additive) rate, and the Overgrowth Path's plant-count/interval math.

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

test('updateTowerIncome pays nothing before a full tick interval elapses, then pays the full incomeRate exactly on it', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  game.getTowers().push(coneflower);
  game.setMoney(100);
  game.getActiveEnemies().push(makeTestEnemy()); // "a wave is active"

  game.updateTowerIncome(0.5); // under the 1-second interval — no payout yet
  assert.equal(game.getMoney(), 100);

  game.updateTowerIncome(0.5); // crosses the 1-second mark exactly
  assert.equal(game.getMoney(), 102);
});

test('a long enough deltaSeconds catches up on more than one missed tick (a lag spike or a big simulated jump)', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  game.getTowers().push(coneflower);
  game.setMoney(0);
  game.getActiveEnemies().push(makeTestEnemy());

  game.updateTowerIncome(3.5); // should cover 3 full ticks (interval stays 1)

  assert.equal(game.getMoney(), 6); // 3 ticks * $2
  assert.equal(game.getFloatingTexts().length, 3); // one popup per tick, not one for the whole jump
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

test('Coneflower\'s third path is not yet designed (same convention as every other tower)', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  assert.equal(game.purchaseUpgrade(coneflower, 2), false);
});

test('Overgrowth Path doubles the plant count tier over tier, except the last (additive) tier: 1 -> 2 -> 4 -> 8 -> 11', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  assert.equal(coneflower.numPlants, 1);

  game.purchaseUpgrade(coneflower, 1); // Overgrowth
  assert.equal(coneflower.numPlants, 2);

  game.purchaseUpgrade(coneflower, 1); // Splurge
  assert.equal(coneflower.numPlants, 4);

  game.purchaseUpgrade(coneflower, 1); // Surplus
  assert.equal(coneflower.numPlants, 8);

  game.purchaseUpgrade(coneflower, 1); // Plantation — additive, not another double
  assert.equal(coneflower.numPlants, 11);
});

test('Overgrowth Path\'s per-plant cash is set once (tier 1) and never changes again', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  for (let i = 0; i < 4; i += 1) game.purchaseUpgrade(coneflower, 1);
  assert.equal(coneflower.perPlantCash, 3);
});

test('Overgrowth Path\'s incomeRate is always perPlantCash * numPlants, tier by tier', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');

  game.purchaseUpgrade(coneflower, 1); // Overgrowth: 2 plants * $3
  assert.equal(coneflower.incomeRate, 6);

  game.purchaseUpgrade(coneflower, 1); // Splurge: 4 plants * $3
  assert.equal(coneflower.incomeRate, 12);

  game.purchaseUpgrade(coneflower, 1); // Surplus: 8 plants * $3
  assert.equal(coneflower.incomeRate, 24);

  game.purchaseUpgrade(coneflower, 1); // Plantation: 11 plants * $3
  assert.equal(coneflower.incomeRate, 33);
  assert.equal(coneflower.hasTallPlant, true);
});

test('Overgrowth Path\'s "X% faster" compounds on the tick interval, tier over tier (unlike Quality Path\'s REPLACE rate)', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  assert.equal(coneflower.incomeTickInterval, 1);

  game.purchaseUpgrade(coneflower, 1); // Overgrowth: x0.75
  assert.equal(coneflower.incomeTickInterval, 0.75);

  game.purchaseUpgrade(coneflower, 1); // Splurge: x0.70 more
  assert.ok(Math.abs(coneflower.incomeTickInterval - 0.75 * 0.7) < 1e-9);

  game.purchaseUpgrade(coneflower, 1); // Surplus: x0.75 more
  assert.ok(Math.abs(coneflower.incomeTickInterval - 0.75 * 0.7 * 0.75) < 1e-9);

  game.purchaseUpgrade(coneflower, 1); // Plantation: x0.50 more
  assert.ok(Math.abs(coneflower.incomeTickInterval - 0.75 * 0.7 * 0.75 * 0.5) < 1e-9);
});

test('a maxed Overgrowth Coneflower actually pays out faster in real time than a maxed Quality Coneflower', () => {
  const game = loadFullGameContext();
  const overgrown = game.createTower('coneflower');
  for (let i = 0; i < 4; i += 1) game.purchaseUpgrade(overgrown, 1);
  game.getTowers().push(overgrown);
  game.getActiveEnemies().push(makeTestEnemy());
  game.setMoney(0);

  // incomeTickInterval ~0.1969s after 4 tiers — 2 seconds covers roughly
  // 10 ticks at $33 each, nowhere near what a flat 1s/$ amount could do.
  game.updateTowerIncome(2);

  assert.ok(game.getMoney() > 33 * 5); // comfortably more than 5 ticks' worth
});

test('Overgrowth and Quality Path are mutually exclusive, same as every other tower\'s paths', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  game.purchaseUpgrade(coneflower, 1); // Overgrowth
  assert.equal(game.purchaseUpgrade(coneflower, 0), false); // Quality Path now locked out
});

test('an income tick spawns a "+$X" floating popup above the Coneflower, at its current rate', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  coneflower.x = 300;
  coneflower.y = 300;
  game.getTowers().push(coneflower);
  game.getActiveEnemies().push(makeTestEnemy());

  game.updateTowerIncome(1); // crosses the 1-second tick cadence exactly

  const popups = game.getFloatingTexts();
  assert.equal(popups.length, 1);
  assert.equal(popups[0].text, '+$2');
  assert.equal(popups[0].x, 300);
  assert.ok(popups[0].y < 300); // above the tower, not on top of it
});

test('the popup text updates to match a higher Quality Path tier\'s rate', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  game.purchaseUpgrade(coneflower, 0); // Quality Control -> $5/sec
  game.getTowers().push(coneflower);
  game.getActiveEnemies().push(makeTestEnemy());

  game.updateTowerIncome(1);

  assert.equal(game.getFloatingTexts()[0].text, '+$5');
});

test('no popup fires before a full second has elapsed, and none fires with no wave active', () => {
  const game = loadFullGameContext();
  const coneflower = game.createTower('coneflower');
  game.getTowers().push(coneflower);

  game.updateTowerIncome(1); // no wave active — gated out entirely
  assert.equal(game.getFloatingTexts().length, 0);

  game.getActiveEnemies().push(makeTestEnemy());
  game.updateTowerIncome(0.9); // wave active, but under a full second
  assert.equal(game.getFloatingTexts().length, 0);
});

test('a combat tower (0 income) never spawns an income popup even mid-wave', () => {
  const game = loadFullGameContext();
  game.getTowers().push(game.createTower('sunflower'));
  game.getActiveEnemies().push(makeTestEnemy());

  game.updateTowerIncome(5); // several ticks' worth of time

  assert.equal(game.getFloatingTexts().length, 0);
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
