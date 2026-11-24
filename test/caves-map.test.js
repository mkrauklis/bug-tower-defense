const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext, loadFullGameContext } = require('./support/loadGame');

// Caves (direct request, relayed from the peer session, built from 3
// reference photos given as a written description): a dark cave interior
// lit by glowing multi-colored crystals, warm amber-brown stalactites/
// stalagmites, and an enemy path that's itself a flowing water channel —
// see CAVES_PATH_A's own comment in map.js for the full design rationale,
// and CAVES_ROSTER's own comment in enemies.js for the roster shape/
// difficulty-tier judgment calls (only 2 boss tiers, Medium not Hard).
//
// A direct follow-up request (relayed the same way) darkened the water
// path (it originally read "too bright/light") and added an animated
// flowing-water overlay (renderCavesPathEffects, map.js, via the new
// optional theme.renderPathEffects hook), plus retuned the cave floor's
// own background color to coordinate with the amber-brown formations
// instead of clashing against them — see CAVES_PATH_COLORS' own comment
// in map.js for the full writeup.
//
// A second direct follow-up request gave the path a unique fork/merge
// topology: CAVES_PATH_A/CAVES_PATH_B (map.js) share identical leading
// waypoints (the entry, spawn to the fork) and identical trailing
// waypoints (the merge to the goal), diverging only in the middle —
// visually one path that splits into 2 branches and rejoins, built as 2
// ordinary waypoint arrays, the exact same mechanism Savanah's own 2
// (fully independent) paths already use. See test/multipath-engine.test.js
// for the multi-path machinery's own dedicated coverage (now run against
// a synthetic map rather than any one built-in map); these tests focus
// on what's actually new here (shared segments, the fork/merge points
// themselves, branch spacing) and the data Caves kept as an unused
// fallback after its own open-field conversion.

test('caves is registered in MAP_TYPES with the expected shape — 2 paths (a fork/merge, not 2 independent ones)', () => {
  const game = loadGameContext();
  const map = game.MAP_TYPES.caves;
  assert.equal(map.id, 'caves');
  assert.equal(map.name, 'Caves');
  assert.equal(map.builtin, true);
  assert.equal(map.terrain, 'caves');
  assert.equal(map.pathWidth, 56);
  assert.equal(map.paths.length, 2);
});

test('caves shows up in listAllMaps alongside every other built-in map', () => {
  const game = loadFullGameContext();
  const ids = game.listAllMaps().map((map) => map.id);
  assert.ok(ids.includes('caves'));
  assert.equal(ids.length, 8); // deepForest/marshland/savanah/whirlpool/tundra/volcanic/caves/deepSea
});

test('Caves is explicitly Medium-tier, matching Marshland/Savanah\'s own 1.3x map multiplier — not Hard like Whirlpool/Tundra/Volcanic', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const cavesMultiplier = game.getRoundScaling(10).healthMultiplier;
  game.setActiveMap(game.MAP_TYPES.marshland);
  const marshMultiplier = game.getRoundScaling(10).healthMultiplier;
  assert.equal(cavesMultiplier, marshMultiplier);

  game.setActiveMap(game.MAP_TYPES.deepForest);
  const forestMultiplier = game.getRoundScaling(10).healthMultiplier;
  assert.ok(Math.abs(cavesMultiplier / forestMultiplier - 1.3) < 1e-9);

  game.setActiveMap(game.MAP_TYPES.volcanic);
  const volcanicMultiplier = game.getRoundScaling(10).healthMultiplier;
  assert.notEqual(cavesMultiplier, volcanicMultiplier);
});

test('both of Caves\' branches start off-canvas and end on-canvas at the same shared crystal pool goal', () => {
  const game = loadGameContext();
  const [pathA, pathB] = game.MAP_TYPES.caves.paths;

  [pathA, pathB].forEach((path) => {
    const start = path[0];
    assert.ok(start.x < 0 || start.x > 960 || start.y < 0 || start.y > 640);
    const end = path[path.length - 1];
    assert.ok(end.x >= 0 && end.x <= 960 && end.y >= 0 && end.y <= 640);
  });

  const { goal } = game.MAP_TYPES.caves.decor;
  assert.deepEqual(pathA[pathA.length - 1], { x: goal.x, y: goal.y });
  assert.deepEqual(pathB[pathB.length - 1], { x: goal.x, y: goal.y });
});

test('Path A and Path B share an identical entry segment (spawn to the fork) and an identical exit segment (merge to the goal)', () => {
  const game = loadGameContext();
  const [pathA, pathB] = game.MAP_TYPES.caves.paths;

  // The shared entry: everything up to and including the fork point.
  const forkIndex = 3; // the 4th waypoint in each array, per CAVES_PATH_A/B's own comment in map.js
  for (let i = 0; i <= forkIndex; i += 1) {
    assert.deepEqual(pathA[i], pathB[i], `expected waypoint ${i} (shared entry) to match`);
  }

  // The shared exit: everything from the merge point onward.
  const mergeIndexFromEnd = 3; // the merge point is the 4th-from-last waypoint in each array
  for (let i = 0; i <= mergeIndexFromEnd; i += 1) {
    assert.deepEqual(
      pathA[pathA.length - 1 - i],
      pathB[pathB.length - 1 - i],
      `expected waypoint ${i} from the end (shared exit) to match`
    );
  }
});

test('the fork and merge points are real, exact shared waypoints — not just visually close', () => {
  const game = loadGameContext();
  const [pathA, pathB] = game.MAP_TYPES.caves.paths;
  const forkIndex = 3;
  const mergeIndex = pathA.length - 4;

  assert.deepEqual(pathA[forkIndex], pathB[forkIndex]);
  assert.deepEqual(pathA[mergeIndex], pathB[mergeIndex]);
  // And the fork point is a genuinely different place from the merge
  // point — this is a loop, not a single point pretending to fork.
  assert.notDeepEqual(pathA[forkIndex], pathA[mergeIndex]);
});

test('between the fork and the merge, Path A and Path B actually diverge — real separate branches, not the same route twice', () => {
  const game = loadGameContext();
  const [pathA, pathB] = game.MAP_TYPES.caves.paths;
  const forkIndex = 3;
  const mergeIndex = pathA.length - 4;

  for (let i = forkIndex + 1; i < mergeIndex; i += 1) {
    assert.notDeepEqual(pathA[i], pathB[i], `expected branch waypoint ${i} to differ between Path A and Path B`);
  }
});

test('the two branches stay close enough together that a single tower placed between them can reach both — not "trivially requires double the towers"', () => {
  const game = loadFullGameContext();
  const [pathA, pathB] = game.MAP_TYPES.caves.paths;

  // The midpoint of each branch's own long middle leg (per CAVES_PATH_A/
  // B's own comment: x=240 for A, x=440 for B, both spanning y=200-400).
  const branchAPoint = { x: 240, y: 300 };
  const branchBPoint = { x: 440, y: 300 };
  const gapCenter = { x: (branchAPoint.x + branchBPoint.x) / 2, y: 300 };

  const distToA = Math.hypot(gapCenter.x - branchAPoint.x, gapCenter.y - branchAPoint.y);
  const distToB = Math.hypot(gapCenter.x - branchBPoint.x, gapCenter.y - branchBPoint.y);

  // Every base tower's own range comfortably clears this gap (checked
  // against the shortest-range base tower actually in the shop).
  const shortestRange = Math.min(...game.SHOP_ITEMS.map((item) => game.createTower(item.typeKey).stats.range));
  assert.ok(distToA < shortestRange, `gap-to-branch-A distance ${distToA} should be well within ${shortestRange}`);
  assert.ok(distToB < shortestRange, `gap-to-branch-B distance ${distToB} should be well within ${shortestRange}`);
});

// Open-field rollout (direct follow-up, relayed from the peer session):
// Caves converted to the open-field system (see open-field-caves.test.js
// for its own full coverage of that conversion), so its legacy
// fork/merge path is no longer used for actual enemy movement —
// isPointOnPath now always reads as clear here, same as every other
// converted map. The spawnWave/pathIndex-driven movement tests this
// section used to have (independent per-branch roll, walking a specific
// branch, leaking at the shared goal) no longer apply to Caves
// specifically; that exact same engine behavior (literally the same
// fork/merge waypoint shape) now has its own permanent regression
// coverage in test/multipath-engine.test.js, run against a synthetic map
// rather than any one built-in map, so it never goes stale again as
// maps convert.
test('isPointOnPath always reads clear on Caves now that it\'s open-field, on every point along both of its old branches', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);

  // A point on Path A's own branch leg (not shared with Path B).
  assert.equal(game.isPointOnPath(240, 300), false);
  // A point on Path B's own branch leg (not shared with Path A).
  assert.equal(game.isPointOnPath(440, 300), false);
  // A point on the shared entry segment (identical in both arrays).
  assert.equal(game.isPointOnPath(160, 220), false);
});

test('Caves\' decor (glowing crystals, mineral formations, the crystal-pool goal) is present with sane, on-canvas coordinates', () => {
  const game = loadGameContext();
  const { decor } = game.MAP_TYPES.caves;

  ['crystals', 'formations'].forEach((key) => {
    assert.ok(Array.isArray(decor[key]) && decor[key].length > 0, `expected decor.${key} to be a non-empty array`);
    decor[key].forEach((item) => {
      assert.ok(item.x >= 0 && item.x <= 960);
      assert.ok(item.y >= 0 && item.y <= 640);
    });
  });
  // Varied neon colors, per the request's own description — not every
  // crystal the same color.
  const crystalColors = new Set(decor.crystals.map((c) => c.color));
  assert.ok(crystalColors.size > 1);

  assert.ok(decor.goal.x >= 0 && decor.goal.x <= 960);
  assert.ok(decor.goal.y >= 0 && decor.goal.y <= 640);
  assert.ok(decor.goal.size > 0);
});

test('Caves has no magma-pool-style placement hazard — isPointInMagmaPool is always false here', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  assert.equal(game.isPointInMagmaPool(0, 0), false);
  assert.equal(game.isPointInMagmaPool(480, 320), false);
});

test('Caves\' roster is 1 boss (round 25) + a 7-entry tier2 + a 2nd, final boss (round 50) — not the usual 3-boss shape', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const roster = game.getActiveRoster();

  assert.deepEqual(roster.order, ['bat', 'moth', 'fungusGnat']);
  assert.equal(roster.bossTypes[1].name, 'Cave Midge');
  assert.deepEqual(roster.orderTier2, [
    'oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm', 'texasBlindSalamander', 'caveShrimp',
  ]);
  assert.equal(roster.bossTypes[2].name, 'Blind Cavefish');
  assert.deepEqual(roster.orderTier3, []);
  assert.equal(roster.bossTypes[3], undefined);
});

test('Blind Cavefish is the toughest thing on Caves — the request\'s own explicit requirement', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const roster = game.getActiveRoster();

  assert.ok(roster.bossTypes[2].health > roster.bossTypes[1].health);
  Object.values(roster.enemyTypes).forEach((type) => {
    assert.ok(roster.bossTypes[2].health > type.health);
  });

  // Calibrated at Medium tier, alongside Marshland/Savanah's own boss2 —
  // not anywhere near Whirlpool's Hard-tier final boss.
  assert.ok(roster.bossTypes[2].health < game.MAP_ROSTERS.ocean.bossTypes[3].health);
});

test('tier2\'s own 7 entries escalate weakest to strongest, as given in the request\'s own ordered list', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const { enemyTypes } = game.getActiveRoster();
  const tier2Keys = ['oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm', 'texasBlindSalamander', 'caveShrimp'];

  for (let i = 1; i < tier2Keys.length; i += 1) {
    assert.ok(
      enemyTypes[tier2Keys[i]].health > enemyTypes[tier2Keys[i - 1]].health,
      `expected ${tier2Keys[i]} to be tougher than ${tier2Keys[i - 1]}`
    );
  }
});

test('generateWave spawns Caves\' 2 designed bosses on rounds 25/50, and falls back to Blind Cavefish again at round 75', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);

  const wave25 = game.generateWave(25);
  assert.equal(wave25[0].enemyKey, 'caves-boss-tier-1');
  assert.equal(wave25[0].name, 'Cave Midge');
  assert.equal(wave25[0].isBoss, true);

  const wave50 = game.generateWave(50);
  assert.equal(wave50[0].enemyKey, 'caves-boss-tier-2');
  assert.equal(wave50[0].name, 'Blind Cavefish');

  // No tier 3 designed — same "reuse the highest designed tier" fallback
  // FOREST_ROSTER's own 2-boss shape already relies on.
  const wave75 = game.generateWave(75);
  assert.equal(wave75[0].enemyKey, 'caves-boss-tier-2');
  assert.equal(wave75[0].name, 'Blind Cavefish');
});

test('tier2 unlocks progressively from round 26, one new type every 5 rounds, same cadence every other map uses', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);

  assert.deepEqual(game.getUnlockedEnemyTypes(25), ['bat', 'moth', 'fungusGnat']);
  assert.deepEqual(game.getUnlockedEnemyTypes(26), ['bat', 'moth', 'fungusGnat', 'oilbird']);
  assert.deepEqual(
    game.getUnlockedEnemyTypes(46),
    ['bat', 'moth', 'fungusGnat', 'oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm']
  );
  // All 7 tier2 entries are unlocked by round 56 (26 + 5*6), continuing to
  // unlock well past round 50's own boss — same as every other map's own
  // tier2/tier3 types keep unlocking after their roster's bosses.
  assert.deepEqual(
    game.getUnlockedEnemyTypes(56),
    [
      'bat', 'moth', 'fungusGnat',
      'oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm', 'texasBlindSalamander', 'caveShrimp',
    ]
  );
});

test('getAllSpawnableEnemyKeys lists Caves\' full 10-enemy roster and both boss tiers, with no shared armored beetles (Caves has no native beetle-family enemy)', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const keys = game.getAllSpawnableEnemyKeys();

  assert.deepEqual(keys, [
    'bat', 'moth', 'fungusGnat',
    'oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm', 'texasBlindSalamander', 'caveShrimp',
    'caves-boss-tier-1', 'caves-boss-tier-2',
  ]);
});

test('a spawned Caves enemy never throws, for every regular type and every boss', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const keys = [
    'bat', 'moth', 'fungusGnat',
    'oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm', 'texasBlindSalamander', 'caveShrimp',
    'caves-boss-tier-1', 'caves-boss-tier-2',
  ];
  keys.forEach((key) => {
    const entry = game.getSpawnEntryForEnemyKey(key);
    assert.ok(entry, `expected a spawn entry for ${key}`);
    assert.doesNotThrow(() => game.spawnSingleEnemy(entry), `spawning ${key} threw`);
  });
  assert.equal(game.getActiveEnemies().length, keys.length);
});

test('Blind Cavefish\'s spawn entry carries no special traits (just a plain, tough, slow boss) and every regular enemy has no armor threshold', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const { enemyTypes, bossTypes } = game.getActiveRoster();
  Object.values(enemyTypes).forEach((type) => assert.equal(type.armorThreshold || 0, 0));
  Object.values(bossTypes).forEach((type) => assert.equal(type.armorThreshold || 0, 0));
});

// --- Follow-up: Olm and Texas Blind Salamander looked identical in-game ---
// User bug report, relayed from the peer session: both reused the exact
// same drawCaveSalamanderBody geometry with only `gillColor` varying
// between 2 near-identical reds, on top of 2 roster colors (CAVES_ROSTER)
// that were also too close to tell apart — so they read as the same
// creature on screen. Fixed by giving drawCaveSalamanderBody real shape
// options (`stretch`/`gillSize`/`headFlatten`) and genuinely different
// roster colors. A plain color-equality check wouldn't have caught the
// real bug here (the SHAPES were identical, not just similarly colored),
// so this records actual canvas calls from the real draw functions via
// game.ENEMY_DRAW_FUNCTIONS (a new export — see loadGame.js's own
// comment) rather than only inspecting roster data.

// A minimal ctx recorder: captures every ellipse()/arc() call's own
// arguments, every stroke()'s lineWidth/strokeStyle at the moment it
// fired, and how many times save() was called — enough to check actual
// drawn geometry/shape counts without a real canvas. Note: it does NOT
// simulate translate()/rotate(), so (x, y) on a recorded ellipse/arc is
// whatever was passed to that call in its own LOCAL frame, not a true
// world-space position — fine for comparing sizes/counts (what every
// test below actually needs), not for comparing absolute positions
// across calls made inside a save()/translate()/restore() block.
function createGeometryRecordingCtx() {
  const ellipses = [];
  const arcs = [];
  const strokes = [];
  let lineWidth = 1;
  let strokeStyle = null;
  let saveCount = 0;
  const proxy = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'ellipse') return (x, y, rx, ry) => ellipses.push({ x, y, rx, ry });
        if (prop === 'arc') return (x, y, r) => arcs.push({ x, y, r });
        if (prop === 'stroke') return () => strokes.push({ lineWidth, strokeStyle });
        if (prop === 'save') return () => { saveCount += 1; };
        if (prop in obj) return obj[prop];
        return (..._args) => proxy;
      },
      set(obj, prop, value) {
        if (prop === 'lineWidth') lineWidth = value;
        else if (prop === 'strokeStyle') strokeStyle = value;
        else obj[prop] = value;
        return true;
      },
    }
  );
  return {
    ctx: proxy,
    ellipses,
    arcs,
    strokes,
    get saveCount() {
      return saveCount;
    },
  };
}

test('Olm\'s roster color differs clearly from Texas Blind Salamander\'s', () => {
  const game = loadGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const { enemyTypes } = game.getActiveRoster();
  assert.notEqual(enemyTypes.olm.color, enemyTypes.texasBlindSalamander.color);
});

test('Olm renders with a longer, thinner body and bigger, more vivid gills than Texas Blind Salamander — real shape differences, not just a color swap', () => {
  const game = loadGameContext();
  const olmEnemy = { x: 0, y: 0, radius: 10, color: '#dba89c' };
  const texasEnemy = { x: 0, y: 0, radius: 10, color: '#c7c2b4' };

  const olmRec = createGeometryRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.olm(olmRec.ctx, olmEnemy);
  const texasRec = createGeometryRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.texasBlindSalamander(texasRec.ctx, texasEnemy);

  // The body ellipse is the first one drawn — its own x-radius is the
  // body's length. Olm ("notably elongated eel-like") is longer than
  // Texas Blind Salamander ("stockier/shorter").
  const [olmBody] = olmRec.ellipses;
  const [texasBody] = texasRec.ellipses;
  assert.ok(olmBody.rx > texasBody.rx, `expected Olm's body (${olmBody.rx}) to be longer than Texas Blind Salamander's (${texasBody.rx})`);

  // The head ellipse is the second one drawn — its own y-radius is how
  // flat the head reads. Texas Blind Salamander has "a flatter head."
  const [, olmHead] = olmRec.ellipses;
  const [, texasHead] = texasRec.ellipses;
  assert.ok(olmHead.ry > texasHead.ry, `expected Texas Blind Salamander's head (${texasHead.ry}) to be flatter than Olm's (${olmHead.ry})`);

  // Gill strokes are drawn in each creature's own gillColor — isolating
  // just those (not the leg strokes, which share a lineWidth formula
  // unrelated to gill prominence) confirms Olm's own "prominent" gills
  // actually use a thicker stroke than Texas Blind Salamander's "smaller,
  // less prominent" ones.
  const olmGillStrokes = olmRec.strokes.filter((s) => s.strokeStyle === '#e8506a');
  const texasGillStrokes = texasRec.strokes.filter((s) => s.strokeStyle === '#c2889a');
  assert.ok(olmGillStrokes.length > 0, 'expected Olm to draw at least one gill-colored stroke');
  assert.ok(texasGillStrokes.length > 0, 'expected Texas Blind Salamander to draw at least one gill-colored stroke');
  assert.ok(
    olmGillStrokes[0].lineWidth > texasGillStrokes[0].lineWidth,
    `expected Olm's gill stroke (${olmGillStrokes[0].lineWidth}) to be thicker than Texas Blind Salamander's (${texasGillStrokes[0].lineWidth})`
  );
});

// --- Follow-up: Moth redesigned from a real pinned-specimen photo --------
// Direct follow-up request, relayed from the peer session: the user sent
// a reference photo of a real moth with its wings fully spread flat
// (pinned-specimen pose) — 4 distinct wing lobes (2 bigger forewings, 2
// smaller hindwings), each with its own eyespot, warm amber-brown wings
// with a darker border, a fuzzy brown body, and feathery antennae.
// Reusing the same geometry-recording ctx the Olm/Texas Blind Salamander
// fix above introduced.

test('Moth renders 4 distinct wing lobes (2 forewings, 2 hindwings) rather than the old 2-wing fan, each with its own eyespot', () => {
  const game = loadGameContext();
  const mothEnemy = { x: 0, y: 0, radius: 9, color: '#5c4028' };
  const rec = createGeometryRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.moth(rec.ctx, mothEnemy);

  // drawMothWing is called once per lobe, each wrapped in its own
  // save()/restore() — exactly 4 lobes, not the old design's 2-wing fan.
  assert.equal(rec.saveCount, 4);

  // Each wing lobe draws a border ellipse + a fill ellipse (2 per lobe),
  // plus the fuzzy body itself (1) = 9 ellipses total.
  assert.equal(rec.ellipses.length, 9);

  // Each wing lobe also draws exactly one eyespot — a dark ring + a pale
  // center (2 arcs per lobe) = 8 arcs total, one eyespot per wing.
  assert.equal(rec.arcs.length, 8);
});

test('the Moth\'s forewings and hindwings are genuinely different sizes — bigger/smaller, not 4 identical lobes', () => {
  const game = loadGameContext();
  const mothEnemy = { x: 0, y: 0, radius: 9, color: '#5c4028' };
  const rec = createGeometryRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.moth(rec.ctx, mothEnemy);

  // The first ellipse drawn for each wing lobe is its own border
  // ellipse, sized directly off the `length`/`width` drawMoth passes in
  // — forewings and hindwings pass different values, so their own
  // border ellipses' radii fall into more than one distinct size.
  const borderEllipseSizes = new Set(rec.ellipses.map((el) => `${el.rx.toFixed(2)},${el.ry.toFixed(2)}`));
  assert.ok(borderEllipseSizes.size >= 2, 'expected forewing and hindwing border ellipses to use different sizes');
});

// --- Follow-up: darker flowing water + a coordinated cave-rock floor ------

test('Caves\' water path is a dark, moody teal now — not the original bright glowing cyan', () => {
  const game = loadGameContext();
  const { pathColors } = game.MAP_TYPES.caves;
  assert.equal(pathColors.fill, '#1b5560');
  assert.equal(pathColors.outline, '#070f10');
});

test('Caves\' background no longer clashes against its own warm amber-brown stalactite/stalagmite formations', () => {
  // TERRAIN_THEMES is only exported from loadFullGameContext, not the
  // lighter loadGameContext — fixed here (this test previously used
  // loadGameContext and would have thrown TypeError: Cannot read
  // properties of undefined, a latent bug caught while touching this
  // file again for the fork/merge follow-up, not run-caught, since no
  // Node is available in this environment).
  const game = loadFullGameContext();
  const theme = game.TERRAIN_THEMES.caves;
  // The original cool blue-black background this follow-up replaced.
  assert.notEqual(theme.background, '#070709');
  // Still near-black (the request's own original ask), just warm-toned —
  // every channel low, but red/green (the warm end) no lower than blue.
  const r = parseInt(theme.background.slice(1, 3), 16);
  const g = parseInt(theme.background.slice(3, 5), 16);
  const b = parseInt(theme.background.slice(5, 7), 16);
  assert.ok(r <= 40 && g <= 40 && b <= 40, `expected a near-black background, got ${theme.background}`);
  assert.ok(r >= b, 'expected a warm (not cool/blue-tinted) near-black background');
});

test('Caves has its own animated path-flow effect; every other map is untouched by it', () => {
  // Same TERRAIN_THEMES-needs-the-full-context fix as the test above.
  const game = loadFullGameContext();
  assert.equal(typeof game.TERRAIN_THEMES.caves.renderPathEffects, 'function');
  ['forest', 'marsh', 'desert', 'ocean', 'tundra', 'volcano'].forEach((terrain) => {
    assert.equal(game.TERRAIN_THEMES[terrain].renderPathEffects, undefined);
  });
});

test('rendering the Caves map (including its animated path-flow overlay) never throws, at several different animation times', () => {
  const game = loadFullGameContext();
  game.setActiveMap(game.MAP_TYPES.caves);
  const canvas = game.getCanvas();
  const ctx = canvas.getContext('2d');
  [0, 1.3, 5, 12.75].forEach((time) => {
    assert.doesNotThrow(() => game.renderMap(ctx, canvas, time), `renderMap threw at time=${time}`);
  });
});
