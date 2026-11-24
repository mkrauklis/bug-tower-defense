const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Open-field rollout, Volcanic's turn (6th and FINAL of the 6 remaining
// maps, relayed from the peer session — see TUNDRA_FORTRESS's own
// comment for the full design history this follows). After this, Caves
// is the only built-in map left on the legacy fixed-path system.
//
// Design calls made for this map specifically, documented here and in
// map.js's own comments:
//   - The existing VOLCANIC_MAGMA_POOLS/isPointInMagmaPool mechanic
//     (round pools, tower-placement-only, pre-dates this conversion) is
//     left completely untouched — a brand new VOLCANIC_FISSURES array
//     (the follow-up request's own per-map terrain list: "Volcanic:
//     magma pits") supplies the actual open-field blocking obstacles
//     instead, drawn as elongated glowing cracks so the two hazards stay
//     visually distinct from each other.
//   - Goal structure is a fortified bunker (assistant's own judgment
//     call, per the original request's own "fortified bunker"
//     suggestion), drawn just above the existing lava vent rather than
//     replacing it — same "permanent addition on top of decor that was
//     already unconditionally drawn" pattern Whirlpool's own sinking
//     ship used on its vortex.

test('MAP_TYPES.volcanic is now open-field too (6th and final map converted) — only Caves remains untouched', () => {
  const game = loadGameContext();
  ['deepForest', 'marshland', 'savanah', 'whirlpool', 'tundra', 'volcanic'].forEach((id) => {
    assert.equal(game.MAP_TYPES[id].openField, true, `${id} should be open-field`);
  });
  assert.equal(Boolean(game.MAP_TYPES.caves.openField), false);
});

test('Volcanic\'s goal reuses the existing lava vent\'s own position, and its magma-pit obstacles are a new array separate from the existing (untouched) magma pools', () => {
  const game = loadGameContext();
  const volcanic = game.MAP_TYPES.volcanic;
  assert.equal(volcanic.goal.x, volcanic.decor.goal.x);
  assert.equal(volcanic.goal.y, volcanic.decor.goal.y);
  assert.ok(volcanic.goal.radius > 0);

  assert.ok(Array.isArray(volcanic.obstacles) && volcanic.obstacles.length > 0);
  // The existing magma pools are a DIFFERENT shape (circles, {x,y,r}) and
  // a different array entirely — untouched by this conversion.
  assert.ok(Array.isArray(volcanic.decor.magmaPools) && volcanic.decor.magmaPools.length > 0);
  assert.notDeepEqual(volcanic.obstacles, volcanic.decor.magmaPools);
  volcanic.obstacles.forEach((obstacle) => {
    assert.equal(typeof obstacle.x1, 'number'); // capsule shape, not {x,y,r}
  });
});

test('setActiveMap() updates the open-field bindings for Volcanic the same way it does for the other converted maps', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  assert.equal(game.getIsOpenField(), true);
  assert.deepEqual(game.getMapGoal(), game.MAP_TYPES.volcanic.goal);
  assert.deepEqual(game.getMapObstacles(), game.MAP_TYPES.volcanic.obstacles);
  assert.deepEqual(game.getMapSpawnEdge(), game.MAP_TYPES.volcanic.spawnEdge);

  game.setActiveMap(game.MAP_TYPES.caves);
  assert.equal(game.getIsOpenField(), false);
});

test('isPointOnPath always reads clear on Volcanic now, but Caves (the last unconverted map) still blocks on its own path', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const oldPathStart = game.MAP_TYPES.volcanic.paths[0][0];
  assert.equal(game.isPointOnPath(oldPathStart.x + 20, oldPathStart.y, 28), false);

  game.setActiveMap(game.MAP_TYPES.caves);
  const cavesStart = game.MAP_TYPES.caves.paths[0][0];
  assert.equal(game.isPointOnPath(cavesStart.x + 20, cavesStart.y, 28), true);
});

test('isPointInObstacle/isPointInGoal block placement on Volcanic\'s own new magma-pit obstacles/bunker goal, and isPointInMagmaPool independently still blocks its own old pools', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const obstacle = game.MAP_TYPES.volcanic.obstacles[0];
  const midX = (obstacle.x1 + obstacle.x2) / 2;
  const midY = (obstacle.y1 + obstacle.y2) / 2;
  assert.equal(game.isPointInObstacle(midX, midY), true);
  assert.equal(game.isPointInObstacle(-500, -500), false);

  const goal = game.MAP_TYPES.volcanic.goal;
  assert.equal(game.isPointInGoal(goal.x, goal.y), true);

  // The pre-existing magma-pool mechanic is a totally separate check,
  // untouched by this conversion and still working on its own data.
  const [pool] = game.MAP_TYPES.volcanic.decor.magmaPools;
  assert.equal(game.isPointInMagmaPool(pool.x, pool.y), true);
  assert.equal(game.isPointInObstacle(pool.x, pool.y), false); // the new obstacle check doesn't know about the old pools
});

test('buildOpenFieldRoute never crosses any of Volcanic\'s own magma-pit obstacles by less than the requested clearance', () => {
  const game = loadGameContext();
  const { obstacles } = game.MAP_TYPES.volcanic;
  const goal = game.MAP_TYPES.volcanic.goal;
  const edge = game.MAP_TYPES.volcanic.spawnEdge;

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

test('an open-field enemy on Volcanic spawns on its own spawn edge and routes to the bunker/vent goal, then leaks correctly if it survives', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];

  const edge = game.MAP_TYPES.volcanic.spawnEdge;
  assert.equal(enemy.x, edge.x1);
  const goal = game.MAP_TYPES.volcanic.goal;
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

test('a walking tower on Volcanic never crosses a magma-pit obstacle by more than its own clearance margin', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const obstacle = game.MAP_TYPES.volcanic.obstacles[0];
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

test('renderMap/renderMapPreview never throw for Volcanic\'s own open-field terrain (bunker + vent + fissures, no path stroke)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.volcanic);
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 1.4));
  assert.doesNotThrow(() => game.renderMapPreview(ctx, game.MAP_TYPES.volcanic, 0, 0, 400, 260, 1.4));
});
