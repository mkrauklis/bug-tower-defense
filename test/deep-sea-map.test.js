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
// Originally shipped with 8 named enemies (6 regular + 2 bosses), exactly
// as specified: Snailfish, Rattail Fish, Giant Cusk Eel (tier 1); Spiny
// Star, Giant Sea Spider, Fragile Pink Sea Urchin (tier 2); Whalefish and
// California Sun Star (the 2 bosses) — same 2-boss roster shape
// CAVES_ROSTER already uses (order/orderTier2 of 3 each, orderTier3
// empty, bossTypes only at tiers 1/2), rather than the usual 3-boss shape.
//
// Follow-up request, relayed from the peer session, later added 4 more:
// Glowing Plankton, Glowfish, Anglerfish (orderTier3) and Oarfish (the
// new tier-3/final boss) — converting Deep Sea to the standard 3-boss
// shape every other Hard-tier map already uses. See DEEP_SEA_ROSTER's
// own top comment (enemies.js) for the full design/balance reasoning;
// see test/deep-sea-new-enemies.test.js for that follow-up's own
// dedicated coverage.

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

test('DEEP_SEA_ROSTER has the original 6 named tier1/tier2 regular species and the original 2 bosses, unchanged by the later tier3/Oarfish follow-up', () => {
  const game = loadGameContext();
  const roster = game.MAP_ROSTERS.deepSea;
  assert.deepEqual(roster.order, ['snailFish', 'rattailFish', 'giantCuskEel']);
  assert.deepEqual(roster.orderTier2, ['spinyStar', 'giantSeaSpider', 'fragilePinkSeaUrchin']);
  assert.equal(roster.enemyTypes.snailFish.name, 'Snailfish');
  assert.equal(roster.enemyTypes.rattailFish.name, 'Rattail Fish');
  assert.equal(roster.enemyTypes.giantCuskEel.name, 'Giant Cusk Eel');
  assert.equal(roster.enemyTypes.spinyStar.name, 'Spiny Star');
  assert.equal(roster.enemyTypes.giantSeaSpider.name, 'Giant Sea Spider');
  assert.equal(roster.enemyTypes.fragilePinkSeaUrchin.name, 'Fragile Pink Sea Urchin');
  assert.equal(roster.bossTypes[1].name, 'Whalefish');
  assert.equal(roster.bossTypes[2].name, 'California Sun Star');
  assert.ok(roster.bossTypes[2].health > roster.bossTypes[1].health);
  // orderTier3/bossTypes[3] now exist too (see
  // test/deep-sea-new-enemies.test.js for that follow-up's own coverage)
  // — this test only pins down that the ORIGINAL 8 are untouched.
});

test('getBossForRound reaches round 75 on Deep Sea without crashing (the tier-3 boss itself is covered in test/deep-sea-new-enemies.test.js)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  const boss25 = game.getBossForRound(25);
  const boss50 = game.getBossForRound(50);
  const boss75 = game.getBossForRound(75);
  assert.equal(boss25.tier, 1);
  assert.equal(boss50.tier, 2);
  assert.equal(boss75.terrain, 'deepSea');
  assert.doesNotThrow(() => game.getBossForRound(100)); // past every designed tier — still falls back gracefully
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
  [1, 2, 3].forEach((tier) => {
    const boss = roster.bossTypes[tier];
    // Tier 3 (Oarfish) has no BOSS_DRAW_FUNCTIONS entry at all — it's a
    // millipede-family member (MILLIPEDE_FAMILY_KEYS), rendered through
    // renderMillipedeBody() instead whenever enemy.trail is set, same
    // exception Marshland's Electric Eel boss already has. Calling
    // drawEnemyShape() directly here (no `trail` field on this bare test
    // object) exercises its drawFallbackCircle() fallback path instead —
    // still a valid "doesn't throw" check, just not its real rendering
    // path; see test/deep-sea-new-enemies.test.js for that.
    assert.doesNotThrow(() =>
      game.drawEnemyShape(ctx, { x: 100, y: 100, radius: boss.radius, color: boss.color, enemyKey: `deepSea-boss-tier-${tier}`, isBoss: true })
    );
  });
});

test('renderMap/renderMapPreview never throw for Deep Sea\'s own terrain (submarine + ruins + sand dunes, no path stroke)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  // A bare do-nothing-for-everything stub (every other open-field-*
  // test's own convention) can't satisfy the bioluminescent-fish follow-
  // up's new ctx.createRadialGradient().addColorStop() call (see
  // createGradientSafeCtx's own comment further down this file) — this
  // map's own decor now genuinely needs that one method stubbed
  // properly, unlike before that follow-up landed.
  const ctx = createGradientSafeCtx();
  assert.doesNotThrow(() => game.renderMap(ctx, { width: 960, height: 640 }, 1.4));
  assert.doesNotThrow(() => game.renderMapPreview(ctx, game.MAP_TYPES.deepSea, 0, 0, 400, 260, 1.4));
});

// Follow-up requests, relayed from the peer session, both "visual only":
//   1. "make it darker overall (deeper, murkier navy/black tone than it
//      currently is)."
//   2. "add tiny bioluminescent fish swimming around in the background as
//      ambient decoration — small glowing specks/fish silhouettes
//      drifting around the map independent of actual enemies, purely
//      atmospheric (not real spawnable creatures, no gameplay
//      interaction)." Count/speed/glow color left to this assistant's own
//      judgment per the request's own "use your own judgment."

test('Deep Sea\'s background is darker than its original color, and stays a navy/black hue rather than drifting toward some other color entirely', () => {
  const game = loadFullGameContext();
  const background = game.TERRAIN_THEMES.deepSea.background;
  const parseHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r, g, b] = parseHex(background);
  const [origR, origG, origB] = parseHex('#0d1b2e');

  assert.ok(r + g + b < origR + origG + origB, 'expected the new background to be darker overall');
  assert.ok(b >= r && b >= g, 'expected the hue to stay navy/blue-leaning, not shift to some other color');
});

test('DEEP_SEA_BIOLUM_FISH is a small, non-empty, deterministic set of ambient fish lanes — not real spawnable enemies', () => {
  const game = loadGameContext();
  const lanes = game.DEEP_SEA_BIOLUM_FISH;
  assert.ok(Array.isArray(lanes) && lanes.length > 0 && lanes.length <= 15); // "a handful," not a crowd
  lanes.forEach((fish) => {
    assert.equal(typeof fish.y, 'number');
    assert.equal(typeof fish.speed, 'number');
    assert.equal(typeof fish.size, 'number');
    assert.ok(fish.direction === 1 || fish.direction === -1);
    assert.equal(typeof fish.phase, 'number');
  });
  // Pure function of index, built once at module load — rebuilding from
  // the same seed produces the exact same lanes, same convention
  // buildFallenLeafPositions (The Hollow Event) already established.
  const rebuilt = game.DEEP_SEA_BIOLUM_FISH; // same module-level array, not a fresh build, but confirms it's stable across reads
  assert.deepEqual(lanes, rebuilt);
});

// A plain bare-stub ctx (every property a no-op) is what every other
// open-field-*.test.js file's own "renderMap never throws" test already
// uses — but it can't satisfy a real ctx.createRadialGradient().
// addColorStop() call (the stub's createRadialGradient() call returns
// undefined, same latent gap flagged in open-field-hollow-event.test.js
// for its own new gradient-using goal art), so this one additionally
// stubs just that one method to return a minimal gradient-shaped object.
function createGradientSafeCtx() {
  return new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
    }
  );
}

test('renderDeepSeaBiolumFish never throws, and is purely cosmetic — doesn\'t touch activeEnemies, money, health, or anything else gameplay-relevant', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepSea);
  const ctx = createGradientSafeCtx();
  const enemiesBefore = game.getActiveEnemies().length;
  const moneyBefore = game.getMoney();

  [0, 1.1, 5.7].forEach((time) => {
    assert.doesNotThrow(() => game.renderDeepSeaBiolumFish(ctx, 960, time));
  });

  assert.equal(game.getActiveEnemies().length, enemiesBefore);
  assert.equal(game.getMoney(), moneyBefore);
});

// A small translate-tracking ctx mock — real canvas drawing is relative
// to the current ctx.translate() offset, which a bare do-nothing stub
// can't account for, so this one actually accumulates it (save/restore
// included) to recover each fish's real world-space position from its
// own local-origin arc() call.
function createTranslateTrackingCtx(onArcAtWorldOrigin) {
  let offsetX = 0;
  let offsetY = 0;
  const stack = [];
  return new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'translate') return (dx, dy) => { offsetX += dx; offsetY += dy; };
        if (prop === 'save') return () => stack.push([offsetX, offsetY]);
        if (prop === 'restore') return () => { [offsetX, offsetY] = stack.pop(); };
        if (prop === 'scale') return () => {};
        if (prop === 'arc') return () => onArcAtWorldOrigin(offsetX, offsetY);
        if (prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
    }
  );
}

test('each bioluminescent fish keeps drifting rather than sitting still — its x position actually changes between two points in time', () => {
  const game = loadGameContext();
  const positionsAt = (time) => {
    const positions = [];
    const ctx = createTranslateTrackingCtx((x) => positions.push(x));
    game.renderDeepSeaBiolumFish(ctx, 960, time);
    return positions;
  };

  const first = positionsAt(0);
  const later = positionsAt(10);
  assert.equal(first.length, game.DEEP_SEA_BIOLUM_FISH.length); // one glow-circle arc() call per fish
  const anyMoved = first.some((x, i) => Math.abs(x - later[i]) > 1);
  assert.ok(anyMoved, 'expected at least one fish to have visibly drifted after 10 seconds');
});
