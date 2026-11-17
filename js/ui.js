// A tiny, hand-rolled canvas UI toolkit — no DOM, no dependencies. The whole
// control panel (Shop/Selected Tower/Wave) used to be real DOM elements
// sitting next to the canvas; it's now drawn on the canvas itself, so this
// file provides just enough of what a UI framework would otherwise give us:
// hit-testable regions, hover/press-and-hold state, basic text layout, and a
// couple of shared drawing primitives (buttons, tooltips).
//
// It's immediate-mode: layout and hit-test regions are recomputed every
// render() frame rather than retained/diffed across frames, the same spirit
// as the old renderPanel()/renderShop() DOM rebuilds this replaces. A click
// or hover is hit-tested against whichever frame's regions were registered
// most recently — at 60fps that's at most one frame stale, imperceptible.

let uiRegions = [];

function uiBeginFrame() {
  uiRegions = [];
}

// Registers a rectangular hit-testable region for this frame. `id` should be
// stable across frames for the same logical element. `data` is passed
// through to whatever reads the region back (click handling, tooltips).
function uiRegisterRegion(id, x, y, w, h, data) {
  uiRegions.push({ id, x, y, w, h, data });
}

function uiPointInRegion(region, x, y) {
  return x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h;
}

// Last-registered (topmost-drawn) region wins on overlap.
function uiHitTest(x, y) {
  for (let i = uiRegions.length - 1; i >= 0; i -= 1) {
    if (uiPointInRegion(uiRegions[i], x, y)) return uiRegions[i];
  }
  return null;
}

// Greedy word-wrap against a max pixel width, using the context's currently
// set font. Caller is responsible for setting ctx.font before calling this.
function uiWrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
}

// Draws left-aligned text starting at (x, y), one line per entry in `lines`
// (already-wrapped), returning the y just past the last line.
function uiDrawTextLines(ctx, lines, x, y, lineHeight, color, font) {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

function uiRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A simple rectangular button: fill + border + centered label. `state` picks
// the color scheme ('default' | 'disabled' | 'accent'); `hovered` draws a
// slightly brighter fill so mouse users get feedback (touch has no hover,
// it just taps).
function uiDrawButton(ctx, { x, y, w, h, label, state = 'default', hovered = false }) {
  const palette = {
    default: { fill: '#2a2f3a', fillHover: '#343a47', border: '#454c5c', text: '#eee' },
    disabled: { fill: '#20242c', fillHover: '#20242c', border: '#2e3340', text: '#777' },
    accent: { fill: '#3a5a2e', fillHover: '#45692f', border: '#5a8a3e', text: '#eee' },
  }[state];

  uiRoundRect(ctx, x, y, w, h, 5);
  ctx.fillStyle = hovered ? palette.fillHover : palette.fill;
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = palette.text;
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

// A floating tooltip box anchored just above (x, y), clamped so it never
// draws outside [0, canvasWidth] x [0, canvasHeight] — flips below the
// anchor if there isn't room above it.
function uiDrawTooltip(ctx, x, y, lines, canvasWidth, canvasHeight) {
  if (!lines.length) return;

  const font = '12px sans-serif';
  ctx.font = font;
  const padding = 8;
  const lineHeight = 15;
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const boxWidth = textWidth + padding * 2;
  const boxHeight = lines.length * lineHeight + padding * 2;

  let boxX = x - boxWidth / 2;
  boxX = Math.max(4, Math.min(canvasWidth - boxWidth - 4, boxX));

  let boxY = y - boxHeight - 10;
  if (boxY < 4) boxY = y + 18; // not enough room above — flip below the anchor instead

  uiRoundRect(ctx, boxX, boxY, boxWidth, boxHeight, 5);
  ctx.fillStyle = 'rgba(15, 17, 22, 0.96)';
  ctx.fill();
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.stroke();

  uiDrawTextLines(ctx, lines, boxX + padding, boxY + padding, lineHeight, '#f0f0f0', font);
}
