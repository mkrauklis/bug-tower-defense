const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Armored beetles (direct request): a forcing function requiring an
// actually-upgraded tower. The armor trait itself is generic and
// reusable — damageEnemy() is the one choke point every damage source
// in the game already goes through, so gating it there applies the rule
// everywhere for free (direct hits, projectiles, DoT ticks, AoE pulses,
// root traps, etc.) with no per-effect special-casing. Three shared
// tiers (Carapace/Ironshell/Titan Beetle) unlock at round 75/100/125
// regardless of which map is active — see ARMORED_BEETLE_TIERS' own
// extensive comment in enemies.js for the exact threshold/HP calibration
// and the real tower-damage numbers it's based on.

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod',
    health: 1000,
    maxHealth: 1000,
    armorThreshold: 0,
    ...overrides,
  };
}

test('a hit below the armor threshold is fully negated — zero damage, not reduced', () => {
  const game = loadGameContext();
  const enemy = makeTestEnemy({ armorThreshold: 16, health: 100 });
  game.damageEnemy(enemy, 15);
  assert.equal(enemy.health, 100); // completely untouched, not 85
});

test('a hit that exactly meets the threshold applies in full', () => {
  const game = loadGameContext();
  const enemy = makeTestEnemy({ armorThreshold: 16, health: 100 });
  game.damageEnemy(enemy, 16);
  assert.equal(enemy.health, 84);
});

test('a hit above the threshold applies in full, at its real value, not reduced to the threshold', () => {
  const game = loadGameContext();
  const enemy = makeTestEnemy({ armorThreshold: 16, health: 100 });
  game.damageEnemy(enemy, 40);
  assert.equal(enemy.health, 60);
});

test('an enemy with no armor (the default, armorThreshold 0) takes every hit normally', () => {
  const game = loadGameContext();
  const enemy = makeTestEnemy({ armorThreshold: 0, health: 100 });
  game.damageEnemy(enemy, 1); // even a trivially small hit
  assert.equal(enemy.health, 99);
});

test('a persistent DoT tick (burn/puddle/orbit\'s own tiny per-frame damage) is negated the same as any other hit — no death-by-a-thousand-cuts bypass', () => {
  const game = loadGameContext();
  const enemy = makeTestEnemy({ armorThreshold: 16, health: 100 });
  // A burn tick is just damagePerSecond * deltaSeconds — e.g. 10dps over
  // one 60fps frame is ~0.167, nowhere near 16, every single tick.
  for (let i = 0; i < 300; i += 1) game.damageEnemy(enemy, 10 / 60);
  assert.equal(enemy.health, 100); // 5 full seconds of ticking, still untouched
});

test('getUnlockedArmoredBeetleKeys returns exactly the tiers whose unlockRound has been reached', () => {
  const game = loadGameContext();
  assert.deepEqual(game.getUnlockedArmoredBeetleKeys(74), []);
  assert.deepEqual(game.getUnlockedArmoredBeetleKeys(75), ['carapaceBeetle']);
  assert.deepEqual(game.getUnlockedArmoredBeetleKeys(99), ['carapaceBeetle']);
  assert.deepEqual(game.getUnlockedArmoredBeetleKeys(100), ['carapaceBeetle', 'ironshellBeetle']);
  assert.deepEqual(game.getUnlockedArmoredBeetleKeys(124), ['carapaceBeetle', 'ironshellBeetle']);
  assert.deepEqual(
    game.getUnlockedArmoredBeetleKeys(125),
    ['carapaceBeetle', 'ironshellBeetle', 'titanBeetle']
  );
  assert.deepEqual(game.getUnlockedArmoredBeetleKeys(500), ['carapaceBeetle', 'ironshellBeetle', 'titanBeetle']);
});

test('armored beetles unlock the same way regardless of which map is active', () => {
  const game = loadGameContext();
  const forest = game.getUnlockedArmoredBeetleKeys(100);
  game.setActiveMap(game.MAP_TYPES.marshland);
  const marsh = game.getUnlockedArmoredBeetleKeys(100);
  game.setActiveMap(game.MAP_TYPES.savanah);
  const savanah = game.getUnlockedArmoredBeetleKeys(100);
  assert.deepEqual(forest, marsh);
  assert.deepEqual(marsh, savanah);
});

test('each tier has meaningfully more HP and a higher armor threshold than the last', () => {
  const game = loadGameContext();
  const [carapace, ironshell, titan] = game.ARMORED_BEETLE_TIERS;
  assert.ok(ironshell.health > carapace.health);
  assert.ok(titan.health > ironshell.health);
  assert.ok(ironshell.armorThreshold > carapace.armorThreshold);
  assert.ok(titan.armorThreshold > ironshell.armorThreshold);
});

test('generateWave spawns exactly 1 of each unlocked armored beetle tier, separate from the evenly-split regular count', () => {
  const game = loadGameContext();
  const wave = game.generateWave(76); // round 75 is itself a boss round; 76 is the first regular wave with it unlocked
  const armored = wave.find((entry) => entry.enemyKey === 'carapaceBeetle');
  assert.ok(armored);
  assert.equal(armored.count, 1);
  assert.ok(armored.armorThreshold > 0);

  // Every other (regular) entry still splits the normal wave size evenly
  // among itself, untouched by the armored entry being fixed at 1.
  const regularEntries = wave.filter((entry) => entry.enemyKey !== 'carapaceBeetle');
  const expectedPerType = Math.max(1, Math.round(game.getTotalWaveSize(76) / regularEntries.length));
  regularEntries.forEach((entry) => assert.equal(entry.count, expectedPerType));
});

test('an armored beetle\'s health/bounty scale with the round, same as any other enemy', () => {
  const game = loadGameContext();
  const wave76 = game.generateWave(76);
  const wave101 = game.generateWave(101); // Ironshell's own round, well clear of any boss round
  const carapace76 = wave76.find((e) => e.enemyKey === 'carapaceBeetle');
  const carapace101 = wave101.find((e) => e.enemyKey === 'carapaceBeetle');
  assert.ok(carapace101.health > carapace76.health);
  assert.ok(carapace101.bounty > carapace76.bounty);
});

test('armored beetles never spawn before their own unlock round', () => {
  const game = loadGameContext();
  const wave74 = game.generateWave(74);
  assert.equal(wave74.some((e) => e.enemyKey === 'carapaceBeetle'), false);
});

test('getAllSpawnableEnemyKeys always includes every armored beetle, for Sandbox discovery', () => {
  const game = loadGameContext();
  const keys = game.getAllSpawnableEnemyKeys();
  assert.ok(keys.includes('carapaceBeetle'));
  assert.ok(keys.includes('ironshellBeetle'));
  assert.ok(keys.includes('titanBeetle'));
});

test('getSpawnEntryForEnemyKey resolves an armored beetle key to its real (unscaled) stats, including armorThreshold', () => {
  const game = loadGameContext();
  const entry = game.getSpawnEntryForEnemyKey('titanBeetle');
  assert.equal(entry.name, 'Titan Beetle');
  assert.equal(entry.health, game.getArmoredBeetleTier('titanBeetle').health);
  assert.equal(entry.armorThreshold, game.getArmoredBeetleTier('titanBeetle').armorThreshold);
});

test('a regular (non-armored) enemy\'s spawn entry still has armorThreshold 0', () => {
  const game = loadGameContext();
  const entry = game.getSpawnEntryForEnemyKey('ant');
  assert.equal(entry.armorThreshold, 0);
});
