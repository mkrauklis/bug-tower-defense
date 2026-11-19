const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Infect Path's 4 tiers each REPLACE the previous tier's stun chance/
// duration outright (same convention as Enable Path's aura and Decay's
// zombifyChance), plus Neurological's one-time tower-consumption on
// purchase. These tests exercise the stun-roll math and the consumption
// logic directly — chance is forced to 1 or 0 for determinism, same
// convention rose-roots.test.js uses for rootGrabChance.

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
    immobilizedRemaining: 0,
    infectedRemaining: 0,
    ...overrides,
  };
}

test('each Infect Path tier\'s stun chance/duration REPLACES the previous tier\'s, matching the spec numbers', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');

  game.purchaseUpgrade(mushroom, 2); // Rashy
  assert.deepEqual(mushroom.infectStun, { chance: 0.1, duration: 1 });

  game.purchaseUpgrade(mushroom, 2); // Respiratory
  assert.deepEqual(mushroom.infectStun, { chance: 0.15, duration: 2 });

  game.purchaseUpgrade(mushroom, 2); // Circulatory
  assert.deepEqual(mushroom.infectStun, { chance: 0.2, duration: 3 });

  game.purchaseUpgrade(mushroom, 2); // Neurological
  assert.deepEqual(mushroom.infectStun, { chance: 0.3, duration: 5 });
});

test('a tower that never bought Infect Path has no infectStun, and updateTowerAttack never rolls for it', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  assert.equal(mushroom.infectStun, null);

  const victim = makeTestEnemy({ x: 10, y: 0 });
  game.getActiveEnemies().push(victim);
  game.updateTowerAttack(mushroom, mushroom.x, mushroom.y, 1);

  assert.equal(victim.infectedRemaining, 0);
});

test('purchasing Infect Path does not roll instantly — infectCooldown starts at 1, not 0', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 2); // Rashy
  mushroom.infectStun.chance = 1; // force it — would stun instantly if the cooldown didn't guard it

  const victim = makeTestEnemy({ x: 10, y: 0 });
  game.getActiveEnemies().push(victim);

  // A tiny tick, well under the 1-second cooldown the purchase just set.
  game.updateTowerAttack(mushroom, mushroom.x, mushroom.y, 0.01);

  assert.equal(victim.infectedRemaining, 0);
});

test('a forced 100% chance stuns every enemy in range once the 1-second cooldown elapses, independently per enemy', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 2); // Rashy: range 170 (base), duration 1
  mushroom.infectStun.chance = 1;

  const inRange = makeTestEnemy({ x: 50, y: 0 });
  const outOfRange = makeTestEnemy({ x: 5000, y: 0 });
  game.getActiveEnemies().push(inRange, outOfRange);

  game.updateTowerAttack(mushroom, mushroom.x, mushroom.y, 1); // consumes the cooldown exactly

  assert.equal(inRange.infectedRemaining, 1); // Rashy's duration
  assert.equal(outOfRange.infectedRemaining, 0); // never in range, never rolled
});

test('a forced 0% chance never stuns, even once the cooldown elapses', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 2);
  mushroom.infectStun.chance = 0;

  const victim = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(victim);

  game.updateTowerAttack(mushroom, mushroom.x, mushroom.y, 1);

  assert.equal(victim.infectedRemaining, 0);
});

test('the roll is on a 1-second cadence, not every frame — repeated sub-second ticks don\'t re-roll early', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 2);
  mushroom.infectStun.chance = 1;
  mushroom.infectStun.duration = 1;

  const victim = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(victim);

  // Several small ticks that add up to just under 1 second total.
  for (let i = 0; i < 9; i += 1) {
    game.updateTowerAttack(mushroom, mushroom.x, mushroom.y, 0.1);
  }
  assert.equal(victim.infectedRemaining, 0); // cooldown hasn't elapsed yet

  game.updateTowerAttack(mushroom, mushroom.x, mushroom.y, 0.1); // crosses the 1-second mark
  assert.equal(victim.infectedRemaining, 1);
});

test('re-infecting a still-stunned enemy refreshes the duration (Math.max) rather than stacking it', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.purchaseUpgrade(mushroom, 2);
  mushroom.infectStun.chance = 1;
  mushroom.infectStun.duration = 3;

  const victim = makeTestEnemy({ x: 50, y: 0, infectedRemaining: 2 });
  game.getActiveEnemies().push(victim);

  game.updateTowerAttack(mushroom, mushroom.x, mushroom.y, 1);

  assert.equal(victim.infectedRemaining, 3); // refreshed to the tier's duration, not 2 + 3
});

test('getTowersInRange finds every other tower within the Mushroom\'s own range, excluding itself', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;

  const near = game.createTower('sunflower');
  near.x = 50;
  near.y = 0;
  const far = game.createTower('sunflower');
  far.x = 5000;
  far.y = 0;
  game.getTowers().push(mushroom, near, far);

  const victims = game.getTowersInRange(mushroom);
  assert.deepEqual(victims, [near]);
});

test('consumeTowersInRange destroys only towers in range, with no refund, and leaves out-of-range towers alone', () => {
  const game = loadFullGameContext();
  game.setMoney(1000);
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;

  const near = game.createTower('sunflower');
  near.x = 50;
  near.y = 0;
  const far = game.createTower('sunflower');
  far.x = 5000;
  far.y = 0;
  game.getTowers().push(mushroom, near, far);

  game.consumeTowersInRange(mushroom);

  const remaining = game.getTowers();
  assert.ok(remaining.includes(mushroom));
  assert.ok(!remaining.includes(near)); // consumed
  assert.ok(remaining.includes(far)); // untouched
  assert.equal(game.getMoney(), 1000); // no refund for the consumed tower
});

test('consumeTowersInRange leaves a visual-feedback entry at each consumed tower\'s position', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;

  const near = game.createTower('sunflower');
  near.x = 50;
  near.y = 30;
  game.getTowers().push(mushroom, near);

  game.consumeTowersInRange(mushroom);

  const effects = game.getConsumedTowerEffects();
  assert.equal(effects.length, 1);
  assert.equal(effects[0].x, 50);
  assert.equal(effects[0].y, 30);
  assert.ok(effects[0].remaining > 0);
});

test('a tower placed after consumeTowersInRange already ran is never retroactively affected', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  game.getTowers().push(mushroom);

  game.consumeTowersInRange(mushroom); // nothing else around yet — no-op

  const placedAfter = game.createTower('sunflower');
  placedAfter.x = 50;
  placedAfter.y = 0;
  game.getTowers().push(placedAfter);

  assert.ok(game.getTowers().includes(placedAfter)); // one-time effect, already spent
});

test('activateRegion runs the one-time consumption when Neurological is purchased with nothing in range (no confirm needed)', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  mushroom.chosenPath = 2;
  mushroom.upgradesPurchased = 3; // Rashy/Respiratory/Circulatory already bought
  mushroom.infectStun = { chance: 0.2, duration: 3 };
  game.getTowers().push(mushroom);
  game.setSelectedTower(mushroom);
  game.setMoney(10000);

  const upgrade = {
    name: 'Neurological',
    cost: 5000,
    description: 'test',
    effects: { infectStun: { chance: 0.3, duration: 5 }, consumeTowersInRange: true },
  };
  const region = {
    id: 'upgrade:2:3',
    data: { pathIndex: 2, tierIndex: 3, upgrade, isNextInLine: true },
  };

  game.activateRegion(region);

  assert.deepEqual(mushroom.infectStun, { chance: 0.3, duration: 5 });
  assert.equal(game.getMoney(), 5000);
  assert.equal(mushroom.upgradesPurchased, 4);
});

test('purchasing a non-Neurological Infect Path tier via activateRegion never touches other towers', () => {
  const game = loadFullGameContext();
  const mushroom = game.createTower('mushroom');
  mushroom.x = 0;
  mushroom.y = 0;
  const neighbor = game.createTower('sunflower');
  neighbor.x = 50;
  neighbor.y = 0;
  game.getTowers().push(mushroom, neighbor);
  game.setSelectedTower(mushroom);
  game.setMoney(1000);

  const upgrade = {
    name: 'Rashy',
    cost: 300,
    description: 'test',
    effects: { infectStun: { chance: 0.1, duration: 1 } },
  };
  const region = {
    id: 'upgrade:2:0',
    data: { pathIndex: 2, tierIndex: 0, upgrade, isNextInLine: true },
  };

  game.activateRegion(region);

  assert.ok(game.getTowers().includes(neighbor)); // Rashy carries no consumeTowersInRange flag
});
