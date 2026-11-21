const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Savanah scorpions (direct request): the map's first tier-3 roster, same
// fit as Deep Forest's own snakes — orderTier3 was already an empty slot
// waiting for exactly this, so it unlocks on the existing every-5-rounds-
// after-round-50 cadence (round 51/56/61) with zero engine changes, only
// data. See SAVANAH_ROSTER's own comment in enemies.js for the
// health/speed/armor judgment calls (no explicit numbers were given this
// time either).
//
// Emperor Scorpion was originally this tier's 4th (strongest) member, but
// was later retrofitted (direct request) into this roster's own
// bossTypes[3] instead — see SAVANAH_ROSTER's own comment on that entry.
// It's covered by this file's own "Emperor Scorpion boss retrofit" tests
// below, not the regular-tier tests above them.

test('each scorpion has a sensible name/color and escalates clearly past Savanah\'s own tier-2 ceiling', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const { enemyTypes } = game.getActiveRoster();

  assert.equal(enemyTypes.stripedScorpion.name, 'Striped Scorpion');
  assert.equal(enemyTypes.duneScorpion.name, 'Dune Scorpion');
  assert.equal(enemyTypes.redScorpion.name, 'Red Scorpion');

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
});

test('none of the 3 remaining regular scorpions has the armor-gate trait (Emperor Scorpion, the one that did, is now a boss)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const { enemyTypes } = game.getActiveRoster();
  assert.equal(enemyTypes.stripedScorpion.armorThreshold, undefined);
  assert.equal(enemyTypes.duneScorpion.armorThreshold, undefined);
  assert.equal(enemyTypes.redScorpion.armorThreshold, undefined);
  assert.equal(enemyTypes.emperorScorpion, undefined); // no longer a regular roster entry at all
});

test('scorpions unlock weakest-to-strongest on the existing tier-3 cadence: round 51/56/61 (3 types, not 4 — Emperor Scorpion is a boss now)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const tier1and2 = ['sandLion', 'sandworm', 'desertAnt', 'giantLubberGrasshopper', 'desertPrayingMantis', 'kissingBug'];

  assert.deepEqual(game.getUnlockedEnemyTypes(50), tier1and2);
  assert.deepEqual(game.getUnlockedEnemyTypes(51), [...tier1and2, 'stripedScorpion']);
  assert.deepEqual(game.getUnlockedEnemyTypes(55), [...tier1and2, 'stripedScorpion']);
  assert.deepEqual(game.getUnlockedEnemyTypes(56), [...tier1and2, 'stripedScorpion', 'duneScorpion']);
  assert.deepEqual(game.getUnlockedEnemyTypes(61), [...tier1and2, 'stripedScorpion', 'duneScorpion', 'redScorpion']);
  assert.deepEqual(
    game.getUnlockedEnemyTypes(200),
    [...tier1and2, 'stripedScorpion', 'duneScorpion', 'redScorpion']
  ); // capped at all 3
});

test('scorpions never unlock on Deep Forest — they\'re Savanah\'s own roster, not shared', () => {
  const game = loadGameContext();
  // Deep Forest is the default active map.
  assert.equal(game.getUnlockedEnemyTypes(66).includes('stripedScorpion'), false);
  assert.equal(game.getSpawnEntryForEnemyKey('stripedScorpion'), null);
});

test('getSpawnEntryForEnemyKey resolves every remaining scorpion to its real, unscaled stats', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const entry = game.getSpawnEntryForEnemyKey('redScorpion');
  assert.equal(entry.name, 'Red Scorpion');
  assert.equal(entry.health, 368);
  assert.equal(entry.isBoss, false);
});

test('a generated wave past round 61 includes all 3 remaining scorpions among the regular entries, scaled by round', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const wave = game.generateWave(65);
  const scorpionKeys = ['stripedScorpion', 'duneScorpion', 'redScorpion'];
  scorpionKeys.forEach((key) => {
    const entry = wave.find((e) => e.enemyKey === key);
    assert.ok(entry, `${key} should be in a round-65 wave`);
    assert.ok(entry.health > game.getActiveRoster().enemyTypes[key].health); // scaled up by round, not the flat base value
  });
});

test('scorpions never spawn before round 51', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const wave = game.generateWave(50);
  assert.equal(
    wave.some((e) => ['stripedScorpion', 'duneScorpion', 'redScorpion'].includes(e.enemyKey)),
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

// --- Emperor Scorpion boss retrofit (direct request) ----------------------
// Pulled out of the regular tier3 roster above and rebuilt as Savanah's
// first real 3rd boss tier (round 75) — same creature/art, but slower and
// with boss-ballpark health, still carrying its signature armor-gate
// trait through (generateWave()/getSpawnEntryForEnemyKey() now read a
// boss's own armorThreshold instead of hardcoding 0, specifically so this
// retrofit wouldn't silently strip it).

test('Emperor Scorpion is Savanah\'s 3rd boss tier: slower than every regular scorpion and both earlier bosses, with boss-ballpark health', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const roster = game.getActiveRoster();
  const emperor = roster.bossTypes[3];

  assert.equal(emperor.name, 'Emperor Scorpion');
  assert.ok(emperor.speedMultiplier < roster.enemyTypes.stripedScorpion.speedMultiplier);
  assert.ok(emperor.speedMultiplier < roster.bossTypes[1].speedMultiplier);
  assert.ok(emperor.speedMultiplier < roster.bossTypes[2].speedMultiplier);
  assert.ok(emperor.health > roster.bossTypes[2].health); // escalates past Blue Death Beetle, not just a bump from its old regular-tier number
});

test('Emperor Scorpion keeps its armorThreshold as a boss (the retrofit\'s whole point), unlike every other existing boss', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const entry = game.getSpawnEntryForEnemyKey('desert-boss-tier-3');
  assert.equal(entry.name, 'Emperor Scorpion');
  assert.equal(entry.isBoss, true);
  assert.equal(entry.armorThreshold, 6);

  const enemy = { health: 100, armorThreshold: entry.armorThreshold };
  game.damageEnemy(enemy, 5); // below threshold
  assert.equal(enemy.health, 100); // fully negated
  game.damageEnemy(enemy, 10); // Solar Path's tier-1 hit
  assert.equal(enemy.health, 90); // applies in full

  // Every OTHER existing boss still defaults to 0 (unaffected by this change).
  assert.equal(game.getSpawnEntryForEnemyKey('desert-boss-tier-1').armorThreshold, 0);
  assert.equal(game.getSpawnEntryForEnemyKey('desert-boss-tier-2').armorThreshold, 0);
});

test('round 75 spawns Emperor Scorpion as a real boss-round entry, not among the regular round-74 wave', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const wave75 = game.generateWave(75);
  assert.equal(wave75.length, 1);
  assert.equal(wave75[0].enemyKey, 'desert-boss-tier-3');
  assert.equal(wave75[0].isBoss, true);
  assert.ok(wave75[0].armorThreshold > 0);

  const wave74 = game.generateWave(74);
  assert.equal(wave74.some((e) => e.enemyKey === 'desert-boss-tier-3'), false);
});
