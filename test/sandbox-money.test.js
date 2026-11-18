const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// A world point well clear of MAP_PATH_WAYPOINTS (js/map.js) + the
// PLACEMENT_PATH_MARGIN used by handleCanvasTap's on-path check.
const OFF_PATH_X = 900;
const OFF_PATH_Y = 400;

test('canAfford always returns true in Sandbox, regardless of cost or current money', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(0);

  assert.equal(game.canAfford(1), true);
  assert.equal(game.canAfford(999999), true);
});

test('canAfford still enforces the real cost in Easy/Medium/Hard', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  game.setMoney(10);

  assert.equal(game.canAfford(10), true);
  assert.equal(game.canAfford(11), false);
});

test('canAfford falls back to a real money check before any mode is chosen', () => {
  const game = loadFullGameContext();
  game.setMoney(10);

  assert.equal(game.getCurrentMode(), null);
  assert.equal(game.canAfford(10), true);
  assert.equal(game.canAfford(11), false);
});

test('a tower can be placed in Sandbox with $0 on hand', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(0);
  game.setSelectedShopItem({ typeKey: 'sunflower', name: 'Sunflower', cost: 25 });

  game.handleCanvasTap(OFF_PATH_X, OFF_PATH_Y);

  assert.equal(game.getTowers().length, 1);
  assert.equal(game.getTowers()[0].type, 'sunflower');
});

test('placing a tower in Easy/Medium/Hard is still refused without enough money', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  game.setMoney(0);
  game.setSelectedShopItem({ typeKey: 'sunflower', name: 'Sunflower', cost: 25 });

  game.handleCanvasTap(OFF_PATH_X, OFF_PATH_Y);

  assert.equal(game.getTowers().length, 0);
});

test('an upgrade can be bought in Sandbox even without enough money, and real money is untouched by the cost', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  const tower = game.createTower('sunflower');
  game.setSelectedTower(tower);
  game.setMoney(0);

  const upgrade = { name: 'Glare', cost: 50, description: 'test', effects: { damageMultiplier: 2 } };
  const region = {
    id: 'upgrade:0:0',
    data: { pathIndex: 0, tierIndex: 0, upgrade, isNextInLine: true },
  };

  game.activateRegion(region);

  assert.equal(tower.upgradesPurchased, 1);
});
