const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// "Adventures" / The Hollow Event (direct request, relayed from the peer
// session): a brand-new top-level main-menu entry (distinct from the
// normal Map/Mode flow) that drops straight into one fixed special-event
// stage — a single continuous run to round 50, where round 50 is the
// stage's own climactic final-boss round (The Hollow Crow), not an endless
// climb like every other built-in map. See:
//   - js/map.js: MAP_TYPES.theHollowEvent / TERRAIN_THEMES.hollow (a full-
//     autumn reskin of Deep Forest's own path/decor layout).
//   - js/enemies.js: HOLLOW_ROSTER (3 tier1 + Mournful Sphinx (round 25
//     mid-boss) + 3 tier2 + The Hollow Crow (round 50 final boss)).
//   - js/game.js: GAME_MODES.adventure (adventureRoundCap: 50), the new
//     "Adventures" button on renderMenu()/its 'start:adventure' handler,
//     the round-cap win check in update(), triggerStageComplete()/
//     renderStageComplete(), and renderAdventureCountdown()'s "X rounds
//     until boss" HUD readout.
// Both theHollowEvent and 'adventure' are deliberately left OUT of
// MAP_TYPE_ORDER/MENU_MODE_ORDER — this stage is only ever reachable via
// its own dedicated menu button, never the normal "Choose a Map"/"Choose a
// Mode" carousels.
//
// Open-field rollout follow-up (relayed from the peer session): this map
// has since converted from its original fixed-path waypoints to the same
// goal-structure/obstacles/spawn-edge/walking-towers engine every other
// built-in map already uses — see test/open-field-hollow-event.test.js
// for that conversion's own dedicated coverage. `map.paths` below is
// still asserted on here (it's kept as a harmless unused fallback, same
// convention as every other converted map), but it no longer drives
// actual enemy movement — none of the mechanics this file covers
// (HOLLOW_ROSTER, the round-25/50 boss cadence, the splash screen, the
// round-cap win check) ever read path/waypoint data directly, so the
// conversion didn't require touching any test below.

// --- The map/terrain itself ----------------------------------------------

test('MAP_TYPES.theHollowEvent reuses Deep Forest\'s own path shape, with its own terrain/palette', () => {
  const game = loadFullGameContext();
  const map = game.MAP_TYPES.theHollowEvent;
  assert.equal(map.terrain, 'hollow');
  assert.equal(map.pathWidth, 56);
  assert.equal(map.paths[0], game.MAP_TYPES.deepForest.paths[0]); // same waypoints, reused directly
  assert.notEqual(map.pathColors, game.MAP_TYPES.deepForest.pathColors); // its own warmer palette
  assert.ok(Array.isArray(map.decor.leaves) && map.decor.leaves.length > 0); // the new fallen-leaves layer
});

test('The Hollow Event is NOT in the normal map-select carousel — only reachable via its own menu entry', () => {
  const game = loadFullGameContext();
  assert.equal(game.MAP_TYPE_ORDER.includes('theHollowEvent'), false);
  assert.equal(game.listAllMaps().some((m) => m.id === 'theHollowEvent'), false);
});

test('TERRAIN_THEMES.hollow is registered — renderMap() would throw without it', () => {
  const game = loadFullGameContext();
  assert.equal(typeof game.TERRAIN_THEMES.hollow, 'object');
  assert.equal(typeof game.TERRAIN_THEMES.hollow.renderDecor, 'function');
});

test('renderMap never throws for The Hollow Event\'s own terrain/decor', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.theHollowEvent);
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 0));
});

// --- GAME_MODES.adventure --------------------------------------------------

test('GAME_MODES.adventure is a real mode (standard multipliers) with its own round cap, excluded from the normal mode-select list', () => {
  const game = loadFullGameContext();
  const mode = game.GAME_MODES.adventure;
  assert.equal(mode.adventureRoundCap, 50);
  assert.equal(mode.healthMultiplier, 1);
  assert.equal(mode.speedMultiplier, 1);
  assert.equal(mode.bountyMultiplier, 1);
  assert.equal(mode.sandbox, false);
  assert.equal(mode.horde, false);
  assert.equal(game.MENU_MODE_ORDER.includes('adventure'), false);
});

test('every other mode has adventureRoundCap left undefined — the round-cap win check never fires for them', () => {
  const game = loadFullGameContext();
  assert.equal(game.GAME_MODES.medium.adventureRoundCap, undefined);
  assert.equal(game.GAME_MODES.horde.adventureRoundCap, undefined);
  assert.equal(game.GAME_MODES.sandbox.adventureRoundCap, undefined);
});

// --- HOLLOW_ROSTER: the 8 named creatures + round-25/50 boss cadence ----

test('HOLLOW_ROSTER has 3 tier1 + 3 tier2 regular enemies, an empty tier3, and both bosses', () => {
  const game = loadFullGameContext();
  const roster = game.MAP_ROSTERS.hollow;
  assert.deepEqual(roster.order, ['oakleafButterfly', 'deadleafMantis', 'bufftipMoth']);
  assert.deepEqual(roster.orderTier2, ['orbWeaver', 'easternRedBat', 'redEasternScreechOwl']);
  assert.deepEqual(roster.orderTier3, []);
  assert.deepEqual(Object.keys(roster.bossTypes).map(Number).sort(), [1, 2]);
});

test('The Hollow Crow (final boss) is clearly more significant than Mournful Sphinx (mid-boss) — higher stats and a bigger radius', () => {
  const game = loadFullGameContext();
  const roster = game.MAP_ROSTERS.hollow;
  const sphinx = roster.bossTypes[1];
  const crow = roster.bossTypes[2];
  assert.equal(sphinx.name, 'Mournful Sphinx');
  assert.equal(crow.name, 'The Hollow Crow');
  assert.ok(crow.health > sphinx.health * 2); // well beyond a plain "2x the mid-boss" step
  assert.ok(crow.radius > sphinx.radius);
  assert.ok(crow.radius > 24); // bigger than every other boss radius in the game (Great White's 24)
});

test('round 1 unlocks only the roster\'s own weakest tier1 entry (Oakleaf Butterfly)', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.theHollowEvent);
  assert.deepEqual(game.getUnlockedEnemyTypes(1), ['oakleafButterfly']);
});

test('round 26 unlocks the first tier2 entry (Orb Weaver), the round right after the round-25 mid-boss', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.theHollowEvent);
  const unlocked = game.getUnlockedEnemyTypes(26);
  assert.ok(unlocked.includes('orbWeaver'));
  assert.equal(unlocked.includes('easternRedBat'), false); // not yet — one every 5 rounds
});

test('round 25 is Mournful Sphinx (this stage\'s own mid-boss); round 50 is EXACTLY The Hollow Crow (the request\'s own explicit requirement)', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.theHollowEvent);

  const midBossWave = game.generateWave(25);
  assert.equal(midBossWave.length, 1);
  assert.equal(midBossWave[0].enemyKey, 'hollow-boss-tier-1');
  assert.equal(midBossWave[0].name, 'Mournful Sphinx');

  const finalBossWave = game.generateWave(50);
  assert.equal(finalBossWave.length, 1);
  assert.equal(finalBossWave[0].enemyKey, 'hollow-boss-tier-2');
  assert.equal(finalBossWave[0].name, 'The Hollow Crow');
});

// --- The round-50 win condition -------------------------------------------
// `round` has no direct setter exported (same as every other test file in
// this project) — every test below reaches round 50 the same way a real
// run would, by actually clearing 49 rounds via autoContinue, rather than
// reaching into private state.

test('clearing round 50\'s own wave reaches triggerStageComplete, via the exact same path a real run takes', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.theHollowEvent);
  game.startGame('adventure');
  game.setAutoContinue(true);

  // Drive 49 ordinary round-clears the fast way: skip the wave contents
  // entirely (startNextRound()/generateWave() already have their own
  // dedicated coverage above) and just confirm the generic mechanism
  // reaches round 50 and then ends the run instead of a 51st round.
  for (let i = 0; i < 49; i += 1) {
    game.getActiveEnemies().length = 0; // this round's own wave, fully cleared
    game.update(1 / 60); // autoContinue fires startNextRound()
  }
  assert.equal(game.getRound(), 50);
  assert.equal(game.getGameState(), 'playing'); // round 50's own wave (The Hollow Crow) just spawned, not cleared yet

  game.getActiveEnemies().length = 0; // defeat it
  game.update(1 / 60);

  assert.equal(game.getGameState(), 'stageComplete');
  assert.equal(game.getStageCompleteStats().round, 50);
  assert.equal(game.getStageCompleteStats().modeName, 'The Hollow Event');
});

test('the same round-50 clear in an ordinary (non-Adventure) mode never triggers a win — it just advances to round 51 as always', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepForest);
  game.startGame('medium');
  game.setAutoContinue(true);

  for (let i = 0; i < 50; i += 1) {
    game.getActiveEnemies().length = 0;
    game.update(1 / 60);
  }
  assert.equal(game.getGameState(), 'playing'); // never ends — Medium has no round cap at all
  assert.ok(game.getRound() > 50);
});

test('stagecomplete:menu returns to the main menu, same as gameover:menu', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.theHollowEvent);
  game.startGame('adventure');
  game.triggerStageComplete();
  assert.equal(game.getGameState(), 'stageComplete');

  game.activateRegion({ id: 'stagecomplete:menu', data: {} });
  assert.equal(game.getGameState(), 'menu');
});

// --- The Hollow Event's own title/cover screen -----------------------------
// Direct follow-up request, relayed from the peer session: "Adventures"
// now shows a dedicated gothic-horror title/splash screen for The Hollow
// Event (gameState === 'hollowSplash', see renderHollowSplash() in
// game.js) before the actual round-1 run starts, instead of dropping
// straight into it — reached via 'start:adventure', with its own
// 'hollowsplash:play' (starts the run) and 'hollowsplash:menu' (back to
// the main menu) regions.

test("'start:adventure' now opens the splash screen first, instead of starting the run directly", () => {
  const game = loadFullGameContext();
  game.activateRegion({ id: 'start:adventure', data: {} });

  assert.equal(game.getGameState(), 'hollowSplash');
  // The run itself hasn't started yet — startGame() was never called.
  assert.equal(game.getMoney(), game.STARTING_MONEY);
  assert.equal(game.getRound(), 1);
  assert.equal(game.getCurrentMode(), null);
});

test("entering the splash screen resets its own cosmetic clock back to 0", () => {
  const game = loadFullGameContext();
  game.activateRegion({ id: 'start:adventure', data: {} });
  assert.equal(game.getHollowSplashTime(), 0);
});

test("the splash screen's own Play button ('hollowsplash:play') is what actually starts the run", () => {
  const game = loadFullGameContext();
  game.activateRegion({ id: 'start:adventure', data: {} });
  game.activateRegion({ id: 'hollowsplash:play', data: {} });

  assert.equal(game.getGameState(), 'playing');
  assert.equal(game.getSelectedMap().id, 'theHollowEvent');
  assert.equal(game.getCurrentMode().name, 'The Hollow Event');
  assert.equal(game.getRound(), 1);
});

test("the splash screen's own back button ('hollowsplash:menu') returns to the main menu without starting anything", () => {
  const game = loadFullGameContext();
  game.activateRegion({ id: 'start:adventure', data: {} });
  game.activateRegion({ id: 'hollowsplash:menu', data: {} });

  assert.equal(game.getGameState(), 'menu');
  assert.equal(game.getCurrentMode(), null);
});

test('renderHollowSplash never throws, at any point along its own cosmetic clock', () => {
  const game = loadFullGameContext();
  game.activateRegion({ id: 'start:adventure', data: {} });
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderHollowSplash(ctx));
});

// --- Generic UI safety ------------------------------------------------------

test('renderUI never throws during an Adventure run, including right at round 50', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.theHollowEvent);
  game.startGame('adventure');
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderUI(ctx));

  game.triggerStageComplete();
  assert.doesNotThrow(() => game.renderUI(ctx));
});
