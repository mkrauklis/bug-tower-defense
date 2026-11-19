const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Builds a fixture enemy already sitting at the path's final waypoint
// (health > 0, not a zombie) — the shape updateEnemies()'s leaked-enemy
// detection looks for, without needing to actually walk it there.
function makeArrivedEnemy(overrides = {}) {
  return {
    enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8,
    maxHealth: 40, health: 25, speed: 0, isBoss: false, bounty: 5,
    waypointIndex: 7, // MAP_PATH_WAYPOINTS (Deep Forest) has 8 points, so index 7 is the last
    spawnDelay: 0, spawned: true, x: 980, y: 180, immobilizedRemaining: 0,
    isZombie: false, markedForRemoval: false, zombieExplosionDamage: 0,
    ...overrides,
  };
}

test('startGame resets playerHealth to PLAYER_STARTING_HEALTH (500)', () => {
  const game = loadFullGameContext();
  game.setPlayerHealth(1);
  game.startGame('medium');
  assert.equal(game.getPlayerHealth(), game.PLAYER_STARTING_HEALTH);
  assert.equal(game.PLAYER_STARTING_HEALTH, 500);
});

test('an enemy that leaks costs the player its own max HP, not its remaining HP', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  game.setPlayerHealth(500);

  game.getActiveEnemies().length = 0;
  game.getActiveEnemies().push(makeArrivedEnemy({ maxHealth: 40, health: 3 })); // badly hurt, but not dead

  game.update(1 / 60);

  assert.equal(game.getPlayerHealth(), 460); // 500 - 40 (max HP), not 500 - 3
});

test('multiple enemies leaking in the same tick all count', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  game.setPlayerHealth(500);

  game.getActiveEnemies().length = 0;
  game.getActiveEnemies().push(makeArrivedEnemy({ maxHealth: 40 }), makeArrivedEnemy({ maxHealth: 60 }));

  game.update(1 / 60);

  assert.equal(game.getPlayerHealth(), 400); // 500 - 40 - 60
});

test('a killed enemy (not leaked) costs no health', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  game.setPlayerHealth(500);

  game.getActiveEnemies().length = 0;
  game.getActiveEnemies().push(makeArrivedEnemy({ maxHealth: 40, health: -1 })); // already dead this tick

  game.update(1 / 60);

  assert.equal(game.getPlayerHealth(), 500); // a kill, not a leak — no damage
});

test('Sandbox never tracks health loss, even when enemies leak', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  assert.equal(game.getPlayerHealth(), game.PLAYER_STARTING_HEALTH);

  game.getActiveEnemies().length = 0;
  game.getActiveEnemies().push(makeArrivedEnemy({ maxHealth: 999 }));
  game.update(1 / 60);

  assert.equal(game.getPlayerHealth(), game.PLAYER_STARTING_HEALTH);
});

test('health never goes negative — clamped at 0', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  game.setPlayerHealth(10);

  game.getActiveEnemies().length = 0;
  game.getActiveEnemies().push(makeArrivedEnemy({ maxHealth: 999 }));
  game.update(1 / 60);

  assert.equal(game.getPlayerHealth(), 0);
});

test('health hitting 0 triggers Game Over', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  game.setPlayerHealth(10);

  game.getActiveEnemies().length = 0;
  game.getActiveEnemies().push(makeArrivedEnemy({ maxHealth: 10 }));
  game.update(1 / 60);

  assert.equal(game.getPlayerHealth(), 0);
  assert.equal(game.getGameState(), 'gameOver');
});

test('triggerGameOver snapshots the round and mode name at the moment the run ended', () => {
  const game = loadFullGameContext();
  game.startGame('horde');
  // Advance a bit so round isn't just 1, matching a real mid-run loss.
  for (let i = 0; i < 300; i += 1) game.update(1 / 60);
  const roundAtLoss = game.getRound();

  game.triggerGameOver();

  assert.equal(game.getGameState(), 'gameOver');
  assert.deepEqual(game.getGameOverStats(), { round: roundAtLoss, modeName: 'Horde Mode' });
});
