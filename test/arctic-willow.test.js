const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Arctic Willow (direct request, from a real reference photo sent directly
// — a willow catkin, not a round flower head like every other base
// tower): a brand-new 6th base tower, $80, 3 damage/sec baseline ("3
// damage every second," the same literal phrasing Mushroom's own base
// stats already use). Only its first path (Frosted Path, named after its
// own first tier "Frosted" — not named as a whole by the user) has been
// designed so far; the other two are left null, same "arrives across
// separate follow-ups" pattern Corpse Flower's own 3 paths used.
//
// Frosted Path is a crowd-control path: every tier states its own real
// but modest damage increase (read as a compounding damageMultiplier,
// since no literal numbers were given — unlike Corpse Flower's own
// absolute-replace attackDamage), while its real payoff is a stacking
// slow applied on every ordinary hit via a newly-generalized
// projectile.slow field (previously only Corpse Flower's own dedicated
// acid projectile carried one). Height only grows at tiers 1/3/4 — tier
// 2 ("Frostbite") explicitly only changes color/slow/damage per the
// user's own wording.

function makeTestEnemy(overrides) {
  return {
    enemyKey: 'tinyIsopod', name: 'Tiny Isopod', color: '#78909c', radius: 12,
    maxHealth: 100000, health: 100000, speed: 0, isBoss: false, bounty: 10,
    waypointIndex: 0, spawnDelay: 0, spawned: true, x: 0, y: 0,
    immobilizedRemaining: 0, isZombie: false, isPurpleZombie: false,
    markedForRemoval: false, zombieExplosionDamage: 0,
    ...overrides,
  };
}

// --- Base tower ------------------------------------------------------------

test('Arctic Willow costs $80 and deals 3 damage/sec baseline, with no Frosted Path effects yet', () => {
  const game = loadFullGameContext();
  const item = game.SHOP_ITEMS.find((i) => i.typeKey === 'arcticWillow');
  assert.equal(item.cost, 80);

  const tower = game.createTower('arcticWillow');
  assert.equal(tower.stats.damage, 3);
  assert.equal(tower.stats.attackInterval, 1); // 3 once a second = 3 dps, the literal spec
  assert.equal(tower.attackType, 'projectile');
  assert.equal(tower.slow, null);
  assert.equal(tower.icicleCount, 0);
  assert.equal(tower.hasIceSpikes, false);
  assert.equal(tower.hasIcicleRing, false);
});

test('only Frosted Path (path 0) is designed so far — the other 2 paths are undesigned', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  assert.ok(game.getAvailableUpgrade(tower, 0)); // Frosted Path
  assert.equal(game.getAvailableUpgrade(tower, 1), null);
  assert.equal(game.getAvailableUpgrade(tower, 2), null);
});

// --- Frosted Path tiers ------------------------------------------------

test('Frosted (tier 1): a real but modest slow, a couple of icicles, and a little more damage', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');

  game.purchaseUpgrade(tower, 0);
  assert.deepEqual(tower.slow, { multiplier: 0.7, duration: 3 });
  assert.equal(tower.icicleCount, 2);
  assert.equal(tower.hasIceSpikes, false);
  assert.ok(Math.abs(tower.stats.damage - 3 * 1.3) < 1e-9);
});

test('Frostbite (tier 2): a stronger slow, more damage, turns light blue — no height/icicle change of its own', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  game.purchaseUpgrade(tower, 0); // Frosted

  game.purchaseUpgrade(tower, 0); // Frostbite
  assert.deepEqual(tower.slow, { multiplier: 0.5, duration: 3 });
  assert.equal(tower.stats.color, '#81d4fa');
  assert.ok(Math.abs(tower.stats.damage - 3 * 1.3 * 1.4) < 1e-9);
  assert.equal(tower.icicleCount, 2); // unchanged — Frostbite never mentions icicles
});

test('Permafrost (tier 3): an even stronger slow, more damage, more icicles, and ice spikes', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  game.purchaseUpgrade(tower, 0); // Frosted
  game.purchaseUpgrade(tower, 0); // Frostbite

  game.purchaseUpgrade(tower, 0); // Permafrost
  assert.deepEqual(tower.slow, { multiplier: 0.35, duration: 3 });
  assert.equal(tower.icicleCount, 5);
  assert.equal(tower.hasIceSpikes, true);
  assert.ok(Math.abs(tower.stats.damage - 3 * 1.3 * 1.4 * 1.5) < 1e-9);
});

test('Frosterizer (tier 4): a brutal 90% slow, more damage, and an icicle ring', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  game.purchaseUpgrade(tower, 0); // Frosted
  game.purchaseUpgrade(tower, 0); // Frostbite
  game.purchaseUpgrade(tower, 0); // Permafrost

  game.purchaseUpgrade(tower, 0); // Frosterizer
  assert.deepEqual(tower.slow, { multiplier: 0.1, duration: 3 }); // 90% slow, the literal spec
  assert.equal(tower.hasIcicleRing, true);
  assert.ok(Math.abs(tower.stats.damage - 3 * 1.3 * 1.4 * 1.5 * 1.6) < 1e-9);
});

// --- The generalized projectile.slow pipeline ---------------------------
// Previously only Corpse Flower's own dedicated acid projectile carried a
// `slow` field (see spawnAcidProjectile in game.js) — Arctic Willow needs
// its ORDINARY base attack to slow on hit, so spawnProjectile() itself now
// forwards tower.slow the same way it already forwards tower.burn.

test('a tower\'s ordinary attack projectile carries tower.slow once Frosted Path is bought', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 0); // Frosted

  const target = makeTestEnemy({ x: 50, y: 0 });
  game.spawnProjectile(tower, target);
  const projectile = game.getProjectiles()[0];
  assert.deepEqual(projectile.slow, tower.slow);
  assert.equal(projectile.shape, 'icicle'); // Arctic Willow's own distinct projectile shape
});

test('resolving that projectile applies both the direct damage and the slow debuff', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 0); // Frosted: 0.7 multiplier, 3s

  const enemy = makeTestEnemy({ x: 10, y: 0 });
  game.spawnProjectile(tower, enemy);
  const projectile = game.getProjectiles()[0];
  projectile.target = enemy;
  projectile.aimX = enemy.x;
  projectile.aimY = enemy.y;

  game.resolveProjectile(projectile);
  assert.ok(Math.abs(enemy.health - (100000 - 3 * 1.3)) < 1e-9);
  assert.deepEqual(enemy.slow, { multiplier: 0.7, remaining: 3 });
});

test('an unupgraded Arctic Willow never slows anything — tower.slow is null and the projectile carries none', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  tower.x = 0;
  tower.y = 0;

  const enemy = makeTestEnemy({ x: 10, y: 0 });
  game.spawnProjectile(tower, enemy);
  const projectile = game.getProjectiles()[0];
  assert.equal(projectile.slow, null);

  projectile.target = enemy;
  projectile.aimX = enemy.x;
  projectile.aimY = enemy.y;
  game.resolveProjectile(projectile);
  assert.ok(!enemy.slow);
});

test('every OTHER tower\'s projectile is completely unaffected by the generalization — still null slow, still shape "petal"', () => {
  const game = loadFullGameContext();
  const sunflower = game.createTower('sunflower');
  sunflower.x = 0;
  sunflower.y = 0;
  const target = makeTestEnemy({ x: 50, y: 0 });

  game.spawnProjectile(sunflower, target);
  const projectile = game.getProjectiles()[0];
  assert.equal(projectile.slow, null);
  assert.equal(projectile.shape, 'petal');
});

test('updateTowerAttack fires an ordinary attack that slows its target end to end, once Frosted Path is bought', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('arcticWillow');
  tower.x = 0;
  tower.y = 0;
  game.purchaseUpgrade(tower, 0); // Frosted

  const enemy = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(enemy);

  game.updateTowerAttack(tower, tower.x, tower.y, tower.stats.attackInterval);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.deepEqual(enemy.slow, { multiplier: 0.7, remaining: 3 });
});
