const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod',
    name: 'Tiny Isopod',
    color: '#78909c',
    radius: 12,
    maxHealth: 10000,
    health: 10000,
    speed: 30,
    isBoss: false,
    bounty: 10,
    waypointIndex: 0,
    spawnDelay: 0,
    spawned: true,
    x: 0,
    y: 0,
    immobilizedRemaining: 0,
    isZombie: false,
    markedForRemoval: false,
    zombieExplosionDamage: 0,
    ...overrides,
  };
}

function makeZombifyMushroom(game, chance) {
  const tower = game.createTower('mushroom');
  for (let i = 0; i < 2; i += 1) game.purchaseUpgrade(tower, 0); // Decay, Zombify
  tower.zombifyChance = chance; // override for a deterministic test
  return tower;
}

test('a spore killing blow with a 100% zombify chance turns the enemy into a zombie instead of killing it', () => {
  const game = loadFullGameContext();
  const tower = makeZombifyMushroom(game, 1);
  tower.x = 0;
  tower.y = 0;

  const target = makeTestEnemy({ x: 100, y: 0, health: 1 }); // one hit from dying
  game.getActiveEnemies().push(target);

  game.spawnProjectile(tower, target);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60); // let the spore travel and land

  assert.equal(target.isZombie, true);
  assert.ok(target.health > 0); // alive again — immune to the normal kill sweep
  assert.equal(target.zombieExplosionDamage, tower.zombieExplosionDamage);
});

test('a kill via Zombify never shows up as a bounty-eligible kill or gets removed as "dead"', () => {
  const game = loadFullGameContext();
  const tower = makeZombifyMushroom(game, 1);
  tower.x = 0;
  tower.y = 0;

  const target = makeTestEnemy({ x: 100, y: 0, health: 1 });
  game.getActiveEnemies().push(target);
  game.spawnProjectile(tower, target);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  const killed = game.updateEnemies(1 / 60);
  assert.equal(killed.length, 0); // the zombie is not a "kill"
  assert.equal(game.getActiveEnemies().includes(target), true); // still in the world, just as a zombie
});

test('bosses are never zombified, even at a 100% chance', () => {
  const game = loadFullGameContext();
  const tower = makeZombifyMushroom(game, 1);
  tower.x = 0;
  tower.y = 0;

  const boss = makeTestEnemy({ x: 100, y: 0, health: 1, isBoss: true });
  game.getActiveEnemies().push(boss);
  game.spawnProjectile(tower, boss);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(boss.isZombie, false);
  assert.ok(boss.health <= 0); // just a normal kill
});

test('a 0% zombify chance (Decay only, no Zombify bought) never turns anything into a zombie', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('mushroom');
  game.purchaseUpgrade(tower, 0); // Decay only
  tower.x = 0;
  tower.y = 0;

  const target = makeTestEnemy({ x: 100, y: 0, health: 1 });
  game.getActiveEnemies().push(target);
  game.spawnProjectile(tower, target);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.isZombie, false);
  assert.ok(target.health <= 0); // a normal kill instead
});

test('a non-killing spore hit never rolls zombify, even at 100% chance', () => {
  const game = loadFullGameContext();
  const tower = makeZombifyMushroom(game, 1);
  tower.x = 0;
  tower.y = 0;

  const target = makeTestEnemy({ x: 100, y: 0, health: 10000 }); // the spore's hit won't kill it
  game.getActiveEnemies().push(target);
  game.spawnProjectile(tower, target);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.isZombie, false);
});

test('a zombie is excluded from tower targeting (findNearestEnemyInRange / getEnemiesInRadius)', () => {
  const game = loadFullGameContext();
  const zombie = makeTestEnemy({ x: 0, y: 0, isZombie: true });
  game.getActiveEnemies().push(zombie);

  assert.equal(game.findNearestEnemyInRange(0, 0, 100), null);
  assert.deepEqual(game.getEnemiesInRadius(0, 0, 100), []);
});

test('a zombie walks backward (decreasing waypointIndex) instead of forward', () => {
  const game = loadFullGameContext();
  const zombie = makeTestEnemy({
    x: 220, y: 150, waypointIndex: 0, isZombie: true, speed: 60,
  });
  game.getActiveEnemies().push(zombie);
  const startY = zombie.y;

  game.updateEnemies(0.1); // enemy.speed 60 * 0.1s = 6px toward waypoint 0 (220, 80), i.e. upward

  assert.ok(zombie.y < startY); // moved toward the start (up), not forward along the path
});

test('a zombie that collides with a living enemy explodes, damaging it and removing itself (no bounty)', () => {
  const game = loadFullGameContext();
  const zombie = makeTestEnemy({
    x: 50, y: 0, waypointIndex: 5, isZombie: true, speed: 0, zombieExplosionDamage: 7,
  });
  const victim = makeTestEnemy({ x: 50, y: 0, health: 100 }); // standing right where the zombie already is
  game.getActiveEnemies().push(zombie, victim);

  const killed = game.updateEnemies(1 / 60);

  assert.equal(victim.health, 93); // took the explosion damage
  assert.equal(killed.length, 0); // not a bounty-eligible kill
  assert.equal(game.getActiveEnemies().includes(zombie), false); // zombie removed
  assert.equal(game.getActiveEnemies().includes(victim), true); // victim survives (93 hp left)
});

test('a zombie that reaches the path\'s start is removed without exploding on anything', () => {
  const game = loadFullGameContext();
  // Right at the very start, one tiny step from walking off the front.
  const zombie = makeTestEnemy({ x: -19, y: 80, waypointIndex: 0, isZombie: true, speed: 60 });
  game.getActiveEnemies().push(zombie);

  game.updateEnemies(1); // a full second — plenty to walk the last 1px and go negative

  assert.equal(game.getActiveEnemies().includes(zombie), false);
});
