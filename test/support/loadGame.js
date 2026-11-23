// Loads the game's plain <script>-tag source files (no modules, no build
// step) into a fresh Node `vm` context per call, so each test starts from
// a clean slate — same as reloading the page in a browser.
//
// The game files declare everything as top-level `const`/`function` at
// script scope, exactly like multiple <script> tags sharing one global
// scope in a browser. Node's vm module gives scripts run in the same
// context that same shared top-level scope, so we run the files in their
// real load order (matching index.html) and then pull out the names tests
// need via one more snippet run in that same context.
//
// Mutable bindings some tests need to observe (e.g. enemies.js's internal
// `activeEnemies`, which gets reassigned by spawnWave/updateEnemies) are
// exposed as getter functions rather than copied once, so callers always
// see the current value instead of a stale snapshot.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME_ROOT = path.join(__dirname, '..', '..');
// random.js needs to come before towers.js now that purchaseUpgrade's root-
// trap placement (Rose's Root Path) calls the shared random() — matches
// the real index.html load order, and random.js itself only needs
// location/URLSearchParams (stubbed below), not anything from later files.
const LOAD_ORDER = ['js/random.js', 'js/towers.js', 'js/map.js', 'js/enemies.js'];

function loadGameContext() {
  const context = { console, Math, Object, location: { search: '' }, URLSearchParams };
  vm.createContext(context);

  LOAD_ORDER.forEach((file) => {
    const code = fs.readFileSync(path.join(GAME_ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  });

  vm.runInContext(
    `
    globalThis.__exports = {
      TOWER_TYPES, createTower, getAvailableUpgrade, purchaseUpgrade,
      MAP_ROSTERS, FOREST_ROSTER, MARSH_ROSTER, getActiveRoster,
      BOSS_INTERVAL, BASE_SPEED,
      isBossRound, getBossForRound, getUnlockedEnemyTypes, getRoundScaling,
      getTotalWaveSize,
      generateWave, spawnWave, updateEnemies, getLastLeakedEnemies,
      findNearestEnemyInRange, damageEnemy, applyBurn, applySlow, applyFreeze, getEnemiesInRadius,
      ARMORED_BEETLE_TIERS, getUnlockedArmoredBeetleKeys, getArmoredBeetleTier,
      getAllSpawnableEnemyKeys, getSpawnEntryForEnemyKey,
      MAP_PATH_WAYPOINTS, MAP_PATH_WIDTH, isPointOnPath, isPointInMagmaPool,
      // A getter, not a plain binding — MAP_PATHS (like activeEnemies
      // below) is reassigned by setActiveMap(), so a plain destructured
      // export here would snapshot it at module-load time and go stale
      // the moment a test switches maps.
      getMapPaths: () => MAP_PATHS,
      getActiveEnemies: () => activeEnemies,
      MILLIPEDE_FAMILY_KEYS, recordTrailPoint, getTrailPointAtDistance,
      // Anaconda-is-way-bigger follow-up: lets a test assert directly on
      // the per-type segment-count/spacing numbers rather than only
      // inferring them indirectly through trail-length side effects.
      MILLIPEDE_BODY,
      MAP_TYPES, getActiveMap, setActiveMap,
      PRODIGY_BASE_TYPE, turnIntoPurpleZombie,
      // New export: lets a test actually call a specific enemy's own draw
      // function against a recording ctx and inspect what it drew — added
      // for a user bug report (Olm/Texas Blind Salamander looking
      // identical in-game) where a pure data-level color check wouldn't
      // have caught the real bug (their SHAPES were identical too, not
      // just coincidentally-similar colors).
      ENEMY_DRAW_FUNCTIONS,
      // Enemy-art realism pass follow-up: some species-accurate fixes
      // (e.g. Emperor Scorpion, a boss retrofit reusing a regular
      // enemy's own art) need this to exercise/assert on the actual draw
      // function a boss key resolves to.
      BOSS_DRAW_FUNCTIONS,
    };
    `,
    context
  );

  return context.__exports;
}

// A generic "accepts anything" DOM element stub: any property read that
// wasn't explicitly set returns a callable no-op (so `.addEventListener`,
// `.appendChild`, `.getContext`, etc. all just work), and anything set is
// stored and read back normally (so `.textContent`, `.disabled`, `.width`
// behave like real properties once assigned).
function createStubElement() {
  const target = {};
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (prop === 'getBoundingClientRect') {
        return () => ({ left: 0, top: 0, width: 960, height: 640 });
      }
      return (..._args) => createStubElement();
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    },
  });
}

function createDomStub() {
  const canvas = createStubElement();
  canvas.width = 960;
  canvas.height = 640;

  const elementsById = { game: canvas };

  const document = {
    getElementById(id) {
      if (!elementsById[id]) elementsById[id] = createStubElement();
      return elementsById[id];
    },
    querySelector: () => createStubElement(),
    querySelectorAll: () => [],
    createElement: () => createStubElement(),
  };

  return { document, canvas };
}

// Loads the full game, including game.js's rendering/UI-wiring code, behind
// a minimal fake DOM (above) so it can execute in Node without a real
// browser. Used for testing game.js logic (combat/projectiles, canvas-UI
// hit-testing) that lives outside the pure-data files the lighter
// loadGameContext() above covers.
const FULL_LOAD_ORDER = [
  'js/random.js',
  'js/towers.js',
  'js/map.js',
  'js/wildlife.js',
  'js/enemies.js',
  'js/ui.js',
  'js/game.js',
];

// A minimal in-memory localStorage stand-in. Backed by a plain object a
// caller can supply and keep a reference to, so two separate
// loadFullGameContext() calls (two fresh vm contexts, standing in for two
// separate page loads) can share the same backing store to test that
// something actually persists "across sessions" — the real
// window.localStorage's whole point, which a brand-new stub object per
// call wouldn't exercise at all.
function createLocalStorageStub(store) {
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
}

function loadFullGameContext({ localStorageStore = {} } = {}) {
  const { document } = createDomStub();
  const context = {
    console,
    Math,
    Object,
    document,
    location: { search: '' },
    URLSearchParams,
    requestAnimationFrame: () => {},
    // game.js's applyLayout()/touch-hold handling reach for these — stub
    // just enough for module load + logic calls to work without a real
    // browser. window.innerWidth is wide, so tests load in the "side"
    // (not "stacked") panel layout by default.
    window: { innerWidth: 1280, addEventListener: () => {} },
    performance: { now: () => Date.now() },
    localStorage: createLocalStorageStub(localStorageStore),
  };
  vm.createContext(context);

  FULL_LOAD_ORDER.forEach((file) => {
    const code = fs.readFileSync(path.join(GAME_ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  });

  vm.runInContext(
    `
    globalThis.__fullExports = {
      createTower, purchaseUpgrade, getAvailableUpgrade, TOWER_TYPES,
      damageEnemy, applyBurn, applySlow, applyFreeze, findNearestEnemyInRange, getEnemiesInRadius,
      updateTowerAttack, spawnProjectile, resolveProjectile, updateProjectiles, updateEnemies, getLastLeakedEnemies,
      getStrongestAuraFor,
      spawnFloatingText, updateFloatingTexts,
      getFloatingTexts: () => floatingTexts,
      getProjectiles: () => projectiles,
      getActiveEnemies: () => activeEnemies,
      update,
      uiBeginFrame, uiRegisterRegion, uiHitTest, uiWrapText,
      // General button-polish pass + per-path upgrade-tier theming (direct
      // follow-up request, relayed from the peer session) — lets tests
      // call the actual draw code directly (uiDrawButton/uiButtonBevel/
      // renderUpgradePaths) and assert on the theming data itself
      // (getPathTheme/getTierThemeColor/mixHexColors/PATH_THEMES) rather
      // than only on indirect rendering side effects.
      uiDrawButton, uiRoundRect, uiButtonBevel,
      renderUpgradePaths,
      getPathTheme, getTierThemeColor, mixHexColors, PATH_THEMES,
      getCanvasPoint, isWorldPoint, activateRegion, getTooltipLines, handleCanvasTap,
      isPointInMagmaPool,
      renderUI, getSellRefund,
      // Top-level \`let\`/\`const\` bindings from a vm-run classic script
      // aren't reachable off globalThis (same as a browser <script> tag),
      // so mutable state needs explicit getter/setter pairs rather than
      // plain property forwarding (which would just snapshot the value at
      // export time) or a generic globalThis-patching setState.
      getMoney: () => money,
      setMoney: (value) => { money = value; },
      getSelectedTower: () => selectedTower,
      setSelectedTower: (tower) => { selectedTower = tower; },
      getSelectedShopItem: () => selectedShopItem,
      setSelectedShopItem: (item) => { selectedShopItem = item; },
      SHOP_ITEMS, getShopItemCost, isTowerPlacementBlocked, getTowerVisualSize,
      // Avalanche Path (Arctic Willow's 3rd path) follow-up: lets a test
      // exercise the real tower-rendering dispatch directly, the same
      // "renderX never throws" pattern this test suite already uses
      // elsewhere, rather than only reaching individual draw functions
      // that aren't otherwise exported.
      renderTower,
      STARTING_MONEY,
      getRound: () => round,
      getGameSpeed: () => gameSpeed,
      getTowers: () => towers,
      startGame, GAME_MODES,
      getGameState: () => gameState,
      getCurrentMode: () => currentMode,
      applyModeToWaveComposition,
      getAllSpawnableEnemyKeys, getSpawnEntryForEnemyKey, spawnSingleEnemy,
      getDefeatedEnemyKeys: () => [...defeatedEnemyKeys],
      recordDefeatedEnemy,
      getAutoContinue: () => autoContinue,
      setAutoContinue: (value) => { autoContinue = value; },
      canAfford,
      getHordeSpawnTimer: () => hordeSpawnTimer,
      MAP_ROSTERS, FOREST_ROSTER, MARSH_ROSTER, getActiveRoster, generateWave,
      listAllMaps,
      // Anaconda-is-way-bigger follow-up: needed so a test using the full
      // context (for spawnSingleEnemy/getActiveEnemies) can also drive
      // recordTrailPoint directly and assert on MILLIPEDE_BODY's own
      // per-type numbers, same as loadGameContext's lighter export above.
      recordTrailPoint, MILLIPEDE_BODY,
      MAP_TYPES, getActiveMap, setActiveMap,
      // TERRAIN_THEMES/renderMap are new exports (Caves' own animated
      // flowing-water path effect, a direct follow-up request) — needed
      // to actually exercise theme.renderPathEffects/renderDecor through
      // the real rendering entry point rather than just checking data.
      TERRAIN_THEMES, renderMap,
      // Pixel-grain texture pass: lets a test exercise the shared grain
      // primitive directly (its own deterministic scatter, and that
      // fillThemeBackground actually draws it) rather than only through
      // renderMap()'s own "never throws" coverage.
      buildGrainSpecks, drawGrain, GROUND_GRAIN_SPECKS, fillThemeBackground,
      // Texture pass, part 2 (water): lets a test exercise the water-
      // specific texture functions/data directly.
      drawWaterShimmer, WHIRLPOOL_SHIMMER_SPECKS, PUDDLE_SHIMMER_UNIT_SPECKS,
      drawMudPuddle, renderWhirlpoolCaustics, renderCavesPathEffects, renderMarshDecor,
      getMapPaths: () => MAP_PATHS,
      getSelectedMap: () => selectedMap,
      setSelectedMap: (map) => { selectedMap = map; },
      getPlayerHealth: () => playerHealth,
      setPlayerHealth: (value) => { playerHealth = value; },
      PLAYER_STARTING_HEALTH,
      triggerGameOver,
      getGameOverStats: () => gameOverStats,
      // The Hollow Event ("Adventures," direct request relayed from the
      // peer session): its own dedicated victory state, same shape as
      // triggerGameOver/getGameOverStats above, plus the 2 explicit
      // "this map/mode is deliberately NOT player-selectable through the
      // normal flow" order lists, needed to assert theHollowEvent/
      // adventure are excluded from both.
      triggerStageComplete,
      getStageCompleteStats: () => stageCompleteStats,
      MAP_TYPE_ORDER, MENU_MODE_ORDER,
      // The Hollow Event's own title/cover screen (direct follow-up
      // request): renderHollowSplash lets a test exercise its actual draw
      // code (same "renderX never throws" pattern as renderMap/renderUI
      // above) and getHollowSplashTime lets a test confirm 'start:adventure'
      // resets its cosmetic clock back to 0 each time the screen is entered.
      renderHollowSplash,
      getHollowSplashTime: () => hollowSplashTime,
      getTowersInRange, consumeTowersInRange, getOtherTowersOfSameType, destroyTowers,
      getConsumedTowerEffects: () => consumedTowerEffects,
      getProdigyOption, getProdigyTypeKeyFor,
      PRODIGY_BASE_TYPE, updateTowerGrab, turnIntoPurpleZombie,
      // Make-Prodigies-cooler follow-up: the two new generic flash-timer
      // durations (towers.js) — exported so tests can assert against the
      // named constant rather than a magic number that'd go stale silently
      // if either duration is ever retuned.
      GRAB_FLASH_DURATION, KILL_FLASH_DURATION,
      updateTowerGasCloud, GAS_CLOUD_TICK_INTERVAL,
      updateTowerAcidShot, spawnAcidProjectile, ACID_SHOT_INTERVAL,
      updateTowerGasRing, updateTowerBloom, spawnBloomAcidProjectile, BLOOM_OPEN_DURATION,
      applyLayout, getCanvas: () => canvas,
      getLayoutMode: () => layoutMode,
      getLogicalWidth: () => logicalWidth,
      getLogicalHeight: () => logicalHeight,
      getWindow: () => window,
      renderMapSelect,
      getMapCarouselIndex: () => mapCarouselIndex,
      setMapCarouselIndex: (value) => { mapCarouselIndex = value; },
    };
    `,
    context
  );

  return context.__fullExports;
}

module.exports = { loadGameContext, loadFullGameContext };
