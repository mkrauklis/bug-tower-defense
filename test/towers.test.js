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

test('getAvailableUpgrade returns null for an undesigned path (generic engine behavior)', () => {
  const game = loadGameContext();
  // The Sunflower's own three paths are all designed now (Solar, Fire,
  // Storm) — synthesize a minimal type with an undesigned path so the
  // engine's generic null-path handling still has direct coverage.
  game.TOWER_TYPES.__testType = {
    name: 'Test Tower',
    baseStats: { damage: 1, size: 1, color: '#fff', range: 1, attackInterval: 1 },
    upgradePaths: [null, null, null],
  };
  const tower = game.createTower('__testType');
  assert.equal(game.getAvailableUpgrade(tower, 0), null);
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
  assert.equal(tower.fireMark, true); // Precision Rays' face mark
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

test('Storm Path stacks attack speed and reaches both periodic effects (Jolt -> Shock -> Conductor -> Shockwave)', () => {
  const game = loadGameContext();
  const tower = game.createTower('sunflower');
  const baseInterval = tower.stats.attackInterval;
  const baseRange = tower.stats.range;
  const baseSize = tower.stats.size;
  const closeEnough = (a, b) => Math.abs(a - b) < 1e-9;

  game.purchaseUpgrade(tower, 2); // Jolt: +15% attack speed
  assert.ok(closeEnough(tower.stats.attackInterval, baseInterval / 1.15));
  assert.equal(tower.sparks, 'small');

  game.purchaseUpgrade(tower, 2); // Shock: another +50%, on top of Jolt
  assert.ok(closeEnough(tower.stats.attackInterval, baseInterval / 1.15 / 1.5));
  assert.equal(tower.glow, '#fff59d');

  game.purchaseUpgrade(tower, 2); // Conductor: another +15%, range doubles, single-target jolt
  assert.ok(closeEnough(tower.stats.attackInterval, baseInterval / 1.15 / 1.5 / 1.15));
  assert.ok(closeEnough(tower.stats.range, baseRange * 2));
  assert.equal(tower.boltMark, true);
  assert.deepEqual(tower.spark, { interval: 1, damage: 7 });

  game.purchaseUpgrade(tower, 2); // Shockwave: another +25%, size doubles, AoE pulse
  assert.ok(closeEnough(tower.stats.attackInterval, baseInterval / 1.15 / 1.5 / 1.15 / 1.25));
  assert.ok(closeEnough(tower.stats.size, baseSize * 2));
  assert.deepEqual(tower.shockwave, { interval: 2.5, damage: 15 });
  assert.ok(tower.clouds);
  // Conductor's single-target jolt is still active alongside Shockwave's
  // AoE pulse — buying Shockwave doesn't replace it.
  assert.deepEqual(tower.spark, { interval: 1, damage: 7 });
});

test('Storm Path locks out the other two paths once its first upgrade is bought', () => {
  const game = loadGameContext();
  const tower = game.createTower('sunflower');
  game.purchaseUpgrade(tower, 2); // Jolt
  assert.equal(tower.chosenPath, 2);
  assert.equal(game.getAvailableUpgrade(tower, 0), null); // Solar Path locked out
  assert.equal(game.getAvailableUpgrade(tower, 1), null); // Fire Path locked out
});

test('createTower(\'rose\') returns Rose\'s own base stats with no vines yet', () => {
  const game = loadGameContext();
  const tower = game.createTower('rose');

  assert.equal(tower.type, 'rose');
  assert.deepEqual(tower.stats, game.TOWER_TYPES.rose.baseStats);
  assert.equal(tower.vineCount, 0);
  assert.equal(tower.vineDamage, 0);
});

test('Rose\'s Thorn Path grows vine count 1 -> 2 -> 5 -> 8, scaling damage and size alongside the base attack', () => {
  const game = loadGameContext();
  const tower = game.createTower('rose');
  const baseDamage = tower.stats.damage; // 2
  const baseSize = tower.stats.size;

  game.purchaseUpgrade(tower, 0); // Thorns
  assert.equal(tower.vineCount, 1);
  assert.equal(tower.vineDamage, 2);
  assert.equal(tower.vineInterval, 1);
  assert.ok(Math.abs(tower.stats.size - baseSize * 1.1) < 1e-9);
  assert.equal(tower.stats.damage, baseDamage); // Thorns itself has no damageMultiplier

  game.purchaseUpgrade(tower, 0); // Puncture
  assert.equal(tower.vineCount, 2);
  assert.equal(tower.moreThorns, true);
  assert.ok(Math.abs(tower.stats.size - baseSize * 1.1 * 1.25) < 1e-9);
  assert.equal(tower.stats.damage, baseDamage * 2);
  assert.equal(tower.vineDamage, 2 * 2); // vine damage rides the same multiplier as the base attack

  game.purchaseUpgrade(tower, 0); // Overgrowth
  assert.equal(tower.vineCount, 5);
  assert.equal(tower.vineRangeMultiplier, 2);
  assert.ok(Math.abs(tower.stats.size - baseSize * 1.1 * 1.25 * 1.5) < 1e-9);
  assert.equal(tower.stats.damage, baseDamage * 2 * 2);
  assert.equal(tower.vineDamage, 2 * 2 * 2);

  game.purchaseUpgrade(tower, 0); // Vigorous
  assert.equal(tower.vineCount, 8);
  assert.equal(tower.tallStem, true);
  assert.equal(tower.stats.damage, baseDamage * 2 * 2 * 2);
  assert.equal(tower.vineDamage, 2 * 2 * 2 * 2);
  // Both the base attack and every vine get hit by the exact same x2/x2/x2
  // multiplier chain — they just started from different base numbers
  // (tower.stats.damage from TOWER_TYPES.rose.baseStats, vineDamage from
  // Thorns' own `vine.damage`), so they stay in that same ratio rather than
  // converging to one number.
  assert.equal(tower.stats.damage / tower.vineDamage, baseDamage / 2);
});

test('Rose\'s Path 3 is still scaffolded as entirely undesigned', () => {
  const game = loadGameContext();
  const tower = game.createTower('rose');
  assert.equal(game.getAvailableUpgrade(tower, 2), null);
  assert.equal(game.purchaseUpgrade(tower, 2), false);
});

test('Rooting (Root Path tier 1) boosts damage 1.5x and spawns 3 root traps on the path near the tower', () => {
  const game = loadGameContext();
  const tower = game.createTower('rose');
  // Deliberately close to the path's (220, 80)-(220, 300) vertical segment,
  // well within ROOT_SPAWN_RADIUS, so root placement has real path to work with.
  tower.x = 220;
  tower.y = 150;
  const baseDamage = tower.stats.damage;

  assert.equal(game.purchaseUpgrade(tower, 1), true);

  assert.ok(Math.abs(tower.stats.damage - baseDamage * 1.5) < 1e-9);
  assert.equal(tower.roots.length, 3);
  tower.roots.forEach((root) => {
    assert.equal(root.damage, 2);
    assert.ok(game.isPointOnPath(root.x, root.y, 0)); // lands exactly on the path, not just "nearby"
  });

  // The 3 roots shouldn't be stacked on top of each other.
  const [a, b, c] = tower.roots;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 30);
  assert.ok(Math.hypot(a.x - c.x, a.y - c.y) >= 30);
  assert.ok(Math.hypot(b.x - c.x, b.y - c.y) >= 30);
});

test('Root Path\'s remaining tiers (2-4) are still undesigned placeholders', () => {
  const game = loadGameContext();
  const tower = game.createTower('rose');
  tower.x = 220;
  tower.y = 150;
  game.purchaseUpgrade(tower, 1); // Rooting

  assert.equal(game.getAvailableUpgrade(tower, 1), null);
  assert.equal(game.purchaseUpgrade(tower, 1), false);
});

test('Rooting locks out the other two paths once bought', () => {
  const game = loadGameContext();
  const tower = game.createTower('rose');
  tower.x = 220;
  tower.y = 150;
  game.purchaseUpgrade(tower, 1); // Rooting
  assert.equal(tower.chosenPath, 1);
  assert.equal(game.getAvailableUpgrade(tower, 0), null); // Thorn Path locked out
});
