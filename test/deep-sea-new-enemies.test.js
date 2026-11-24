const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Follow-up request, relayed from the peer session: "Add 4 new enemies
// to the Deep Sea roster: Glowfish, Glowing Plankton, Anglerfish,
// Oarfish — boss." Fills orderTier3 (previously empty) with the 3
// regulars and adds bossTypes[3] for Oarfish, converting Deep Sea from
// its original 2-boss shape to the standard 3-boss shape every other
// Hard-tier map (Whirlpool/Tundra/Volcanic) already uses — see
// DEEP_SEA_ROSTER's own top comment (enemies.js) for the full balance
// reasoning. test/deep-sea-map.test.js covers the original 8 creatures,
// untouched by this follow-up.
//
// Design calls (judgment, per the request's own "use your own judgment
// on health/speed/bounty/armor... and on accurate-but-stylized
// real-world design"):
//   - Glowing Plankton/Glowfish: genuinely bioluminescent art (a soft
//     glow, not just a bright flat color).
//   - Anglerfish: the classic stalked lure + oversized toothy jaw — the
//     very design the OLD Whalefish mistakenly borrowed before its own
//     redraw, now built properly for the creature it belongs to.
//   - Oarfish: a real long, ribbon-like body via the same segmented-
//     trail millipede-body system Marshland's Electric Eel boss already
//     uses, not a single stretched sprite.

test('DEEP_SEA_ROSTER\'s orderTier3 is exactly the 3 new regulars, weakest to strongest per the request\'s own given order', () => {
  const game = loadGameContext();
  const roster = game.MAP_ROSTERS.deepSea;
  assert.deepEqual(roster.orderTier3, ['glowingPlankton', 'glowfish', 'anglerfish']);
  assert.equal(roster.enemyTypes.glowingPlankton.name, 'Glowing Plankton');
  assert.equal(roster.enemyTypes.glowfish.name, 'Glowfish');
  assert.equal(roster.enemyTypes.anglerfish.name, 'Anglerfish');
  // Continues this roster's own existing health curve, not a flat copy
  // of another map's numbers.
  assert.ok(roster.enemyTypes.glowingPlankton.health > roster.enemyTypes.fragilePinkSeaUrchin.health);
  assert.ok(roster.enemyTypes.glowfish.health > roster.enemyTypes.glowingPlankton.health);
  assert.ok(roster.enemyTypes.anglerfish.health > roster.enemyTypes.glowfish.health);
});

test('DEEP_SEA_ROSTER now has a 3rd boss, Oarfish, clearly the tankiest/biggest — the standard 3-boss shape, not the original 2-boss one', () => {
  const game = loadGameContext();
  const roster = game.MAP_ROSTERS.deepSea;
  assert.deepEqual(Object.keys(roster.bossTypes).map(Number).sort(), [1, 2, 3]);
  assert.equal(roster.bossTypes[3].name, 'Oarfish');
  assert.ok(roster.bossTypes[3].health > roster.bossTypes[2].health);
  assert.ok(roster.bossTypes[3].radius >= roster.bossTypes[2].radius);
});

test('round 75 (BOSS_INTERVAL*3) now produces Oarfish on Deep Sea, a real tier-3 boss rather than falling back to tier 2', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  const boss75 = game.getBossForRound(75);
  assert.equal(boss75.tier, 3);
  assert.equal(boss75.name, 'Oarfish');

  const wave75 = game.generateWave(75);
  assert.equal(wave75.length, 1);
  assert.equal(wave75[0].enemyKey, 'deepSea-boss-tier-3');
  assert.equal(wave75[0].name, 'Oarfish');
});

test('rounds 51/56/61 unlock Glowing Plankton/Glowfish/Anglerfish in order, same every-5-rounds tier3 cadence every other roster uses', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  assert.deepEqual(game.getUnlockedEnemyTypes(50).filter((k) => ['glowingPlankton', 'glowfish', 'anglerfish'].includes(k)), []);
  assert.ok(game.getUnlockedEnemyTypes(51).includes('glowingPlankton'));
  assert.equal(game.getUnlockedEnemyTypes(51).includes('glowfish'), false);
  assert.ok(game.getUnlockedEnemyTypes(56).includes('glowfish'));
  assert.ok(game.getUnlockedEnemyTypes(61).includes('anglerfish'));
});

test('each new regular enemy spawns on Deep Sea\'s own spawn edge and routes to the submarine goal, same as every other open-field enemy here', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  const goal = game.MAP_TYPES.deepSea.goal;
  const edge = game.MAP_TYPES.deepSea.spawnEdge;

  ['glowingPlankton', 'glowfish', 'anglerfish'].forEach((key) => {
    const entry = game.getSpawnEntryForEnemyKey(key);
    game.spawnWave([]);
    game.spawnSingleEnemy(entry);
    const enemy = game.getActiveEnemies()[0];
    assert.equal(enemy.x, edge.x1, `${key} should spawn on the spawn edge`);
    assert.equal(enemy.path[enemy.path.length - 1].x, goal.x, `${key}'s route should end at the goal`);
    assert.equal(enemy.path[enemy.path.length - 1].y, goal.y, `${key}'s route should end at the goal`);
  });
});

test('Oarfish is in the millipede-body family and gets a real flowing-ribbon trail (enemy.trail), same mechanism as Electric Eel', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  assert.equal(game.MILLIPEDE_FAMILY_KEYS.has('deepSea-boss-tier-3'), true);

  const entry = game.getSpawnEntryForEnemyKey('deepSea-boss-tier-3');
  game.spawnWave([]);
  game.spawnSingleEnemy(entry);
  const oarfish = game.getActiveEnemies()[0];
  assert.ok(Array.isArray(oarfish.trail)); // non-null trail array is exactly what createEnemyInstance gates on for MILLIPEDE_FAMILY_KEYS members
});

test('Oarfish\'s own MILLIPEDE_BODY entry gives it a genuinely long body (comparable to Anaconda\'s own reach), distinct from Electric Eel\'s shorter one', () => {
  const game = loadGameContext();
  const oarfishBody = game.MILLIPEDE_BODY['deepSea-boss-tier-3'];
  const eelBody = game.MILLIPEDE_BODY['marsh-boss-tier-3'];
  assert.ok(oarfishBody);
  assert.ok(oarfishBody.segmentCount > eelBody.segmentCount, 'expected a longer body than Electric Eel');

  const roster = game.MAP_ROSTERS.deepSea;
  const oarfishLength = oarfishBody.segmentCount * oarfishBody.spacingFactor * roster.bossTypes[3].radius;
  assert.ok(oarfishLength > 150, `expected a genuinely long ribbon body, got ~${oarfishLength.toFixed(0)}px`);
});

test('renderMillipedeBody never throws for Oarfish, walking a real recorded trail the same way updateEnemies() builds one', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  const entry = game.getSpawnEntryForEnemyKey('deepSea-boss-tier-3');
  game.spawnWave([]);
  game.spawnSingleEnemy(entry);
  const oarfish = game.getActiveEnemies()[0];
  oarfish.spawned = true;
  oarfish.heading = 0;

  // Build a real trail by actually moving the enemy and recording points
  // along the way, same as updateEnemies() does every frame, rather than
  // fabricating trail data directly.
  for (let i = 0; i < 60; i += 1) {
    oarfish.x += 5;
    game.recordTrailPoint(oarfish);
  }

  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderMillipedeBody(ctx, oarfish, 1.3));
});

test('renderEnemies never throws for every new creature across several animation phases', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  const ctx = new Proxy({}, { get: () => () => {} });
  ['glowingPlankton', 'glowfish', 'anglerfish'].forEach((key) => {
    const entry = game.getSpawnEntryForEnemyKey(key);
    game.spawnSingleEnemy(entry);
  });
  const bossEntry = game.getSpawnEntryForEnemyKey('deepSea-boss-tier-3');
  game.spawnSingleEnemy(bossEntry);
  game.getActiveEnemies().forEach((e) => { e.spawned = true; });

  [0, 0.5, 1, 1.5, 2].forEach((time) => {
    assert.doesNotThrow(() => game.renderEnemies(ctx, time));
  });
});
