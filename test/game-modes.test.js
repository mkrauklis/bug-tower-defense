const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

test('GAME_MODES has the exact multipliers specified for each mode', () => {
  const game = loadFullGameContext();
  const { easy, medium, hard, sandbox } = game.GAME_MODES;

  assert.deepEqual(
    { health: easy.healthMultiplier, speed: easy.speedMultiplier, bounty: easy.bountyMultiplier, sandbox: easy.sandbox },
    { health: 0.85, speed: 0.85, bounty: 1.1, sandbox: false }
  );
  assert.deepEqual(
    { health: medium.healthMultiplier, speed: medium.speedMultiplier, bounty: medium.bountyMultiplier, sandbox: medium.sandbox },
    { health: 1, speed: 1, bounty: 1, sandbox: false }
  );
  assert.deepEqual(
    { health: hard.healthMultiplier, speed: hard.speedMultiplier, bounty: hard.bountyMultiplier, sandbox: hard.sandbox },
    { health: 1, speed: 1.2, bounty: 1, sandbox: false }
  );
  assert.deepEqual(
    { health: sandbox.healthMultiplier, speed: sandbox.speedMultiplier, bounty: sandbox.bountyMultiplier, sandbox: sandbox.sandbox },
    { health: 1, speed: 1, bounty: 1, sandbox: true }
  );
});

test('the game boots into the menu, not straight into gameplay', () => {
  const game = loadFullGameContext();
  assert.equal(game.getGameState(), 'menu');
  assert.equal(game.getCurrentMode(), null);
  assert.deepEqual(game.getActiveEnemies(), []); // no auto-spawned wave before a mode is chosen
});

test('startGame switches to playing, resets run state, and spawns round 1 for a real mode', () => {
  const game = loadFullGameContext();
  game.startGame('medium');

  assert.equal(game.getGameState(), 'playing');
  assert.equal(game.getCurrentMode(), game.GAME_MODES.medium);
  assert.equal(game.getRound(), 1);
  assert.equal(game.getMoney(), 50);
  assert.deepEqual(game.getTowers(), []);
  assert.ok(game.getActiveEnemies().length > 0); // round 1 spawned automatically
});

test('startGame(sandbox) spawns nothing automatically', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');

  assert.equal(game.getCurrentMode().sandbox, true);
  assert.deepEqual(game.getActiveEnemies(), []);
});

test('applyModeToWaveComposition scales health and speed by the active mode, rounding health', () => {
  const game = loadFullGameContext();
  const fakeComposition = [{ enemyKey: 'ant', health: 100, speedMultiplier: 0.5, count: 3 }];

  game.startGame('easy');
  const easyResult = game.applyModeToWaveComposition(fakeComposition)[0];
  assert.equal(easyResult.health, 85); // 100 * 0.85
  assert.ok(Math.abs(easyResult.speedMultiplier - 0.425) < 1e-9); // 0.5 * 0.85
  assert.equal(easyResult.count, 3); // untouched

  game.startGame('hard');
  const hardResult = game.applyModeToWaveComposition(fakeComposition)[0];
  assert.equal(hardResult.health, 100); // no health change on Hard
  assert.ok(Math.abs(hardResult.speedMultiplier - 0.6) < 1e-9); // 0.5 * 1.2

  game.startGame('medium');
  const mediumResult = game.applyModeToWaveComposition(fakeComposition)[0];
  assert.equal(mediumResult.health, 100);
  assert.equal(mediumResult.speedMultiplier, 0.5);
});

test('applyModeToWaveComposition never rounds health down to 0', () => {
  const game = loadFullGameContext();
  game.startGame('easy');
  const result = game.applyModeToWaveComposition([{ health: 1, speedMultiplier: 1 }])[0];
  assert.ok(result.health >= 1);
});

test('getAllSpawnableEnemyKeys lists every regular enemy then every boss tier', () => {
  const game = loadFullGameContext();
  assert.deepEqual(game.getAllSpawnableEnemyKeys(), [
    'ant', 'worm', 'tinyIsopod', 'fly',
    'tadpole', 'babyFrog', 'poisonDartFrog',
    'boss-tier-1', 'boss-tier-2',
  ]);
});

test('getSpawnEntryForEnemyKey resolves regular enemies and bosses, or null for an unknown key', () => {
  const game = loadFullGameContext();

  const ant = game.getSpawnEntryForEnemyKey('ant');
  assert.equal(ant.name, 'Ant');
  assert.equal(ant.isBoss, false);

  const beetle = game.getSpawnEntryForEnemyKey('boss-tier-1');
  assert.equal(beetle.name, 'Giant Beetle');
  assert.equal(beetle.isBoss, true);

  assert.equal(game.getSpawnEntryForEnemyKey('not-a-real-key'), null);
  assert.equal(game.getSpawnEntryForEnemyKey('boss-tier-99'), null);
});

test('spawnSingleEnemy appends one enemy without clearing what\'s already alive', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');

  game.spawnSingleEnemy(game.getSpawnEntryForEnemyKey('ant'));
  assert.equal(game.getActiveEnemies().length, 1);

  game.spawnSingleEnemy(game.getSpawnEntryForEnemyKey('worm'));
  assert.equal(game.getActiveEnemies().length, 2); // appended, not replaced
  assert.deepEqual(
    game.getActiveEnemies().map((e) => e.enemyKey).sort(),
    ['ant', 'worm']
  );
});

test('spawnSingleEnemy spawns immediately, no stagger delay', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.spawnSingleEnemy(game.getSpawnEntryForEnemyKey('ant'));
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

test('a kill in a real mode pays the mode-scaled bounty and records the enemy as defeated', () => {
  const game = loadFullGameContext();
  game.startGame('easy'); // bountyMultiplier 1.1
  const moneyBefore = game.getMoney();

  game.getActiveEnemies().length = 0; // clear round 1's auto-spawned wave
  game.getActiveEnemies().push({
    enemyKey: 'worm', name: 'Worm', color: '#000', radius: 10,
    maxHealth: 1, health: -1, speed: 0, isBoss: false, bounty: 10,
    waypointIndex: 0, spawnDelay: 0, spawned: true, x: 0, y: 0, immobilizedRemaining: 0,
  });

  game.update(1 / 60);

  assert.equal(game.getMoney(), moneyBefore + 11); // round(10 * 1.1)
  assert.ok(game.getDefeatedEnemyKeys().includes('worm'));
});

test('a kill in Sandbox still pays its bounty but is never recorded as defeated', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  const moneyBefore = game.getMoney();

  game.spawnSingleEnemy({ ...game.getSpawnEntryForEnemyKey('fly'), bounty: 2 });
  game.getActiveEnemies()[0].health = -1;

  game.update(1 / 60);

  assert.equal(game.getMoney(), moneyBefore + 2); // normal economy still active in Sandbox
  assert.ok(!game.getDefeatedEnemyKeys().includes('fly')); // but it doesn't unlock itself
});
