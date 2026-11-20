const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Coneflower's third path (direct request): a discount aura — towers
// PLACED within discountRadius of a Coupons-path Coneflower cost less,
// non-stacking (strongest discount wins, same convention as Mushroom's
// Enable Path aura), plus its own flat cash/sec income (the existing
// Quality Path `income` convention, reused unchanged). See towers.js's own
// design-rationale comment on the path for the judgment calls made
// (placement cost only, non-stacking across the whole path not just tier
// 4, discountRadius set once at tier 1).

function buyCoupons(game, tower, tiers) {
  for (let i = 0; i < tiers; i += 1) game.purchaseUpgrade(tower, 2); // Coupons Path is pathIndex 2
}

test('each Coupons Path tier sets its own absolute income and discount percent, replacing the last', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('coneflower');

  game.purchaseUpgrade(tower, 2); // Coupons
  assert.equal(tower.incomeRate, 3);
  assert.equal(tower.discountPercent, 5);
  assert.equal(tower.discountRadius, 150);

  game.purchaseUpgrade(tower, 2); // Cheaper Products
  assert.equal(tower.incomeRate, 5);
  assert.equal(tower.discountPercent, 10);
  assert.equal(tower.discountRadius, 150); // unchanged — only set once, at tier 1

  game.purchaseUpgrade(tower, 2); // Discounted
  assert.equal(tower.incomeRate, 7);
  assert.equal(tower.discountPercent, 15);

  game.purchaseUpgrade(tower, 2); // Dealership
  assert.equal(tower.incomeRate, 10);
  assert.equal(tower.discountPercent, 25);
  assert.equal(tower.discountRadius, 150);
});

test('a tower that never bought Coupons Path has no discount', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('coneflower');
  game.purchaseUpgrade(tower, 0); // Quality Path, not Coupons
  assert.equal(tower.discountPercent, 0);
  assert.equal(tower.discountRadius, 0);
});

test('getStrongestDiscountPercentAt is 0 with nothing on the field, or outside every Coupons Coneflower\'s radius', () => {
  const game = loadFullGameContext();
  assert.equal(game.getStrongestDiscountPercentAt(0, 0), 0);

  const tower = game.createTower('coneflower');
  tower.x = 0;
  tower.y = 0;
  buyCoupons(game, tower, 1); // 5%, radius 150
  game.getTowers().push(tower);

  assert.equal(game.getStrongestDiscountPercentAt(200, 0), 0); // outside the 150px radius
});

test('getStrongestDiscountPercentAt returns the discount for a point within range', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('coneflower');
  tower.x = 0;
  tower.y = 0;
  buyCoupons(game, tower, 2); // 10%, radius 150
  game.getTowers().push(tower);

  assert.equal(game.getStrongestDiscountPercentAt(100, 0), 10);
  assert.equal(game.getStrongestDiscountPercentAt(150, 0), 10); // exactly at the radius — still in range
});

test('two overlapping Coupons Coneflowers give the single strongest discount, not a sum', () => {
  const game = loadFullGameContext();
  const weak = game.createTower('coneflower');
  weak.x = 0;
  weak.y = 0;
  buyCoupons(game, weak, 1); // 5%

  const strong = game.createTower('coneflower');
  strong.x = 50;
  strong.y = 0;
  buyCoupons(game, strong, 3); // 15%

  game.getTowers().push(weak, strong);

  // A point in range of both — the real sum would be 20%, non-stacking
  // means just the stronger one's 15%.
  assert.equal(game.getStrongestDiscountPercentAt(25, 0), 15);
});

test('getShopItemCostAt applies the discount and rounds to a whole dollar amount', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('coneflower');
  tower.x = 0;
  tower.y = 0;
  buyCoupons(game, tower, 3); // 15% off, radius 150
  game.getTowers().push(tower);

  const roseItem = game.SHOP_ITEMS.find((item) => item.typeKey === 'rose');
  assert.equal(roseItem.cost, 90);
  assert.equal(game.getShopItemCostAt(roseItem, 50, 0), 77); // 90 * 0.85 = 76.5, rounded to 77
  assert.equal(game.getShopItemCostAt(roseItem, 500, 0), 90); // out of range — full price
});

test('the discount applies to a Coneflower\'s own (possibly tier-4-doubled) placement cost too', () => {
  const game = loadFullGameContext();
  const discounter = game.createTower('coneflower');
  discounter.x = 0;
  discounter.y = 0;
  buyCoupons(game, discounter, 1); // 5% off

  // A second, fully-maxed Coneflower on Quality Path — triggers the
  // existing tier-4 cost-doubling (500 -> 1000) independently of this path.
  const maxedQuality = game.createTower('coneflower');
  for (let i = 0; i < 4; i += 1) game.purchaseUpgrade(maxedQuality, 0);
  game.getTowers().push(discounter, maxedQuality);

  const coneflowerItem = game.SHOP_ITEMS.find((item) => item.typeKey === 'coneflower');
  assert.equal(game.getShopItemCost(coneflowerItem), 1000); // the doubled base price
  assert.equal(game.getShopItemCostAt(coneflowerItem, 50, 0), 950); // 1000 * 0.95, discounted on top of the doubling
});

// (350, 450) and its nearby test points are chosen well clear of Deep
// Forest's own path segments (checked against DEEP_FOREST_WAYPOINTS in
// map.js) so handleCanvasTap's own isPointOnPath/placement-collision
// checks never interfere with what these tests are actually exercising.

test('handleCanvasTap actually charges the discounted price when placing within range', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  const tower = game.createTower('coneflower');
  tower.x = 350;
  tower.y = 450;
  buyCoupons(game, tower, 1); // 5% off, radius 150
  game.getTowers().push(tower);
  game.setMoney(1000);

  game.setSelectedShopItem(game.SHOP_ITEMS.find((item) => item.typeKey === 'rose'));
  game.handleCanvasTap(430, 450); // 80px from the discounter — within its 150px radius

  const placed = game.getTowers().find((t) => t.type === 'rose');
  assert.ok(placed);
  assert.equal(placed.moneySpent, 86); // 90 * 0.95 = 85.5, rounded to 86
  assert.equal(game.getMoney(), 1000 - 86);
});

test('handleCanvasTap charges full price when placing outside every discount\'s range', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  const tower = game.createTower('coneflower');
  tower.x = 350;
  tower.y = 450;
  buyCoupons(game, tower, 1); // radius 150
  game.getTowers().push(tower);
  game.setMoney(1000);

  game.setSelectedShopItem(game.SHOP_ITEMS.find((item) => item.typeKey === 'rose'));
  game.handleCanvasTap(900, 450); // 550px away — well outside the 150px radius

  const placed = game.getTowers().find((t) => t.type === 'rose');
  assert.ok(placed);
  assert.equal(placed.moneySpent, 90); // full price
});
