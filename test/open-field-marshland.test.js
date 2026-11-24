const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Open-field rework, Marshland's turn (2nd of the 6 remaining built-in maps,
// relayed from the peer session after Deep Forest's own prototype landed:
// "Roll the open-field system out to the remaining 6 maps... Same
// incremental commit/report pattern as Deep Forest"). Identical mechanism
// to Deep Forest's own conversion (see open-field-deep-forest.test.js for
// the full engine-level design history — buildOpenFieldRoute's grid+BFS
// pathfinding, getEnemyPath()'s generalization, the MAP_OPEN_FIELD/
// MAP_GOAL/MAP_OBSTACLES/MAP_SPAWN_EDGE bindings) — this file only covers
// Marshland's own new data (goal/obstacles/spawnEdge) and confirms the
// shared engine behaves the same way for a 2nd map, not a reimplementation
// of anything already covered there.
//
// Design calls made for this map specifically, documented here and in
// map.js's own comments:
//   - Goal structure is a stilt-shack (the follow-up request's own "hut/
//     stilt-shack" phrase for Marshland) raised on angled poles above the
//     mud, distinct in both shape and construction material from Deep
//     Forest's log cabin.
//   - Obstacles are tall-grass patches (the follow-up request's own
//     per-map terrain list), drawn as a cluster of swaying blades rather
//     than a solid log — scattered through the open middle of the map,
//     clear of (though not required to avoid) the existing, purely
//     decorative mud puddles.
//   - MARSHLAND_WAYPOINTS is kept exactly as it was, same as Deep Forest's
//     own untouched DEEP_FOREST_WAYPOINTS — a harmless unused fallback,
//     since nothing else in the project reuses it.

// Savanah/Whirlpool/Tundra/Volcanic have since converted too (see their
// own open-field-*.test.js files) — only Caves is still checked here as
// "not yet" so this test keeps matching the codebase's current state
// instead of this map's own conversion-day snapshot.
test('MAP_TYPES.marshland is now open-field too (2nd map converted) — Caves remains untouched', () => {
  const game = loadGameContext();
  assert.equal(game.MAP_TYPES.deepForest.openField, true);
  assert.equal(game.MAP_TYPES.marshland.openField, true);
  ['caves'].forEach((id) => {
    assert.equal(Boolean(game.MAP_TYPES[id].openField), false, `${id} should not be open-field yet`);
  });
});

test('Marshland has its own goal structure (stilt-shack), spawn edge, and tall-grass obstacles, distinct from Deep Forest\'s', () => {
  const game = loadGameContext();
  const marshland = game.MAP_TYPES.marshland;
  assert.equal(typeof marshland.goal.x, 'number');
  assert.equal(typeof marshland.goal.y, 'number');
  assert.ok(marshland.goal.radius > 0);
  assert.notDeepEqual(marshland.goal, game.MAP_TYPES.deepForest.goal);

  assert.ok(Array.isArray(marshland.obstacles) && marshland.obstacles.length > 0);
  assert.notDeepEqual(marshland.obstacles, game.MAP_TYPES.deepForest.obstacles);

  assert.equal(typeof marshland.spawnEdge.x1, 'number');
});

test('setActiveMap() updates the open-field bindings for Marshland the same way it does for Deep Forest', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  assert.equal(game.getIsOpenField(), true);
  assert.deepEqual(game.getMapGoal(), game.MAP_TYPES.marshland.goal);
  assert.deepEqual(game.getMapObstacles(), game.MAP_TYPES.marshland.obstacles);
  assert.deepEqual(game.getMapSpawnEdge(), game.MAP_TYPES.marshland.spawnEdge);

  game.setActiveMap(game.MAP_TYPES.caves);
  assert.equal(game.getIsOpenField(), false);
  assert.equal(game.getMapGoal(), null);
  assert.deepEqual(game.getMapObstacles(), []);
  assert.equal(game.getMapSpawnEdge(), null);
});

test('isPointOnPath always reads clear on Marshland now, but Caves (not yet converted) still blocks on its own path', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const oldPathPoint = game.MAP_TYPES.marshland.paths[0][2]; // a bend in the now-unused legacy path
  assert.equal(game.isPointOnPath(oldPathPoint.x, oldPathPoint.y, 28), false);

  game.setActiveMap(game.MAP_TYPES.caves);
  const cavesStart = game.MAP_TYPES.caves.paths[0][0];
  assert.equal(game.isPointOnPath(cavesStart.x + 20, cavesStart.y, 28), true);
});

test('isPointInObstacle/isPointInGoal block placement on Marshland\'s own tall-grass/hut, and are harmless no-ops elsewhere on the map', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const obstacle = game.MAP_TYPES.marshland.obstacles[0];
  const midX = (obstacle.x1 + obstacle.x2) / 2;
  const midY = (obstacle.y1 + obstacle.y2) / 2;
  assert.equal(game.isPointInObstacle(midX, midY), true);
  assert.equal(game.isPointInObstacle(-500, -500), false);

  const goal = game.MAP_TYPES.marshland.goal;
  assert.equal(game.isPointInGoal(goal.x, goal.y), true);
  assert.equal(game.isPointInGoal(-500, -500), false);
});

test('buildOpenFieldRoute never crosses any of Marshland\'s own tall-grass obstacles by less than the requested clearance', () => {
  const game = loadGameContext();
  const { obstacles } = game.MAP_TYPES.marshland;
  const goal = game.MAP_TYPES.marshland.goal;
  const edge = game.MAP_TYPES.marshland.spawnEdge;

  [6, 12, 24].forEach((enemyRadius) => {
    for (let i = 0; i <= 4; i += 1) {
      const t = i / 4;
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
              clearance > -1,
              `route for radius ${enemyRadius} clipped an obstacle by ${-clearance}px (spawn t=${t})`
            );
          });
        }
      }
    }
  });
});

test('an open-field enemy on Marshland spawns on its own spawn edge and routes to its own hut goal', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];

  const edge = game.MAP_TYPES.marshland.spawnEdge;
  assert.ok(Array.isArray(enemy.path) && enemy.path.length >= 2);
  assert.equal(enemy.x, edge.x1);
  assert.ok(enemy.y >= Math.min(edge.y1, edge.y2) && enemy.y <= Math.max(edge.y1, edge.y2));

  const goal = game.MAP_TYPES.marshland.goal;
  assert.equal(enemy.path[enemy.path.length - 1].x, goal.x);
  assert.equal(enemy.path[enemy.path.length - 1].y, goal.y);
});

test('an enemy that walks its full Marshland open-field route leaks exactly like reaching the end of a legacy path', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);

  let ticks = 0;
  let leaked = [];
  while (game.getActiveEnemies().length > 0 && ticks < 3000) {
    const killed = game.updateEnemies(1 / 60);
    const thisFrameLeaked = game.getLastLeakedEnemies();
    if (thisFrameLeaked.length > 0) leaked = leaked.concat(thisFrameLeaked);
    assert.equal(killed.length, 0);
    ticks += 1;
  }
  assert.equal(leaked.length, 1);
  assert.equal(game.getActiveEnemies().length, 0);
});

test('a walking tower on Marshland never crosses a tall-grass obstacle by more than its own clearance margin', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const obstacle = game.MAP_TYPES.marshland.obstacles[0];
  const cx = (obstacle.x1 + obstacle.x2) / 2;
  const cy = (obstacle.y1 + obstacle.y2) / 2;

  const tower = game.createTower('sunflower');
  tower.x = cx - 60;
  tower.y = cy;
  game.setTowers([tower]);

  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];
  enemy.x = cx + 60;
  enemy.y = cy;
  enemy.spawned = true;
  enemy.health = enemy.maxHealth;

  let minClearance = Infinity;
  for (let i = 0; i < 180; i += 1) {
    game.update(1 / 60);
    const clearance = game.distanceToObstacle(tower.x, tower.y, obstacle) - game.getTowerVisualSize(tower) * 0.4;
    if (clearance < minClearance) minClearance = clearance;
  }
  assert.ok(minClearance > -1, `tower clipped the obstacle by ${-minClearance}px`);
});

test('renderMap never throws for Marshland\'s own open-field terrain (hut + tall grass, no path stroke), and renderMapPreview works for both converted maps', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.marshland);
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 1.4));
  assert.doesNotThrow(() => game.renderMapPreview(ctx, game.MAP_TYPES.marshland, 0, 0, 400, 260, 1.4));
  assert.doesNotThrow(() => game.renderMapPreview(ctx, game.MAP_TYPES.deepForest, 0, 0, 400, 260, 1.4));
});
