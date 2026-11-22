// The game's map system: a small data-driven MAP_TYPES registry (same spirit
// as TOWER_TYPES/ENEMY_TYPES) instead of one hardcoded map. Each map entry
// has an id, display name, its own path waypoints, its own terrain theme
// (which owns the decorative rendering — trees/bushes for forest, puddles/
// lily pads/mangroves for marsh), and can be rendered full-size or as a
// bigger map-select preview (see renderMapPreview) with full decor.
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

// A smooth, irregular closed blob instead of a perfect ellipse — a real
// pond's shoreline doesn't trace a circle. Built from `pointCount` points
// scattered around the center at a wobbling radius (a sum of two sine
// harmonics, phased by `seed` so different ponds don't all wobble
// identically), then connected with quadratic curves through each pair's
// midpoint — the standard "smooth blob through N points" technique, cheap
// and deterministic (no per-frame randomness) so the shape is stable
// across renders.
function drawOrganicBlobPath(ctx, cx, cy, r, seed, flatten = 1) {
  const pointCount = 12;
  const points = [];
  for (let i = 0; i < pointCount; i += 1) {
    const angle = (i / pointCount) * Math.PI * 2;
    const wobble = 1 + 0.26 * Math.sin(angle * 3 + seed) + 0.14 * Math.sin(angle * 5 + seed * 2.3);
    points.push({
      x: cx + Math.cos(angle) * r * wobble,
      y: cy + Math.sin(angle) * r * wobble * flatten,
    });
  }

  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(points[pointCount - 1], points[0]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < pointCount; i += 1) {
    const next = points[(i + 1) % pointCount];
    const midpoint = mid(points[i], next);
    ctx.quadraticCurveTo(points[i].x, points[i].y, midpoint.x, midpoint.y);
  }
  ctx.closePath();
}

// Cooler/bluer than the warm-olive ground fill so standing water reads
// clearly against it instead of blending in (an earlier version used
// near-ground olive tones here and the puddles nearly disappeared at a
// glance), and darker still than that first pass — a direct request to
// make Marshland's water read moodier/darker overall, not just bigger.
const MUD_PUDDLE_OUTER_COLOR = '#0d1c1a';
const MUD_PUDDLE_INNER_COLOR = '#17362f';

function drawMudPuddle(ctx, x, y, r) {
  // Seeds the blob's own wobble phase off its position, so two different
  // ponds (different x/y) get visibly different silhouettes "for free"
  // without needing a stored per-pond shape or true randomness.
  const seed = (x * 0.17 + y * 0.11) % (Math.PI * 2);

  ctx.fillStyle = MUD_PUDDLE_OUTER_COLOR;
  drawOrganicBlobPath(ctx, x, y, r, seed, 0.72);
  ctx.fill();

  ctx.fillStyle = MUD_PUDDLE_INNER_COLOR;
  drawOrganicBlobPath(ctx, x, y - r * 0.05, r * 0.82, seed + 0.9, 0.68);
  ctx.fill();

  // A thin highlight arc so the puddle reads as water, not a flat stain.
  ctx.strokeStyle = 'rgba(200, 220, 180, 0.2)';
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y - r * 0.22, r * 0.38, r * 0.16, -0.4, 0, Math.PI);
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

// Tall grass-like stalks with a brown fuzzy seed head — the classic
// cattail/bulrush silhouette, planted along the water's edges alongside
// duckweed/mangroves (a gap the user flagged directly: Marshland had no
// cattails at all before this).
function drawCattail(ctx, x, y, size) {
  ctx.strokeStyle = '#4a6b2f';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.3, size * 0.1);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + size * 0.12, y - size * 0.95, x + size * 0.04, y - size * 1.65);
  ctx.stroke();
  // A second, shorter blade alongside the main stalk for a fuller tuft.
  ctx.beginPath();
  ctx.moveTo(x + size * 0.2, y + size * 0.05);
  ctx.quadraticCurveTo(x + size * 0.32, y - size * 0.55, x + size * 0.22, y - size * 1.05);
  ctx.stroke();

  ctx.fillStyle = '#6d4c23';
  ctx.beginPath();
  ctx.ellipse(x + size * 0.04, y - size * 1.78, size * 0.14, size * 0.42, 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3e1c';
  ctx.beginPath();
  ctx.ellipse(x + size * 0.02, y - size * 1.9, size * 0.1, size * 0.22, 0.05, 0, Math.PI * 2);
  ctx.fill();
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
//
// Puddle radii here are roughly 2.8x their original size (direct request:
// "much larger," not just the 2x of an earlier pass) — drawMudPuddle()
// itself now draws an irregular blob rather than a circle/ellipse, so
// these read as real ponds rather than big dots. Lily-pad offsets from
// each puddle's own center are scaled by that same ~2.8x so they stay
// spread across the now-much-bigger pond instead of clustering near its
// center or spilling past its edge.
const MARSHLAND_PUDDLES = [
  { x: 70, y: 380, r: 85 },
  { x: 280, y: 560, r: 75 },
  { x: 280, y: 120, r: 80 },
  { x: 480, y: 340, r: 90 },
  { x: 500, y: 580, r: 70 },
  { x: 710, y: 230, r: 85 },
  { x: 900, y: 500, r: 75 },
  { x: 900, y: 60, r: 70 },
];

const MARSHLAND_LILY_PADS = [
  { x: 42, y: 346, r: 14 }, { x: 104, y: 414, r: 11 },
  { x: 257, y: 531, r: 12 }, { x: 315, y: 583, r: 11 },
  { x: 257, y: 97, r: 12 }, { x: 314, y: 143, r: 11 }, { x: 286, y: 160, r: 9 },
  { x: 452, y: 318, r: 14 }, { x: 514, y: 363, r: 12 }, { x: 480, y: 374, r: 9 },
  { x: 477, y: 557, r: 12 }, { x: 523, y: 603, r: 11 },
  { x: 682, y: 207, r: 14 }, { x: 744, y: 253, r: 12 }, { x: 716, y: 264, r: 9 },
  { x: 871, y: 477, r: 12 }, { x: 929, y: 523, r: 11 },
  { x: 877, y: 37, r: 12 }, { x: 929, y: 83, r: 11 },
];

const MARSHLAND_DUCKWEED = [
  { x: 40, y: 440, r: 14 }, { x: 140, y: 420, r: 12 }, { x: 230, y: 60, r: 13 },
  { x: 340, y: 520, r: 12 }, { x: 440, y: 180, r: 14 }, { x: 540, y: 540, r: 12 },
  { x: 660, y: 60, r: 13 }, { x: 750, y: 480, r: 12 }, { x: 860, y: 230, r: 14 },
  { x: 930, y: 420, r: 12 }, { x: 60, y: 580, r: 11 }, { x: 420, y: 60, r: 12 },
];

// Repositioned to the map's four corners (direct request — these used to
// be scattered through the middle) and enlarged. Clustered 2-3 per corner,
// inset far enough that they stay clear of the path (checked against
// MARSHLAND_WAYPOINTS above) rather than sitting flush against the canvas
// edge.
const MARSHLAND_MANGROVES = [
  // top-left
  { x: 50, y: 50, r: 38 }, { x: 108, y: 42, r: 34 }, { x: 42, y: 115, r: 36 },
  // top-right
  { x: 910, y: 45, r: 38 }, { x: 852, y: 36, r: 34 }, { x: 925, y: 108, r: 36 },
  // bottom-left
  { x: 50, y: 592, r: 38 }, { x: 112, y: 606, r: 34 },
  // bottom-right
  { x: 910, y: 596, r: 38 }, { x: 850, y: 608, r: 34 },
];

// New — along the water's edges, alongside the existing duckweed/mangroves
// (a gap the user flagged directly: Marshland had none before this).
// Hand-placed near several puddles' shorelines, kept clear of both the
// path and the puddles themselves.
const MARSHLAND_CATTAILS = [
  { x: 10, y: 300, size: 22 }, { x: 165, y: 430, size: 19 },
  { x: 225, y: 605, size: 21 }, { x: 345, y: 550, size: 18 },
  { x: 225, y: 35, size: 20 }, { x: 355, y: 95, size: 18 },
  { x: 415, y: 290, size: 21 }, { x: 570, y: 370, size: 19 },
  { x: 445, y: 612, size: 20 }, { x: 575, y: 555, size: 18 },
  { x: 655, y: 170, size: 21 }, { x: 790, y: 255, size: 19 },
  { x: 835, y: 545, size: 20 }, { x: 955, y: 455, size: 18 },
  { x: 835, y: 15, size: 20 }, { x: 955, y: 95, size: 18 },
];

const MARSHLAND_DECOR = {
  puddles: MARSHLAND_PUDDLES,
  lilyPads: MARSHLAND_LILY_PADS,
  duckweed: MARSHLAND_DUCKWEED,
  mangroves: MARSHLAND_MANGROVES,
  cattails: MARSHLAND_CATTAILS,
};

function renderMarshDecor(ctx, decor) {
  decor.duckweed.forEach((patch) => drawDuckweedPatch(ctx, patch.x, patch.y, patch.r));
  decor.cattails.forEach((cattail) => drawCattail(ctx, cattail.x, cattail.y, cattail.size));
  decor.puddles.forEach((puddle) => drawMudPuddle(ctx, puddle.x, puddle.y, puddle.r));
  decor.lilyPads.forEach((pad) => drawLilyPad(ctx, pad.x, pad.y, pad.r));
  decor.mangroves.forEach((tree) => drawMangrove(ctx, tree.x, tree.y, tree.r));
}

// Muddier/wetter than Deep Forest's dirt-brown pair (documented choice —
// see file header) and darkened further on top of that (direct request to
// make Marshland read moodier/darker overall) via shadeColor (towers.js,
// loaded before this file) rather than hand-picking new hex values.
const MARSH_PATH_COLORS = { outline: shadeColor('#241d10', -6), fill: shadeColor('#5c4328', -6) };

// ---------------------------------------------------------------------------
// Terrain: Savanah (the user's own spelling — kept as given even though the
// described theme is desert, not grassland-savanna; see MAP_TYPES.savanah's
// own comment). First map with more than one path — two separate spawns
// that both lead into a shared temple goal, rather than Deep Forest/
// Marshland's single route. Decor is desert-themed: sand ground, cacti,
// sandstone rock formations, same canvas-only style as the other two
// terrains.
// ---------------------------------------------------------------------------

// A tall columnar cactus with one side arm — the classic saguaro
// silhouette, simple enough to read clearly at this scale. Drawn as a
// rounded body (lineCap/lineJoin 'round' on a thick stroke, same cheap
// "fat rounded line" trick used for the path itself) rather than filled
// rectangles, so the arm's curve doesn't look blocky.
function drawCactus(ctx, x, y, size) {
  ctx.strokeStyle = '#3f6b3f';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - size);
  ctx.stroke();

  ctx.lineWidth = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.55);
  ctx.quadraticCurveTo(x - size * 0.35, y - size * 0.55, x - size * 0.35, y - size * 0.8);
  ctx.lineTo(x - size * 0.35, y - size * 0.95);
  ctx.stroke();

  ctx.strokeStyle = shadeColor('#3f6b3f', -20);
  ctx.lineWidth = 1;
  [-0.15, 0.15].forEach((dx) => {
    ctx.beginPath();
    ctx.moveTo(x + dx * size, y - size * 0.1);
    ctx.lineTo(x + dx * size, y - size * 0.9);
    ctx.stroke();
  });
}

// A loose cluster of rounded boulders, layered light-over-dark for a
// touch of depth — reads as "sandstone outcrop" without needing any real
// rock texture at this scale.
// Lightened and cooled from an earlier, more saturated brown ('#7a5a38')
// specifically because the ground background behind it got brightened to
// a vivid orange (TERRAIN_THEMES.desert, map.js) — that original brown
// sat too close to the new ground's own hue/brightness and the rock
// clusters started blending in; this tan-gray reads as clearly distinct
// stone against the orange sand instead.
const SANDSTONE_COLOR = '#9c8560';

function drawSandstoneFormation(ctx, x, y, r) {
  ctx.fillStyle = SANDSTONE_COLOR;
  [[-0.4, 0.1, 1], [0.3, 0.2, 0.8], [0, -0.3, 0.65]].forEach(([dx, dy, scale]) => {
    ctx.beginPath();
    ctx.ellipse(x + dx * r, y + dy * r, r * 0.55 * scale, r * 0.4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = shadeColor(SANDSTONE_COLOR, 18);
  ctx.beginPath();
  ctx.ellipse(x - r * 0.1, y - r * 0.35, r * 0.3, r * 0.18, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

// Marks one of Savanah's two independent goals (each path now ends at
// its own — see SAVANAH_DECOR's own comment) — a small stepped-stone
// temple (receding tiers plus a dark doorway at the base) rather than
// just an unmarked dead end, so each path's own goal actually reads
// visually, not just mechanically.
function drawTemple(ctx, x, y, size) {
  [1, 0.72, 0.46].forEach((scale, i) => {
    const w = size * scale;
    const h = size * 0.32 * scale;
    const tierY = y + size * 0.3 - i * size * 0.22;
    ctx.fillStyle = shadeColor('#c9b68a', -i * 10);
    ctx.fillRect(x - w / 2, tierY - h, w, h);
    ctx.strokeStyle = shadeColor('#c9b68a', -i * 10 - 15);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - w / 2, tierY - h, w, h);
  });

  ctx.fillStyle = '#2b2013';
  const doorW = size * 0.16;
  const doorH = size * 0.22;
  ctx.fillRect(x - doorW / 2, y + size * 0.3 - doorH, doorW, doorH);
}

// Path A: spawns top-left, heads east then south, entering its own
// temple from directly above (its last leg is VERTICAL, running down
// column x=480). Path B: spawns bottom-right, heads west then north
// again, entering its own, separate temple from the south.
//
// Direct follow-up request: the user confirmed they want the two paths
// FULLY separate now, including separate endpoints — not just non-
// merging geometry that still converges on one shared temple (the
// state this map was in right after the earlier fix, commit 2189bc6,
// which only fixed the two final legs from being collinear). Path A's
// own route/temple is unchanged from that fix. Path B used to continue
// west all the way to Path A's temple at (480, 320); its last leg now
// turns north short of that point instead, ending at its own temple
// further up the same x=820 column — same first two turns/legs as
// before (the 980,540 -> 820,540 -> 820,320 approach that
// savanah-multipath.test.js's Root Path coverage test already depends
// on), just a different, independent destination rather than a shared
// one. Both goals still drain the same single player-health pool as
// normal — getUnlockedEnemyTypes()/updateEnemies() already detect "an
// enemy reached its own path's own final waypoint" generically (see
// enemies.js's own waypointIndex/MAP_PATHS[enemy.pathIndex] check),
// so nothing about damage-on-reaching-the-goal needed to change, only
// where each path's own final waypoint actually sits.
const SAVANAH_PATH_A = [
  { x: -20, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 260 },
  { x: 480, y: 260 },
  { x: 480, y: 320 },
];
const SAVANAH_PATH_B = [
  { x: 980, y: 540 },
  { x: 820, y: 540 },
  { x: 820, y: 320 },
  { x: 820, y: 160 },
];

// Hand-placed clear of both paths above (checked against every segment of
// each — see each array's own margin), same convention as every other
// terrain's decor.
// cactus 6 and sandstone 7 were repositioned (from 860,330 and 830,280)
// when Path B's route moved — both used to sit in open ground near the
// old south-approach corner and ended up too close to the new east-
// approach corner at (820, 320)-(820, 540).
// Sandstone 3 and 7 (850,140 / 870,200) were repositioned again (to
// 930,120 / 940,230) when Path B's two-separate-goals follow-up gave it
// its own temple at (820, 160) — both used to sit in open ground near
// where that corner used to just pass through, and ended up overlapping
// the new temple.
const SAVANAH_CACTI = [
  { x: 70, y: 25, size: 28 }, { x: 420, y: 50, size: 26 }, { x: 650, y: 50, size: 32 },
  { x: 830, y: 90, size: 28 }, { x: 900, y: 230, size: 30 }, { x: 900, y: 330, size: 26 },
  { x: 900, y: 470, size: 30 }, { x: 650, y: 600, size: 28 }, { x: 420, y: 600, size: 26 },
  { x: 150, y: 560, size: 30 }, { x: 50, y: 420, size: 28 }, { x: 110, y: 220, size: 24 },
];

const SAVANAH_SANDSTONE = [
  { x: 300, y: 345, r: 32 }, { x: 620, y: 460, r: 36 }, { x: 930, y: 120, r: 34 },
  { x: 60, y: 350, r: 32 }, { x: 380, y: 560, r: 36 }, { x: 900, y: 610, r: 28 },
  { x: 940, y: 230, r: 32 },
];

// Each path now ends at its own independent temple (direct follow-up
// request — see SAVANAH_PATH_A/B's own comment for why) rather than one
// shared goal both paths converged on. Kept as separate named fields
// (not one array) so each stays visibly paired with the path it belongs
// to in this file, the same spirit as SAVANAH_PATH_A/SAVANAH_PATH_B
// themselves being two named consts instead of one array-of-paths.
const SAVANAH_TEMPLE_A = { x: 480, y: 320, size: 70 };
const SAVANAH_TEMPLE_B = { x: 820, y: 160, size: 70 };

const SAVANAH_DECOR = {
  cacti: SAVANAH_CACTI,
  sandstone: SAVANAH_SANDSTONE,
  temples: [SAVANAH_TEMPLE_A, SAVANAH_TEMPLE_B],
};

function renderDesertDecor(ctx, decor) {
  decor.sandstone.forEach((rock) => drawSandstoneFormation(ctx, rock.x, rock.y, rock.r));
  decor.cacti.forEach((cactus) => drawCactus(ctx, cactus.x, cactus.y, cactus.size));
  decor.temples.forEach((temple) => drawTemple(ctx, temple.x, temple.y, temple.size));
}

const SAVANAH_PATH_COLORS = { outline: '#3d2c18', fill: '#a67c3f' };

// ---------------------------------------------------------------------------
// Terrain: Whirlpool (direct request) — an ocean-floor theme with a path
// that spirals/curls inward instead of the straight-segment routes every
// other map uses, ending in a central vortex hole (the goal). The
// movement code in enemies.js is entirely path-shape-agnostic (it just
// walks whichever waypoint list it's given, per this file's own header
// comment), so a spiral needs zero changes there — only a waypoint list
// with a lot more points than a straight-segment path, generated here
// rather than hand-typed.
// ---------------------------------------------------------------------------

// Builds a spiral's waypoints by walking its angle from 0 up to
// `turns * 2*Math.PI`, lerping the radius down from the outer ellipse
// (outerRadiusX/Y) to a small circular hole (innerRadius) as it goes —
// elliptical rather than circular so the spiral actually fills the
// 960x640 world's wider-than-tall shape instead of leaving large unused
// margins on the left/right. `pointsPerTurn` controls smoothness (more
// points = a smoother-looking curve, since strokeMapPath only ever draws
// straight lines between consecutive waypoints); ring-to-ring spacing
// here (outer-to-inner radius divided by turns) comfortably exceeds
// pathWidth, so successive loops of the spiral never overlap or cross
// themselves.
function generateSpiralWaypoints(cx, cy, outerRadiusX, outerRadiusY, innerRadius, turns, pointsPerTurn) {
  const totalPoints = Math.round(turns * pointsPerTurn);
  const points = [];
  for (let i = 0; i <= totalPoints; i += 1) {
    const t = i / totalPoints;
    const angle = t * turns * Math.PI * 2;
    const radiusX = outerRadiusX + (innerRadius - outerRadiusX) * t;
    const radiusY = outerRadiusY + (innerRadius - outerRadiusY) * t;
    points.push({ x: cx + Math.cos(angle) * radiusX, y: cy + Math.sin(angle) * radiusY });
  }
  return points;
}

const WHIRLPOOL_CENTER = { x: 480, y: 320 };
// Chosen so the spiral's own outer loop (480±360, 320±230 => x:[120,840],
// y:[90,550]) leaves a comfortable margin on every side for decor, and so
// angle 0's own starting point (840, 320) lines up smoothly with the
// off-canvas lead-in segment below (same straight-line-in-from-the-edge
// convention every other map's own first waypoint uses).
const WHIRLPOOL_WAYPOINTS = [
  { x: 980, y: 320 }, // off-canvas spawn
  ...generateSpiralWaypoints(WHIRLPOOL_CENTER.x, WHIRLPOOL_CENTER.y, 360, 230, 18, 3, 36),
];

// A soft, slowly-darkening radial vignette — lightest at the outer edge,
// darkest right at the central hole — rather than a flat fill, to sell
// "looking down into a whirlpool." theme.renderBackground (see
// fillThemeBackground()/TERRAIN_THEMES below) is a new, OPTIONAL hook on
// top of the existing flat-color theme.background: every other terrain
// still just uses a flat fill (unchanged), only this one theme needs
// something fancier.
function renderWhirlpoolBackground(ctx, width, height) {
  const gradient = ctx.createRadialGradient(
    WHIRLPOOL_CENTER.x, WHIRLPOOL_CENTER.y, 0,
    WHIRLPOOL_CENTER.x, WHIRLPOOL_CENTER.y, 440 // reaches past the spiral's own outer radius, so the vignette covers the whole visible play area
  );
  gradient.addColorStop(0, '#02050a');
  gradient.addColorStop(0.45, '#08192e');
  gradient.addColorStop(1, '#1c4f6b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

// Marks the spiral's own center — the goal enemies walk into — the same
// "the goal gets its own drawn marker" role Savanah's drawTemple() plays.
// Concentric darkening rings (reusing the same "darker toward the middle"
// visual language as the background gradient above, at a tighter, tower-
// icon-adjacent scale) plus a few curling swirl strokes suggesting water
// spinning down into the hole.
// Direct follow-up request ("make this one really shine... extra polish
// into the art/animation"): the swirl strokes now continuously rotate
// (time * 0.8) and gently pulse in brightness, instead of sitting as a
// static painted icon — the one piece of decor a player stares at longest
// (it's the goal every enemy visibly walks into), so it's worth the extra
// motion.
function drawVortexHole(ctx, x, y, size, time = 0) {
  [1, 0.72, 0.46, 0.22].forEach((scale, i) => {
    ctx.fillStyle = i === 3 ? '#000000' : `rgba(2, 8, 15, ${0.5 + i * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(x, y, size * scale, size * scale * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  const pulse = 0.5 + 0.5 * Math.sin(time * 1.5);
  ctx.strokeStyle = `rgba(150, 200, 220, ${0.3 + pulse * 0.2})`;
  ctx.lineWidth = 2;
  [0, 1, 2].forEach((i) => {
    const startAngle = (i / 3) * Math.PI * 2 + time * 0.8;
    ctx.beginPath();
    ctx.arc(x, y, size * (0.9 - i * 0.1), startAngle, startAngle + Math.PI * 1.2);
    ctx.stroke();
  });
}

// A branching coral cluster — a handful of curved stalks fanning up from
// one base, each tipped with a small rounded node.
function drawCoral(ctx, x, y, size) {
  const branches = [-0.5, -0.2, 0.1, 0.4];
  ctx.strokeStyle = '#e07856';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, size * 0.14);
  branches.forEach((lean) => {
    const tipX = x + lean * size;
    const tipY = y - size * (0.8 + Math.abs(lean) * 0.3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * size * 0.5, y - size * 0.5, tipX, tipY);
    ctx.stroke();
  });
  ctx.fillStyle = '#f2a37a';
  branches.forEach((lean) => {
    const tipX = x + lean * size;
    const tipY = y - size * (0.8 + Math.abs(lean) * 0.3);
    ctx.beginPath();
    ctx.arc(tipX, tipY, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Wavy kelp-like blades, same swaying-stroke technique Marshland's own
// drawCattail() uses, just colored green and with no seed head. Now
// actually sways (direct follow-up request for more polish/animation) —
// the whole cluster rocks a few degrees around its own base, x-seeded
// (same "no shared per-instance state needed" trick towers' own idle sway
// already uses) so different clusters don't all swing in lockstep.
function drawSeaweed(ctx, x, y, size, time = 0) {
  const sway = Math.sin(time * 1.1 + x * 0.05) * 0.18;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.translate(-x, -y);

  ctx.strokeStyle = '#1f6b4a';
  ctx.lineCap = 'round';
  [-0.3, 0, 0.3].forEach((lean, i) => {
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.beginPath();
    ctx.moveTo(x + lean * size * 0.4, y);
    ctx.quadraticCurveTo(
      x + lean * size * 0.4 + size * 0.3,
      y - size * 0.6,
      x + lean * size * 0.4 - size * 0.15,
      y - size * (1.1 + i * 0.1)
    );
    ctx.stroke();
  });
  ctx.restore();
}

// Each bubble in the cluster bobs independently (its own sine phase,
// seeded by its own slot index) rather than the whole cluster moving as
// one rigid unit — direct follow-up request for more animation/polish.
// A gentle bob rather than a full rise-and-reset loop deliberately: a
// bubble that drifted up and then snapped back down to restart would
// read as a visible "pop," which a bounded wobble never does.
function drawBubbleCluster(ctx, x, y, r, time = 0) {
  ctx.strokeStyle = 'rgba(200, 230, 255, 0.5)';
  ctx.fillStyle = 'rgba(200, 230, 255, 0.12)';
  ctx.lineWidth = 1.2;
  [[0, 0, 1, 0], [0.6, -0.5, 0.6, 1], [-0.5, -0.3, 0.5, 2], [0.2, -0.9, 0.4, 3]].forEach(([dx, dy, scale, seed]) => {
    const bob = Math.sin(time * 1.6 + seed * 2.1) * 0.12;
    ctx.beginPath();
    ctx.arc(x + dx * r, y + (dy + bob) * r, r * 0.3 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

// Faint, slowly drifting diagonal light bands across the whole water —
// an underwater-sunbeam/caustic-shimmer touch, direct follow-up request
// ("extra polish... overall presentation") for a flashy centerpiece map.
// Drawn over the background gradient but under the path/decor, at very
// low opacity, so it reads as atmosphere rather than competing with
// anything gameplay-relevant.
function renderWhirlpoolCaustics(ctx, width, height, time) {
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#bfe8ff';
  ctx.lineWidth = 18;
  const spacing = 170;
  for (let i = -1; i < Math.ceil((width + 300) / spacing) + 1; i += 1) {
    const x = ((time * 14 + i * spacing) % (width + 300)) - 150;
    ctx.beginPath();
    ctx.moveTo(x, -50);
    ctx.lineTo(x + 220, height + 50);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Whirlpool Easter eggs -------------------------------------------------
// Direct follow-up request: a few small, purely decorative, tucked-away
// discoveries — not load-bearing, nothing a player needs to find, just a
// reward for exploring/looking closely. Placed in the same safe decor
// margins as everything else (see WHIRLPOOL_CORAL's own comment on why
// those margins are provably clear of the spiral).

// A half-buried wreck — a curved hull with planking lines, a snapped
// mast, and one tattered sail remnant.
function drawShipwreck(ctx, x, y, size) {
  ctx.fillStyle = '#3a2a1f';
  ctx.beginPath();
  ctx.ellipse(x, y, size * 1.1, size * 0.42, -0.12, 0, Math.PI, false);
  ctx.fill();

  ctx.strokeStyle = shadeColor('#3a2a1f', -25);
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + i * size * 0.22, y - size * 0.3);
    ctx.lineTo(x + i * size * 0.22, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#2e2318';
  ctx.lineWidth = Math.max(2, size * 0.1);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.3, y - size * 0.25);
  ctx.lineTo(x - size * 0.5, y - size * 1.3);
  ctx.stroke();

  ctx.fillStyle = 'rgba(220, 210, 190, 0.5)';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.5, y - size * 1.3);
  ctx.lineTo(x - size * 0.1, y - size * 1.0);
  ctx.lineTo(x - size * 0.45, y - size * 0.75);
  ctx.closePath();
  ctx.fill();

  // Half-buried sand mound at the base, same visual language as the
  // treasure chest's own (they're meant to read as one "wreck site").
  ctx.fillStyle = 'rgba(200, 180, 140, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.3, size * 1.0, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

// An open chest, half-buried in a sand mound, with a twinkling gold
// glint inside — the twinkle fades in and out rather than blinking, so
// it reads as "catching the light" rather than a UI notification.
function drawTreasureChest(ctx, x, y, size, time = 0) {
  ctx.fillStyle = 'rgba(200, 180, 140, 0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.15, size * 0.65, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#5a3a1f';
  ctx.fillRect(x - size * 0.5, y - size * 0.35, size, size * 0.5);
  ctx.strokeStyle = '#2e1f10';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - size * 0.5, y - size * 0.35, size, size * 0.5);

  ctx.save();
  ctx.translate(x - size * 0.5, y - size * 0.35);
  ctx.rotate(-0.3);
  ctx.fillStyle = '#6b4a2a';
  ctx.beginPath();
  ctx.ellipse(size * 0.5, 0, size * 0.5, size * 0.22, 0, Math.PI, 0, true);
  ctx.fill();
  ctx.restore();

  const twinkle = 0.35 + 0.55 * Math.max(0, Math.sin(time * 2.3));
  ctx.fillStyle = `rgba(255, 215, 0, ${twinkle})`;
  ctx.beginPath();
  ctx.arc(x, y - size * 0.12, size * 0.13, 0, Math.PI * 2);
  ctx.fill();
}

// A sealed bottle resting on the seafloor with a visible scroll inside,
// marked with an "X" — the player's own tiny "X marks the spot" joke,
// paired thematically with the wreck/chest nearby but placed well apart
// from them so it's its own separate little discovery.
function drawMessageBottle(ctx, x, y, size) {
  ctx.fillStyle = 'rgba(74, 155, 120, 0.7)';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.2, y + size * 0.6);
  ctx.quadraticCurveTo(x - size * 0.3, y, x - size * 0.12, y - size * 0.3);
  ctx.lineTo(x - size * 0.08, y - size * 0.55);
  ctx.lineTo(x + size * 0.08, y - size * 0.55);
  ctx.lineTo(x + size * 0.12, y - size * 0.3);
  ctx.quadraticCurveTo(x + size * 0.3, y, x + size * 0.2, y + size * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shadeColor('#4a9b78', -20);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#c9a06a';
  ctx.fillRect(x - size * 0.07, y - size * 0.68, size * 0.14, size * 0.14);

  ctx.fillStyle = 'rgba(240, 230, 210, 0.9)';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.05, size * 0.1, size * 0.22, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8b1a1a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.04, y - size * 0.02);
  ctx.lineTo(x + size * 0.04, y + size * 0.1);
  ctx.moveTo(x + size * 0.04, y - size * 0.02);
  ctx.lineTo(x - size * 0.04, y + size * 0.1);
  ctx.stroke();
}

// A tiny cameo: one of Deep Forest's own Ants, on vacation, snorkeling
// goggles and all, perched on a little rock — a small cross-map wink for
// anyone who's played the other maps, not referencing anything that
// needs to be recognized to still read as "a tiny ant wearing goggles,"
// which is funny on its own.
function drawSnorkelAnt(ctx, x, y, size) {
  ctx.fillStyle = OCEAN_ROCK_COLOR;
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.3, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2e2018';
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.26, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x - size * 0.28, y, size * 0.16, size * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#2e2018';
  ctx.lineWidth = 1;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(x, y + side * size * 0.1);
    ctx.lineTo(x + size * 0.15, y + side * size * 0.3);
    ctx.stroke();
  });

  ctx.fillStyle = '#9ec7e0';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + size * 0.18, y - size * 0.05, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#e0533d';
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.22, y - size * 0.15);
  ctx.lineTo(x + size * 0.3, y - size * 0.55);
  ctx.stroke();
}

// A loose boulder cluster, same layered-ellipse technique as Savanah's own
// drawSandstoneFormation(), recolored to a cool slate-gray so it reads as
// ocean-floor rock rather than desert stone.
const OCEAN_ROCK_COLOR = '#4a5560';

function drawOceanRock(ctx, x, y, r) {
  ctx.fillStyle = OCEAN_ROCK_COLOR;
  [[-0.3, 0.1, 1], [0.3, 0.15, 0.75], [0, -0.25, 0.6]].forEach(([dx, dy, scale]) => {
    ctx.beginPath();
    ctx.ellipse(x + dx * r, y + dy * r, r * 0.5 * scale, r * 0.38 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = shadeColor(OCEAN_ROCK_COLOR, 18);
  ctx.beginPath();
  ctx.ellipse(x - r * 0.1, y - r * 0.3, r * 0.25, r * 0.15, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawShell(ctx, x, y, size) {
  ctx.fillStyle = '#f0d9c0';
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.5);
  for (let i = 0; i <= 6; i += 1) {
    const angle = -Math.PI / 2 + (i / 6) * Math.PI;
    ctx.lineTo(x + Math.cos(angle) * size * 0.5, y + Math.sin(angle) * size * 0.5 + size * 0.1);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shadeColor('#f0d9c0', -25);
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i += 1) {
    const angle = -Math.PI / 2 + (i / 6) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.1);
    ctx.lineTo(x + Math.cos(angle) * size * 0.5, y + Math.sin(angle) * size * 0.5 + size * 0.1);
    ctx.stroke();
  }
}

// Hand-placed in the four margins OUTSIDE the spiral's own elliptical
// extent (x:[120,840], y:[90,550], per WHIRLPOOL_WAYPOINTS' own comment)
// rather than threaded between individual loops of the spiral — far
// simpler to verify clear of the path than checking distance-to-segment
// against a few dozen spiral waypoints by hand, and these margins are
// comfortably wide (x<100/x>860 are clear at every y; y<70/y>570 are
// clear at every x). The one exception needing its own check: the
// off-canvas lead-in segment runs along y=320 for x in [840,980], so the
// right-margin items below are kept away from y=320 by a wide buffer.
const WHIRLPOOL_CORAL = [
  { x: 160, y: 35, size: 20 }, { x: 700, y: 30, size: 22 },
  { x: 220, y: 610, size: 20 }, { x: 760, y: 605, size: 22 },
  { x: 910, y: 150, size: 20 }, { x: 900, y: 500, size: 22 },
];

const WHIRLPOOL_SEAWEED = [
  { x: 40, y: 160, size: 24 }, { x: 55, y: 460, size: 22 },
  { x: 380, y: 615, size: 20 }, { x: 630, y: 618, size: 22 },
];

const WHIRLPOOL_ROCKS = [
  { x: 420, y: 25, r: 26 }, { x: 35, y: 300, r: 28 },
  { x: 930, y: 90, r: 26 }, { x: 500, y: 625, r: 28 },
];

const WHIRLPOOL_BUBBLES = [
  { x: 280, y: 20, r: 16 }, { x: 560, y: 15, r: 14 },
  { x: 65, y: 90, r: 15 }, { x: 70, y: 560, r: 16 },
  { x: 935, y: 220, r: 15 }, { x: 890, y: 570, r: 16 },
  { x: 140, y: 595, r: 14 },
];

const WHIRLPOOL_SHELLS = [
  { x: 45, y: 240, size: 18 }, { x: 490, y: 40, size: 16 }, { x: 915, y: 440, size: 18 },
];

// Easter eggs (direct follow-up request): small, purely decorative,
// tucked-away discoveries — never load-bearing, nothing a player needs to
// find to progress. The shipwreck and treasure chest sit near each other
// as one "wreck site" (bottom-left corner); the message bottle and the
// snorkeling ant cameo are placed well apart from that and from each
// other, so they read as separate finds rather than one cluster.
const WHIRLPOOL_SHIPWRECK = { x: 70, y: 605, size: 32 };
const WHIRLPOOL_TREASURE_CHEST = { x: 120, y: 628, size: 26 };
const WHIRLPOOL_MESSAGE_BOTTLE = { x: 65, y: 350, size: 22 };
const WHIRLPOOL_SNORKEL_ANT = { x: 820, y: 45, size: 24 };

const WHIRLPOOL_DECOR = {
  coral: WHIRLPOOL_CORAL,
  seaweed: WHIRLPOOL_SEAWEED,
  rocks: WHIRLPOOL_ROCKS,
  bubbles: WHIRLPOOL_BUBBLES,
  shells: WHIRLPOOL_SHELLS,
  vortex: WHIRLPOOL_CENTER,
  shipwreck: WHIRLPOOL_SHIPWRECK,
  treasureChest: WHIRLPOOL_TREASURE_CHEST,
  messageBottle: WHIRLPOOL_MESSAGE_BOTTLE,
  snorkelAnt: WHIRLPOOL_SNORKEL_ANT,
};

function renderOceanDecor(ctx, decor, time = 0) {
  decor.rocks.forEach((rock) => drawOceanRock(ctx, rock.x, rock.y, rock.r));
  decor.seaweed.forEach((kelp) => drawSeaweed(ctx, kelp.x, kelp.y, kelp.size, time));
  decor.coral.forEach((piece) => drawCoral(ctx, piece.x, piece.y, piece.size));
  decor.shells.forEach((shell) => drawShell(ctx, shell.x, shell.y, shell.size));
  decor.bubbles.forEach((cluster) => drawBubbleCluster(ctx, cluster.x, cluster.y, cluster.r, time));
  drawShipwreck(ctx, decor.shipwreck.x, decor.shipwreck.y, decor.shipwreck.size);
  drawTreasureChest(ctx, decor.treasureChest.x, decor.treasureChest.y, decor.treasureChest.size, time);
  drawMessageBottle(ctx, decor.messageBottle.x, decor.messageBottle.y, decor.messageBottle.size);
  drawSnorkelAnt(ctx, decor.snorkelAnt.x, decor.snorkelAnt.y, decor.snorkelAnt.size);
  drawVortexHole(ctx, decor.vortex.x, decor.vortex.y, 46, time);
}

// A sandy, lighter-teal pair — reads clearly as an ocean-floor trench
// against the dark-to-light blue vignette background, distinct from every
// other terrain's own path coloring.
const WHIRLPOOL_PATH_COLORS = { outline: '#0a1f2e', fill: '#3d7a6e' };

// ---------------------------------------------------------------------------
// Terrain: Tundra (direct request) — a snowy Hard-tier map. Originally
// shipped with two spawns converging on one shared ice-cave goal (the
// shape Savanah's own two paths ORIGINALLY had — commit 2189bc6 — before
// a direct follow-up request asked for this map's two paths to be fully
// separate instead, "like Forest or Marsh": each path is really its own
// single-path route glued next to the other, with its own independent
// ice cave, never merging, overlapping, or running alongside each other
// anywhere. Also deliberately the first terrain with a BRIGHT background
// (every other map's is dark) — snow reads naturally as pale/bright, and
// it doubles as real visual variety against five increasingly dark-toned
// maps in a row.
// ---------------------------------------------------------------------------

// A simple 3-tier snowman — biggest ball at the base, shrinking upward,
// with coal-dot eyes/buttons, a small orange carrot-triangle nose, and two
// thin stick arms. Purely decorative, same role every other terrain's own
// "signature" decor piece (Deep Forest's trees, Savanah's cacti) plays.
function drawSnowman(ctx, x, y, size) {
  // Real bug (user report): the previous version computed each ball's
  // center as `y - ballY + r`, which actually put the BIGGEST ball
  // highest up and the SMALLEST ball lowest — an upside-down snowman.
  // Fixed by stacking from the ground up explicitly: the base ball's
  // center sits `r` above the ground (y), and each ball above that sits
  // with its own center `r(below) + r(this)` above the ball below it, so
  // biggest-at-bottom/smallest-at-top is true by construction instead of
  // by coincidence.
  const radii = [0.5, 0.36, 0.22].map((f) => size * f);
  const centers = [y - radii[0]];
  for (let i = 1; i < radii.length; i += 1) {
    centers.push(centers[i - 1] - radii[i - 1] - radii[i]);
  }
  const [baseY, midY, headY] = centers;
  const [, midR, headR] = radii;

  ctx.fillStyle = '#f0f6fa';
  ctx.strokeStyle = shadeColor('#f0f6fa', -18);
  ctx.lineWidth = 1.5;
  radii.forEach((r, i) => {
    ctx.beginPath();
    ctx.arc(x, centers[i], r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Stick arms, attached at the middle ball's own vertical center,
  // angled outward and slightly up.
  ctx.strokeStyle = '#4a3326';
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(x, midY);
    ctx.lineTo(x + side * size * 0.5, midY - size * 0.13);
    ctx.stroke();
  });

  // Coal eyes on the head, buttons down the middle ball.
  ctx.fillStyle = '#2b2420';
  [-0.13, 0.13].forEach((dx) => {
    ctx.beginPath();
    ctx.arc(x + dx * size, headY - headR * 0.15, size * 0.04, 0, Math.PI * 2);
    ctx.fill();
  });
  [-0.3, 0, 0.3].forEach((t) => {
    ctx.beginPath();
    ctx.arc(x, midY + t * midR, size * 0.035, 0, Math.PI * 2);
    ctx.fill();
  });

  // Carrot nose, poking out from the head.
  ctx.fillStyle = '#e8822e';
  ctx.beginPath();
  ctx.moveTo(x, headY);
  ctx.lineTo(x + size * 0.22, headY + size * 0.04);
  ctx.lineTo(x, headY + size * 0.08);
  ctx.closePath();
  ctx.fill();
}

// A small cluster of jagged, semi-translucent ice shards jutting up at
// slightly different heights/angles — reads as "sharp" rather than the
// soft, rounded snowman/boulders around it.
function drawIceSpike(ctx, x, y, size) {
  [[-0.3, 1, -0.08], [0, 1.3, 0], [0.3, 0.85, 0.1]].forEach(([dx, scale, tilt]) => {
    const h = size * scale;
    ctx.save();
    ctx.translate(x + dx * size, y);
    ctx.rotate(tilt);
    ctx.fillStyle = 'rgba(190, 225, 240, 0.85)';
    ctx.beginPath();
    ctx.moveTo(-size * 0.16, 0);
    ctx.lineTo(0, -h);
    ctx.lineTo(size * 0.16, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.restore();
  });
}

// Loose boulders dusted with snow — the same layered-ellipse-cluster
// construction as Savanah's drawSandstoneFormation, just a cold grey-blue
// body with a bright white snow-cap highlight instead of a warm tan one.
const SNOW_BOULDER_COLOR = '#7a8a96';

function drawSnowBoulder(ctx, x, y, r) {
  ctx.fillStyle = SNOW_BOULDER_COLOR;
  [[-0.4, 0.1, 1], [0.3, 0.2, 0.8], [0, -0.3, 0.65]].forEach(([dx, dy, scale]) => {
    ctx.beginPath();
    ctx.ellipse(x + dx * r, y + dy * r, r * 0.55 * scale, r * 0.4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#f0f6fa';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.1, y - r * 0.42, r * 0.32, r * 0.16, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

// Marks one of Tundra's two independent goals (each path ends at its own
// — see TUNDRA_DECOR's own comment): a rounded snow-mound with a dark
// arched cave mouth carved into it and a couple of icicles hanging from
// the top of the arch — the same "the goal gets its own drawn landmark"
// role Savanah's drawTemple()/Whirlpool's drawVortexHole() play.
function drawIceCave(ctx, x, y, size) {
  ctx.fillStyle = '#dce9f0';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.25, size, size * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#17222b';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.32, size * 0.42, size * 0.4, 0, Math.PI, 0, false);
  ctx.fill();

  ctx.strokeStyle = '#eef6fa';
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  [-0.42, 0.42].forEach((dx) => {
    ctx.beginPath();
    ctx.moveTo(x + dx * size, y - size * 0.05);
    ctx.lineTo(x + dx * size * 0.75, y + size * 0.3);
    ctx.stroke();
  });

  ctx.fillStyle = 'rgba(210, 235, 245, 0.8)';
  [-0.2, 0, 0.2].forEach((dx) => {
    ctx.beginPath();
    ctx.moveTo(x + dx * size, y - size * 0.08);
    ctx.lineTo(x + dx * size - size * 0.04, y + size * 0.12);
    ctx.lineTo(x + dx * size + size * 0.04, y + size * 0.12);
    ctx.closePath();
    ctx.fill();
  });
}

// Direct follow-up request: the user wants Tundra's two paths FULLY
// separate, "like Forest or Marsh" — i.e. each path is really its own
// single-path map glued next to the other, with its own independent
// goal, not two routes converging on one shared cave (the shape this map
// originally shipped with). Path A's own route and ice cave are
// unchanged. Path B's last leg used to continue west all the way to
// (480, 320) to meet Path A there; it now continues straight south past
// that same (650, 320) corner instead, to its own separate ice cave —
// same "extend the existing corner into fresh territory rather than
// inventing a whole new turn" minimal change Savanah's own fully-
// separate-goals follow-up used for its Path B.
const TUNDRA_PATH_A = [
  { x: -20, y: 220 },
  { x: 300, y: 220 },
  { x: 300, y: 420 },
  { x: 480, y: 420 },
  { x: 480, y: 320 },
];
const TUNDRA_PATH_B = [
  { x: 980, y: 120 },
  { x: 650, y: 120 },
  { x: 650, y: 320 },
  { x: 650, y: 480 },
];

// Hand-placed clear of both paths above (checked against every segment of
// each, same convention as every other terrain's decor). Three items
// were repositioned (from 600,420 / 600,580 / unmoved otherwise) when
// Path B's new final leg and its own ice cave landed at (650, 320)-
// (650, 480) — they used to sit in open ground near that corner and
// ended up too close to the new path/cave.
const TUNDRA_SNOWMEN = [
  { x: 130, y: 500, size: 30 }, { x: 800, y: 480, size: 28 },
  { x: 860, y: 220, size: 26 }, { x: 150, y: 90, size: 28 },
];

const TUNDRA_ICE_SPIKES = [
  { x: 60, y: 350, size: 24 }, { x: 420, y: 60, size: 22 }, { x: 700, y: 50, size: 26 },
  { x: 900, y: 380, size: 24 }, { x: 900, y: 580, size: 22 }, { x: 380, y: 590, size: 26 },
  { x: 520, y: 420, size: 22 }, { x: 150, y: 300, size: 24 },
];

const TUNDRA_BOULDERS = [
  { x: 60, y: 600, r: 32 }, { x: 870, y: 50, r: 30 }, { x: 900, y: 500, r: 34 },
  { x: 550, y: 560, r: 28 }, { x: 150, y: 150, r: 32 }, { x: 350, y: 500, r: 28 },
];

// Each path now ends at its own independent ice cave (direct follow-up
// request — see TUNDRA_PATH_A/B's own comment for why) rather than one
// shared goal both paths converged on — same "own named fields, not one
// array" convention Savanah's own two temples use, for the same reason
// (each stays visibly paired with the path it belongs to in this file).
const TUNDRA_CAVE_A = { x: 480, y: 320, size: 72 };
const TUNDRA_CAVE_B = { x: 650, y: 480, size: 72 };

const TUNDRA_DECOR = {
  snowmen: TUNDRA_SNOWMEN,
  iceSpikes: TUNDRA_ICE_SPIKES,
  boulders: TUNDRA_BOULDERS,
  caves: [TUNDRA_CAVE_A, TUNDRA_CAVE_B],
};

function renderTundraDecor(ctx, decor) {
  decor.boulders.forEach((rock) => drawSnowBoulder(ctx, rock.x, rock.y, rock.r));
  decor.iceSpikes.forEach((spike) => drawIceSpike(ctx, spike.x, spike.y, spike.size));
  decor.snowmen.forEach((snowman) => drawSnowman(ctx, snowman.x, snowman.y, snowman.size));
  decor.caves.forEach((cave) => drawIceCave(ctx, cave.x, cave.y, cave.size));
}

// A worn, dark slate-blue pair — reads clearly as packed-ice tracks
// against the pale snow background, the inverse contrast of every other
// terrain (a dark path on light ground, instead of a light path on dark
// ground).
const TUNDRA_PATH_COLORS = { outline: '#2e3d47', fill: '#7fa3b8' };

// ---------------------------------------------------------------------------
// Volcanic (direct request): a Hard-tier map with an obsidian floor and a
// single glowing magma path. The one genuinely new mechanic here is
// `decor.magmaPools` — open-ground lava hazards that are NOT part of the
// enemy path but are still off-limits for tower placement (see
// isPointInMagmaPool() below and its two call sites in game.js). Every
// other decor array on every map before this one has been pure rendering
// data with zero gameplay effect; magma pools are the first decor type
// that's also consulted by the placement-validity check.
//
// A single path (like Deep Forest/Marshland), not two like Savanah/
// Tundra — nothing in the request asked for a second path, and a single
// long winding route gives towers plenty of exposure per enemy, avoiding
// the exact mistake Tundra's own (since-nerfed) short paths made feeling
// "impossible" (see TUNDRA_ROSTER's own comment in enemies.js). At ~1980px
// this path is roughly 2.5x Tundra's original length and comfortably
// longer than Whirlpool's own spiral is short of — long enough that
// VOLCANIC_ROSTER (enemies.js) could safely be calibrated at Tundra's own
// post-nerf, below-Whirlpool baseline without repeating that mistake.
const VOLCANIC_WAYPOINTS = [
  { x: -20, y: 80 }, // off-canvas spawn
  { x: 200, y: 80 },
  { x: 200, y: 560 },
  { x: 480, y: 560 },
  { x: 480, y: 160 },
  { x: 760, y: 160 },
  { x: 760, y: 480 }, // ends at the lava vent goal, on-canvas
];

// A dark, cracked-obsidian outline around a bright, hot-orange magma
// fill — the literal "magma path" the request asked for, the inverse of
// every other terrain's muted path (this one is the single brightest
// thing on the whole map, which is the point: it should read as
// dangerously hot against the near-black ground around it).
const VOLCANIC_PATH_COLORS = { outline: '#2b150c', fill: '#e8540f' };

// Hand-placed clear of VOLCANIC_WAYPOINTS above (checked segment-by-segment
// against every leg, same convention as every other terrain's decor — see
// e.g. TUNDRA_SNOWMEN's own comment). Purely decorative; see
// VOLCANIC_MAGMA_POOLS further down for the one decor array here that
// ALSO has a gameplay effect.
const VOLCANIC_OBSIDIAN_ROCKS = [
  { x: 60, y: 300, r: 30 }, { x: 850, y: 60, r: 28 }, { x: 900, y: 580, r: 32 },
  { x: 60, y: 550, r: 28 }, { x: 900, y: 120, r: 26 }, { x: 550, y: 50, r: 24 },
];

const VOLCANIC_ASH_VENTS = [
  { x: 300, y: 480, r: 16 }, { x: 700, y: 550, r: 18 },
  { x: 420, y: 100, r: 16 }, { x: 870, y: 420, r: 16 },
];

// The actual no-build hazard (direct request: "magma pools where towers
// cant be placed for the enemies"). Scattered across open interior
// pockets, each one checked clear of every path segment by at least its
// own radius plus a real margin (not just the bare path-width check
// isPointOnPath uses for the path itself) so a pool never reads as
// touching the magma path visually. isPointInMagmaPool() below is the
// actual placement-blocking check; this array is the data it reads.
const VOLCANIC_MAGMA_POOLS = [
  { x: 340, y: 350, r: 42 },
  { x: 620, y: 300, r: 40 },
  { x: 120, y: 460, r: 36 },
  { x: 650, y: 420, r: 38 },
  { x: 850, y: 300, r: 34 },
];

// Marks Volcanic's single goal (direct follow-up of drawLavaVent further
// down) — same "own named field" convention Tundra's TUNDRA_CAVE_A/B and
// Savanah's two temples use for the exact point every enemy walks into.
const VOLCANIC_GOAL_VENT = { x: 760, y: 480, size: 70 };

const VOLCANIC_DECOR = {
  obsidianRocks: VOLCANIC_OBSIDIAN_ROCKS,
  ashVents: VOLCANIC_ASH_VENTS,
  magmaPools: VOLCANIC_MAGMA_POOLS,
  goal: VOLCANIC_GOAL_VENT,
};

// Same layered-ellipse-cluster body Tundra's drawSnowBoulder/Savanah's
// drawSandstoneFormation use, just a near-black obsidian body with a
// sharp, narrow glassy-sheen streak instead of either's soft matte
// highlight — obsidian's own real distinguishing trait is that glossy,
// almost mirror-like sheen.
const OBSIDIAN_ROCK_COLOR = '#1c1410';

function drawObsidianRock(ctx, x, y, r) {
  ctx.fillStyle = OBSIDIAN_ROCK_COLOR;
  [[-0.4, 0.1, 1], [0.3, 0.2, 0.8], [0, -0.3, 0.65]].forEach(([dx, dy, scale]) => {
    ctx.beginPath();
    ctx.ellipse(x + dx * r, y + dy * r, r * 0.55 * scale, r * 0.4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(180, 160, 190, 0.5)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.15, y - r * 0.4, r * 0.18, r * 0.06, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

// A small cracked vent in the obsidian with a faint, slowly rising wisp of
// ash-grey smoke — purely decorative (unlike drawMagmaPool below, this
// doesn't block tower placement), the same "sells the theme without being
// a hazard" role Tundra's ice spikes/Savanah's cacti play. `time` drifts
// the smoke sideways a little and rises it continuously, the same
// Whirlpool-pioneered "decor can animate" convention (see renderMap()'s
// own comment on the `time` parameter).
function drawAshVent(ctx, x, y, r, time = 0) {
  ctx.fillStyle = '#2a1f1a';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a2e1c';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.55, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  const drift = Math.sin(time * 0.6 + x) * r * 0.2;
  ctx.fillStyle = 'rgba(160, 155, 150, 0.35)';
  [0, 1, 2].forEach((i) => {
    const t = i / 3;
    ctx.beginPath();
    ctx.arc(x + drift * t, y - r * (0.6 + t * 1.4), r * (0.35 - t * 0.08), 0, Math.PI * 2);
    ctx.fill();
  });
}

// The no-build hazard's own paint (isPointInMagmaPool below is the actual
// gameplay block — this is only the visual). A pulsing glow — same
// Math.sin(time * …) technique Whirlpool's drawVortexHole uses for its
// own goal marker — so it reads as genuinely active, roiling lava rather
// than a flat orange decal sitting on the ground.
function drawMagmaPool(ctx, x, y, r, time = 0) {
  ctx.fillStyle = '#2a0f06';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.08, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();

  const pulse = 0.5 + 0.5 * Math.sin(time * 2 + x * 0.05);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, `rgba(255, ${210 + Math.round(pulse * 30)}, 120, 0.9)`);
  gradient.addColorStop(0.55, `rgba(232, 84, 15, ${0.85 + pulse * 0.1})`);
  gradient.addColorStop(1, 'rgba(120, 30, 10, 0.9)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, r * (0.9 + pulse * 0.08), r * (0.65 + pulse * 0.06), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(20, 10, 8, ${0.5 + pulse * 0.2})`;
  ctx.lineWidth = Math.max(1, r * 0.06);
  [0, 1, 2].forEach((i) => {
    const angle = (i / 3) * Math.PI * 2 + time * 0.3;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * r * 0.2, y + Math.sin(angle) * r * 0.15);
    ctx.lineTo(x + Math.cos(angle) * r * 0.7, y + Math.sin(angle) * r * 0.5);
    ctx.stroke();
  });
}

// Marks Volcanic's single goal — the fissure every enemy walks into — the
// same "the goal gets its own drawn landmark" role Tundra's drawIceCave()/
// Savanah's drawTemple()/Whirlpool's drawVortexHole() play: a jagged dark
// crater rim around a bright, pulsing lava throat.
function drawLavaVent(ctx, x, y, size, time = 0) {
  ctx.fillStyle = '#1a0f0a';
  ctx.beginPath();
  ctx.ellipse(x, y, size, size * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#3a2418';
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.92, size * 0.58, 0, 0, Math.PI * 2);
  ctx.stroke();

  const pulse = 0.5 + 0.5 * Math.sin(time * 1.8);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 0.7);
  gradient.addColorStop(0, 'rgba(255, 230, 150, 0.95)');
  gradient.addColorStop(0.5, `rgba(235, 90, 20, ${0.85 + pulse * 0.1})`);
  gradient.addColorStop(1, 'rgba(90, 20, 8, 0.9)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, size * (0.58 + pulse * 0.06), size * (0.4 + pulse * 0.04), 0, 0, Math.PI * 2);
  ctx.fill();
}

function renderVolcanicDecor(ctx, decor, time = 0) {
  decor.obsidianRocks.forEach((rock) => drawObsidianRock(ctx, rock.x, rock.y, rock.r));
  decor.ashVents.forEach((vent) => drawAshVent(ctx, vent.x, vent.y, vent.r, time));
  decor.magmaPools.forEach((pool) => drawMagmaPool(ctx, pool.x, pool.y, pool.r, time));
  drawLavaVent(ctx, decor.goal.x, decor.goal.y, decor.goal.size, time);
}

// ---------------------------------------------------------------------------
// Caves (direct request, relayed from the peer session, from 3 reference
// photos the session couldn't pass directly — a written description was
// given instead): a dark, enclosed cave interior — mostly near-black
// background rock, lit almost entirely by glowing multi-colored crystal
// clusters (cyan/magenta/green, angular/faceted, not smooth) rather than
// ambient light, plus warm amber-brown stalactites/stalagmites scattered
// through as a deliberate warm/earthy contrast against the neon crystals.
// The one genuinely new idea here: the request specifically asked for the
// PATH ITSELF to be a flowing water channel the enemies walk/swim
// through — "visually distinct from Marshland's puddle/pond water" (that
// request's own words) — so CAVES_PATH_COLORS below is its own dark,
// cool teal fill, unlike every other map's solid-ground path (dirt/
// magma/ice/sand) and unlike Marshland's own muddy-green puddles (those
// are still just decor, not the path).
//
// A direct follow-up request (user feedback: the path originally read
// "too bright/light," and wanted it to actually look like flowing water
// rather than a flat fill) darkened CAVES_PATH_COLORS below and added
// renderCavesPathEffects — an animated overlay of moving ripple bands and
// current highlight streaks, via the new optional theme.renderPathEffects
// hook (see TERRAIN_THEMES' own comment and renderMap()/
// renderMapPreview()'s own calls to it) — the same "new, OPTIONAL hook,
// every other theme is unaffected" pattern renderWaterEffects already
// established for Whirlpool's own drifting caustics.
//
// A second direct follow-up request gave the path its own unique
// topology: a single path that FORKS into 2 branches for a stretch, then
// REJOINS into one path again before the shared goal — not used by any
// other map (Savanah/Tundra have 2 fully INDEPENDENT paths with separate
// goals; every other map is one single path with no branching at all).
// Built as CAVES_PATH_A/CAVES_PATH_B below — 2 ordinary waypoint arrays,
// the exact same mechanism every multi-path map already uses for enemy
// spawning/placement/rendering — that happen to share IDENTICAL leading
// waypoints (the shared entry segment, spawn to the fork point) and
// IDENTICAL trailing waypoints (the shared segment from the merge point
// into the goal), diverging only in their own middle section. Nothing
// about the engine needed to change: createEnemyInstance() already rolls
// a random pathIndex per enemy (same as Savanah), isPointOnPath()/
// renderMap() already check/draw every path in MAP_PATHS generically,
// and getLastLeakedEnemies()/updateEnemies() already detect "reached the
// end of MY OWN path" per-enemy via enemy.pathIndex — so visually and
// mechanically this reads as "one path that splits and rejoins" even
// though under the hood it's still 2 waypoint arrays, exactly per the
// request's own suggested implementation. Where both arrays share the
// exact same coordinates (the entry/exit segments), drawing both is
// pixel-identical to drawing one — renderMap()'s own "all outlines then
// all fills" ordering (see its own comment) is what keeps the fork and
// merge points themselves reading as clean rounded junctions rather than
// a seam, the same mechanism that already made Savanah's old shared-
// temple convergence (see SAVANAH_PATH_A/B's own history above) read
// cleanly before that map moved to fully separate goals.
//
// The two branches bulge left/right by only 100px from the shared fork/
// merge centerline (x=240 and x=440, a 200px gap) — close enough that a
// tower placed in the gap between them (most towers' base range is well
// past 150px) can meaningfully hit enemies on EITHER branch, per the
// request's own explicit requirement ("don't make them so far apart that
// it trivially requires double the towers"), while still being clearly
// 2 separate, visually distinct lanes rather than looking like one wide
// path (pathWidth 56 leaves a wide-open ~90px gap of clear ground between
// the two branches' own strokes).
// ---------------------------------------------------------------------------

const CAVES_PATH_A = [
  { x: -20, y: 320 }, // off-canvas spawn — shared entry, identical to Path B
  { x: 160, y: 320 },
  { x: 160, y: 120 },
  { x: 340, y: 120 }, // the fork point — both branches start diverging right after this exact waypoint
  { x: 240, y: 200 }, // Path A's own branch: bulges left
  { x: 240, y: 400 },
  { x: 340, y: 480 }, // the merge point — both branches rejoin at this exact waypoint
  { x: 620, y: 480 }, // shared exit, identical to Path B
  { x: 620, y: 220 },
  { x: 860, y: 220 }, // ends at the crystal pool goal, on-canvas
];

const CAVES_PATH_B = [
  { x: -20, y: 320 },
  { x: 160, y: 320 },
  { x: 160, y: 120 },
  { x: 340, y: 120 }, // the same fork point as Path A
  { x: 440, y: 200 }, // Path B's own branch: bulges right instead of left
  { x: 440, y: 400 },
  { x: 340, y: 480 }, // the same merge point as Path A
  { x: 620, y: 480 },
  { x: 620, y: 220 },
  { x: 860, y: 220 },
];

// A near-black, wet-rock outline around a dark, moody teal fill —
// REVISED on direct follow-up request ("make the water path darker, it
// currently reads too bright/light") from an original brighter cyan
// ('#2fb8c9') that read as too light against the cave floor. Still
// clearly a cool-toned water color (distinct from the warm amber-brown
// cave floor/formations below), just a deep, dim teal now rather than a
// glowing bright one — renderCavesPathEffects below is what actually
// carries the "glowing/flowing" read now, layered on top of this darker
// base rather than the flat fill alone trying to do both jobs at once.
const CAVES_PATH_COLORS = { outline: '#070f10', fill: '#1b5560' };

// Hand-placed clear of CAVES_PATH_A/CAVES_PATH_B above (checked segment-
// by-segment against every leg of both, same convention as every other
// terrain's decor). Varied neon colors per the request's own description
// ("bright cyan/teal... vivid magenta/pink... bright green... so the
// cave reads as colorful and otherworldly rather than monochrome")
// rather than one repeated color.
const CAVES_CRYSTALS = [
  { x: 70, y: 60, size: 30, color: '#2fe8ff' },
  { x: 900, y: 500, size: 34, color: '#ff3fd0' },
  { x: 300, y: 580, size: 26, color: '#3ef07a' },
  { x: 560, y: 60, size: 28, color: '#2fe8ff' },
  { x: 850, y: 90, size: 24, color: '#ff3fd0' },
  { x: 100, y: 520, size: 30, color: '#3ef07a' },
];

// Warm amber-brown pointed mineral formations (the request's own 3rd
// reference photo — a real limestone cave) — a deliberate warm/earthy
// contrast against the crystals' neon palette, per the request's own
// wording. `hanging: true` is purely cosmetic (drawCaveFormation below
// gives it a soft ground shadow to read as a stalactite hanging from the
// ceiling rather than a stalagmite rising from the floor) — both share
// the same spike silhouette either way, same "one shared shape, a small
// flag picks the detail" convention every other terrain's own decor
// variants already use (e.g. Volcanic's `crested`/`snoutColor`). Two of
// these (originally at (250,250) and (130,450)) were repositioned when
// the fork/merge follow-up introduced CAVES_PATH_A/B's own two branches —
// both used to sit in open ground that the new left branch (running down
// x=240) or the shared entry's own vertical leg (x=160) now actually
// passes through.
const CAVES_FORMATIONS = [
  { x: 90, y: 80, size: 22, hanging: true },
  { x: 480, y: 550, size: 26, hanging: false },
  { x: 750, y: 350, size: 20, hanging: true },
  { x: 110, y: 450, size: 24, hanging: false },
  { x: 600, y: 100, size: 18, hanging: true },
  { x: 350, y: 560, size: 22, hanging: false },
];

// Marks Caves' single goal — a glowing crystal-rimmed pool where the
// flowing-water path finally empties out — same "the goal gets its own
// drawn landmark" role every other map's own goal marker plays.
const CAVES_GOAL = { x: 860, y: 220, size: 70 };

const CAVES_DECOR = {
  crystals: CAVES_CRYSTALS,
  formations: CAVES_FORMATIONS,
  goal: CAVES_GOAL,
};

// Reused for both the scattered mineral formations and the crystal pool
// goal's own rim shards — a single spike silhouette (a triangle plus a
// thin center ridge line and a small highlight drip), warm amber-brown.
// `hanging` adds a soft dark ground shadow beneath, read as "this one
// hangs from the ceiling" rather than rising from the floor.
function drawCaveFormation(ctx, x, y, size, hanging) {
  if (hanging) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + size * 0.3, size * 0.5, size * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const formationColor = '#8a6a3a';
  ctx.fillStyle = formationColor;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.4, y + size * 0.5);
  ctx.lineTo(x, y - size * 0.9);
  ctx.lineTo(x + size * 0.4, y + size * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = shadeColor(formationColor, -25);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.9);
  ctx.lineTo(x - size * 0.05, y + size * 0.5);
  ctx.stroke();

  ctx.fillStyle = shadeColor(formationColor, 25);
  ctx.beginPath();
  ctx.ellipse(x - size * 0.1, y - size * 0.2, size * 0.08, size * 0.22, 0.15, 0, Math.PI * 2);
  ctx.fill();
}

// Angular, faceted crystal spikes (the request's own called-out trait:
// "visible jagged/angular facet edges, not smooth rounded shapes") —
// a cluster of 3 varying-height diamond-cut spikes rather than one, so
// each cluster reads as a real jutting formation instead of a single
// gem. Glows from within via shadowBlur (same technique fireflies/
// Infect Path's own stun glow already use elsewhere in this codebase),
// gently pulsing so the cave reads as genuinely lit by them rather than
// a flat decal.
function drawGlowingCrystal(ctx, x, y, size, color, time = 0) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 1.5 + x * 0.05);

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 + pulse * 8;
  ctx.fillStyle = color;
  [[-0.35, 1, 0.8], [0, 1.3, 1], [0.35, 0.9, 0.7]].forEach(([dx, height, width]) => {
    ctx.beginPath();
    ctx.moveTo(x + dx * size, y + size * 0.4);
    ctx.lineTo(x + dx * size - size * 0.16 * width, y - size * 0.1);
    ctx.lineTo(x + dx * size, y - size * height);
    ctx.lineTo(x + dx * size + size * 0.16 * width, y - size * 0.1);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.04, y - size * 1.25);
  ctx.lineTo(x - size * 0.1, y - size * 0.2);
  ctx.lineTo(x + size * 0.02, y - size * 0.3);
  ctx.closePath();
  ctx.fill();
}

// The crystal-rimmed pool every enemy walks/swims into — same pulsing-
// glow technique Volcanic's own drawLavaVent uses, just cyan-teal instead
// of molten orange, with 3 small drawGlowingCrystal spikes around its rim
// tying it visually back to the rest of the cave's own crystal clusters.
function drawCaveWaterPool(ctx, x, y, size, time = 0) {
  ctx.fillStyle = '#060a0c';
  ctx.beginPath();
  ctx.ellipse(x, y, size, size * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1c3a40';
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.92, size * 0.58, 0, 0, Math.PI * 2);
  ctx.stroke();

  const pulse = 0.5 + 0.5 * Math.sin(time * 1.6);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 0.75);
  gradient.addColorStop(0, 'rgba(190, 250, 255, 0.95)');
  gradient.addColorStop(0.55, `rgba(47, 184, 201, ${0.85 + pulse * 0.1})`);
  gradient.addColorStop(1, 'rgba(10, 60, 70, 0.9)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, size * (0.6 + pulse * 0.05), size * (0.42 + pulse * 0.04), 0, 0, Math.PI * 2);
  ctx.fill();

  [[-1, -0.6], [1, -0.5], [0, 0.7]].forEach(([dx, dy]) => {
    drawGlowingCrystal(ctx, x + dx * size * 0.9, y + dy * size * 0.5, size * 0.3, '#5ff0ff', time);
  });
}

function renderCavesDecor(ctx, decor, time = 0) {
  decor.formations.forEach((formation) => drawCaveFormation(ctx, formation.x, formation.y, formation.size, formation.hanging));
  decor.crystals.forEach((crystal) => drawGlowingCrystal(ctx, crystal.x, crystal.y, crystal.size, crystal.color, time));
  drawCaveWaterPool(ctx, decor.goal.x, decor.goal.y, decor.goal.size, time);
}

// Direct follow-up request: give the water path an actual "flowing"
// read instead of a flat fill — drawn on top of the path's own darker
// base fill (CAVES_PATH_COLORS above), after it, same layering order
// Whirlpool's own caustics use over its background. Two animated dashed
// strokes along the exact same path geometry strokeMapPath already
// builds (so the effect follows every turn correctly, not just straight
// runs): a broad, soft, slow-moving band for a gentle undulating-current
// look, plus a narrower, brighter, faster-moving streak that reads as
// the water's own flow direction — `ctx.lineDashOffset`, continuously
// animated by `time`, is what actually "marches" each dash pattern along
// the path every frame, the standard canvas technique for this. Takes
// `paths`/`pathWidth` directly (not a `decor` object, unlike
// renderDecor) since this needs the map's own path geometry, which decor
// functions never otherwise touch.
function renderCavesPathEffects(ctx, paths, pathWidth, time = 0) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.strokeStyle = 'rgba(90, 210, 220, 0.22)';
  ctx.lineWidth = pathWidth * 0.75;
  ctx.setLineDash([pathWidth * 1.1, pathWidth * 0.9]);
  ctx.lineDashOffset = -time * 24;
  paths.forEach((path) => strokeMapPath(ctx, path));

  ctx.strokeStyle = 'rgba(190, 250, 255, 0.55)';
  ctx.lineWidth = Math.max(2, pathWidth * 0.14);
  ctx.setLineDash([pathWidth * 0.5, pathWidth * 1.6]);
  ctx.lineDashOffset = -time * 70;
  paths.forEach((path) => strokeMapPath(ctx, path));

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Terrain theme registry — each theme owns a background color plus a decor
// renderer taking that map's own `decor` object. renderMap()/
// renderMapPreview() below both dispatch through this rather than
// special-casing map ids.
// ---------------------------------------------------------------------------

const TERRAIN_THEMES = {
  forest: { background: '#0d1b10', renderDecor: renderForestDecor },
  // Darkened from the original '#1b2414' — direct request, scoped to
  // Marshland specifically (Deep Forest's own background is untouched)
  // since every other note in that request was Marshland-only too. A
  // modest -6% rather than a heavier cut: '#1b2414' is already a near-
  // black olive (channels 20-36/255), so shadeColor's linear percent-of-
  // 255 scale crushes it to literal black well before -20%.
  marsh: { background: shadeColor('#1b2414', -6), renderDecor: renderMarshDecor },
  // Direct request: the original dark dusky sand-brown ('#241a0f', the
  // same moody-dark reasoning Marshland's background uses) read as too
  // muted/desaturated — bumped to a genuinely bright, saturated orange so
  // the ground reads unmistakably as hot desert sand. Scoped to Savanah
  // only, same as Marshland's own darkening pass was scoped to Marshland
  // only. See SAVANAH_PATH_COLORS and drawSandstoneFormation's own
  // comments for the related contrast adjustments this required.
  desert: { background: '#c8601f', renderDecor: renderDesertDecor },
  // `background` here is only a flat-fill FALLBACK (used if
  // renderBackground were ever missing) — renderWhirlpoolBackground's own
  // radial vignette is what actually draws, via fillThemeBackground()
  // below. renderBackground is a new, optional hook: every theme above
  // still just gets a flat ctx.fillRect(theme.background), unchanged —
  // only this one theme needed something fancier.
  ocean: {
    background: '#1c4f6b',
    renderDecor: renderOceanDecor,
    renderBackground: renderWhirlpoolBackground,
    renderWaterEffects: renderWhirlpoolCaustics,
  },
  // Deliberately bright (every other theme above is dark) — a flat fill is
  // all this one needs, same as forest/marsh/desert.
  tundra: { background: '#d6e8f0', renderDecor: renderTundraDecor },
  // Near-black obsidian — a flat fill is enough here too (the magma path
  // and magma pools are themselves the bright, hot elements; the ground
  // around them is deliberately dark, same "obsidian floor" the request
  // asked for).
  volcano: { background: '#0f0906', renderDecor: renderVolcanicDecor },
  // Near-black cave rock (the request's own "mostly black/near-black
  // background," lit almost entirely by the glowing crystals themselves)
  // — a flat fill is enough, same as every other dark theme above; the
  // crystals/formations/water-path are what actually carry the lighting.
  // REVISED on direct follow-up request: the original '#070709' had a
  // cool blue-black cast that clashed against the warm amber-brown
  // stalactite/stalagmite formations (CAVES_FORMATIONS/drawCaveFormation
  // above) — retuned to a warm near-black instead, so the floor and the
  // formations now read as one cohesive cave-rock palette rather than two
  // different color families sharing a scene. `renderPathEffects` is a
  // new, optional hook (same pattern `renderWaterEffects`/
  // `renderBackground` above already established — every other theme is
  // unaffected) that layers an animated flowing-water look on top of the
  // path's own fill — see renderCavesPathEffects' own comment above.
  caves: { background: '#100b07', renderDecor: renderCavesDecor, renderPathEffects: renderCavesPathEffects },
};

// Fills the world background for the active theme — a flat
// ctx.fillRect(theme.background) for every terrain except Whirlpool,
// which supplies its own renderBackground (the radial vignette) instead.
// Shared by renderMap() and renderMapPreview() so both stay in sync
// without duplicating this dispatch.
function fillThemeBackground(ctx, theme, width, height) {
  if (theme.renderBackground) {
    theme.renderBackground(ctx, width, height);
  } else {
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, width, height);
  }
}

// ---------------------------------------------------------------------------
// MAP_TYPES — the built-in maps (the only maps there are now that the map
// editor/custom maps have been removed).
// ---------------------------------------------------------------------------

const MAP_TYPES = {
  deepForest: {
    id: 'deepForest',
    name: 'Deep Forest',
    builtin: true,
    // Every map's path(s) are an ARRAY of waypoint-arrays — Deep Forest and
    // Marshland just happen to have exactly one, same as before this was
    // generalized for Savanah's two converging paths. Nothing about a
    // single-path map's behavior changes: MAP_PATH_WAYPOINTS below still
    // aliases paths[0] for any caller that only ever dealt with "the" path.
    paths: [DEEP_FOREST_WAYPOINTS],
    pathWidth: 56,
    pathColors: FOREST_PATH_COLORS,
    terrain: 'forest',
    decor: DEEP_FOREST_DECOR,
  },
  marshland: {
    id: 'marshland',
    name: 'Marshland',
    builtin: true,
    paths: [MARSHLAND_WAYPOINTS],
    pathWidth: 56,
    pathColors: MARSH_PATH_COLORS,
    terrain: 'marsh',
    decor: MARSHLAND_DECOR,
  },
  // "Savanah" is the user's own spelling, kept as given even though the
  // actual theme built here is desert, not grassland-savanna — a direct
  // naming choice, not a typo to silently correct (same spirit as "The
  // Concept Lab" naming notes elsewhere in this project: once a name is
  // given directly, keep it rather than "fixing" it to what seems more
  // conventional). The first map with two paths — see SAVANAH_PATH_A/B's
  // own comment above for why they're both listed here.
  savanah: {
    id: 'savanah',
    name: 'Savanah',
    builtin: true,
    paths: [SAVANAH_PATH_A, SAVANAH_PATH_B],
    pathWidth: 56,
    pathColors: SAVANAH_PATH_COLORS,
    terrain: 'desert',
    decor: SAVANAH_DECOR,
  },
  // Direct request: an ocean-floor map whose single path spirals inward
  // into a central vortex (the goal) rather than any straight-segment
  // route — see WHIRLPOOL_WAYPOINTS' own comment for how that's generated.
  whirlpool: {
    id: 'whirlpool',
    name: 'Whirlpool',
    builtin: true,
    paths: [WHIRLPOOL_WAYPOINTS],
    pathWidth: 56,
    pathColors: WHIRLPOOL_PATH_COLORS,
    terrain: 'ocean',
    decor: WHIRLPOOL_DECOR,
  },
  // Direct request: a snowy Hard-tier map (MAP_DIFFICULTY_MULTIPLIER,
  // enemies.js) — two fully separate paths, each with its own ice cave
  // goal (see TUNDRA_PATH_A/B's own comment above for the follow-up that
  // changed this from the shared-goal shape it originally shipped with).
  tundra: {
    id: 'tundra',
    name: 'Tundra',
    builtin: true,
    paths: [TUNDRA_PATH_A, TUNDRA_PATH_B],
    pathWidth: 56,
    pathColors: TUNDRA_PATH_COLORS,
    terrain: 'tundra',
    decor: TUNDRA_DECOR,
  },
  // Direct request: a Hard-tier map with an obsidian floor and a magma
  // path, plus magma pools that block tower placement — see
  // VOLCANIC_WAYPOINTS' own comment above for the full design rationale.
  volcanic: {
    id: 'volcanic',
    name: 'Volcanic',
    builtin: true,
    paths: [VOLCANIC_WAYPOINTS],
    pathWidth: 56,
    pathColors: VOLCANIC_PATH_COLORS,
    terrain: 'volcano',
    decor: VOLCANIC_DECOR,
  },
  // Direct request, relayed from the peer session: a dark cave interior
  // lit by glowing multi-colored crystals, with the enemy path itself a
  // flowing water channel that forks into 2 branches and rejoins before
  // the goal — see CAVES_PATH_A's own comment above for the full design
  // rationale, including why this is 2 waypoint arrays (same mechanism
  // Savanah's own 2 paths already use) rather than any new engine
  // plumbing.
  caves: {
    id: 'caves',
    name: 'Caves',
    builtin: true,
    paths: [CAVES_PATH_A, CAVES_PATH_B],
    pathWidth: 56,
    pathColors: CAVES_PATH_COLORS,
    terrain: 'caves',
    decor: CAVES_DECOR,
  },
};

const MAP_TYPE_ORDER = ['deepForest', 'marshland', 'savanah', 'whirlpool', 'tundra', 'volcanic', 'caves'];

// ---------------------------------------------------------------------------
// Active-map state. MAP_PATHS/MAP_PATH_WIDTH are what every other file
// (enemies.js movement, towers.js root-trap placement, game.js's zombie
// backward walk, isPointOnPath below) actually reads — see the file header
// for why reassigning these bindings is the whole refactor. MAP_PATHS is an
// array of paths (each itself an array of {x,y} waypoints) rather than one
// flat array, so a map can have more than one — see Savanah. Every enemy
// instance remembers which path it was spawned onto (enemy.pathIndex,
// enemies.js) and reads MAP_PATHS[enemy.pathIndex] for its own movement;
// nothing that isn't an enemy needs to care which path is "active," since
// placement/root-traps/rendering all just iterate every path in MAP_PATHS.
// MAP_PATH_WAYPOINTS is kept as a back-compat alias for MAP_PATHS[0] — the
// game's two original single-path maps only ever had the one, so nothing
// that already read MAP_PATH_WAYPOINTS directly needed to change.
// ---------------------------------------------------------------------------

let activeMap = MAP_TYPES.deepForest;
let MAP_PATHS = activeMap.paths;
let MAP_PATH_WAYPOINTS = MAP_PATHS[0];
let MAP_PATH_WIDTH = activeMap.pathWidth;

function setActiveMap(map) {
  activeMap = map;
  MAP_PATHS = map.paths;
  MAP_PATH_WAYPOINTS = MAP_PATHS[0];
  MAP_PATH_WIDTH = map.pathWidth;
}

function getActiveMap() {
  return activeMap;
}

// Whether a point is on (or within `margin` of) ANY of the active map's
// paths — used to keep towers off the path when placing them. Checking
// every path (not just the first) is what makes Savanah's two paths both
// correctly block tower placement; for a single-path map this is exactly
// the same check as before.
function isPointOnPath(x, y, margin = 0) {
  const halfWidth = MAP_PATH_WIDTH / 2 + margin;
  return MAP_PATHS.some((path) => {
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i];
      const b = path[i + 1];
      if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= halfWidth) return true;
    }
    return false;
  });
}

// Whether a point sits inside any of the ACTIVE map's magma pools — an
// open-ground hazard (Volcanic, direct request: "magma pools where
// towers cant be placed for the enemies") that's off-limits for tower
// placement despite not being part of the enemy path at all, unlike the
// isPointOnPath() check above. Reads activeMap.decor.magmaPools live on
// every call rather than capturing it once, the same convention
// isPointOnPath/MAP_PATHS use — and defaults to an empty array so every
// map before Volcanic (none of which define decor.magmaPools at all)
// just always returns false here, with zero special-casing needed.
function isPointInMagmaPool(x, y) {
  const pools = activeMap.decor.magmaPools || [];
  return pools.some((pool) => Math.hypot(pool.x - x, pool.y - y) < pool.r);
}

// `time` (the game's own animation clock, game.js's animationTime) is a
// new, OPTIONAL third parameter — forwarded straight through to
// theme.renderDecor so a theme can animate its own decor (Whirlpool's
// swirling vortex/swaying seaweed/bobbing bubbles). Every existing decor
// renderer takes just (ctx, decor) and simply ignores the extra argument,
// so this is backward-compatible with Forest/Marsh/Desert's own static
// decor unchanged. Defaults to 0 so a caller that still only passes
// (ctx, canvas) — none left in this codebase, but cheap insurance — gets
// a stable, non-animated first frame instead of NaN-driven drawing.
function renderMap(ctx, canvas, time = 0) {
  const theme = TERRAIN_THEMES[activeMap.terrain];

  fillThemeBackground(ctx, theme, canvas.width, canvas.height);
  if (theme.renderWaterEffects) theme.renderWaterEffects(ctx, canvas.width, canvas.height, time);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // All paths' outlines first, then all paths' fills — rather than each
  // path's outline+fill one after another — so that where two paths
  // overlap or converge (Savanah's temple goal), the fill layer always
  // wins over any path's outline there instead of however the paths
  // happen to be ordered in the array. For a single-path map this is
  // pixel-identical to the old two-call sequence.
  const colors = activeMap.pathColors;
  MAP_PATHS.forEach((path) => {
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = MAP_PATH_WIDTH + 10;
    strokeMapPath(ctx, path);
  });
  MAP_PATHS.forEach((path) => {
    ctx.strokeStyle = colors.fill;
    ctx.lineWidth = MAP_PATH_WIDTH;
    strokeMapPath(ctx, path);
  });
  if (theme.renderPathEffects) theme.renderPathEffects(ctx, MAP_PATHS, MAP_PATH_WIDTH, time);

  theme.renderDecor(ctx, activeMap.decor, time);
}

// The map-select carousel's own big preview (direct request: "much bigger
// map preview images... actually render that map's real terrain and
// detail... basically a proper screenshot-quality look," preferring
// "reusing the actual map-drawing code, just bigger" over hand-drawn
// preview art). Draws FULL decor, unlike the old small map-select tile
// icon this replaced (that one skipped decor entirely — tiny trees/
// puddles just read as noise at icon size — and stretched non-uniformly
// to fill a square tile, both fine for a 40px icon but not for something
// this size): preserves the world's real 3:2 aspect ratio instead (a
// single uniform scale), so nothing looks distorted at this much larger,
// more scrutinized size. Letterboxes (centers within `width`x`height`
// without stretching) if the box's own aspect ratio doesn't exactly
// match 960:640.
function renderMapPreview(ctx, map, x, y, width, height, time = 0) {
  const theme = TERRAIN_THEMES[map.terrain];
  const scale = Math.min(width / MAP_WORLD_WIDTH, height / MAP_WORLD_HEIGHT);
  const drawWidth = MAP_WORLD_WIDTH * scale;
  const drawHeight = MAP_WORLD_HEIGHT * scale;
  const offsetX = x + (width - drawWidth) / 2;
  const offsetY = y + (height - drawHeight) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  fillThemeBackground(ctx, theme, MAP_WORLD_WIDTH, MAP_WORLD_HEIGHT);
  if (theme.renderWaterEffects) theme.renderWaterEffects(ctx, MAP_WORLD_WIDTH, MAP_WORLD_HEIGHT, time);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Same all-outlines-then-all-fills ordering as renderMap(), and for the
  // same reason — see its own comment.
  map.paths.forEach((path) => {
    ctx.strokeStyle = map.pathColors.outline;
    ctx.lineWidth = map.pathWidth + 10;
    strokeMapPath(ctx, path);
  });
  map.paths.forEach((path) => {
    ctx.strokeStyle = map.pathColors.fill;
    ctx.lineWidth = map.pathWidth;
    strokeMapPath(ctx, path);
  });
  if (theme.renderPathEffects) theme.renderPathEffects(ctx, map.paths, map.pathWidth, time);

  theme.renderDecor(ctx, map.decor, time);

  ctx.restore();
}

// The map editor (and the procedural per-custom-map decor generator it
// needed, since a custom path's shape was unknown ahead of time unlike the
// two built-ins' hand-placed decor above) was removed per direct request —
// see git history. Deep Forest/Marshland and everything above this line
// are untouched.
