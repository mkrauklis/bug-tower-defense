const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Direct request: towers can't be placed overlapping each other.
// isTowerPlacementBlocked() checks the candidate's own visual size (base
// stats, pre-upgrade — read off the cached shop-preview tower) against
// every existing tower's own CURRENT visual size, so a big upgraded
// tower needs more clearance around it than a fresh one would.
// handleCanvasTap() is the one placement code path shared by normal play
// and Sandbox, so these tests cover both without needing separate cases
// per mode.

test('a tower cannot be placed directly on top of an existing one', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);
  game.setSelectedShopItem(game.SHOP_ITEMS.find((item) => item.typeKey === 'sunflower'));

  game.handleCanvasTap(300, 300);
  assert.equal(game.getTowers().length, 1);

  game.setSelectedShopItem(game.SHOP_ITEMS.find((item) => item.typeKey === 'sunflower'));
  game.handleCanvasTap(300, 300); // same exact spot

  assert.equal(game.getTowers().length, 1); // second placement rejected
});

test('a tower cannot be placed close enough to overlap an existing one\'s sprite', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);
  game.setSelectedShopItem(game.SHOP_ITEMS.find((item) => item.typeKey === 'sunflower'));
  game.handleCanvasTap(300, 300);

  // A few pixels apart — well inside the sum of two base-size towers'
  // visual radii — should still be rejected.
  game.setSelectedShopItem(game.SHOP_ITEMS.find((item) => item.typeKey === 'sunflower'));
  game.handleCanvasTap(310, 300);

  assert.equal(game.getTowers().length, 1);
});

test('a tower CAN be placed far enough away from every existing tower', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);
  game.setSelectedShopItem(game.SHOP_ITEMS.find((item) => item.typeKey === 'sunflower'));
  game.handleCanvasTap(300, 300);

  game.setSelectedShopItem(game.SHOP_ITEMS.find((item) => item.typeKey === 'sunflower'));
  game.handleCanvasTap(600, 300); // comfortably clear of the first tower

  assert.equal(game.getTowers().length, 2);
});

test('isTowerPlacementBlocked accounts for an existing tower\'s CURRENT (upgraded) size, not just its base size', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);

  const rose = game.createTower('rose');
  rose.x = 300;
  rose.y = 300;
  game.getTowers().push(rose);
  // Root Path's Stranglement-style growth can push a Rose's size well
  // past its base — simulate that directly rather than buying every tier.
  rose.stats.size = 60;

  // A spot that would be clear of a BASE-size Rose but not this grown one.
  assert.equal(game.isTowerPlacementBlocked(340, 300, 'sunflower'), true);
  assert.equal(game.isTowerPlacementBlocked(500, 300, 'sunflower'), false);
});

test('the placement-collision check applies in Sandbox mode too, not just normal modes', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox'); // unlimited money, but placement rules are unchanged
  game.setSelectedShopItem(game.SHOP_ITEMS.find((item) => item.typeKey === 'mushroom'));
  game.handleCanvasTap(300, 300);
  assert.equal(game.getTowers().length, 1);

  game.setSelectedShopItem(game.SHOP_ITEMS.find((item) => item.typeKey === 'mushroom'));
  game.handleCanvasTap(305, 305); // overlapping, even with infinite money available
  assert.equal(game.getTowers().length, 1);
});

test('base placement costs were doubled for the 3 original combat towers, plus Corpse Flower\'s own $750 (Coneflower has since been removed)', () => {
  const game = loadFullGameContext();
  const costs = Object.fromEntries(game.SHOP_ITEMS.map((item) => [item.typeKey, item.cost]));
  assert.deepEqual(costs, { sunflower: 50, rose: 90, mushroom: 150, corpseFlower: 750 });
});

test('starting money is $75', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  assert.equal(game.getMoney(), game.STARTING_MONEY);
  assert.equal(game.getMoney(), 75);
});
