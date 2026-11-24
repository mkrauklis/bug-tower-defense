const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Open-field rollout, Tundra's turn (5th of the 6 remaining maps,
// relayed from the peer session — see SAVANAH_WATCHTOWER's own comment
// for the full design history this follows, including its own "collapse
// 2 independent paths/goals to 1" precedent). Tundra was the 2nd map
// (after Savanah) with 2 fully independent paths each ending at its own
// goal — the multi-path ENGINE itself now keeps its own regression
// coverage on Caves instead, the last remaining 2-path map (see
// test/multipath-engine.test.js's own updated header).
//
// Design calls made for this map specifically, documented here and in
// map.js's own comments:
//   - Goal structure is an ice fortress (assistant's own judgment call,
//     per the original request's own "ice fortress/cabin" suggestion):
//     crenellated ice-block walls, twin corner towers, hanging icicles,
//     a glowing ice-crystal doorway — distinct from every other map's
//     own goal.
//   - Obstacles are giant snowballs (assistant's own judgment call, per
//     the follow-up request's own per-map terrain list), spread across
//     the whole field from the start (the Deep Forest log-clustering
//     lesson applied immediately).
//   - The 2 old ice caves are no longer drawn once this map's own decor
//     carries a fortress of its own (checked against `decor.fortress`
//     itself, not the global MAP_OPEN_FIELD binding — the same bug class
//     Savanah's own temple-hiding guard hit and fixed, applied correctly
//     here from the start).

test('MAP_TYPES.tundra is now open-field too (5th map converted) — Volcanic/Caves remain untouched', () => {
  const game = loadGameContext();
  assert.equal(game.MAP_TYPES.deepForest.openField, true);
  assert.equal(game.MAP_TYPES.marshland.openField, true);
  assert.equal(game.MAP_TYPES.savanah.openField, true);
  assert.equal(game.MAP_TYPES.whirlpool.openField, true);
  assert.equal(game.MAP_TYPES.tundra.openField, true);
  ['volcanic', 'caves'].forEach((id) => {
    assert.equal(Boolean(game.MAP_TYPES[id].openField), false, `${id} should not be open-field yet`);
  });
});

test('Tundra has its own goal structure (ice fortress), spawn edge, and giant-snowball obstacles, distinct from the other converted maps\'', () => {
  const game = loadGameContext();
  const tundra = game.MAP_TYPES.tundra;
  assert.equal(typeof tundra.goal.x, 'number');
  assert.equal(typeof tundra.goal.y, 'number');
  assert.ok(tundra.goal.radius > 0);
  assert.notDeepEqual(tundra.goal, game.MAP_TYPES.whirlpool.goal);

  assert.ok(Array.isArray(tundra.obstacles) && tundra.obstacles.length > 0);
  assert.notDeepEqual(tundra.obstacles, game.MAP_TYPES.whirlpool.obstacles);
  assert.equal(typeof tundra.spawnEdge.x1, 'number');

  // The old 2-path/2-cave data is kept, unused, same convention as every
  // prior conversion's own fallback.
  assert.equal(tundra.paths.length, 2);
});

test('setActiveMap() updates the open-field bindings for Tundra the same way it does for the other converted maps', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  assert.equal(game.getIsOpenField(), true);
  assert.deepEqual(game.getMapGoal(), game.MAP_TYPES.tundra.goal);
  assert.deepEqual(game.getMapObstacles(), game.MAP_TYPES.tundra.obstacles);
  assert.deepEqual(game.getMapSpawnEdge(), game.MAP_TYPES.tundra.spawnEdge);

  game.setActiveMap(game.MAP_TYPES.volcanic);
  assert.equal(game.getIsOpenField(), false);
});

test('isPointOnPath always reads clear on Tundra now, on both of its old paths, but Volcanic (not yet converted) still blocks on its own path', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const [pathA, pathB] = game.MAP_TYPES.tundra.paths;
  assert.equal(game.isPointOnPath(pathA[0].x + 20, pathA[0].y, 28), false);
  assert.equal(game.isPointOnPath(pathB[0].x - 20, pathB[0].y, 28), false);

  game.setActiveMap(game.MAP_TYPES.volcanic);
  const volcanicStart = game.MAP_TYPES.volcanic.paths[0][0];
  assert.equal(game.isPointOnPath(volcanicStart.x + 20, volcanicStart.y, 28), true);
});

test('isPointInObstacle/isPointInGoal block placement on Tundra\'s own snowballs/fortress, and are harmless no-ops elsewhere on the map', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const obstacle = game.MAP_TYPES.tundra.obstacles[0];
  const midX = (obstacle.x1 + obstacle.x2) / 2;
  const midY = (obstacle.y1 + obstacle.y2) / 2;
  assert.equal(game.isPointInObstacle(midX, midY), true);
  assert.equal(game.isPointInObstacle(-500, -500), false);

  const goal = game.MAP_TYPES.tundra.goal;
  assert.equal(game.isPointInGoal(goal.x, goal.y), true);
  assert.equal(game.isPointInGoal(-500, -500), false);
});

test('buildOpenFieldRoute never crosses any of Tundra\'s own giant-snowball obstacles by less than the requested clearance', () => {
  const game = loadGameContext();
  const { obstacles } = game.MAP_TYPES.tundra;
  const goal = game.MAP_TYPES.tundra.goal;
  const edge = game.MAP_TYPES.tundra.spawnEdge;

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

test('an open-field enemy on Tundra spawns on its own spawn edge and routes to the fortress goal, then leaks correctly if it survives', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];

  const edge = game.MAP_TYPES.tundra.spawnEdge;
  assert.equal(enemy.x, edge.x1);
  const goal = game.MAP_TYPES.tundra.goal;
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

test('a walking tower on Tundra never crosses a snowball obstacle by more than its own clearance margin', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const obstacle = game.MAP_TYPES.tundra.obstacles[0];
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

test('renderMap/renderMapPreview never throw for Tundra\'s own open-field terrain (fortress + snowballs, no path stroke, no ice caves)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.tundra);
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 1.4));
  assert.doesNotThrow(() => game.renderMapPreview(ctx, game.MAP_TYPES.tundra, 0, 0, 400, 260, 1.4));
});

test('renderTundraDecor skips the old ice caves once the decor itself carries a fortress (checked via the decor object\'s own data, not the global MAP_OPEN_FIELD flag)', () => {
  // Regression guard for the exact bug class Savanah's own temple-hiding
  // guard hit: a guard keyed off the global MAP_OPEN_FIELD binding
  // (rather than this exact decor object's own data) would show/hide
  // Tundra's old caves based on whatever map happens to be globally
  // ACTIVE, not whether the decor object actually passed in has its own
  // fortress — exactly what renderMapPreview() relies on when previewing
  // a different map than the one currently active. `caves: null` here
  // would throw if the (incorrectly-entered) old-cave branch tried to
  // .forEach() it — doesNotThrow is the actual assertion.
  const game = loadGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  const fakeDecor = {
    boulders: [],
    iceSpikes: [],
    snowmen: [],
    caves: null,
    fortress: { x: 100, y: 100, size: 40 },
    snowballs: [],
  };
  assert.doesNotThrow(() => game.renderTundraDecor(ctx, fakeDecor, 0));
});

test('renderTundraDecor still draws the old ice caves for a decor object with NO fortress (e.g. a hypothetical pre-conversion snapshot)', () => {
  const game = loadGameContext();
  let ellipseCalls = 0;
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'ellipse') return () => { ellipseCalls += 1; };
        return () => {};
      },
    }
  );
  const fakeDecor = {
    boulders: [],
    iceSpikes: [],
    snowmen: [],
    caves: [{ x: 100, y: 100, size: 40 }],
    fortress: null,
  };
  game.renderTundraDecor(ctx, fakeDecor, 0);
  assert.ok(ellipseCalls > 0); // drawIceCave draws its own mound/mouth via ellipse
});
