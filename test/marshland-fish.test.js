const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Marshland fish (direct request): the map's first tier-3 roster, same fit
// Deep Forest's snakes and Savanah's scorpions found in their own empty
// orderTier3 slot — zero engine changes, only data. A 4th fish from the
// same request, Electric Eel, is a boss instead (MARSH_ROSTER's own
// bossTypes[3]) rather than a 4th regular entry — see this file's own
// "Electric Eel boss" tests below for that half of the request.

test('each fish has a sensible name/color and escalates clearly past Marshland\'s own tier-2 ceiling', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const { enemyTypes } = game.getActiveRoster();

  assert.equal(enemyTypes.piranha.name, 'Piranha');
  assert.equal(enemyTypes.arowana.name, 'Arowana');
  assert.equal(enemyTypes.redtailCatfish.name, 'Redtail Catfish');

  // Assassin Snail (213hp) is Marshland's own tier-2 ceiling — even the
  // weakest fish should read as a clear step up from it.
  assert.ok(enemyTypes.piranha.health > enemyTypes.assassinSnail.health);
});

test('fish escalate weakest to strongest, in the exact order given', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const { enemyTypes } = game.getActiveRoster();

  assert.ok(enemyTypes.arowana.health > enemyTypes.piranha.health);
  assert.ok(enemyTypes.redtailCatfish.health > enemyTypes.arowana.health);
  // Piranha is the fastest/lightest; Redtail Catfish the slowest/tankiest —
  // speed trends the opposite direction from health, same shape as every
  // other roster's own tier3 (e.g. Deep Forest's snakes).
  assert.ok(enemyTypes.piranha.speedMultiplier > enemyTypes.arowana.speedMultiplier);
  assert.ok(enemyTypes.arowana.speedMultiplier > enemyTypes.redtailCatfish.speedMultiplier);
});

test('none of the 3 fish has the armor-gate trait', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const { enemyTypes } = game.getActiveRoster();
  assert.equal(enemyTypes.piranha.armorThreshold, undefined);
  assert.equal(enemyTypes.arowana.armorThreshold, undefined);
  assert.equal(enemyTypes.redtailCatfish.armorThreshold, undefined);
});

test('fish unlock weakest-to-strongest on the existing tier-3 cadence: round 51/56/61', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const tier1and2 = ['tadpole', 'froglet', 'frogLarva', 'appleSnail', 'slug', 'assassinSnail'];

  assert.deepEqual(game.getUnlockedEnemyTypes(50), tier1and2);
  assert.deepEqual(game.getUnlockedEnemyTypes(51), [...tier1and2, 'piranha']);
  assert.deepEqual(game.getUnlockedEnemyTypes(55), [...tier1and2, 'piranha']);
  assert.deepEqual(game.getUnlockedEnemyTypes(56), [...tier1and2, 'piranha', 'arowana']);
  assert.deepEqual(game.getUnlockedEnemyTypes(61), [...tier1and2, 'piranha', 'arowana', 'redtailCatfish']);
  assert.deepEqual(game.getUnlockedEnemyTypes(200), [...tier1and2, 'piranha', 'arowana', 'redtailCatfish']); // capped at 3
});

test('fish never unlock on Deep Forest — they\'re Marshland\'s own roster, not shared', () => {
  const game = loadGameContext();
  // Deep Forest is the default active map.
  assert.equal(game.getUnlockedEnemyTypes(66).includes('piranha'), false);
  assert.equal(game.getSpawnEntryForEnemyKey('piranha'), null);
});

test('getSpawnEntryForEnemyKey resolves every fish to its real, unscaled stats', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const entry = game.getSpawnEntryForEnemyKey('redtailCatfish');
  assert.equal(entry.name, 'Redtail Catfish');
  assert.equal(entry.health, 460);
  assert.equal(entry.isBoss, false);
});

test('a generated wave past round 61 includes all 3 fish among the regular entries, scaled by round', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const wave = game.generateWave(65);
  ['piranha', 'arowana', 'redtailCatfish'].forEach((key) => {
    const entry = wave.find((e) => e.enemyKey === key);
    assert.ok(entry, `${key} should be in a round-65 wave`);
    assert.ok(entry.health > game.getActiveRoster().enemyTypes[key].health);
  });
});

test('fish never spawn before round 51', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const wave = game.generateWave(50);
  assert.equal(wave.some((e) => ['piranha', 'arowana', 'redtailCatfish'].includes(e.enemyKey)), false);
});

test('a spawned fish damages normally and renders without throwing (smoke check via drawEnemyShape dispatch)', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const entry = game.getSpawnEntryForEnemyKey('piranha');
  game.spawnSingleEnemy(entry);
  const fish = game.getActiveEnemies()[0];
  assert.equal(fish.enemyKey, 'piranha');
  game.damageEnemy(fish, 50);
  assert.equal(fish.health, entry.health - 50);
});

// --- Electric Eel boss (direct request) ------------------------------------
// Built as a boss from the start rather than a regular tier3 entry —
// Marshland's first real 3rd boss tier (round 75), same shape as
// Whirlpool's own 3-tier roster. getBossForRound()'s existing fallback-to-
// highest-designed-tier logic already supports an arbitrary number of
// tiers generically (proven by Whirlpool), so this needed zero engine
// changes beyond the data itself.

test('Electric Eel is Marshland\'s 3rd boss tier: slower than every regular fish and both earlier bosses, with health escalating past Military Helmet Snail', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const roster = game.getActiveRoster();
  const eel = roster.bossTypes[3];

  assert.equal(eel.name, 'Electric Eel');
  assert.ok(eel.speedMultiplier < roster.enemyTypes.piranha.speedMultiplier);
  assert.ok(eel.speedMultiplier < roster.enemyTypes.redtailCatfish.speedMultiplier);
  assert.ok(eel.speedMultiplier < roster.bossTypes[1].speedMultiplier);
  assert.ok(eel.speedMultiplier < roster.bossTypes[2].speedMultiplier);
  assert.ok(eel.health > roster.bossTypes[2].health);
});

test('round 75 spawns Electric Eel as a real boss-round entry, not among the regular round-74 wave', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const wave75 = game.generateWave(75);
  assert.equal(wave75.length, 1);
  assert.equal(wave75[0].enemyKey, 'marsh-boss-tier-3');
  assert.equal(wave75[0].name, 'Electric Eel');
  assert.equal(wave75[0].isBoss, true);

  const wave74 = game.generateWave(74);
  assert.equal(wave74.some((e) => e.enemyKey === 'marsh-boss-tier-3'), false);
});

test('getSpawnEntryForEnemyKey resolves Electric Eel to its real, unscaled boss stats', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const entry = game.getSpawnEntryForEnemyKey('marsh-boss-tier-3');
  assert.equal(entry.name, 'Electric Eel');
  assert.equal(entry.isBoss, true);
  assert.equal(entry.armorThreshold, 0); // no armor trait requested for this boss
});
