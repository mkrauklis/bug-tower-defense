const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Sandbox's spawn palette (renderSandboxSpawnSection in game.js) used to
// lock a tile until the player had defeated that enemy in a real
// (non-Sandbox) game at least once. Removed on direct request ("make it
// so im able to spawn in any enemy i want in sandbox no matter what") —
// every enemy should be spawnable in Sandbox regardless of
// defeatedEnemyKeys. These tests cover the activateRegion()/getTooltipLines()
// side of that (the render function itself has no exported hook, but it
// reads the exact same getAllSpawnableEnemyKeys()/entry data with no
// per-tile "defeated" gate left in its source).

test('activateRegion spawns an enemy from a spawn: region even if it was never defeated before', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  assert.equal(game.getDefeatedEnemyKeys().includes('ant'), false);

  game.activateRegion({ id: 'spawn:ant', data: { key: 'ant', name: 'Ant' } });

  const enemies = game.getActiveEnemies();
  assert.equal(enemies.some((e) => e.enemyKey === 'ant'), true);
});

test('activateRegion still spawns a boss enemy with no defeated-boss requirement', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  assert.equal(game.getDefeatedEnemyKeys().includes('forest-boss-tier-1'), false);

  game.activateRegion({ id: 'spawn:forest-boss-tier-1', data: { key: 'forest-boss-tier-1', name: 'Giant Queen' } });

  const enemies = game.getActiveEnemies();
  assert.equal(enemies.some((e) => e.enemyKey === 'forest-boss-tier-1'), true);
});

test('getTooltipLines for a spawn: region always invites a click, with no locked-state message', () => {
  const game = loadFullGameContext();
  const region = { id: 'spawn:ant', data: { key: 'ant', name: 'Ant' } };

  const lines = game.getTooltipLines(region);

  assert.deepEqual(lines, ['Ant', 'Click to spawn one.']);
});

test('the Sandbox mode description no longer promises only enemies defeated before', () => {
  const game = loadFullGameContext();
  const sandbox = game.GAME_MODES.sandbox;

  assert.ok(!sandbox.description.includes('defeated before'));
  assert.ok(sandbox.description.includes('no matter what'));
});
