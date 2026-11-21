const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Mobile touch-target bug fix (user report: touch controls/UI feel broken
// or awkward on a phone). Root cause: style.css's canvas rule
// (max-width:100%; height:auto) shrinks the logically-960px-wide stacked
// canvas down to fit a real phone's much narrower CSS viewport, shrinking
// every on-canvas button (e.g. Sandbox's 44px tile) by the same ratio —
// well under a usable tap-target size. Fix: applyLayout() now pins the
// canvas's own CSS size to the real viewport width in stacked mode and
// renders into a devicePixelRatio-scaled backing store via
// ctx.setTransform(), instead of letting the browser's own img-style
// auto-shrink do it — logicalWidth/logicalHeight (what every render/
// layout function in game.js is actually written in terms of) stay
// exactly what they always were, so no button's own intended size changed.

test('applyLayout pins the canvas CSS size to the real (narrow) viewport width and scales the backing store by devicePixelRatio, in stacked mode', () => {
  const game = loadFullGameContext();
  const window_ = game.getWindow();
  window_.innerWidth = 390; // a typical phone width — well under NARROW_BREAKPOINT (820)
  window_.devicePixelRatio = 2;
  game.applyLayout();

  assert.equal(game.getLayoutMode(), 'stacked');
  // Logical layout space is untouched by this fix — same 960 x (640+760)
  // every render/layout function in game.js already assumed.
  assert.equal(game.getLogicalWidth(), 960);
  assert.equal(game.getLogicalHeight(), 1400);

  const canvas = game.getCanvas();
  const scale = 390 / 960;
  assert.equal(canvas.style.width, `${Math.round(960 * scale)}px`);
  assert.equal(canvas.style.height, `${Math.round(1400 * scale)}px`);
  // Backing store is the CSS size times devicePixelRatio — bigger than a
  // plain 1:1 canvas, so rendering a logical 44px button still produces a
  // physically ~44 CSS px tap target once the browser displays it at
  // canvas.style.width, instead of shrinking along with a fixed 960px
  // backing store.
  assert.equal(canvas.width, Math.round(960 * scale * 2));
  assert.equal(canvas.height, Math.round(1400 * scale * 2));
});

test('applyLayout never upscales past 1x on a viewport that happens to be wider than the logical stacked width', () => {
  const game = loadFullGameContext();
  const window_ = game.getWindow();
  window_.innerWidth = 800; // still under NARROW_BREAKPOINT (820) but close to logicalWidth (960)
  window_.devicePixelRatio = 1;
  game.applyLayout();

  assert.equal(game.getLayoutMode(), 'stacked');
  const canvas = game.getCanvas();
  // scale is capped at 1 — never renders the canvas physically BIGGER than
  // its own logical size just because the viewport is unusually close to it.
  assert.equal(canvas.style.width, '800px');
  assert.equal(canvas.width, 800);
});

test('applyLayout falls back to devicePixelRatio 1 when the environment doesn\'t report one', () => {
  const game = loadFullGameContext();
  const window_ = game.getWindow();
  window_.innerWidth = 390;
  delete window_.devicePixelRatio;
  game.applyLayout();

  const canvas = game.getCanvas();
  const scale = 390 / 960;
  assert.equal(canvas.width, Math.round(960 * scale * 1));
});

test('side (desktop) layout is unaffected by this fix — no CSS size pinning, canvas stays exactly logicalWidth x logicalHeight', () => {
  const game = loadFullGameContext();
  const window_ = game.getWindow();
  window_.innerWidth = 1280; // wide — side layout
  window_.devicePixelRatio = 3; // even on a high-DPR desktop, side mode shouldn't react to this
  game.applyLayout();

  assert.equal(game.getLayoutMode(), 'side');
  assert.equal(game.getLogicalWidth(), 1280); // WORLD_WIDTH(960) + PANEL_WIDTH_SIDE(320)
  assert.equal(game.getLogicalHeight(), 760); // max(WORLD_HEIGHT(640), PANEL_HEIGHT(760))

  const canvas = game.getCanvas();
  assert.equal(canvas.width, 1280);
  assert.equal(canvas.height, 760);
  assert.equal(canvas.style.width, '');
  assert.equal(canvas.style.height, '');
});

test('switching from stacked back to side (e.g. rotating a tablet) clears the pinned CSS size rather than leaving it stale', () => {
  const game = loadFullGameContext();
  const window_ = game.getWindow();

  window_.innerWidth = 390;
  window_.devicePixelRatio = 2;
  game.applyLayout();
  assert.notEqual(game.getCanvas().style.width, '');

  window_.innerWidth = 1280;
  game.applyLayout();
  assert.equal(game.getLayoutMode(), 'side');
  assert.equal(game.getCanvas().style.width, '');
  assert.equal(game.getCanvas().style.height, '');
});

test('getCanvasPoint still maps a tap to logical coordinates, not raw backing-store pixels, after the scaling fix', () => {
  const game = loadFullGameContext();
  const window_ = game.getWindow();
  window_.innerWidth = 1280;
  window_.devicePixelRatio = 1;
  game.applyLayout(); // side mode: logicalWidth=1280, logicalHeight=760

  // The DOM stub's getBoundingClientRect is fixed at 960x640 regardless of
  // canvas.style — getCanvasPoint's own ratio math (logicalWidth/rect.width)
  // is what this is actually checking, not the stub's realism.
  const point = game.getCanvasPoint({ clientX: 480, clientY: 320 });
  assert.equal(point.x, 480 * (1280 / 960));
  assert.equal(point.y, 320 * (760 / 640));
});
