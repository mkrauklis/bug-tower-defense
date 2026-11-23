const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Cost/pricing pass (direct request, relayed from the peer session, a
// separate follow-up from the older test/balance-pass.test.js — that one
// covers an earlier pass about enemy-scaling/Fire-Path's own DPS; this is
// specifically about retuning upgrade-tier/Prodigy COSTS): "review every
// tower's base cost and every upgrade path's 4 tier costs... retune so
// the cost-to-value ratio holds steady or improves as you go up tiers"
// plus "don't overprice the top end — final (tier 4) upgrades and all 4
// Prodigies should be clearly premium but still attainable." This was a
// COST-ONLY pass — no upgrade's effects/mechanics changed, only the
// `cost` field of the specific tiers/Prodigies found to be the worst
// DPS-per-dollar (or $/CC-value) outliers in their own path. See
// towers.js's own per-tier comments (search "Balance pass") for the full
// per-path reasoning/numbers behind each change below.
//
// These tests intentionally snapshot the NEW real numbers (not just
// "cheaper than before") so a future tuning pass has a clear, current
// baseline to diff against, plus a couple of general invariants (costs
// still escalate tier over tier; Prodigies still cost meaningfully more
// than maxing the base tower they replace) that should hold regardless of
// the exact dollar figures.

test('every upgrade path\'s 4 tiers still cost strictly more than the one before (escalation preserved by this pass)', () => {
  const game = loadGameContext();
  Object.values(game.TOWER_TYPES).forEach((towerType) => {
    (towerType.upgradePaths || []).forEach((path) => {
      if (!path) return;
      let lastCost = 0;
      path.upgrades.forEach((upgrade) => {
        if (!upgrade) return;
        assert.ok(
          upgrade.cost > lastCost,
          `${towerType.name} / ${path.name} / ${upgrade.name}: $${upgrade.cost} is not more than the previous tier's $${lastCost}`
        );
        lastCost = upgrade.cost;
      });
    });
  });
});

test('Sunflower\'s Solar Path/Storm Path top tiers were brought down (worst DPS-per-dollar in the roster)', () => {
  const game = loadGameContext();
  const solar = game.TOWER_TYPES.sunflower.upgradePaths[0];
  const storm = game.TOWER_TYPES.sunflower.upgradePaths[2];
  assert.equal(solar.upgrades[3].name, 'Solar Ray');
  assert.equal(solar.upgrades[3].cost, 900); // was 1500
  assert.equal(storm.upgrades[2].name, 'Conductor');
  assert.equal(storm.upgrades[2].cost, 250); // was 300
  assert.equal(storm.upgrades[3].name, 'Shockwave');
  assert.equal(storm.upgrades[3].cost, 500); // was 750
});

test('Rose\'s Projectile Path middle tiers were brought down', () => {
  const game = loadGameContext();
  const projectile = game.TOWER_TYPES.rose.upgradePaths[2];
  assert.equal(projectile.upgrades[1].name, 'Projectiles');
  assert.equal(projectile.upgrades[1].cost, 200); // was 250
  assert.equal(projectile.upgrades[2].name, 'Even More Projectiles');
  assert.equal(projectile.upgrades[2].cost, 350); // was 450
});

test('Mushroom\'s Decay Path/Infect Path top tiers were brought down', () => {
  const game = loadGameContext();
  const decay = game.TOWER_TYPES.mushroom.upgradePaths[0];
  const infect = game.TOWER_TYPES.mushroom.upgradePaths[2];
  assert.equal(decay.upgrades[1].name, 'Zombify');
  assert.equal(decay.upgrades[1].cost, 550); // was 750
  assert.equal(infect.upgrades[3].name, 'Neurological');
  assert.equal(infect.upgrades[3].cost, 4000); // was 5000
});

test("Corpse Flower's top-heavy tiers (the worst-value tiers in the game) were brought down the most", () => {
  const game = loadGameContext();
  const [hazard, acidic, growth] = game.TOWER_TYPES.corpseFlower.upgradePaths;

  assert.equal(hazard.upgrades[2].cost, 6500); // Eminent Chamber, was 8500
  assert.equal(hazard.upgrades[3].cost, 11000); // Gas Leak, was 15000

  assert.equal(acidic.upgrades[2].cost, 6500); // Acidtonics, was 8500
  // Dissolvable Mixture adds zero extra attack/acid damage (only +2s slow
  // duration) -- the single worst DPS-per-dollar tier found in the whole
  // pass, so it got the single largest cut.
  assert.equal(acidic.upgrades[3].name, 'Dissolvable Mixture');
  assert.equal(acidic.upgrades[3].cost, 8000); // was 15000

  assert.equal(growth.upgrades[2].cost, 7000); // Giantness, was 8500
  assert.equal(growth.upgrades[3].cost, 12000); // Titan Arum, was 15000
});

test("Arctic Willow's Frosted/Brittle Path top tiers were brought down", () => {
  const game = loadGameContext();
  const [frosted, brittle] = game.TOWER_TYPES.arcticWillow.upgradePaths;
  assert.equal(frosted.upgrades[3].name, 'Frosterizer');
  assert.equal(frosted.upgrades[3].cost, 1200); // was 1500
  assert.equal(brittle.upgrades[2].name, 'Fractured Ice');
  assert.equal(brittle.upgrades[2].cost, 550); // was 650
  assert.equal(brittle.upgrades[3].name, 'Cryo-fracture');
  assert.equal(brittle.upgrades[3].cost, 1300); // was 1500
});

test('every Prodigy got a meaningful cut, keeping the same relative ladder, while staying clearly the priciest thing in its own lineage', () => {
  const game = loadGameContext();
  const costs = {
    sunlitConductor: game.TOWER_TYPES.sunlitConductor.cost,
    mangler: game.TOWER_TYPES.mangler.cost,
    fungalMess: game.TOWER_TYPES.fungalMess.cost,
    amorphophallusTitanum: game.TOWER_TYPES.amorphophallusTitanum.cost,
  };
  assert.deepEqual(costs, {
    sunlitConductor: 20000, // was 30000
    mangler: 28000, // was 45000
    fungalMess: 38000, // was 60000
    amorphophallusTitanum: 65000, // was 100000
  });
  // The relative ladder itself (Conductor cheapest -> Titan Arum priciest)
  // is unchanged by the cut.
  assert.ok(costs.sunlitConductor < costs.mangler);
  assert.ok(costs.mangler < costs.fungalMess);
  assert.ok(costs.fungalMess < costs.amorphophallusTitanum);
});

test('a Prodigy still costs meaningfully more than maxing out the base tower it replaces (stays a genuine premium step, not a minor add-on)', () => {
  const game = loadGameContext();
  const cumulativePathCost = (type) =>
    Math.min(
      ...type.upgradePaths
        .filter((path) => path && path.upgrades.every(Boolean))
        .map((path) => path.upgrades.reduce((sum, upgrade) => sum + upgrade.cost, 0))
    );

  const sunflowerBestPath = cumulativePathCost(game.TOWER_TYPES.sunflower);
  assert.ok(game.TOWER_TYPES.sunlitConductor.cost > sunflowerBestPath * 3);

  const roseBestPath = cumulativePathCost(game.TOWER_TYPES.rose);
  assert.ok(game.TOWER_TYPES.mangler.cost > roseBestPath * 3);
});
