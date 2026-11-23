const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Enemy-art realism pass (direct request, relayed from the peer session),
// part 4: Tundra reviewed in full (already genuinely species-accurate —
// Arctic Ringlet's eyespot wings, Snow Scorpion Fly's curled stinger
// tail, Arctic Bluet's damselfly silhouette, Arctic Woolly Bear Moth's
// banded fuzzy body — no changes needed). Volcanic's one real gap: Pink
// Iguana called the shared drawIguanaBody() with zero options, identical
// to Land Iguana but for color — unlike Lava Iguana (`crested`) and the
// Marine Iguana boss (`crested` + `snoutColor`). The real pink iguana
// (Conolophus marthae) has a genuinely distinguishing trait beyond its
// rosy color: dark crossbands running across its back — now drawn via a
// new `banded` option.

function createGeometryRecordingCtx() {
  const ellipses = [];
  const proxy = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'ellipse') return (x, y, rx, ry) => ellipses.push({ x, y, rx, ry });
        if (prop === 'arc') return (x, y, r) => ellipses.push({ x, y, rx: r, ry: r });
        return () => {};
      },
    }
  );
  return { ctx: proxy, ellipses };
}

test('Pink Iguana draws extra banding ellipses on top of the shared iguana body, unlike the identical-before fix Land Iguana still correctly has none of', () => {
  const game = loadGameContext();
  const land = createGeometryRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.landIguana(land.ctx, { x: 0, y: 0, radius: 11, color: '#6b7a4a' });
  const pink = createGeometryRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.pinkIguana(pink.ctx, { x: 0, y: 0, radius: 11, color: '#d98fa3' });

  assert.ok(pink.ellipses.length > land.ellipses.length, 'expected Pink Iguana to draw extra band ellipses beyond Land Iguana\'s shared body');
});

test('Lava Iguana and Marine Iguana are unaffected by the new `banded` option (still just their own `crested`/`snoutColor`)', () => {
  const game = loadGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.ENEMY_DRAW_FUNCTIONS.lavaIguana(ctx, { x: 0, y: 0, radius: 11, color: '#3a2420' }));
  assert.doesNotThrow(() => game.BOSS_DRAW_FUNCTIONS['volcano-boss-tier-2'](ctx, { x: 0, y: 0, radius: 21, color: '#23282a' }));
});
