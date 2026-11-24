const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Open-field rework (core mechanic replacement, relayed from the peer
// session, confirmed with the user as "replace it everywhere, not a new
// separate mode" — built first on Deep Forest only, per the peer's own
// suggested sequencing, before rolling out to the other 6 maps one at a
// time): no more fixed waypoint path. Enemies now spawn along one edge of
// the map and the goal is a themed structure on the opposite side — a
// cabin for Deep Forest, the user's own example. Towers no longer stay
// pinned to where they were placed (separate test file: see
// open-field-walking-towers.test.js).
//
// Design calls made along the way, all documented here and in map.js/
// enemies.js's own comments:
//   - Enemy movement toward the goal is a one-time, per-enemy route
//     built at spawn (buildOpenFieldRoute(), map.js) via grid+BFS
//     pathfinding around that map's obstacles, not per-frame steering —
//     the peer's own message explicitly flagged "simplest/safest" as the
//     default, and after 3 different geometric "insert a detour point"
//     attempts each got caught live clipping an obstacle or oscillating
//     (see map.js's own comment history on buildOpenFieldRoute), a
//     standard grid+BFS pathfind was used instead: unconditionally
//     terminating, no oscillation risk, still computed once per enemy
//     (not every frame) so it stays cheap.
//   - Towers do NOT block enemy movement — only terrain obstacles
//     (Deep Forest's fallen logs) do. This matches the peer's own stated
//     default ("towers just provide attack range as enemies pass near
//     them").
//   - This whole system reuses the EXACT SAME waypoint-follow/zombie-
//     backward-walk/leak-detection engine every other map's fixed path
//     already used — an open-field enemy just carries its own route
//     (enemy.path) instead of indexing into a shared MAP_PATHS entry
//     (see enemies.js's getEnemyPath()) — rather than a parallel
//     movement system, which is what let every other built-in map (and
//     The Hollow Event, which reuses Deep Forest's own
//     DEEP_FOREST_WAYPOINTS directly for its own fixed-path run) stay
//     completely untouched.

// Marshland/Savanah/Whirlpool/Tundra/Volcanic have since converted too
// (see their own open-field-*.test.js files) — only Caves is still
// checked here as "not yet" so this test keeps matching the codebase's
// current state instead of this map's own conversion-day snapshot.
test('MAP_TYPES.deepForest was the first built-in map converted — Caves remains untouched', () => {
  const game = loadGameContext();
  assert.equal(game.MAP_TYPES.deepForest.openField, true);
  ['caves'].forEach((id) => {
    assert.equal(Boolean(game.MAP_TYPES[id].openField), false, `${id} should not be open-field yet`);
  });
  // The Hollow Event reuses Deep Forest's own waypoint array directly for
  // its own fixed-path run — must stay completely untouched (same array,
  // not open-field) even though Deep Forest itself moved on from it.
  assert.equal(game.MAP_TYPES.theHollowEvent.openField, undefined);
  assert.equal(game.MAP_TYPES.theHollowEvent.paths[0], game.MAP_TYPES.deepForest.paths[0]);
});

test('Deep Forest has a goal structure, a spawn edge, and obstacles; Caves (not yet converted) has none of the 3', () => {
  const game = loadGameContext();
  const deepForest = game.MAP_TYPES.deepForest;
  assert.equal(typeof deepForest.goal.x, 'number');
  assert.equal(typeof deepForest.goal.y, 'number');
  assert.ok(deepForest.goal.radius > 0);
  assert.ok(Array.isArray(deepForest.obstacles) && deepForest.obstacles.length > 0);
  assert.equal(typeof deepForest.spawnEdge.x1, 'number');

  ['caves'].forEach((id) => {
    const map = game.MAP_TYPES[id];
    assert.equal(map.goal, undefined);
    assert.equal(map.obstacles, undefined);
    assert.equal(map.spawnEdge, undefined);
  });
});

test('setActiveMap() updates the open-field bindings (MAP_OPEN_FIELD/MAP_GOAL/MAP_OBSTACLES/MAP_SPAWN_EDGE), same convention as MAP_PATHS', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  assert.equal(game.getIsOpenField(), true);
  assert.ok(game.getMapGoal());
  assert.ok(game.getMapObstacles().length > 0);
  assert.ok(game.getMapSpawnEdge());

  game.setActiveMap(game.MAP_TYPES.caves);
  assert.equal(game.getIsOpenField(), false);
  assert.equal(game.getMapGoal(), null);
  assert.deepEqual(game.getMapObstacles(), []);
  assert.equal(game.getMapSpawnEdge(), null);
});

test('isPointOnPath always reads as clear on an open-field map (no fixed path geometry to block placement against)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  // The old DEEP_FOREST_WAYPOINTS point (220, 80) would have blocked
  // placement on the pre-conversion map; must not any more.
  assert.equal(game.isPointOnPath(220, 80, 28), false);

  game.setActiveMap(game.MAP_TYPES.caves);
  // Caves is untouched (the last remaining 2-path map) — its own path
  // still blocks placement exactly as before.
  const cavesStart = game.MAP_TYPES.caves.paths[0][0];
  assert.equal(game.isPointOnPath(cavesStart.x + 20, cavesStart.y, 28), true);
});

test('isPointInObstacle/isPointInGoal block placement on Deep Forest\'s logs/cabin, and are harmless no-ops on every other map', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const obstacle = game.MAP_TYPES.deepForest.obstacles[0];
  const midX = (obstacle.x1 + obstacle.x2) / 2;
  const midY = (obstacle.y1 + obstacle.y2) / 2;
  assert.equal(game.isPointInObstacle(midX, midY), true);
  assert.equal(game.isPointInObstacle(-500, -500), false);

  const goal = game.MAP_TYPES.deepForest.goal;
  assert.equal(game.isPointInGoal(goal.x, goal.y), true);
  assert.equal(game.isPointInGoal(-500, -500), false);

  game.setActiveMap(game.MAP_TYPES.caves);
  assert.equal(game.isPointInObstacle(midX, midY), false); // no obstacles on this map at all
  assert.equal(game.isPointInGoal(goal.x, goal.y), false); // no goal structure on this map at all
});

test('buildOpenFieldRoute never crosses any obstacle by less than the requested clearance, across every obstacle and several enemy radii', () => {
  const game = loadGameContext();
  const { obstacles } = game.MAP_TYPES.deepForest;
  const goal = game.MAP_TYPES.deepForest.goal;

  [6, 12, 24].forEach((enemyRadius) => {
    // Several spawn points along the real spawn edge, not just one.
    for (let i = 0; i <= 4; i += 1) {
      const t = i / 4;
      const edge = game.MAP_TYPES.deepForest.spawnEdge;
      const spawnX = edge.x1 + (edge.x2 - edge.x1) * t;
      const spawnY = edge.y1 + (edge.y2 - edge.y1) * t;
      const route = game.buildOpenFieldRoute(spawnX, spawnY, goal.x, goal.y, obstacles, enemyRadius);

      assert.equal(route[0].x, spawnX);
      assert.equal(route[0].y, spawnY);
      assert.equal(route[route.length - 1].x, goal.x);
      assert.equal(route[route.length - 1].y, goal.y);

      for (let s = 0; s < route.length - 1; s += 1) {
        const a = route[s];
        const b = route[s + 1];
        for (let sample = 0; sample <= 10; sample += 1) {
          const tt = sample / 10;
          const px = a.x + (b.x - a.x) * tt;
          const py = a.y + (b.y - a.y) * tt;
          obstacles.forEach((obstacle) => {
            const clearance = game.distanceToObstacle(px, py, obstacle) - enemyRadius;
            assert.ok(
              clearance > -1, // a tiny float-tolerance margin, not a real clip
              `route for radius ${enemyRadius} clipped an obstacle by ${-clearance}px (spawn t=${t})`
            );
          });
        }
      }
    }
  });
});

test('an open-field enemy spawns on the spawn edge and carries its own route (enemy.path) instead of a shared MAP_PATHS entry', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];

  const edge = game.MAP_TYPES.deepForest.spawnEdge;
  assert.ok(Array.isArray(enemy.path) && enemy.path.length >= 2);
  assert.equal(enemy.x, enemy.path[0].x);
  assert.equal(enemy.y, enemy.path[0].y);
  // On the spawn edge's own line (a vertical segment at x1===x2 here).
  assert.equal(enemy.x, edge.x1);
  assert.ok(enemy.y >= Math.min(edge.y1, edge.y2) && enemy.y <= Math.max(edge.y1, edge.y2));
  // The route's own last point is exactly the goal structure's position.
  const goal = game.MAP_TYPES.deepForest.goal;
  assert.equal(enemy.path[enemy.path.length - 1].x, goal.x);
  assert.equal(enemy.path[enemy.path.length - 1].y, goal.y);
});

test('an enemy that walks its full open-field route leaks (reaches the goal) exactly like reaching the end of a legacy path', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);

  let ticks = 0;
  let leaked = [];
  while (game.getActiveEnemies().length > 0 && ticks < 3000) {
    const killed = game.updateEnemies(1 / 60);
    const thisFrameLeaked = game.getLastLeakedEnemies();
    if (thisFrameLeaked.length > 0) leaked = leaked.concat(thisFrameLeaked);
    assert.equal(killed.length, 0); // nothing damaged it — it should leak, not die
    ticks += 1;
  }
  assert.equal(leaked.length, 1);
  assert.equal(game.getActiveEnemies().length, 0);
});

test('renderMap never throws for Deep Forest\'s own open-field terrain (cabin + logs, no path stroke)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 1.4));
});
