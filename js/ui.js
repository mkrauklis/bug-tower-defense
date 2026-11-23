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

// General button-polish pass (direct request: "make them look like a
// finished game's buttons, not placeholder UI rectangles"). A cheap
// glossy-bevel overlay shared by every button-ish shape in the game
// (uiDrawButton below, plus the shop/sandbox tiles, the main-menu buttons,
// and the mode-select cards in game.js, none of which go through
// uiDrawButton itself) — a soft lighter sliver across the top ~45% and a
// darker sliver across the bottom ~22%, clipped to the shape's own rounded
// rect, standing in for a real depth/gradient without introducing
// createRadialGradient/addColorStop (same "layered translucent fills over
// a real gradient" choice renderHollowSplash's own moon glow made, for the
// same reason: it must survive a minimal stub ctx with no real gradient
// support). Caller still draws its own fill first — this only adds the
// shine on top of it.
function uiButtonBevel(ctx, x, y, w, h, r) {
  ctx.save();
  uiRoundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fillRect(x, y, w, h * 0.45);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.fillRect(x, y + h * 0.78, w, h * 0.22);
  ctx.restore();
}

// Texture pass, part 5/4 (direct request, relayed from the peer session:
// "UI panels/backgrounds: a bit more surface detail (subtle grain/
// gradient) instead of flat fills, consistent with the button-bevel
// polish you already did"), in the same pixelated-chunky-block style
// every other part of this pass uses. Reuses the exact same
// buildGrainSpecks()/drawGrain() primitive (map.js) every terrain/tower
// surface in this pass already draws with, rather than a separate
// technique just for UI — one scatter, precomputed once and sized to
// comfortably cover the largest panel/tooltip this file ever draws, so
// every caller below can reuse it at its own actual size via a clip
// rather than allocating a fresh scatter per frame (the same "one
// precomputed set, clipped/scaled per caller" approach
// PUDDLE_SHIMMER_UNIT_SPECKS already uses in map.js).
const UI_GRAIN_SPECKS = buildGrainSpecks(260, 960, 900, 3, 51.731, 84.653, 27.233);

function drawUIPanelGrain(ctx, x, y, w, h, baseColor) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  drawGrain(ctx, UI_GRAIN_SPECKS, x, y, baseColor, 3);
  ctx.restore();
}

// A simple rectangular button: fill + border + centered label. `state` picks
// the color scheme ('default' | 'disabled' | 'accent'); `hovered` draws a
// slightly brighter fill, a crisper border, and a soft outer glow so mouse
// users get real "this is responding to me" feedback (touch has no hover,
// it just taps).
function uiDrawButton(ctx, { x, y, w, h, label, state = 'default', hovered = false }) {
  const palette = {
    default: { fill: '#2a2f3a', fillHover: '#363c4a', border: '#4a5166', glow: 'rgba(200, 210, 230, 0.35)', text: '#eee' },
    disabled: { fill: '#20242c', fillHover: '#20242c', border: '#2e3340', glow: null, text: '#777' },
    accent: { fill: '#3a5a2e', fillHover: '#48702f', border: '#6ba33f', glow: 'rgba(139, 195, 74, 0.5)', text: '#eee' },
  }[state];
  const r = Math.min(5, h / 2);

  uiRoundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = hovered ? palette.fillHover : palette.fill;
  ctx.fill();

  uiButtonBevel(ctx, x, y, w, h, r);

  if (hovered && palette.glow) {
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = 10;
  }
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = hovered ? 1.5 : 1;
  uiRoundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.shadowBlur = 0;

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
  drawUIPanelGrain(ctx, boxX, boxY, boxWidth, boxHeight, '#0f1116');
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.stroke();

  uiDrawTextLines(ctx, lines, boxX + padding, boxY + padding, lineHeight, '#f0f0f0', font);
}
