const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Direct request (relayed from the peer session): the Selected Tower
// panel's own header should read "Selected {Tower Name} Tower" once a
// tower is actually selected (e.g. "Selected Sunflower Tower," "Selected
// Banana Plant Tower"), substituting in that tower's real TOWER_TYPES
// display name, rather than the generic "Selected Tower" label showing
// regardless of what (or whether) anything is selected.

// Same stub-ctx shape wave-panel-enemy-info.test.js already uses, just
// recording fillText calls so these tests can assert on the panel's own
// actual header text, not just that it renders without throwing.
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

test('the Selected Tower panel header stays the plain placeholder when nothing is selected', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setSelectedTower(null);

  const { ctx, texts } = createRecordingCtx();
  assert.doesNotThrow(() => game.renderUI(ctx));
  assert.ok(texts.includes('Selected Tower'));
});

test('the Selected Tower panel header names the actual tower once one is selected', () => {
  const game = loadFullGameContext();
  game.startGame('sandbox');
  game.setMoney(100000);

  [
    { typeKey: 'sunflower', expectedName: 'Sunflower' },
    { typeKey: 'bananaPlant', expectedName: 'Banana Plant' },
  ].forEach(({ typeKey, expectedName }) => {
    const tower = game.createTower(typeKey);
    tower.x = 100;
    tower.y = 100;
    game.getTowers().push(tower);
    game.setSelectedTower(tower);

    const { ctx, texts } = createRecordingCtx();
    assert.doesNotThrow(() => game.renderUI(ctx));
    assert.ok(
      texts.includes(`Selected ${expectedName} Tower`),
      `expected a "Selected ${expectedName} Tower" header, got headers: ${JSON.stringify(
        texts.filter((t) => t.startsWith('Selected'))
      )}`
    );
    assert.ok(!texts.includes('Selected Tower'), 'expected the generic placeholder header to be gone once selected');
  });
});
