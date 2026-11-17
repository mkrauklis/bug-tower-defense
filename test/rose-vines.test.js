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
    speed: 0,
    isBoss: false,
    bounty: 10,
    waypointIndex: 0,
    spawnDelay: 0,
    spawned: true,
    x: 0,
    y: 0,
    ...overrides,
  };
}

test('a single vine ticks once a second for its own damage, independent of the base attack', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 0); // Thorns: 1 vine, 2 dmg/hit

  const target = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(target);
  tower.attackCooldown = 999; // suppress the base attack so it doesn't confound the health delta

  game.updateTowerAttack(tower, tower.x, tower.y, tower.vineInterval);

  assert.equal(target.health, 10000 - tower.vineDamage);
});

test('a vine that hits starts its lash-toward-target animation, aimed at the real target angle', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 0); // Thorns: 1 vine

  const target = makeTestEnemy({ x: 0, y: 100 }); // straight "down" from the tower
  game.getActiveEnemies().push(target);
  tower.attackCooldown = 999;

  assert.equal(tower.vineLashes[0].timeRemaining, 0); // idle before any tick

  game.updateTowerAttack(tower, tower.x, tower.y, tower.vineInterval);

  assert.ok(tower.vineLashes[0].timeRemaining > 0);
  assert.ok(Math.abs(tower.vineLashes[0].angle - Math.PI / 2) < 1e-9); // atan2(100, 0) = PI/2 ("down")
});

test('the lash timer decays back to 0 over time and does not go negative', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 0);

  game.getActiveEnemies().push(makeTestEnemy({ x: 50, y: 0 }));
  tower.attackCooldown = 999;

  game.updateTowerAttack(tower, tower.x, tower.y, tower.vineInterval); // triggers the lash
  assert.ok(tower.vineLashes[0].timeRemaining > 0);

  // Advance well past the lash's own (short) duration but short of a full
  // vineInterval, so the vine doesn't fire again and restart the timer.
  for (let i = 0; i < 30; i += 1) game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60); // 0.5s

  assert.equal(tower.vineLashes[0].timeRemaining, 0);
});

test('an idle vine (nothing in range) never starts a lash animation', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 0);
  tower.attackCooldown = 999;
  // No enemies pushed at all.

  game.updateTowerAttack(tower, tower.x, tower.y, tower.vineInterval);

  assert.equal(tower.vineLashes[0].timeRemaining, 0);
});

test('multiple vines can all hit the same single nearby enemy in one tick', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 0); // Thorns (1 vine)
  game.purchaseUpgrade(tower, 0); // Puncture (2 vines total, damage x2)
  tower.attackCooldown = 999;

  const target = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.vineInterval);

  assert.equal(target.health, 10000 - tower.vineCount * tower.vineDamage);
  assert.equal(tower.vineCount, 2);
});

test('vines cannot reach an enemy beyond the vine range (tower range x vineRangeMultiplier)', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  for (let i = 0; i < 3; i += 1) game.purchaseUpgrade(tower, 0); // through Overgrowth: vineRangeMultiplier = 2
  tower.attackCooldown = 999;

  const vineRange = tower.stats.range * tower.vineRangeMultiplier;
  const justOutOfVineRange = makeTestEnemy({ x: vineRange + 10, y: 0 });
  game.getActiveEnemies().push(justOutOfVineRange);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.vineInterval);

  assert.equal(justOutOfVineRange.health, 10000); // untouched
});

test('Overgrowth\'s doubled vine range lets vines hit something the base attack (un-doubled range) cannot', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose');
  tower.x = 0;
  tower.y = 0;
  for (let i = 0; i < 3; i += 1) game.purchaseUpgrade(tower, 0); // vineRangeMultiplier = 2 by Overgrowth
  tower.attackCooldown = 999;

  const beyondBaseRangeButWithinVineRange = makeTestEnemy({ x: tower.stats.range * 1.5, y: 0 });
  game.getActiveEnemies().push(beyondBaseRangeButWithinVineRange);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.vineInterval);

  assert.ok(beyondBaseRangeButWithinVineRange.health < 10000); // the vines reached it
});

test('a tower with no vines never calls into vine logic (vineCount stays 0, no health change)', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('rose'); // no upgrades bought
  tower.x = 0;
  tower.y = 0;
  tower.attackCooldown = 999;

  const target = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, 5); // well past any interval, if vines existed

  assert.equal(target.health, 10000);
});
