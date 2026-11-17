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
}

function strokeMapPath(ctx, waypoints) {
  ctx.beginPath();
  ctx.moveTo(waypoints[0].x, waypoints[0].y);
  waypoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();
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

  MAP_TREES.forEach((tree) => drawMapTree(ctx, tree.x, tree.y, tree.r));
}
