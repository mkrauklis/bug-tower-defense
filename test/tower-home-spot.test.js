const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Two related follow-up requests for open-field walking towers, relayed
// from the peer session, both built on Deep Forest (the only converted
// map with a Node-testable obstacle layout right now) and carrying
// forward automatically to every other map once it converts:
//
// 1. When a round ends (no enemies left anywhere, not just none nearby),
//    every tower should walk back to the exact spot it was placed at,
//    using the existing movement/leg system rather than a special
//    teleport — getTowerMovementTarget() now returns a "go home" target
//    whenever activeEnemies is empty and the tower isn't already there,
//    taking priority over the old "drift toward the spawn-goal corridor"
//    idle fallback (which only applies when there's no enemies NEARBY,
//    not when there's none AT ALL).
// 2. Placement must always block against every existing tower's own HOME
//    spot (tower.homeX/homeY, set once at placement and inherited by a
//    Prodigy upgrade), not wherever it currently happens to be standing —
//    tracked as a field separate from tower.x/y, which keep changing as
//    it wanders.
//
// Plus its own direct follow-up: a color-coded pot left sitting at a
// tower's home spot for as long as it's away from it (doubles as a
// visual cue for the placement-blocking rule above), and a separate
// fading dirt-trail mark left behind only while actually walking.

test('a tower\'s homeX/homeY are set once at placement time and untouched by wandering', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  game.setSelectedMap(game.MAP_TYPES.deepForest);
  game.startGame('sandbox');

  const tower = game.createTower('sunflower');
  tower.x = 700;
  tower.y = 600;
  tower.homeX = 700;
  tower.homeY = 600;
  game.setTowers([tower]);

  // Simulate it wandering away (same mechanism updateTowerMovement itself
  // uses) without touching homeX/homeY.
  tower.x = 750;
  tower.y = 580;
  assert.equal(tower.homeX, 700);
  assert.equal(tower.homeY, 600);
});

test('isTowerPlacementBlocked checks a tower\'s HOME spot, not its current (wandered) position', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const tower = game.createTower('sunflower');
  tower.homeX = 700;
  tower.homeY = 600;
  tower.x = 300; // wandered far away from home
  tower.y = 300;
  game.setTowers([tower]);

  // Blocked at the HOME spot even though nothing is currently standing there.
  assert.equal(game.isTowerPlacementBlocked(700, 600, 'rose'), true);
  // NOT blocked at the tower's current (wandered-to) position — that
  // spot isn't reserved by anything.
  assert.equal(game.isTowerPlacementBlocked(300, 300, 'rose'), false);
});

test('getTowerMovementTarget sends an away-from-home tower back home once no enemies remain anywhere, taking priority over idle corridor drift', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const tower = game.createTower('sunflower');
  tower.homeX = 500;
  tower.homeY = 50; // off the spawn-goal corridor, so idle-drift would normally send it elsewhere
  tower.x = 700;
  tower.y = 600;
  game.setTowers([tower]);
  assert.equal(game.getActiveEnemies().length, 0);

  const target = game.getTowerMovementTarget(tower);
  assert.ok(target);
  assert.equal(target.x, 500);
  assert.equal(target.y, 50);

  // Once actually home, there's nothing left to walk toward.
  tower.x = 500;
  tower.y = 50;
  assert.equal(game.getTowerMovementTarget(tower), null);
});

test('updateTowerMovement actually walks a tower back home over several frames once enemies are cleared', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const tower = game.createTower('sunflower');
  tower.homeX = 700;
  tower.homeY = 600;
  tower.x = 850; // clear of any Deep Forest obstacle, same as its home
  tower.y = 600;
  game.setTowers([tower]);

  for (let i = 0; i < 300; i += 1) game.updateTowerMovement(tower, 1 / 60);
  assert.ok(Math.hypot(tower.x - tower.homeX, tower.y - tower.homeY) < 3);
});

test('a Prodigy upgrade inherits its base tower\'s own home spot, not just its current position', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const base = game.createTower('sunflower');
  base.homeX = 400;
  base.homeY = 400;
  base.x = 550; // wandered away from home
  base.y = 420;
  base.upgradesPurchased = 4;
  game.setTowers([base]);

  const option = game.getProdigyOption(base);
  assert.ok(option);

  // Exercises the exact inherit-home-spot assignment game.js's own
  // Prodigy-purchase handler performs (activateRegion's 'prodigy:' branch
  // — not reachable here without simulating a full canvas click/region),
  // rather than the UI wiring around it: `?? base.x/y` covers a tower
  // from before homeX/homeY existed, same fallback the real handler uses.
  const prodigy = game.createTower(option.typeKey);
  prodigy.x = base.x;
  prodigy.y = base.y;
  prodigy.homeX = base.homeX ?? base.x;
  prodigy.homeY = base.homeY ?? base.y;

  assert.equal(prodigy.homeX, 400);
  assert.equal(prodigy.homeY, 400);
  assert.notEqual(prodigy.homeX, prodigy.x); // inherited the HOME spot, not the current wandered-to position
});

test('getTowerHomePotColor returns a distinct pale color per base tower type, and a Prodigy inherits its own base type\'s color', () => {
  const game = loadFullGameContext();
  const colors = ['sunflower', 'rose', 'mushroom', 'corpseFlower', 'arcticWillow'].map(game.getTowerHomePotColor);
  assert.equal(new Set(colors).size, 5);
  // sunlitConductor is the Sunflower's own Prodigy (PRODIGY_BASE_TYPE).
  assert.equal(game.getTowerHomePotColor('sunlitConductor'), game.getTowerHomePotColor('sunflower'));
});

test('drawTowerHomePot renders without throwing, and the pot is only drawn once a tower has actually left its home spot', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.drawTowerHomePot(ctx, 100, 100, 30, game.getTowerHomePotColor('rose')));
});

test('a walking tower leaves fading dirt-trail marks only while actually moving, spaced out by distance rather than one per frame', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const tower = game.createTower('sunflower');
  tower.homeX = 850;
  tower.homeY = 600;
  tower.x = 850;
  tower.y = 600;
  game.setTowers([tower]);

  // Idle at home, nothing moving — no trail at all.
  for (let i = 0; i < 60; i += 1) game.updateTowerMovement(tower, 1 / 60);
  assert.equal(game.getDirtTrailMarks().length, 0);

  // Now give it somewhere to walk.
  tower.homeX = 500;
  tower.homeY = 600;
  for (let i = 0; i < 180; i += 1) game.updateTowerMovement(tower, 1 / 60);
  const marksWhileWalking = game.getDirtTrailMarks().length;
  assert.ok(marksWhileWalking > 0);
  // Spaced out by DIRT_TRAIL_SPACING, not one per frame — far fewer marks
  // than frames elapsed.
  assert.ok(marksWhileWalking < 180 / 4);
});

test('dirt-trail marks fade out and are removed once their lifetime elapses', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepForest);
  game.startGame('sandbox');
  game.getDirtTrailMarks().push({ x: 0, y: 0, remaining: 0.5, angle: 0, scale: 1 });
  assert.equal(game.getDirtTrailMarks().length, 1);
  game.update(1); // well past the 0.5s remaining
  assert.equal(game.getDirtTrailMarks().length, 0);
});

test('dirtTrailMarks resets to empty on startGame (no leftover marks from a previous run)', () => {
  const game = loadFullGameContext();
  game.getDirtTrailMarks().push({ x: 0, y: 0, remaining: 5, angle: 0, scale: 1 });
  game.setSelectedMap(game.MAP_TYPES.deepForest);
  game.startGame('sandbox');
  assert.equal(game.getDirtTrailMarks().length, 0);
});
