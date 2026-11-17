const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

test('createTower returns the type\'s base stats and no upgrades chosen', () => {
  const game = loadGameContext();
  const tower = game.createTower('sunflower');

  assert.equal(tower.type, 'sunflower');
  assert.equal(tower.chosenPath, null);
  assert.equal(tower.upgradesPurchased, 0);
  assert.equal(tower.attackType, 'projectile');
  assert.deepEqual(tower.stats, game.TOWER_TYPES.sunflower.baseStats);
});

test('createTower throws for an unknown tower type', () => {
  const game = loadGameContext();
  assert.throws(() => game.createTower('nope'));
});

test('getAvailableUpgrade returns null for an undesigned path', () => {
  const game = loadGameContext();
  const tower = game.createTower('sunflower');
  assert.equal(game.getAvailableUpgrade(tower, 2), null); // Path 3 is still undesigned
});

test('purchasing a path\'s first upgrade locks out the other two paths', () => {
  const game = loadGameContext();
  const tower = game.createTower('sunflower');

  assert.equal(game.purchaseUpgrade(tower, 0), true);
  assert.equal(tower.chosenPath, 0);
  assert.equal(game.getAvailableUpgrade(tower, 1), null); // Fire Path locked out
  assert.equal(game.purchaseUpgrade(tower, 1), false);
});

test('upgrades within a path must be bought in order, one at a time', () => {
  const game = loadGameContext();
  const tower = game.createTower('sunflower');

  game.purchaseUpgrade(tower, 0); // Glare
  assert.equal(tower.upgradesPurchased, 1);
  const next = game.getAvailableUpgrade(tower, 0);
  assert.equal(next.name, 'Precision Rays');
});

test('a maxed-out path has no further available upgrade', () => {
  const game = loadGameContext();
  const tower = game.createTower('sunflower');

  for (let i = 0; i < 4; i += 1) assert.equal(game.purchaseUpgrade(tower, 0), true);
  assert.equal(game.getAvailableUpgrade(tower, 0), null);
  assert.equal(game.purchaseUpgrade(tower, 0), false);
});

test('Solar Path stacks damage multiplicatively as specified (5 -> 10 -> 15 -> 30 -> 30)', () => {
  const game = loadGameContext();
  const tower = game.createTower('sunflower');
  const expected = [10, 15, 30, 30];

  expected.forEach((damage) => {
    game.purchaseUpgrade(tower, 0);
    assert.equal(tower.stats.damage, damage);
  });

  assert.equal(tower.attackType, 'ray');
  assert.deepEqual(tower.burn, { damagePerSecond: 10, duration: 5 });
});

test('Fire Path stacks attack interval, size, and damage as specified', () => {
  const game = loadGameContext();
  const tower = game.createTower('sunflower');
  const baseInterval = tower.stats.attackInterval;
  const baseSize = tower.stats.size;

  game.purchaseUpgrade(tower, 1); // Spark
  assert.equal(tower.stats.attackInterval, baseInterval * 0.5);
  assert.equal(tower.stats.size, baseSize * 0.8);
  assert.equal(tower.flame, 'small');

  game.purchaseUpgrade(tower, 1); // Molten Core
  assert.equal(tower.stats.attackInterval, baseInterval * 0.25);
  assert.equal(tower.stats.damage, 10);
  assert.ok(tower.puddle);

  game.purchaseUpgrade(tower, 1); // Flamewall
  assert.equal(tower.stats.size, baseSize * 0.8 * 3);
  assert.equal(tower.stats.damage, 20);
  assert.equal(tower.flame, 'large');

  game.purchaseUpgrade(tower, 1); // Wildfire
  assert.equal(tower.stats.damage, 40);
  assert.equal(tower.attackType, 'fireball');
  assert.ok(tower.orbit);
});

test('an undesigned path (Path 3) stays unavailable even with no path chosen yet', () => {
  const game = loadGameContext();
  const tower = game.createTower('sunflower');
  assert.equal(game.purchaseUpgrade(tower, 2), false);
  assert.equal(tower.chosenPath, null);
});
