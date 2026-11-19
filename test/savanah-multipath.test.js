const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Savanah is the first map with more than one path — two separate spawns
// that both lead into one shared temple goal. The underlying engine was
// generalized from one flat MAP_PATH_WAYPOINTS array to MAP_PATHS (an
// array of paths); every enemy independently rolls which path it spawns
// onto (enemy.pathIndex) via the game's own seeded random(), and sticks
// with that path for its whole life. These tests cover the multi-path
// machinery itself — Deep Forest/Marshland's own single-path tests
// elsewhere are the regression coverage that nothing changed for them.

test('Savanah has exactly two paths, both ending at the same shared goal (the temple)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const paths = game.getMapPaths();

  assert.equal(paths.length, 2);
  const [pathA, pathB] = paths;
  const endA = pathA[pathA.length - 1];
  const endB = pathB[pathB.length - 1];
  assert.deepEqual(endA, endB); // both routes converge on the identical point
});

test('Deep Forest and Marshland still have exactly one path each (no behavior change)', () => {
  const game = loadGameContext();
  assert.equal(game.getMapPaths().length, 1); // Deep Forest is the default active map

  game.setActiveMap(game.MAP_TYPES.marshland);
  assert.equal(game.getMapPaths().length, 1);
});

test('isPointOnPath blocks placement near EITHER of Savanah\'s two paths, not just the first', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const [pathA, pathB] = game.getMapPaths();

  const onA = { x: (pathA[0].x + pathA[1].x) / 2, y: (pathA[0].y + pathA[1].y) / 2 };
  const onB = { x: (pathB[0].x + pathB[1].x) / 2, y: (pathB[0].y + pathB[1].y) / 2 };

  assert.equal(game.isPointOnPath(onA.x, onA.y), true);
  assert.equal(game.isPointOnPath(onB.x, onB.y), true);
  assert.equal(game.isPointOnPath(-10000, -10000), false);
});

test('a spawned enemy on Savanah lands on one of the two valid paths (pathIndex 0 or 1)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  assert.ok(enemy.pathIndex === 0 || enemy.pathIndex === 1);

  const path = game.getMapPaths()[enemy.pathIndex];
  assert.equal(enemy.x, path[0].x);
  assert.equal(enemy.y, path[0].y);
});

test('spawning many enemies on Savanah uses both paths, not just one (independent per-enemy roll)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 200, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const pathIndexesUsed = new Set(game.getActiveEnemies().map((e) => e.pathIndex));
  assert.deepEqual([...pathIndexesUsed].sort(), [0, 1]); // astronomically unlikely all 200 land on one path
});

test('an enemy on path B (Savanah) walks along path B\'s own waypoints, not path A\'s', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  enemy.pathIndex = 1; // force it onto path B regardless of its random roll
  const pathB = game.getMapPaths()[1];
  enemy.x = pathB[0].x;
  enemy.y = pathB[0].y;
  enemy.waypointIndex = 0;
  enemy.spawned = true;

  game.updateEnemies(0.1); // enemy.speed = BASE_SPEED * 1 = 60px/s -> 6px this tick

  // Path B's first leg runs from (980, 540) toward (820, 540) — leftward.
  assert.ok(enemy.x < pathB[0].x);
  assert.equal(enemy.y, pathB[0].y);
});

test('an enemy that reaches the end of its own path is detected as leaked, using its own path\'s length', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1000, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  enemy.pathIndex = 1;
  const pathB = game.getMapPaths()[1];
  enemy.x = pathB[0].x;
  enemy.y = pathB[0].y;
  enemy.spawned = true;

  game.updateEnemies(1000); // one giant tick straight past the end of path B

  assert.equal(game.getActiveEnemies().length, 0); // removed, reached the goal
});

test('Rose\'s Root Path (spawnRoseRoots) seeds roots along path B even when path A is nowhere in range', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);

  // (850, 460) sits near path B's own vertical leg (820,540)-(820,320)
  // — well within the 220px root-spawn radius — but over 390px from the
  // nearest point on path A, outside that radius entirely. Before
  // spawnRoseRoots() walked every path in MAP_PATHS (it used to read only
  // the old single MAP_PATH_WAYPOINTS, i.e. path A), this exact placement
  // would have found zero coverage and seeded no roots at all — a real
  // regression this test guards against, not just a geometry sanity check.
  const rose = game.createTower('rose');
  rose.x = 850;
  rose.y = 460;
  const upgrade = game.purchaseUpgrade(rose, 1); // Root Path tier 1: Rooting, 3 roots

  assert.equal(upgrade, true);
  assert.equal(rose.roots.length, 3);
});
