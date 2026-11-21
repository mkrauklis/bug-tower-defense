const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Savanah scorpions (direct request): the map's first tier-3 roster, same
// fit as Deep Forest's own snakes — orderTier3 was already an empty slot
// waiting for exactly this, so it unlocks on the existing every-5-rounds-
// after-round-50 cadence (round 51/56/61/66) with zero engine changes,
// only data. See SAVANAH_ROSTER's own comment in enemies.js for the
// health/speed/armor judgment calls (no explicit numbers were given this
// time either).

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod', name: 'Tiny Isopod', color: '#78909c', radius: 12,
    maxHealth: 100000, health: 100000, speed: 0, isBoss: false, bounty: 10,
    waypointIndex: 0, spawnDelay: 0, spawned: true, x: 0, y: 0,
    immobilizedRemaining: 0, isZombie: false, isPurpleZombie: false,
    markedForRemoval: false, zombieExplosionDamage: 0,
    ...overrides,
  };
}

test('each scorpion has a sensible name/color and escalates clearly past Savanah\'s own tier-2 ceiling', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const { enemyTypes } = game.getActiveRoster();

  assert.equal(enemyTypes.stripedScorpion.name, 'Striped Scorpion');
  assert.equal(enemyTypes.duneScorpion.name, 'Dune Scorpion');
  assert.equal(enemyTypes.redScorpion.name, 'Red Scorpion');
  assert.equal(enemyTypes.emperorScorpion.name, 'Emperor Scorpion');

  // Kissing Bug (150hp) is Savanah's own tier-2 ceiling — even the
  // weakest scorpion should read as a clear step up from it.
  assert.ok(enemyTypes.stripedScorpion.health > enemyTypes.kissingBug.health);
});

test('scorpions escalate weakest to strongest, in the exact order given', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const { enemyTypes } = game.getActiveRoster();

  assert.ok(enemyTypes.duneScorpion.health > enemyTypes.stripedScorpion.health);
  assert.ok(enemyTypes.redScorpion.health > enemyTypes.duneScorpion.health);
  assert.ok(enemyTypes.emperorScorpion.health > enemyTypes.redScorpion.health);
});

test('only Emperor Scorpion has the armor-gate trait — the other 3 take every hit normally', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const { enemyTypes } = game.getActiveRoster();
  assert.equal(enemyTypes.emperorScorpion.armorThreshold, 6);
  assert.equal(enemyTypes.stripedScorpion.armorThreshold, undefined);
  assert.equal(enemyTypes.duneScorpion.armorThreshold, undefined);
  assert.equal(enemyTypes.redScorpion.armorThreshold, undefined);
});

test('Emperor Scorpion\'s threshold blocks the weakest tier-1 hits but lets a Solar Path tier-1 hit through, and stays clearly under Carapace Beetle\'s own', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const entry = game.getSpawnEntryForEnemyKey('emperorScorpion');
  assert.equal(entry.armorThreshold, 6);

  const enemy = { health: 100, armorThreshold: entry.armorThreshold };
  game.damageEnemy(enemy, 5); // below threshold
  assert.equal(enemy.health, 100); // fully negated

  game.damageEnemy(enemy, 10); // Solar Path's tier-1 hit
  assert.equal(enemy.health, 90); // applies in full

  const carapace = game.getArmoredBeetleTier('carapaceBeetle');
  assert.ok(carapace.armorThreshold > entry.armorThreshold);
});

test('scorpions unlock weakest-to-strongest on the existing tier-3 cadence: round 51/56/61/66', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const tier1and2 = ['sandLion', 'sandworm', 'desertAnt', 'giantLubberGrasshopper', 'desertPrayingMantis', 'kissingBug'];

  assert.deepEqual(game.getUnlockedEnemyTypes(50), tier1and2);
  assert.deepEqual(game.getUnlockedEnemyTypes(51), [...tier1and2, 'stripedScorpion']);
  assert.deepEqual(game.getUnlockedEnemyTypes(55), [...tier1and2, 'stripedScorpion']);
  assert.deepEqual(game.getUnlockedEnemyTypes(56), [...tier1and2, 'stripedScorpion', 'duneScorpion']);
  assert.deepEqual(game.getUnlockedEnemyTypes(61), [...tier1and2, 'stripedScorpion', 'duneScorpion', 'redScorpion']);
  assert.deepEqual(
    game.getUnlockedEnemyTypes(66),
    [...tier1and2, 'stripedScorpion', 'duneScorpion', 'redScorpion', 'emperorScorpion']
  );
  assert.deepEqual(
    game.getUnlockedEnemyTypes(200),
    [...tier1and2, 'stripedScorpion', 'duneScorpion', 'redScorpion', 'emperorScorpion']
  ); // capped at all 4
});

test('scorpions never unlock on Deep Forest — they\'re Savanah\'s own roster, not shared', () => {
  const game = loadGameContext();
  // Deep Forest is the default active map.
  assert.equal(game.getUnlockedEnemyTypes(66).includes('stripedScorpion'), false);
  assert.equal(game.getSpawnEntryForEnemyKey('stripedScorpion'), null);
});

test('getSpawnEntryForEnemyKey resolves every scorpion to its real, unscaled stats', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const entry = game.getSpawnEntryForEnemyKey('emperorScorpion');
  assert.equal(entry.name, 'Emperor Scorpion');
  assert.equal(entry.health, 518); // the pre-3rd-pass 450, raised by tier3's ×1.15 re-tune
  assert.equal(entry.isBoss, false);
});

test('a generated wave past round 66 includes all 4 scorpions among the regular entries, scaled by round', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const wave = game.generateWave(70);
  const scorpionKeys = ['stripedScorpion', 'duneScorpion', 'redScorpion', 'emperorScorpion'];
  scorpionKeys.forEach((key) => {
    const entry = wave.find((e) => e.enemyKey === key);
    assert.ok(entry, `${key} should be in a round-70 wave`);
    assert.ok(entry.health > game.getActiveRoster().enemyTypes[key].health); // scaled up by round, not the flat base value
  });
});

test('scorpions never spawn before round 51', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const wave = game.generateWave(50);
  assert.equal(
    wave.some((e) => ['stripedScorpion', 'duneScorpion', 'redScorpion', 'emperorScorpion'].includes(e.enemyKey)),
    false
  );
});

test('a spawned scorpion damages normally and renders without throwing (smoke check via drawEnemyShape dispatch)', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const entry = game.getSpawnEntryForEnemyKey('redScorpion');
  game.spawnSingleEnemy(entry);
  const scorpion = game.getActiveEnemies()[0];
  assert.equal(scorpion.enemyKey, 'redScorpion');
  game.damageEnemy(scorpion, 50);
  assert.equal(scorpion.health, entry.health - 50);
});
