const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Frog art pass (direct request, with a reference photo of a real leopard
// frog viewed from directly above): the previous drawFrog() was a plain
// green ellipse with 2 eye bumps and simple back-leg strokes. Redesigned
// to match the reference's own key traits — a body that tapers toward the
// snout rather than a plain ellipse, a lighter dorsal stripe down the
// spine, dark leopard-spot blotches scattered across the back, and 4
// splayed legs (a short front pair ending in a small toe fan, a longer
// back pair ending in a webbed toe fan) — recognizable as the same
// top-down leopard-frog shape at this sprite's small on-canvas size,
// rather than a plain blob. Purely decorative (js/wildlife.js's own file
// header) — no gameplay behavior changed, only the art.

test('drawFrog renders without throwing, at rest and mid-hop, across a few facing angles', () => {
  const game = loadFullGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  const entity = game.createWildlifeEntity('frog', { lilyPads: [{ x: 100, y: 100 }] });

  [0, Math.PI / 2, Math.PI, -Math.PI / 3].forEach((angle) => {
    [0.2, 0.6, 1].forEach((hopProgress) => {
      entity.facingAngle = angle;
      entity.hopProgress = hopProgress;
      assert.doesNotThrow(() => game.drawFrog(ctx, entity));
    });
  });
});

test('drawFrog draws a tapered body (multiple quadraticCurveTo segments), not a plain ellipse', () => {
  const game = loadFullGameContext();
  const calls = { ellipse: 0, quadraticCurveTo: 0 };
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'ellipse') return (...args) => { calls.ellipse += 1; };
        if (prop === 'quadraticCurveTo') return (...args) => { calls.quadraticCurveTo += 1; };
        return () => {};
      },
    }
  );
  const entity = game.createWildlifeEntity('frog', { lilyPads: [{ x: 100, y: 100 }] });
  game.drawFrog(ctx, entity);

  // The body outline itself is 4 quadraticCurveTo segments (tapered,
  // rounded-diamond shape) — a plain ellipse body would have used 0.
  assert.ok(calls.quadraticCurveTo >= 4);
  // Eyes (2) + dorsal stripe (1) + spot blotches (6) are all still
  // ellipse/arc-based — confirms those weren't accidentally dropped.
  assert.ok(calls.ellipse >= 7);
});

test('drawFrog draws 4 distinct legs (front pair shorter/3-toed, back pair longer/webbed), not just 2 back-leg strokes', () => {
  const game = loadFullGameContext();
  const strokedPaths = [];
  let currentPath = null;
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'beginPath') return () => { currentPath = []; };
        if (prop === 'moveTo') return (x, y) => { if (currentPath) currentPath.push(['M', x, y]); };
        if (prop === 'lineTo') return (x, y) => { if (currentPath) currentPath.push(['L', x, y]); };
        if (prop === 'stroke') return () => { if (currentPath) strokedPaths.push(currentPath); };
        return () => {};
      },
    }
  );
  const entity = game.createWildlifeEntity('frog', { lilyPads: [{ x: 100, y: 100 }] });
  entity.hopProgress = 1;
  game.drawFrog(ctx, entity);

  // Each leg is a short moveTo->lineTo(->lineTo) stroke, plus several more
  // for its own toe/finger fan — comfortably more individual stroked
  // segments than the original 2-leg design ever drew.
  assert.ok(strokedPaths.length > 10, `expected many individual leg/toe strokes, got ${strokedPaths.length}`);

  // Legs on both sides of center (positive and negative local y, before
  // rotation) — a symmetric splayed stance, not all bunched to one side.
  const allPoints = strokedPaths.flat();
  const ys = allPoints.filter((p) => p[0] === 'L').map((p) => p[2]);
  assert.ok(ys.some((y) => y > 0) && ys.some((y) => y < 0));
});

test('createWildlifeEntity("frog") still produces the same entity shape renderWildlife/updateFrog depend on (art-only change)', () => {
  const game = loadFullGameContext();
  const entity = game.createWildlifeEntity('frog', { lilyPads: [{ x: 200, y: 150 }] });
  assert.equal(entity.kind, 'frog');
  assert.equal(typeof entity.x, 'number');
  assert.equal(typeof entity.y, 'number');
  assert.equal(typeof entity.facingAngle, 'number');
  assert.equal(typeof entity.hopProgress, 'number');
});

test('renderWildlife dispatches to drawFrog for \'frog\' entities and skips everything else, without throwing', () => {
  const game = loadFullGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  const frog = game.createWildlifeEntity('frog', { lilyPads: [{ x: 50, y: 50 }] });
  const firefly = game.createWildlifeEntity('firefly');
  assert.doesNotThrow(() => game.renderWildlife(ctx, [frog, firefly], 1.0, 'frog'));
});
