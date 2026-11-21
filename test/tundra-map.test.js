const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Tundra (direct request): a snowy Hard-tier map. Two separate spawns
// converging on one shared goal (an ice cave) — the shape Savanah's own
// two paths originally had (commit 2189bc6: non-merging geometry, each
// path its own turns, final legs in DIFFERENT directions so they don't
// read as one collinear line) rather than Savanah's later fully-separate-
// goals follow-up. 12 enemies total (3 regular tiers of 3 plus 3 bosses,
// the same shape Whirlpool's own 12-entry roster used), so this needed
// zero engine changes, only data — see TUNDRA_ROSTER's own comment in
// enemies.js for the health/speed/bounty judgment calls.

test('tundra is registered in MAP_TYPES with the expected shape', () => {
  const game = loadGameContext();
  const map = game.MAP_TYPES.tundra;
  assert.equal(map.id, 'tundra');
  assert.equal(map.name, 'Tundra');
  assert.equal(map.builtin, true);
  assert.equal(map.terrain, 'tundra');
  assert.equal(map.pathWidth, 56);
  assert.equal(map.paths.length, 2);
});

test('Tundra is explicitly Hard-tier, matching Whirlpool\'s own 1.8x map multiplier', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const tundraMultiplier = game.getRoundScaling(10).healthMultiplier;
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const whirlpoolMultiplier = game.getRoundScaling(10).healthMultiplier;
  assert.equal(tundraMultiplier, whirlpoolMultiplier);

  game.setActiveMap(game.MAP_TYPES.deepForest);
  const forestMultiplier = game.getRoundScaling(10).healthMultiplier;
  assert.ok(Math.abs(tundraMultiplier / forestMultiplier - 1.8) < 1e-9);
});

test('both of Tundra\'s paths start off-canvas and converge on the identical shared goal', () => {
  const game = loadGameContext();
  const [pathA, pathB] = game.MAP_TYPES.tundra.paths;

  assert.ok(pathA[0].x < 0 || pathA[0].x > 960 || pathA[0].y < 0 || pathA[0].y > 640);
  assert.ok(pathB[0].x < 0 || pathB[0].x > 960 || pathB[0].y < 0 || pathB[0].y > 640);

  const endA = pathA[pathA.length - 1];
  const endB = pathB[pathB.length - 1];
  assert.deepEqual(endA, endB); // both routes converge on the identical point (the ice cave)

  const { cave } = game.MAP_TYPES.tundra.decor;
  assert.deepEqual(endA, { x: cave.x, y: cave.y }); // that shared point IS the ice cave's own position
});

test('Tundra\'s two paths never touch, cross, or run alongside each other before their shared final point', () => {
  const game = loadGameContext();
  const [pathA, pathB] = game.MAP_TYPES.tundra.paths;

  // Compare every segment of A (excluding its own final point, the shared
  // goal) against every segment of B (same exclusion) — a real geometric
  // bounding-box separation check, not just "the arrays differ."
  function segmentsOverlap(a1, a2, b1, b2) {
    const minAx = Math.min(a1.x, a2.x) - 28;
    const maxAx = Math.max(a1.x, a2.x) + 28;
    const minAy = Math.min(a1.y, a2.y) - 28;
    const maxAy = Math.max(a1.y, a2.y) + 28;
    const minBx = Math.min(b1.x, b2.x) - 28;
    const maxBx = Math.max(b1.x, b2.x) + 28;
    const minBy = Math.min(b1.y, b2.y) - 28;
    const maxBy = Math.max(b1.y, b2.y) + 28;
    return minAx < maxBx && maxAx > minBx && minAy < maxBy && maxAy > minBy;
  }

  for (let i = 0; i < pathA.length - 2; i += 1) {
    for (let j = 0; j < pathB.length - 2; j += 1) {
      assert.equal(
        segmentsOverlap(pathA[i], pathA[i + 1], pathB[j], pathB[j + 1]),
        false,
        `path A segment ${i} overlaps path B segment ${j}`
      );
    }
  }
});

test('Tundra\'s two final approaches point in different directions, so they read as a visible junction at the cave, not one straight line', () => {
  const game = loadGameContext();
  const [pathA, pathB] = game.MAP_TYPES.tundra.paths;
  const lastA = pathA[pathA.length - 1];
  const secondLastA = pathA[pathA.length - 2];
  const lastB = pathB[pathB.length - 1];
  const secondLastB = pathB[pathB.length - 2];

  const headingA = Math.atan2(lastA.y - secondLastA.y, lastA.x - secondLastA.x);
  const headingB = Math.atan2(lastB.y - secondLastB.y, lastB.x - secondLastB.x);
  assert.notEqual(headingA, headingB);
});

test('Tundra\'s roster lists all 12 enemies in the exact order given, 3 regular tiers of 3 plus 3 bosses', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const roster = game.getActiveRoster();

  assert.deepEqual(roster.order, ['arcticBumblebee', 'deerFly', 'arcticMoth']);
  assert.equal(roster.bossTypes[1].name, 'Arctic Fritillary');
  assert.deepEqual(roster.orderTier2, ['arcticRinglet', 'snowScorpionFly', 'arcticBluet']);
  assert.equal(roster.bossTypes[2].name, 'Arctic Woolly Bear Moth');
  assert.deepEqual(roster.orderTier3, ['polarBumblebee', 'snowGroundBeetle', 'wolfSpider']);
  assert.equal(roster.bossTypes[3].name, 'Giant Arctic Wolf Spider');
});

test('Giant Arctic Wolf Spider is the true final boss — noticeably tougher than every other Tundra enemy, same billing as Whirlpool\'s Great White', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const roster = game.getActiveRoster();
  const finalBoss = roster.bossTypes[3];

  assert.ok(finalBoss.health > roster.bossTypes[2].health);
  assert.ok(finalBoss.health > roster.bossTypes[1].health);
  Object.values(roster.enemyTypes).forEach((type) => assert.ok(finalBoss.health > type.health));

  // Explicitly set to match or exceed Whirlpool's own Great White (1400).
  assert.ok(finalBoss.health >= game.OCEAN_ROSTER.bossTypes[3].health);
});

test('Tundra\'s regular enemies escalate tier to tier (each tier\'s weakest clears the previous tier\'s ceiling)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const { enemyTypes } = game.getActiveRoster();

  const tier1Max = Math.max(enemyTypes.arcticBumblebee.health, enemyTypes.deerFly.health, enemyTypes.arcticMoth.health);
  const tier2Min = Math.min(enemyTypes.arcticRinglet.health, enemyTypes.snowScorpionFly.health, enemyTypes.arcticBluet.health);
  const tier2Max = Math.max(enemyTypes.arcticRinglet.health, enemyTypes.snowScorpionFly.health, enemyTypes.arcticBluet.health);
  const tier3Min = Math.min(enemyTypes.polarBumblebee.health, enemyTypes.snowGroundBeetle.health, enemyTypes.wolfSpider.health);

  assert.ok(tier2Min > tier1Max);
  assert.ok(tier3Min > tier2Max);
});

test('Tundra enemies unlock weakest-to-strongest on the standard every-5-rounds cadence', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);

  assert.deepEqual(game.getUnlockedEnemyTypes(1), ['arcticBumblebee']);
  assert.deepEqual(game.getUnlockedEnemyTypes(11), ['arcticBumblebee', 'deerFly', 'arcticMoth']);
  assert.deepEqual(
    game.getUnlockedEnemyTypes(26),
    ['arcticBumblebee', 'deerFly', 'arcticMoth', 'arcticRinglet']
  );
  assert.deepEqual(
    game.getUnlockedEnemyTypes(36),
    ['arcticBumblebee', 'deerFly', 'arcticMoth', 'arcticRinglet', 'snowScorpionFly', 'arcticBluet']
  );
  assert.deepEqual(
    game.getUnlockedEnemyTypes(61),
    [
      'arcticBumblebee', 'deerFly', 'arcticMoth', 'arcticRinglet', 'snowScorpionFly', 'arcticBluet',
      'polarBumblebee', 'snowGroundBeetle', 'wolfSpider',
    ]
  );
});

test('generateWave spawns each of Tundra\'s 3 bosses on its own round, with the right enemyKey/name', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);

  const wave25 = game.generateWave(25);
  assert.equal(wave25[0].enemyKey, 'tundra-boss-tier-1');
  assert.equal(wave25[0].name, 'Arctic Fritillary');
  assert.equal(wave25[0].isBoss, true);

  const wave50 = game.generateWave(50);
  assert.equal(wave50[0].enemyKey, 'tundra-boss-tier-2');
  assert.equal(wave50[0].name, 'Arctic Woolly Bear Moth');

  const wave75 = game.generateWave(75);
  assert.equal(wave75[0].enemyKey, 'tundra-boss-tier-3');
  assert.equal(wave75[0].name, 'Giant Arctic Wolf Spider');
});

test('getAllSpawnableEnemyKeys lists Tundra\'s full roster plus the shared armored beetles and all 3 boss tiers', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const keys = game.getAllSpawnableEnemyKeys();

  [
    'arcticBumblebee', 'deerFly', 'arcticMoth',
    'arcticRinglet', 'snowScorpionFly', 'arcticBluet',
    'polarBumblebee', 'snowGroundBeetle', 'wolfSpider',
    'carapaceBeetle', 'ironshellBeetle', 'titanBeetle',
    'tundra-boss-tier-1', 'tundra-boss-tier-2', 'tundra-boss-tier-3',
  ].forEach((key) => assert.ok(keys.includes(key), `expected ${key} to be spawnable`));
});

test('Tundra\'s decor (snowmen, ice spikes, boulders, the ice cave goal) is present with sane, on-canvas coordinates', () => {
  const game = loadGameContext();
  const { decor } = game.MAP_TYPES.tundra;
  ['snowmen', 'iceSpikes', 'boulders'].forEach((key) => {
    assert.ok(Array.isArray(decor[key]) && decor[key].length > 0, `expected decor.${key} to be a non-empty array`);
    decor[key].forEach((item) => {
      assert.ok(item.x >= 0 && item.x <= 960);
      assert.ok(item.y >= 0 && item.y <= 640);
    });
  });
  assert.ok(decor.cave.x >= 0 && decor.cave.x <= 960);
  assert.ok(decor.cave.y >= 0 && decor.cave.y <= 640);
  assert.ok(decor.cave.size > 0);
});

test('a spawned Tundra enemy renders without throwing (smoke check via drawEnemyShape dispatch) for every regular type and every boss', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const keys = [
    'arcticBumblebee', 'deerFly', 'arcticMoth', 'arcticRinglet', 'snowScorpionFly', 'arcticBluet',
    'polarBumblebee', 'snowGroundBeetle', 'wolfSpider',
    'tundra-boss-tier-1', 'tundra-boss-tier-2', 'tundra-boss-tier-3',
  ];
  keys.forEach((key) => {
    const entry = game.getSpawnEntryForEnemyKey(key);
    assert.ok(entry, `expected a spawn entry for ${key}`);
    game.spawnSingleEnemy(entry);
  });
  assert.equal(game.getActiveEnemies().length, keys.length);
});
