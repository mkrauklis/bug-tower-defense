const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Enemy-art realism pass (direct request, relayed from the peer session):
// a real fire ant's single most recognizable trait is its two-tone body
// — a reddish-copper head/thorax with a noticeably DARKER gaster
// (abdomen) — not just "an ant colored reddish-orange," which is all the
// shared drawAntBody() alone produces (every part filled in one flat
// color). See drawFireAnt()'s own comment in enemies.js.

function createFillRecordingCtx() {
  const ellipseFills = [];
  let fillStyle = null;
  const proxy = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'ellipse') return () => {};
        if (prop === 'fill') return () => ellipseFills.push(fillStyle);
        if (prop === 'fillStyle') return fillStyle;
        if (prop === 'arc' || prop === 'beginPath' || prop === 'moveTo' || prop === 'lineTo' || prop === 'quadraticCurveTo' || prop === 'stroke') {
          return () => {};
        }
        return () => {};
      },
      set(obj, prop, value) {
        if (prop === 'fillStyle') fillStyle = value;
        return true;
      },
    }
  );
  return { ctx: proxy, ellipseFills };
}

test("Fire Ant's abdomen is refilled a visibly darker shade than its own base color, on top of the shared ant body", () => {
  const game = loadGameContext();
  const rec = createFillRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.fireAnt(rec.ctx, { x: 0, y: 0, radius: 9, color: '#d84315' });

  // drawAntBody fills the shared head+abdomen in the plain base color
  // first (2 fills); drawFireAnt then re-fills the abdomen a 2nd time in
  // a darker shade on top.
  assert.ok(rec.ellipseFills.includes('#d84315'), 'expected the base color to still be used for the shared ant body');
  const darkerFills = rec.ellipseFills.filter((style) => style !== '#d84315');
  assert.ok(darkerFills.length > 0, 'expected at least one re-fill in a shade other than the base color');
});

test('the plain Ant (no two-tone treatment) is unaffected by Fire Ant\'s own fix', () => {
  const game = loadGameContext();
  const rec = createFillRecordingCtx();
  assert.doesNotThrow(() => game.ENEMY_DRAW_FUNCTIONS.ant(rec.ctx, { x: 0, y: 0, radius: 9, color: '#8d6e63' }));
  // Every fill on the plain Ant is still its own single base color.
  assert.ok(rec.ellipseFills.every((style) => style === '#8d6e63'));
});
