const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Open-field rollout, The Hollow Event's turn — follow-up request,
// relayed from the peer session, after all 8 regular maps had already
// converted: "it should use the new engine (goal structure + spawn-edge/
// multi-side movement + obstacles + walking towers), not stay on its
// original fixed-path waypoints. Pick a goal structure and obstacle type
// that fit its gothic autumn-forest theme (your judgment)... Keep the
// rest of its design intact: 8-enemy roster, Mournful Sphinx at round 25,
// The Hollow Crow (now slow/tanky) as the round-50 final boss, the orange
// rounds-until-boss HUD, and the victory screen on round 50 clear." See
// test/the-hollow-event.test.js for all of that kept-intact coverage
// (roster/boss cadence/splash screen/win condition) — none of it reads
// path/waypoint data directly, so this file only needs to cover the new
// terrain data itself, the same way every open-field-<map>.test.js file
// already does for its own map.
//
// Design calls made for this map specifically, documented here and in
// map.js's own comments:
//   - Goal structure is an ancient withered hollow tree (assistant's own
//     judgment, of the request's own "crypt/mausoleum/withered hollow
//     tree" suggestions) — a literal nod to "The Hollow" in the event's
//     own name, and it slots into the forest setting this map already
//     has rather than needing a new graveyard art language. Placed at
//     the exact same (860, 320) spot Deep Forest's own cabin goal
//     already proved clear of this exact decor set (this map reuses
//     DEEP_FOREST_DECOR's own tree/bush arrays directly).
//   - Obstacles are fallen branches (assistant's own judgment, of the
//     request's own "fallen branches/headstones" suggestions) — threads
//     naturally with the fallen-leaves decor layer this map already has.
//     Spread one per rough quadrant from the start (the Deep Forest
//     log-clustering lesson, applied proactively this time).
//   - Spawn edge mirrors Deep Forest's own exactly (same left-side
//     position), preserving this stage's established "left to right"
//     feel for a returning player.

test('MAP_TYPES.theHollowEvent is now open-field, with its own goal/obstacles/spawn edge', () => {
  const game = loadGameContext();
  const hollow = game.MAP_TYPES.theHollowEvent;
  assert.equal(hollow.openField, true);
  assert.ok(hollow.goal && hollow.goal.radius > 0);
  assert.ok(Array.isArray(hollow.obstacles) && hollow.obstacles.length > 0);
  assert.ok(typeof hollow.spawnEdge.x1 === 'number');

  // Still NOT part of the normal map-select carousel — the open-field
  // conversion doesn't change how this stage is reached.
  assert.equal(game.MAP_TYPE_ORDER.includes('theHollowEvent'), false);
});

test('The Hollow Event\'s goal sits at the same (860, 320) spot Deep Forest\'s own cabin goal already proved clear of this exact reused decor set', () => {
  const game = loadGameContext();
  const hollow = game.MAP_TYPES.theHollowEvent;
  assert.equal(hollow.goal.x, 860);
  assert.equal(hollow.goal.y, 320);
  assert.equal(hollow.goal.x, game.MAP_TYPES.deepForest.goal.x);
  assert.equal(hollow.goal.y, game.MAP_TYPES.deepForest.goal.y);
  // But it's its own distinct goal OBJECT (a hollow tree, not a cabin) —
  // position reuse, not object reuse.
  assert.notEqual(hollow.goal, game.MAP_TYPES.deepForest.goal);
});

test('The Hollow Event\'s fallen-branch obstacles are a new array distinct from every other converted map\'s own', () => {
  const game = loadGameContext();
  const hollow = game.MAP_TYPES.theHollowEvent;
  assert.notDeepEqual(hollow.obstacles, game.MAP_TYPES.deepForest.obstacles);
  hollow.obstacles.forEach((obstacle) => {
    assert.equal(typeof obstacle.x1, 'number'); // same shared capsule shape every obstacle in the game uses
  });

  // The Deep Forest log-clustering lesson, applied proactively: no two
  // obstacles closer than 150px center to center.
  for (let i = 0; i < hollow.obstacles.length; i += 1) {
    for (let j = i + 1; j < hollow.obstacles.length; j += 1) {
      const a = hollow.obstacles[i];
      const b = hollow.obstacles[j];
      const ax = (a.x1 + a.x2) / 2;
      const ay = (a.y1 + a.y2) / 2;
      const bx = (b.x1 + b.x2) / 2;
      const by = (b.y1 + b.y2) / 2;
      const dist = Math.hypot(ax - bx, ay - by);
      assert.ok(dist >= 150, `obstacles ${i} and ${j} are only ${dist}px apart`);
    }
  }

  // The old fixed-waypoint data is kept, unused, same convention as
  // every prior conversion's own fallback.
  assert.equal(hollow.paths[0], game.MAP_TYPES.deepForest.paths[0]);
});

test('setActiveMap() updates the open-field bindings for The Hollow Event the same way it does for every other converted map', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.theHollowEvent);
  assert.equal(game.getIsOpenField(), true);
  assert.deepEqual(game.getMapGoal(), game.MAP_TYPES.theHollowEvent.goal);
  assert.deepEqual(game.getMapObstacles(), game.MAP_TYPES.theHollowEvent.obstacles);
  assert.deepEqual(game.getMapSpawnEdge(), game.MAP_TYPES.theHollowEvent.spawnEdge);
  assert.deepEqual(game.getMapSpawnEdges(), [game.MAP_TYPES.theHollowEvent.spawnEdge]); // single edge, same as every map besides Whirlpool
});

test('isPointOnPath always reads clear on The Hollow Event now; isPointInObstacle/isPointInGoal block placement on its own branches/tree', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.theHollowEvent);
  const waypoint = game.MAP_TYPES.theHollowEvent.paths[0][3];
  assert.equal(game.isPointOnPath(waypoint.x, waypoint.y, 28), false);

  const obstacle = game.MAP_TYPES.theHollowEvent.obstacles[0];
  const midX = (obstacle.x1 + obstacle.x2) / 2;
  const midY = (obstacle.y1 + obstacle.y2) / 2;
  assert.equal(game.isPointInObstacle(midX, midY), true);
  assert.equal(game.isPointInObstacle(-500, -500), false);

  const goal = game.MAP_TYPES.theHollowEvent.goal;
  assert.equal(game.isPointInGoal(goal.x, goal.y), true);
  assert.equal(game.isPointInGoal(-500, -500), false);
});

test('buildOpenFieldRoute never crosses any of The Hollow Event\'s own fallen branches by less than the requested clearance', () => {
  const game = loadGameContext();
  const { obstacles } = game.MAP_TYPES.theHollowEvent;
  const goal = game.MAP_TYPES.theHollowEvent.goal;
  const edge = game.MAP_TYPES.theHollowEvent.spawnEdge;

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

test('an open-field enemy on The Hollow Event spawns on its own spawn edge and routes to the hollow tree goal, then leaks correctly if it survives', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.theHollowEvent);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];

  const edge = game.MAP_TYPES.theHollowEvent.spawnEdge;
  assert.equal(enemy.x, edge.x1);
  const goal = game.MAP_TYPES.theHollowEvent.goal;
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

// The whole point of keeping the roster/boss-cadence mechanics
// untouched (see this file's own header comment): round 25/50 boss waves
// must still open-field-route exactly like every regular enemy, since
// nothing about the conversion is boss-specific.
test('The Hollow Crow (round 50 final boss) and Mournful Sphinx (round 25 mid-boss) both get real open-field routes to the same goal, same as every regular enemy', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.theHollowEvent);
  const goal = game.MAP_TYPES.theHollowEvent.goal;

  const sphinxWave = game.generateWave(25);
  const crowWave = game.generateWave(50);
  [sphinxWave[0], crowWave[0]].forEach((entry) => {
    game.spawnSingleEnemy(entry);
  });
  const [sphinx, crow] = game.getActiveEnemies();
  assert.equal(sphinx.name, 'Mournful Sphinx');
  assert.equal(crow.name, 'The Hollow Crow');
  [sphinx, crow].forEach((enemy) => {
    assert.equal(enemy.path[enemy.path.length - 1].x, goal.x);
    assert.equal(enemy.path[enemy.path.length - 1].y, goal.y);
  });
});

test('a walking tower on The Hollow Event never crosses a fallen-branch obstacle by more than its own clearance margin', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.theHollowEvent);
  const obstacle = game.MAP_TYPES.theHollowEvent.obstacles[0];
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

test('renderMap/renderMapPreview never throw for The Hollow Event\'s own open-field terrain (hollow tree + branches + reused trees/bushes/leaves, no path stroke)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.theHollowEvent);
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 1.4));
  assert.doesNotThrow(() => game.renderMapPreview(ctx, game.MAP_TYPES.theHollowEvent, 0, 0, 400, 260, 1.4));
});
