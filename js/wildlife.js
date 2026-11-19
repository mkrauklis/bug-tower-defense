// Ambient wildlife: purely decorative fireflies, and (Marshland only) frogs
// that hop between nearby lily pads. No combat role for either — they don't
// interact with towers or enemies at all. Frogs in particular are NOT the
// combat "Baby Frog"-style enemy type (js/enemies.js) — same animal,
// unrelated system, purely decorative like the fireflies.
//
// Ladybugs (and the click-for-+50%-damage-boost power-up that came with
// them) were removed per direct request — see git history.
//
// Movement uses the game's seeded random() (js/random.js) rather than
// Math.random(), so wandering is reproducible along with everything else
// under a given ?seed=.

const WILDLIFE_BOUNDS = { width: 960, height: 640 };
const FIREFLY_COUNT = 6;
const FROG_COUNT = 5;

// How far a frog will hop in one go — restricted to a *nearby* lily pad
// rather than any pad on the map (an earlier version picked any pad at
// random, so a hop between two far-apart puddles could cover hundreds of
// pixels; animated over the same fixed short duration and small arc height
// used for a one-pad hop, a jump that long read as a flat, fast-moving
// streak — "shooting lasers," not hopping. Restricting the candidate pads
// to this radius, and deriving each hop's own duration/arc height from its
// actual distance below, both fixes that and reads as a visibly shorter,
// gentler hop range overall.
const FROG_MAX_HOP_DISTANCE = 55;
// Horizontal travel speed a hop's duration is derived from, so a short hop
// take proportionally less time than a longer one instead of both taking
// the same fixed duration — that mismatch (long distance, fixed short
// duration) was the other half of the "laser" bug above.
const FROG_HOP_SPEED = 160; // px/second
const FROG_MIN_HOP_DURATION = 0.25;
const FROG_MAX_HOP_ARC_HEIGHT = 12;

function createWildlifeEntity(kind, options = {}) {
  if (kind === 'frog') {
    const pads = options.lilyPads || [];
    const start = pads.length
      ? pads[Math.floor(random() * pads.length)]
      : { x: WILDLIFE_BOUNDS.width / 2, y: WILDLIFE_BOUNDS.height / 2 };
    return {
      kind: 'frog',
      lilyPads: pads,
      x: start.x,
      y: start.y,
      fromX: start.x,
      fromY: start.y,
      toX: start.x,
      toY: start.y,
      hopProgress: 1, // 1 = idle at destination, < 1 = mid-hop
      hopDuration: FROG_MIN_HOP_DURATION,
      hopArcHeight: 6,
      pauseRemaining: 1 + random() * 2.5,
      facingAngle: 0,
    };
  }

  return {
    kind, // 'firefly'
    x: WILDLIFE_BOUNDS.width * random(),
    y: WILDLIFE_BOUNDS.height * random(),
    angle: random() * Math.PI * 2,
    speed: 18,
    wanderTimer: random() * 2, // seconds until the next heading change
    glowPhase: random() * Math.PI * 2,
  };
}

// `map` is the currently active map (js/map.js) — frogs only spawn when it
// has lily pads to hop around on (Marshland and any custom map using the
// marsh terrain theme); maps without any (Deep Forest) just get none.
function createWildlifeSwarm(map) {
  const swarm = [];
  for (let i = 0; i < FIREFLY_COUNT; i += 1) swarm.push(createWildlifeEntity('firefly'));

  const lilyPads = map && map.decor && map.decor.lilyPads;
  if (lilyPads && lilyPads.length) {
    const frogCount = Math.min(FROG_COUNT, lilyPads.length);
    for (let i = 0; i < frogCount; i += 1) swarm.push(createWildlifeEntity('frog', { lilyPads }));
  }

  return swarm;
}

// Picks a random lily pad within FROG_MAX_HOP_DISTANCE of the frog's
// current position (excluding its own pad) — null if nothing qualifies,
// which updateFrog() below treats as "hop in place" rather than forcing a
// long-distance jump just to land somewhere.
function pickNearbyLilyPad(entity) {
  const candidates = entity.lilyPads.filter((pad) => {
    if (pad.x === entity.x && pad.y === entity.y) return false;
    return Math.hypot(pad.x - entity.x, pad.y - entity.y) <= FROG_MAX_HOP_DISTANCE;
  });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(random() * candidates.length)];
}

function updateFrog(entity, deltaSeconds) {
  if (entity.hopProgress < 1) {
    entity.hopProgress = Math.min(1, entity.hopProgress + deltaSeconds / entity.hopDuration);
    const t = entity.hopProgress;
    entity.x = entity.fromX + (entity.toX - entity.fromX) * t;
    entity.y = entity.fromY + (entity.toY - entity.fromY) * t;
    return;
  }

  entity.pauseRemaining -= deltaSeconds;
  if (entity.pauseRemaining > 0) return;

  // No pad close enough — a tiny in-place bounce instead of forcing a
  // longer "hop" just to have a destination (the explicit fallback for
  // when a clean pad-to-pad hop isn't available).
  const target = pickNearbyLilyPad(entity) || { x: entity.x, y: entity.y };
  const distance = Math.hypot(target.x - entity.x, target.y - entity.y);

  entity.fromX = entity.x;
  entity.fromY = entity.y;
  entity.toX = target.x;
  entity.toY = target.y;
  entity.hopDuration = Math.max(FROG_MIN_HOP_DURATION, distance / FROG_HOP_SPEED);
  // Taller arc for a longer hop, but even an in-place bounce (distance 0)
  // still lifts a little so it reads as a hop, not a freeze-frame.
  entity.hopArcHeight = Math.min(FROG_MAX_HOP_ARC_HEIGHT, 6 + distance * 0.15);
  if (distance > 0.5) entity.facingAngle = Math.atan2(target.y - entity.y, target.x - entity.x);
  entity.hopProgress = 0;
  entity.pauseRemaining = 1 + random() * 2.5;
}

function updateWildlife(swarm, deltaSeconds) {
  swarm.forEach((entity) => {
    if (entity.kind === 'frog') {
      updateFrog(entity, deltaSeconds);
      return;
    }

    entity.wanderTimer -= deltaSeconds;
    if (entity.wanderTimer <= 0) {
      entity.angle += (random() - 0.5) * Math.PI; // pick a new rough heading
      entity.wanderTimer = 1 + random() * 2;
    }

    entity.x += Math.cos(entity.angle) * entity.speed * deltaSeconds;
    entity.y += Math.sin(entity.angle) * entity.speed * deltaSeconds;

    // Bounce gently off the map edges rather than wandering off it.
    if (entity.x < 10 || entity.x > WILDLIFE_BOUNDS.width - 10) {
      entity.angle = Math.PI - entity.angle;
      entity.x = Math.max(10, Math.min(WILDLIFE_BOUNDS.width - 10, entity.x));
    }
    if (entity.y < 10 || entity.y > WILDLIFE_BOUNDS.height - 10) {
      entity.angle = -entity.angle;
      entity.y = Math.max(10, Math.min(WILDLIFE_BOUNDS.height - 10, entity.y));
    }
  });
}

function drawFirefly(ctx, entity, time) {
  const glow = 0.5 + 0.5 * Math.sin(time * 3 + entity.glowPhase); // 0..1 pulsing glow
  ctx.save();
  ctx.shadowColor = '#fff59d';
  ctx.shadowBlur = 6 + glow * 6;
  ctx.fillStyle = `rgba(255, 245, 157, ${0.5 + glow * 0.5})`;
  ctx.beginPath();
  ctx.arc(entity.x, entity.y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFrog(ctx, entity) {
  // Lifted off the ground position at the midpoint of a hop (a simple sine
  // arc over hopProgress, scaled by this specific hop's own arc height) —
  // purely a visual offset, entity.x/y underneath stay the real ground
  // position used for targeting the next lily pad.
  const lift = Math.sin(entity.hopProgress * Math.PI) * entity.hopArcHeight;
  const x = entity.x;
  const y = entity.y - lift;

  ctx.save();

  // A faint shadow at the true ground position, shrinking as the frog
  // lifts higher — the one cue that it's airborne, not just small.
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, 0.25 - lift * 0.012)})`;
  ctx.beginPath();
  ctx.ellipse(entity.x, entity.y + 2, Math.max(1, 5 - lift * 0.2), Math.max(0.5, 2.5 - lift * 0.1), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(x, y);
  ctx.rotate(entity.facingAngle);

  ctx.fillStyle = '#5a9c3f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 6.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Two eye bumps on top, forward of center — the classic frog silhouette.
  ctx.beginPath();
  ctx.arc(2.5, -3.5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(2.5, 3.5, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(3.2, -3.5, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(3.2, 3.5, 0.9, 0, Math.PI * 2);
  ctx.fill();

  // Hind legs tucked at the sides — folded while idle, a little splayed
  // mid-hop for a touch of motion.
  const splay = 0.3 + 0.3 * Math.sin(entity.hopProgress * Math.PI);
  ctx.strokeStyle = '#4a8433';
  ctx.lineWidth = 1.5;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(-3, side * 3);
    ctx.lineTo(-7, side * (4 + splay * 3));
    ctx.stroke();
  });

  ctx.restore();
}

function renderWildlife(ctx, swarm, time, kind) {
  swarm.forEach((entity) => {
    if (entity.kind !== kind) return;
    if (kind === 'firefly') drawFirefly(ctx, entity, time);
    else drawFrog(ctx, entity);
  });
}
