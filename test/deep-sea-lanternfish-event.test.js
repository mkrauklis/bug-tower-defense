const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Deep Sea lanternfish event (direct follow-up request, relayed from the
// peer session): "a giant lanternfish that rises up from the shadows
// every 5 rounds (round 5, 10, 15, 20...), stays for about 2 seconds,
// then fades back into the depths. If there are more than 10 enemies
// currently on the board when it triggers, it eats one of them (removes
// it from play) during that window; if there aren't more than 10
// enemies on the board, it still rises/fades for the visual but doesn't
// eat anything."
//
// Design calls made for this feature, documented here and in game.js/
// enemies.js's own comments:
//   - "More than 10" read literally as 11+ (LANTERNFISH_MIN_ENEMIES_TO_EAT
//     = 10, gated with a strict `>`), not ">= 10".
//   - No bounty/kill credit for the eaten enemy (the peer's own stated
//     default) — eatRandomEligibleEnemy() (enemies.js) removes the enemy
//     directly from activeEnemies rather than routing it through the
//     normal health<=0 "killed" sweep that awards bounty.
//   - Bosses are excluded from eligibility (this assistant's own call,
//     per the request's own explicit "must NOT allow eating boss-tier
//     enemies in a way that could trivialize a boss fight").
//   - The trigger is a single "already fired this round?" guard checked
//     every frame (game.js's lanternfishTriggeredRound), rather than
//     hooking every individual place `round` can advance — covers
//     startNextRound() and Horde Mode's own manual increment alike.

test('eatRandomEligibleEnemy never eats a boss, picks uniformly among non-boss enemies, and returns null when nothing is eligible', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  const regularEntry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  const bossKey = game.getAllSpawnableEnemyKeys().find((key) => key.includes('boss'));
  const bossEntry = game.getSpawnEntryForEnemyKey(bossKey);

  let anyBossEaten = false;
  const eatenKeys = new Set();
  for (let trial = 0; trial < 100; trial += 1) {
    game.spawnWave([]); // clears activeEnemies
    for (let i = 0; i < 3; i += 1) game.spawnSingleEnemy(regularEntry);
    game.spawnSingleEnemy(bossEntry);
    const eaten = game.eatRandomEligibleEnemy();
    assert.ok(eaten); // always something eligible here (3 non-boss present)
    eatenKeys.add(eaten.enemyKey);
    if (eaten.isBoss) anyBossEaten = true;
  }
  assert.equal(anyBossEaten, false);
  assert.ok(eatenKeys.has(regularEntry.enemyKey)); // the only non-boss key present, so every eaten enemy must be this one

  // All-boss board: nothing eligible.
  game.spawnWave([]);
  game.spawnSingleEnemy(bossEntry);
  game.spawnSingleEnemy(bossEntry);
  assert.equal(game.eatRandomEligibleEnemy(), null);
  assert.equal(game.getActiveEnemies().length, 2); // untouched
});

test('eatRandomEligibleEnemy removes the enemy from activeEnemies directly — no bounty/kill credit, same as the peer\'s own stated default', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepSea);
  game.startGame('sandbox');
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  game.spawnSingleEnemy(entry);
  game.getActiveEnemies().forEach((enemy) => { enemy.spawned = true; });

  const moneyBefore = game.getMoney();
  const countBefore = game.getActiveEnemies().length;
  const eaten = game.eatRandomEligibleEnemy();

  assert.ok(eaten);
  assert.equal(game.getActiveEnemies().length, countBefore - 1);
  assert.equal(game.getMoney(), moneyBefore); // no bounty awarded

  // A normal updateEnemies() tick afterward shouldn't retroactively treat
  // the eaten enemy as killed or leaked either.
  const killed = game.updateEnemies(1 / 60);
  assert.equal(killed.length, 0);
  assert.equal(game.getLastLeakedEnemies().length, 0);
});

// `round` has no direct setter exported (same convention as every other
// test file in this project — see test/the-hollow-event.test.js's own
// comment) — reaches a target round the same way a real run would, via
// autoContinue, clearing that round's own wave each tick. Note that
// update() itself calls maybeTriggerLanternfishEvent() BEFORE its own
// round-advance check, so the tick that bumps e.g. round 4 -> 5 still
// sees round===4 when it checks — the event only actually fires on the
// FIRST tick where getRound() already reads the new value, which is
// exactly what lets a test then safely overwrite activeEnemies with its
// own controlled count and call maybeTriggerLanternfishEvent() directly,
// without a real update() tick's own auto-generated wave interfering.
function advanceToRound(game, targetRound) {
  game.setAutoContinue(true);
  while (game.getRound() < targetRound) {
    game.getActiveEnemies().length = 0;
    game.update(1 / 60);
  }
}

test('maybeTriggerLanternfishEvent only fires on Deep Sea, never on another map even at round 5', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepForest);
  game.startGame('medium');
  advanceToRound(game, 5);
  game.getActiveEnemies().length = 0;
  game.maybeTriggerLanternfishEvent();
  assert.equal(game.getLanternfishActive(), false);
});

test('on Deep Sea, the event does not fire before round 5 (e.g. round 1, right after startGame)', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepSea);
  game.startGame('sandbox');
  assert.equal(game.getRound(), 1);
  game.maybeTriggerLanternfishEvent();
  assert.equal(game.getLanternfishActive(), false);
});

test('on round 5 (Deep Sea) with more than 10 enemies on the board, the event fires, sets a 2-second timer, and eats exactly one non-boss enemy — a second trigger check the same round does not re-fire or re-eat', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepSea);
  game.startGame('medium');
  advanceToRound(game, 5);

  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnWave([]); // this test's own controlled board, replacing round 5's auto-generated wave
  for (let i = 0; i < 15; i += 1) game.spawnSingleEnemy(entry); // > 10
  game.getActiveEnemies().forEach((enemy) => { enemy.spawned = true; });
  const countBeforeTrigger = game.getActiveEnemies().length;

  game.maybeTriggerLanternfishEvent();
  assert.equal(game.getLanternfishActive(), true);
  assert.equal(game.getLanternfishTimer(), game.LANTERNFISH_DURATION);
  assert.equal(game.getLanternfishTriggeredRound(), 5);
  assert.equal(game.getActiveEnemies().length, countBeforeTrigger - 1); // ate exactly one

  const countAfterFirstTrigger = game.getActiveEnemies().length;
  game.maybeTriggerLanternfishEvent(); // same round, called again
  assert.equal(game.getActiveEnemies().length, countAfterFirstTrigger); // no second eat
});

test('with exactly 10 enemies on the board (not "more than 10"), the event still fires (visual) but eats nothing', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepSea);
  game.startGame('medium');
  advanceToRound(game, 5);

  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnWave([]);
  for (let i = 0; i < 10; i += 1) game.spawnSingleEnemy(entry); // exactly 10
  game.getActiveEnemies().forEach((enemy) => { enemy.spawned = true; });
  const countBefore = game.getActiveEnemies().length;

  game.maybeTriggerLanternfishEvent();
  assert.equal(game.getLanternfishActive(), true); // still rises/fades for the visual
  assert.equal(game.getActiveEnemies().length, countBefore); // but doesn't eat anything
});

test('updateLanternfishEvent counts the timer down and clears lanternfishActive once it reaches 0, matching "stays for about 2 seconds"', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepSea);
  game.startGame('medium');
  advanceToRound(game, 5);
  game.getActiveEnemies().length = 0;
  game.maybeTriggerLanternfishEvent();
  assert.equal(game.getLanternfishActive(), true);

  for (let i = 0; i < 60; i += 1) game.updateLanternfishEvent(1 / 60); // ~1 second — still within the window
  assert.equal(game.getLanternfishActive(), true);

  for (let i = 0; i < 90; i += 1) game.updateLanternfishEvent(1 / 60); // well past 2 seconds total
  assert.equal(game.getLanternfishActive(), false);
});

test('getLanternfishVisibility eases in from 0, holds at 1 through the middle, and eases back out to 0 — never just pops', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepSea);
  game.startGame('medium');

  assert.equal(game.getLanternfishVisibility(), 0); // inactive — nothing to show

  advanceToRound(game, 5);
  game.getActiveEnemies().length = 0;
  game.maybeTriggerLanternfishEvent(); // timer = LANTERNFISH_DURATION, just triggered
  assert.equal(game.getLanternfishVisibility(), 0); // the very first instant — not yet risen at all

  game.updateLanternfishEvent(game.LANTERNFISH_DURATION / 2); // dead center of the window
  assert.equal(game.getLanternfishVisibility(), 1); // fully visible through the held middle

  game.updateLanternfishEvent(game.LANTERNFISH_DURATION / 2 - 0.001); // right at the very end
  assert.ok(game.getLanternfishVisibility() < 0.1);
});

test('renderLanternfishEvent never throws, whether active or not, and drawLanternfish never throws across the full visibility range', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepSea);
  game.startGame('medium');
  const ctx = new Proxy({}, { get: (obj, prop) => (prop === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : () => {}) });

  assert.doesNotThrow(() => game.renderLanternfishEvent(ctx, 0)); // inactive — should just no-op

  advanceToRound(game, 5);
  game.getActiveEnemies().length = 0;
  game.maybeTriggerLanternfishEvent();
  [0, 0.1, 0.5, 1].forEach((time) => {
    assert.doesNotThrow(() => game.renderLanternfishEvent(ctx, time));
  });
  [0, 0.25, 0.5, 0.75, 1].forEach((visibility) => {
    assert.doesNotThrow(() => game.drawLanternfish(ctx, 380, 300, visibility, 1.2));
  });
});

test('the lanternfish event resets cleanly on a new startGame() — no leftover state from a previous run', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepSea);
  game.startGame('medium');
  advanceToRound(game, 5);
  game.getActiveEnemies().length = 0;
  game.maybeTriggerLanternfishEvent();
  assert.equal(game.getLanternfishActive(), true);
  assert.equal(game.getLanternfishTriggeredRound(), 5);

  game.startGame('sandbox'); // a fresh run
  assert.equal(game.getLanternfishActive(), false);
  assert.equal(game.getLanternfishTimer(), 0);
  assert.equal(game.getLanternfishTriggeredRound(), 0);
});
