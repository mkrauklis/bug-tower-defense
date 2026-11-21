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

test('Fire Path stacks attack interval, size, and damage as specified (2nd balance pass numbers)', () => {
  const game = loadGameContext();
  const tower = game.createTower('sunflower');
  const baseInterval = tower.stats.attackInterval;
  const baseSize = tower.stats.size;

  game.purchaseUpgrade(tower, 1); // Spark
  // 2nd balance pass (direct request: "make towers not overpowered for
  // their price") — softened from a flat 0.5x (full doubling) to 0.8x
  // (a 25% speedup); see this tier's own comment in towers.js for the
  // full roster $/DPS survey that motivated it.
  assert.equal(tower.stats.attackInterval, baseInterval * 0.8);
  assert.equal(tower.stats.size, baseSize * 0.8);
  assert.equal(tower.flame, 'small');

  game.purchaseUpgrade(tower, 1); // Molten Core
  // Molten Core's own attackIntervalMultiplier was removed entirely in
  // the 2nd balance pass (it used to stack a SECOND speed boost on top
  // of Spark's own) — interval stays exactly what Spark alone set.
  assert.equal(tower.stats.attackInterval, baseInterval * 0.8);
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

test('Rose\'s Thorn Path grows vine count 1 -> 2 -> 5 -> 8 and size alongside the base attack, but vine damage on its own gentler 2/4/6/8 curve (balance pass)', () => {
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
  // Balance pass (direct request): vine damage used to ride the exact
  // same multiplier as the base attack — with 8 vines all getting that
  // same 8x compounding by tier 4, vines alone dealt more dps than the
  // base attack, the worst $/DPS outlier in the whole roster. Vine
  // damage now grows on its own explicit, absolute-replace curve
  // instead (see purchaseUpgrade()'s own comment on effects.vineDamage).
  assert.equal(tower.vineDamage, 4);

  game.purchaseUpgrade(tower, 0); // Overgrowth
  assert.equal(tower.vineCount, 5);
  assert.equal(tower.vineRangeMultiplier, 2);
  assert.ok(Math.abs(tower.stats.size - baseSize * 1.1 * 1.25 * 1.5) < 1e-9);
  assert.equal(tower.stats.damage, baseDamage * 2 * 2);
  assert.equal(tower.vineDamage, 6);

  game.purchaseUpgrade(tower, 0); // Vigorous
  assert.equal(tower.vineCount, 8);
  assert.equal(tower.tallStem, true);
  assert.equal(tower.stats.damage, baseDamage * 2 * 2 * 2);
  assert.equal(tower.vineDamage, 8);
});

test('Projectile Path (Poke) boosts damage 1.5x with no visible effect from the vine-length note', () => {
  const game = loadGameContext();
  const tower = game.createTower('rose');
  const baseDamage = tower.stats.damage;

  assert.equal(game.purchaseUpgrade(tower, 2), true);

  assert.ok(Math.abs(tower.stats.damage - baseDamage * 1.5) < 1e-9);
  assert.equal(tower.vineCount, 0); // no vines exist on a Path-3 Rose — the "2x longer" note is a documented no-op
  assert.equal(tower.hasThornShot, false); // not introduced until Projectiles
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

  // The 3 roots shouldn't be stacked on top of each other (ROOT_MIN_SEPARATION).
  const [a, b, c] = tower.roots;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 18);
  assert.ok(Math.hypot(a.x - c.x, a.y - c.y) >= 18);
  assert.ok(Math.hypot(b.x - c.x, b.y - c.y) >= 18);
});

test('Root Path tiers 2-4 stack damage, root count, grab, and visuals as specified', () => {
  const game = loadGameContext();
  const tower = game.createTower('rose');
  // A spot with generous path coverage on multiple nearby segments, not a
  // corner — Stranglement needs room for 25 roots, and a position right
  // next to a corner (like Rooting's own (220, 150) test above, which only
  // ever needs 3) doesn't have enough nearby path to reliably fit that many
  // at ROOT_MIN_SEPARATION.
  tower.x = 520;
  tower.y = 430;
  const baseDamage = tower.stats.damage;

  game.purchaseUpgrade(tower, 1); // Rooting: x1.5, 3 roots
  assert.equal(tower.roots.length, 3);

  game.purchaseUpgrade(tower, 1); // Rootbound: x2, +2 roots (5 total), body roots
  assert.ok(Math.abs(tower.stats.damage - baseDamage * 1.5 * 2) < 1e-9);
  assert.equal(tower.roots.length, 5);
  assert.equal(tower.bodyRootGrowths, true);
  assert.equal(tower.stats.size, game.TOWER_TYPES.rose.baseStats.size); // no size change yet

  game.purchaseUpgrade(tower, 1); // Tanglement: x2, +5 roots (10 total), grab, +2 body flowers, 11.5x size
  assert.ok(Math.abs(tower.stats.damage - baseDamage * 1.5 * 2 * 2) < 1e-9);
  assert.equal(tower.roots.length, 10);
  assert.deepEqual(
    { chance: tower.rootGrabChance, damage: tower.rootGrabDamage, duration: tower.rootGrabDuration },
    { chance: 0.15, damage: 10, duration: 2 }
  );
  assert.equal(tower.bodyFlowerGrowths, 2);
  assert.ok(Math.abs(tower.stats.size - game.TOWER_TYPES.rose.baseStats.size * 11.5) < 1e-6);

  game.purchaseUpgrade(tower, 1); // Stranglement: +15 roots (25 total), +2 body flowers (4 total), longThorns
  assert.equal(tower.roots.length, 25);
  assert.equal(tower.bodyFlowerGrowths, 4);
  assert.equal(tower.longThorns, true);
  // No further damage multiplier at this tier, per the brief.
  assert.ok(Math.abs(tower.stats.damage - baseDamage * 1.5 * 2 * 2) < 1e-9);

  // None of the roots across all 4 purchases ended up stacked on each other.
  for (let i = 0; i < tower.roots.length; i += 1) {
    for (let j = i + 1; j < tower.roots.length; j += 1) {
      const dist = Math.hypot(tower.roots[i].x - tower.roots[j].x, tower.roots[i].y - tower.roots[j].y);
      assert.ok(dist >= 18, `roots ${i} and ${j} are only ${dist.toFixed(1)}px apart`);
    }
  }
});

test('Root Path is maxed out after Stranglement — no further purchase possible', () => {
  const game = loadGameContext();
  const tower = game.createTower('rose');
  tower.x = 220;
  tower.y = 150;
  for (let i = 0; i < 4; i += 1) assert.equal(game.purchaseUpgrade(tower, 1), true);
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

test('Projectile Path tiers 2-4 introduce and stack the thorn-shot attack as specified', () => {
  const game = loadGameContext();
  const tower = game.createTower('rose');
  const baseDamage = tower.stats.damage;
  const baseInterval = tower.stats.attackInterval;
  const closeEnough = (a, b) => Math.abs(a - b) < 1e-9;

  game.purchaseUpgrade(tower, 2); // Poke: x1.5 damage
  assert.ok(closeEnough(tower.stats.damage, baseDamage * 1.5));

  game.purchaseUpgrade(tower, 2); // Projectiles: thorn-shot introduced, +20% base attack speed
  assert.equal(tower.hasThornShot, true);
  assert.equal(tower.thornShotDamage, 2);
  assert.equal(tower.thornShotInterval, 1.5);
  assert.equal(tower.thornShotCount, 1);
  assert.equal(tower.thornShotPoison, null);
  assert.ok(closeEnough(tower.stats.attackInterval, baseInterval / 1.2));

  game.purchaseUpgrade(tower, 2); // Even More Projectiles: x3 thorns, +20% base attack speed, greenish
  assert.equal(tower.thornShotCount, 3);
  assert.equal(tower.thornShotDamage, 2); // unaffected — this tier has no damageMultiplier
  assert.ok(closeEnough(tower.stats.attackInterval, baseInterval / 1.2 / 1.2));
  assert.equal(tower.stats.color, '#6b8e4e');

  game.purchaseUpgrade(tower, 2); // Poison Projectiles: poison + x2 damage (base and thorn-shot alike)
  assert.deepEqual(tower.thornShotPoison, { damagePerSecond: 5, duration: 3 });
  assert.ok(closeEnough(tower.stats.damage, baseDamage * 1.5 * 2));
  assert.equal(tower.thornShotDamage, 4); // 2 * 2
  assert.equal(tower.stats.color, '#2e7d32');
  assert.equal(tower.thornShotCount, 3); // untouched by this tier
});

test('Projectile Path locks out the other two paths once bought', () => {
  const game = loadGameContext();
  const tower = game.createTower('rose');
  game.purchaseUpgrade(tower, 2); // Poke
  assert.equal(tower.chosenPath, 2);
  assert.equal(game.getAvailableUpgrade(tower, 0), null); // Thorn Path locked out
  assert.equal(game.getAvailableUpgrade(tower, 1), null); // Root Path locked out
});

test('createTower(\'mushroom\') returns Mushroom\'s own base stats with Decay Path untouched', () => {
  const game = loadGameContext();
  const tower = game.createTower('mushroom');
  assert.equal(tower.type, 'mushroom');
  assert.deepEqual(tower.stats, game.TOWER_TYPES.mushroom.baseStats);
  assert.equal(tower.zombifyChance, 0);
  assert.equal(tower.hasSkull, false);
  assert.equal(tower.gasColor, null);
});

test('Mushroom\'s Decay Path stacks damage, the reused burn DoT, cap height, and the zombify/explosion REPLACE semantics', () => {
  const game = loadGameContext();
  const tower = game.createTower('mushroom');
  const baseDamage = tower.stats.damage;
  const baseSize = tower.stats.size;
  const closeEnough = (a, b) => Math.abs(a - b) < 1e-9;

  game.purchaseUpgrade(tower, 0); // Decay
  assert.deepEqual(tower.burn, { damagePerSecond: 1, duration: 5 });
  assert.equal(tower.stats.color, '#4caf50');
  assert.ok(closeEnough(tower.capHeightMultiplier, 1.15));
  assert.equal(tower.stats.damage, baseDamage); // Decay itself has no damageMultiplier

  game.purchaseUpgrade(tower, 0); // Zombify
  assert.equal(tower.zombifyChance, 0.2);
  assert.equal(tower.zombieExplosionDamage, 3);
  assert.equal(tower.stats.color, '#2e7d32');
  assert.ok(closeEnough(tower.capHeightMultiplier, 1.15 * 1.15));

  game.purchaseUpgrade(tower, 0); // Undead Army
  assert.ok(closeEnough(tower.stats.damage, baseDamage * 2.5));
  assert.equal(tower.zombifyChance, 0.3); // replaced, not 0.2 + 0.3
  assert.equal(tower.zombieExplosionDamage, 3); // untouched by this tier
  assert.equal(tower.hasSkull, true);
  assert.equal(tower.gasColor, '#66bb6a');

  game.purchaseUpgrade(tower, 0); // Necro-Mush
  assert.ok(closeEnough(tower.stats.damage, baseDamage * 2.5 * 2));
  assert.equal(tower.zombifyChance, 0.5); // replaced again, not additive
  assert.equal(tower.zombieExplosionDamage, 10); // replaced, not 3 + 10
  assert.equal(tower.stats.color, '#6a1b9a');
  assert.equal(tower.gasColor, '#9c27b0');
  assert.equal(tower.stats.size, baseSize); // Decay Path never touches size
});

test('Mushroom\'s Path 2 and Path 3 are scaffolded as undesigned', () => {
  const game = loadGameContext();
  const tower = game.createTower('mushroom');
  assert.equal(game.getAvailableUpgrade(tower, 1), null);
  assert.equal(game.getAvailableUpgrade(tower, 2), null);
  assert.equal(game.purchaseUpgrade(tower, 1), false);
  assert.equal(game.purchaseUpgrade(tower, 2), false);
});
