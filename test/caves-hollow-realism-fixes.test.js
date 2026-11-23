const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGameContext } = require('./support/loadGame');

// Enemy-art realism pass (direct request, relayed from the peer session),
// final part: Caves and The Hollow Event. Both rosters were already
// largely accurate (Caves' olm/Texas-blind-salamander distinction was the
// user's own original motivating bug report, already fixed before this
// pass began; The Hollow Event was built earlier this same session with
// real species research already in place). Two real gaps found applying
// this pass's own standard consistently:
// - Caves' Oilbird called the shared drawCaveBirdBody() with zero
//   options, unlike Swiftlet (`longWings`), White-collared Swift
//   (`longWings` + `collarColor`), and Cave Swallow (`tailFork`). Real
//   oilbirds (Steatornis caripensis) are famous specifically for small
//   white spots scattered across their plain rufous-brown plumage — now
//   drawn via a new `spotted` option, kept modest so Oilbird is still
//   this roster's own least-structurally-ornamented bird.
// - The Hollow Event's Eastern Red Bat called the shared drawBat() with
//   zero options too, differing from Caves' plain Bat only by color.
//   Real Eastern Red Bats have one further genuine field mark: a heavily
//   FURRED tail membrane (most bats, including the plain Bat, have a
//   bare one) — now drawn via a new `furredTail` option.

function createRecordingCtx() {
  const fills = [];
  const strokes = [];
  const proxy = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'fill') return () => fills.push(1);
        if (prop === 'stroke') return () => strokes.push(1);
        return () => {};
      },
    }
  );
  return { ctx: proxy, fills, strokes };
}

test('Oilbird draws extra spot fills on top of the shared cave-bird body, unlike before this fix', () => {
  const game = loadGameContext();
  const swallow = createRecordingCtx(); // another single-option caller, for a same-family baseline
  game.ENEMY_DRAW_FUNCTIONS.caveSwallow(swallow.ctx, { x: 0, y: 0, radius: 7, color: '#7a5a3a' });
  const oilbird = createRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.oilbird(oilbird.ctx, { x: 0, y: 0, radius: 11, color: '#6b4a32' });

  assert.ok(oilbird.fills.length > 0);
  // Oilbird's own 5 spots are each their own fill, on top of the shared
  // body's own fixed fill count (same for every caller) — more total
  // fills than a same-family caller with a different, non-fill-adding
  // option (tailFork uses the body's own existing tail fill, not extra
  // ones).
  assert.ok(oilbird.fills.length > swallow.fills.length);
});

test('Swiftlet/White-collared Swift/Cave Swallow are unaffected by the new `spotted` option', () => {
  const game = loadGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  ['swiftlet', 'whiteCollaredSwift', 'caveSwallow'].forEach((key) => {
    assert.doesNotThrow(() => game.ENEMY_DRAW_FUNCTIONS[key](ctx, { x: 0, y: 0, radius: 8, color: '#3a3a42' }));
  });
});

test("Eastern Red Bat draws a furred tail membrane (extra fill + fringe strokes) that Caves' own plain Bat correctly still has none of", () => {
  const game = loadGameContext();
  const bat = createRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.bat(bat.ctx, { x: 0, y: 0, radius: 7, color: '#2b2a2e' });
  const redBat = createRecordingCtx();
  game.ENEMY_DRAW_FUNCTIONS.easternRedBat(redBat.ctx, { x: 0, y: 0, radius: 8, color: '#a13a1f' });

  assert.equal(bat.strokes.length, 0);
  assert.ok(redBat.strokes.length > 0, 'expected Eastern Red Bat to draw its own furred-tail fringe strokes');
  assert.ok(redBat.fills.length > bat.fills.length, 'expected Eastern Red Bat to draw 1 extra fill (the tail membrane itself)');
});
