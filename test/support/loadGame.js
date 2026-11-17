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

module.exports = { loadGameContext };
