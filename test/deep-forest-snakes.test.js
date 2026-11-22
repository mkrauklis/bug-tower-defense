const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Deep Forest snakes (direct request): the map's first tier-3 roster,
// slotting into orderTier3's existing every-5-rounds-after-round-50
// unlock cadence (round 51/56/61/66) rather than needing new unlock
// machinery — see FOREST_ROSTER's own comment in enemies.js for the exact
// stat/armor-threshold rationale (Armored Snake's armor is a judgment
// call, flagged there and in the commit message).

test('each snake has the user\'s exact speed, with bounty following the roster\'s ~HP/2 convention against their original health', () => {
  const game = loadGameContext();
  const { enemyTypes } = game.FOREST_ROSTER;

  // Health values here reflect the 3rd balance pass's tier3 re-tune
  // (×1.15 on top of everything before it — see FOREST_ROSTER's own
  // comment in enemies.js); speed/bounty were deliberately left
  // unchanged by that pass (tier3's own speed numbers already read as
  // intentional).
  assert.deepEqual(
    { speed: enemyTypes.gardenerSnake.speedMultiplier, health: enemyTypes.gardenerSnake.health, bounty: enemyTypes.gardenerSnake.bounty },
    { speed: 0.8, health: 345, bounty: 75 }
  );
  assert.deepEqual(
    { speed: enemyTypes.bananaSnake.speedMultiplier, health: enemyTypes.bananaSnake.health, bounty: enemyTypes.bananaSnake.bounty },
    { speed: 0.7, health: 518, bounty: 113 }
  );
  assert.deepEqual(
    { speed: enemyTypes.armoredSnake.speedMultiplier, health: enemyTypes.armoredSnake.health, bounty: enemyTypes.armoredSnake.bounty },
    { speed: 0.5, health: 805, bounty: 175 }
  );
  assert.deepEqual(
    { speed: enemyTypes.anaconda.speedMultiplier, health: enemyTypes.anaconda.health, bounty: enemyTypes.anaconda.bounty },
    { speed: 0.4, health: 1035, bounty: 225 }
  );
});

test('only Armored Snake has the armor-gate trait — the other 3 take every hit normally', () => {
  const game = loadGameContext();
  const { enemyTypes } = game.FOREST_ROSTER;
  assert.equal(enemyTypes.armoredSnake.armorThreshold, 5);
  assert.equal(enemyTypes.gardenerSnake.armorThreshold, undefined);
  assert.equal(enemyTypes.bananaSnake.armorThreshold, undefined);
  assert.equal(enemyTypes.anaconda.armorThreshold, undefined);
});

test('Armored Snake\'s threshold blocks the weakest tier-1 hits but lets a Solar Path tier-1 hit through', () => {
  const game = loadGameContext();
  const entry = game.getSpawnEntryForEnemyKey('armoredSnake');
  assert.equal(entry.armorThreshold, 5);

  const enemy = { health: 100, armorThreshold: entry.armorThreshold };
  game.damageEnemy(enemy, 3); // Decay Path's tier-1 hit
  assert.equal(enemy.health, 100); // fully negated

  game.damageEnemy(enemy, 10); // Solar Path's tier-1 hit
  assert.equal(enemy.health, 90); // applies in full
});

test('snakes unlock weakest-to-strongest on the existing tier-3 cadence: round 51/56/61/66', () => {
  const game = loadGameContext();
  const tier1and2 = ['ant', 'fireAnt', 'armoredAnt', 'babyBeetle', 'dungBeetle', 'tigerBeetle'];

  assert.deepEqual(game.getUnlockedEnemyTypes(50), tier1and2); // nothing yet, right up to the round-50 boss
  assert.deepEqual(game.getUnlockedEnemyTypes(51), [...tier1and2, 'gardenerSnake']);
  assert.deepEqual(game.getUnlockedEnemyTypes(55), [...tier1and2, 'gardenerSnake']); // still just the one
  assert.deepEqual(game.getUnlockedEnemyTypes(56), [...tier1and2, 'gardenerSnake', 'bananaSnake']);
  assert.deepEqual(game.getUnlockedEnemyTypes(61), [...tier1and2, 'gardenerSnake', 'bananaSnake', 'armoredSnake']);
  assert.deepEqual(game.getUnlockedEnemyTypes(66), [...tier1and2, 'gardenerSnake', 'bananaSnake', 'armoredSnake', 'anaconda']);
  assert.deepEqual(game.getUnlockedEnemyTypes(200), [...tier1and2, 'gardenerSnake', 'bananaSnake', 'armoredSnake', 'anaconda']); // capped at all 4
});

test('snakes never unlock on Marshland — they\'re Deep Forest\'s own roster, not shared', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  // Round 66 — well past Marshland's own tier-2 unlock (round 36) and
  // Deep Forest's full snake unlock, but still well before round 75's
  // shared armored-beetle unlock, so the comparison below doesn't also
  // need to account for those. Marshland now has its own tier3 (fish —
  // see marshland-fish.test.js), fully unlocked by round 66, so the
  // expected list includes those too — the point of this test is just
  // that none of Deep Forest's snake KEYS show up on Marshland, not that
  // Marshland has no tier3 of its own.
  const expected = game.MARSH_ROSTER.order.concat(game.MARSH_ROSTER.orderTier2, game.MARSH_ROSTER.orderTier3);
  assert.deepEqual(game.getUnlockedEnemyTypes(66), expected);
  ['gardenerSnake', 'bananaSnake', 'armoredSnake', 'anaconda'].forEach((key) => {
    assert.equal(expected.includes(key), false);
  });
});

test('getSpawnEntryForEnemyKey resolves every snake to its real, unscaled stats', () => {
  const game = loadGameContext();
  const entry = game.getSpawnEntryForEnemyKey('anaconda');
  assert.equal(entry.name, 'Anaconda');
  assert.equal(entry.health, 900); // the user's original 450, doubled by the later across-the-board health pass
  assert.equal(entry.isBoss, false);
});

test('a generated wave past round 66 includes all 4 snakes among the regular (non-armored) entries, scaled by round', () => {
  const game = loadGameContext();
  const wave = game.generateWave(70);
  const snakeKeys = ['gardenerSnake', 'bananaSnake', 'armoredSnake', 'anaconda'];
  snakeKeys.forEach((key) => {
    const entry = wave.find((e) => e.enemyKey === key);
    assert.ok(entry, `${key} should be in a round-70 wave`);
    assert.ok(entry.health > game.FOREST_ROSTER.enemyTypes[key].health); // scaled up by round, not the flat base value
  });
});

test('snakes never spawn before round 51', () => {
  const game = loadGameContext();
  const wave = game.generateWave(50);
  assert.equal(wave.some((e) => ['gardenerSnake', 'bananaSnake', 'armoredSnake', 'anaconda'].includes(e.enemyKey)), false);
});

test('a spawned snake gets a trail array (opted into the segmented millipede-family renderer)', () => {
  const game = loadFullGameContext();
  const entry = game.getSpawnEntryForEnemyKey('gardenerSnake');
  game.spawnSingleEnemy(entry);
  const snake = game.getActiveEnemies()[0];
  assert.deepEqual(snake.trail, []);
});

test('a non-snake enemy still gets no trail array', () => {
  const game = loadFullGameContext();
  const entry = game.getSpawnEntryForEnemyKey('ant');
  game.spawnSingleEnemy(entry);
  assert.equal(game.getActiveEnemies()[0].trail, null);
});

// --- The Anaconda is deliberately way bigger/longer than the other 3 ----
// Direct follow-up request: "make the Anaconda noticeably larger and way
// longer... clearly bigger than the other Deep Forest snakes." Purely a
// render-size change — health/speedMultiplier/bounty/armorThreshold are
// already covered untouched by the tests above. radius drives how big the
// HEAD reads; MILLIPEDE_BODY's own segmentCount/spacingFactor drive how
// long the trailing BODY reads — both were bumped, since "larger" and
// "way longer" are two separate asks. Verified live in the built-in
// browser this session too (this session finally had one): spawned all 4
// snakes side by side in Sandbox, fast-forwarded the Anaconda through the
// map's first corner, and confirmed visually it's dramatically bigger/
// longer than the other 3 and tracks the turn with no clipping/floating
// — the trail-following math itself (renderMillipedeBody/
// getTrailPointAtDistance) already handled that generically for every
// snake, so there was nothing to fix there, only these 2 numbers to tune.

test('the Anaconda\'s own radius is noticeably bigger than every other Deep Forest snake\'s', () => {
  const game = loadGameContext();
  const { enemyTypes } = game.FOREST_ROSTER;
  assert.ok(enemyTypes.anaconda.radius > enemyTypes.armoredSnake.radius);
  assert.ok(enemyTypes.anaconda.radius > enemyTypes.bananaSnake.radius);
  assert.ok(enemyTypes.anaconda.radius > enemyTypes.gardenerSnake.radius);
  assert.equal(enemyTypes.anaconda.radius, 19); // was 13 — a regression guard, not a magic-number fetish
});

test('the Anaconda\'s own body is way longer (segmentCount * spacingFactor) than every other Deep Forest snake\'s', () => {
  const game = loadGameContext();
  const bodyLength = (key) => game.MILLIPEDE_BODY[key].segmentCount * game.MILLIPEDE_BODY[key].spacingFactor;
  const anacondaLength = bodyLength('anaconda');
  assert.ok(anacondaLength > bodyLength('armoredSnake'));
  assert.ok(anacondaLength > bodyLength('bananaSnake'));
  assert.ok(anacondaLength > bodyLength('gardenerSnake'));
  assert.equal(game.MILLIPEDE_BODY.anaconda.segmentCount, 14); // was 8
});

test('the Anaconda keeps its own distinct segment-drawing function (not a generic fallback)', () => {
  const game = loadGameContext();
  assert.equal(typeof game.MILLIPEDE_BODY.anaconda.segmentDrawFn, 'function');
});

test('a spawned Anaconda\'s trail buffer caps out noticeably bigger than before the size bump (recordTrailPoint scales automatically off radius/segmentCount/spacingFactor)', () => {
  const game = loadFullGameContext();
  const entry = game.getSpawnEntryForEnemyKey('anaconda');
  game.spawnSingleEnemy(entry);
  const anaconda = game.getActiveEnemies()[0];
  anaconda.x = 0;
  anaconda.y = 0;

  // Walk it in a straight line far enough to fill and start trimming its
  // own trail buffer, then confirm the cap matches the new, bigger numbers
  // (14 segments * 19 radius * 1.1 spacing / 4px-per-point + 4 == 78) —
  // more than double the pre-bump cap (8 * 13 * 1.0 / 4 + 4 == 30).
  for (let i = 0; i < 400; i += 1) {
    anaconda.x += 4; // comfortably past TRAIL_POINT_SPACING each step
    game.recordTrailPoint(anaconda);
  }
  assert.equal(anaconda.trail.length, 78);
});

test('an ordinary tower can still find and damage an Anaconda normally — the bigger body/radius does not break targeting or hit-detection', () => {
  const game = loadFullGameContext();
  const entry = game.getSpawnEntryForEnemyKey('anaconda');
  game.spawnSingleEnemy(entry);
  const anaconda = game.getActiveEnemies()[0];
  anaconda.x = 100;
  anaconda.y = 100;
  anaconda.spawned = true; // spawnSingleEnemy() always creates it unspawned (spawnDelay hasn't ticked down yet via updateEnemies) — same fixture convention makeTestEnemy() helpers elsewhere already set explicitly, so targeting isn't testing the spawn-delay countdown itself.

  const tower = game.createTower('sunflower');
  tower.x = 100;
  tower.y = 100;

  game.updateTowerAttack(tower, tower.x, tower.y, tower.stats.attackInterval);
  assert.equal(tower.target, anaconda);

  for (let i = 0; i < 60; i += 1) game.updateProjectiles(1 / 60);
  assert.ok(anaconda.health < anaconda.maxHealth);
});
