const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// New map: Deep Sea (direct user request: "add new map called deep sea it
// will have ruins sand and it will be dark blue and the tower will be a
// sumbrine" — "the tower" read as "the goal structure," the same role
// every other open-field map's own named structure plays, since the
// surrounding context is entirely about per-map GOAL structures, not the
// player's placeable defense towers). Built open-field from the start
// (same system Deep Forest/Marshland/Savanah already converted to) rather
// than shipping with a legacy fixed path first, and with its obstacles
// spread across the whole field from day one (the Deep Forest log-
// clustering complaint is a lesson applied immediately here, not left for
// a follow-up fix).
//
// 8 named enemies (6 regular + 2 bosses), exactly as specified: Snailfish,
// Rattail Fish, Giant Cusk Eel (tier 1); Spiny Star, Giant Sea Spider,
// Fragile Pink Sea Urchin (tier 2); Whalefish and California Sun Star
// (the 2 bosses) — same 2-boss roster shape CAVES_ROSTER already uses
// (order/orderTier2 of 3 each, orderTier3 empty, bossTypes only at tiers
// 1/2), rather than the usual 3-boss shape.

test('MAP_TYPES.deepSea exists, is open-field, and is included in the map carousel order', () => {
  const game = loadGameContext();
  const deepSea = game.MAP_TYPES.deepSea;
  assert.ok(deepSea);
  assert.equal(deepSea.openField, true);
  assert.equal(deepSea.terrain, 'deepSea');
  assert.ok(game.MAP_TYPE_ORDER.includes('deepSea'));
});

test('Deep Sea has its own goal (submarine), spawn edge, and ruins obstacles, spread across the whole field (no tight clustering)', () => {
  const game = loadGameContext();
  const deepSea = game.MAP_TYPES.deepSea;
  assert.equal(typeof deepSea.goal.x, 'number');
  assert.equal(typeof deepSea.goal.y, 'number');
  assert.ok(deepSea.goal.radius > 0);
  assert.equal(typeof deepSea.spawnEdge.x1, 'number');

  assert.ok(Array.isArray(deepSea.obstacles) && deepSea.obstacles.length > 0);
  // No two obstacle centers closer than ~150px — the exact complaint a
  // follow-up request raised about Deep Forest's own original layout,
  // checked here from the start instead.
  const centers = deepSea.obstacles.map((o) => ({ x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 }));
  for (let i = 0; i < centers.length; i += 1) {
    for (let j = i + 1; j < centers.length; j += 1) {
      const dist = Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y);
      assert.ok(dist > 150, `obstacles ${i} and ${j} are only ${dist.toFixed(0)}px apart`);
    }
  }
});

test('setActiveMap() updates the open-field bindings for Deep Sea', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  assert.equal(game.getIsOpenField(), true);
  assert.deepEqual(game.getMapGoal(), game.MAP_TYPES.deepSea.goal);
  assert.deepEqual(game.getMapObstacles(), game.MAP_TYPES.deepSea.obstacles);
  assert.deepEqual(game.getMapSpawnEdge(), game.MAP_TYPES.deepSea.spawnEdge);
});

test('buildOpenFieldRoute never crosses any of Deep Sea\'s own ruins obstacles by less than the requested clearance', () => {
  const game = loadGameContext();
  const { obstacles } = game.MAP_TYPES.deepSea;
  const goal = game.MAP_TYPES.deepSea.goal;
  const edge = game.MAP_TYPES.deepSea.spawnEdge;

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

test('an open-field enemy on Deep Sea spawns on its own spawn edge and routes to the submarine goal, then leaks correctly if it survives', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];

  const edge = game.MAP_TYPES.deepSea.spawnEdge;
  assert.equal(enemy.x, edge.x1);
  const goal = game.MAP_TYPES.deepSea.goal;
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

test('DEEP_SEA_ROSTER has exactly the 6 named regular species (3 tier1 + 3 tier2) and 2 named bosses', () => {
  const game = loadGameContext();
  const roster = game.MAP_ROSTERS.deepSea;
  assert.deepEqual(roster.order, ['snailFish', 'rattailFish', 'giantCuskEel']);
  assert.deepEqual(roster.orderTier2, ['spinyStar', 'giantSeaSpider', 'fragilePinkSeaUrchin']);
  assert.deepEqual(roster.orderTier3, []);
  assert.equal(roster.enemyTypes.snailFish.name, 'Snailfish');
  assert.equal(roster.enemyTypes.rattailFish.name, 'Rattail Fish');
  assert.equal(roster.enemyTypes.giantCuskEel.name, 'Giant Cusk Eel');
  assert.equal(roster.enemyTypes.spinyStar.name, 'Spiny Star');
  assert.equal(roster.enemyTypes.giantSeaSpider.name, 'Giant Sea Spider');
  assert.equal(roster.enemyTypes.fragilePinkSeaUrchin.name, 'Fragile Pink Sea Urchin');
  assert.deepEqual(Object.keys(roster.bossTypes).map(Number), [1, 2]);
  assert.equal(roster.bossTypes[1].name, 'Whalefish');
  assert.equal(roster.bossTypes[2].name, 'California Sun Star');
  // The final boss is the tankiest thing in the roster, same "biggest/
  // slowest/toughest" billing every other map's final boss gets.
  assert.ok(roster.bossTypes[2].health > roster.bossTypes[1].health);
});

test('getBossForRound falls back to tier 2 (the highest designed tier) past round 50 on Deep Sea, same as Caves\' own 2-boss roster', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  const boss25 = game.getBossForRound(25);
  const boss50 = game.getBossForRound(50);
  const boss75 = game.getBossForRound(75);
  assert.equal(boss25.tier, 1);
  assert.equal(boss50.tier, 2);
  assert.equal(boss75.tier, 2); // falls back, doesn't crash or invent a tier 3
  assert.equal(boss75.terrain, 'deepSea');
});

test('Deep Sea is Hard-tier difficulty (1.8x), matching Whirlpool/Tundra/Volcanic', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  const deepSeaMultiplier = game.getRoundScaling(10).healthMultiplier;
  game.setActiveMap(game.MAP_TYPES.whirlpool);
  const whirlpoolMultiplier = game.getRoundScaling(10).healthMultiplier;
  assert.equal(deepSeaMultiplier, whirlpoolMultiplier);
});

test('every Deep Sea enemy and boss draw function renders without throwing', () => {
  const game = loadFullGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  const roster = game.MAP_ROSTERS.deepSea;
  Object.entries(roster.enemyTypes).forEach(([key, type]) => {
    assert.doesNotThrow(
      () => game.drawEnemyShape(ctx, { x: 100, y: 100, radius: type.radius, color: type.color, enemyKey: key, isBoss: false }),
      `${key} threw`
    );
  });
  [1, 2].forEach((tier) => {
    const boss = roster.bossTypes[tier];
    assert.doesNotThrow(() =>
      game.drawEnemyShape(ctx, { x: 100, y: 100, radius: boss.radius, color: boss.color, enemyKey: `deepSea-boss-tier-${tier}`, isBoss: true })
    );
  });
});

test('renderMap/renderMapPreview never throw for Deep Sea\'s own terrain (submarine + ruins + sand dunes, no path stroke)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 1.4));
  assert.doesNotThrow(() => game.renderMapPreview(ctx, game.MAP_TYPES.deepSea, 0, 0, 400, 260, 1.4));
});
