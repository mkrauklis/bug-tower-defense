const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Island/rock placement surfaces (direct follow-up request, relayed from
// the peer session): "scatter several island/rock formations across each
// [water] map that towers CAN be placed on — styled like a natural
// rounded boulder/rock-island... Vary sizes... New rule for these two
// maps specifically: towers can no longer be placed directly in open
// water — placement is only valid on these islands/rocks (or any other
// existing solid ground on those maps), UNLESS a tower is tagged as a
// 'water type'... Add a `waterType: true` flag to TOWER_TYPES as the
// mechanism for this, but note: none of the 5 current towers... are
// water-type, so until one exists, every tower placement on these two
// maps will need to go on an island/rock. That's an intentional
// consequence of this request as I understand it."
//
// Design calls made for this feature, documented here and in map.js/
// game.js/towers.js's own comments:
//   - Islands are a NEW, separate data structure (MAP_ISLANDS) from the
//     existing raft/ruins MAP_OBSTACLES — obstacles stay fully
//     impassable/unplaceable (isPointInObstacle/MAP_OBSTACLES
//     untouched); islands are placement-ENABLING instead, checked via
//     their own isPointOnIsland().
//   - Enemy routing: "make sure enemy routing still treats water as
//     walkable... islands/rocks don't block enemy movement unless you
//     think they should read as obstacles too (your call)." This
//     assistant's own call: yes, islands DO block enemy movement, same
//     as any other obstacle — createEnemyInstance (enemies.js) routes
//     around MAP_OBSTACLES.concat(MAP_ISLANDS).
//   - Walking-tower MOVEMENT (once placed) is untouched — this is a
//     PLACEMENT-only rule, per the request's own literal wording; an
//     already-placed tower can still wander anywhere in the open field
//     chasing enemies, same as on every other map.

test('Whirlpool and Deep Sea both have requiresLandPlacement + a varied-size island list; every other map has neither', () => {
  const game = loadGameContext();
  ['whirlpool', 'deepSea'].forEach((id) => {
    const map = game.MAP_TYPES[id];
    assert.equal(map.requiresLandPlacement, true);
    assert.ok(Array.isArray(map.islands) && map.islands.length >= 3);
    const radii = map.islands.map((island) => island.radius);
    assert.ok(Math.max(...radii) >= 55, 'expected at least one "big enough for a couple of towers" island');
    assert.ok(Math.min(...radii) <= 40, 'expected at least one small single-tower rock');
  });

  ['deepForest', 'marshland', 'savanah', 'tundra', 'volcanic', 'caves', 'theHollowEvent'].forEach((id) => {
    const map = game.MAP_TYPES[id];
    assert.equal(Boolean(map.requiresLandPlacement), false, `${id} should not require land placement`);
    assert.equal(map.islands, undefined, `${id} should have no islands`);
  });
});

test('islands are spread clear of each other, the goal, and every raft/ruins obstacle on their own map (no tight clustering)', () => {
  const game = loadGameContext();
  ['whirlpool', 'deepSea'].forEach((id) => {
    const map = game.MAP_TYPES[id];
    for (let i = 0; i < map.islands.length; i += 1) {
      for (let j = i + 1; j < map.islands.length; j += 1) {
        const a = map.islands[i];
        const b = map.islands[j];
        const dist = Math.hypot(a.x1 - b.x1, a.y1 - b.y1);
        assert.ok(dist > a.radius + b.radius, `${id} islands ${i}/${j} overlap`);
      }
    }
    map.islands.forEach((island) => {
      const distToGoal = Math.hypot(island.x1 - map.goal.x, island.y1 - map.goal.y);
      assert.ok(distToGoal > island.radius + map.goal.radius, `${id} island overlaps the goal`);
      map.obstacles.forEach((obstacle) => {
        const distToObstacle = Math.hypot(island.x1 - obstacle.x1, island.y1 - obstacle.y1);
        assert.ok(distToObstacle > island.radius + obstacle.radius, `${id} island overlaps an obstacle`);
      });
    });
  });
});

test('isPointOnIsland is true at an island\'s own center and false out in open water, and is false everywhere on a map with no islands', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const island = game.MAP_TYPES.whirlpool.islands[0];
  assert.equal(game.isPointOnIsland(island.x1, island.y1), true);
  assert.equal(game.isPointOnIsland(island.x1, island.y1 + island.radius + 20), false);
  assert.equal(game.isPointOnIsland(500, 500), false); // open water, far from every island

  game.setActiveMap(game.MAP_TYPES.deepForest);
  assert.equal(game.getMapIslands().length, 0);
  assert.equal(game.isPointOnIsland(400, 300), false);
});

test('setActiveMap() exposes requiresLandPlacement/islands for Whirlpool and Deep Sea, and falls back to false/[] for every other map', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  assert.equal(game.getMapRequiresLandPlacement(), true);
  assert.deepEqual(game.getMapIslands(), game.MAP_TYPES.whirlpool.islands);

  game.setActiveMap(game.MAP_TYPES.deepSea);
  assert.equal(game.getMapRequiresLandPlacement(), true);
  assert.deepEqual(game.getMapIslands(), game.MAP_TYPES.deepSea.islands);

  game.setActiveMap(game.MAP_TYPES.marshland);
  assert.equal(game.getMapRequiresLandPlacement(), false);
  assert.deepEqual(game.getMapIslands(), []);
});

test('isOnValidTowerGround: a non-water-type tower can only be placed on an island on Whirlpool/Deep Sea, but anywhere on every other map', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.whirlpool);
  game.startGame('sandbox');
  const island = game.MAP_TYPES.whirlpool.islands[0];

  assert.equal(game.isOnValidTowerGround(island.x1, island.y1, 'sunflower'), true);
  assert.equal(game.isOnValidTowerGround(500, 500, 'sunflower'), false); // open water, far from every island

  // Every current tower type is non-water — confirms the request's own
  // stated "intentional consequence" holds for all 5.
  Object.keys(game.TOWER_TYPES).forEach((typeKey) => {
    assert.equal(Boolean(game.TOWER_TYPES[typeKey].waterType), false);
    assert.equal(game.isOnValidTowerGround(500, 500, typeKey), false);
  });

  // A map without the new rule: valid anywhere (same as before this feature).
  game.setSelectedMap(game.MAP_TYPES.deepForest);
  game.startGame('sandbox');
  assert.equal(game.isOnValidTowerGround(400, 300, 'sunflower'), true);
});

test('a tower flagged waterType: true bypasses the island requirement entirely, placeable directly in open water', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.whirlpool);
  game.startGame('sandbox');

  // This game's own vm context is fresh per loadFullGameContext() call
  // (see loadGame.js's own top comment), so mutating TOWER_TYPES here
  // can't leak into any other test.
  game.TOWER_TYPES.sunflower.waterType = true;
  assert.equal(game.isOnValidTowerGround(500, 500, 'sunflower'), true); // open water, now allowed
});

test('handleCanvasTap refuses to place a non-water tower in open water on Whirlpool, but succeeds on one of its own islands', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.whirlpool);
  game.startGame('sandbox');
  game.setSelectedShopItem({ typeKey: 'sunflower' });

  game.handleCanvasTap(500, 500); // open water
  assert.equal(game.getTowers().length, 0);

  const island = game.MAP_TYPES.whirlpool.islands[0];
  game.setSelectedShopItem({ typeKey: 'sunflower' });
  game.handleCanvasTap(island.x1, island.y1);
  assert.equal(game.getTowers().length, 1);
  assert.equal(game.getTowers()[0].x, island.x1);
  assert.equal(game.getTowers()[0].y, island.y1);
});

test('handleCanvasTap behaves identically to before this feature on a map without the new rule (Deep Forest) — open-field ground away from obstacles is always valid', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.deepForest);
  game.startGame('sandbox');
  game.setSelectedShopItem({ typeKey: 'sunflower' });
  game.handleCanvasTap(400, 300); // ordinary open ground, no island concept here
  assert.equal(game.getTowers().length, 1);
});

test('enemy open-field routing threads around an island the same way it does any other obstacle, with real clearance', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const island = game.MAP_TYPES.whirlpool.islands[1]; // the "big" one
  const goal = game.MAP_TYPES.whirlpool.goal;

  // A spawn point deliberately placed so the straight line to the goal
  // passes right through the island, forcing a real detour.
  const spawnX = island.x1 + 150;
  const spawnY = island.y1;
  const obstaclesPlusIslands = game.getMapObstacles().concat(game.getMapIslands());
  const route = game.buildOpenFieldRoute(spawnX, spawnY, goal.x, goal.y, obstaclesPlusIslands, 10);

  assert.ok(route.length > 2, 'expected a real detour, not a straight line through the island');
  for (let s = 0; s < route.length - 1; s += 1) {
    const a = route[s];
    const b = route[s + 1];
    for (let t = 0; t <= 20; t += 1) {
      const tt = t / 20;
      const px = a.x + (b.x - a.x) * tt;
      const py = a.y + (b.y - a.y) * tt;
      const clearance = game.distanceToObstacle(px, py, island) - 10;
      assert.ok(clearance > -1, `route clipped the island by ${-clearance}px`);
    }
  }
});

test('an enemy actually spawned on Whirlpool gets a route built with islands included (createEnemyInstance), not just plain obstacles', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const island = game.MAP_TYPES.whirlpool.islands[1];

  // Spawn many enemies — with 4 spawn edges + round-robin, at least one
  // should roll a path that would cross this island if islands weren't
  // included in the routing obstacles.
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  for (let i = 0; i < 40; i += 1) game.spawnSingleEnemy(entry);

  game.getActiveEnemies().forEach((enemy) => {
    for (let s = 0; s < enemy.path.length - 1; s += 1) {
      const a = enemy.path[s];
      const b = enemy.path[s + 1];
      for (let t = 0; t <= 10; t += 1) {
        const tt = t / 10;
        const px = a.x + (b.x - a.x) * tt;
        const py = a.y + (b.y - a.y) * tt;
        const clearance = game.distanceToObstacle(px, py, island) - enemy.radius;
        assert.ok(clearance > -1, `a spawned enemy's own route clipped the island by ${-clearance}px`);
      }
    }
  });
});

test('a walking tower already placed on an island can still wander off it to chase an enemy — placement rule doesn\'t restrict movement', () => {
  const game = loadFullGameContext();
  game.setSelectedMap(game.MAP_TYPES.whirlpool);
  game.startGame('sandbox');
  const island = game.MAP_TYPES.whirlpool.islands[1];
  game.setSelectedShopItem({ typeKey: 'sunflower' });
  game.handleCanvasTap(island.x1, island.y1);
  const tower = game.getTowers()[0];

  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];
  enemy.x = island.x1 - 200;
  enemy.y = island.y1 + 200;
  enemy.spawned = true;
  enemy.health = enemy.maxHealth;

  const startX = tower.x;
  const startY = tower.y;
  for (let i = 0; i < 120; i += 1) game.update(1 / 60);
  const moved = Math.hypot(tower.x - startX, tower.y - startY) > 5;
  assert.equal(moved, true);
});

test('renderMap/renderMapPreview never throw for Whirlpool/Deep Sea\'s own new island art (drawRockIsland)', () => {
  const game = loadGameContext();
  // drawRockIsland itself uses no gradients, but Whirlpool's own
  // background vignette (renderWhirlpoolBackground) and Deep Sea's own
  // ambient fish (drawBiolumFish) both already do — a bare do-nothing
  // stub can't satisfy a real ctx.createRadialGradient().addColorStop()
  // call (same latent gap flagged in open-field-hollow-event.test.js/
  // deep-sea-map.test.js), so this stubs just that one method properly
  // rather than repeating the mistake in a new test file.
  const ctx = new Proxy({}, { get: (obj, prop) => (prop === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : () => {}) });
  ['whirlpool', 'deepSea'].forEach((id) => {
    game.setActiveMap(game.MAP_TYPES[id]);
    assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 1.4));
    assert.doesNotThrow(() => game.renderMapPreview(ctx, game.MAP_TYPES[id], 0, 0, 400, 260, 1.4));
  });
});
