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

  // Health values here are the user's original 150/225/350/450, doubled
  // once by the later across-the-board "every enemy's health" pass (direct
  // request — see FOREST_ROSTER's own comment in enemies.js); bounty was
  // deliberately left unchanged by that pass, so it still reflects the
  // pre-doubling health.
  assert.deepEqual(
    { speed: enemyTypes.gardenerSnake.speedMultiplier, health: enemyTypes.gardenerSnake.health, bounty: enemyTypes.gardenerSnake.bounty },
    { speed: 0.8, health: 300, bounty: 75 }
  );
  assert.deepEqual(
    { speed: enemyTypes.bananaSnake.speedMultiplier, health: enemyTypes.bananaSnake.health, bounty: enemyTypes.bananaSnake.bounty },
    { speed: 0.7, health: 450, bounty: 113 }
  );
  assert.deepEqual(
    { speed: enemyTypes.armoredSnake.speedMultiplier, health: enemyTypes.armoredSnake.health, bounty: enemyTypes.armoredSnake.bounty },
    { speed: 0.5, health: 700, bounty: 175 }
  );
  assert.deepEqual(
    { speed: enemyTypes.anaconda.speedMultiplier, health: enemyTypes.anaconda.health, bounty: enemyTypes.anaconda.bounty },
    { speed: 0.4, health: 900, bounty: 225 }
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
  // need to account for those.
  assert.deepEqual(game.getUnlockedEnemyTypes(66), game.MARSH_ROSTER.order.concat(game.MARSH_ROSTER.orderTier2));
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
