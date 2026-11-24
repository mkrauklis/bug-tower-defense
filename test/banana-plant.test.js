const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Banana Plant — a brand-new 7th base tower (direct follow-up request,
// relayed from the peer session), modeled on a real aquarium plant
// (Nymphoides aquatica). The first waterType: true tower (this
// assistant's own call, per the request's own "water-exclusive... your
// call": water-type PLUS normal land placement everywhere else, not
// water-exclusive — see TOWER_TYPES.bananaPlant's own top comment,
// towers.js, for the full reasoning).
//
// 3 mutually exclusive paths:
//   - Tangle Path (root/snare CC, reusing Rose's own immobilizedRemaining
//     mechanism directly via a new applyRoot() in enemies.js — see that
//     function's own comment for why reuse, not a parallel field, is
//     correct here).
//   - Bulb Path (raw damage, escalating into a 2nd independent attack —
//     tower.stems/updateTowerStems() in game.js, modeled on Amorphophallus
//     titanum's own updateTowerBloom() — hitting more targets per tier,
//     culminating in "everything in range" by widening targetCount far
//     past any realistic enemy count).
//   - Bloom Path ("a genuinely new mechanic, not reused from another
//     tower"): a temporary reduction of enemy.armorThreshold
//     (applyArmorShred(), enemies.js), escalating into a genuine AoE
//     pollen cloud (applyPollenCloud(), reusing getEnemiesInRadius() the
//     same way updateTowerGrab/updateTowerInfectStun already do).

test('TOWER_TYPES.bananaPlant exists, is the first (and so far only) waterType tower, with a genuinely short-to-medium range', () => {
  const game = loadGameContext();
  const type = game.TOWER_TYPES.bananaPlant;
  assert.ok(type);
  assert.equal(type.waterType, true);
  assert.ok(type.baseStats.range < 170, 'expected a shorter-than-usual range, per "short-to-medium range"');
  assert.equal(type.upgradePaths.length, 3);
  assert.equal(type.upgradePaths[0].name, 'Tangle Path');
  assert.equal(type.upgradePaths[1].name, 'Bulb Path');
  assert.equal(type.upgradePaths[2].name, 'Bloom Path');
  type.upgradePaths.forEach((path) => assert.equal(path.upgrades.length, 4));

  // Every other current tower type is unaffected — still no waterType of
  // its own.
  Object.keys(game.TOWER_TYPES).forEach((typeKey) => {
    if (typeKey === 'bananaPlant') return;
    assert.equal(Boolean(game.TOWER_TYPES[typeKey].waterType), false);
  });
});

test('Banana Plant is a real purchasable shop item, priced in the same range as the other base towers', () => {
  const game = loadFullGameContext();
  const item = game.SHOP_ITEMS.find((i) => i.typeKey === 'bananaPlant');
  assert.ok(item);
  assert.ok(item.cost >= 30 && item.cost <= 200, `expected a base-tower-range cost, got ${item.cost}`);
});

test('Banana Plant can be placed on ordinary land everywhere, AND directly in open water on Whirlpool/Deep Sea (the waterType bypass)', () => {
  const game = loadFullGameContext();

  game.setSelectedMap(game.MAP_TYPES.deepForest);
  game.startGame('sandbox');
  game.setSelectedShopItem({ typeKey: 'bananaPlant' });
  game.handleCanvasTap(400, 300);
  assert.equal(game.getTowers().length, 1);

  game.setSelectedMap(game.MAP_TYPES.whirlpool);
  game.startGame('sandbox');
  game.setSelectedShopItem({ typeKey: 'bananaPlant' });
  game.handleCanvasTap(500, 500); // open water, far from every island
  assert.equal(game.getTowers().length, 1);
  assert.equal(game.getTowers()[0].x, 500);
  assert.equal(game.getTowers()[0].y, 500);
});

test('Tangle Path tier 1: roots an enemy on a successful hit, reusing enemy.immobilizedRemaining directly', () => {
  const game = loadGameContext();
  const tower = game.createTower('bananaPlant');
  game.purchaseUpgrade(tower, 0);
  assert.deepEqual(tower.root, { chance: 0.3, duration: 1.5 });

  const enemy = { x: 0, y: 0, immobilizedRemaining: 0 };
  let everRooted = false;
  for (let i = 0; i < 200; i += 1) {
    enemy.immobilizedRemaining = 0;
    game.applyRoot(enemy, tower.root, tower);
    if (enemy.immobilizedRemaining > 0) everRooted = true;
  }
  assert.equal(everRooted, true);
});

test('Tangle Path tier 2+: catchSecond independently roots one more nearby enemy, on top of the primary one', () => {
  const game = loadGameContext();
  const tower = game.createTower('bananaPlant');
  game.purchaseUpgrade(tower, 0);
  game.purchaseUpgrade(tower, 0);
  assert.equal(tower.root.catchSecond, true);

  game.setActiveMap(game.MAP_TYPES.deepForest);
  game.spawnWave([]);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  game.spawnSingleEnemy(entry);
  const [primary, second] = game.getActiveEnemies();
  primary.x = 0; primary.y = 0;
  second.x = 10; second.y = 10;
  // getEnemiesInRadius() (what catchSecond's own "catch a nearby enemy"
  // lookup uses) filters on enemy.spawned — a freshly spawnSingleEnemy()'d
  // enemy starts false until its own spawnDelay elapses, same as a real
  // game would gate it, so this needs to be set explicitly here.
  primary.spawned = true;
  second.spawned = true;

  let caughtBoth = false;
  for (let i = 0; i < 200 && !caughtBoth; i += 1) {
    primary.immobilizedRemaining = 0;
    second.immobilizedRemaining = 0;
    game.applyRoot(primary, tower.root, tower);
    if (primary.immobilizedRemaining > 0 && second.immobilizedRemaining > 0) caughtBoth = true;
  }
  assert.equal(caughtBoth, true);
});

test('Tangle Path tier 4: rooted enemies also burn for the snare\'s own duration (dot layered via the existing generic applyBurn)', () => {
  const game = loadGameContext();
  const tower = game.createTower('bananaPlant');
  [0, 0, 0, 0].forEach(() => game.purchaseUpgrade(tower, 0));
  assert.ok(tower.root.dot > 0);

  const enemy = { x: 0, y: 0, immobilizedRemaining: 0, burn: null };
  let everBurned = false;
  for (let i = 0; i < 200 && !everBurned; i += 1) {
    game.applyRoot(enemy, tower.root, tower);
    if (enemy.burn) everBurned = true;
  }
  assert.equal(everBurned, true);
  assert.equal(enemy.burn.damagePerSecond, tower.root.dot);
});

test('Tangle Path tier 3: rootPulse fires on its own independent timer, unrelated to the attack cycle, modeled on Mushroom\'s own infect-stun', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepForest);
  game.startGame('sandbox');
  game.setSelectedShopItem({ typeKey: 'bananaPlant' });
  game.handleCanvasTap(400, 300);
  const tower = game.getTowers()[0];
  game.purchaseUpgrade(tower, 0);
  game.purchaseUpgrade(tower, 0);
  game.purchaseUpgrade(tower, 0);
  assert.ok(tower.rootPulse);
  assert.equal(tower.rootPulseCooldown, tower.rootPulse.interval); // doesn't fire instantly on purchase

  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];
  enemy.x = tower.x + 50;
  enemy.y = tower.y;
  enemy.speed = 0;
  enemy.spawned = true;
  tower.attackCooldown = 999; // suppress the ordinary on-hit root so only rootPulse can be responsible here

  let pulsedRoot = false;
  for (let i = 0; i < 300; i += 1) {
    game.update(1 / 60);
    if (enemy.immobilizedRemaining > 0) pulsedRoot = true;
  }
  assert.equal(pulsedRoot, true);
});

test('Bulb Path tiers 1-2: straightforward damage scaling, no stems yet', () => {
  const game = loadGameContext();
  const tower = game.createTower('bananaPlant');
  const baseDamage = tower.stats.damage;
  game.purchaseUpgrade(tower, 1);
  game.purchaseUpgrade(tower, 1);
  assert.ok(tower.stats.damage > baseDamage);
  assert.equal(tower.stems, null);
});

test('Bulb Path tier 3: stems hits a 2nd nearby enemy per cycle, on top of the primary attack', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepForest);
  game.startGame('sandbox');
  game.setSelectedShopItem({ typeKey: 'bananaPlant' });
  game.handleCanvasTap(400, 300);
  const tower = game.getTowers()[0];
  [0, 0, 0].forEach(() => game.purchaseUpgrade(tower, 1));
  assert.equal(tower.stems.targetCount, 2);

  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  for (let i = 0; i < 3; i += 1) game.spawnSingleEnemy(entry);
  game.getActiveEnemies().forEach((enemy, i) => {
    enemy.x = tower.x + 20 + i * 15;
    enemy.y = tower.y;
    enemy.speed = 0;
    enemy.spawned = true;
    enemy.health = enemy.maxHealth * 50;
  });
  const before = game.getActiveEnemies().map((e) => e.health);
  for (let i = 0; i < 120; i += 1) game.update(1 / 60);
  const after = game.getActiveEnemies().map((e) => e.health);
  const hitCount = after.filter((h, i) => h < before[i]).length;
  assert.ok(hitCount >= 2, `expected at least 2 enemies hit per cycle, got ${hitCount}`);
});

test('Bulb Path tier 4: hits literally every enemy in range at once, the same stems mechanism just widened, not a different attack', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepForest);
  game.startGame('sandbox');
  game.setSelectedShopItem({ typeKey: 'bananaPlant' });
  game.handleCanvasTap(400, 300);
  const tower = game.getTowers()[0];
  [0, 0, 0, 0].forEach(() => game.purchaseUpgrade(tower, 1));
  assert.ok(tower.stems.targetCount > 10, 'expected targetCount widened far past any realistic in-range enemy count');

  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  for (let i = 0; i < 6; i += 1) game.spawnSingleEnemy(entry);
  game.getActiveEnemies().forEach((enemy, i) => {
    enemy.x = tower.x + 20 + i * 12;
    enemy.y = tower.y;
    enemy.speed = 0;
    enemy.spawned = true;
    enemy.health = enemy.maxHealth * 50;
  });
  const before = game.getActiveEnemies().map((e) => e.health);
  for (let i = 0; i < 90; i += 1) game.update(1 / 60);
  const after = game.getActiveEnemies().map((e) => e.health);
  const hitCount = after.filter((h, i) => h < before[i]).length;
  assert.equal(hitCount, game.getActiveEnemies().length);
});

test('Bloom Path tier 1: a direct hit below an unshredded enemy\'s own armorThreshold is still fully negated (the generic gate is unaffected by default)', () => {
  const game = loadGameContext();
  const enemy = { armorThreshold: 10, armorShred: null, health: 100 };
  game.damageEnemy(enemy, 5, null);
  assert.equal(enemy.health, 100);
});

test('Bloom Path tier 1: applyArmorShred temporarily lowers the effective armor gate, letting a previously-negated hit through', () => {
  const game = loadGameContext();
  const tower = game.createTower('bananaPlant');
  game.purchaseUpgrade(tower, 2);
  assert.ok(tower.pollenCloud.multiplier < 1);

  // 7 damage: below the raw armorThreshold (10, negated) but above tier
  // 1's own still-modest effective threshold once shredded (10 * 0.6 =
  // 6, gets through) — picked to actually distinguish the two states,
  // rather than a hit so weak it'd stay negated either way.
  const enemy = { armorThreshold: 10, armorShred: null, health: 100 };
  game.damageEnemy(enemy, 7, null);
  assert.equal(enemy.health, 100); // still negated, unshredded

  game.applyArmorShred(enemy, tower.pollenCloud);
  game.damageEnemy(enemy, 7, null);
  assert.ok(enemy.health < 100, 'expected the shredded hit to actually land');
});

test('Bloom Path tier 2: layers a minor burn DoT on top of the armor shred, via the existing generic applyBurn', () => {
  const game = loadGameContext();
  const tower = game.createTower('bananaPlant');
  game.purchaseUpgrade(tower, 2);
  game.purchaseUpgrade(tower, 2);
  assert.ok(tower.pollenCloud.dot > 0);

  const enemy = { x: 0, y: 0, armorShred: null, burn: null };
  game.applyPollenCloud(enemy, tower.pollenCloud, tower);
  assert.ok(enemy.armorShred);
  assert.equal(enemy.burn.damagePerSecond, tower.pollenCloud.dot);
});

test('Bloom Path tier 3+: the cloud becomes a real AoE, shredding/burning every other enemy within its own radius, not just the one directly hit', () => {
  const game = loadGameContext();
  const tower = game.createTower('bananaPlant');
  [0, 0, 0].forEach(() => game.purchaseUpgrade(tower, 2));
  assert.ok(tower.pollenCloud.radius > 0);

  game.setActiveMap(game.MAP_TYPES.deepForest);
  game.spawnWave([]);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  game.spawnSingleEnemy(entry);
  const [hit, nearby] = game.getActiveEnemies();
  hit.x = 0; hit.y = 0;
  nearby.x = 20; nearby.y = 20; // well within the tier-3 radius
  // getEnemiesInRadius() (what the AoE side of applyPollenCloud uses to
  // find "every other enemy nearby") filters on enemy.spawned.
  hit.spawned = true;
  nearby.spawned = true;

  game.applyPollenCloud(hit, tower.pollenCloud, tower);
  assert.ok(hit.armorShred);
  assert.ok(nearby.armorShred, 'expected the AoE to also reach the nearby enemy, not just the hit one');
});

test('Bloom Path tier 4: near-total armor reduction, a long-lasting application, and a small slow layered on top', () => {
  const game = loadGameContext();
  const tower = game.createTower('bananaPlant');
  [0, 0, 0, 0].forEach(() => game.purchaseUpgrade(tower, 2));
  assert.ok(tower.pollenCloud.multiplier <= 0.1, 'expected "near-total" armor reduction');
  assert.ok(tower.pollenCloud.slow > 0 && tower.pollenCloud.slow < 1);

  const enemy = { x: 0, y: 0, armorShred: null, burn: null, slow: null };
  game.applyPollenCloud(enemy, tower.pollenCloud, tower);
  assert.ok(enemy.slow);
  assert.equal(enemy.slow.multiplier, tower.pollenCloud.slow);
});

test('renderTower never throws for a Banana Plant across every path/tier combination', () => {
  const game = loadFullGameContext();
  const ctx = new Proxy({}, { get: (obj, prop) => (prop === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : () => {}) });
  [0, 1, 2].forEach((pathIndex) => {
    const tower = game.createTower('bananaPlant');
    tower.x = 100; tower.y = 100;
    for (let tier = 0; tier < 4; tier += 1) {
      game.purchaseUpgrade(tower, pathIndex);
      assert.doesNotThrow(
        () => game.renderTower(ctx, tower, tower.x, tower.y, 1.3),
        `renderTower threw for path ${pathIndex}, tier ${tier + 1}`
      );
    }
  });
});
