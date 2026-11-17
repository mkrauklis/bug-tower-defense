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
const LOAD_ORDER = ['js/towers.js', 'js/map.js', 'js/enemies.js'];

function loadGameContext() {
  const context = { console, Math, Object };
  vm.createContext(context);

  LOAD_ORDER.forEach((file) => {
    const code = fs.readFileSync(path.join(GAME_ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  });

  vm.runInContext(
    `
    globalThis.__exports = {
      TOWER_TYPES, createTower, getAvailableUpgrade, purchaseUpgrade,
      ENEMY_TYPES, BOSS_TYPES, ENEMY_ORDER, BOSS_INTERVAL, BASE_SPEED,
      isBossRound, getBossForRound, getUnlockedEnemyTypes, getRoundScaling,
      generateWave, spawnWave, updateEnemies,
      findNearestEnemyInRange, damageEnemy, applyBurn, getEnemiesInRadius,
      MAP_PATH_WAYPOINTS, MAP_PATH_WIDTH, isPointOnPath,
      getActiveEnemies: () => activeEnemies,
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
// browser. Used for testing game.js logic (combat/projectiles) that lives
// outside the pure-data files the lighter loadGameContext() above covers.
const FULL_LOAD_ORDER = ['js/random.js', 'js/towers.js', 'js/map.js', 'js/enemies.js', 'js/game.js'];

function loadFullGameContext() {
  const { document } = createDomStub();
  const context = {
    console,
    Math,
    Object,
    document,
    location: { search: '' },
    URLSearchParams,
    requestAnimationFrame: () => {},
  };
  vm.createContext(context);

  FULL_LOAD_ORDER.forEach((file) => {
    const code = fs.readFileSync(path.join(GAME_ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  });

  vm.runInContext(
    `
    globalThis.__fullExports = {
      createTower, purchaseUpgrade,
      damageEnemy, applyBurn, findNearestEnemyInRange,
      updateTowerAttack, spawnProjectile, resolveProjectile, updateProjectiles,
      getProjectiles: () => projectiles,
      getActiveEnemies: () => activeEnemies,
      update,
    };
    `,
    context
  );

  return context.__fullExports;
}

module.exports = { loadGameContext, loadFullGameContext };
