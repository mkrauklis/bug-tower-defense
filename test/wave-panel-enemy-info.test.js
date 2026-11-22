const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Direct request (relayed from the peer session): remove whatever UI shows
// enemy info/stats — described as "a hover/tap tooltip or info display on
// enemies showing their name, health, speed, and special ability text."
// No hover/tap tooltip on an in-world enemy exists anywhere in this
// codebase (world taps only ever select/place towers — see
// handleCanvasTap() — and mousemove only ever sets hoverRegion for panel
// regions, never anything world-side), and renderEnemies() in enemies.js
// already draws nothing on an enemy but its own body art and health bar,
// no text. The one real match for "info display... showing name, health,
// speed" was renderWaveSection()'s per-round composition breakdown (every
// upcoming enemy's name/HP/speed multiplier, always visible in the Wave
// panel) — removed below, while the Round number itself (not enemy info)
// and the player's own Health readout stay.

// Same stub-ctx shape panel-rendering.test.js already uses, extended to
// record every fillText call's text so these tests can assert on what the
// panel actually draws, not just that it doesn't throw.
function createRecordingCtx() {
  const texts = [];
  const target = {
    fillText(text) {
      texts.push(text);
    },
  };
  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      return (..._args) => proxy;
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    },
  });
  return { ctx: proxy, texts };
}

test('the Wave panel no longer lists each upcoming enemy\'s name/HP/speed', () => {
  const game = loadFullGameContext();
  game.startGame('medium'); // immediately populates currentWave with round 1's real composition

  const { ctx, texts } = createRecordingCtx();
  game.setSelectedTower(null);
  assert.doesNotThrow(() => game.renderUI(ctx));

  // The old composition line looked like "Ant x12 (40 HP each, 1x speed)"
  // or "BOSS: Longhorn Beetle (900 HP, 1x speed)" — gone entirely now.
  texts.forEach((text) => {
    assert.ok(!/HP/.test(text), `expected no per-enemy HP readout, got: "${text}"`);
    assert.ok(!/x speed/.test(text), `expected no per-enemy speed readout, got: "${text}"`);
  });

  // What SHOULD still be there: the round counter (not enemy-specific) and
  // the player's own Health section.
  assert.ok(texts.some((t) => t === 'Round: 1'));
  assert.ok(texts.some((t) => t === 'Health'));
  assert.ok(texts.some((t) => t === 'Wave'));
});

test('a selected tower\'s panel still shows its new Damage Dealt line alongside its other stats', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  game.setSelectedTower(tower);
  tower.totalDamageDealt = 123.4;

  const { ctx, texts } = createRecordingCtx();
  assert.doesNotThrow(() => game.renderUI(ctx));

  assert.ok(texts.some((t) => t === 'Damage Dealt: 123'));
});
