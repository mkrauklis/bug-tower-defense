const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Corpse Flower's Growth Path (direct request): the 3rd and final path,
// mutually exclusive with Hazard/Acidic Mixture. Pure damage scaling, no
// secondary mechanic — attackDamage 25/45/70/120 (an absolute replace,
// same key the other two paths use). Grows taller at every tier (unlike
// Hazard/Acidic, which only grow at their own tiers 2/4); turns pink at
// tier 2 ("Growth Spurt," plus a 40% range boost); grows 2 small
// satellite blooms at tier 3 ("Giantness"); turns purple at tier 4
// ("Titan Arum").

test('Growth Path is real (path 3) and mutually exclusive with the other two', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  assert.ok(game.getAvailableUpgrade(tower, 2)); // Growth Path

  game.purchaseUpgrade(tower, 2);
  assert.equal(tower.chosenPath, 2);
  assert.equal(game.getAvailableUpgrade(tower, 0), null); // Hazard Path locked out
  assert.equal(game.getAvailableUpgrade(tower, 1), null); // Acidic Mixture Path locked out
});

test('each tier replaces the base attack damage with its own absolute value: 25/45/70/120', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');

  game.purchaseUpgrade(tower, 2); // Sproutful
  assert.equal(tower.stats.damage, 25);

  game.purchaseUpgrade(tower, 2); // Growth Spurt
  assert.equal(tower.stats.damage, 45);

  game.purchaseUpgrade(tower, 2); // Giantness
  assert.equal(tower.stats.damage, 70);

  game.purchaseUpgrade(tower, 2); // Titan Arum
  assert.equal(tower.stats.damage, 120); // "a lot more damage" — the biggest single jump in the path
});

test('tier 2 ("better range") bumps range 40%, and the flower changes color at tiers 2 (pink) and 4 (purple)', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('corpseFlower');
  const baseRange = tower.stats.range;
  const baseColor = tower.stats.color;

  game.purchaseUpgrade(tower, 2); // Sproutful — no color/range change yet
  assert.equal(tower.stats.range, baseRange);
  assert.equal(tower.stats.color, baseColor);

  game.purchaseUpgrade(tower, 2); // Growth Spurt — pink, +40% range
  assert.equal(tower.stats.color, '#d81b94');
  assert.ok(Math.abs(tower.stats.range - baseRange * 1.4) < 1e-9);

  game.purchaseUpgrade(tower, 2); // Giantness — no further color/range change
  assert.equal(tower.stats.color, '#d81b94');
  assert.ok(Math.abs(tower.stats.range - baseRange * 1.4) < 1e-9);

  game.purchaseUpgrade(tower, 2); // Titan Arum — purple
  assert.equal(tower.stats.color, '#6a1b9a');
});
