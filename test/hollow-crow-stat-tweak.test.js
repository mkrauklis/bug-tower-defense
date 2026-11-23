const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Stat tweak (direct follow-up request, relayed from the peer session):
// "cut its movement speed way down... a real lumbering/inevitable-
// feeling final boss" and "multiply its current health by 20x." Visual
// art (drawHollowCrow) and every other stat (damage/bounty/armor) are
// untouched — see HOLLOW_ROSTER's own bossTypes[2] comment in enemies.js
// for the one judgment call this needed (the leak-damage mechanic was
// already effectively "instant game over" at the OLD 800 health, so
// 16000 doesn't newly break anything there).

test('The Hollow Crow\'s health is exactly 20x its old 800 (16000), speed is 0.1 — unambiguously slower than every other boss in the game', () => {
  const game = loadGameContext();
  const crow = game.MAP_ROSTERS.hollow.bossTypes[2];
  assert.equal(crow.health, 16000);
  assert.equal(crow.speedMultiplier, 0.1);

  const everyOtherBossSpeed = [];
  Object.values(game.MAP_ROSTERS).forEach((roster) => {
    Object.entries(roster.bossTypes).forEach(([tier, boss]) => {
      if (roster === game.MAP_ROSTERS.hollow && Number(tier) === 2) return; // the crow itself
      everyOtherBossSpeed.push(boss.speedMultiplier);
    });
  });
  assert.ok(everyOtherBossSpeed.length > 0);
  everyOtherBossSpeed.forEach((speed) => {
    assert.ok(crow.speedMultiplier < speed, `expected Hollow Crow's ${crow.speedMultiplier} to be slower than every other boss, found one at ${speed}`);
  });
});

test('its own radius/bounty/armor are untouched by this pass (visual/CC/economy, not in scope)', () => {
  const game = loadGameContext();
  const crow = game.MAP_ROSTERS.hollow.bossTypes[2];
  assert.equal(crow.radius, 27);
  assert.equal(crow.bounty, 400);
  assert.equal(crow.armorThreshold, undefined);
  assert.equal(crow.color, '#1c1c1c');
});

test('round 50 still correctly ends in a dedicated victory state no matter how long the fight actually takes (sanity-checking the request\'s own stated concern)', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.theHollowEvent);
  game.startGame('adventure');
  game.setAutoContinue(true);

  for (let i = 0; i < 49; i += 1) {
    game.getActiveEnemies().length = 0;
    game.update(1 / 60);
  }
  assert.equal(game.getRound(), 50);
  assert.equal(game.getGameState(), 'playing');

  const boss = game.getActiveEnemies().find((e) => e.isBoss);
  assert.ok(boss, 'expected round 50\'s own wave to be the boss');
  const startingHealth = boss.health;
  assert.ok(startingHealth > 10000, 'expected the 20x health bump to actually be in effect here');

  // Simulate a genuinely long fight (steady chip damage over many ticks)
  // rather than nuking activeEnemies outright — confirms nothing about
  // round-50's own win trigger or the countdown HUD assumes a short
  // fight, and that the run never offers a "round 51" partway through.
  let ticks = 0;
  while (game.getActiveEnemies().length > 0 && ticks < 20000) {
    const enemy = game.getActiveEnemies()[0];
    if (enemy) {
      enemy.health -= 25;
      if (enemy.health <= 0) game.getActiveEnemies().length = 0;
    }
    game.update(1 / 60);
    ticks += 1;
    // Round must never advance past 50 while the boss is still up —
    // the one thing a "long fight" could plausibly break.
    assert.equal(game.getRound(), 50);
  }

  assert.ok(ticks > 100, 'expected this to actually take a meaningful number of ticks, not resolve instantly');
  assert.equal(game.getGameState(), 'stageComplete');
  assert.equal(game.getStageCompleteStats().round, 50);
});
