const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Enable Path's aura REPLACES the previous tier's with its own complete,
// absolute spec rather than compounding — see towers.js's own design-
// rationale comment on the path. These tests exercise that directly.

test('Speed grants an interval-only aura; the Mushroom\'s own range is untouched', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  game.purchaseUpgrade(mushroom, 1); // Speed
  assert.deepEqual(mushroom.aura, { attackIntervalMultiplier: 0.8 });
  assert.equal(mushroom.stats.range, 170); // base range, untouched
});

test('Power REPLACES Speed\'s aura outright — damage only, no interval bonus left over', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  game.purchaseUpgrade(mushroom, 1); // Speed
  game.purchaseUpgrade(mushroom, 1); // Power
  assert.deepEqual(mushroom.aura, { damageMultiplier: 1.5 });
});

test('Range REPLACES Power\'s aura and widens the Mushroom\'s own range to match (same stat = aura radius)', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  game.purchaseUpgrade(mushroom, 1); // Speed
  game.purchaseUpgrade(mushroom, 1); // Power
  game.purchaseUpgrade(mushroom, 1); // Range
  assert.deepEqual(mushroom.aura, { rangeMultiplier: 1.5 });
  assert.equal(mushroom.stats.range, 255); // 170 * 1.5
});

test('Fungus Juice REPLACES with all three at once, and the Mushroom\'s own range is 2x base (not 1.5x * 2x)', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  for (let i = 0; i < 4; i += 1) game.purchaseUpgrade(mushroom, 1); // Speed, Power, Range, Fungus Juice
  assert.deepEqual(mushroom.aura, { attackIntervalMultiplier: 0.7, damageMultiplier: 2, rangeMultiplier: 2 });
  assert.equal(mushroom.stats.range, 340); // 170 * 2, replacing Range tier's 255, not compounding with it
});

test('a tower that never bought Enable Path has no aura', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  game.purchaseUpgrade(mushroom, 0); // Decay, not Enable Path
  assert.equal(mushroom.aura, null);
});

test('getStrongestAuraFor buffs a nearby tower but not the Mushroom itself', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 1); // Speed

  const sunflower = game.createTower('sunflower');
  sunflower.x = 50;
  sunflower.y = 0; // within the Mushroom's 170 range
  game.getTowers().push(mushroom, sunflower);

  assert.deepEqual(game.getStrongestAuraFor(sunflower), { attackIntervalMultiplier: 0.8 });
  assert.equal(game.getStrongestAuraFor(mushroom), null); // doesn't buff itself
});

test('a tower outside every Mushroom\'s range gets no aura', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 1);

  const sunflower = game.createTower('sunflower');
  sunflower.x = 1000;
  sunflower.y = 0;
  game.getTowers().push(mushroom, sunflower);

  assert.equal(game.getStrongestAuraFor(sunflower), null);
});

test('two overlapping Enable-Path Mushrooms never stack — the stronger tier wins, not a combination of both', () => {
  const game = loadFullGameContext();
  const weakMushroom = game.createTower('mushroom');
  weakMushroom.x = -50;
  weakMushroom.y = 0;
  game.purchaseUpgrade(weakMushroom, 1); // tier 1: Speed only

  const strongMushroom = game.createTower('mushroom');
  strongMushroom.x = 50;
  strongMushroom.y = 0;
  game.purchaseUpgrade(strongMushroom, 1);
  game.purchaseUpgrade(strongMushroom, 1);
  game.purchaseUpgrade(strongMushroom, 1); // tier 3: Range

  const sunflower = game.createTower('sunflower');
  sunflower.x = 0;
  sunflower.y = 0; // within both mushrooms' range
  game.getTowers().push(weakMushroom, strongMushroom, sunflower);

  // The stronger (higher-tier) aura wins outright — not, say, an interval
  // bonus from one plus a range bonus from the other.
  assert.deepEqual(game.getStrongestAuraFor(sunflower), { rangeMultiplier: 1.5 });
});

test('the buff turns off the instant the buffing Mushroom is removed (sold) — no stale state', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 1);

  const sunflower = game.createTower('sunflower');
  sunflower.x = 50;
  sunflower.y = 0;
  game.getTowers().push(mushroom, sunflower);

  assert.notEqual(game.getStrongestAuraFor(sunflower), null);

  const towers = game.getTowers();
  towers.splice(towers.indexOf(mushroom), 1); // "sold"
  assert.equal(game.getStrongestAuraFor(sunflower), null);
});

test('the buff turns off once the buffed tower moves out of range', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 1);

  const sunflower = game.createTower('sunflower');
  sunflower.x = 50;
  sunflower.y = 0;
  game.getTowers().push(mushroom, sunflower);

  assert.notEqual(game.getStrongestAuraFor(sunflower), null);
  sunflower.x = 5000;
  assert.equal(game.getStrongestAuraFor(sunflower), null);
});

test('updateTowerAttack applies the damage aura to an actual hit (ray attack, instant)', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 1); // Speed
  game.purchaseUpgrade(mushroom, 1); // Power — 1.5x damage

  const sunflower = game.createTower('sunflower');
  sunflower.x = 50;
  sunflower.y = 0;
  sunflower.attackType = 'ray'; // force an instant hit, no projectile travel time to wait out
  game.getTowers().push(mushroom, sunflower);

  const enemy = { x: 55, y: 0, health: 1000, maxHealth: 1000, spawned: true, isZombie: false, radius: 7 };
  game.getActiveEnemies().push(enemy);

  const baseDamage = sunflower.stats.damage;
  game.updateTowerAttack(sunflower, sunflower.x, sunflower.y, 0.01);

  assert.equal(enemy.health, 1000 - baseDamage * 1.5);
});

test('updateTowerAttack applies the range aura so a tower can reach farther than its own base range', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 1);
  game.purchaseUpgrade(mushroom, 1);
  game.purchaseUpgrade(mushroom, 1); // Range — 1.5x range

  const sunflower = game.createTower('sunflower');
  sunflower.x = 50;
  sunflower.y = 0;
  sunflower.attackType = 'ray';
  game.getTowers().push(mushroom, sunflower);

  // Placed just beyond the sunflower's own base range, but within
  // base-range * 1.5 from the sunflower.
  const farEnemy = {
    x: sunflower.x + sunflower.stats.range * 1.2,
    y: 0,
    health: 1000,
    maxHealth: 1000,
    spawned: true,
    isZombie: false,
    radius: 7,
  };
  game.getActiveEnemies().push(farEnemy);

  game.updateTowerAttack(sunflower, sunflower.x, sunflower.y, 0.01);

  assert.equal(sunflower.target, farEnemy); // found it, thanks to the aura-extended range
});

test('a projectile-type attack bakes the aura\'s damage multiplier into the projectile itself', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 1);
  game.purchaseUpgrade(mushroom, 1); // Power — 1.5x damage

  const sunflower = game.createTower('sunflower'); // default attackType is 'projectile'
  sunflower.x = 50;
  sunflower.y = 0;
  game.getTowers().push(mushroom, sunflower);

  const enemy = { x: 55, y: 0, health: 1000, maxHealth: 1000, spawned: true, isZombie: false, radius: 7 };
  game.getActiveEnemies().push(enemy);

  const baseDamage = sunflower.stats.damage;
  game.updateTowerAttack(sunflower, sunflower.x, sunflower.y, 0.01);

  assert.equal(game.getProjectiles()[0].damage, baseDamage * 1.5);
});
