const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

test('GAME_MODES has exactly medium, horde, sandbox, and adventure, with the expected multipliers/flags', () => {
  const game = loadFullGameContext();
  const { medium, horde, sandbox } = game.GAME_MODES;

  // adventure (The Hollow Event / "Adventures," direct request relayed
  // from the peer session) joined this list later — see
  // test/the-hollow-event.test.js for its own dedicated coverage (its
  // round cap, exclusion from MENU_MODE_ORDER, etc.); this test only
  // needed its own key added to the exact-member-list assertion below.
  assert.deepEqual(Object.keys(game.GAME_MODES).sort(), ['adventure', 'horde', 'medium', 'sandbox']);

  assert.deepEqual(
    { health: medium.healthMultiplier, speed: medium.speedMultiplier, bounty: medium.bountyMultiplier, sandbox: medium.sandbox, horde: medium.horde },
    { health: 1, speed: 1, bounty: 1, sandbox: false, horde: false }
  );
  assert.deepEqual(
    { health: horde.healthMultiplier, speed: horde.speedMultiplier, bounty: horde.bountyMultiplier, sandbox: horde.sandbox, horde: horde.horde },
    { health: 1, speed: 1, bounty: 1, sandbox: false, horde: true }
  );
  assert.deepEqual(
    { health: sandbox.healthMultiplier, speed: sandbox.speedMultiplier, bounty: sandbox.bountyMultiplier, sandbox: sandbox.sandbox, horde: sandbox.horde },
    { health: 1, speed: 1, bounty: 1, sandbox: true, horde: false }
  );
});

test('the game boots into the menu, not straight into gameplay', () => {
  const game = loadFullGameContext();
  assert.equal(game.getGameState(), 'menu');
  assert.equal(game.getCurrentMode(), null);
  assert.deepEqual(game.getActiveEnemies(), []); // no auto-spawned wave before a mode is chosen
});

test('startGame switches to playing, resets run state, and spawns round 1 (Deep Forest\'s Ant) for a real mode', () => {
  const game = loadFullGameContext();
  game.startGame('medium');

  assert.equal(game.getGameState(), 'playing');
  assert.equal(game.getCurrentMode(), game.GAME_MODES.medium);
  assert.equal(game.getRound(), 1);
  assert.equal(game.getMoney(), 50);
  assert.deepEqual(game.getTowers(), []);
  assert.ok(game.getActiveEnemies().length > 0);
  assert.equal(game.getActiveEnemies()[0].enemyKey, 'ant'); // Deep Forest is the default active map
});

test('startGame(sandbox) spawns nothing automatically', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');

  assert.equal(game.getCurrentMode().sandbox, true);
  assert.deepEqual(game.getActiveEnemies(), []);
});

test('applyModeToWaveComposition is a no-op under Medium (all multipliers are 1)', () => {
  const game = loadFullGameContext();
  const fakeComposition = [{ enemyKey: 'ant', health: 100, speedMultiplier: 0.5, count: 3 }];

  game.startGame('medium');
  const result = game.applyModeToWaveComposition(fakeComposition)[0];
  assert.equal(result.health, 100);
  assert.equal(result.speedMultiplier, 0.5);
  assert.equal(result.count, 3);
});

test('applyModeToWaveComposition never rounds health down to 0', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  const result = game.applyModeToWaveComposition([{ health: 1, speedMultiplier: 1 }])[0];
  assert.ok(result.health >= 1);
});

// Armored beetles (direct request) appear in this list too — between the
// roster's own types and its boss keys, same position
// generateWave()/getUnlockedEnemyTypes() build them in — but only on
// terrains whose own native roster already has a beetle-family enemy
// (Deep Forest included, Marshland not — see ARMORED_BEETLE_TERRAINS'
// own comment in enemies.js, narrowed from "every map" by a later direct
// request relayed from the peer session). See armor-mechanic.test.js for
// dedicated coverage of that mechanic; these two just confirm the per-map
// roster listing itself still works with them folded in (or correctly
// left out).
const ARMORED_BEETLE_KEYS = ['carapaceBeetle', 'ironshellBeetle', 'titanBeetle'];

// Snakes (direct request) are Deep Forest's own tier-3 roster, so they
// only appear in that map's own listing, between its tier-2 types and the
// shared armored beetles — same "roster.orderTier3" slot every other map's
// (currently-empty) tier-3 list already had room for.
const DEEP_FOREST_SNAKE_KEYS = ['gardenerSnake', 'bananaSnake', 'armoredSnake', 'anaconda'];

test('getAllSpawnableEnemyKeys lists the active map\'s own roster — Deep Forest by default', () => {
  const game = loadFullGameContext();
  assert.deepEqual(game.getAllSpawnableEnemyKeys(), [
    'ant', 'fireAnt', 'armoredAnt',
    'babyBeetle', 'dungBeetle', 'tigerBeetle',
    ...DEEP_FOREST_SNAKE_KEYS,
    ...ARMORED_BEETLE_KEYS,
    'forest-boss-tier-1', 'forest-boss-tier-2',
  ]);
});

test('getAllSpawnableEnemyKeys switches to Marshland\'s roster once that\'s the active map, with no armored beetles (Marshland has no native beetle enemy of its own)', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  assert.deepEqual(game.getAllSpawnableEnemyKeys(), [
    'tadpole', 'froglet', 'frogLarva',
    'appleSnail', 'slug', 'assassinSnail',
    'piranha', 'arowana', 'redtailCatfish',
    'marsh-boss-tier-1', 'marsh-boss-tier-2', 'marsh-boss-tier-3',
  ]);
});

test('getSpawnEntryForEnemyKey resolves the active map\'s own regular enemies and bosses, null for an unknown key', () => {
  const game = loadFullGameContext();

  const ant = game.getSpawnEntryForEnemyKey('ant');
  assert.equal(ant.name, 'Ant');
  assert.equal(ant.isBoss, false);

  const queen = game.getSpawnEntryForEnemyKey('forest-boss-tier-1');
  assert.equal(queen.name, 'Queen Ant');
  assert.equal(queen.isBoss, true);

  assert.equal(game.getSpawnEntryForEnemyKey('not-a-real-key'), null);
  assert.equal(game.getSpawnEntryForEnemyKey('forest-boss-tier-99'), null);
  // Marshland's own boss key isn't resolvable while Deep Forest is active —
  // the terrain prefix is exactly what keeps the two maps' rosters apart.
  assert.equal(game.getSpawnEntryForEnemyKey('marsh-boss-tier-1'), null);
});

test('spawnSingleEnemy appends one enemy without clearing what\'s already alive', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');

  const antEntry = { enemyKey: 'ant', name: 'Ant', color: '#000', radius: 8, health: 2, speedMultiplier: 1, isBoss: false, bounty: 2 };
  const wormEntry = { enemyKey: 'worm', name: 'Worm', color: '#000', radius: 10, health: 10, speedMultiplier: 0.6, isBoss: false, bounty: 5 };

  game.spawnSingleEnemy(antEntry);
  assert.equal(game.getActiveEnemies().length, 1);

  game.spawnSingleEnemy(wormEntry);
  assert.equal(game.getActiveEnemies().length, 2); // appended, not replaced
  assert.deepEqual(
    game.getActiveEnemies().map((e) => e.enemyKey).sort(),
    ['ant', 'worm']
  );
});

test('spawnSingleEnemy spawns immediately, no stagger delay', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.spawnSingleEnemy({ enemyKey: 'ant', name: 'Ant', color: '#000', radius: 8, health: 2, speedMultiplier: 1, isBoss: false, bounty: 2 });
  assert.equal(game.getActiveEnemies()[0].spawnDelay, 0);
});

test('defeated-enemy tracking: recording is idempotent and only happens for real kills', () => {
  const game = loadFullGameContext();
  assert.deepEqual(game.getDefeatedEnemyKeys(), []);

  game.recordDefeatedEnemy('ant');
  assert.deepEqual(game.getDefeatedEnemyKeys(), ['ant']);

  game.recordDefeatedEnemy('ant'); // no duplicate
  assert.deepEqual(game.getDefeatedEnemyKeys(), ['ant']);

  game.recordDefeatedEnemy('worm');
  assert.deepEqual(game.getDefeatedEnemyKeys().sort(), ['ant', 'worm']);
});

test('defeated-enemy set persists across sessions via the shared localStorage backing store', () => {
  const sharedStore = {};

  const sessionOne = loadFullGameContext({ localStorageStore: sharedStore });
  sessionOne.recordDefeatedEnemy('tinyIsopod');

  // A brand-new context, standing in for a fresh page load — should pick
  // up what the previous "session" persisted, via the same backing store.
  const sessionTwo = loadFullGameContext({ localStorageStore: sharedStore });
  assert.deepEqual(sessionTwo.getDefeatedEnemyKeys(), ['tinyIsopod']);
});

test('a kill in a real mode pays the bounty and records the enemy as defeated', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  const moneyBefore = game.getMoney();

  game.getActiveEnemies().length = 0; // clear round 1's auto-spawned wave
  game.getActiveEnemies().push({
    enemyKey: 'worm', name: 'Worm', color: '#000', radius: 10,
    maxHealth: 1, health: -1, speed: 0, isBoss: false, bounty: 10,
    waypointIndex: 0, spawnDelay: 0, spawned: true, x: 0, y: 0, immobilizedRemaining: 0,
  });

  game.update(1 / 60);

  assert.equal(game.getMoney(), moneyBefore + 10);
  assert.ok(game.getDefeatedEnemyKeys().includes('worm'));
});

test('a kill in Sandbox still pays its bounty but is never recorded as defeated', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  const moneyBefore = game.getMoney();

  game.spawnSingleEnemy({ enemyKey: 'fly', name: 'Fly', color: '#000', radius: 6, health: 3, speedMultiplier: 1, isBoss: false, bounty: 2 });
  game.getActiveEnemies()[0].health = -1;

  game.update(1 / 60);

  assert.equal(game.getMoney(), moneyBefore + 2); // normal economy still active in Sandbox
  assert.ok(!game.getDefeatedEnemyKeys().includes('fly')); // but it doesn't unlock itself
});

// --- Horde Mode ---------------------------------------------------------
// Horde's own spawn-pacing/doubling logic is generic engine, independent
// of which enemy types exist — exercised here against Deep Forest's real
// roster (the default active map), same as every other mode.

test('startGame(horde) spawns an initial batch immediately, doubled vs. the normal round-1 count', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  const normalRound1Count = game.getActiveEnemies().length;
  assert.ok(normalRound1Count > 0);

  const hordeGame = loadFullGameContext();
  hordeGame.startGame('horde');
  assert.equal(hordeGame.getCurrentMode().horde, true);
  assert.equal(hordeGame.getRound(), 1);
  assert.equal(hordeGame.getActiveEnemies().length, normalRound1Count * 2);
});

test('Horde Mode never gates on clearing: the next batch lands on top of survivors, not after them', () => {
  const game = loadFullGameContext();
  game.startGame('horde');
  const firstBatchCount = game.getActiveEnemies().length;
  assert.ok(firstBatchCount > 0);

  // Run well past the first batch's own spawn-stagger duration without
  // killing anything — a real wave-gated mode would just sit idle here.
  for (let i = 0; i < 600; i += 1) game.update(1 / 60); // 10 simulated seconds

  assert.ok(game.getActiveEnemies().length > firstBatchCount); // a second batch landed on top
  assert.ok(game.getRound() > 1); // the round counter advanced with it
});

test('Horde Mode keeps spawning with zero gap: the spawn timer never sits idle at exactly 0 between batches', () => {
  const game = loadFullGameContext();
  game.startGame('horde');

  let sawPositiveAfterHittingZero = false;
  for (let i = 0; i < 300; i += 1) {
    game.update(1 / 60);
    if (game.getHordeSpawnTimer() > 0) sawPositiveAfterHittingZero = true;
  }
  // The timer should be actively counting back up (a new batch queued),
  // not stuck at/below 0 waiting on something — if it were stuck, this
  // would stay false since it'd never tick positive again mid-run.
  assert.ok(sawPositiveAfterHittingZero);
});

test('Horde Mode ignores autoContinue/Next Round entirely (no wave-cleared gating to drive)', () => {
  const game = loadFullGameContext();
  game.startGame('horde');
  game.setAutoContinue(false);

  game.getActiveEnemies().length = 0; // simulate every enemy dying at once
  const roundBefore = game.getRound();
  game.update(1 / 60);

  // Round only advances via the horde spawn timer, never just because
  // activeEnemies hit 0 (that's the old auto-continue condition).
  assert.equal(game.getRound(), roundBefore);
});
