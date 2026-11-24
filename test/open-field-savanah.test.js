const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Open-field rollout, Savanah's turn (3rd of the 6 remaining maps,
// relayed from the peer session — see open-field-marshland.test.js's own
// comment for the full design history this follows). Savanah is the
// first converted map that used to have TWO paths/goals (its own
// SAVANAH_PATH_A/B, each ending at a separate temple) rather than one —
// the open-field conversion collapses this to the same single
// spawn-edge/single-goal shape every other converted map uses; the old
// 2-path data is kept as an unused fallback (same convention as every
// prior conversion), and the multi-path ENGINE itself keeps its own
// regression coverage on Tundra now instead (see
// test/multipath-engine.test.js's own updated header).
//
// Design calls made for this map specifically, documented here and in
// map.js's own comments:
//   - Goal structure is a watchtower/outpost (the follow-up request's
//     own phrase for Savanah): an open lookout platform on angled,
//     cross-braced timber legs, distinct from Deep Forest's enclosed
//     cabin and Marshland's stilt-shack.
//   - Obstacles are sandstone rock formations (the follow-up request's
//     own per-map terrain list), a new blocking-terrain array kept
//     separate from the existing, purely decorative SAVANAH_SANDSTONE
//     clusters.
//   - The 2 old temples are no longer drawn once Savanah is open-field
//     (renderDesertDecor's own `if (!MAP_OPEN_FIELD)` guard) rather than
//     left rendering as 2 inert structures that could read as extra
//     live goals.

test('MAP_TYPES.savanah is now open-field too (3rd map converted) — Whirlpool/Tundra/Volcanic/Caves remain untouched', () => {
  const game = loadGameContext();
  assert.equal(game.MAP_TYPES.deepForest.openField, true);
  assert.equal(game.MAP_TYPES.marshland.openField, true);
  assert.equal(game.MAP_TYPES.savanah.openField, true);
  ['whirlpool', 'tundra', 'volcanic', 'caves'].forEach((id) => {
    assert.equal(Boolean(game.MAP_TYPES[id].openField), false, `${id} should not be open-field yet`);
  });
});

test('Savanah has its own goal structure (watchtower), spawn edge, and sandstone-rock obstacles, distinct from the other converted maps\'', () => {
  const game = loadGameContext();
  const savanah = game.MAP_TYPES.savanah;
  assert.equal(typeof savanah.goal.x, 'number');
  assert.equal(typeof savanah.goal.y, 'number');
  assert.ok(savanah.goal.radius > 0);
  assert.notDeepEqual(savanah.goal, game.MAP_TYPES.deepForest.goal);
  assert.notDeepEqual(savanah.goal, game.MAP_TYPES.marshland.goal);

  assert.ok(Array.isArray(savanah.obstacles) && savanah.obstacles.length > 0);
  assert.notDeepEqual(savanah.obstacles, game.MAP_TYPES.deepForest.obstacles);
  assert.notDeepEqual(savanah.obstacles, game.MAP_TYPES.marshland.obstacles);

  assert.equal(typeof savanah.spawnEdge.x1, 'number');

  // The old 2-path/2-temple data is kept, unused, same convention as
  // every prior conversion's own fallback.
  assert.equal(savanah.paths.length, 2);
});

test('setActiveMap() updates the open-field bindings for Savanah the same way it does for the other converted maps', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  assert.equal(game.getIsOpenField(), true);
  assert.deepEqual(game.getMapGoal(), game.MAP_TYPES.savanah.goal);
  assert.deepEqual(game.getMapObstacles(), game.MAP_TYPES.savanah.obstacles);
  assert.deepEqual(game.getMapSpawnEdge(), game.MAP_TYPES.savanah.spawnEdge);

  game.setActiveMap(game.MAP_TYPES.tundra);
  assert.equal(game.getIsOpenField(), false);
  assert.equal(game.getMapGoal(), null);
  assert.deepEqual(game.getMapObstacles(), []);
  assert.equal(game.getMapSpawnEdge(), null);
});

test('isPointOnPath always reads clear on Savanah now, on both of its old paths, but Tundra (not yet converted) still blocks on its own paths', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const [pathA, pathB] = game.MAP_TYPES.savanah.paths;
  assert.equal(game.isPointOnPath(pathA[0].x + 20, pathA[0].y, 28), false);
  assert.equal(game.isPointOnPath(pathB[0].x - 20, pathB[0].y, 28), false);

  game.setActiveMap(game.MAP_TYPES.tundra);
  const tundraStart = game.MAP_TYPES.tundra.paths[0][0];
  assert.equal(game.isPointOnPath(tundraStart.x + 20, tundraStart.y, 28), true);
});

test('isPointInObstacle/isPointInGoal block placement on Savanah\'s own sandstone/watchtower, and are harmless no-ops elsewhere on the map', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const obstacle = game.MAP_TYPES.savanah.obstacles[0];
  const midX = (obstacle.x1 + obstacle.x2) / 2;
  const midY = (obstacle.y1 + obstacle.y2) / 2;
  assert.equal(game.isPointInObstacle(midX, midY), true);
  assert.equal(game.isPointInObstacle(-500, -500), false);

  const goal = game.MAP_TYPES.savanah.goal;
  assert.equal(game.isPointInGoal(goal.x, goal.y), true);
  assert.equal(game.isPointInGoal(-500, -500), false);
});

test('buildOpenFieldRoute never crosses any of Savanah\'s own sandstone-rock obstacles by less than the requested clearance', () => {
  const game = loadGameContext();
  const { obstacles } = game.MAP_TYPES.savanah;
  const goal = game.MAP_TYPES.savanah.goal;
  const edge = game.MAP_TYPES.savanah.spawnEdge;

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

test('an open-field enemy on Savanah spawns on its own spawn edge and routes to its own watchtower goal', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];

  const edge = game.MAP_TYPES.savanah.spawnEdge;
  assert.ok(Array.isArray(enemy.path) && enemy.path.length >= 2);
  assert.equal(enemy.x, edge.x1);
  assert.ok(enemy.y >= Math.min(edge.y1, edge.y2) && enemy.y <= Math.max(edge.y1, edge.y2));

  const goal = game.MAP_TYPES.savanah.goal;
  assert.equal(enemy.path[enemy.path.length - 1].x, goal.x);
  assert.equal(enemy.path[enemy.path.length - 1].y, goal.y);
});

test('an enemy that walks its full Savanah open-field route leaks exactly like reaching the end of a legacy path', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
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

test('a walking tower on Savanah never crosses a sandstone-rock obstacle by more than its own clearance margin', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const obstacle = game.MAP_TYPES.savanah.obstacles[0];
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

test('renderMap never throws for Savanah\'s own open-field terrain (watchtower + sandstone, no path stroke, no temples), and renderMapPreview works', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.savanah);
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 1.4));
  assert.doesNotThrow(() => game.renderMapPreview(ctx, game.MAP_TYPES.savanah, 0, 0, 400, 260, 1.4));
});
