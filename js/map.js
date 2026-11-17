// The game's single map (no map-selection system yet): a dark forest with
// a winding dirt path enemies walk from spawn to the base. Hand-drawn with
// canvas primitives only, no external art assets.
//
// MAP_PATH_WAYPOINTS is also what enemies.js follows for movement — it's
// the one source of truth for the lane's shape.

const MAP_PATH_WAYPOINTS = [
  { x: -20, y: 80 },
  { x: 220, y: 80 },
  { x: 220, y: 300 },
  { x: 520, y: 300 },
  { x: 520, y: 560 },
  { x: 760, y: 560 },
  { x: 760, y: 180 },
  { x: 980, y: 180 },
];

const MAP_PATH_WIDTH = 56;

// Fixed, hand-placed tree positions — scattered rather than tiled, and
// kept clear of the path so it stays visually distinct from the forest.
const MAP_TREES = [
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
];

function drawMapTree(ctx, x, y, r) {
  ctx.fillStyle = '#2e1f14';
  ctx.fillRect(x - r * 0.15, y, r * 0.3, r * 0.9);

  // A few overlapping circles for a simple hand-drawn canopy.
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

  // A touch of canopy highlight so the trees don't read as flat silhouettes.
  ctx.fillStyle = '#1a3a1f';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.6, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

// Smaller than trees, scattered for additional ground-level detail.
const MAP_BUSHES = [
  { x: 180, y: 140, r: 12 },
  { x: 480, y: 90, r: 14 },
  { x: 260, y: 440, r: 12 },
  { x: 560, y: 480, r: 13 },
  { x: 780, y: 380, r: 12 },
  { x: 820, y: 120, r: 11 },
  { x: 110, y: 240, r: 10 },
  { x: 680, y: 500, r: 13 },
];

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

// Small tufts of grass for ground texture — a few near the path edge, a
// few scattered in the open. Deterministic (fixed list), not randomly
// generated each frame.
const MAP_GRASS_TUFTS = [
  { x: 150, y: 110 }, { x: 260, y: 230 }, { x: 460, y: 260 }, { x: 560, y: 340 },
  { x: 700, y: 540 }, { x: 830, y: 220 }, { x: 70, y: 420 }, { x: 320, y: 410 },
  { x: 600, y: 120 }, { x: 870, y: 480 }, { x: 200, y: 500 }, { x: 740, y: 260 },
];

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

function strokeMapPath(ctx, waypoints) {
  ctx.beginPath();
  ctx.moveTo(waypoints[0].x, waypoints[0].y);
  waypoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

// Whether a point is on (or within `margin` of) the dirt path — used to
// keep towers off the path when placing them.
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
  ctx.fillStyle = '#0d1b10';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Darker outline under a lighter fill gives the path a simple worn-dirt,
  // two-tone look without needing a texture image.
  ctx.strokeStyle = '#3e2a1a';
  ctx.lineWidth = MAP_PATH_WIDTH + 10;
  strokeMapPath(ctx, MAP_PATH_WAYPOINTS);

  ctx.strokeStyle = '#6b4a2f';
  ctx.lineWidth = MAP_PATH_WIDTH;
  strokeMapPath(ctx, MAP_PATH_WAYPOINTS);

  MAP_GRASS_TUFTS.forEach((tuft) => drawGrassTuft(ctx, tuft.x, tuft.y));
  MAP_BUSHES.forEach((bush) => drawMapBush(ctx, bush.x, bush.y, bush.r));
  MAP_TREES.forEach((tree) => drawMapTree(ctx, tree.x, tree.y, tree.r));
}
