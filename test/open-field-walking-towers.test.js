const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Open-field rework, part 2/2 (core mechanic replacement, relayed from
// the peer session, confirmed with the user as "replace it everywhere"):
// "Towers (plants) are no longer static placements — they get legs and
// walk around the map, each tower type with its own distinct movement
// speed." Built on Deep Forest only, same as part 1 (goal structure/
// obstacles/enemy movement, see open-field-deep-forest.test.js) — every
// other map's towers stay completely static.
//
// Design calls made along the way, documented here and in towers.js/
// game.js's own comments:
//   - Autonomous movement, not player-directed (the peer's own stated
//     default, since the request didn't ask for manual control): a
//     tower chases the nearest living enemy within a generous radius,
//     settling at its own effective attack range rather than walking
//     into melee; with nothing nearby, it drifts (more slowly) toward
//     the spawn-edge-to-goal corridor instead of sitting wherever it
//     was first placed forever.
//   - Per-type walk speed (slow/heavy vs. fast/light, the peer's own
//     "your judgment" call): a stouter plant (Mushroom) is the slowest
//     and the only one on 2 legs instead of 4; Sunflower (light, open
//     bloom) is the fastest.
//   - Obstacles block tower movement exactly like they block enemy
//     movement (a fallen log it can't walk through); towers do NOT
//     block each other or enemies.
//   - A full architecture audit (click-to-select/findTowerAt, range-
//     circle/selected-tower-panel rendering, isTowerPlacementBlocked,
//     getTowersInRange/consumeTowersInRange/destroyTowers, the Prodigy
//     upgrade's position copy) found every one of these already reads
//     tower.x/tower.y live at call time rather than caching a placement
//     position — this project's existing immediate-mode rendering style
//     meant zero of them needed to change for a tower that moves after
//     being placed.

test('a walking tower never crosses any Deep Forest obstacle by more than its own clearance margin, chasing a far-side target', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const obstacle = game.MAP_TYPES.deepForest.obstacles[0];
  const cx = (obstacle.x1 + obstacle.x2) / 2;
  const cy = (obstacle.y1 + obstacle.y2) / 2;

  const tower = game.createTower('sunflower');
  tower.x = cx - 60;
  tower.y = cy;
  game.setTowers([tower]);

  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];
  enemy.x = cx + 60; // the far side of the log — pulls the tower toward/through it
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

test('a tower drifts toward the spawn-edge-to-goal corridor when idle, and holds still once it is already on it', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const tower = game.createTower('sunflower');
  tower.x = 500;
  tower.y = 50; // well off the corridor, far from any enemy
  game.setTowers([tower]);

  const target1 = game.getTowerMovementTarget(tower);
  assert.ok(target1); // should have somewhere to walk toward
  assert.equal(target1.idle, true);

  game.updateTowerMovement(tower, 1);
  assert.notEqual(tower.y, 50); // actually moved toward the corridor

  // Once already sitting on the corridor line itself, there's nothing
  // left to walk toward.
  const spawnEdge = game.MAP_TYPES.deepForest.spawnEdge;
  const goal = game.MAP_TYPES.deepForest.goal;
  const midX = (spawnEdge.x1 + spawnEdge.x2) / 2;
  const midY = (spawnEdge.y1 + spawnEdge.y2) / 2;
  tower.x = (midX + goal.x) / 2;
  tower.y = (midY + goal.y) / 2;
  const target2 = game.getTowerMovementTarget(tower);
  assert.equal(target2, null);
});

test('a tower chases the nearest enemy within its own interest radius and stops at its effective attack range, not point-blank', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const tower = game.createTower('sunflower');
  tower.x = 100;
  tower.y = 100;
  game.setTowers([tower]);

  const entry = game.getSpawnEntryForEnemyKey(game.getAllSpawnableEnemyKeys()[0]);
  game.spawnSingleEnemy(entry);
  const enemy = game.getActiveEnemies()[0];
  enemy.x = 100 + tower.stats.range; // well within the interest radius (range * 2.5)
  enemy.y = 100;
  enemy.spawned = true;

  const target = game.getTowerMovementTarget(tower);
  assert.ok(target);
  assert.equal(target.idle, false);
  const standoff = tower.stats.range * 0.7;
  const targetDistFromEnemy = Math.hypot(target.x - enemy.x, target.y - enemy.y);
  assert.ok(Math.abs(targetDistFromEnemy - standoff) < 0.01); // aims to stop at the standoff distance, not on top of the enemy

  // Already within the standoff distance — holds position instead of
  // walking any closer.
  tower.x = enemy.x - standoff + 1;
  tower.y = enemy.y;
  assert.equal(game.getTowerMovementTarget(tower), null);
});

test('each of the 5 base tower types has its own distinct walk speed (Mushroom slowest/2 legs, Sunflower fastest/4 legs), and a Prodigy inherits its base type\'s numbers', () => {
  const game = loadFullGameContext();
  const speeds = {
    sunflower: game.getTowerWalkSpeed('sunflower'),
    rose: game.getTowerWalkSpeed('rose'),
    mushroom: game.getTowerWalkSpeed('mushroom'),
    corpseFlower: game.getTowerWalkSpeed('corpseFlower'),
    arcticWillow: game.getTowerWalkSpeed('arcticWillow'),
  };
  const uniqueSpeeds = new Set(Object.values(speeds));
  assert.equal(uniqueSpeeds.size, 5); // all 5 distinct, not sharing one flat number
  assert.equal(speeds.mushroom, Math.min(...Object.values(speeds)));
  assert.equal(speeds.sunflower, Math.max(...Object.values(speeds)));
  assert.equal(game.getTowerLegCount('mushroom'), 2);
  assert.equal(game.getTowerLegCount('sunflower'), 4);

  // sunlitConductor is the Sunflower's own Prodigy (PRODIGY_BASE_TYPE).
  assert.equal(game.getTowerWalkSpeed('sunlitConductor'), speeds.sunflower);
  assert.equal(game.getTowerLegCount('sunlitConductor'), game.getTowerLegCount('sunflower'));
});

test('a walking tower\'s walkPhase only advances while it is actually moving, not while idle/holding position', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const tower = game.createTower('sunflower');
  const spawnEdge = game.MAP_TYPES.deepForest.spawnEdge;
  const goal = game.MAP_TYPES.deepForest.goal;
  // Already sitting exactly on the corridor and with no enemy around —
  // getTowerMovementTarget should return null, so walkPhase must hold.
  tower.x = (spawnEdge.x1 + spawnEdge.x2) / 2 + (goal.x - (spawnEdge.x1 + spawnEdge.x2) / 2) * 0.5;
  tower.y = (spawnEdge.y1 + spawnEdge.y2) / 2 + (goal.y - (spawnEdge.y1 + spawnEdge.y2) / 2) * 0.5;
  tower.walkPhase = 0;
  game.setTowers([tower]);
  game.updateTowerMovement(tower, 1);
  assert.equal(tower.walkPhase, 0);

  tower.x = 500;
  tower.y = 50; // off the corridor again — should actually walk and animate
  game.updateTowerMovement(tower, 1);
  assert.notEqual(tower.walkPhase, 0);
});

test('findTowerAt tracks a tower\'s CURRENT position, not where it was originally placed', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const tower = game.createTower('sunflower');
  tower.x = 500;
  tower.y = 100;
  game.setTowers([tower]);

  for (let i = 0; i < 180; i += 1) game.update(1 / 60); // let it drift away from (500, 100)
  assert.notEqual(tower.x, 500);

  assert.equal(game.findTowerAt(500, 100), null); // nothing found at the old spot any more
  assert.equal(game.findTowerAt(tower.x, tower.y), tower); // found at its real current spot
});

test('a selected tower\'s range-circle overlay and the Selected Tower panel both still render without throwing after it has moved', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const tower = game.createTower('sunflower');
  tower.x = 500;
  tower.y = 100;
  game.setTowers([tower]);
  for (let i = 0; i < 120; i += 1) game.update(1 / 60);
  game.setSelectedTower(tower);

  const ctx = new Proxy({}, { get: (obj, prop) => (prop === 'measureText' ? () => ({ width: 10 }) : () => {}) });
  assert.doesNotThrow(() => game.renderUI(ctx));
});

test('every touched tower type renders (legs + body) without throwing on an open-field map, across a few walkPhase values', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.deepForest);
  const ctx = new Proxy({}, { get: () => () => {} });
  ['sunflower', 'rose', 'mushroom', 'corpseFlower', 'arcticWillow'].forEach((typeKey) => {
    [0, 1.2, 3.5].forEach((phase) => {
      const tower = game.createTower(typeKey);
      tower.x = 200;
      tower.y = 200;
      tower.walkPhase = phase;
      assert.doesNotThrow(() => game.renderTower(ctx, tower, tower.x, tower.y, 1.0), `${typeKey} at phase ${phase} threw`);
    });
  });
});

test('applyWalkingLegs draws exactly one stroked hip->knee->foot path per leg', () => {
  const game = loadFullGameContext();
  const moves = [];
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'moveTo') return (x, y) => moves.push(['M', x, y]);
        if (prop === 'lineTo') return (x, y) => moves.push(['L', x, y]);
        if (prop === 'beginPath') return () => moves.push(['begin']);
        if (prop === 'stroke') return () => moves.push(['stroke']);
        return () => {};
      },
      set() {
        return true;
      },
    }
  );
  game.applyWalkingLegs(ctx, 100, 100, 40, 4, 1.2, '#223311');
  assert.equal(moves.filter((m) => m[0] === 'stroke').length, 4);
  assert.equal(moves.filter((m) => m[0] === 'M').length, 4);
  assert.equal(moves.filter((m) => m[0] === 'L').length, 8); // 2 line segments (hip->knee, knee->foot) per leg
});

test('towers on every map not yet converted to open-field stay completely static — no movement applied, and renderTower never reaches its legs branch', () => {
  const game = loadFullGameContext();
  // Caves — the last remaining unconverted map. Marshland/Savanah/
  // Whirlpool/Tundra/Volcanic were converted to open-field one at a time
  // through this same rollout (see each one's own open-field-*.test.js)
  // and now move their towers too, so none of them serve as the "still
  // static" example this test needs any more; this will need repointing
  // again once Caves itself converts.
  game.setActiveMap(game.MAP_TYPES.caves);
  // renderTower's own legs call is gated on exactly this flag — the
  // authoritative guarantee that part-2 rendering is a no-op here.
  assert.equal(game.getIsOpenField(), false);

  const tower = game.createTower('sunflower');
  tower.x = 200;
  tower.y = 200;
  game.setTowers([tower]);

  game.updateTowerMovement(tower, 5); // a large delta — if this map were open-field it would clearly move
  assert.equal(tower.x, 200);
  assert.equal(tower.y, 200);
  assert.equal(tower.walkPhase, 0);

  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.renderTower(ctx, tower, tower.x, tower.y, 1.0));
});
