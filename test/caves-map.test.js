const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Caves (direct request, relayed from the peer session, built from 3
// reference photos given as a written description): a dark cave interior
// lit by glowing multi-colored crystals, warm amber-brown stalactites/
// stalagmites, and an enemy path that's itself a flowing water channel —
// see CAVES_WAYPOINTS' own comment in map.js for the full design
// rationale, and CAVES_ROSTER's own comment in enemies.js for the roster
// shape/difficulty-tier judgment calls (only 2 boss tiers, Medium not
// Hard). A single-path map, like Deep Forest/Marshland/Whirlpool/
// Volcanic.
//
// A direct follow-up request (relayed the same way) darkened the water
// path (it originally read "too bright/light") and added an animated
// flowing-water overlay (renderCavesPathEffects, map.js, via the new
// optional theme.renderPathEffects hook), plus retuned the cave floor's
// own background color to coordinate with the amber-brown formations
// instead of clashing against them — see CAVES_PATH_COLORS' own comment
// in map.js for the full writeup.

test('caves is registered in MAP_TYPES with the expected shape — a single path', () => {
  const game = loadGameContext();
  const map = game.MAP_TYPES.caves;
  assert.equal(map.id, 'caves');
  assert.equal(map.name, 'Caves');
  assert.equal(map.builtin, true);
  assert.equal(map.terrain, 'caves');
  assert.equal(map.pathWidth, 56);
  assert.equal(map.paths.length, 1);
});

test('caves shows up in listAllMaps alongside every other built-in map', () => {
  const game = loadFullGameContext();
  const ids = game.listAllMaps().map((map) => map.id);
  assert.ok(ids.includes('caves'));
  assert.equal(ids.length, 7); // deepForest/marshland/savanah/whirlpool/tundra/volcanic/caves
});

test('Caves is explicitly Medium-tier, matching Marshland/Savanah\'s own 1.3x map multiplier — not Hard like Whirlpool/Tundra/Volcanic', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const cavesMultiplier = game.getRoundScaling(10).healthMultiplier;
  game.setActiveMap(game.MAP_TYPES.marshland);
  const marshMultiplier = game.getRoundScaling(10).healthMultiplier;
  assert.equal(cavesMultiplier, marshMultiplier);

  game.setActiveMap(game.MAP_TYPES.deepForest);
  const forestMultiplier = game.getRoundScaling(10).healthMultiplier;
  assert.ok(Math.abs(cavesMultiplier / forestMultiplier - 1.3) < 1e-9);

  game.setActiveMap(game.MAP_TYPES.volcanic);
  const volcanicMultiplier = game.getRoundScaling(10).healthMultiplier;
  assert.notEqual(cavesMultiplier, volcanicMultiplier);
});

test('Caves\' path starts off-canvas and ends on-canvas at its own crystal pool goal', () => {
  const game = loadGameContext();
  const [path] = game.MAP_TYPES.caves.paths;

  const start = path[0];
  assert.ok(start.x < 0 || start.x > 960 || start.y < 0 || start.y > 640);

  const end = path[path.length - 1];
  assert.ok(end.x >= 0 && end.x <= 960 && end.y >= 0 && end.y <= 640);

  const { goal } = game.MAP_TYPES.caves.decor;
  assert.deepEqual(end, { x: goal.x, y: goal.y });
});

test('Caves\' decor (glowing crystals, mineral formations, the crystal-pool goal) is present with sane, on-canvas coordinates', () => {
  const game = loadGameContext();
  const { decor } = game.MAP_TYPES.caves;

  ['crystals', 'formations'].forEach((key) => {
    assert.ok(Array.isArray(decor[key]) && decor[key].length > 0, `expected decor.${key} to be a non-empty array`);
    decor[key].forEach((item) => {
      assert.ok(item.x >= 0 && item.x <= 960);
      assert.ok(item.y >= 0 && item.y <= 640);
    });
  });
  // Varied neon colors, per the request's own description — not every
  // crystal the same color.
  const crystalColors = new Set(decor.crystals.map((c) => c.color));
  assert.ok(crystalColors.size > 1);

  assert.ok(decor.goal.x >= 0 && decor.goal.x <= 960);
  assert.ok(decor.goal.y >= 0 && decor.goal.y <= 640);
  assert.ok(decor.goal.size > 0);
});

test('Caves has no magma-pool-style placement hazard — isPointInMagmaPool is always false here', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  assert.equal(game.isPointInMagmaPool(0, 0), false);
  assert.equal(game.isPointInMagmaPool(480, 320), false);
});

test('Caves\' roster is 1 boss (round 25) + a 7-entry tier2 + a 2nd, final boss (round 50) — not the usual 3-boss shape', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const roster = game.getActiveRoster();

  assert.deepEqual(roster.order, ['bat', 'moth', 'fungusGnat']);
  assert.equal(roster.bossTypes[1].name, 'Cave Midge');
  assert.deepEqual(roster.orderTier2, [
    'oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm', 'texasBlindSalamander', 'caveShrimp',
  ]);
  assert.equal(roster.bossTypes[2].name, 'Blind Cavefish');
  assert.deepEqual(roster.orderTier3, []);
  assert.equal(roster.bossTypes[3], undefined);
});

test('Blind Cavefish is the toughest thing on Caves — the request\'s own explicit requirement', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const roster = game.getActiveRoster();

  assert.ok(roster.bossTypes[2].health > roster.bossTypes[1].health);
  Object.values(roster.enemyTypes).forEach((type) => {
    assert.ok(roster.bossTypes[2].health > type.health);
  });

  // Calibrated at Medium tier, alongside Marshland/Savanah's own boss2 —
  // not anywhere near Whirlpool's Hard-tier final boss.
  assert.ok(roster.bossTypes[2].health < game.MAP_ROSTERS.ocean.bossTypes[3].health);
});

test('tier2\'s own 7 entries escalate weakest to strongest, as given in the request\'s own ordered list', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const { enemyTypes } = game.getActiveRoster();
  const tier2Keys = ['oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm', 'texasBlindSalamander', 'caveShrimp'];

  for (let i = 1; i < tier2Keys.length; i += 1) {
    assert.ok(
      enemyTypes[tier2Keys[i]].health > enemyTypes[tier2Keys[i - 1]].health,
      `expected ${tier2Keys[i]} to be tougher than ${tier2Keys[i - 1]}`
    );
  }
});

test('generateWave spawns Caves\' 2 designed bosses on rounds 25/50, and falls back to Blind Cavefish again at round 75', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);

  const wave25 = game.generateWave(25);
  assert.equal(wave25[0].enemyKey, 'caves-boss-tier-1');
  assert.equal(wave25[0].name, 'Cave Midge');
  assert.equal(wave25[0].isBoss, true);

  const wave50 = game.generateWave(50);
  assert.equal(wave50[0].enemyKey, 'caves-boss-tier-2');
  assert.equal(wave50[0].name, 'Blind Cavefish');

  // No tier 3 designed — same "reuse the highest designed tier" fallback
  // FOREST_ROSTER's own 2-boss shape already relies on.
  const wave75 = game.generateWave(75);
  assert.equal(wave75[0].enemyKey, 'caves-boss-tier-2');
  assert.equal(wave75[0].name, 'Blind Cavefish');
});

test('tier2 unlocks progressively from round 26, one new type every 5 rounds, same cadence every other map uses', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);

  assert.deepEqual(game.getUnlockedEnemyTypes(25), ['bat', 'moth', 'fungusGnat']);
  assert.deepEqual(game.getUnlockedEnemyTypes(26), ['bat', 'moth', 'fungusGnat', 'oilbird']);
  assert.deepEqual(
    game.getUnlockedEnemyTypes(46),
    ['bat', 'moth', 'fungusGnat', 'oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm']
  );
  // All 7 tier2 entries are unlocked by round 56 (26 + 5*6), continuing to
  // unlock well past round 50's own boss — same as every other map's own
  // tier2/tier3 types keep unlocking after their roster's bosses.
  assert.deepEqual(
    game.getUnlockedEnemyTypes(56),
    [
      'bat', 'moth', 'fungusGnat',
      'oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm', 'texasBlindSalamander', 'caveShrimp',
    ]
  );
});

test('getAllSpawnableEnemyKeys lists Caves\' full 10-enemy roster and both boss tiers, with no shared armored beetles (Caves has no native beetle-family enemy)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const keys = game.getAllSpawnableEnemyKeys();

  assert.deepEqual(keys, [
    'bat', 'moth', 'fungusGnat',
    'oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm', 'texasBlindSalamander', 'caveShrimp',
    'caves-boss-tier-1', 'caves-boss-tier-2',
  ]);
});

test('a spawned Caves enemy never throws, for every regular type and every boss', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const keys = [
    'bat', 'moth', 'fungusGnat',
    'oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm', 'texasBlindSalamander', 'caveShrimp',
    'caves-boss-tier-1', 'caves-boss-tier-2',
  ];
  keys.forEach((key) => {
    const entry = game.getSpawnEntryForEnemyKey(key);
    assert.ok(entry, `expected a spawn entry for ${key}`);
    assert.doesNotThrow(() => game.spawnSingleEnemy(entry), `spawning ${key} threw`);
  });
  assert.equal(game.getActiveEnemies().length, keys.length);
});

test('Blind Cavefish\'s spawn entry carries no special traits (just a plain, tough, slow boss) and every regular enemy has no armor threshold', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const { enemyTypes, bossTypes } = game.getActiveRoster();
  Object.values(enemyTypes).forEach((type) => assert.equal(type.armorThreshold || 0, 0));
  Object.values(bossTypes).forEach((type) => assert.equal(type.armorThreshold || 0, 0));
});

// --- Follow-up: darker flowing water + a coordinated cave-rock floor ------

test('Caves\' water path is a dark, moody teal now — not the original bright glowing cyan', () => {
  const game = loadGameContext();
  const { pathColors } = game.MAP_TYPES.caves;
  assert.equal(pathColors.fill, '#1b5560');
  assert.equal(pathColors.outline, '#070f10');
});

test('Caves\' background no longer clashes against its own warm amber-brown stalactite/stalagmite formations', () => {
  const game = loadGameContext();
  const theme = game.TERRAIN_THEMES.caves;
  // The original cool blue-black background this follow-up replaced.
  assert.notEqual(theme.background, '#070709');
  // Still near-black (the request's own original ask), just warm-toned —
  // every channel low, but red/green (the warm end) no lower than blue.
  const r = parseInt(theme.background.slice(1, 3), 16);
  const g = parseInt(theme.background.slice(3, 5), 16);
  const b = parseInt(theme.background.slice(5, 7), 16);
  assert.ok(r <= 40 && g <= 40 && b <= 40, `expected a near-black background, got ${theme.background}`);
  assert.ok(r >= b, 'expected a warm (not cool/blue-tinted) near-black background');
});

test('Caves has its own animated path-flow effect; every other map is untouched by it', () => {
  const game = loadGameContext();
  assert.equal(typeof game.TERRAIN_THEMES.caves.renderPathEffects, 'function');
  ['forest', 'marsh', 'desert', 'ocean', 'tundra', 'volcano'].forEach((terrain) => {
    assert.equal(game.TERRAIN_THEMES[terrain].renderPathEffects, undefined);
  });
});

test('rendering the Caves map (including its animated path-flow overlay) never throws, at several different animation times', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const canvas = game.getCanvas();
  const ctx = canvas.getContext('2d');
  [0, 1.3, 5, 12.75].forEach((time) => {
    assert.doesNotThrow(() => game.renderMap(ctx, canvas, time), `renderMap threw at time=${time}`);
  });
});
