const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext, loadGameContext } = require('./support/loadGame');

// Avalanche Path (direct follow-up request, relayed from the peer
// session): Arctic Willow's 3rd and final path. Frosted Path is
// single-target %-slow and Brittle Path is single-target freeze+tick-
// damage — this one fills the gap neither covers: AoE splash damage, a
// crowd-clearing option instead of single-target control. `splash` is a
// whole-object {radius, damage, slow?, reburstChance?} replace each
// tier, riding along on the tower's own ordinary attack via the same
// generalized projectile pipeline slow/freeze already use (see
// spawnProjectile()/resolveProjectile() in game.js) — "retarget
// damageEnemy() generically, no per-effect special-casing," the
// request's own explicit instruction, same as every other AoE effect in
// the game (gasCloud/gasRing/puddle/shockwave all reuse
// getEnemiesInRadius()+damageEnemy() too).

test('Avalanche Path is registered as Arctic Willow\'s 3rd path, with the 4 named tiers escalating in cost', () => {
  const game = loadGameContext();
  const path = game.TOWER_TYPES.arcticWillow.upgradePaths[2];
  assert.equal(path.name, 'Avalanche Path');
  assert.deepEqual(
    path.upgrades.map((u) => u.name),
    ['Snowball', 'Snowdrift', 'Avalanche', 'Glacial Collapse']
  );
  let lastCost = 0;
  path.upgrades.forEach((upgrade) => {
    assert.ok(upgrade.cost > lastCost);
    lastCost = upgrade.cost;
  });
});

test('each tier\'s splash grows in radius and damage, and the right tiers add slow/reburstChance', () => {
  const game = loadGameContext();
  const [t1, t2, t3, t4] = game.TOWER_TYPES.arcticWillow.upgradePaths[2].upgrades;

  assert.deepEqual(t1.effects.splash, { radius: 40, damage: 2 });
  assert.deepEqual(t2.effects.splash, { radius: 60, damage: 5, slow: { multiplier: 0.85, duration: 1.5 } });
  assert.deepEqual(t3.effects.splash, { radius: 80, damage: 9, reburstChance: 0.25 });
  assert.deepEqual(t4.effects.splash, { radius: 120, damage: 20, slow: { multiplier: 0.85, duration: 1.5 } });

  // Radius and damage both strictly increase every tier.
  const splashes = [t1, t2, t3, t4].map((u) => u.effects.splash);
  for (let i = 1; i < splashes.length; i += 1) {
    assert.ok(splashes[i].radius > splashes[i - 1].radius);
    assert.ok(splashes[i].damage > splashes[i - 1].damage);
  }

  // Tier 2's slow is a real but deliberately minor flavor effect —
  // noticeably weaker/shorter than Frosted Path's own tier-1 slow.
  const frostedTier1Slow = game.TOWER_TYPES.arcticWillow.upgradePaths[0].upgrades[0].effects.slow;
  assert.ok(t2.effects.splash.slow.multiplier > frostedTier1Slow.multiplier); // higher multiplier = less of a slow
  assert.ok(t2.effects.splash.slow.duration < frostedTier1Slow.duration);
});

test('Avalanche Path has its own PATH_THEMES entry (the per-path tier-theming pass this reuses)', () => {
  const game = loadFullGameContext();
  assert.equal(game.PATH_THEMES['Avalanche Path'].motif, 'burst');
  const theme = game.getPathTheme('Avalanche Path');
  assert.equal(theme.motif, 'burst');
  assert.notEqual(theme.base, theme.peak); // actually escalates, not a flat color
  // Tier 1 lands exactly on base, tier 4 exactly on peak (same formula
  // every other path's own theme already uses).
  assert.equal(game.getTierThemeColor(theme, 0), game.mixHexColors(theme.base, theme.peak, 0));
  assert.equal(game.getTierThemeColor(theme, 3), game.mixHexColors(theme.base, theme.peak, 1));
});

test('splash damages enemies near the primary target but never the primary target itself a 2nd time, and respects its own radius', () => {
  const game = loadFullGameContext();
  game.setMoney(1000000);
  const willow = game.createTower('arcticWillow', 300, 300);
  game.getTowers().push(willow);
  for (let i = 0; i < 4; i += 1) game.purchaseUpgrade(willow, 2); // max Avalanche Path

  game.spawnSingleEnemy(game.getSpawnEntryForEnemyKey('ant'));
  game.spawnSingleEnemy(game.getSpawnEntryForEnemyKey('ant'));
  game.spawnSingleEnemy(game.getSpawnEntryForEnemyKey('ant'));
  const enemies = game.getActiveEnemies().slice(-3);
  enemies.forEach((e) => {
    e.spawned = true;
    e.health = 100000;
    e.maxHealth = 100000;
  });
  enemies[0].x = 300;
  enemies[0].y = 300; // the primary target
  enemies[1].x = 300 + willow.splash.radius - 5;
  enemies[1].y = 300; // just inside splash radius
  enemies[2].x = 300 + willow.splash.radius + 50;
  enemies[2].y = 300; // well outside splash radius

  const before = enemies.map((e) => e.health);
  game.spawnProjectile(willow, enemies[0]);
  const projectile = game.getProjectiles()[game.getProjectiles().length - 1];
  projectile.distanceLeft = 0;
  game.resolveProjectile(projectile);

  const after = enemies.map((e) => e.health);
  const primaryDrop = before[0] - after[0];
  const nearbyDrop = before[1] - after[1];
  const farDrop = before[2] - after[2];

  assert.ok(primaryDrop > 0 && primaryDrop < 20, 'expected the primary target to take only the direct hit, not splash on top');
  assert.equal(nearbyDrop, willow.splash.damage, 'expected the nearby enemy to take exactly the splash damage');
  assert.equal(farDrop, 0, 'expected the far-away enemy to take no splash damage at all');
  assert.deepEqual(enemies[1].slow, { multiplier: willow.splash.slow.multiplier, remaining: willow.splash.slow.duration });
});

test('Avalanche tier (reburstChance 0.25) sometimes bursts twice for double splash damage, but never more than twice', () => {
  const game = loadFullGameContext();
  game.setMoney(1000000);
  const willow = game.createTower('arcticWillow', 500, 300);
  game.getTowers().push(willow);
  game.purchaseUpgrade(willow, 2); // Snowball
  game.purchaseUpgrade(willow, 2); // Snowdrift
  game.purchaseUpgrade(willow, 2); // Avalanche — reburstChance 0.25, no slow this tier

  game.spawnSingleEnemy(game.getSpawnEntryForEnemyKey('ant'));
  game.spawnSingleEnemy(game.getSpawnEntryForEnemyKey('ant'));
  const enemies = game.getActiveEnemies().slice(-2);
  enemies.forEach((e) => {
    e.spawned = true;
  });
  enemies[0].x = 500;
  enemies[0].y = 300;
  enemies[1].x = 530;
  enemies[1].y = 300;

  const drops = new Set();
  for (let i = 0; i < 300; i += 1) {
    enemies[1].health = 1000000;
    const before = enemies[1].health;
    game.spawnProjectile(willow, enemies[0]);
    const projectile = game.getProjectiles()[game.getProjectiles().length - 1];
    projectile.distanceLeft = 0;
    game.resolveProjectile(projectile);
    const drop = before - enemies[1].health;
    assert.ok(drop === willow.splash.damage || drop === willow.splash.damage * 2, `unexpected splash drop ${drop}`);
    drops.add(drop);
  }
  // Over 300 rolls at a real 25% chance, both outcomes should show up.
  assert.equal(drops.size, 2);
});

test('each tier sets its own visual flag, and Frosted/Brittle Path\'s own flags stay false on an Avalanche Path tower', () => {
  const game = loadFullGameContext();
  game.setMoney(1000000);
  const willow = game.createTower('arcticWillow', 100, 100);
  game.getTowers().push(willow);

  game.purchaseUpgrade(willow, 2);
  assert.equal(willow.hasSnowballClusters, true);
  game.purchaseUpgrade(willow, 2);
  assert.equal(willow.hasSnowdrift, true);
  game.purchaseUpgrade(willow, 2);
  assert.equal(willow.hasSnowDrape, true);
  game.purchaseUpgrade(willow, 2);
  assert.equal(willow.hasFallingIceShards, true);

  assert.equal(willow.hasIceSpikes, false);
  assert.equal(willow.hasIcicleRing, false);
  assert.equal(willow.hasBrittleStems, false);
  assert.equal(willow.hasIceCubes, false);
  assert.equal(willow.chosenPath, 2);
});

test('renders at every tier without throwing, and drawAvalancheIceShards (the tier-4 idle particle effect) never throws', () => {
  const game = loadFullGameContext();
  game.setMoney(1000000);
  const willow = game.createTower('arcticWillow', 150, 150);
  game.getTowers().push(willow);
  const ctx = new Proxy({}, { get: () => () => {} });

  for (let tier = 0; tier < 4; tier += 1) {
    assert.doesNotThrow(() => game.renderTower(ctx, willow, willow.x, willow.y, 1.2));
    game.purchaseUpgrade(willow, 2);
  }
  assert.doesNotThrow(() => game.renderTower(ctx, willow, willow.x, willow.y, 1.2));
});

test('choosing Avalanche Path locks out Frosted/Brittle Path the same generic way every other tower\'s paths already do', () => {
  const game = loadFullGameContext();
  game.setMoney(1000000);
  const willow = game.createTower('arcticWillow', 200, 200);
  game.getTowers().push(willow);
  game.purchaseUpgrade(willow, 2);

  assert.equal(game.getAvailableUpgrade(willow, 0), null);
  assert.equal(game.getAvailableUpgrade(willow, 1), null);
  assert.notEqual(game.getAvailableUpgrade(willow, 2), null);
});
