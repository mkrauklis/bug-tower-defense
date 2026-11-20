const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Direct request: every time ANY Coneflower reaches tier 4 on either
// path (Quality Path's Perfect Condition or Overgrowth Path's
// Plantation), the BASE PLACEMENT cost of buying a brand new Coneflower
// doubles, globally, for the rest of the run — tracked as a running
// count (coneflowerTier4Count) in a single global multiplier
// (baseCost * 2^count), not a per-tower cost. It must never touch
// upgrade costs, only the shop price of placing a new one.

function buyConeflowerUpgrade(game, tower, pathIndex) {
  const region = { id: `upgrade:${pathIndex}:${tower.upgradesPurchased}`, data: { pathIndex, isNextInLine: true } };
  // activateRegion reads region.data.upgrade directly, so build the same
  // shape getAvailableUpgrade() would hand the real UI — simplest way to
  // exercise the real purchase path (and its tier-4 side effect) rather
  // than calling purchaseUpgrade() directly, which doesn't know about
  // coneflowerTier4Count at all (that hook lives in activateRegion()).
  const upgrade = game.getAvailableUpgrade(tower, pathIndex);
  region.data.upgrade = upgrade;
  game.setSelectedTower(tower);
  game.activateRegion(region);
}

test('Coneflower\'s placement cost starts at the base $500 (doubled base cost), untouched by anything else', () => {
  const game = loadFullGameContext();
  assert.equal(game.getShopItemCost(game.SHOP_ITEMS.find((item) => item.typeKey === 'coneflower')), 500);
});

test('reaching tier 4 on Quality Path doubles every future Coneflower\'s placement cost', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);
  const coneflower = game.createTower('coneflower');
  game.getTowers().push(coneflower);

  for (let i = 0; i < 4; i += 1) buyConeflowerUpgrade(game, coneflower, 0); // Quality Path to Perfect Condition

  assert.equal(game.getConeflowerTier4Count(), 1);
  const item = game.SHOP_ITEMS.find((i) => i.typeKey === 'coneflower');
  assert.equal(game.getShopItemCost(item), 1000); // 500 * 2^1
});

test('reaching tier 4 on Overgrowth Path counts the same as Quality Path (upgradesPurchased hitting 4 either way)', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);
  const coneflower = game.createTower('coneflower');
  game.getTowers().push(coneflower);

  for (let i = 0; i < 4; i += 1) buyConeflowerUpgrade(game, coneflower, 1); // Overgrowth Path to Plantation

  assert.equal(game.getConeflowerTier4Count(), 1);
  const item = game.SHOP_ITEMS.find((i) => i.typeKey === 'coneflower');
  assert.equal(game.getShopItemCost(item), 1000);
});

test('the cost doubles again for a second Coneflower that also reaches tier 4 — a running multiplier, not per-tower', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);
  const first = game.createTower('coneflower');
  const second = game.createTower('coneflower');
  game.getTowers().push(first, second);

  for (let i = 0; i < 4; i += 1) buyConeflowerUpgrade(game, first, 0);
  for (let i = 0; i < 4; i += 1) buyConeflowerUpgrade(game, second, 1);

  assert.equal(game.getConeflowerTier4Count(), 2);
  const item = game.SHOP_ITEMS.find((i) => i.typeKey === 'coneflower');
  assert.equal(game.getShopItemCost(item), 2000); // 500 * 2^2
});

test('the cost-doubling is specific to Coneflower — other towers\' placement costs are unaffected', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);
  const coneflower = game.createTower('coneflower');
  game.getTowers().push(coneflower);
  for (let i = 0; i < 4; i += 1) buyConeflowerUpgrade(game, coneflower, 0);

  const sunflowerItem = game.SHOP_ITEMS.find((i) => i.typeKey === 'sunflower');
  assert.equal(game.getShopItemCost(sunflowerItem), 50); // unchanged
});

test('reaching only tier 3 does not trigger the doubling — it fires exactly on tier 4', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);
  const coneflower = game.createTower('coneflower');
  game.getTowers().push(coneflower);
  for (let i = 0; i < 3; i += 1) buyConeflowerUpgrade(game, coneflower, 0); // Rooting/High Standard/Quality Market only

  assert.equal(game.getConeflowerTier4Count(), 0);
  const item = game.SHOP_ITEMS.find((i) => i.typeKey === 'coneflower');
  assert.equal(game.getShopItemCost(item), 500);
});

test('the doubling never touches upgrade costs themselves, only the shop placement price', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);
  const first = game.createTower('coneflower');
  game.getTowers().push(first);
  for (let i = 0; i < 4; i += 1) buyConeflowerUpgrade(game, first, 0);

  // A second, freshly-placed Coneflower's own upgrade costs ($300/$850/
  // $2000/$5000 for Overgrowth) are plain static numbers on the upgrade
  // data itself — confirm they're untouched by coneflowerTier4Count.
  const second = game.createTower('coneflower');
  const nextUpgrade = game.getAvailableUpgrade(second, 1);
  assert.equal(nextUpgrade.cost, 300);
});
