const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Savanah's Sandworm/Desert Termite tunneling trait: a periodic cooldown
// (tunnelInterval seconds) that starts a tunneledRemaining countdown
// (tunnelDuration seconds), during which the enemy keeps moving (my
// design call — a worm/termite burrowing toward the goal reads more
// thematic than freezing mid-path) but is completely untargetable. The
// trait is plain per-type data (tunnelInterval/tunnelDuration on the
// roster entry, threaded through generateWave()/getSpawnEntryForEnemyKey()
// into the spawned entry), not hardcoded to Sandworm/Desert Termite
// specifically — these tests simulate a plain testBug opting in, the same
// "any future type can opt into this" pattern enemies.test.js's own
// MILLIPEDE_FAMILY_KEYS tests already use for the trail-following trait.

function spawnTunneler(game, overrides = {}) {
  game.spawnWave([
    {
      enemyKey: 'testBug',
      name: 'Test Bug',
      color: '#000',
      radius: 8,
      count: 1,
      health: 1000,
      speedMultiplier: 1,
      isBoss: false,
      bounty: 2,
      tunnelInterval: 3,
      tunnelDuration: 2,
      ...overrides,
    },
  ]);
  const [enemy] = game.getActiveEnemies();
  enemy.spawned = true;
  return enemy;
}

test('a tunneling type starts surfaced, with its cooldown primed to the type\'s own interval', () => {
  const game = loadGameContext();
  const enemy = spawnTunneler(game);
  assert.equal(enemy.tunneledRemaining, 0);
  assert.equal(enemy.tunnelCooldown, 3);
  assert.equal(enemy.tunnelInterval, 3);
  assert.equal(enemy.tunnelDuration, 2);
});

test('a non-tunneling type never sets tunnel fields and is never excluded from targeting by them', () => {
  const game = loadGameContext();
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  assert.equal(enemy.tunnelInterval, 0);
  assert.equal(enemy.tunnelDuration, 0);
  assert.equal(enemy.tunneledRemaining, 0);

  // updateEnemies should never touch tunnel state for a non-tunneler.
  enemy.spawned = true;
  enemy.x = 0;
  enemy.y = 0;
  game.updateEnemies(10); // well past any tunnelInterval, if it had one
  assert.equal(enemy.tunneledRemaining, 0);
});

test('the enemy tunnels (goes untargetable) once tunnelInterval seconds have elapsed', () => {
  const game = loadGameContext();
  const enemy = spawnTunneler(game);
  enemy.x = 0;
  enemy.y = 0;

  game.updateEnemies(2.9); // just under the 3s interval
  assert.equal(enemy.tunneledRemaining, 0);

  game.updateEnemies(0.2); // crosses the 3s mark
  assert.equal(enemy.tunneledRemaining, 2); // the full tunnelDuration, just started
});

test('a tunneled enemy is excluded from findNearestEnemyInRange and getEnemiesInRadius — genuinely untargetable', () => {
  const game = loadGameContext();
  const enemy = spawnTunneler(game);
  enemy.x = 0;
  enemy.y = 0;
  enemy.tunneledRemaining = 1.5; // mid-dive

  assert.equal(game.findNearestEnemyInRange(0, 0, 100), null);
  assert.deepEqual(game.getEnemiesInRadius(0, 0, 100), []);
});

test('a tunneled enemy keeps moving underground (my design call), unlike immobilize/infect which freeze it', () => {
  const game = loadGameContext();
  const enemy = spawnTunneler(game);
  enemy.x = 0;
  enemy.y = 0;
  enemy.waypointIndex = 0;
  enemy.tunneledRemaining = 1.5;

  game.updateEnemies(0.1); // 1 * 60px/s -> 6px this tick

  assert.notEqual(enemy.x, 0); // it moved despite being tunneled
  assert.ok(enemy.tunneledRemaining < 1.5); // and its tunnel clock still ran down
});

test('the enemy resurfaces (becomes targetable again) once tunnelDuration elapses', () => {
  const game = loadGameContext();
  const enemy = spawnTunneler(game);
  enemy.x = 0;
  enemy.y = 0;
  enemy.tunneledRemaining = 0.1;

  game.updateEnemies(0.2); // crosses back to surfaced

  assert.equal(enemy.tunneledRemaining, 0);
  assert.equal(game.findNearestEnemyInRange(0, 0, 100), enemy);
});

test('a stun (immobilize/infect) still freezes a tunneling enemy\'s movement even while it keeps tunneling on schedule', () => {
  const game = loadGameContext();
  const enemy = spawnTunneler(game);
  enemy.x = 0;
  enemy.y = 0;
  enemy.waypointIndex = 0;
  enemy.infectedRemaining = 5; // Mushroom Infect Path stun landed before it tunneled

  game.updateEnemies(3.1); // crosses the 3s tunnel interval

  assert.equal(enemy.x, 0); // never moved — the stun's movement-block wins
  assert.equal(enemy.y, 0);
  assert.ok(enemy.tunneledRemaining > 0); // but it still tunneled on schedule underneath the stun
  assert.ok(enemy.infectedRemaining < 5); // and the stun itself still ticked down normally
});

test('tunneling cycles repeatedly: surface -> tunnel -> surface -> tunnel again', () => {
  const game = loadGameContext();
  const enemy = spawnTunneler(game);
  enemy.x = 0;
  enemy.y = 0;

  game.updateEnemies(3); // first tunnel event fires
  assert.equal(enemy.tunneledRemaining, 2);

  game.updateEnemies(2); // fully resurfaces
  assert.equal(enemy.tunneledRemaining, 0);

  game.updateEnemies(3); // next cycle's interval elapses (cooldown was reset to 3 on the first dive)
  assert.equal(enemy.tunneledRemaining, 2); // tunnels again
});
