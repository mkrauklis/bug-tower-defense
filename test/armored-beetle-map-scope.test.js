const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Armored beetle map scope — history: this file originally covered the
// per-terrain reskins added after a user bug report ("why are there
// beetles in random maps fix that") gave Whirlpool/Marshland/Savanah/
// Tundra each their own themed crab/turtle/isopod/pillbug stand-in so a
// literal land beetle didn't look out of place.
//
// Direct request, relayed from the peer session, superseded that: "stop
// injecting it regardless of map... remove from maps where it was only
// ever an off-theme bolt-on." The forcing function (ARMORED_BEETLE_TIERS)
// itself is now only active on terrains whose own native roster already
// has a beetle-family enemy (Deep Forest, Savanah, Volcanic — see
// ARMORED_BEETLE_TERRAINS' own comment in enemies.js); it's removed
// entirely, not reskinned, on the three that don't (Whirlpool, Marshland,
// Tundra — see each map's own dedicated test file for that half). Of the
// three terrains that keep it, Savanah also lost its old "Desert Carapace
// Beetle" etc. cosmetic reskin per the same request's own wording ("as
// literal beetles, no reskin needed") — it now reads identically to Deep
// Forest. Volcanic is the one terrain that still has a themed
// presentation (name/color only, same literal beetle shape) — it was
// never covered by this file before, so it's added below.

function getBeetleEntries(game, mapType) {
  game.setActiveMap(mapType);
  return {
    carapace: game.getSpawnEntryForEnemyKey('carapaceBeetle'),
    ironshell: game.getSpawnEntryForEnemyKey('ironshellBeetle'),
    titan: game.getSpawnEntryForEnemyKey('titanBeetle'),
  };
}

test('Savanah no longer reskins the armored beetle line at all — same literal names/colors as Deep Forest', () => {
  const game = loadGameContext();
  const forest = getBeetleEntries(game, game.MAP_TYPES.deepForest);
  const desert = getBeetleEntries(game, game.MAP_TYPES.savanah);

  assert.equal(desert.carapace.name, 'Carapace Beetle');
  assert.equal(desert.ironshell.name, 'Ironshell Beetle');
  assert.equal(desert.titan.name, 'Titan Beetle');
  assert.equal(desert.carapace.color, forest.carapace.color);
  assert.equal(desert.ironshell.color, forest.ironshell.color);
  assert.equal(desert.titan.color, forest.titan.color);
});

test('Volcanic still reskins the armored beetle line\'s name/color only — same literal beetle shape, mechanics untouched', () => {
  const game = loadGameContext();
  const forest = getBeetleEntries(game, game.MAP_TYPES.deepForest);
  const volcanic = getBeetleEntries(game, game.MAP_TYPES.volcanic);

  assert.equal(volcanic.carapace.name, 'Obsidian Carapace Beetle');
  assert.equal(volcanic.ironshell.name, 'Magma Ironshell Beetle');
  assert.equal(volcanic.titan.name, 'Molten Titan Beetle');
  assert.notEqual(volcanic.carapace.color, forest.carapace.color);

  ['health', 'armorThreshold', 'speedMultiplier', 'bounty'].forEach((field) => {
    assert.equal(volcanic.carapace[field], forest.carapace[field]);
    assert.equal(volcanic.titan[field], forest.titan[field]);
  });
});

test('a generated Savanah wave past round 75 carries the plain land-beetle name, same as Deep Forest', () => {
  const game = loadGameContext();

  game.setActiveMap(game.MAP_TYPES.savanah);
  const desertWave = game.generateWave(76);
  assert.equal(desertWave.find((e) => e.enemyKey === 'carapaceBeetle').name, 'Carapace Beetle');
});

test('a generated Volcanic wave past round 75 carries the volcano-reskinned name', () => {
  const game = loadGameContext();

  game.setActiveMap(game.MAP_TYPES.volcanic);
  const volcanicWave = game.generateWave(76);
  assert.equal(volcanicWave.find((e) => e.enemyKey === 'carapaceBeetle').name, 'Obsidian Carapace Beetle');
});

// Whirlpool/Marshland/Tundra's own removal (not just "no reskin," a total
// absence) has dedicated coverage in whirlpool-map.test.js,
// tundra-map.test.js, and armor-mechanic.test.js respectively — this file
// is specifically about which of the terrains that DO still spawn them
// gets a themed presentation.
