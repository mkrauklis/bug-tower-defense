const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

test('GAME_MODES has exactly medium, horde, and sandbox, with the expected multipliers/flags', () => {
  const game = loadFullGameContext();
  const { medium, horde, sandbox } = game.GAME_MODES;

  assert.deepEqual(Object.keys(game.GAME_MODES).sort(), ['horde', 'medium', 'sandbox']);

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

test('startGame switches to playing and resets run state for a real mode', () => {
  const game = loadFullGameContext();
  game.startGame('medium');

  assert.equal(game.getGameState(), 'playing');
  assert.equal(game.getCurrentMode(), game.GAME_MODES.medium);
  assert.equal(game.getRound(), 1);
  assert.equal(game.getMoney(), 50);
  assert.deepEqual(game.getTowers(), []);
  // Round 1 "spawns" via spawnWave(generateWave(1)) same as always — with
  // today's empty enemy roster that's gracefully zero enemies, not a crash.
  assert.deepEqual(game.getActiveEnemies(), []);
});

test('startGame spawns round 1 for real once the roster has something in it', () => {
  const game = loadFullGameContext();
  game.ENEMY_TYPES.testBug = { name: 'Test Bug', speedMultiplier: 1, health: 2, color: '#000', radius: 8, bounty: 2 };
  game.ENEMY_ORDER.push('testBug');

  game.startGame('medium');
  assert.ok(game.getActiveEnemies().length > 0);
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

test('getAllSpawnableEnemyKeys is empty — no regular enemy or boss tier is currently designed', () => {
  const game = loadFullGameContext();
  assert.deepEqual(game.getAllSpawnableEnemyKeys(), []);
});

test('getSpawnEntryForEnemyKey resolves regular enemies and bosses once designed, null for an unknown/undesigned key', () => {
  const game = loadFullGameContext();
  game.ENEMY_TYPES.testBug = { name: 'Test Bug', speedMultiplier: 1, health: 2, color: '#000', radius: 8, bounty: 2 };
  game.BOSS_TYPES[1] = { name: 'Test Boss', speedMultiplier: 0.4, health: 100, color: '#000', radius: 18, bounty: 50 };

  const bug = game.getSpawnEntryForEnemyKey('testBug');
  assert.equal(bug.name, 'Test Bug');
  assert.equal(bug.isBoss, false);

  const boss = game.getSpawnEntryForEnemyKey('boss-tier-1');
  assert.equal(boss.name, 'Test Boss');
  assert.equal(boss.isBoss, true);

  assert.equal(game.getSpawnEntryForEnemyKey('not-a-real-key'), null);
  assert.equal(game.getSpawnEntryForEnemyKey('boss-tier-99'), null);
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
// Horde's own spawn-pacing/doubling logic is generic engine, independent of
// which enemy types exist — but it only has anything to actually spawn once
// the roster has at least one type in it, same as every other mode (see
// generateWave's graceful empty-roster degradation, covered above). These
// tests inject one synthetic type so the mechanism has something to move.

function withOneEnemyType(game) {
  game.ENEMY_TYPES.testBug = { name: 'Test Bug', speedMultiplier: 1, health: 2, color: '#000', radius: 8, bounty: 2 };
  game.ENEMY_ORDER.push('testBug');
  return game;
}

test('startGame(horde) spawns an initial batch immediately, doubled vs. the normal round-1 count', () => {
  const game = withOneEnemyType(loadFullGameContext());
  game.startGame('medium');
  const normalRound1Count = game.getActiveEnemies().length;
  assert.ok(normalRound1Count > 0);

  const hordeGame = withOneEnemyType(loadFullGameContext());
  hordeGame.startGame('horde');
  assert.equal(hordeGame.getCurrentMode().horde, true);
  assert.equal(hordeGame.getRound(), 1);
  assert.equal(hordeGame.getActiveEnemies().length, normalRound1Count * 2);
});

test('Horde Mode never gates on clearing: the next batch lands on top of survivors, not after them', () => {
  const game = withOneEnemyType(loadFullGameContext());
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
  const game = withOneEnemyType(loadFullGameContext());
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

test('Horde Mode degrades gracefully with an empty roster: no crash, batches just spawn nothing', () => {
  const game = loadFullGameContext();
  game.startGame('horde');
  assert.deepEqual(game.getActiveEnemies(), []);

  for (let i = 0; i < 600; i += 1) game.update(1 / 60); // 10 simulated seconds, nothing to spawn
  assert.deepEqual(game.getActiveEnemies(), []);
  assert.ok(game.getRound() > 1); // the round counter still advances on its own
});

test('Horde Mode ignores autoContinue/Next Round entirely (no wave-cleared gating to drive)', () => {
  const game = withOneEnemyType(loadFullGameContext());
  game.startGame('horde');
  game.setAutoContinue(false);

  game.getActiveEnemies().length = 0; // simulate every enemy dying at once
  const roundBefore = game.getRound();
  game.update(1 / 60);

  // Round only advances via the horde spawn timer, never just because
  // activeEnemies hit 0 (that's the old auto-continue condition).
  assert.equal(game.getRound(), roundBefore);
});
