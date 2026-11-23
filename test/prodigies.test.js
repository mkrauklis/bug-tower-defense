const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Prodigies (direct request, reworked mid-build from an earlier standalone-
// tower design into an UPGRADE instead): a 4th, ultimate tier per base
// type (Sunflower/Rose/Mushroom/Corpse Flower — NOT the since-removed
// Coneflower). Corpse Flower's own Prodigy, Amorphophallus titanum,
// arrived in its own later follow-up (see corpse-flower-prodigy.test.js
// for its own mechanics) — until then it was the one base type with no
// Prodigy at all, which is what the now-removed "Corpse Flower never
// gets a Prodigy option" test just below used to cover. Once a tower
// reaches tier 4 on its own chosen path, it can be upgraded ONE MORE TIME
// into its Prodigy form, which replaces it in place on the field (same
// spot, no separate shop purchase/placement) rather than requiring a
// brand-new tower. Each Prodigy is capped at 1 on the field at a time,
// independently per type. See getProdigyOption()/getProdigyTypeKeyFor() and
// activateRegion()'s 'prodigy-upgrade' branch in game.js, and
// PRODIGY_BASE_TYPE in towers.js.

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

// Builds a fixture enemy already sitting at the path's final waypoint —
// the same shape player-health.test.js's own makeArrivedEnemy() uses.
function makeArrivedEnemy(overrides = {}) {
  return {
    enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8,
    maxHealth: 40, health: 25, speed: 0, isBoss: false, bounty: 5,
    waypointIndex: 7, // Deep Forest's final waypoint
    spawnDelay: 0, spawned: true, x: 980, y: 180, immobilizedRemaining: 0,
    isZombie: false, isPurpleZombie: false, markedForRemoval: false, zombieExplosionDamage: 0,
    ...overrides,
  };
}

function maxOutOnPath(game, tower, pathIndex) {
  for (let i = 0; i < 4; i += 1) game.purchaseUpgrade(tower, pathIndex);
}

// A freshly-created, field-placed tower already maxed (tier 4) on one path
// — exactly what getProdigyOption() looks for.
function maxedTower(game, baseType, pathIndex = 0) {
  const tower = game.createTower(baseType);
  tower.x = 100;
  tower.y = 100;
  maxOutOnPath(game, tower, pathIndex);
  game.getTowers().push(tower);
  return tower;
}

// --- getProdigyOption: the live "ready to become a Prodigy" check -------

test('a tower that has not reached tier 4 has no Prodigy option', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  game.getTowers().push(tower);
  assert.equal(game.getProdigyOption(tower), null);

  game.purchaseUpgrade(tower, 0);
  game.purchaseUpgrade(tower, 0);
  assert.equal(tower.upgradesPurchased, 2);
  assert.equal(game.getProdigyOption(tower), null); // partway still doesn't count
});

test('reaching tier 4 on ANY of the 3 paths grants the option, not just path 0', () => {
  const game = loadFullGameContext();
  [0, 1, 2].forEach((pathIndex) => {
    const tower = maxedTower(game, 'rose', pathIndex);
    const option = game.getProdigyOption(tower);
    assert.ok(option, `path ${pathIndex} should unlock the option`);
    assert.equal(option.typeKey, 'mangler');
    game.getTowers().length = 0; // clear before the next path's tower, to avoid tripping the singleton cap
  });
});

test('the option names the right Prodigy per base type, at its own real cost', () => {
  const game = loadFullGameContext();
  // Costs read from TOWER_TYPES itself (not hardcoded) — a balance pass
  // (direct request: "don't overprice the top end") cut all 4 Prodigy
  // costs by roughly a third; this test only cares that getProdigyOption
  // reports whatever each Prodigy's own real, current cost is, not a
  // specific dollar figure that would go stale the next time it's tuned.
  const sunflowerOption = game.getProdigyOption(maxedTower(game, 'sunflower'));
  assert.deepEqual(sunflowerOption, {
    typeKey: 'sunlitConductor',
    name: 'The Sunlit Conductor',
    cost: game.TOWER_TYPES.sunlitConductor.cost,
  });

  game.getTowers().length = 0;
  const roseOption = game.getProdigyOption(maxedTower(game, 'rose'));
  assert.deepEqual(roseOption, {
    typeKey: 'mangler',
    name: 'The Mangler',
    cost: game.TOWER_TYPES.mangler.cost,
  });

  game.getTowers().length = 0;
  const mushroomOption = game.getProdigyOption(maxedTower(game, 'mushroom'));
  assert.deepEqual(mushroomOption, {
    typeKey: 'fungalMess',
    name: 'The Fungal Mess',
    cost: game.TOWER_TYPES.fungalMess.cost,
  });
});

test("Corpse Flower's maxed option is its own Prodigy, Amorphophallus titanum, at its own real (current) cost", () => {
  const game = loadFullGameContext();
  const tower = maxedTower(game, 'corpseFlower');
  assert.deepEqual(game.getProdigyOption(tower), {
    typeKey: 'amorphophallusTitanum',
    name: 'Amorphophallus titanum',
    cost: game.TOWER_TYPES.amorphophallusTitanum.cost,
  });
});

test('a Prodigy is capped at 1 on the field at a time — a second maxed tower of the same type gets no option', () => {
  const game = loadFullGameContext();
  const first = maxedTower(game, 'sunflower', 0);
  const firstOption = game.getProdigyOption(first);
  assert.ok(firstOption);

  // A second, independently-maxed Sunflower, while nothing has actually
  // become a Prodigy yet — still allowed, the cap only triggers once one
  // is actually ON THE FIELD.
  const second = maxedTower(game, 'sunflower', 1);
  assert.ok(game.getProdigyOption(second));

  // Now place an actual Sunlit Conductor (simulating the transformation
  // directly) and confirm neither maxed Sunflower gets the option anymore.
  const conductor = game.createTower('sunlitConductor');
  game.getTowers().push(conductor);
  assert.equal(game.getProdigyOption(first), null);
  assert.equal(game.getProdigyOption(second), null);
});

test('the singleton cap is independent per Prodigy type', () => {
  const game = loadFullGameContext();
  const conductor = game.createTower('sunlitConductor');
  game.getTowers().push(conductor);

  const maxedRose = maxedTower(game, 'rose', 0);
  assert.ok(game.getProdigyOption(maxedRose)); // Mangler's own cap is untouched by the Conductor
});

// --- activateRegion('prodigy-upgrade'): the actual transformation --------

test('the upgrade transforms the tower in place: same spot, new type, combined cost', () => {
  const game = loadFullGameContext();
  game.setMoney(1000000);
  const tower = maxedTower(game, 'sunflower', 1);
  tower.moneySpent = 1234; // whatever was actually spent getting it here
  game.setSelectedTower(tower);
  const moneyBefore = game.getMoney();

  const option = game.getProdigyOption(tower);
  game.activateRegion({ id: 'prodigy-upgrade', data: option });

  assert.equal(game.getTowers().length, 1); // replaced, not added alongside it
  const prodigy = game.getTowers()[0];
  assert.equal(prodigy.type, 'sunlitConductor');
  assert.equal(prodigy.x, tower.x);
  assert.equal(prodigy.y, tower.y);
  assert.equal(prodigy.moneySpent, 1234 + option.cost);
  assert.equal(game.getSelectedTower(), prodigy); // the panel follows the transformation
  assert.equal(moneyBefore - game.getMoney(), option.cost);
});

test('the transformation does not carry over the old tower\'s upgrade-path effects', () => {
  const game = loadFullGameContext();
  game.setMoney(1000000);
  const tower = maxedTower(game, 'sunflower', 0); // Solar Path's tier 4 (Solar Ray) gives it a real burn effect
  assert.ok(tower.burn); // sanity check on the fixture itself
  game.setSelectedTower(tower);

  const option = game.getProdigyOption(tower);
  game.activateRegion({ id: 'prodigy-upgrade', data: option });

  const prodigy = game.getTowers()[0];
  assert.equal(prodigy.burn, null); // a genuinely fresh tower, not the old one with new stats bolted on
});

test('the upgrade refuses when the player can\'t afford it', () => {
  const game = loadFullGameContext();
  game.startGame('medium'); // real economy, not Sandbox's unlimited money
  game.setMoney(100);
  const tower = maxedTower(game, 'rose', 0);
  game.setSelectedTower(tower);

  const option = game.getProdigyOption(tower);
  game.activateRegion({ id: 'prodigy-upgrade', data: option });

  assert.equal(game.getTowers().length, 1);
  assert.equal(game.getTowers()[0], tower); // unchanged
  assert.equal(game.getMoney(), 100);
});

test('the upgrade is a no-op with no tower selected', () => {
  const game = loadFullGameContext();
  game.setMoney(1000000);
  const fakeOption = { typeKey: 'sunlitConductor', name: 'The Sunlit Conductor', cost: 30000 };
  game.setSelectedTower(null);

  game.activateRegion({ id: 'prodigy-upgrade', data: fakeOption });

  assert.equal(game.getTowers().length, 0);
});

test('the upgrade re-validates itself rather than trusting a stale option object', () => {
  const game = loadFullGameContext();
  game.setMoney(1000000);
  const tower = maxedTower(game, 'mushroom', 0);
  game.setSelectedTower(tower);
  const option = game.getProdigyOption(tower);

  // The cap fills up (another Fungal Mess appears) in between the option
  // being computed and the click landing — the stale `option` object
  // itself still looks valid, but re-deriving it from the tower should not.
  game.getTowers().push(game.createTower('fungalMess'));

  game.activateRegion({ id: 'prodigy-upgrade', data: option });

  // Still just the original maxed Mushroom plus the pre-existing Fungal
  // Mess — no second transformation happened.
  assert.equal(game.getTowers().length, 2);
  assert.equal(game.getTowers().filter((t) => t.type === 'fungalMess').length, 1);
});

// --- Destroying other towers of the same base type ------------------------
// Direct request: becoming a Prodigy destroys every OTHER tower of the same
// base type still on the field — a real tradeoff, not a free lateral move.
// activateRegion() gates this behind a window.confirm() prompt (same
// no-refund, confirm-first treatment as Mushroom's Neurological upgrade),
// which isn't stubbed in this Node test harness — so, same convention
// mushroom-infect-path.test.js's own Neurological coverage already follows,
// the confirm()-gated path itself isn't exercised through activateRegion
// here. getOtherTowersOfSameType()/destroyTowers() are tested directly
// instead, since activateRegion is just those two calls plus the prompt.

test('getOtherTowersOfSameType finds every OTHER tower sharing a base type, never itself or a different type', () => {
  const game = loadFullGameContext();
  const a = game.createTower('sunflower');
  const b = game.createTower('sunflower');
  const rose = game.createTower('rose');
  game.getTowers().push(a, b, rose);

  assert.deepEqual(game.getOtherTowersOfSameType(a), [b]);
  assert.deepEqual(game.getOtherTowersOfSameType(rose), []);
});

test('destroyTowers removes every victim from the field and leaves a visual effect at each one\'s spot, no refund', () => {
  const game = loadFullGameContext();
  const survivor = game.createTower('mushroom');
  survivor.x = 0;
  survivor.y = 0;
  const victim = game.createTower('sunflower');
  victim.x = 70;
  victim.y = 40;
  game.getTowers().push(survivor, victim);
  const moneyBefore = game.getMoney();

  game.destroyTowers([victim]);

  assert.deepEqual(game.getTowers(), [survivor]);
  assert.equal(game.getMoney(), moneyBefore); // no refund
  const effects = game.getConsumedTowerEffects();
  assert.equal(effects.length, 1);
  assert.equal(effects[0].x, 70);
  assert.equal(effects[0].y, 40);
});

test('the full same-type-destruction step (what activateRegion runs once confirmed) leaves only the Prodigy and other-type towers standing', () => {
  const game = loadFullGameContext();
  const maxedOne = maxedTower(game, 'sunflower', 0);
  const otherSunflower = game.createTower('sunflower');
  otherSunflower.x = 500;
  otherSunflower.y = 500;
  const unrelatedRose = game.createTower('rose');
  unrelatedRose.x = 600;
  unrelatedRose.y = 600;
  game.getTowers().push(otherSunflower, unrelatedRose);

  const victims = game.getOtherTowersOfSameType(maxedOne);
  assert.deepEqual(victims, [otherSunflower]); // the Rose is a different type — untouched
  game.destroyTowers(victims);

  // Mirrors activateRegion's own post-destruction step: splice the new
  // Prodigy in at the (now possibly shifted) index of the transformed tower.
  const prodigy = game.createTower('sunlitConductor');
  prodigy.x = maxedOne.x;
  prodigy.y = maxedOne.y;
  game.getTowers()[game.getTowers().indexOf(maxedOne)] = prodigy;

  assert.deepEqual(
    game.getTowers().map((t) => t.type).sort(),
    ['rose', 'sunlitConductor']
  );
});

// --- The Sunlit Conductor (Sunflower's Prodigy): ~429 dps continuous ray -
// Balance pass (direct request: "make prodigies actually worth the
// money"): damage/speed buffed from the original 65 dmg/0.5s (130 dps)
// so it clearly outpaces a maxed Fire Path Sunflower's own ~90-130 dps.

test('The Sunlit Conductor deals 150 damage per hit via a continuous ray — instant, no projectile travel time', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunlitConductor');
  tower.x = 0;
  tower.y = 0;
  assert.equal(tower.attackType, 'ray');
  assert.equal(tower.stats.damage, 150);
  assert.equal(tower.stats.attackInterval, 0.35); // 150 every 0.35s = ~429 dps

  const target = makeTestEnemy({ x: 100, y: 0 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);

  assert.equal(target.health, 100000 - 150); // applied immediately, not carried by a projectile
  assert.equal(game.getProjectiles().length, 0);
});

// --- The Mangler (Rose's Prodigy): ~286 dps continuous + periodic grab ---
// Same balance pass as the Sunlit Conductor above: damage/speed/grab all
// buffed from the original 40 dmg/0.5s (80 dps) + 50-dmg/5s grab.

test('The Mangler\'s base attack deals 100 damage per second as an ordinary thrown projectile', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('mangler');
  tower.x = 0;
  tower.y = 0;
  assert.equal(tower.attackType, 'projectile'); // no baseAttackType override — same delivery as every base tower
  assert.equal(tower.stats.damage, 100);
  assert.equal(tower.stats.attackInterval, 0.35); // 100 every 0.35s = ~286 dps

  const target = makeTestEnemy({ x: 100, y: 0 });
  game.getActiveEnemies().push(target);

  game.updateTowerAttack(tower, tower.x, tower.y, 1 / 60);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.health, 100000 - 100);
});

test('The Mangler never grabs instantly — grabCooldown starts at the full interval', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('mangler');
  assert.equal(tower.grabInterval, 3);
  assert.equal(tower.grabDamage, 120);
  assert.equal(tower.grabDuration, 1);
  assert.equal(tower.grabCooldown, tower.grabInterval);
});

test('every grabInterval seconds, the Mangler grabs a random non-boss enemy for bonus damage and immobilizes it', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('mangler');
  tower.x = 0;
  tower.y = 0;
  const target = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(target);

  game.updateTowerGrab(tower, tower.x, tower.y, tower.grabInterval - 0.001);
  assert.equal(target.health, 100000); // not yet — hasn't reached the interval
  assert.equal(target.immobilizedRemaining, 0);

  game.updateTowerGrab(tower, tower.x, tower.y, 0.002); // crosses the threshold
  assert.equal(target.health, 100000 - tower.grabDamage);
  assert.equal(target.immobilizedRemaining, tower.grabDuration);
});

test('the grab never targets a boss — nothing happens if only a boss is in range', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('mangler');
  tower.x = 0;
  tower.y = 0;
  const boss = makeTestEnemy({ x: 50, y: 0, isBoss: true });
  game.getActiveEnemies().push(boss);

  game.updateTowerGrab(tower, tower.x, tower.y, tower.grabInterval);

  assert.equal(boss.health, 100000);
  assert.equal(boss.immobilizedRemaining, 0);
});

test('the grab\'s bonus damage is additive on top of the continuous attack, not a replacement', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('mangler');
  tower.x = 0;
  tower.y = 0;
  const target = makeTestEnemy({ x: 50, y: 0 });
  game.getActiveEnemies().push(target);

  // One call at exactly the grab interval fires both the main attack
  // (spawns a projectile — not yet resolved) and the grab (instant) in
  // the same tick.
  game.updateTowerAttack(tower, tower.x, tower.y, tower.grabInterval);
  assert.equal(target.health, 100000 - tower.grabDamage); // grab already landed, projectile still in flight

  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60); // let the main attack's projectile land too

  assert.equal(target.health, 100000 - tower.grabDamage - tower.stats.damage); // 120 + 100 = 220 total
});

// --- The Fungal Mess (Mushroom's Prodigy): 325 dps + reanimation ---------
// Same balance pass: damage/speed buffed from the original 50 dmg/0.5s
// (100 dps) — Mushroom's own lineage (Decay Path) is the weakest in the
// roster on raw DPS, so this buff alone makes Fungal Mess a clear win
// without also needing a bigger reanimateChance.

function makeReanimatingFungalMess(game, chance) {
  const tower = game.createTower('fungalMess');
  tower.reanimateChance = chance; // override for a deterministic test
  return tower;
}

test('The Fungal Mess deals 130 damage per hit at its own faster cadence, and has its real 15% reanimateChance by default', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('fungalMess');
  assert.equal(tower.stats.damage, 130);
  assert.equal(tower.stats.attackInterval, 0.4); // 130 every 0.4s = 325 dps
  assert.equal(tower.attackType, 'projectile');
  assert.equal(tower.reanimateChance, 0.15);
});

test('a 100% reanimateChance killing blow turns the victim into a purple zombie instead of a normal kill', () => {
  const game = loadFullGameContext();
  const tower = makeReanimatingFungalMess(game, 1);
  tower.x = 0;
  tower.y = 0;

  const target = makeTestEnemy({ x: 100, y: 0, health: 1 }); // one hit from dying
  game.getActiveEnemies().push(target);

  game.spawnProjectile(tower, target);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.isPurpleZombie, true);
  assert.equal(target.isZombie, false); // a deliberately separate state from Decay Path's zombie
  assert.ok(target.health > 0); // alive again — bypasses the normal kill sweep
});

test('a purple zombie never shows up as a bounty-eligible kill, and stays in the world', () => {
  const game = loadFullGameContext();
  const tower = makeReanimatingFungalMess(game, 1);
  tower.x = 0;
  tower.y = 0;

  const target = makeTestEnemy({ x: 100, y: 0, health: 1 });
  game.getActiveEnemies().push(target);
  game.spawnProjectile(tower, target);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  const killed = game.updateEnemies(1 / 60);
  assert.equal(killed.length, 0);
  assert.equal(game.getActiveEnemies().includes(target), true);
});

test('bosses are never reanimated, even at a 100% chance', () => {
  const game = loadFullGameContext();
  const tower = makeReanimatingFungalMess(game, 1);
  tower.x = 0;
  tower.y = 0;

  const boss = makeTestEnemy({ x: 100, y: 0, health: 1, isBoss: true });
  game.getActiveEnemies().push(boss);
  game.spawnProjectile(tower, boss);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(boss.isPurpleZombie, false);
  assert.ok(boss.health <= 0); // a normal kill
});

test('a 0% reanimateChance override never reanimates anything', () => {
  const game = loadFullGameContext();
  const tower = makeReanimatingFungalMess(game, 0);
  tower.x = 0;
  tower.y = 0;

  const target = makeTestEnemy({ x: 100, y: 0, health: 1 });
  game.getActiveEnemies().push(target);
  game.spawnProjectile(tower, target);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.isPurpleZombie, false);
  assert.ok(target.health <= 0);
});

test('a non-killing hit never rolls reanimation, even at 100% chance', () => {
  const game = loadFullGameContext();
  const tower = makeReanimatingFungalMess(game, 1);
  tower.x = 0;
  tower.y = 0;

  const target = makeTestEnemy({ x: 100, y: 0, health: 100000 }); // this hit won't kill it
  game.getActiveEnemies().push(target);
  game.spawnProjectile(tower, target);
  for (let i = 0; i < 30; i += 1) game.updateProjectiles(1 / 60);

  assert.equal(target.isPurpleZombie, false);
});

test('a purple zombie walks FORWARD (increasing waypointIndex), unlike Decay Path\'s backward-walking zombie', () => {
  const game = loadFullGameContext();
  const zombie = makeTestEnemy({ x: 220, y: 150, waypointIndex: 1, speed: 1000 });
  zombie.isPurpleZombie = true;
  game.getActiveEnemies().push(zombie);

  game.updateEnemies(1);

  assert.ok(zombie.waypointIndex > 1); // advanced forward through the path, not backward
});

test('a purple zombie that leaks deals a flat 20 damage, not its own maxHealth', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  game.setPlayerHealth(500);

  game.getActiveEnemies().length = 0;
  game.getActiveEnemies().push(makeArrivedEnemy({ maxHealth: 99999, health: 1, isPurpleZombie: true }));

  game.update(1 / 60);

  assert.equal(game.getPlayerHealth(), 480); // 500 - 20 (flat), not 500 - 99999
});

test('a purple zombie and a normal leaked enemy in the same tick each apply their own rule', () => {
  const game = loadFullGameContext();
  game.startGame('medium');
  game.setPlayerHealth(500);

  game.getActiveEnemies().length = 0;
  game.getActiveEnemies().push(
    makeArrivedEnemy({ maxHealth: 99999, health: 1, isPurpleZombie: true }), // 20, flat
    makeArrivedEnemy({ maxHealth: 40, health: 40 }) // 40, its own maxHealth
  );

  game.update(1 / 60);

  assert.equal(game.getPlayerHealth(), 500 - 20 - 40);
});

// --- Generic systems (visual size / placement collision / sell refund) ---
// apply to Prodigies with no special-casing needed anywhere.

test('generic tower systems (visual size, placement collision, sell refund) already work for Prodigies untouched', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(1000000);

  const conductor = game.createTower('sunlitConductor');
  assert.equal(game.getTowerVisualSize(conductor), 32); // its own base size, under the 65 cap

  conductor.x = 300;
  conductor.y = 300;
  conductor.moneySpent = 30000;
  game.getTowers().push(conductor);

  assert.equal(game.isTowerPlacementBlocked(305, 305, 'mangler'), true); // too close
  assert.equal(game.isTowerPlacementBlocked(600, 300, 'mangler'), false); // clear

  assert.equal(game.getSellRefund(conductor), 15000); // 30000 * 0.5, same SELL_REFUND_RATE as everything else
});
