const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Open-field rollout, Caves' turn — the 6th and LAST built-in map still
// on the legacy fixed-path system (see VOLCANIC_GOAL's own comment in
// map.js for the full design history this follows). Every built-in map
// is open-field now that this one has converted too; the shared
// multi-path ENGINE itself (2 paths forking then rejoining, independent
// per-enemy pathIndex rolls) now keeps its own regression coverage
// against a synthetic map object instead of any one built-in map (see
// test/multipath-engine.test.js's own updated header).
//
// Design calls made for this map specifically, documented here and in
// map.js's own comments:
//   - Goal structure is a creature's den (assistant's own judgment call,
//     per the original request's own "den/cave-dwelling" suggestion),
//     drawn just above the existing crystal water pool rather than
//     replacing it — same "permanent addition on top of decor that was
//     already unconditionally drawn" pattern Whirlpool's sinking ship/
//     Volcanic's bunker both used; no new "hide the old thing" guard was
//     needed since the pool was never tied to the old path system in the
//     first place.
//   - Obstacles are rocks (assistant's own judgment call, per the
//     follow-up request's own per-map terrain list: "Caves: rocks"),
//     spread across the whole field from the start (the Deep Forest
//     log-clustering lesson applied immediately).

test('MAP_TYPES.caves was the 6th and final map converted — every built-in map is open-field now', () => {
  const game = loadGameContext();
  ['deepForest', 'marshland', 'savanah', 'whirlpool', 'tundra', 'volcanic', 'caves'].forEach((id) => {
    assert.equal(game.MAP_TYPES[id].openField, true, `${id} should be open-field`);
  });
});

test('Caves\' goal reuses the existing crystal pool\'s own position, and its rock obstacles are a new array distinct from the other converted maps\' own', () => {
  const game = loadGameContext();
  const caves = game.MAP_TYPES.caves;
  assert.equal(caves.goal.x, caves.decor.goal.x);
  assert.equal(caves.goal.y, caves.decor.goal.y);
  assert.ok(caves.goal.radius > 0);

  assert.ok(Array.isArray(caves.obstacles) && caves.obstacles.length > 0);
  assert.notDeepEqual(caves.obstacles, game.MAP_TYPES.volcanic.obstacles);
  caves.obstacles.forEach((obstacle) => {
    assert.equal(typeof obstacle.x1, 'number'); // capsule shape
  });

  // The old 2-path/fork-rejoin data is kept, unused, same convention as
  // every prior conversion's own fallback.
  assert.equal(caves.paths.length, 2);
});

test('setActiveMap() updates the open-field bindings for Caves the same way it does for the other converted maps', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  assert.equal(game.getIsOpenField(), true);
  assert.deepEqual(game.getMapGoal(), game.MAP_TYPES.caves.goal);
  assert.deepEqual(game.getMapObstacles(), game.MAP_TYPES.caves.obstacles);
  assert.deepEqual(game.getMapSpawnEdge(), game.MAP_TYPES.caves.spawnEdge);
});

test('isPointOnPath always reads clear on Caves now, on both of its old fork/rejoin paths', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const [pathA, pathB] = game.MAP_TYPES.caves.paths;
  // Each path's own branch-only leg.
  assert.equal(game.isPointOnPath(pathA[4].x, pathA[4].y, 28), false);
  assert.equal(game.isPointOnPath(pathB[4].x, pathB[4].y, 28), false);
});

test('isPointInObstacle/isPointInGoal block placement on Caves\' own rocks/den, and are harmless no-ops elsewhere on the map', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const obstacle = game.MAP_TYPES.caves.obstacles[0];
  const midX = (obstacle.x1 + obstacle.x2) / 2;
  const midY = (obstacle.y1 + obstacle.y2) / 2;
  assert.equal(game.isPointInObstacle(midX, midY), true);
  assert.equal(game.isPointInObstacle(-500, -500), false);

  const goal = game.MAP_TYPES.caves.goal;
  assert.equal(game.isPointInGoal(goal.x, goal.y), true);
  assert.equal(game.isPointInGoal(-500, -500), false);
});

test('buildOpenFieldRoute never crosses any of Caves\' own rock obstacles by less than the requested clearance', () => {
  const game = loadGameContext();
  const { obstacles } = game.MAP_TYPES.caves;
  const goal = game.MAP_TYPES.caves.goal;
  const edge = game.MAP_TYPES.caves.spawnEdge;

  [6, 12, 24].forEach((enemyRadius) => {
    for (let i = 0; i <= 4; i += 1) {
      const t = i / 4;
      const spawnX = edge.x1 + (edge.x2 - edge.x1) * t;
      const spawnY = edge.y1 + (edge.y2 - edge.y1) * t;
      const route = game.buildOpenFieldRoute(spawnX, spawnY, goal.x, goal.y, obstacles, enemyRadius);

      assert.equal(route[0].x, spawnX);
      assert.equal(route[route.length - 1].x, goal.x);

      for (let s = 0; s < route.length - 1; s += 1) {
        const a = route[s];
        const b = route[s + 1];
        for (let sample = 0; sample <= 10; sample += 1) {
          const tt = sample / 10;
          const px = a.x + (b.x - a.x) * tt;
          const py = a.y + (b.y - a.y) * tt;
          obstacles.forEach((obstacle) => {
            const clearance = game.distanceToObstacle(px, py, obstacle) - enemyRadius;
            assert.ok(clearance > -1, `route for radius ${enemyRadius} clipped an obstacle by ${-clearance}px`);
          });
        }
      }
    }
  });
});

test('an open-field enemy on Caves spawns on its own spawn edge and routes to the den/pool goal, then leaks correctly if it survives', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];

  const edge = game.MAP_TYPES.caves.spawnEdge;
  assert.equal(enemy.x, edge.x1);
  const goal = game.MAP_TYPES.caves.goal;
  assert.equal(enemy.path[enemy.path.length - 1].x, goal.x);
  assert.equal(enemy.path[enemy.path.length - 1].y, goal.y);

  let ticks = 0;
  let leaked = [];
  while (game.getActiveEnemies().length > 0 && ticks < 3000) {
    const killed = game.updateEnemies(1 / 60);
    leaked = leaked.concat(game.getLastLeakedEnemies());
    assert.equal(killed.length, 0);
    ticks += 1;
  }
  assert.equal(leaked.length, 1);
});

test('a walking tower on Caves never crosses a rock obstacle by more than its own clearance margin', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const obstacle = game.MAP_TYPES.caves.obstacles[0];
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

test('renderMap/renderMapPreview never throw for Caves\' own open-field terrain (den + rocks + crystals/formations, no path stroke)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 1.4));
  assert.doesNotThrow(() => game.renderMapPreview(ctx, game.MAP_TYPES.caves, 0, 0, 400, 260, 1.4));
});
