const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Make-Prodigies-cooler follow-up (direct request): per the user's own
// earlier reports, every Prodigy mostly reused its base tower's tier-4
// visuals with only minor tweaks. This covers the two new GENERIC, game-
// logic-backed timers that drive the new per-Prodigy attack flourishes —
// killFlash (The Fungal Mess's mist visibly billows/brightens right after
// a killing blow) and grabFlash (The Mangler's vines visibly lunge right
// as a grab lands) — the same "a timer counts down from a fixed duration,
// decremented every frame in updateTowerAttack" shape bloomProgress
// already uses (see corpse-flower-prodigy.test.js), and so testable the
// same way. The purely artistic canvas-drawing side (drawProdigyAura, the
// Sunlit Conductor's new outer ray layer, the writhing-vine geometry, the
// mist's own swirl) was instead verified live in the built-in browser
// pane this session — sampling actual rendered pixel colors around each
// Prodigy confirmed the shared aura ring (identical blended color at the
// same angle across all 4 types), the vine stroke color, and the mist
// visibly expanding/brightening right when killFlash is forced — since
// none of that is meaningfully assertable from pure data the way the two
// timers below are.

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod', name: 'Tiny Isopod', color: '#78909c', radius: 12,
    maxHealth: 100000, health: 100000, speed: 0, isBoss: false, bounty: 10,
    waypointIndex: 0, spawnDelay: 0, spawned: true, x: 0, y: 0,
    immobilizedRemaining: 0, isZombie: false, isPurpleZombie: false,
    markedForRemoval: false, zombieExplosionDamage: 0, tunneledRemaining: 0,
    armorThreshold: 0,
    ...overrides,
  };
}

// --- killFlash: a generic "just landed a killing blow" pulse -------------

test('every tower starts with killFlash at 0, including a tower with nothing special about kills at all', () => {
  const game = loadFullGameContext();
  const sunflower = game.createTower('sunflower');
  const fungalMess = game.createTower('fungalMess');
  assert.equal(sunflower.killFlash, 0);
  assert.equal(fungalMess.killFlash, 0);
});

test('a killing blow sets the crediting tower\'s killFlash to the full duration', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('fungalMess');
  const victim = makeTestEnemy({ health: 10 });

  game.damageEnemy(victim, 100, tower); // overkill — still just one flash, not scaled by overkill amount
  assert.equal(tower.killFlash, game.KILL_FLASH_DURATION);
  assert.ok(victim.health <= 0);
});

test('a non-killing hit never sets killFlash', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('fungalMess');
  const victim = makeTestEnemy({ health: 100000 });

  game.damageEnemy(victim, 100, tower);
  assert.equal(tower.killFlash, 0);
});

test('hitting an already-dead enemy again never re-triggers killFlash — only the actual kill does', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('fungalMess');
  const corpse = makeTestEnemy({ health: -5 }); // already dead, just hasn't been swept yet

  game.damageEnemy(corpse, 1, tower);
  assert.equal(tower.killFlash, 0);
});

test('a hit with no sourceTower never throws and credits nothing', () => {
  const game = loadFullGameContext();
  const victim = makeTestEnemy({ health: 1 });
  assert.doesNotThrow(() => game.damageEnemy(victim, 100));
});

test('killFlash counts back down to 0 over KILL_FLASH_DURATION via the normal per-frame tower update, same shape as attackFlash', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('fungalMess');
  tower.x = 0;
  tower.y = 0;
  const victim = makeTestEnemy({ x: 500, y: 500, health: 1 }); // out of range, so updateTowerAttack's own targeting can't touch it
  game.getActiveEnemies().push(victim);

  game.damageEnemy(victim, 100, tower);
  assert.equal(tower.killFlash, game.KILL_FLASH_DURATION);

  game.updateTowerAttack(tower, tower.x, tower.y, game.KILL_FLASH_DURATION / 2);
  assert.ok(Math.abs(tower.killFlash - game.KILL_FLASH_DURATION / 2) < 1e-9);

  game.updateTowerAttack(tower, tower.x, tower.y, 10); // well past the remainder — floors at 0, never negative
  assert.equal(tower.killFlash, 0);
});

// --- grabFlash: The Mangler's own "a grab just landed" pulse -------------

test('The Mangler starts with grabFlash at 0, and every tower without a grab at all never sets it', () => {
  const game = loadFullGameContext();
  const mangler = game.createTower('mangler');
  const sunflower = game.createTower('sunflower');
  assert.equal(mangler.grabFlash, 0);
  assert.equal(sunflower.grabFlash, 0);
});

test('a grab that actually lands sets grabFlash to the full duration', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('mangler');
  tower.x = 0;
  tower.y = 0;
  const target = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(target);

  game.updateTowerGrab(tower, tower.x, tower.y, tower.grabInterval);
  assert.equal(tower.grabFlash, game.GRAB_FLASH_DURATION);
});

test('a grab attempt with nothing eligible in range never sets grabFlash', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('mangler');
  tower.x = 0;
  tower.y = 0;
  const boss = makeTestEnemy({ x: 50, y: 0, isBoss: true }); // the only enemy in range, but grabs never target bosses

  game.getActiveEnemies().push(boss);
  game.updateTowerGrab(tower, tower.x, tower.y, tower.grabInterval);
  assert.equal(tower.grabFlash, 0);
});

test('grabFlash counts back down to 0 over GRAB_FLASH_DURATION via the normal per-frame tower update', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('mangler');
  tower.x = 0;
  tower.y = 0;
  const target = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(target);

  game.updateTowerGrab(tower, tower.x, tower.y, tower.grabInterval);
  assert.equal(tower.grabFlash, game.GRAB_FLASH_DURATION);

  game.updateTowerAttack(tower, tower.x, tower.y, game.GRAB_FLASH_DURATION + 1);
  assert.equal(tower.grabFlash, 0);
});

// --- Sanity: every Prodigy's render dispatch still has everything it ----
// needs (grabFlash/killFlash undefined would silently draw NaN-sized
// shapes rather than throwing, since canvas arc()/rect() etc. just no-op
// on NaN — so this only guards the one thing that WOULD throw: dividing
// a literal `undefined` by a duration constant inside the draw helpers
// produces NaN, not an exception, so there's nothing to assert.doesNotThrow
// here beyond what the full attack/grab cycle above already exercises.
test('updateTowerAttack never throws for every Prodigy type across a full attack+grab+kill cycle', () => {
  const game = loadFullGameContext();
  ['sunlitConductor', 'mangler', 'fungalMess', 'amorphophallusTitanum'].forEach((type) => {
    const tower = game.createTower(type);
    tower.x = 0;
    tower.y = 0;
    const target = makeTestEnemy({ x: 50, y: 0, health: 1 });
    game.getActiveEnemies().push(target);
    assert.doesNotThrow(() => game.updateTowerAttack(tower, tower.x, tower.y, 10), `threw for ${type}`);
  });
});
