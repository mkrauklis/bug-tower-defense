// Ambient wildlife: purely decorative fireflies, ladybugs that occasionally
// grant the player a power-up, and (Marshland only) frogs that hop between
// lily pads. No combat role for any of them — they don't interact with
// towers or enemies at all. Frogs in particular are NOT the combat "Baby
// Frog" enemy type (js/enemies.js) — same animal, unrelated system, purely
// decorative like the fireflies.
//
// Movement uses the game's seeded random() (js/random.js) rather than
// Math.random(), so wandering is reproducible along with everything else
// under a given ?seed=.

const WILDLIFE_BOUNDS = { width: 960, height: 640 };
const FIREFLY_COUNT = 6;
const LADYBUG_COUNT = 3;
const FROG_COUNT = 5;

// How long a ladybug waits after granting its power-up before it can be
// clicked again — keeps the mechanic from being spammed with 3 of them
// wandering around, while still coming back around over a session.
const LADYBUG_COOLDOWN = 20;
const LADYBUG_CLICK_RADIUS = 14;

// Seconds a hop takes start-to-finish, and how high (px) a frog lifts at
// the midpoint of a hop — purely a rendering offset (see drawFrog), the
// entity's own x/y already track the ground position throughout.
const FROG_HOP_DURATION = 0.5;
const FROG_HOP_ARC_HEIGHT = 10;

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
      pauseRemaining: 1 + random() * 2.5,
      facingAngle: 0,
    };
  }

  return {
    kind, // 'firefly' | 'ladybug'
    x: WILDLIFE_BOUNDS.width * random(),
    y: WILDLIFE_BOUNDS.height * random(),
    angle: random() * Math.PI * 2,
    speed: kind === 'firefly' ? 18 : 14,
    wanderTimer: random() * 2, // seconds until the next heading change
    glowPhase: random() * Math.PI * 2,
    cooldownRemaining: 0, // ladybugs only
  };
}

// `map` is the currently active map (js/map.js) — frogs only spawn when it
// has lily pads to hop around on (Marshland and any custom map using the
// marsh terrain theme); maps without any (Deep Forest) just get none.
function createWildlifeSwarm(map) {
  const swarm = [];
  for (let i = 0; i < FIREFLY_COUNT; i += 1) swarm.push(createWildlifeEntity('firefly'));
  for (let i = 0; i < LADYBUG_COUNT; i += 1) swarm.push(createWildlifeEntity('ladybug'));

  const lilyPads = map && map.decor && map.decor.lilyPads;
  if (lilyPads && lilyPads.length) {
    const frogCount = Math.min(FROG_COUNT, lilyPads.length);
    for (let i = 0; i < frogCount; i += 1) swarm.push(createWildlifeEntity('frog', { lilyPads }));
  }

  return swarm;
}

function updateFrog(entity, deltaSeconds) {
  if (entity.hopProgress < 1) {
    entity.hopProgress = Math.min(1, entity.hopProgress + deltaSeconds / FROG_HOP_DURATION);
    const t = entity.hopProgress;
    entity.x = entity.fromX + (entity.toX - entity.fromX) * t;
    entity.y = entity.fromY + (entity.toY - entity.fromY) * t;
    return;
  }

  entity.pauseRemaining -= deltaSeconds;
  if (entity.pauseRemaining > 0 || entity.lilyPads.length < 2) {
    if (entity.pauseRemaining <= 0) entity.pauseRemaining = 1 + random() * 2.5; // nowhere else to hop to
    return;
  }

  let target = entity.lilyPads[Math.floor(random() * entity.lilyPads.length)];
  let attempts = 0;
  while (target.x === entity.x && target.y === entity.y && attempts < 5) {
    target = entity.lilyPads[Math.floor(random() * entity.lilyPads.length)];
    attempts += 1;
  }

  entity.fromX = entity.x;
  entity.fromY = entity.y;
  entity.toX = target.x;
  entity.toY = target.y;
  entity.facingAngle = Math.atan2(entity.toY - entity.fromY, entity.toX - entity.fromX);
  entity.hopProgress = 0;
  entity.pauseRemaining = 1 + random() * 2.5;
}

function updateWildlife(swarm, deltaSeconds) {
  swarm.forEach((entity) => {
    if (entity.kind === 'frog') {
      updateFrog(entity, deltaSeconds);
      return;
    }

    if (entity.kind === 'ladybug') {
      entity.cooldownRemaining = Math.max(0, entity.cooldownRemaining - deltaSeconds);
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

function findLadybugAt(swarm, x, y) {
  return swarm.find(
    (entity) => entity.kind === 'ladybug' && Math.hypot(entity.x - x, entity.y - y) <= LADYBUG_CLICK_RADIUS
  );
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

function drawLadybug(ctx, entity) {
  const onCooldown = entity.cooldownRemaining > 0;
  ctx.save();
  if (onCooldown) ctx.globalAlpha = 0.4; // visibly "spent" until it recharges

  ctx.fillStyle = '#d32f2f';
  ctx.beginPath();
  ctx.ellipse(entity.x, entity.y, 7, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#212121';
  ctx.beginPath();
  ctx.arc(entity.x - 6, entity.y, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(entity.x - 7, entity.y);
  ctx.lineTo(entity.x + 7, entity.y);
  ctx.stroke();

  [[-2, -2], [2, -2], [-2, 2], [2, 2], [4, 0]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(entity.x + dx, entity.y + dy, 1, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawFrog(ctx, entity) {
  // Lifted off the ground position at the midpoint of a hop (a simple sine
  // arc over hopProgress) — purely a visual offset, entity.x/y underneath
  // stay the real ground position used for targeting the next lily pad.
  const lift = Math.sin(entity.hopProgress * Math.PI) * FROG_HOP_ARC_HEIGHT;
  const x = entity.x;
  const y = entity.y - lift;

  ctx.save();

  // A faint shadow at the true ground position, shrinking as the frog
  // lifts higher — the one cue that it's airborne, not just small.
  ctx.fillStyle = `rgba(0, 0, 0, ${0.25 - lift * 0.01})`;
  ctx.beginPath();
  ctx.ellipse(entity.x, entity.y + 2, 5 - lift * 0.2, 2.5 - lift * 0.1, 0, 0, Math.PI * 2);
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
    else if (kind === 'frog') drawFrog(ctx, entity);
    else drawLadybug(ctx, entity);
  });
}
