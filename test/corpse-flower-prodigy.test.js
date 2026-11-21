const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Amorphophallus titanum (Corpse Flower's own Prodigy, direct request from
// a real reference photo sent directly — "a giant corpse flower... it
// will have a special attack where it blooms and shoots acid at the bugs
// and it will have a gas ring around it", $100,000): the 4th Prodigy,
// filling the gap prodigies.test.js's own "Corpse Flower never gets a
// Prodigy option" test used to document before this landed. Generic
// Prodigy plumbing (getProdigyOption/the prodigy-upgrade transformation/
// same-type destruction/singleton cap) is already covered for every
// Prodigy in prodigies.test.js and needs no special-casing here — this
// file only covers the two mechanics unique to this one: the gas RING
// (distinct from Hazard Path's own filled-disc gasCloud) and the
// multi-target bloom acid attack.

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod', name: 'Tiny Isopod', color: '#78909c', radius: 12,
    maxHealth: 100000, health: 100000, speed: 0, isBoss: false, bounty: 10,
    waypointIndex: 0, spawnDelay: 0, spawned: true, x: 0, y: 0,
    immobilizedRemaining: 0, isZombie: false, isPurpleZombie: false,
    markedForRemoval: false, zombieExplosionDamage: 0, tunneledRemaining: 0,
    ...overrides,
  };
}

test('base stats: 200 damage every 0.4s (500 dps) — the highest base dps of any tower (its own $100,000 cost is covered by prodigies.test.js\'s getProdigyOption check)', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  assert.equal(tower.stats.damage, 200);
  assert.equal(tower.stats.attackInterval, 0.4);
  assert.equal(tower.stats.range, 220);
  assert.equal(tower.attackType, 'projectile'); // no baseAttackType override, same delivery as every base tower
});

test('the gas ring and bloom configs are set straight from TOWER_TYPES, with cooldowns that never fire instantly', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');

  assert.deepEqual(tower.gasRing, { innerRadius: 50, outerRadius: 95, damagePerTick: 8, color: 'rgba(216, 27, 96, 0.4)' });
  assert.equal(tower.gasRingCooldown, game.GAS_CLOUD_TICK_INTERVAL);

  assert.deepEqual(tower.bloom, { interval: 4, damage: 40, targetCount: 3, slowMultiplier: 0.5, slowDuration: 4, color: '#8e24aa' });
  assert.equal(tower.bloomCooldown, tower.bloom.interval);
  assert.equal(tower.bloomProgress, 0);
});

test('every other tower has gasRing/bloom as null, so the `if (tower.gasRing)`/`if (tower.bloom)` gates in updateTowerAttack skip them entirely', () => {
  const game = loadFullGameContext();
  const corpseFlower = game.createTower('corpseFlower');
  assert.equal(corpseFlower.gasRing, null);
  assert.equal(corpseFlower.bloom, null);
});

// --- Gas ring: a genuine ring, not a filled disc -------------------------

test('updateTowerGasRing damages an enemy standing in the band between innerRadius and outerRadius', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;

  const inTheRing = makeTestEnemy({ x: 70, y: 0 }); // between 50 and 95
  game.getActiveEnemies().push(inTheRing);

  game.updateTowerGasRing(tower, tower.x, tower.y, game.GAS_CLOUD_TICK_INTERVAL);

  assert.equal(inTheRing.health, 100000 - tower.gasRing.damagePerTick);
});

test('updateTowerGasRing never damages an enemy standing inside the inner hole, even though it\'s well within range', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;

  const atTheCenter = makeTestEnemy({ x: 10, y: 0 }); // well inside innerRadius (50)
  game.getActiveEnemies().push(atTheCenter);

  game.updateTowerGasRing(tower, tower.x, tower.y, game.GAS_CLOUD_TICK_INTERVAL);

  assert.equal(atTheCenter.health, 100000); // untouched — the hole in the ring
});

test('updateTowerGasRing never damages an enemy standing past the outer edge', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;

  const tooFarOut = makeTestEnemy({ x: 200, y: 0 }); // well past outerRadius (95)
  game.getActiveEnemies().push(tooFarOut);

  game.updateTowerGasRing(tower, tower.x, tower.y, game.GAS_CLOUD_TICK_INTERVAL);

  assert.equal(tooFarOut.health, 100000);
});

test('the gas ring ticks on the same fixed GAS_CLOUD_TICK_INTERVAL cadence as Hazard Path\'s own gasCloud', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;
  const inTheRing = makeTestEnemy({ x: 70, y: 0 });
  game.getActiveEnemies().push(inTheRing);

  game.updateTowerGasRing(tower, tower.x, tower.y, game.GAS_CLOUD_TICK_INTERVAL - 0.001);
  assert.equal(inTheRing.health, 100000); // hasn't ticked yet

  game.updateTowerGasRing(tower, tower.x, tower.y, 0.002); // crosses the threshold
  assert.equal(inTheRing.health, 100000 - tower.gasRing.damagePerTick);
});

// --- The bloom attack: opens, and shoots acid at several bugs at once ----

test('updateTowerBloom does nothing until tower.bloom.interval seconds have passed', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;
  game.getActiveEnemies().push(makeTestEnemy({ x: 50, y: 0 }));

  game.updateTowerBloom(tower, tower.x, tower.y, tower.bloom.interval - 0.001);
  assert.equal(game.getProjectiles().length, 0);
  assert.equal(tower.bloomProgress, 0);
});

test('once the interval is reached, it blooms (bloomProgress opens) and fires acid at up to targetCount of the closest bugs in range', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;

  // 5 bugs in range, at increasing distance — only the 3 closest (bloom.targetCount) should get hit.
  const closest = makeTestEnemy({ x: 10, y: 0 });
  const second = makeTestEnemy({ x: 20, y: 0 });
  const third = makeTestEnemy({ x: 30, y: 0 });
  const fourth = makeTestEnemy({ x: 40, y: 0 });
  const fifth = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(fifth, third, closest, fourth, second); // deliberately out of order

  game.updateTowerBloom(tower, tower.x, tower.y, tower.bloom.interval);

  assert.equal(tower.bloomProgress, game.BLOOM_OPEN_DURATION);
  assert.equal(game.getProjectiles().length, 3);
  const targeted = game.getProjectiles().map((p) => p.target);
  assert.ok(targeted.includes(closest));
  assert.ok(targeted.includes(second));
  assert.ok(targeted.includes(third));
  assert.ok(!targeted.includes(fourth));
  assert.ok(!targeted.includes(fifth));

  game.getProjectiles().forEach((projectile) => {
    assert.equal(projectile.damage, tower.bloom.damage);
    assert.deepEqual(projectile.slow, { multiplier: tower.bloom.slowMultiplier, duration: tower.bloom.slowDuration });
    assert.equal(projectile.shape, 'acid');
    assert.equal(projectile.color, tower.bloom.color);
  });
});

test('bloomProgress counts back down to 0 after the bloom\'s own visual window, independent of the next bloom\'s own cooldown', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;
  game.getActiveEnemies().push(makeTestEnemy({ x: 10, y: 0 }));

  game.updateTowerBloom(tower, tower.x, tower.y, tower.bloom.interval);
  assert.equal(tower.bloomProgress, game.BLOOM_OPEN_DURATION);

  game.updateTowerBloom(tower, tower.x, tower.y, game.BLOOM_OPEN_DURATION);
  assert.equal(tower.bloomProgress, 0);
});

test('a bloom with no bugs anywhere in range fires nothing, but its cooldown still resets (no instant double-fire the next tick)', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;

  game.updateTowerBloom(tower, tower.x, tower.y, tower.bloom.interval);
  assert.equal(game.getProjectiles().length, 0);
  assert.equal(tower.bloomProgress, 0); // never actually opened — nothing to bloom at
  assert.equal(tower.bloomCooldown, tower.bloom.interval); // reset anyway, same convention updateTowerAcidShot already uses
});

test('resolving a bloom acid projectile deals its own damage and applies its own slow debuff to the target', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;

  const enemy = makeTestEnemy({ x: 10, y: 0 });
  game.spawnBloomAcidProjectile(tower, enemy);
  const projectile = game.getProjectiles()[0];
  projectile.target = enemy;
  projectile.aimX = enemy.x;
  projectile.aimY = enemy.y;

  game.resolveProjectile(projectile);
  assert.equal(enemy.health, 100000 - tower.bloom.damage);
  assert.deepEqual(enemy.slow, { multiplier: tower.bloom.slowMultiplier, remaining: tower.bloom.slowDuration });
});

// --- Wired into the normal attack loop, alongside the base attack --------

test('updateTowerAttack drives the gas ring and the bloom on top of (not instead of) the base continuous attack', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('amorphophallusTitanum');
  tower.x = 0;
  tower.y = 0;

  const inTheRing = makeTestEnemy({ x: 70, y: 0 }); // hit by the gas ring only (outside the 220 range? no, 70 < 220, also base-attack target)
  const bloomTarget = makeTestEnemy({ x: 10, y: 0 }); // closest bug — base attack's own target and the bloom's own target
  game.getActiveEnemies().push(inTheRing, bloomTarget);

  game.updateTowerAttack(tower, tower.x, tower.y, Math.max(tower.bloom.interval, game.GAS_CLOUD_TICK_INTERVAL));

  // Base attack fired a projectile at its own nearest target.
  assert.equal(game.getProjectiles().filter((p) => p.shape !== 'acid').length, 1);
  // The gas ring ticked at least once.
  assert.ok(inTheRing.health < 100000);
  // The bloom fired its own acid projectile(s).
  assert.ok(game.getProjectiles().some((p) => p.shape === 'acid'));
});

test('a tower with neither gasRing nor bloom (an ordinary Corpse Flower) never calls into either function — updateTowerAttack is safe either way', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  tower.x = 0;
  tower.y = 0;
  assert.doesNotThrow(() => game.updateTowerAttack(tower, tower.x, tower.y, 10));
});
