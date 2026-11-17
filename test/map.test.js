const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

test('a point on the path\'s centerline counts as on the path', () => {
  const game = loadGameContext();
  const [a, b] = game.MAP_PATH_WAYPOINTS;
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  assert.equal(game.isPointOnPath(midpoint.x, midpoint.y), true);
});

test('a point far from every segment is not on the path', () => {
  const game = loadGameContext();
  assert.equal(game.isPointOnPath(-10000, -10000), false);
});

test('margin widens how close counts as "on the path"', () => {
  const game = loadGameContext();
  const [a, b] = game.MAP_PATH_WAYPOINTS;
  const halfWidth = game.MAP_PATH_WIDTH / 2;
  // Just outside the bare path width...
  const y = a.y + halfWidth + 5;
  assert.equal(game.isPointOnPath(a.x + 50, y, 0), false);
  // ...but inside it once a placement margin is added.
  assert.equal(game.isPointOnPath(a.x + 50, y, 20), true);
});
