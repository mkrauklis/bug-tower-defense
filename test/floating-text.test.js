const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// A small, generic floating-text popup system (spawnFloatingText/
// updateFloatingTexts/renderFloatingTexts, game.js) — originally built
// for the since-removed Coneflower's "+$X" income ticks, kept as
// reusable generic infrastructure: anything wanting a brief rising/
// fading label can call spawnFloatingText(). These tests cover the
// generic helper itself, independent of any one caller.

test('spawnFloatingText adds an entry with the given position/text/color and a full lifetime remaining', () => {
  const game = loadFullGameContext();
  game.spawnFloatingText(100, 200, '+$5', '#8bc34a');

  const [entry] = game.getFloatingTexts();
  assert.equal(entry.x, 100);
  assert.equal(entry.y, 200);
  assert.equal(entry.text, '+$5');
  assert.equal(entry.color, '#8bc34a');
  assert.equal(entry.remaining, 1);
});

test('spawnFloatingText defaults to a green color when none is given', () => {
  const game = loadFullGameContext();
  game.spawnFloatingText(0, 0, 'test');
  assert.equal(game.getFloatingTexts()[0].color, '#8bc34a');
});

test('updateFloatingTexts counts a popup down and removes it once its lifetime expires', () => {
  const game = loadFullGameContext();
  game.spawnFloatingText(0, 0, 'test');

  game.updateFloatingTexts(0.4);
  assert.equal(game.getFloatingTexts()[0].remaining, 0.6);

  game.updateFloatingTexts(0.6); // crosses 0 exactly
  assert.equal(game.getFloatingTexts().length, 0);
});

test('multiple popups age and expire independently', () => {
  const game = loadFullGameContext();
  game.spawnFloatingText(0, 0, 'first');
  game.updateFloatingTexts(0.9);
  game.spawnFloatingText(0, 0, 'second'); // spawned later, so it's younger

  game.updateFloatingTexts(0.2); // first (0.1 left) expires, second (0.8 left) doesn't

  const remaining = game.getFloatingTexts();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].text, 'second');
});
