const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Enemies are now per-map: each map's *terrain* (not its map id — see
// js/map.js) has its own roster (MAP_ROSTERS.forest / .marsh), and
// generateWave()/getUnlockedEnemyTypes()/getBossForRound() all read
// whichever roster matches the currently active map (getActiveRoster()).
// The light loadGameContext() defaults to Deep Forest (map.js's own
// default active map), so these tests switch maps explicitly wherever the
// roster itself — not just the generic engine around it — is what's being
// checked.

test('getTotalWaveSize scales from 5 at round 1 up to 25 at round 25, then keeps trickling up (not flat) to a hard ceiling', () => {
  const game = loadGameContext();
  assert.equal(game.getTotalWaveSize(1), 5);
  assert.equal(game.getTotalWaveSize(25), 25);
  assert.ok(game.getTotalWaveSize(13) > game.getTotalWaveSize(1) && game.getTotalWaveSize(13) < game.getTotalWaveSize(25));

  // Balance pass (direct request): past round 25 this used to hold flat
  // at 25 forever — now it keeps climbing, just much more slowly
  // (+1 enemy every 5 rounds) up to a hard ceiling, so the back half of
  // a long game isn't left with zero count pressure.
  assert.equal(game.getTotalWaveSize(60), 25 + Math.floor((60 - 25) / 5)); // 32, still climbing
  assert.ok(game.getTotalWaveSize(60) > game.getTotalWaveSize(25));
  assert.equal(game.getTotalWaveSize(10000), 50); // ceilinged, not unbounded
});

test('getRoundScaling compounds 4.5% EVERY round on top of a 1.5x base (3rd balance pass), so round 1 is already harder than baseline', () => {
  const game = loadGameContext();
  // Deep Forest (Easy, map multiplier 1x) is the default active map, so
  // this is exactly BASE_HEALTH_MULTIPLIER on its own at round 1 — no
  // longer a 1x no-op the way the pre-3rd-pass curve left it, which was
  // the whole point of adding a flat base multiplier: even the very first
  // enemies a player faces are tougher now, not just "the curve eventually
  // gets there."
  assert.equal(game.getRoundScaling(1).healthMultiplier, 1.5);
  assert.ok(game.getRoundScaling(10).healthMultiplier > game.getRoundScaling(1).healthMultiplier);
  // Round 2 must already be strictly ahead of round 1 — no flat plateau.
  assert.ok(game.getRoundScaling(2).healthMultiplier > game.getRoundScaling(1).healthMultiplier);

  // Compounding growth, not linear, so it diverges sharply the further a
  // run goes. Spot-check the exact curve (1.5 base x 4.5% compounding).
  assert.ok(Math.abs(game.getRoundScaling(25).healthMultiplier - 1.5 * 1.045 ** 24) < 1e-9);
  assert.ok(Math.abs(game.getRoundScaling(100).healthMultiplier - 1.5 * 1.045 ** 99) < 1e-9);
  // Round 100 should be dramatically harder than round 25 — not just a
  // little, which is exactly what a linear curve would get wrong.
  assert.ok(game.getRoundScaling(100).healthMultiplier / game.getRoundScaling(25).healthMultiplier > 10);
});

test('getRoundScaling applies a per-map difficulty-tier multiplier: Deep Forest Easy, Marsh/Savanah Medium, Whirlpool Hard', () => {
  const game = loadGameContext();
  const forestMultiplier = game.getRoundScaling(10).healthMultiplier; // Easy, 1x

  game.setActiveMap(game.MAP_TYPES.marshland);
  const marshMultiplier = game.getRoundScaling(10).healthMultiplier; // Medium, 1.3x

  game.setActiveMap(game.MAP_TYPES.savanah);
  const savanahMultiplier = game.getRoundScaling(10).healthMultiplier; // Medium, 1.3x

  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const whirlpoolMultiplier = game.getRoundScaling(10).healthMultiplier; // Hard, 1.8x

  assert.ok(Math.abs(marshMultiplier / forestMultiplier - 1.3) < 1e-9);
  assert.ok(Math.abs(savanahMultiplier / forestMultiplier - 1.3) < 1e-9);
  assert.ok(Math.abs(whirlpoolMultiplier / forestMultiplier - 1.8) < 1e-9);
  assert.equal(marshMultiplier, savanahMultiplier); // both Medium, identical multiplier
  assert.ok(whirlpoolMultiplier > marshMultiplier); // Hard is unmistakably harder than Medium
  assert.ok(marshMultiplier > forestMultiplier); // Medium is unmistakably harder than Easy
});

test('getActiveRoster defaults to the Forest roster (Deep Forest is the default active map)', () => {
  const game = loadGameContext();
  assert.equal(game.getActiveRoster(), game.FOREST_ROSTER);
});

test('getActiveRoster switches to the Marsh roster once Marshland is the active map', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  assert.equal(game.getActiveRoster(), game.MARSH_ROSTER);
});

test('Deep Forest tier 1 unlocks Ant, then Fire Ant, then Armored Ant over rounds 1/6/11', () => {
  const game = loadGameContext();
  assert.deepEqual(game.getUnlockedEnemyTypes(1), ['ant']);
  assert.deepEqual(game.getUnlockedEnemyTypes(6), ['ant', 'fireAnt']);
  assert.deepEqual(game.getUnlockedEnemyTypes(11), ['ant', 'fireAnt', 'armoredAnt']);
  assert.deepEqual(game.getUnlockedEnemyTypes(24), ['ant', 'fireAnt', 'armoredAnt']); // maxed out, tier 2 not started
});

test('Deep Forest tier 2 (Baby/Dung/Tiger Beetle) unlocks progressively after the round-25 boss', () => {
  const game = loadGameContext();
  const tier1 = ['ant', 'fireAnt', 'armoredAnt'];
  assert.deepEqual(game.getUnlockedEnemyTypes(26), [...tier1, 'babyBeetle']);
  assert.deepEqual(game.getUnlockedEnemyTypes(31), [...tier1, 'babyBeetle', 'dungBeetle']);
  assert.deepEqual(game.getUnlockedEnemyTypes(36), [...tier1, 'babyBeetle', 'dungBeetle', 'tigerBeetle']);
});

test('Marshland has its own independent roster/unlock schedule from Deep Forest', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  assert.deepEqual(game.getUnlockedEnemyTypes(1), ['tadpole']);
  assert.deepEqual(game.getUnlockedEnemyTypes(11), ['tadpole', 'froglet', 'frogLarva']);
  assert.deepEqual(game.getUnlockedEnemyTypes(36), ['tadpole', 'froglet', 'frogLarva', 'appleSnail', 'slug', 'assassinSnail']);
});

test('generateWave(1) on Deep Forest is just Ant, scaled to the round-1 baseline count/health', () => {
  const game = loadGameContext();
  const wave = game.generateWave(1);
  assert.equal(wave.length, 1);
  assert.equal(wave[0].enemyKey, 'ant');
  assert.equal(wave[0].count, 5); // WAVE_SIZE_AT_ROUND_1, undivided (1 unlocked type)
  // Round 1 is no longer a scaling no-op under the 3rd balance pass's new
  // base multiplier (see getRoundScaling()'s own comment) — computed via
  // the real function rather than hardcoded, so this doesn't go stale the
  // next time either constant gets retuned.
  const scaling = game.getRoundScaling(1).healthMultiplier;
  assert.equal(wave[0].health, Math.round(game.FOREST_ROSTER.enemyTypes.ant.health * scaling));
  assert.equal(wave[0].bounty, Math.round(game.FOREST_ROSTER.enemyTypes.ant.bounty * scaling));
});

test('every 25th round is a boss wave, keyed and prefixed with the active map\'s own terrain', () => {
  const game = loadGameContext();
  assert.equal(game.isBossRound(24), false);
  assert.equal(game.isBossRound(25), true);

  // Balance pass: boss bounty (and health) now scale with round the same
  // way regular enemies' do (see getRoundScaling()'s own comment in
  // enemies.js) — no longer the roster's flat base bounty — so this
  // checks the real scaled value rather than the old static 25/33.
  const roundScaling = game.getRoundScaling(25).healthMultiplier;

  const forestWave = game.generateWave(25);
  assert.equal(forestWave[0].isBoss, true);
  assert.equal(forestWave[0].name, 'Queen Ant');
  assert.equal(forestWave[0].enemyKey, 'forest-boss-tier-1');
  assert.equal(forestWave[0].bounty, Math.round(game.FOREST_ROSTER.bossTypes[1].bounty * roundScaling));

  game.setActiveMap(game.MAP_TYPES.marshland);
  const marshWave = game.generateWave(25);
  assert.equal(marshWave[0].name, 'Frog Boss');
  assert.equal(marshWave[0].enemyKey, 'marsh-boss-tier-1');
  assert.equal(marshWave[0].bounty, Math.round(game.MARSH_ROSTER.bossTypes[1].bounty * roundScaling));
});

test('round 50 spawns each map\'s own tier-2 boss', () => {
  const game = loadGameContext();
  const forestWave = game.generateWave(50);
  assert.equal(forestWave[0].name, 'Longhorn Beetle');
  assert.equal(forestWave[0].enemyKey, 'forest-boss-tier-2');

  game.setActiveMap(game.MAP_TYPES.marshland);
  const marshWave = game.generateWave(50);
  assert.equal(marshWave[0].name, 'Military Helmet Snail');
  assert.equal(marshWave[0].enemyKey, 'marsh-boss-tier-2');
});

test('boss keys are terrain-prefixed so the two maps\' tier-1/tier-2 bosses never collide', () => {
  const game = loadGameContext();
  const forestBoss1 = game.generateWave(25)[0].enemyKey;
  game.setActiveMap(game.MAP_TYPES.marshland);
  const marshBoss1 = game.generateWave(25)[0].enemyKey;
  assert.notEqual(forestBoss1, marshBoss1);
});

test('generateWave degrades to an empty wave on a non-boss round with nothing unlocked yet', () => {
  const game = loadGameContext();
  // round 0 is before tier 1's own round-1 unlock — an edge case the real
  // game never reaches (round starts at 1), exercised here purely to prove
  // the empty-roster/empty-unlock path still can't crash.
  assert.deepEqual(game.getUnlockedEnemyTypes(0), []);
});

test('an undesigned boss tier (beyond the highest designed one) falls back, not a new boss', () => {
  const game = loadGameContext();
  const round75Wave = game.generateWave(75); // no tier-3 boss designed for either map
  assert.equal(round75Wave[0].name, 'Longhorn Beetle'); // falls back to the strongest designed tier
});

test('a round-75 rematch of the round-50 boss actually hits harder, not a verbatim replay (balance pass)', () => {
  const game = loadGameContext();
  const round50Boss = game.generateWave(50)[0];
  const round75Boss = game.generateWave(75)[0];
  assert.equal(round50Boss.enemyKey, round75Boss.enemyKey); // same fallback tier...
  assert.ok(round75Boss.health > round50Boss.health); // ...but not the same stats
  assert.ok(round75Boss.bounty > round50Boss.bounty);
});

test('a regular enemy\'s bounty scales with the round, same multiplier as its health (balance pass)', () => {
  const game = loadGameContext();
  const round1 = game.generateWave(1)[0];
  const round40 = game.generateWave(40)[0];
  const scaling40 = game.getRoundScaling(40).healthMultiplier;
  assert.equal(round40.health, Math.round(round1.health * scaling40));
  assert.equal(round40.bounty, Math.round(round1.bounty * scaling40));
  assert.ok(round40.bounty > round1.bounty); // reward keeps pace with difficulty
});

test('generateWave degrades to an empty wave, not a crash, if a roster ever has nothing unlocked/designed', () => {
  const game = loadGameContext();
  // Simulates what a brand-new/blank roster would look like — this is the
  // exact shape both built-in rosters started in before this content was
  // designed (see git history), kept here as a regression test for that
  // degrade-gracefully path now that neither roster is actually empty.
  game.FOREST_ROSTER.order.length = 0;
  game.FOREST_ROSTER.orderTier2.length = 0;
  game.FOREST_ROSTER.orderTier3.length = 0;
  delete game.FOREST_ROSTER.bossTypes[1];
  delete game.FOREST_ROSTER.bossTypes[2];

  assert.deepEqual(game.generateWave(1), []);
  assert.deepEqual(game.generateWave(25), []); // boss round, no boss designed
  assert.equal(game.getBossForRound(25), null);
});

test('bounties follow the ~HP/2 convention, Ant bumped up from round(2/2)=1 so the cheapest enemy is never worthless', () => {
  const game = loadGameContext();
  assert.equal(game.FOREST_ROSTER.enemyTypes.ant.bounty, 2); // bumped, not literal HP/2
  assert.equal(game.FOREST_ROSTER.enemyTypes.fireAnt.bounty, 2); // round(3/2)=2
  assert.equal(game.FOREST_ROSTER.enemyTypes.armoredAnt.bounty, 5); // round(10/2)=5
  // Queen Ant's bounty was round(50/2)=25 before boss health was later
  // doubled, twice over (direct request both times, bounty intentionally
  // left unchanged either time) — health is 200 now, but the bounty
  // itself is still just 25.
  assert.equal(game.FOREST_ROSTER.bossTypes[1].bounty, 25);
  assert.equal(game.MARSH_ROSTER.enemyTypes.frogLarva.bounty, 12); // round(23/2)=12 (round(11.5)=12), against frogLarva's pre-doubling 23 HP (now 46)
  // Military Helmet Snail's bounty was round(150/2)=75 before boss health
  // was later doubled, twice over (same unchanged-bounty note as Queen Ant
  // above); health is 600 now.
  assert.equal(game.MARSH_ROSTER.bossTypes[2].bounty, 75);
});

test('every map\'s boss health was doubled, then doubled again (direct request) — bounty/speed/radius untouched throughout', () => {
  const game = loadGameContext();
  // Each boss has now been doubled twice: once on its own (direct request,
  // first pass), then again as part of the later across-the-board "every
  // enemy's health" pass (see FOREST_ROSTER's own comment in enemies.js) —
  // the two stack, so these land at ~4x the original pre-either-buff value.
  assert.equal(game.FOREST_ROSTER.bossTypes[1].health, 200); // Queen Ant: 50 -> 100 -> 200
  assert.equal(game.FOREST_ROSTER.bossTypes[2].health, 400); // Longhorn Beetle: 100 -> 200 -> 400
  assert.equal(game.MARSH_ROSTER.bossTypes[1].health, 260); // Frog Boss: 65 -> 130 -> 260
  assert.equal(game.MARSH_ROSTER.bossTypes[2].health, 600); // Military Helmet Snail: 150 -> 300 -> 600
  game.setActiveMap(game.MAP_TYPES.savanah);
  const savanahRoster = game.getActiveRoster();
  assert.equal(savanahRoster.bossTypes[1].health, 300); // Desert Termite: 75 -> 150 -> 300
  assert.equal(savanahRoster.bossTypes[2].health, 580); // Blue Death Beetle: 145 -> 290 -> 580

  // Speed/radius are untouched — just a couple of spot checks, not every field.
  assert.equal(game.FOREST_ROSTER.bossTypes[1].speedMultiplier, 0.5);
  assert.equal(savanahRoster.bossTypes[1].radius, 21);
});

test('every regular (non-boss) enemy type\'s health/speed reflects the 3rd balance pass\'s tiered re-tune (tier1 x1.4/x1.15, tier2 x1.25/x1.08, tier3 x1.15/unchanged), bounty/armor untouched', () => {
  const game = loadGameContext();
  assert.deepEqual(
    Object.fromEntries(Object.entries(game.FOREST_ROSTER.enemyTypes).map(([key, type]) => [key, type.health])),
    {
      ant: 6, fireAnt: 8, armoredAnt: 28, babyBeetle: 63, dungBeetle: 113, tigerBeetle: 125,
      gardenerSnake: 345, bananaSnake: 518, armoredSnake: 805, anaconda: 1035,
    }
  );

  game.setActiveMap(game.MAP_TYPES.marshland);
  assert.deepEqual(
    Object.fromEntries(Object.entries(game.getActiveRoster().enemyTypes).map(([key, type]) => [key, type.health])),
    {
      tadpole: 14, froglet: 28, frogLarva: 64, appleSnail: 125, slug: 188, assassinSnail: 213,
      piranha: 260, arowana: 340, redtailCatfish: 460,
    }
  );

  game.setActiveMap(game.MAP_TYPES.savanah);
  assert.deepEqual(
    Object.fromEntries(Object.entries(game.getActiveRoster().enemyTypes).map(([key, type]) => [key, type.health])),
    {
      sandLion: 17, sandworm: 42, desertAnt: 70, giantLubberGrasshopper: 150, desertPrayingMantis: 125, kissingBug: 188,
      stripedScorpion: 184, duneScorpion: 253, redScorpion: 368,
    }
  );

  game.setActiveMap(game.MAP_TYPES.whirlpool);
  assert.deepEqual(
    Object.fromEntries(Object.entries(game.getActiveRoster().enemyTypes).map(([key, type]) => [key, type.health])),
    {
      seaCucumber: 11, urchin: 21, clownFish: 17, starfish: 112, seahorse: 138, horseshoeCrab: 212,
      stingray: 288, tuna: 368, marlin: 460,
    }
  );

  // Tier1's own speed re-tune (x1.15) — a couple of spot checks.
  assert.equal(game.FOREST_ROSTER.enemyTypes.ant.speedMultiplier, 0.8);
  // Bounty/armorThreshold are untouched by this individual re-tune.
  assert.equal(game.FOREST_ROSTER.enemyTypes.ant.bounty, 2);
  assert.equal(game.FOREST_ROSTER.enemyTypes.armoredSnake.armorThreshold, 5);
});

test('the shared armored beetles\' health was also doubled by the across-the-board pass — armorThreshold/bounty/speed untouched', () => {
  const game = loadGameContext();
  const [carapace, ironshell, titan] = game.ARMORED_BEETLE_TIERS;
  assert.equal(carapace.health, 300); // was 150
  assert.equal(ironshell.health, 600); // was 300
  assert.equal(titan.health, 1200); // was 600
  assert.equal(carapace.armorThreshold, 8);
  assert.equal(ironshell.armorThreshold, 16);
  assert.equal(titan.armorThreshold, 24);
  assert.equal(carapace.bounty, 75);
});

test('spawnWave lays out the right number of enemy instances from a manual composition, staggered', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 5, health: 2, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const active = game.getActiveEnemies();

  assert.equal(active.length, 5);
  assert.equal(active[0].spawnDelay, 0);
  assert.ok(active[1].spawnDelay > active[0].spawnDelay);
});

test('updateEnemies moves a spawned enemy toward the next waypoint', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  const startX = enemy.x;

  game.updateEnemies(0.1); // enemy.speed = BASE_SPEED * 1 = 60px/s -> 6px this tick
  assert.ok(enemy.x > startX);
});

test('an immobilized enemy (Rose Root Path\'s grab) does not move, but still takes burn damage', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1000, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  enemy.spawned = true;
  enemy.immobilizedRemaining = 2;
  enemy.burn = { damagePerSecond: 10, remaining: 5 };
  const startX = enemy.x;

  game.updateEnemies(1);

  assert.equal(enemy.x, startX); // held in place — movement is skipped entirely
  assert.equal(enemy.health, 990); // burn still ticks while immobilized
  assert.equal(enemy.immobilizedRemaining, 1); // counts down toward 0
});

test('an already-dead enemy does not move or take further burn damage before being swept up', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1000, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  enemy.spawned = true;
  enemy.health = -1;
  enemy.burn = { damagePerSecond: 999, remaining: 5 };
  const xBefore = enemy.x;

  const killed = game.updateEnemies(1); // a full second — plenty to move or burn-tick if allowed to

  assert.equal(enemy.x, xBefore); // didn't move
  assert.equal(enemy.health, -1); // no extra burn damage either
  assert.equal(killed.length, 1);
});

test('updateEnemies returns enemies that died, separately from ones that reached the goal', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();

  game.damageEnemy(enemy, 999); // kill it without moving it
  const killed = game.updateEnemies(0.0001);

  assert.equal(killed.length, 1);
  assert.equal(killed[0], enemy);
  assert.equal(game.getActiveEnemies().length, 0);
});

test('an enemy that reaches the final waypoint is removed but not reported as killed', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1000, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);

  // Push it straight past the end of the path in one giant tick rather
  // than simulating the whole walk.
  const killed = game.updateEnemies(1000);

  assert.equal(killed.length, 0); // reached the goal, not killed
  assert.equal(game.getActiveEnemies().length, 0);
});

test('findNearestEnemyInRange ignores unspawned, dead, and out-of-range enemies', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 3, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [a, b, c] = game.getActiveEnemies();
  a.spawned = true; a.x = 0; a.y = 0;
  b.spawned = true; b.x = 5; b.y = 0; b.health = 0; // dead
  c.spawned = false; c.x = 1; c.y = 0; // not spawned yet

  const found = game.findNearestEnemyInRange(0, 0, 100);
  assert.equal(found, a);
});

test('getEnemiesInRadius returns every live enemy within range, not just the nearest', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 2, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [a, b] = game.getActiveEnemies();
  a.spawned = true; a.x = 0; a.y = 0;
  b.spawned = true; b.x = 10; b.y = 0;

  assert.equal(game.getEnemiesInRadius(0, 0, 20).length, 2);
  assert.equal(game.getEnemiesInRadius(0, 0, 5).length, 1);
});

test('applyBurn sets a fresh damage-over-time window on the enemy', () => {
  const game = loadGameContext();
  const enemy = { health: 100 };
  game.applyBurn(enemy, { damagePerSecond: 10, duration: 5 });
  assert.deepEqual(enemy.burn, { damagePerSecond: 10, duration: 5 });
});

// --- Millipede-family trail mechanism (generic engine; Deep Forest's 4 --
// --- snakes are now its first real users — see deep-forest-snakes.test.js
// --- for their own dedicated coverage; these tests just exercise the
// --- generic mechanism itself using a synthetic key.)

test('MILLIPEDE_FAMILY_KEYS lists exactly Deep Forest\'s 4 snakes', () => {
  const game = loadGameContext();
  assert.deepEqual(
    [...game.MILLIPEDE_FAMILY_KEYS].sort(),
    ['anaconda', 'armoredSnake', 'bananaSnake', 'gardenerSnake']
  );
});

test('an enemy whose key is in MILLIPEDE_FAMILY_KEYS gets a trail array; others get null', () => {
  const game = loadGameContext();
  game.MILLIPEDE_FAMILY_KEYS.add('testSegmentedBug'); // simulates a future type opting in
  game.spawnWave([
    { enemyKey: 'testSegmentedBug', name: 'Test Segmented Bug', color: '#000', radius: 7, count: 1, health: 60, speedMultiplier: 0.7, isBoss: false, bounty: 30 },
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 11, count: 1, health: 50, speedMultiplier: 0.6, isBoss: false, bounty: 25 },
  ]);
  const [segmented, plain] = game.getActiveEnemies();
  assert.deepEqual(segmented.trail, []);
  assert.equal(plain.trail, null);
});

test('recordTrailPoint only adds a point once the enemy has moved far enough', () => {
  const game = loadGameContext();
  const enemy = { x: 0, y: 0, radius: 7, enemyKey: 'testSegmentedBug', trail: [] };

  game.recordTrailPoint(enemy); // first point always recorded
  assert.equal(enemy.trail.length, 1);

  enemy.x = 1; // well under TRAIL_POINT_SPACING (4px)
  game.recordTrailPoint(enemy);
  assert.equal(enemy.trail.length, 1); // too soon, no new point

  enemy.x = 10; // now far enough from the last recorded point
  game.recordTrailPoint(enemy);
  assert.equal(enemy.trail.length, 2);
});

test('recordTrailPoint falls back to a default body config for a key with no MILLIPEDE_BODY entry', () => {
  const game = loadGameContext();
  const enemy = { x: 0, y: 0, radius: 7, enemyKey: 'someKeyNotInMilliBody', trail: [] };
  // Would throw if recordTrailPoint assumed MILLIPEDE_BODY[enemy.enemyKey] always exists.
  game.recordTrailPoint(enemy);
  assert.equal(enemy.trail.length, 1);
});

test('getTrailPointAtDistance walks back through the trail by arc length, interpolating between points', () => {
  const game = loadGameContext();
  const enemy = {
    x: 20, y: 0,
    trail: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  };

  // 5px behind the head (20,0): between the trail's (10,0) and the head itself.
  const halfway = game.getTrailPointAtDistance(enemy, 5);
  assert.ok(Math.abs(halfway.x - 15) < 1e-9);
  assert.ok(Math.abs(halfway.y - 0) < 1e-9);

  // Exactly at the oldest trail point (20px behind the head).
  const atOldest = game.getTrailPointAtDistance(enemy, 20);
  assert.ok(Math.abs(atOldest.x - 0) < 1e-9);
});

test('getTrailPointAtDistance returns the oldest point when asked for more distance than the trail has', () => {
  const game = loadGameContext();
  const enemy = { x: 5, y: 0, trail: [{ x: 0, y: 0 }] };
  const result = game.getTrailPointAtDistance(enemy, 1000);
  assert.deepEqual(result, { x: 0, y: 0 });
});

test('a segmented-family enemy that walks around a corner leaves a trail that actually bends, not a straight line', () => {
  const game = loadGameContext();
  game.MILLIPEDE_FAMILY_KEYS.add('testSegmentedBug'); // simulates a future type opting in
  game.spawnWave([
    { enemyKey: 'testSegmentedBug', name: 'Test Segmented Bug', color: '#000', radius: 7, count: 1, health: 60, speedMultiplier: 1, isBoss: false, bounty: 30 },
  ]);
  const [enemy] = game.getActiveEnemies();
  enemy.spawned = true;
  enemy.x = 215; // just before the path's first corner at (220, 80) -> (220, 300)
  enemy.y = 80;
  enemy.waypointIndex = 0;

  for (let i = 0; i < 180; i += 1) game.updateEnemies(1 / 60); // walk well past the corner

  // The trail should contain points from both the horizontal approach
  // (y ~ 80) and the vertical departure (x ~ 220) — i.e. it actually
  // curls around the corner instead of being a single straight run.
  const nearHorizontal = enemy.trail.some((p) => Math.abs(p.y - 80) < 2);
  const nearVertical = enemy.trail.some((p) => Math.abs(p.x - 220) < 2 && p.y > 85);
  assert.ok(nearHorizontal, 'expected some trail points still on the horizontal approach');
  assert.ok(nearVertical, 'expected some trail points on the vertical departure past the corner');
});
