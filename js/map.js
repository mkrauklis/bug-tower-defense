// The game's map system: a small data-driven MAP_TYPES registry (same spirit
// as TOWER_TYPES/ENEMY_TYPES) instead of one hardcoded map. Each map entry
// has an id, display name, its own path waypoints, its own terrain theme
// (which owns the decorative rendering — trees/bushes for forest, puddles/
// lily pads/mangroves for marsh), and can be rendered full-size or as a
// small icon (see renderMapIcon) for the map-select screen.
//
// Gameplay (combat/towers/waves/economy) doesn't vary by map — only the
// path shape and terrain differ. Everything else in the game (enemies.js's
// movement, towers.js's root-trap placement, game.js's zombie backward
// walk, isPointOnPath's placement check) reads the *currently active* map
// through two module-level bindings, MAP_PATH_WAYPOINTS and MAP_PATH_WIDTH
// — these used to be the one hardcoded map's own `const`s; they're now `let`
// bindings reassigned by setActiveMap() below. Every other file already
// just reads these two names at call time (never captures them up front),
// so switching maps is a one-line reassignment here with zero changes
// needed anywhere else — the key reason this refactor stays this small.

const MAP_WORLD_WIDTH = 960;
const MAP_WORLD_HEIGHT = 640;

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

function strokeMapPath(ctx, waypoints) {
  ctx.beginPath();
  ctx.moveTo(waypoints[0].x, waypoints[0].y);
  waypoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Terrain: Deep Forest (the game's original and still-only hand-tuned map —
// same decoration arrays/drawing code as before the map system existed,
// just regrouped under a terrain theme rather than being the only map).
// ---------------------------------------------------------------------------

function drawMapTree(ctx, x, y, r) {
  ctx.fillStyle = '#2e1f14';
  ctx.fillRect(x - r * 0.15, y, r * 0.3, r * 0.9);

  ctx.fillStyle = '#132b17';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.4, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.5, y - r * 0.1, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.5, y - r * 0.1, r * 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1a3a1f';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.6, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawMapBush(ctx, x, y, r) {
  ctx.fillStyle = '#17331b';
  ctx.beginPath();
  ctx.arc(x - r * 0.4, y, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.4, y, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - r * 0.3, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
}

function drawGrassTuft(ctx, x, y) {
  ctx.strokeStyle = '#1f4023';
  ctx.lineWidth = 2;
  [-4, 0, 4].forEach((dx) => {
    ctx.beginPath();
    ctx.moveTo(x + dx, y + 6);
    ctx.quadraticCurveTo(x + dx * 1.5, y - 2, x + dx * 0.5, y - 8);
    ctx.stroke();
  });
}

const DEEP_FOREST_WAYPOINTS = [
  { x: -20, y: 80 },
  { x: 220, y: 80 },
  { x: 220, y: 300 },
  { x: 520, y: 300 },
  { x: 520, y: 560 },
  { x: 760, y: 560 },
  { x: 760, y: 180 },
  { x: 980, y: 180 },
];

const DEEP_FOREST_DECOR = {
  trees: [
    { x: 60, y: 180, r: 26 },
    { x: 130, y: 460, r: 30 },
    { x: 340, y: 90, r: 22 },
    { x: 430, y: 180, r: 28 },
    { x: 90, y: 560, r: 24 },
    { x: 650, y: 80, r: 26 },
    { x: 880, y: 420, r: 30 },
    { x: 620, y: 420, r: 24 },
    { x: 350, y: 480, r: 28 },
    { x: 850, y: 580, r: 22 },
    { x: 900, y: 100, r: 20 },
    { x: 40, y: 320, r: 20 },
    { x: 920, y: 300, r: 24 },
  ],
  bushes: [
    { x: 180, y: 140, r: 12 },
    { x: 480, y: 90, r: 14 },
    { x: 260, y: 440, r: 12 },
    { x: 560, y: 480, r: 13 },
    { x: 780, y: 380, r: 12 },
    { x: 820, y: 120, r: 11 },
    { x: 110, y: 240, r: 10 },
    { x: 680, y: 500, r: 13 },
  ],
  grassTufts: [
    { x: 150, y: 110 }, { x: 260, y: 230 }, { x: 460, y: 260 }, { x: 560, y: 340 },
    { x: 700, y: 540 }, { x: 830, y: 220 }, { x: 70, y: 420 }, { x: 320, y: 410 },
    { x: 600, y: 120 }, { x: 870, y: 480 }, { x: 200, y: 500 }, { x: 740, y: 260 },
  ],
};

function renderForestDecor(ctx, decor) {
  decor.grassTufts.forEach((tuft) => drawGrassTuft(ctx, tuft.x, tuft.y));
  decor.bushes.forEach((bush) => drawMapBush(ctx, bush.x, bush.y, bush.r));
  decor.trees.forEach((tree) => drawMapTree(ctx, tree.x, tree.y, tree.r));
}

const FOREST_PATH_COLORS = { outline: '#3e2a1a', fill: '#6b4a2f' };

// ---------------------------------------------------------------------------
// Terrain: Marshland — a muddy wetland theme, distinct from Deep Forest's
// dark green: brownish-green mud as the ground, standing mud puddles with
// lily pads floating in them, scattered duckweed patches, and mangrove
// trees (simplified exposed-root silhouette) standing at the water's edges.
// The path reuses the same two-tone dirt-band convention as Deep Forest
// (strokeMapPath/renderMap below) but with a muddier, wetter-looking color
// pair — still clearly a "path" despite the busier surrounding terrain,
// without needing a whole second path-rendering technique.
// ---------------------------------------------------------------------------

function drawMudPuddle(ctx, x, y, r) {
  // Deliberately cooler/bluer than the warm-olive ground fill (#1b2414) so
  // standing water reads clearly against it instead of blending in — an
  // earlier version used near-ground olive tones here and the puddles
  // nearly disappeared at a glance.
  ctx.fillStyle = '#132422';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#20453f';
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.08, r * 0.82, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // A thin highlight arc so the puddle reads as water, not a flat stain.
  ctx.strokeStyle = 'rgba(200, 220, 180, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y - r * 0.2, r * 0.4, r * 0.18, -0.4, 0, Math.PI);
  ctx.stroke();
}

function drawLilyPad(ctx, x, y, r) {
  ctx.fillStyle = '#3f7d3a';
  ctx.beginPath();
  // A circle with a wedge notch cut out of it is the classic lily-pad
  // silhouette — drawn as one arc sweep that stops short of closing, then
  // closed straight back to center through the notch.
  ctx.moveTo(x, y);
  ctx.arc(x, y, r, 0.35, Math.PI * 2 - 0.35);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#2c5c28';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + r * 0.7, y);
  ctx.stroke();
}

function drawDuckweedPatch(ctx, x, y, r) {
  // A loose cluster of tiny flecks rather than a solid shape — reads as
  // floating surface scum at a glance, cheap to draw.
  ctx.fillStyle = '#4a7a3c';
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2 + i * 0.7;
    const dist = (i % 3) * (r / 3);
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist * 0.6, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMangrove(ctx, x, y, r) {
  // Exposed arched prop roots — the one detail that reads as "mangrove"
  // rather than a generic tree, even simplified to a few curved strokes.
  ctx.strokeStyle = '#2e1f14';
  ctx.lineWidth = Math.max(2, r * 0.1);
  [-0.6, -0.25, 0.25, 0.6].forEach((spread) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.3);
    ctx.quadraticCurveTo(x + spread * r * 0.6, y + r * 0.1, x + spread * r, y + r * 0.55);
    ctx.stroke();
  });

  ctx.fillStyle = '#39431c';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.6, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.45, y - r * 0.35, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.45, y - r * 0.35, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4b5a26';
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.8, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

const MARSHLAND_WAYPOINTS = [
  { x: -20, y: 500 },
  { x: 160, y: 500 },
  { x: 160, y: 240 },
  { x: 380, y: 240 },
  { x: 380, y: 460 },
  { x: 600, y: 460 },
  { x: 600, y: 120 },
  { x: 820, y: 120 },
  { x: 820, y: 340 },
  { x: 980, y: 340 },
];

// Hand-placed, same convention as Deep Forest's decor — kept clear of the
// waypoints above. Lily pads are listed per-puddle (they float inside it)
// but also read as one flat list by anything that just wants "every lily
// pad on this map" (js/wildlife.js's frogs — see MARSHLAND_DECOR.lilyPads).
const MARSHLAND_PUDDLES = [
  { x: 70, y: 380, r: 30 },
  { x: 280, y: 560, r: 26 },
  { x: 280, y: 120, r: 28 },
  { x: 480, y: 340, r: 32 },
  { x: 500, y: 580, r: 24 },
  { x: 710, y: 230, r: 30 },
  { x: 900, y: 500, r: 26 },
  { x: 900, y: 60, r: 24 },
];

const MARSHLAND_LILY_PADS = [
  { x: 60, y: 368, r: 9 }, { x: 82, y: 392, r: 7 },
  { x: 272, y: 550, r: 8 }, { x: 292, y: 568, r: 7 },
  { x: 272, y: 112, r: 8 }, { x: 292, y: 128, r: 7 }, { x: 282, y: 134, r: 6 },
  { x: 470, y: 332, r: 9 }, { x: 492, y: 348, r: 8 }, { x: 480, y: 352, r: 6 },
  { x: 492, y: 572, r: 8 }, { x: 508, y: 588, r: 7 },
  { x: 700, y: 222, r: 9 }, { x: 722, y: 238, r: 8 }, { x: 712, y: 242, r: 6 },
  { x: 890, y: 492, r: 8 }, { x: 910, y: 508, r: 7 },
  { x: 892, y: 52, r: 8 }, { x: 910, y: 68, r: 7 },
];

const MARSHLAND_DUCKWEED = [
  { x: 40, y: 440, r: 14 }, { x: 140, y: 420, r: 12 }, { x: 230, y: 60, r: 13 },
  { x: 340, y: 520, r: 12 }, { x: 440, y: 180, r: 14 }, { x: 540, y: 540, r: 12 },
  { x: 660, y: 60, r: 13 }, { x: 750, y: 480, r: 12 }, { x: 860, y: 230, r: 14 },
  { x: 930, y: 420, r: 12 }, { x: 60, y: 580, r: 11 }, { x: 420, y: 60, r: 12 },
];

const MARSHLAND_MANGROVES = [
  { x: 40, y: 280, r: 24 },
  { x: 120, y: 600, r: 26 },
  { x: 230, y: 420, r: 22 },
  { x: 330, y: 60, r: 24 },
  { x: 460, y: 580, r: 26 },
  { x: 560, y: 260, r: 22 },
  { x: 670, y: 580, r: 24 },
  { x: 760, y: 60, r: 26 },
  { x: 880, y: 420, r: 22 },
  { x: 930, y: 160, r: 24 },
];

const MARSHLAND_DECOR = {
  puddles: MARSHLAND_PUDDLES,
  lilyPads: MARSHLAND_LILY_PADS,
  duckweed: MARSHLAND_DUCKWEED,
  mangroves: MARSHLAND_MANGROVES,
};

function renderMarshDecor(ctx, decor) {
  decor.duckweed.forEach((patch) => drawDuckweedPatch(ctx, patch.x, patch.y, patch.r));
  decor.puddles.forEach((puddle) => drawMudPuddle(ctx, puddle.x, puddle.y, puddle.r));
  decor.lilyPads.forEach((pad) => drawLilyPad(ctx, pad.x, pad.y, pad.r));
  decor.mangroves.forEach((tree) => drawMangrove(ctx, tree.x, tree.y, tree.r));
}

// Muddier/wetter than Deep Forest's dirt-brown pair — documented choice
// (see file header) rather than reusing the forest path colors verbatim.
const MARSH_PATH_COLORS = { outline: '#241d10', fill: '#5c4328' };

// ---------------------------------------------------------------------------
// Terrain theme registry — each theme owns a background color plus a decor
// renderer taking that map's own `decor` object. renderMap()/renderMapIcon()
// below both dispatch through this rather than special-casing map ids.
// ---------------------------------------------------------------------------

const TERRAIN_THEMES = {
  forest: { background: '#0d1b10', renderDecor: renderForestDecor },
  marsh: { background: '#1b2414', renderDecor: renderMarshDecor },
};

// ---------------------------------------------------------------------------
// MAP_TYPES — the built-in maps (the only maps there are now that the map
// editor/custom maps have been removed).
// ---------------------------------------------------------------------------

const MAP_TYPES = {
  deepForest: {
    id: 'deepForest',
    name: 'Deep Forest',
    builtin: true,
    waypoints: DEEP_FOREST_WAYPOINTS,
    pathWidth: 56,
    pathColors: FOREST_PATH_COLORS,
    terrain: 'forest',
    decor: DEEP_FOREST_DECOR,
  },
  marshland: {
    id: 'marshland',
    name: 'Marshland',
    builtin: true,
    waypoints: MARSHLAND_WAYPOINTS,
    pathWidth: 56,
    pathColors: MARSH_PATH_COLORS,
    terrain: 'marsh',
    decor: MARSHLAND_DECOR,
  },
};

const MAP_TYPE_ORDER = ['deepForest', 'marshland'];

// ---------------------------------------------------------------------------
// Active-map state. MAP_PATH_WAYPOINTS/MAP_PATH_WIDTH are what every other
// file (enemies.js movement, towers.js root-trap placement, game.js's
// zombie backward walk, isPointOnPath below) actually reads — see the file
// header for why reassigning these two bindings is the whole refactor.
// ---------------------------------------------------------------------------

let activeMap = MAP_TYPES.deepForest;
let MAP_PATH_WAYPOINTS = activeMap.waypoints;
let MAP_PATH_WIDTH = activeMap.pathWidth;

function setActiveMap(map) {
  activeMap = map;
  MAP_PATH_WAYPOINTS = map.waypoints;
  MAP_PATH_WIDTH = map.pathWidth;
}

function getActiveMap() {
  return activeMap;
}

// Whether a point is on (or within `margin` of) the active map's path —
// used to keep towers off the path when placing them.
function isPointOnPath(x, y, margin = 0) {
  const halfWidth = MAP_PATH_WIDTH / 2 + margin;
  for (let i = 0; i < MAP_PATH_WAYPOINTS.length - 1; i += 1) {
    const a = MAP_PATH_WAYPOINTS[i];
    const b = MAP_PATH_WAYPOINTS[i + 1];
    if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= halfWidth) return true;
  }
  return false;
}

function renderMap(ctx, canvas) {
  const theme = TERRAIN_THEMES[activeMap.terrain];

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const colors = activeMap.pathColors;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = MAP_PATH_WIDTH + 10;
  strokeMapPath(ctx, MAP_PATH_WAYPOINTS);

  ctx.strokeStyle = colors.fill;
  ctx.lineWidth = MAP_PATH_WIDTH;
  strokeMapPath(ctx, MAP_PATH_WAYPOINTS);

  theme.renderDecor(ctx, activeMap.decor);
}

// A mini version of a map's real rendering, drawn into an arbitrary
// `size` x `size` box — same "render a small real version of the actual
// output" convention already used for tower shop icons and lab tool
// thumbnails elsewhere. Decor is deliberately skipped at this scale: tiny
// trees/puddles just read as noise at icon size (the terrain color + path
// shape alone already read clearly), the same call already made for lab
// tool thumbnails that don't survive shrinking.
function renderMapIcon(ctx, map, x, y, size) {
  const theme = TERRAIN_THEMES[map.terrain];

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();

  ctx.translate(x, y);
  ctx.scale(size / MAP_WORLD_WIDTH, size / MAP_WORLD_HEIGHT);

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, MAP_WORLD_WIDTH, MAP_WORLD_HEIGHT);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = map.pathColors.outline;
  ctx.lineWidth = map.pathWidth + 14; // a touch thicker than real scale so it doesn't vanish when shrunk
  strokeMapPath(ctx, map.waypoints);
  ctx.strokeStyle = map.pathColors.fill;
  ctx.lineWidth = map.pathWidth + 4;
  strokeMapPath(ctx, map.waypoints);

  ctx.restore();
}

// The map editor (and the procedural per-custom-map decor generator it
// needed, since a custom path's shape was unknown ahead of time unlike the
// two built-ins' hand-placed decor above) was removed per direct request —
// see git history. Deep Forest/Marshland and everything above this line
// are untouched.
