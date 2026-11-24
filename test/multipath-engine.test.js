const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// The multi-path engine itself — two separate spawns, each ending at its
// own independent goal, with every enemy independently rolling which path
// it spawns onto (enemy.pathIndex) via the game's own seeded random() and
// sticking with that path for its whole life (the underlying engine was
// generalized from one flat MAP_PATH_WAYPOINTS array to MAP_PATHS, an
// array of paths, for this). Deep Forest/Marshland/Savanah's own
// single-enemy-movement tests elsewhere are the regression coverage that
// nothing changed for a single-path map.
//
// Originally written against Savanah (the first map with two paths —
// see SAVANAH_PATH_A/B's own comment in map.js for that map's design
// history), this file was renamed and repointed at Tundra once Savanah
// itself was converted to the open-field system (direct follow-up
// request relayed from the peer session — see SAVANAH_WATCHTOWER's own
// comment in map.js), since Savanah's fixed 2-path movement is no longer
// live. Tundra is the next still-unconverted 2-path map (its own two ice
// caves, TUNDRA_CAVE_A/B, are the same "each path gets its own named
// goal field" shape Savanah's two temples used) and takes over as this
// file's regression coverage for the shared engine. When Tundra itself
// is eventually converted to open-field, whichever 2-path map is left
// (Caves) should take over here next — the engine being tested, not the
// specific map, is this file's actual subject.

test('Tundra has exactly two paths, each ending at its own separate goal (not a shared one)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const paths = game.getMapPaths();

  assert.equal(paths.length, 2);
  const [pathA, pathB] = paths;
  const endA = pathA[pathA.length - 1];
  const endB = pathB[pathB.length - 1];
  assert.notDeepEqual(endA, endB); // two independent goals, not a shared convergence point
  // Both goals are still real, on-canvas destinations, each with its own
  // ice cave drawn there (see map.js's TUNDRA_DECOR) — not just
  // "different from each other."
  assert.ok(endA.x >= 0 && endA.x <= 960 && endA.y >= 0 && endA.y <= 640);
  assert.ok(endB.x >= 0 && endB.x <= 960 && endB.y >= 0 && endB.y <= 640);
});

test('Tundra\'s two ice cave goals sit far enough apart to read as visually distinct, not overlapping', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const [caveA, caveB] = game.MAP_TYPES.tundra.decor.caves;
  const dist = Math.hypot(caveA.x - caveB.x, caveA.y - caveB.y);
  assert.ok(dist > caveA.size); // comfortably further apart than either cave's own width
});

test('Deep Forest, Marshland, and Savanah each still have exactly one path\'s worth of legacy waypoint data (unused now that all 3 are open-field, but not accidentally lost)', () => {
  const game = loadGameContext();
  assert.equal(game.MAP_TYPES.deepForest.paths.length, 1);
  assert.equal(game.MAP_TYPES.marshland.paths.length, 1);
  assert.equal(game.MAP_TYPES.savanah.paths.length, 2); // Savanah's own legacy data was always 2 paths, even though unused now
});

test('isPointOnPath blocks placement near EITHER of Tundra\'s two paths, not just the first', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const [pathA, pathB] = game.getMapPaths();

  const onA = { x: (pathA[0].x + pathA[1].x) / 2, y: (pathA[0].y + pathA[1].y) / 2 };
  const onB = { x: (pathB[0].x + pathB[1].x) / 2, y: (pathB[0].y + pathB[1].y) / 2 };

  assert.equal(game.isPointOnPath(onA.x, onA.y), true);
  assert.equal(game.isPointOnPath(onB.x, onB.y), true);
  assert.equal(game.isPointOnPath(-10000, -10000), false);
});

test('a spawned enemy on Tundra lands on one of the two valid paths (pathIndex 0 or 1)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  assert.ok(enemy.pathIndex === 0 || enemy.pathIndex === 1);

  const path = game.getMapPaths()[enemy.pathIndex];
  assert.equal(enemy.x, path[0].x);
  assert.equal(enemy.y, path[0].y);
});

test('spawning many enemies on Tundra uses both paths, not just one (independent per-enemy roll)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 200, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const pathIndexesUsed = new Set(game.getActiveEnemies().map((e) => e.pathIndex));
  assert.deepEqual([...pathIndexesUsed].sort(), [0, 1]); // astronomically unlikely all 200 land on one path
});

test('an enemy on path B (Tundra) walks along path B\'s own waypoints, not path A\'s', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
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

  // Path B's first leg runs from (980, 120) toward (650, 120) — leftward.
  assert.ok(enemy.x < pathB[0].x);
  assert.equal(enemy.y, pathB[0].y);
});

test('an enemy that reaches the end of its own path is detected as leaked, using its own path\'s length', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
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
  game.setActiveMap(game.MAP_TYPES.tundra);

  // (720, 450) sits near path B's own vertical leg (650,320)-(650,480)
  // — about 70px away, well within the 220px root-spawn radius — but
  // about 242px from the nearest point on path A (the (300,420)-(480,420)
  // leg's own endpoint at (480,420)), outside that radius entirely.
  // Before spawnRoseRoots() walked every path in MAP_PATHS (it used to
  // read only the old single MAP_PATH_WAYPOINTS, i.e. path A), this exact
  // placement would have found zero coverage and seeded no roots at all
  // — a real regression this test guards against, not just a geometry
  // sanity check.
  const rose = game.createTower('rose');
  rose.x = 720;
  rose.y = 450;
  const upgrade = game.purchaseUpgrade(rose, 1); // Root Path tier 1: Rooting, 3 roots

  assert.equal(upgrade, true);
  assert.equal(rose.roots.length, 3);
});
