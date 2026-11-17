const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// uiHitTest/uiRegisterRegion/uiBeginFrame — the pure hit-testing core of the
// canvas-drawn control panel (js/ui.js). No canvas needed for any of this,
// it's just rectangle math over a plain array.

test('uiHitTest finds a region a point falls inside', () => {
  const game = loadFullGameContext();
  game.uiBeginFrame();
  game.uiRegisterRegion('a', 0, 0, 10, 10, { label: 'a' });
  game.uiRegisterRegion('b', 20, 20, 10, 10, { label: 'b' });

  assert.equal(game.uiHitTest(5, 5).id, 'a');
  assert.equal(game.uiHitTest(25, 25).id, 'b');
  assert.equal(game.uiHitTest(15, 15), null);
});

test('uiHitTest is inclusive of region edges', () => {
  const game = loadFullGameContext();
  game.uiBeginFrame();
  game.uiRegisterRegion('r', 10, 10, 20, 20, {});

  assert.equal(game.uiHitTest(10, 10).id, 'r'); // top-left corner
  assert.equal(game.uiHitTest(30, 30).id, 'r'); // bottom-right corner
  assert.equal(game.uiHitTest(31, 10), null); // just outside
});

test('uiHitTest prefers the most recently registered region on overlap', () => {
  const game = loadFullGameContext();
  game.uiBeginFrame();
  game.uiRegisterRegion('under', 0, 0, 50, 50, {});
  game.uiRegisterRegion('over', 0, 0, 50, 50, {});

  assert.equal(game.uiHitTest(25, 25).id, 'over');
});

test('uiBeginFrame clears regions from the previous frame', () => {
  const game = loadFullGameContext();
  game.uiBeginFrame();
  game.uiRegisterRegion('stale', 0, 0, 50, 50, {});
  game.uiBeginFrame();

  assert.equal(game.uiHitTest(10, 10), null);
});

test('uiWrapText breaks on word boundaries at a fake max width', () => {
  const game = loadFullGameContext();
  // A stub canvas context's measureText is a no-op proxy (returns another
  // stub), so .width on it is undefined — undefined > maxWidth is always
  // false, meaning every word fits and nothing wraps. That's fine: this
  // just verifies the function runs and returns one line per call under
  // that stub, and still handles an empty string sanely.
  const ctx = { measureText: () => ({ width: 0 }), font: '' };
  const lines = game.uiWrapText(ctx, 'a short line of text', 1000);
  assert.deepEqual(lines, ['a short line of text']);

  const empty = game.uiWrapText(ctx, '', 1000);
  assert.deepEqual(empty, []);
});

test('uiWrapText wraps once a word would push a line past max width', () => {
  const game = loadFullGameContext();
  // A tiny fake measureText: width = text length (so "max width 10" means
  // "10 characters"), enough to exercise the actual wrapping branch.
  const ctx = { measureText: (text) => ({ width: text.length }), font: '' };
  const lines = game.uiWrapText(ctx, 'aaaa bbbb cccc', 9);
  assert.deepEqual(lines, ['aaaa', 'bbbb', 'cccc']);
});

test('isWorldPoint routes by x in side layout, by y in stacked layout', () => {
  const game = loadFullGameContext();
  // Default load is a wide viewport (see loadGame.js's window stub) -> side layout.
  assert.equal(game.isWorldPoint(500, 300), true); // left of the world/panel split
  assert.equal(game.isWorldPoint(1000, 300), false); // inside the side panel
});

test('getCanvasPoint scales client coordinates by the canvas/CSS-size ratio', () => {
  const game = loadFullGameContext();
  // The stub canvas's getBoundingClientRect always reports a 960x640 CSS
  // box (see loadGame.js); canvas.width/height are set by applyLayout() at
  // load time to the real (possibly larger) internal resolution.
  const point = game.getCanvasPoint({ clientX: 480, clientY: 320 });
  assert.ok(point.x > 0 && point.y > 0);
});

test('activateRegion toggles the selected shop item', () => {
  const game = loadFullGameContext();
  const item = { typeKey: 'sunflower', name: 'Sunflower', cost: 25 };
  const region = { id: 'shop:sunflower', data: item };

  game.activateRegion(region);
  assert.equal(game.getSelectedShopItem(), item);

  game.activateRegion(region); // clicking the same tile again deselects it
  assert.equal(game.getSelectedShopItem(), null);
});

test('activateRegion buys the next-in-line upgrade and deducts money', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  game.setSelectedTower(tower);
  game.setMoney(1000);

  const upgrade = { name: 'Glare', cost: 50, description: 'test', effects: { damageMultiplier: 2 } };
  const region = {
    id: 'upgrade:0:0',
    data: { pathIndex: 0, tierIndex: 0, upgrade, isNextInLine: true },
  };

  game.activateRegion(region);

  assert.equal(tower.upgradesPurchased, 1);
  assert.equal(game.getMoney(), 950);
});

test('activateRegion refuses an upgrade that is not next-in-line (e.g. a locked tier)', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  game.setSelectedTower(tower);
  game.setMoney(1000);

  const upgrade = { name: 'Precision Rays', cost: 250, description: 'test', effects: {} };
  const region = {
    id: 'upgrade:0:1',
    data: { pathIndex: 0, tierIndex: 1, upgrade, isNextInLine: false },
  };

  game.activateRegion(region);

  assert.equal(tower.upgradesPurchased, 0);
  assert.equal(game.getMoney(), 1000);
});

test('activateRegion refuses an upgrade the player cannot afford', () => {
  const game = loadFullGameContext();
  const tower = game.createTower('sunflower');
  game.setSelectedTower(tower);
  game.setMoney(10);

  const upgrade = { name: 'Glare', cost: 50, description: 'test', effects: {} };
  const region = {
    id: 'upgrade:0:0',
    data: { pathIndex: 0, tierIndex: 0, upgrade, isNextInLine: true },
  };

  game.activateRegion(region);

  assert.equal(tower.upgradesPurchased, 0);
  assert.equal(game.getMoney(), 10);
});

test('activateRegion starts the next round only when no wave is in progress', () => {
  const game = loadFullGameContext();
  const roundBefore = game.getRound();

  game.activateRegion({ id: 'next-round', data: { waveInProgress: true } });
  assert.equal(game.getRound(), roundBefore); // refused — a wave is still running

  game.activateRegion({ id: 'next-round', data: { waveInProgress: false } });
  assert.equal(game.getRound(), roundBefore + 1);
});

test('activateRegion toggles game speed between 1x and 2x', () => {
  const game = loadFullGameContext();
  assert.equal(game.getGameSpeed(), 1);

  game.activateRegion({ id: 'speed-toggle', data: {} });
  assert.equal(game.getGameSpeed(), 2);

  game.activateRegion({ id: 'speed-toggle', data: {} });
  assert.equal(game.getGameSpeed(), 1);
});

test('getTooltipLines describes a shop item with its name and cost', () => {
  const game = loadFullGameContext();
  const region = { id: 'shop:sunflower', data: { typeKey: 'sunflower', name: 'Sunflower', cost: 25 } };
  const lines = game.getTooltipLines(region);

  assert.ok(lines[0].includes('Sunflower'));
  assert.ok(lines.some((line) => line.includes('25')));
});

test('getTooltipLines works for a locked (not-yet-reachable) upgrade tier', () => {
  const game = loadFullGameContext();
  const upgrade = { name: 'Solar Ray', cost: 1500, description: 'Ignites bugs it hits.' };
  const region = {
    id: 'upgrade:0:3',
    data: { pathIndex: 0, tierIndex: 3, upgrade, bought: false, isNextInLine: false, isLockedOut: false },
  };

  const lines = game.getTooltipLines(region);

  assert.ok(lines.includes('Solar Ray'));
  assert.ok(lines.some((line) => line.includes('1500')));
  assert.ok(lines.some((line) => line.includes('Ignites')));
});

test('getTooltipLines flags a path-locked-out upgrade', () => {
  const game = loadFullGameContext();
  const upgrade = { name: 'Spark', cost: 50, description: 'Attack speed doubles.' };
  const region = {
    id: 'upgrade:1:0',
    data: { pathIndex: 1, tierIndex: 0, upgrade, bought: false, isNextInLine: false, isLockedOut: true },
  };

  const lines = game.getTooltipLines(region);

  assert.ok(lines.some((line) => line.toLowerCase().includes('locked')));
});

test('getTooltipLines shows "Owned" instead of a cost for a bought tier', () => {
  const game = loadFullGameContext();
  const upgrade = { name: 'Glare', cost: 50, description: 'Damage doubles.' };
  const region = {
    id: 'upgrade:0:0',
    data: { pathIndex: 0, tierIndex: 0, upgrade, bought: true, isNextInLine: false, isLockedOut: false },
  };

  const lines = game.getTooltipLines(region);

  assert.ok(lines.includes('Owned'));
  assert.ok(!lines.some((line) => line.includes('$50')));
});
