const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullGameContext } = require('./support/loadGame');

// General button visual-upgrade pass + per-path upgrade-tier theming
// (direct request, relayed from the peer session): "give all buttons in
// the game a visual upgrade... better depth/polish... keep it consistent
// with the site's existing palette" plus "upgrade buttons for a given
// tower's upgrade path should visually reflect that path's own theme, and
// get MORE pronounced as the tier/cost goes up." See:
//   - js/ui.js: uiButtonBevel() (the shared glossy-bevel overlay) and
//     uiDrawButton()'s own hover-glow/bevel upgrade.
//   - js/game.js: PATH_THEMES/getPathTheme()/getTierThemeColor()/
//     mixHexColors()/drawPathMotifMark()/drawPathTierAccents(), and
//     renderUpgradePaths()'s own use of all of the above.
// This is visual-only — no cost/stat/balance changes anywhere, so these
// tests only ever assert on colors/theming data and "never throws," never
// on anything mechanical.

test('mixHexColors interpolates linearly between two colors, inclusive of both ends', () => {
  const game = loadFullGameContext();
  assert.equal(game.mixHexColors('#000000', '#ffffff', 0), 'rgb(0, 0, 0)');
  assert.equal(game.mixHexColors('#000000', '#ffffff', 1), 'rgb(255, 255, 255)');
  assert.equal(game.mixHexColors('#000000', '#ffffff', 0.5), 'rgb(128, 128, 128)');
});

test('getPathTheme resolves a known path name, and falls back to a safe default for an unknown one', () => {
  const game = loadFullGameContext();
  const solar = game.getPathTheme('Solar Path');
  assert.equal(solar.motif, 'ray');
  assert.equal(typeof solar.base, 'string');
  assert.equal(typeof solar.peak, 'string');

  const unknown = game.getPathTheme('Some Path That Does Not Exist');
  assert.equal(unknown.motif, 'default');
});

test('getTierThemeColor lands exactly on the theme\'s own base at Tier 1 and peak at Tier 4', () => {
  const game = loadFullGameContext();
  const theme = game.getPathTheme('Decay Path');
  assert.equal(game.getTierThemeColor(theme, 0), game.mixHexColors(theme.base, theme.peak, 0));
  assert.equal(game.getTierThemeColor(theme, 3), game.mixHexColors(theme.base, theme.peak, 1));
  // Decay Path's own base (#4caf50, green) and peak (#6a1b9a, purple) are
  // genuinely different colors, so Tier 1 and Tier 4 must read as visibly
  // different shades — "get MORE pronounced as the tier/cost goes up"
  // would be meaningless if they came out identical.
  assert.notEqual(game.getTierThemeColor(theme, 0), game.getTierThemeColor(theme, 3));
});

// Every real, currently-designed upgrade path in the game (a path can be
// `null` — "not yet designed" — so those are skipped) must have its own
// PATH_THEMES entry, not silently fall back to DEFAULT_PATH_THEME — a
// path name typo here would be invisible in normal play (it'd just show a
// bland reused default green instead of throwing), so this is the one
// thing worth asserting exhaustively rather than spot-checking a few.
test('every designed upgrade path across every tower has its own PATH_THEMES entry (no silent default fallback)', () => {
  const game = loadFullGameContext();
  const undesignedThemeNames = [];
  Object.values(game.TOWER_TYPES).forEach((towerType) => {
    (towerType.upgradePaths || []).forEach((path) => {
      if (!path) return; // "not yet designed" slot — nothing to theme yet
      if (!(path.name in game.PATH_THEMES)) undesignedThemeNames.push(path.name);
    });
  });
  assert.deepEqual(undesignedThemeNames, []);
});

test('uiButtonBevel and uiDrawButton never throw, across every state/hover combination', () => {
  const game = loadFullGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  assert.doesNotThrow(() => game.uiButtonBevel(ctx, 0, 0, 100, 32, 5));
  ['default', 'disabled', 'accent'].forEach((state) => {
    [false, true].forEach((hovered) => {
      assert.doesNotThrow(() =>
        game.uiDrawButton(ctx, { x: 0, y: 0, w: 100, h: 32, label: 'Test', state, hovered })
      );
    });
  });
});

test('renderUpgradePaths never throws for an unselected tower, a freshly placed one, or one with tiers owned on every path family', () => {
  const game = loadFullGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });

  // No tower selected at all (the shop-browsing default state).
  game.setSelectedTower(null);
  assert.doesNotThrow(() => game.renderUpgradePaths(ctx, 0, 280, 0));

  // A freshly placed tower, nothing bought yet.
  const sunflower = game.createTower('sunflower', 100, 100);
  game.setSelectedTower(sunflower);
  assert.doesNotThrow(() => game.renderUpgradePaths(ctx, 0, 280, 0));

  // Every real tower type, each with a couple of tiers bought on its own
  // first designed path — exercises "bought" (green+themed) and "next in
  // line" (themed preview) rendering across every PATH_THEMES motif.
  game.setMoney(1000000);
  Object.keys(game.TOWER_TYPES).forEach((typeKey) => {
    const type = game.TOWER_TYPES[typeKey];
    const firstDesignedPathIndex = type.upgradePaths.findIndex((path) => path);
    if (firstDesignedPathIndex === -1) return; // Prodigies have no paths of their own
    const tower = game.createTower(typeKey, 200, 200);
    game.setSelectedTower(tower);
    game.purchaseUpgrade(tower, firstDesignedPathIndex, 0);
    assert.doesNotThrow(
      () => game.renderUpgradePaths(ctx, 0, 280, 0),
      `renderUpgradePaths threw for ${typeKey}`
    );
  });
});

test('a tower locked into one path still renders its other (locked-out) paths without throwing, and theming is visual-only (no stat/cost changes)', () => {
  const game = loadFullGameContext();
  const ctx = new Proxy({}, { get: () => () => {} });
  game.setMoney(1000000);

  const rose = game.createTower('rose', 150, 150);
  game.setSelectedTower(rose);
  const costBefore = game.TOWER_TYPES.rose.upgradePaths[0].upgrades[0].cost;
  game.purchaseUpgrade(rose, 0, 0); // locks Rose into Thorn Path (index 0)
  const costAfter = game.TOWER_TYPES.rose.upgradePaths[0].upgrades[0].cost;

  assert.equal(rose.chosenPath, 0);
  assert.equal(costBefore, costAfter); // the theming pass never touches cost data
  assert.doesNotThrow(() => game.renderUpgradePaths(ctx, 0, 280, 0));
});
