const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Map-select carousel (direct follow-up request): replaced the old small-
// tile grid with one large preview card at a time plus prev/next arrow
// buttons (and mouse-wheel support, tested separately from DOM wheel
// events since this harness has no real browser to dispatch one to) —
// "much bigger map preview images... basically a screenshot-quality
// look," reusing renderMapPreview() (map.js), the real map-drawing code,
// rather than hand-drawn preview art. These tests cover the carousel's
// own navigation/selection logic; map.js's own renderMapPreview is
// exercised indirectly (it's called every renderMapSelect(), which these
// tests call directly) rather than pixel-checked, same as every other
// canvas-drawing function in this codebase.

test('renderMapSelect registers a region for the current map and both nav arrows', () => {
  const game = loadFullGameContext();
  game.setMapCarouselIndex(0);
  game.renderMapSelect(game.getCanvas().getContext('2d'));

  const firstMap = game.listAllMaps()[0];

  const cardRegion = game.uiHitTest(500, 300); // somewhere inside the centered preview card
  assert.ok(cardRegion, 'expected the preview card region to be registered');
  assert.equal(cardRegion.id, `mapselect:${firstMap.id}`);
});

test('mapselect:next/prev step the carousel index without changing selectedMap', () => {
  const game = loadFullGameContext();
  game.setMapCarouselIndex(0);
  game.setSelectedMap(null);

  game.activateRegion({ id: 'mapselect:next', data: {} });
  assert.equal(game.getMapCarouselIndex(), 1);
  assert.equal(game.getSelectedMap(), null); // browsing the carousel never auto-selects a map

  game.activateRegion({ id: 'mapselect:next', data: {} });
  game.activateRegion({ id: 'mapselect:prev', data: {} });
  assert.equal(game.getMapCarouselIndex(), 1);
});

test('the carousel index wraps around at both ends once renderMapSelect clamps it', () => {
  const game = loadFullGameContext();
  const ctx = game.getCanvas().getContext('2d');
  // Read dynamically rather than hardcoded — this literally went stale
  // once before (this test used to assert a hardcoded 4/5 left over from
  // when there were only 5 built-in maps, silently wrong the moment
  // Volcanic became the 6th without anyone re-running the suite to catch
  // it — no Node/browser is available in this environment to run it).
  const mapCount = game.listAllMaps().length;

  game.setMapCarouselIndex(-1); // one step before the first map
  game.renderMapSelect(ctx); // clamp happens at the top of renderMapSelect()
  assert.equal(game.getMapCarouselIndex(), mapCount - 1); // wraps to the last built-in map

  game.setMapCarouselIndex(mapCount); // one step past the last map
  game.renderMapSelect(ctx);
  assert.equal(game.getMapCarouselIndex(), 0); // wraps back to the first
});

test('clicking the preview card itself (not the arrows) selects that map and advances to mode select', () => {
  const game = loadFullGameContext();
  game.setMapCarouselIndex(2); // Savanah, per MAP_TYPE_ORDER
  const ctx = game.getCanvas().getContext('2d');
  game.renderMapSelect(ctx);

  const cardRegion = game.uiHitTest(500, 300);
  game.activateRegion(cardRegion);

  assert.equal(game.getSelectedMap().id, 'savanah');
  assert.equal(game.getGameState(), 'modeSelect');
});

test('mapselect:back returns to the main menu without touching the carousel position', () => {
  const game = loadFullGameContext();
  game.setMapCarouselIndex(3);
  game.activateRegion({ id: 'mapselect:back', data: {} });
  assert.equal(game.getGameState(), 'menu');
  assert.equal(game.getMapCarouselIndex(), 3); // browsing position is preserved, not reset
});
