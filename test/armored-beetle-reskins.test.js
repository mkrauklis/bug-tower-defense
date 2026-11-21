const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Armored beetle per-terrain reskins (user bug report: "why are there
// beetles in random maps fix that" — the Whirlpool-only reskin added
// earlier this session wasn't enough once Marshland/Savanah/Tundra all
// existed too; literal dark-green land beetles were still showing up on
// all of them). ARMORED_BEETLE_TIERS/the forcing function itself is
// unchanged on every map — these tests only cover presentation. See
// whirlpool-map.test.js for the original ocean-reskin tests (still
// passing unchanged) and ARMORED_BEETLE_THEME_BY_TERRAIN's own comment
// in enemies.js for which terrains get a reskin and why Savanah/Deep
// Forest don't.

function getThemeAndMechanics(game, terrain, mapType) {
  game.setActiveMap(mapType);
  const carapace = game.getSpawnEntryForEnemyKey('carapaceBeetle');
  const ironshell = game.getSpawnEntryForEnemyKey('ironshellBeetle');
  const titan = game.getSpawnEntryForEnemyKey('titanBeetle');
  return { carapace, ironshell, titan };
}

test('Marshland reskins the armored beetle line to swamp-themed names/colors, mechanics untouched', () => {
  const game = loadGameContext();
  const forest = getThemeAndMechanics(game, 'forest', game.MAP_TYPES.deepForest);
  const marsh = getThemeAndMechanics(game, 'marsh', game.MAP_TYPES.marshland);

  assert.equal(marsh.carapace.name, 'Snapping Turtle');
  assert.equal(marsh.ironshell.name, 'Armored Mud Crab');
  assert.equal(marsh.titan.name, 'Giant Marsh Isopod');
  assert.notEqual(marsh.carapace.color, forest.carapace.color);

  ['health', 'armorThreshold', 'speedMultiplier', 'bounty'].forEach((field) => {
    assert.equal(marsh.carapace[field], forest.carapace[field]);
    assert.equal(marsh.titan[field], forest.titan[field]);
  });
});

test('Savanah reskins the armored beetle line\'s name/color only — it keeps the literal beetle shape (dungBeetle/tigerBeetle already establish beetles as native fauna there)', () => {
  const game = loadGameContext();
  const forest = getThemeAndMechanics(game, 'forest', game.MAP_TYPES.deepForest);
  const desert = getThemeAndMechanics(game, 'desert', game.MAP_TYPES.savanah);

  assert.equal(desert.carapace.name, 'Desert Carapace Beetle');
  assert.equal(desert.ironshell.name, 'Desert Ironshell Beetle');
  assert.equal(desert.titan.name, 'Desert Titan Beetle');
  assert.notEqual(desert.carapace.color, forest.carapace.color);

  ['health', 'armorThreshold', 'speedMultiplier', 'bounty'].forEach((field) => {
    assert.equal(desert.carapace[field], forest.carapace[field]);
  });
});

test('Tundra reskins the armored beetle line to arctic-themed names/colors, mechanics untouched', () => {
  const game = loadGameContext();
  const forest = getThemeAndMechanics(game, 'forest', game.MAP_TYPES.deepForest);
  const tundra = getThemeAndMechanics(game, 'tundra', game.MAP_TYPES.tundra);

  assert.equal(tundra.carapace.name, 'Frost Isopod');
  assert.equal(tundra.ironshell.name, 'Glacial Pillbug');
  assert.equal(tundra.titan.name, 'Permafrost Colossus');
  assert.notEqual(tundra.carapace.color, forest.carapace.color);

  ['health', 'armorThreshold', 'speedMultiplier', 'bounty'].forEach((field) => {
    assert.equal(tundra.carapace[field], forest.carapace[field]);
    assert.equal(tundra.titan[field], forest.titan[field]);
  });
});

test('a generated wave on each reskinned map carries the reskinned name, not the land-beetle one', () => {
  const game = loadGameContext();

  game.setActiveMap(game.MAP_TYPES.marshland);
  const marshWave = game.generateWave(76);
  assert.equal(marshWave.find((e) => e.enemyKey === 'carapaceBeetle').name, 'Snapping Turtle');

  game.setActiveMap(game.MAP_TYPES.savanah);
  const desertWave = game.generateWave(76);
  assert.equal(desertWave.find((e) => e.enemyKey === 'carapaceBeetle').name, 'Desert Carapace Beetle');

  game.setActiveMap(game.MAP_TYPES.tundra);
  const tundraWave = game.generateWave(76);
  assert.equal(tundraWave.find((e) => e.enemyKey === 'carapaceBeetle').name, 'Frost Isopod');
});
