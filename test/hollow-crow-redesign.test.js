const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Direct follow-up request, relayed from the peer session, jumping the
// queue ahead of the broader enemy-art realism pass for this one species
// (it's also the splash-screen hero art): redraw drawHollowCrow() from 2
// real reference photos (a perched profile shot, a wings-spread flight
// shot) so it reads as a real crow rather than a generic bird shape.
// Previously it reused Caves' shared drawCaveBirdBody wholesale (the
// same generic pointed-triangle beak/round head every other bird in that
// family uses) plus only an eye-glow and a few wing notches on top.
// Rebuilt from scratch with its own anatomy: a thick, slightly
// down-hooked beak with base bristles, a flatter/more elongated skull,
// an iridescent purple/teal sheen on the body and wings, broad wings
// ending in 5 separated ("fingered") primary feathers instead of one
// smooth curve, a fanned rounded-square tail, and visible clawed legs —
// with the existing "hollow" supernatural touches (a small glowing eye
// socket, torn/notched primaries) layered on top, not replaced. Visual
// only, no stat/mechanic change — see HOLLOW_ROSTER's own entry for The
// Hollow Crow, untouched by this change.

function createRecordingCtx() {
  const fills = [];
  const strokes = [];
  const arcs = [];
  let shadowBlur = 0;
  const maxShadowBlur = { value: 0 };
  const proxy = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'fill') return () => fills.push(1);
        if (prop === 'stroke') return () => strokes.push(1);
        if (prop === 'arc') return (x, y, r) => arcs.push({ x, y, r });
        if (prop === 'shadowBlur') return shadowBlur;
        return () => {};
      },
      set(obj, prop, value) {
        if (prop === 'shadowBlur') {
          shadowBlur = value;
          if (value > maxShadowBlur.value) maxShadowBlur.value = value;
        }
        return true;
      },
    }
  );
  return { ctx: proxy, fills, strokes, arcs, maxShadowBlur };
}

test('renders without throwing at both the real in-game boss scale and the splash screen\'s much bigger hero scale', () => {
  const game = loadGameContext();
  const draw = game.BOSS_DRAW_FUNCTIONS['hollow-boss-tier-2'];
  assert.equal(typeof draw, 'function');
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => draw(ctx, { x: 0, y: 0, radius: 27, color: '#1c1c1c' }));
  assert.doesNotThrow(() => draw(ctx, { x: 0, y: 0, radius: 140, color: '#1c1c1c' }));
});

test('draws noticeably more shapes than before (real beak/legs/fingered wingtips/tail-fan, not just an eye + 6 notch triangles)', () => {
  const game = loadGameContext();
  const draw = game.BOSS_DRAW_FUNCTIONS['hollow-boss-tier-2'];
  const rec = createRecordingCtx();
  draw(rec.ctx, { x: 0, y: 0, radius: 27, color: '#1c1c1c' });

  // The old version drew exactly 8 fills total (eye glow + pupil + 6
  // tattered-notch triangles, from drawCaveBirdBody's own fixed 4 fills).
  // This redesign's own legs/beak/tail/wing-panel/sheen/feather shapes
  // push that number up substantially.
  assert.ok(rec.fills.length > 20, `expected far more than the old design's 8 fills, got ${rec.fills.length}`);
  // At least one visible stroke (the wing-panel outline, the leg lines,
  // the beak bristles, the tail rib lines) — the old version drew none.
  assert.ok(rec.strokes.length > 0);
});

test('the eye-glow\'s own shadowBlur no longer scales unboundedly with radius (the splash screen\'s own much bigger radius used to wash out the whole head)', () => {
  const game = loadGameContext();
  const draw = game.BOSS_DRAW_FUNCTIONS['hollow-boss-tier-2'];
  const rec = createRecordingCtx();
  draw(rec.ctx, { x: 0, y: 0, radius: 140, color: '#1c1c1c' });
  assert.ok(rec.maxShadowBlur.value <= 16, `expected shadowBlur to be capped, got ${rec.maxShadowBlur.value}`);
});
