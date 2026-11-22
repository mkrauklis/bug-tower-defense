const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Volcanic (direct request): a Hard-tier map with an obsidian floor and a
// single magma path, plus magma pools that block tower placement — see
// VOLCANIC_WAYPOINTS' own comment in map.js for the full design
// rationale, and VOLCANIC_ROSTER's own comment in enemies.js for why it's
// calibrated at Tundra's post-nerf baseline rather than Whirlpool's own
// (longer-path) numbers. Unlike Tundra/Savanah, this is a single-path map
// (like Deep Forest/Marshland).
//
// Originally shipped with only 2 regular tiers + 2 boss tiers designed (8
// named creatures total, not the usual 3-tiers-of-3-plus-3-bosses shape)
// — getUnlockedEnemyTypes()/getBossForRound()'s own existing tolerance
// for a roster with fewer than 3 boss tiers (already exercised by
// FOREST_ROSTER) covered that. A later direct request ("add new enemies
// to volcano") filled in the previously-empty tier3 (Velvet Ant/Volcanic
// Longhorn Beetle/Fire-Loving Beetle) and a real 3rd boss (Namib Desert
// Beetle, round 75) — see VOLCANIC_ROSTER's own comment for the full
// follow-up writeup. Volcanic is now the usual 3-tiers-plus-3-bosses
// shape, same as Whirlpool/Tundra.

test('volcanic is registered in MAP_TYPES with the expected shape — a single path, unlike Savanah/Tundra', () => {
  const game = loadGameContext();
  const map = game.MAP_TYPES.volcanic;
  assert.equal(map.id, 'volcanic');
  assert.equal(map.name, 'Volcanic');
  assert.equal(map.builtin, true);
  assert.equal(map.terrain, 'volcano');
  assert.equal(map.pathWidth, 56);
  assert.equal(map.paths.length, 1);
});

test('Volcanic is explicitly Hard-tier, matching Whirlpool/Tundra\'s own 1.8x map multiplier', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const volcanicMultiplier = game.getRoundScaling(10).healthMultiplier;
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const whirlpoolMultiplier = game.getRoundScaling(10).healthMultiplier;
  assert.equal(volcanicMultiplier, whirlpoolMultiplier);

  game.setActiveMap(game.MAP_TYPES.deepForest);
  const forestMultiplier = game.getRoundScaling(10).healthMultiplier;
  assert.ok(Math.abs(volcanicMultiplier / forestMultiplier - 1.8) < 1e-9);
});

test('Volcanic\'s path starts off-canvas and ends on-canvas at its own lava vent goal', () => {
  const game = loadGameContext();
  const [path] = game.MAP_TYPES.volcanic.paths;

  const start = path[0];
  assert.ok(start.x < 0 || start.x > 960 || start.y < 0 || start.y > 640);

  const end = path[path.length - 1];
  assert.ok(end.x >= 0 && end.x <= 960 && end.y >= 0 && end.y <= 640);

  const { goal } = game.MAP_TYPES.volcanic.decor;
  assert.deepEqual(end, { x: goal.x, y: goal.y });
});

test('Volcanic\'s magma pools sit clear of the path itself — a separate hazard, not just a path decal', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const { magmaPools } = game.MAP_TYPES.volcanic.decor;

  assert.ok(magmaPools.length > 0);
  magmaPools.forEach((pool) => {
    assert.equal(game.isPointOnPath(pool.x, pool.y), false, `magma pool at (${pool.x},${pool.y}) overlaps the path`);
  });
});

test('isPointInMagmaPool is true at a pool\'s own center and false well outside every pool', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const [firstPool] = game.MAP_TYPES.volcanic.decor.magmaPools;

  assert.equal(game.isPointInMagmaPool(firstPool.x, firstPool.y), true);
  assert.equal(game.isPointInMagmaPool(firstPool.x + firstPool.r + 50, firstPool.y), false);
});

test('isPointInMagmaPool is always false on every map before Volcanic (no decor.magmaPools field at all)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  assert.equal(game.isPointInMagmaPool(0, 0), false);
  assert.equal(game.isPointInMagmaPool(480, 320), false);
});

test('a tower cannot be placed inside a magma pool, even with plenty of money', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  game.setMoney(9999);
  game.setSelectedShopItem({ typeKey: 'sunflower', name: 'Sunflower', cost: 25 });

  const [pool] = game.MAP_TYPES.volcanic.decor.magmaPools;
  game.handleCanvasTap(pool.x, pool.y);

  assert.equal(game.getTowers().length, 0);
});

test('a tower CAN be placed on open obsidian ground clear of both the path and every magma pool', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  game.setMoney(9999);
  game.setSelectedShopItem({ typeKey: 'sunflower', name: 'Sunflower', cost: 25 });

  const [pool] = game.MAP_TYPES.volcanic.decor.magmaPools; // (340, 350, r:42)
  // Straight below the pool rather than to either side — pool 1 sits
  // roughly equidistant (140px) from the path's two nearest vertical
  // legs (x:200/480) in the x direction, so stepping sideways by the
  // pool's own radius eats into that margin; stepping down toward the
  // path's nearest horizontal leg (y:560, ~210px away) leaves plenty of
  // room on every axis instead.
  const x = pool.x;
  const y = pool.y + pool.r + 60;
  assert.equal(game.isPointOnPath(x, y, 20), false);
  assert.equal(game.isPointInMagmaPool(x, y), false);

  game.handleCanvasTap(x, y);

  assert.equal(game.getTowers().length, 1);
});

test('Volcanic\'s roster lists 3 regular tiers plus 3 boss tiers, same shape as Whirlpool/Tundra', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const roster = game.getActiveRoster();

  assert.deepEqual(roster.order, ['lavaCricket', 'volcanicAshBeetle', 'wekiuBug']);
  assert.equal(roster.bossTypes[1].name, 'Haleakalā Mecyclothorax Beetle');
  assert.deepEqual(roster.orderTier2, ['landIguana', 'pinkIguana', 'lavaIguana']);
  assert.equal(roster.bossTypes[2].name, 'Marine Iguana');
  assert.deepEqual(roster.orderTier3, ['velvetAnt', 'volcanicLonghornBeetle', 'fireLovingBeetle']);
  assert.equal(roster.bossTypes[3].name, 'Namib Desert Beetle');
});

test('Namib Desert Beetle is the toughest thing on Volcanic — tougher than both other bosses and every regular enemy', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const roster = game.getActiveRoster();

  assert.ok(roster.bossTypes[2].health > roster.bossTypes[1].health);
  assert.ok(roster.bossTypes[3].health > roster.bossTypes[2].health);
  Object.values(roster.enemyTypes).forEach((type) => {
    assert.ok(roster.bossTypes[3].health > type.health);
  });

  // Calibrated at Tundra's own post-nerf (below-Whirlpool) baseline, not
  // Whirlpool's own numbers — see VOLCANIC_ROSTER's own comment for why.
  assert.ok(roster.bossTypes[3].health < game.MAP_ROSTERS.ocean.bossTypes[3].health);
});

test('tier3 (Velvet Ant/Volcanic Longhorn Beetle/Fire-Loving Beetle) escalates past tier2\'s own ceiling (Lava Iguana)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const { enemyTypes } = game.getActiveRoster();

  const tier2Max = Math.max(enemyTypes.landIguana.health, enemyTypes.pinkIguana.health, enemyTypes.lavaIguana.health);
  assert.ok(enemyTypes.velvetAnt.health > tier2Max);
  assert.ok(enemyTypes.volcanicLonghornBeetle.health > enemyTypes.velvetAnt.health);
  assert.ok(enemyTypes.fireLovingBeetle.health > enemyTypes.volcanicLonghornBeetle.health);
});

test('generateWave spawns Volcanic\'s 3 designed bosses on rounds 25/50/75, and falls back to Namib Desert Beetle again at round 100', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);

  const wave25 = game.generateWave(25);
  assert.equal(wave25[0].enemyKey, 'volcano-boss-tier-1');
  assert.equal(wave25[0].name, 'Haleakalā Mecyclothorax Beetle');
  assert.equal(wave25[0].isBoss, true);

  const wave50 = game.generateWave(50);
  assert.equal(wave50[0].enemyKey, 'volcano-boss-tier-2');
  assert.equal(wave50[0].name, 'Marine Iguana');

  const wave75 = game.generateWave(75);
  assert.equal(wave75[0].enemyKey, 'volcano-boss-tier-3');
  assert.equal(wave75[0].name, 'Namib Desert Beetle');

  // No tier 4 designed — falls back to the highest designed tier (Namib
  // Desert Beetle again), same "reuse the highest designed tier" fallback
  // every other 3-boss map's own round-100+ rematches already rely on.
  const wave100 = game.generateWave(100);
  assert.equal(wave100[0].enemyKey, 'volcano-boss-tier-3');
  assert.equal(wave100[0].name, 'Namib Desert Beetle');
});

test('getAllSpawnableEnemyKeys lists Volcanic\'s full 9-enemy roster plus the shared armored beetles and all 3 boss tiers', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const keys = game.getAllSpawnableEnemyKeys();

  [
    'lavaCricket', 'volcanicAshBeetle', 'wekiuBug',
    'landIguana', 'pinkIguana', 'lavaIguana',
    'velvetAnt', 'volcanicLonghornBeetle', 'fireLovingBeetle',
    'carapaceBeetle', 'ironshellBeetle', 'titanBeetle',
    'volcano-boss-tier-1', 'volcano-boss-tier-2', 'volcano-boss-tier-3',
  ].forEach((key) => assert.ok(keys.includes(key), `expected ${key} to be spawnable`));
});

test('Volcanic\'s decor (obsidian rocks, ash vents, magma pools, the lava-vent goal) is present with sane, on-canvas coordinates', () => {
  const game = loadGameContext();
  const { decor } = game.MAP_TYPES.volcanic;
  ['obsidianRocks', 'ashVents', 'magmaPools'].forEach((key) => {
    assert.ok(Array.isArray(decor[key]) && decor[key].length > 0, `expected decor.${key} to be a non-empty array`);
    decor[key].forEach((item) => {
      assert.ok(item.x >= 0 && item.x <= 960);
      assert.ok(item.y >= 0 && item.y <= 640);
    });
  });
  assert.ok(decor.goal.x >= 0 && decor.goal.x <= 960);
  assert.ok(decor.goal.y >= 0 && decor.goal.y <= 640);
  assert.ok(decor.goal.size > 0);
});

test('a spawned Volcanic enemy renders without throwing (smoke check via drawEnemyShape dispatch) for every regular type and every boss', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const keys = [
    'lavaCricket', 'volcanicAshBeetle', 'wekiuBug',
    'landIguana', 'pinkIguana', 'lavaIguana',
    'velvetAnt', 'volcanicLonghornBeetle', 'fireLovingBeetle',
    'volcano-boss-tier-1', 'volcano-boss-tier-2', 'volcano-boss-tier-3',
  ];
  keys.forEach((key) => {
    const entry = game.getSpawnEntryForEnemyKey(key);
    assert.ok(entry, `expected a spawn entry for ${key}`);
    game.spawnSingleEnemy(entry);
  });
  assert.equal(game.getActiveEnemies().length, keys.length);
});
