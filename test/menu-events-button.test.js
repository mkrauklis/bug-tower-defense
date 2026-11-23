const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// Direct request: rename the main menu's "Adventures" entry to "Events"
// and give it a cooler, fancier look — distinct from the plain "Play"
// button. Reuses drawHollowEventLogo()'s own "pulsing glow + dark offset
// carved backing" title treatment (js/game.js, the splash screen's cover
// art), scaled down to button size, plus its own fiery orange hover
// accent (vs. Play's green) so it reads as its own stand-out entry point
// into The Hollow Event rather than a 3rd plain list item. Only the
// on-screen label changed — the region id ('start:adventure') and
// everything downstream of clicking it (activateRegion's handler,
// GAME_MODES.adventure, MAP_TYPES.theHollowEvent) is untouched.

test('the Events entry renders "Events," not the old "Adventures" label, while Play is unchanged', () => {
  const game = loadFullGameContext();
  const drawnTexts = [];
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'fillText') return (text) => drawnTexts.push(text);
        if (prop === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set() {
        return true;
      },
    }
  );
  assert.doesNotThrow(() => game.renderMenu(ctx));
  assert.ok(drawnTexts.includes('Events'));
  assert.ok(drawnTexts.includes('Play'));
  assert.equal(drawnTexts.includes('Adventures'), false);
});

test('the Events label is drawn with its own fancy font and glow, unlike the plain Play label', () => {
  const game = loadFullGameContext();
  const fontsByText = {};
  let currentFont = null;
  const shadowColors = [];
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'fillText')
          return (text) => {
            if (!fontsByText[text]) fontsByText[text] = currentFont;
          };
        if (prop === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set(obj, prop, value) {
        if (prop === 'font') currentFont = value;
        if (prop === 'shadowColor') shadowColors.push(value);
        return true;
      },
    }
  );
  game.renderMenu(ctx);
  assert.notEqual(fontsByText.Events, fontsByText.Play);
  assert.match(fontsByText.Events, /italic/);
  assert.match(fontsByText.Events, /Impact/);
  assert.ok(shadowColors.some((c) => c.startsWith('rgba(255, 1') && c.includes(', 20,')));
});

test('the Events button glow pulses over menuGlowTime rather than being static', () => {
  const game = loadFullGameContext();
  const blursByTime = [];
  const makeCtx = () => {
    let blur = 0;
    return new Proxy(
      {},
      {
        get(obj, prop) {
          if (prop === 'shadowBlur') return blur;
          if (prop === 'fillText')
            return () => {
              blursByTime.push(blur);
            };
          if (prop === 'measureText') return () => ({ width: 10 });
          return () => {};
        },
        set(obj, prop, value) {
          if (prop === 'shadowBlur') blur = value;
          return true;
        },
      }
    );
  };
  game.setMenuGlowTime(0);
  game.renderMenu(makeCtx());
  game.setMenuGlowTime(1.3); // offset chosen so sin(time*2.2) differs from t=0
  game.renderMenu(makeCtx());
  assert.notEqual(blursByTime[0], blursByTime[blursByTime.length - 1]);
});

test('hovering the Events entry uses its own fiery accent color, not Play\'s green', () => {
  const game = loadFullGameContext();
  const strokeStyles = [];
  const ctx = new Proxy(
    {},
    {
      get(obj, prop) {
        if (prop === 'fillText') return () => {};
        if (prop === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set(obj, prop, value) {
        if (prop === 'strokeStyle') strokeStyles.push(value);
        return true;
      },
    }
  );
  game.setHoverRegion({ id: 'start:adventure' });
  game.renderMenu(ctx);
  assert.ok(strokeStyles.includes('#ff6e14'));
  assert.equal(strokeStyles.includes('#8bc34a'), false); // Play's hover color never used while Play isn't hovered
});
