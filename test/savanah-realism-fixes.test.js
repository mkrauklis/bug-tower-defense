const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Enemy-art realism pass (direct request, relayed from the peer session),
// part 3: Savanah (SAVANAH_ROSTER). Most of this roster was already
// genuinely species-accurate (Giant Lubber Grasshopper's real black/red/
// yellow banding, Desert Praying Mantis's slender silhouette, Kissing
// Bug's real orange/red abdomen stripes, Blue Death Beetle's iridescent
// sheen) — left untouched. Two real gaps found:
// - Desert Ant called the shared drawAntBody() with zero extra
//   distinguishing feature, unlike Fire Ant/Armored Ant's own precedent
//   (which each add a real trait on top of the shared body, not just a
//   color swap). Real desert ants (Cataglyphis, the Saharan silver ant)
//   have a famous silvery heat-reflective sheen and are the fastest-
//   running ant genus known — both now drawn in, matching this roster's
//   own fastest tier-1 enemy.
// - Red Scorpion called the shared drawScorpionBody() with zero options,
//   unlike its own tier-3 siblings (Striped Scorpion's banding, Dune
//   Scorpion's mottled camouflage). Real reddish-brown scorpion species
//   often have a smoother, glossier cuticle than banded/mottled desert
//   species — now drawn as a glossy highlight, plus slightly bigger
//   pincers reflecting it being the toughest of the 3 regular scorpions.

function createGeometryRecordingCtx() {
  const ellipses = [];
  const strokes = [];
  let lineWidth = 1;
  const proxy = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'ellipse') return (x, y, rx, ry) => ellipses.push({ x, y, rx, ry });
        if (prop === 'arc') return (x, y, r) => ellipses.push({ x, y, rx: r, ry: r });
        if (prop === 'stroke') return () => strokes.push({ lineWidth });
        if (prop === 'lineWidth') return lineWidth;
        return () => {};
      },
      set(obj, prop, value) {
        if (prop === 'lineWidth') lineWidth = value;
        return true;
      },
    }
  );
  return { ctx: proxy, ellipses, strokes };
}

test("Desert Ant draws real distinguishing features (longer legs + a silvery sheen), not just the plain Ant's shared body with a new color", () => {
  const game = loadGameContext();
  const plainAnt = createGeometryRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.ant(plainAnt.ctx, { x: 0, y: 0, radius: 7, color: '#8d6e63' });
  const desertAnt = createGeometryRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.desertAnt(desertAnt.ctx, { x: 0, y: 0, radius: 7, color: '#9c5a2e' });

  // The sheen highlight is its own extra filled ellipse on top of the
  // shared body's own 2 (abdomen + head).
  assert.ok(desertAnt.ellipses.length > plainAnt.ellipses.length);
  // The longer-leg strokes add extra stroke() calls beyond the shared
  // body's own 6 (3 pairs of legs).
  assert.ok(desertAnt.strokes.length > plainAnt.strokes.length);
});

test('Red Scorpion draws its own glossy highlight and bigger pincers, not the shared scorpion body with zero options', () => {
  const game = loadGameContext();
  // Striped Scorpion's own "extra" (banded) is drawn with strokes, not
  // ellipses, so its ellipse count is exactly the shared body's own
  // baseline: [body, pincer, pincer] — the cleanest baseline to diff
  // Red Scorpion's own extra ellipse against.
  const striped = createGeometryRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.stripedScorpion(striped.ctx, { x: 0, y: 0, radius: 9, color: '#b8946a' });
  const red = createGeometryRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.redScorpion(red.ctx, { x: 0, y: 0, radius: 9, color: '#a13a2a' });

  assert.equal(striped.ellipses.length, 3);
  // Red Scorpion draws 1 extra ellipse (its own glossy highlight) beyond
  // the shared body's own baseline count.
  assert.equal(red.ellipses.length, striped.ellipses.length + 1);

  // drawScorpionBody's own draw order is [body, pincer, pincer] — index 1
  // is always the first pincer, scaled by pincerScale.
  assert.ok(red.ellipses[1].rx > striped.ellipses[1].rx, 'expected Red Scorpion\'s pincer to be bigger than an unscaled scorpion\'s');
});

test('every touched Savanah draw function still renders without throwing', () => {
  const game = loadGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  ['desertAnt', 'stripedScorpion', 'duneScorpion', 'redScorpion'].forEach((key) => {
    const fn = game.ENEMY_DRAW_FUNCTIONS[key];
    assert.equal(typeof fn, 'function', `expected ENEMY_DRAW_FUNCTIONS.${key} to be a function`);
    assert.doesNotThrow(() => fn(ctx, { x: 0, y: 0, radius: 9, color: '#a13a2a' }));
  });

  // Emperor Scorpion (the retrofit boss reusing this same art) is
  // registered under its boss key, not a plain enemyKey.
  const emperorFn = game.BOSS_DRAW_FUNCTIONS['desert-boss-tier-3'];
  assert.equal(typeof emperorFn, 'function');
  assert.doesNotThrow(() => emperorFn(ctx, { x: 0, y: 0, radius: 20, color: '#2a2420' }));
});
