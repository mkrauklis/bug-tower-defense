const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// The multi-path engine itself — two paths sharing one spawn/one exit
// (Caves' own fork-then-rejoin shape) or two fully independent ones
// (Savanah/Tundra's own shape, before each was converted), with every
// enemy independently rolling which path it spawns onto (enemy.pathIndex)
// via the game's own seeded random() and sticking with that path for its
// whole life (the underlying engine was generalized from one flat
// MAP_PATH_WAYPOINTS array to MAP_PATHS, an array of paths, for this).
// Deep Forest/Marshland/Savanah/Whirlpool/Tundra's own single-enemy-
// movement tests elsewhere are the regression coverage that nothing
// changed for a single-path map.
//
// Originally written against Savanah (the first map with two paths),
// this file was renamed and repointed at Tundra once Savanah converted
// to open-field, then repointed again at Caves once Tundra converted too
// (direct follow-up request relayed from the peer session — see
// TUNDRA_FORTRESS's own comment in map.js) — Caves is now the LAST
// built-in map still on the legacy fixed-path system, so once it
// converts too, this file's own subject (the shared engine, not any one
// specific map) will need a different home entirely; for now it's the
// only 2-path map left to exercise this with.
//
// Caves' own shape is different from Savanah/Tundra's: both paths FORK
// from one shared spawn and REJOIN before one shared goal (CAVES_GOAL,
// a single crystal pool both branches end at) rather than two fully
// independent spawn-to-goal routes — so the "two separate goals" and
// "two goals sit far apart" tests those maps' own versions of this file
// had no longer apply here and are replaced with assertions that match
// Caves' own real shape instead.

test('Caves has exactly two paths that share the same single goal (a fork-then-rejoin shape, not two independent destinations)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const paths = game.getMapPaths();

  assert.equal(paths.length, 2);
  const [pathA, pathB] = paths;
  const endA = pathA[pathA.length - 1];
  const endB = pathB[pathB.length - 1];
  assert.deepEqual(endA, endB); // both branches rejoin at the same crystal pool goal
  assert.ok(endA.x >= 0 && endA.x <= 960 && endA.y >= 0 && endA.y <= 640);
});

test('Deep Forest, Marshland, Savanah, Whirlpool, and Tundra each still have their own legacy waypoint data (unused now that all 5 are open-field, but not accidentally lost)', () => {
  const game = loadGameContext();
  assert.equal(game.MAP_TYPES.deepForest.paths.length, 1);
  assert.equal(game.MAP_TYPES.marshland.paths.length, 1);
  assert.equal(game.MAP_TYPES.savanah.paths.length, 2); // Savanah's own legacy data was always 2 paths, even though unused now
  assert.equal(game.MAP_TYPES.whirlpool.paths.length, 1);
  assert.equal(game.MAP_TYPES.tundra.paths.length, 2); // Tundra's own legacy data was always 2 paths too
});

test('isPointOnPath blocks placement near EITHER of Caves\' two paths, not just the first', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const [pathA, pathB] = game.getMapPaths();

  // Each path's own branch-only leg (after the shared fork point) — not
  // the shared spawn/fork segment both paths start with.
  const onA = { x: (pathA[3].x + pathA[4].x) / 2, y: (pathA[3].y + pathA[4].y) / 2 };
  const onB = { x: (pathB[3].x + pathB[4].x) / 2, y: (pathB[3].y + pathB[4].y) / 2 };

  assert.equal(game.isPointOnPath(onA.x, onA.y), true);
  assert.equal(game.isPointOnPath(onB.x, onB.y), true);
  assert.equal(game.isPointOnPath(-10000, -10000), false);
});

test('a spawned enemy on Caves lands on one of the two valid paths (pathIndex 0 or 1)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  assert.ok(enemy.pathIndex === 0 || enemy.pathIndex === 1);

  const path = game.getMapPaths()[enemy.pathIndex];
  assert.equal(enemy.x, path[0].x);
  assert.equal(enemy.y, path[0].y);
});

test('spawning many enemies on Caves uses both paths, not just one (independent per-enemy roll)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 200, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const pathIndexesUsed = new Set(game.getActiveEnemies().map((e) => e.pathIndex));
  assert.deepEqual([...pathIndexesUsed].sort(), [0, 1]); // astronomically unlikely all 200 land on one path
});

test('an enemy on path B (Caves) walks along path B\'s own waypoints, not path A\'s', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
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

  // Path B's first leg runs from (-20, 320) toward (160, 320) — rightward.
  assert.ok(enemy.x > pathB[0].x);
  assert.equal(enemy.y, pathB[0].y);
});

test('an enemy that reaches the end of its own path is detected as leaked, using its own path\'s length', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
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
  game.setActiveMap(game.MAP_TYPES.caves);

  // (500, 300) sits near path B's own vertical branch leg (440,200)-
  // (440,400) — 60px away, well within the 220px root-spawn radius — but
  // over 220px from every point on path A's own branch (the
  // (240,200)-(240,400) leg and its own connecting segments), outside
  // that radius entirely. Before spawnRoseRoots() walked every path in
  // MAP_PATHS (it used to read only the old single MAP_PATH_WAYPOINTS,
  // i.e. path A), this exact placement would have found zero coverage
  // and seeded no roots at all — a real regression this test guards
  // against, not just a geometry sanity check.
  const rose = game.createTower('rose');
  rose.x = 500;
  rose.y = 300;
  const upgrade = game.purchaseUpgrade(rose, 1); // Root Path tier 1: Rooting, 3 roots

  assert.equal(upgrade, true);
  assert.equal(rose.roots.length, 3);
});
