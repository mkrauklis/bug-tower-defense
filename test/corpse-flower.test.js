const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Corpse Flower (direct request): a brand-new 5th base tower, $750, 10
// damage/sec baseline. This file covers its base stats and Hazard Path
// (path 1) specifically — see test/corpse-flower-acid-path.test.js and
// test/corpse-flower-growth-path.test.js for its other two paths. Hazard
// Path's own attackDamage is an ABSOLUTE replace per tier (20/25/30/45),
// a different convention from the compounding damageMultiplier every
// other tower's paths use — see towers.js's own comment on why. Tiers 2+
// also introduce the gas cloud: a brand-new, reusable "persistent AoE
// damage zone centered on the tower" mechanic, independent of the
// tower's own attack/targeting entirely.

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod', name: 'Tiny Isopod', color: '#78909c', radius: 12,
    maxHealth: 100000, health: 100000, speed: 0, isBoss: false, bounty: 10,
    waypointIndex: 0, spawnDelay: 0, spawned: true, x: 0, y: 0,
    immobilizedRemaining: 0, isZombie: false, isPurpleZombie: false,
    markedForRemoval: false, zombieExplosionDamage: 0,
    ...overrides,
  };
}

function maxOutHazardPath(game, tower, tiers = 4) {
  for (let i = 0; i < tiers; i += 1) game.purchaseUpgrade(tower, 0); // Hazard Path is pathIndex 0 — the only path so far
}

// --- Base tower ------------------------------------------------------------

test('Corpse Flower costs $750 and deals 10 damage/sec baseline, with no gas cloud yet', () => {
  const game = loadFullGameContext();
  const item = game.SHOP_ITEMS.find((i) => i.typeKey === 'corpseFlower');
  assert.equal(item.cost, 750);

  const tower = game.createTower('corpseFlower');
  assert.equal(tower.stats.damage, 10);
  assert.equal(tower.stats.attackInterval, 1); // 10 once a second = 10 dps, the literal spec
  assert.equal(tower.attackType, 'projectile');
  assert.equal(tower.gasCloud, null);
  assert.equal(tower.gasCloudCooldown, 0);
  assert.equal(tower.hasSpikes, false);
});

test('all 3 of Corpse Flower\'s paths are real', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  assert.ok(game.getAvailableUpgrade(tower, 0)); // Hazard Path
  assert.ok(game.getAvailableUpgrade(tower, 1)); // Acidic Mixture Path
  assert.ok(game.getAvailableUpgrade(tower, 2)); // Growth Path
});

// --- Hazard Path tiers -------------------------------------------------

test('each Hazard Path tier replaces attackDamage with its own absolute value', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');

  game.purchaseUpgrade(tower, 0); // Hazard
  assert.equal(tower.stats.damage, 20);
  assert.equal(tower.hasSpikes, true);
  assert.equal(tower.gasCloud, null); // tier 1 is attack-damage-only

  game.purchaseUpgrade(tower, 0); // Pre-caution
  assert.equal(tower.stats.damage, 25);
  assert.deepEqual(tower.gasCloud, { radius: 70, damagePerTick: 3, color: 'rgba(124, 179, 66, 0.4)' });
  assert.equal(tower.gasCloudCooldown, game.GAS_CLOUD_TICK_INTERVAL); // doesn't fire instantly on purchase

  game.purchaseUpgrade(tower, 0); // Eminent Chamber
  assert.equal(tower.stats.damage, 30);
  assert.deepEqual(tower.gasCloud, { radius: 100, damagePerTick: 5, color: 'rgba(124, 179, 66, 0.4)' });

  game.purchaseUpgrade(tower, 0); // Gas Leak
  assert.equal(tower.stats.damage, 45);
  assert.deepEqual(tower.gasCloud, { radius: 100, damagePerTick: 7, color: 'rgba(255, 235, 59, 0.45)' });
});

test('attackDamage never compounds — buying Hazard twice in a row (hypothetically) would just restate the same tier, not double it', () => {
  // Sanity check on the mechanism itself: attackDamage is a plain
  // `tower.stats.damage = effects.attackDamage` assignment, not `*=`.
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  game.purchaseUpgrade(tower, 0); // Hazard: damage -> 20
  assert.equal(tower.stats.damage, 20);
  // purchaseUpgrade only ever allows the NEXT tier in sequence, so this is
  // really testing getAvailableUpgrade's own gating, not re-buying Hazard —
  // included here as the plainest possible confirmation that tier 2's
  // absolute 25 doesn't become 20+25=45 by accident.
  game.purchaseUpgrade(tower, 0); // Pre-caution: damage -> 25, not 45
  assert.equal(tower.stats.damage, 25);
});

// --- The gas cloud mechanic ---------------------------------------------

test('the gas cloud ticks on a fixed 0.2s cadence and damages everything inside its radius', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  tower.x = 0;
  tower.y = 0;
  maxOutHazardPath(game, tower, 2); // Hazard + Pre-caution: radius 70, 3 dmg/tick

  const inside = makeTestEnemy({ x: 50, y: 0 }); // within the 70px radius
  const outside = makeTestEnemy({ x: 200, y: 0 }); // well outside it
  game.getActiveEnemies().push(inside, outside);

  game.updateTowerGasCloud(tower, tower.x, tower.y, game.GAS_CLOUD_TICK_INTERVAL - 0.001);
  assert.equal(inside.health, 100000); // hasn't reached the 0.2s tick yet

  game.updateTowerGasCloud(tower, tower.x, tower.y, 0.002); // crosses the threshold
  assert.equal(inside.health, 100000 - 3);
  assert.equal(outside.health, 100000); // never touched — outside the radius
});

test('the gas cloud keeps ticking every 0.2s for as long as an enemy stays inside it', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  tower.x = 0;
  tower.y = 0;
  maxOutHazardPath(game, tower, 2); // 3 dmg every 0.2s

  const enemy = makeTestEnemy({ x: 30, y: 0 });
  game.getActiveEnemies().push(enemy);

  for (let i = 0; i < 5; i += 1) game.updateTowerGasCloud(tower, tower.x, tower.y, game.GAS_CLOUD_TICK_INTERVAL);
  assert.equal(enemy.health, 100000 - 3 * 5); // 5 full ticks
});

test('the gas cloud is completely independent of the tower\'s own attack — it still ticks even with no target in attack range, and vice versa', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  tower.x = 0;
  tower.y = 0;
  maxOutHazardPath(game, tower, 2);

  // Inside the gas cloud's 70px radius but well outside the tower's own
  // 160px attack range check never even runs here — updateTowerGasCloud
  // doesn't touch tower.target/attackCooldown at all.
  const enemy = makeTestEnemy({ x: 65, y: 0 });
  game.getActiveEnemies().push(enemy);
  assert.equal(tower.target, null); // never set — updateTowerGasCloud alone was called, not updateTowerAttack

  game.updateTowerGasCloud(tower, tower.x, tower.y, game.GAS_CLOUD_TICK_INTERVAL);
  assert.equal(enemy.health, 100000 - 3);
});

test('updateTowerAttack fires both the normal attack and the gas cloud tick together once Hazard Path reaches tier 2', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  tower.x = 0;
  tower.y = 0;
  maxOutHazardPath(game, tower, 2); // damage 25, gas cloud 3/0.2s

  const target = makeTestEnemy({ x: 50, y: 0 }); // in both attack range and gas radius
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, game.GAS_CLOUD_TICK_INTERVAL);
  // The gas tick lands instantly (damageEnemy call, no travel time); the
  // main attack spawns a projectile that hasn't resolved yet.
  assert.equal(target.health, 100000 - 3);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);
  assert.equal(target.health, 100000 - 3 - 25);
});

test('a Hazard Path tier-1 tower (no gas cloud yet) never calls the gas-cloud tick at all — updateTowerAttack guards on tower.gasCloud, not just a truthy radius', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  tower.x = 0;
  tower.y = 0;
  maxOutHazardPath(game, tower, 1); // Hazard only — attack-damage tier, no gas cloud
  assert.equal(tower.gasCloud, null);

  const enemy = makeTestEnemy({ x: 10, y: 0 });
  game.getActiveEnemies().push(enemy);

  // Would throw (tower.gasCloud.radius on null) if updateTowerAttack ever
  // called updateTowerGasCloud without the `if (tower.gasCloud)` guard.
  assert.doesNotThrow(() => game.updateTowerAttack(tower, tower.x, tower.y, game.GAS_CLOUD_TICK_INTERVAL));

  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);
  assert.equal(enemy.health, 100000 - 20); // the main attack's own tier-1 damage only
});

// --- Generic systems (no special-casing needed for the new tower) -------

test('Corpse Flower is not Prodigy-eligible — it\'s not one of the 3 base types with an ultimate form', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  tower.x = 0;
  tower.y = 0;
  maxOutHazardPath(game, tower, 4); // fully maxed
  game.getTowers().push(tower);
  assert.equal(game.getProdigyOption(tower), null);
});

test('generic tower systems (visual size, placement collision, sell refund, shop cost) already work for Corpse Flower untouched', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);

  const tower = game.createTower('corpseFlower');
  assert.equal(game.getTowerVisualSize(tower), 26); // its own base size, under the 65 cap

  tower.x = 300;
  tower.y = 300;
  tower.moneySpent = 750;
  game.getTowers().push(tower);

  assert.equal(game.isTowerPlacementBlocked(305, 305, 'sunflower'), true); // too close
  assert.equal(game.isTowerPlacementBlocked(600, 300, 'sunflower'), false); // clear
  assert.equal(game.getSellRefund(tower), 375); // 750 * 0.5

  const item = game.SHOP_ITEMS.find((i) => i.typeKey === 'corpseFlower');
  assert.equal(game.getShopItemCost(item), 750);
});
