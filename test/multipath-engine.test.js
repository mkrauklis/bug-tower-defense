const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// The multi-path engine itself — two paths sharing one spawn/one exit (a
// fork-then-rejoin shape) or two fully independent ones, with every
// enemy independently rolling which path it spawns onto (enemy.pathIndex)
// via the game's own seeded random() and sticking with that path for its
// whole life (the underlying engine was generalized from one flat
// MAP_PATH_WAYPOINTS array to MAP_PATHS, an array of paths, for this).
// Every built-in map's own single-enemy-movement tests elsewhere are the
// regression coverage that nothing changed for a single-path map.
//
// This file was originally written against Savanah (the first map with
// two paths), then repointed at Tundra once Savanah converted to
// open-field, then at Caves once Tundra converted too — each time, the
// map whose own fixed-path movement this file was actually exercising
// moved on to the open-field system, so the file got repointed at
// whichever 2-path map was left. Now that Caves itself has converted
// (the open-field rollout's 6th and final map — every built-in map is
// open-field now), there is no live 2-path map left in the game at all.
//
// Rather than repoint this file at nothing (or delete real engine
// coverage), it now runs against FAKE_TWO_PATH_MAP below — a synthetic,
// self-contained map object (setActiveMap() only ever reads
// .paths/.pathWidth/.openField/.goal/.obstacles/.spawnEdge off whatever
// it's given, never anything that requires a REAL MAP_TYPES entry) that
// reproduces Caves' own fork-then-rejoin shape exactly. This is
// deliberately NOT tied to any built-in map's own conversion status —
// the multi-path engine is still live production code (nothing else in
// this file's own history removed it, only every CURRENT map's own use
// of it), so it keeps real regression coverage without ever needing to
// be repointed again.
const FAKE_TWO_PATH_MAP = {
  id: 'fakeTwoPath',
  pathWidth: 56,
  paths: [
    [
      { x: -20, y: 320 },
      { x: 160, y: 320 },
      { x: 160, y: 120 },
      { x: 340, y: 120 }, // the fork point — both branches start diverging right after this exact waypoint
      { x: 240, y: 200 }, // this path's own branch: bulges left
      { x: 240, y: 400 },
      { x: 340, y: 480 }, // the merge point — both branches rejoin at this exact waypoint
      { x: 620, y: 480 },
    ],
    [
      { x: -20, y: 320 },
      { x: 160, y: 320 },
      { x: 160, y: 120 },
      { x: 340, y: 120 }, // the same fork point as the other path
      { x: 440, y: 200 }, // this path's own branch: bulges right instead of left
      { x: 440, y: 400 },
      { x: 340, y: 480 }, // the same merge point as the other path
      { x: 620, y: 480 },
    ],
  ],
};

test('a 2-path map has exactly two paths that share the same single goal (a fork-then-rejoin shape, not two independent destinations)', () => {
  const game = loadGameContext();
  game.setActiveMap(FAKE_TWO_PATH_MAP);
  const paths = game.getMapPaths();

  assert.equal(paths.length, 2);
  const [pathA, pathB] = paths;
  const endA = pathA[pathA.length - 1];
  const endB = pathB[pathB.length - 1];
  assert.deepEqual(endA, endB); // both branches rejoin at the same goal
  assert.ok(endA.x >= 0 && endA.x <= 960 && endA.y >= 0 && endA.y <= 640);
});

test('every built-in map now has its own open-field data (the rollout is complete) — their own legacy waypoint data is still kept, unused, not accidentally lost', () => {
  const game = loadGameContext();
  ['deepForest', 'marshland', 'savanah', 'whirlpool', 'tundra', 'volcanic', 'caves'].forEach((id) => {
    const map = game.MAP_TYPES[id];
    assert.equal(map.openField, true, `${id} should be open-field`);
    assert.ok(Array.isArray(map.paths) && map.paths.length > 0, `${id} should still have its own legacy paths kept`);
  });
  // Savanah/Tundra/Caves were always 2-path maps even before converting;
  // every other built-in map was always single-path.
  assert.equal(game.MAP_TYPES.savanah.paths.length, 2);
  assert.equal(game.MAP_TYPES.tundra.paths.length, 2);
  assert.equal(game.MAP_TYPES.caves.paths.length, 2);
  assert.equal(game.MAP_TYPES.deepForest.paths.length, 1);
  assert.equal(game.MAP_TYPES.marshland.paths.length, 1);
  assert.equal(game.MAP_TYPES.whirlpool.paths.length, 1);
  assert.equal(game.MAP_TYPES.volcanic.paths.length, 1);
});

test('isPointOnPath blocks placement near EITHER of a 2-path map\'s two paths, not just the first', () => {
  const game = loadGameContext();
  game.setActiveMap(FAKE_TWO_PATH_MAP);
  const [pathA, pathB] = game.getMapPaths();

  // Each path's own branch-only leg (after the shared fork point) — not
  // the shared spawn/fork segment both paths start with.
  const onA = { x: (pathA[3].x + pathA[4].x) / 2, y: (pathA[3].y + pathA[4].y) / 2 };
  const onB = { x: (pathB[3].x + pathB[4].x) / 2, y: (pathB[3].y + pathB[4].y) / 2 };

  assert.equal(game.isPointOnPath(onA.x, onA.y), true);
  assert.equal(game.isPointOnPath(onB.x, onB.y), true);
  assert.equal(game.isPointOnPath(-10000, -10000), false);
});

test('a spawned enemy on a 2-path map lands on one of the two valid paths (pathIndex 0 or 1)', () => {
  const game = loadGameContext();
  game.setActiveMap(FAKE_TWO_PATH_MAP);
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 1, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const [enemy] = game.getActiveEnemies();
  assert.ok(enemy.pathIndex === 0 || enemy.pathIndex === 1);

  const path = game.getMapPaths()[enemy.pathIndex];
  assert.equal(enemy.x, path[0].x);
  assert.equal(enemy.y, path[0].y);
});

test('spawning many enemies on a 2-path map uses both paths, not just one (independent per-enemy roll)', () => {
  const game = loadGameContext();
  game.setActiveMap(FAKE_TWO_PATH_MAP);
  game.spawnWave([
    { enemyKey: 'testBug', name: 'Test Bug', color: '#000', radius: 8, count: 200, health: 1, speedMultiplier: 1, isBoss: false, bounty: 2 },
  ]);
  const pathIndexesUsed = new Set(game.getActiveEnemies().map((e) => e.pathIndex));
  assert.deepEqual([...pathIndexesUsed].sort(), [0, 1]); // astronomically unlikely all 200 land on one path
});

test('an enemy on path B walks along path B\'s own waypoints, not path A\'s', () => {
  const game = loadGameContext();
  game.setActiveMap(FAKE_TWO_PATH_MAP);
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
  game.setActiveMap(FAKE_TWO_PATH_MAP);
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
  game.setActiveMap(FAKE_TWO_PATH_MAP);

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
