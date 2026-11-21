const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Dedicated coverage for the balance pass (direct request): "the game
// doesn't get harder late" was diagnosed as enemy health scaling being
// linear (+10% every 3 rounds) while player power (compounding upgrade
// multipliers, more towers over time) grows multiplicatively — see
// getRoundScaling()'s own comment in enemies.js for the full writeup.
// enemies.test.js/towers.test.js cover the individual functions' own
// unit behavior; these tests check the actual real-world property the
// balance pass was meant to restore.

test('a fixed amount of damage-per-hit needs dramatically more hits to kill a round-100 enemy than a round-1 one', () => {
  const game = loadGameContext();
  const round1Health = game.generateWave(1)[0].health;
  const round100Health = game.generateWave(100)[0].health;
  const fixedDamagePerHit = 10; // a representative, unchanging hit — the enemy side is what should move

  const hitsRound1 = Math.ceil(round1Health / fixedDamagePerHit);
  const hitsRound100 = Math.ceil(round100Health / fixedDamagePerHit);

  // Under the old linear curve this ratio was ~4.3x; the whole point of
  // the balance pass is that it's now dramatically more than that.
  assert.ok(hitsRound100 / hitsRound1 > 10);
});

test('wave size keeps growing past round 25 too, not just health — a second, independent axis of late-game pressure', () => {
  const game = loadGameContext();
  const round25Size = game.getTotalWaveSize(25);
  const round100Size = game.getTotalWaveSize(100);
  const round200Size = game.getTotalWaveSize(200);
  assert.ok(round100Size > round25Size);
  assert.ok(round200Size > round100Size || round200Size === game.getTotalWaveSize(10000)); // may have hit the ceiling by 200
});

test('bounty tracks the same round-scaling multiplier as health, for both regular enemies and bosses', () => {
  const game = loadGameContext();

  const scaling60 = game.getRoundScaling(60).healthMultiplier;
  const regular = game.generateWave(60)[0];
  const baseAnt = game.FOREST_ROSTER.enemyTypes.ant;
  assert.equal(regular.bounty, Math.round(baseAnt.bounty * scaling60));
  assert.equal(regular.health, Math.round(baseAnt.health * scaling60));

  const bossScaling = game.getRoundScaling(50).healthMultiplier;
  const boss = game.generateWave(50)[0];
  const baseBoss = game.FOREST_ROSTER.bossTypes[2]; // Longhorn Beetle, round 50
  assert.equal(boss.bounty, Math.round(baseBoss.bounty * bossScaling));
  assert.equal(boss.health, Math.round(baseBoss.health * bossScaling));
});

test('Sunflower\'s Fire Path is no longer dramatically ahead of Solar/Storm Path in DPS-per-dollar (the outlier this pass trimmed)', () => {
  const game = loadFullGameContext();

  function maxPath(pathIndex) {
    const tower = game.createTower('sunflower');
    for (let tier = 0; tier < 4; tier += 1) {
      const before = tower.upgradesPurchased;
      game.purchaseUpgrade(tower, pathIndex);
      if (tower.upgradesPurchased === before) break; // path maxed or undesigned
    }
    return tower;
  }

  const solar = maxPath(0);
  const fire = maxPath(1);
  const storm = maxPath(2);

  const solarDps = solar.stats.damage / solar.stats.attackInterval;
  const fireDps = fire.stats.damage / fire.stats.attackInterval;
  const stormDps = storm.stats.damage / storm.stats.attackInterval;

  // Fire Path's own base-attack DPS should still be the strongest of the
  // three (that's its whole identity, and it still has puddle/orbit AoE
  // on top that this DPS figure doesn't even count), but no longer by an
  // absurd margin. History: originally ~5.3x Solar's (266.7 vs 50 dps);
  // a first pass softened Molten Core's own attack-speed bonus from a
  // flat 0.5x to 0.75x, bringing it to ~3.6x; a 2nd, broader balance pass
  // (direct request: "make towers not overpowered for their price," a
  // full roster $/DPS survey) found Fire Path was STILL the cheapest DPS
  // in the game even after that — removed Molten Core's speed bonus
  // entirely (it was always redundant with Spark's own, right below it
  // in the same path) and softened Spark's own doubling to a 25% speedup,
  // landing at ~1.67x Solar's — comfortably ahead (still the fastest-
  // attacking path) without being in a different league.
  assert.ok(fireDps > solarDps);
  assert.ok(fireDps > stormDps);
  assert.ok(fireDps / solarDps < 2); // was ~5.3x originally, ~3.6x after the first fix
});

test('starting money and base tower costs all reflect the balance pass', () => {
  const game = loadFullGameContext();
  assert.equal(game.STARTING_MONEY, 75);
  assert.deepEqual(
    Object.fromEntries(game.SHOP_ITEMS.map((item) => [item.typeKey, item.cost])),
    { sunflower: 50, rose: 90, mushroom: 150, corpseFlower: 750 }
  );
});
