const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Enemy-art realism pass (direct request, relayed from the peer session):
// "go through every single enemy/creature in the game... and redesign
// each one's canvas art to actually look like its real-world namesake...
// not just a recognizable blob in roughly the right color." Working map
// by map, starting with Deep Forest: all 4 of its snakes (Gardener,
// Banana, Armored, Anaconda) used to route through drawSnakeSegment()
// with only a `scaled` on/off flag — visually IDENTICAL but for color and
// size, exactly the "shared helper at the cost of per-species accuracy"
// problem the user's own olm/Texas-blind-salamander report already
// flagged once (see test/caves-map.test.js). Fixed by giving each its own
// real, distinguishing `pattern`: Gardener Snake's own garter-snake
// longitudinal stripes, Anaconda's own dark saddle-blotch markings (plus
// a visibly bulkier body — real anacondas are the most massive-bodied
// snake species by weight, not merely long), Armored Snake's own
// overlapping plate scutes, and Banana Snake left deliberately plain
// (no real "banana snake" species exists to match a pattern to).
//
// A plain color-equality check wouldn't catch this (the old code already
// used different colors) — these tests record actual canvas calls from
// the real segment-draw functions, the same technique
// test/caves-map.test.js's own olm/Texas-blind-salamander fix introduced.

// A minimal ctx recorder: captures every ellipse()/arc() fill call's own
// radii and every stroke()'s lineWidth at the moment it fired — enough to
// confirm genuinely different geometry/pattern counts without a real
// canvas. Does not simulate translate()/rotate() (not needed here; every
// snake segment is drawn from its own local (0, 0) origin).
function createSnakeRecordingCtx() {
  const ellipses = [];
  const strokes = [];
  const rects = [];
  let lineWidth = 1;
  const proxy = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'ellipse') return (x, y, rx, ry) => ellipses.push({ x, y, rx, ry });
        if (prop === 'stroke') return () => strokes.push({ lineWidth });
        if (prop === 'fillRect') return (x, y, w, h) => rects.push({ w, h });
        if (prop === 'lineWidth') return lineWidth;
        if (prop === 'save' || prop === 'restore' || prop === 'translate' || prop === 'rotate') return () => {};
        return () => {};
      },
      set(obj, prop, value) {
        if (prop === 'lineWidth') lineWidth = value;
        return true;
      },
    }
  );
  return { ctx: proxy, ellipses, strokes, rects };
}

test("the 4 Deep Forest snakes no longer draw IDENTICAL geometry (just different colors) — each has its own real pattern now", () => {
  const game = loadGameContext();
  const draw = (fn) => {
    const rec = createSnakeRecordingCtx();
    fn(rec.ctx, 0, 0, 10, '#335533', 0, 0, 0);
    return rec;
  };

  const gardener = draw(game.MILLIPEDE_BODY.gardenerSnake.segmentDrawFn);
  const banana = draw(game.MILLIPEDE_BODY.bananaSnake.segmentDrawFn);
  const armored = draw(game.MILLIPEDE_BODY.armoredSnake.segmentDrawFn);
  const anaconda = draw(game.MILLIPEDE_BODY.anaconda.segmentDrawFn);

  // Gardener Snake: a pale dorsal stripe + 2 lateral stripes = 3 stroked
  // lines, on top of the shared head's own eye/tongue strokes (0 here,
  // since segmentIndex 0's tongue only flickers some frames — this call
  // used a fixed time of 0, which happens to be a "no tongue" frame).
  assert.ok(gardener.strokes.length >= 3, 'expected Gardener Snake to stroke at least its 3 stripe lines');

  // Banana Snake: no pattern strokes/rects/extra ellipses beyond the
  // shared body + belly-highlight ellipses (2 total) — deliberately left
  // plain.
  assert.equal(banana.ellipses.length, 2);
  assert.equal(banana.strokes.length, 0);
  assert.equal(banana.rects.length, 0);

  // Armored Snake: 2 overlapping plate rects per segment (was 1).
  assert.equal(armored.rects.length, 2);

  // Anaconda: its own blotch + eye-spot are both ellipses/arcs on top of
  // the shared body + belly ellipses, so it draws MORE ellipses than
  // Banana Snake's plain body, and its own body ellipse is the widest of
  // the 4 (the "bulkier" real-anaconda trait) — the very first ellipse
  // recorded is always the main body (see drawSnakeSegment's own call
  // order).
  assert.ok(anaconda.ellipses.length > banana.ellipses.length);
  const [gardenerBody] = gardener.ellipses;
  const [bananaBody] = banana.ellipses;
  const [armoredBody] = armored.ellipses;
  const [anacondaBody] = anaconda.ellipses;
  assert.ok(anacondaBody.rx > gardenerBody.rx);
  assert.ok(anacondaBody.rx > bananaBody.rx);
  assert.ok(anacondaBody.rx > armoredBody.rx);
});

test('Anaconda\'s blotch pattern alternates sides per segment (not a static, repeating decal)', () => {
  const game = loadGameContext();
  // The blotch ellipse's own x-position flips sign between an even and
  // an odd segmentIndex (see drawSnakeSegment's own `side` variable).
  const even = createSnakeRecordingCtx();
  game.MILLIPEDE_BODY.anaconda.segmentDrawFn(even.ctx, 0, 0, 10, '#1b3a1b', 0, 0, 0);
  const odd = createSnakeRecordingCtx();
  game.MILLIPEDE_BODY.anaconda.segmentDrawFn(odd.ctx, 0, 0, 10, '#1b3a1b', 0, 1, 0);

  const evenBlotch = even.ellipses[2]; // body, belly, blotch
  const oddBlotch = odd.ellipses[2];
  assert.ok(evenBlotch && oddBlotch, 'expected a blotch ellipse on both an even and an odd segment');
  assert.notEqual(Math.sign(evenBlotch.x), Math.sign(oddBlotch.x));
});

test('every Deep Forest snake draw function still renders without throwing, at every segment index', () => {
  const game = loadGameContext();
  const keys = ['gardenerSnake', 'bananaSnake', 'armoredSnake', 'anaconda'];
  keys.forEach((key) => {
    const rec = createSnakeRecordingCtx();
    for (let segmentIndex = 0; segmentIndex < 6; segmentIndex += 1) {
      assert.doesNotThrow(() =>
        game.MILLIPEDE_BODY[key].segmentDrawFn(rec.ctx, 0, 0, 10, game.FOREST_ROSTER.enemyTypes[key].color, 0, segmentIndex, 1.5)
      );
    }
  });
});
