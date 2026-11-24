const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Open-field rollout, Whirlpool's turn (4th of the 6 remaining maps,
// relayed from the peer session — see open-field-marshland.test.js's own
// comment for the full design history this follows). Whirlpool's own
// unique wrinkle: its old spiral path already ended at a central vortex
// (WHIRLPOOL_CENTER) that was always drawn as decor regardless of path
// vs. open-field — so this conversion reuses that exact same point as
// the new goal position rather than inventing a new one, and the vortex
// art itself needed no new "hide the old thing" guard (unlike Savanah's
// temples) since it was never tied to the old path system in the first
// place.
//
// Design calls made for this map specifically, documented here and in
// map.js's own comments:
//   - Goal structure is a sinking ship (the follow-up request's own
//     "ship/lighthouse" phrase for Whirlpool) — a ship won out since the
//     vortex already pulling something down into it fits better than an
//     unrelated lighthouse. Drawn on top of the existing vortex swirl,
//     not gated behind any flag (the swirl was always unconditional).
//   - Obstacles are rafts/driftwood (the follow-up request's own per-map
//     terrain list) — a new array, scattered through the open middle the
//     spiral's own loops used to fill, clear of the existing decor's own
//     margin convention (WHIRLPOOL_CORAL's own comment).
//   - Spawn edge is a short vertical segment on the right, replacing the
//     old spiral's own single off-canvas entry point at a similar
//     position.

// Tundra/Volcanic have since converted too (see their own
// open-field-*.test.js files) — only Caves is still checked here as
// "not yet" so this test keeps matching the codebase's current state
// instead of this map's own conversion-day snapshot.
test('MAP_TYPES.whirlpool is now open-field too (4th map converted) — Caves remains untouched', () => {
  const game = loadGameContext();
  assert.equal(game.MAP_TYPES.deepForest.openField, true);
  assert.equal(game.MAP_TYPES.marshland.openField, true);
  assert.equal(game.MAP_TYPES.savanah.openField, true);
  assert.equal(game.MAP_TYPES.whirlpool.openField, true);
  ['caves'].forEach((id) => {
    assert.equal(Boolean(game.MAP_TYPES[id].openField), false, `${id} should not be open-field yet`);
  });
});

test('Whirlpool\'s goal reuses the exact same vortex center its old spiral path always ended at', () => {
  const game = loadGameContext();
  const whirlpool = game.MAP_TYPES.whirlpool;
  assert.equal(whirlpool.goal.x, 480);
  assert.equal(whirlpool.goal.y, 320);
  assert.ok(whirlpool.goal.radius > 0);

  const oldSpiralEnd = whirlpool.paths[0][whirlpool.paths[0].length - 1];
  assert.ok(Math.hypot(oldSpiralEnd.x - whirlpool.goal.x, oldSpiralEnd.y - whirlpool.goal.y) < 25);
});

test('Whirlpool has its own raft/driftwood obstacles and spawn edge, distinct from the other converted maps\'', () => {
  const game = loadGameContext();
  const whirlpool = game.MAP_TYPES.whirlpool;
  assert.ok(Array.isArray(whirlpool.obstacles) && whirlpool.obstacles.length > 0);
  assert.notDeepEqual(whirlpool.obstacles, game.MAP_TYPES.deepForest.obstacles);
  assert.equal(typeof whirlpool.spawnEdge.x1, 'number');
  // Spawn edge is kept well clear of every obstacle.
  whirlpool.obstacles.forEach((obstacle) => {
    const midX = (obstacle.x1 + obstacle.x2) / 2;
    assert.ok(Math.abs(midX - whirlpool.spawnEdge.x1) > 100);
  });
});

test('setActiveMap() updates the open-field bindings for Whirlpool the same way it does for the other converted maps', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  assert.equal(game.getIsOpenField(), true);
  assert.deepEqual(game.getMapGoal(), game.MAP_TYPES.whirlpool.goal);
  assert.deepEqual(game.getMapObstacles(), game.MAP_TYPES.whirlpool.obstacles);
  assert.deepEqual(game.getMapSpawnEdge(), game.MAP_TYPES.whirlpool.spawnEdge);

  game.setActiveMap(game.MAP_TYPES.caves);
  assert.equal(game.getIsOpenField(), false);
});

test('isPointInObstacle/isPointInGoal block placement on Whirlpool\'s own rafts/vortex, and are harmless no-ops elsewhere on the map', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const obstacle = game.MAP_TYPES.whirlpool.obstacles[0];
  const midX = (obstacle.x1 + obstacle.x2) / 2;
  const midY = (obstacle.y1 + obstacle.y2) / 2;
  assert.equal(game.isPointInObstacle(midX, midY), true);
  assert.equal(game.isPointInObstacle(-500, -500), false);

  const goal = game.MAP_TYPES.whirlpool.goal;
  assert.equal(game.isPointInGoal(goal.x, goal.y), true);
  assert.equal(game.isPointInGoal(-500, -500), false);
});

test('buildOpenFieldRoute never crosses any of Whirlpool\'s own rafts by less than the requested clearance', () => {
  const game = loadGameContext();
  const { obstacles } = game.MAP_TYPES.whirlpool;
  const goal = game.MAP_TYPES.whirlpool.goal;
  const edge = game.MAP_TYPES.whirlpool.spawnEdge;

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

test('an open-field enemy on Whirlpool spawns on its own spawn edge and routes to the vortex goal, then leaks correctly if it survives', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];

  const edge = game.MAP_TYPES.whirlpool.spawnEdge;
  assert.equal(enemy.x, edge.x1);
  const goal = game.MAP_TYPES.whirlpool.goal;
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

test('a walking tower on Whirlpool never crosses a raft obstacle by more than its own clearance margin', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const obstacle = game.MAP_TYPES.whirlpool.obstacles[0];
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

test('renderMap/renderMapPreview never throw for Whirlpool\'s own open-field terrain (ship + vortex + rafts, no path stroke)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 1.4));
  assert.doesNotThrow(() => game.renderMapPreview(ctx, game.MAP_TYPES.whirlpool, 0, 0, 400, 260, 1.4));
});
