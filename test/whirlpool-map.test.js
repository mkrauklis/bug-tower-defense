const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Whirlpool (direct request): a new ocean-themed map whose single path
// spirals inward to a central vortex (the goal) instead of any straight-
// segment route, plus the game's first roster with a real THIRD boss
// tier (Reef Shark/round25, Hammerhead/round50, Great White/round75) —
// getBossForRound()'s existing fallback-to-highest-designed-tier logic
// already supported an arbitrary number of tiers generically, so adding
// this one is pure data, no engine changes.

test('whirlpool is registered in MAP_TYPES with the expected shape', () => {
  const game = loadGameContext();
  const map = game.MAP_TYPES.whirlpool;
  assert.equal(map.id, 'whirlpool');
  assert.equal(map.name, 'Whirlpool');
  assert.equal(map.builtin, true);
  assert.equal(map.terrain, 'ocean');
  assert.equal(map.pathWidth, 56);
  assert.equal(map.paths.length, 1); // a single spiral path, not multi-path like Savanah
});

test('the spiral starts off-canvas and curls inward to the center, with no gap wide enough to look broken', () => {
  const game = loadGameContext();
  const waypoints = game.MAP_TYPES.whirlpool.paths[0];

  assert.ok(waypoints.length > 40); // a real smooth spiral, not a handful of straight segments
  assert.ok(waypoints[0].x > 960); // off-canvas spawn, same convention as every other map

  const last = waypoints[waypoints.length - 1];
  assert.ok(Math.hypot(last.x - 480, last.y - 320) < 25); // ends essentially at the center (480, 320)

  // Within the spiral itself (skipping the one long off-canvas lead-in
  // segment at the very start, same single long straight first segment
  // every other map's own waypoints[0]->[1] already is — e.g. Deep
  // Forest's own first segment is 240px), no consecutive pair is far
  // enough apart to read as a visibly faceted polygon rather than a
  // smooth curl once stroked at the path's own width with round line
  // joins (a generous sanity bound, not a pixel-perfect smoothness
  // guarantee — the real call on "does it look smooth" is made live in
  // the browser, see the commit's own notes).
  for (let i = 2; i < waypoints.length; i += 1) {
    const dist = Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].y - waypoints[i - 1].y);
    assert.ok(dist < 80, `waypoint ${i} is ${dist.toFixed(1)}px from the last — too far for a smooth curl`);
  }
});

test('the spiral never crosses or overlaps itself — successive loops stay further apart than the path is wide', () => {
  const game = loadGameContext();
  const waypoints = game.MAP_TYPES.whirlpool.paths[0];
  const pathWidth = game.MAP_TYPES.whirlpool.pathWidth;

  // Comparing a waypoint to the one exactly one full turn later (same
  // angle, smaller radius — generateSpiralWaypoints' own pointsPerTurn,
  // 36, is exactly that gap) is the direct way to measure ring-to-ring
  // spacing: if that distance ever dropped below the path's own width,
  // the spiral's loops would visually overlap.
  const sampleGap = 36;
  for (let i = 0; i + sampleGap < waypoints.length; i += 1) {
    const a = waypoints[i];
    const b = waypoints[i + sampleGap];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    // Skip the pairs very close to the center, where loops are expected
    // to naturally converge right at the goal.
    const nearCenter = Math.hypot(a.x - 480, a.y - 320) < 40 || Math.hypot(b.x - 480, b.y - 320) < 40;
    if (!nearCenter) assert.ok(dist > pathWidth * 0.8, `waypoints ${i}/${i + sampleGap} are only ${dist.toFixed(1)}px apart`);
  }
});

test('setActiveMap(whirlpool) switches the live path bindings to the spiral', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  assert.equal(game.getMapPaths().length, 1);
  assert.equal(game.MAP_PATH_WAYPOINTS, game.getMapPaths()[0]);
  assert.equal(game.MAP_PATH_WIDTH, 56);
});

test('isPointOnPath works generically against the spiral — on a waypoint counts, far away does not', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const waypoints = game.getMapPaths()[0];
  const mid = waypoints[Math.floor(waypoints.length / 2)];

  assert.equal(game.isPointOnPath(mid.x, mid.y), true);
  assert.equal(game.isPointOnPath(-10000, -10000), false);
});

test('getActiveRoster switches to the Ocean roster once Whirlpool is active', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const roster = game.getActiveRoster();
  assert.equal(roster.order.length, 3);
  assert.equal(roster.orderTier2.length, 3);
  assert.equal(roster.orderTier3.length, 3);
  assert.equal(Object.keys(roster.bossTypes).length, 3); // the game's first 3-boss-tier roster
});

test('the 12-enemy roster is in the exact order given, weakest to strongest, bosses at positions 4/8/12', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const roster = game.getActiveRoster();

  assert.deepEqual(roster.order, ['seaCucumber', 'urchin', 'clownFish']);
  assert.equal(roster.bossTypes[1].name, 'Reef Shark');
  assert.deepEqual(roster.orderTier2, ['starfish', 'seahorse', 'horseshoeCrab']);
  assert.equal(roster.bossTypes[2].name, 'Hammerhead Shark');
  assert.deepEqual(roster.orderTier3, ['stingray', 'tuna', 'marlin']);
  assert.equal(roster.bossTypes[3].name, 'Great White');
});

test('health/speed progress sensibly across all 12 (weakest to strongest within each tier, tiers escalating)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const { enemyTypes, bossTypes } = game.getActiveRoster();

  // Within tier 1.
  assert.ok(enemyTypes.urchin.health > enemyTypes.seaCucumber.health);
  // Tier 2 starts clearly above tier 1.
  assert.ok(enemyTypes.starfish.health > enemyTypes.clownFish.health * 3);
  // Within tier 2.
  assert.ok(enemyTypes.horseshoeCrab.health > enemyTypes.seahorse.health);
  assert.ok(enemyTypes.seahorse.health > enemyTypes.starfish.health);
  // Tier 3 starts clearly above tier 2.
  assert.ok(enemyTypes.stingray.health > enemyTypes.horseshoeCrab.health);
  // Within tier 3.
  assert.ok(enemyTypes.tuna.health > enemyTypes.stingray.health);
  assert.ok(enemyTypes.marlin.health > enemyTypes.tuna.health);
  // Bosses escalate too.
  assert.ok(bossTypes[2].health > bossTypes[1].health);
  assert.ok(bossTypes[3].health > bossTypes[2].health);
});

test('Great White is the clear, noticeably-tougher final boss — not just an incremental step up', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const { bossTypes, enemyTypes } = game.getActiveRoster();

  // Meaningfully more than double Hammerhead's own health, not just a
  // modest bump the way Hammerhead-over-Reef-Shark is.
  assert.ok(bossTypes[3].health > bossTypes[2].health * 2);
  // The strongest thing in the ENTIRE roster, including every regular type.
  Object.values(enemyTypes).forEach((type) => assert.ok(bossTypes[3].health > type.health));
  assert.ok(bossTypes[3].health > bossTypes[1].health);
  assert.ok(bossTypes[3].health > bossTypes[2].health);
  // Stronger than the shared armored beetles' own toughest tier too —
  // genuinely the toughest thing this map (or any other) can throw.
  const titan = game.getArmoredBeetleTier('titanBeetle');
  assert.ok(bossTypes[3].health > titan.health);
});

test('getUnlockedEnemyTypes follows the same every-5-rounds cadence as every other map', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);

  assert.deepEqual(game.getUnlockedEnemyTypes(1), ['seaCucumber']);
  assert.deepEqual(game.getUnlockedEnemyTypes(11), ['seaCucumber', 'urchin', 'clownFish']);
  assert.deepEqual(game.getUnlockedEnemyTypes(24), ['seaCucumber', 'urchin', 'clownFish']); // tier 2 not started
  assert.deepEqual(game.getUnlockedEnemyTypes(26), ['seaCucumber', 'urchin', 'clownFish', 'starfish']);
  assert.deepEqual(
    game.getUnlockedEnemyTypes(36),
    ['seaCucumber', 'urchin', 'clownFish', 'starfish', 'seahorse', 'horseshoeCrab']
  );
  assert.deepEqual(
    game.getUnlockedEnemyTypes(51),
    ['seaCucumber', 'urchin', 'clownFish', 'starfish', 'seahorse', 'horseshoeCrab', 'stingray']
  );
  assert.deepEqual(
    game.getUnlockedEnemyTypes(61),
    ['seaCucumber', 'urchin', 'clownFish', 'starfish', 'seahorse', 'horseshoeCrab', 'stingray', 'tuna', 'marlin']
  );
});

test('round 25/50/75 each spawn their own designed boss — the first map with a real round-75 (tier-3) boss', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);

  assert.equal(game.isBossRound(75), true);
  const boss25 = game.getBossForRound(25);
  const boss50 = game.getBossForRound(50);
  const boss75 = game.getBossForRound(75);
  assert.equal(boss25.name, 'Reef Shark');
  assert.equal(boss50.name, 'Hammerhead Shark');
  assert.equal(boss75.name, 'Great White');
  assert.equal(boss75.tier, 3);
});

test('round 100 (past every designed tier) falls back to Great White, not a verbatim repeat of an earlier boss', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const boss100 = game.getBossForRound(100);
  assert.equal(boss100.name, 'Great White'); // falls back to the strongest designed tier (3), same generic logic every other map's own fallback already uses
});

test('generateWave on Whirlpool spawns the boss keyed/prefixed with the ocean terrain', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const wave = game.generateWave(75);
  assert.equal(wave[0].isBoss, true);
  assert.equal(wave[0].enemyKey, 'ocean-boss-tier-3');
  assert.equal(wave[0].name, 'Great White');
});

test('getAllSpawnableEnemyKeys lists Whirlpool\'s full roster plus the shared armored beetles and all 3 boss tiers', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const keys = game.getAllSpawnableEnemyKeys();
  assert.deepEqual(keys, [
    'seaCucumber', 'urchin', 'clownFish',
    'starfish', 'seahorse', 'horseshoeCrab',
    'stingray', 'tuna', 'marlin',
    'carapaceBeetle', 'ironshellBeetle', 'titanBeetle',
    'ocean-boss-tier-1', 'ocean-boss-tier-2', 'ocean-boss-tier-3',
  ]);
});

test('getSpawnEntryForEnemyKey resolves every Whirlpool key, including all 3 boss tiers', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  assert.equal(game.getSpawnEntryForEnemyKey('seaCucumber').name, 'Sea Cucumber');
  assert.equal(game.getSpawnEntryForEnemyKey('ocean-boss-tier-1').name, 'Reef Shark');
  assert.equal(game.getSpawnEntryForEnemyKey('ocean-boss-tier-2').name, 'Hammerhead Shark');
  assert.equal(game.getSpawnEntryForEnemyKey('ocean-boss-tier-3').name, 'Great White');
  // Deep Forest's own boss keys aren't resolvable while Whirlpool is active.
  assert.equal(game.getSpawnEntryForEnemyKey('forest-boss-tier-1'), null);
});

test('none of the 12 enemies have an armor threshold — the request never asked for one on this roster', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const { enemyTypes, bossTypes } = game.getActiveRoster();
  Object.values(enemyTypes).forEach((type) => assert.equal(type.armorThreshold || 0, 0));
  Object.values(bossTypes).forEach((type) => assert.equal(type.armorThreshold || 0, 0));
});

test('Whirlpool now shows up on the map-select screen alongside the other 3 built-ins', () => {
  const game = loadFullGameContext();
  const maps = game.listAllMaps();
  assert.equal(maps.length, 4);
  assert.ok(maps.some((map) => map.id === 'whirlpool'));
});

// --- Easter eggs (direct follow-up request) ------------------------------
// Purely decorative, never load-bearing — these tests only confirm they
// exist with sane coordinates and stay safely clear of the spiral itself
// (the same bounding-box safety margin every other piece of Whirlpool's
// decor already relies on — see WHIRLPOOL_CORAL's own comment), not
// anything about how they look.

test('all 4 Easter eggs are present with sane, on-canvas coordinates', () => {
  const game = loadGameContext();
  const { decor } = game.MAP_TYPES.whirlpool;
  ['shipwreck', 'treasureChest', 'messageBottle', 'snorkelAnt'].forEach((key) => {
    const item = decor[key];
    assert.ok(item, `expected decor.${key} to exist`);
    assert.ok(item.x >= 0 && item.x <= 960);
    assert.ok(item.y >= 0 && item.y <= 640);
    assert.ok(item.size > 0);
  });
});

test('every Easter egg sits outside the spiral\'s own bounding ellipse (x:[120,840], y:[90,550]), clear of the path', () => {
  const game = loadGameContext();
  const { decor } = game.MAP_TYPES.whirlpool;
  ['shipwreck', 'treasureChest', 'messageBottle', 'snorkelAnt'].forEach((key) => {
    const item = decor[key];
    const outsideBoundingBox = item.x < 120 || item.x > 840 || item.y < 90 || item.y > 550;
    assert.ok(outsideBoundingBox, `decor.${key} at (${item.x}, ${item.y}) is inside the spiral's own extent`);
  });
});
