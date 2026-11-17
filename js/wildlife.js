// Ambient wildlife: purely decorative fireflies, and ladybugs that
// occasionally grant the player a power-up. No combat role for either —
// they don't interact with towers or enemies at all.
//
// Movement uses the game's seeded random() (js/random.js) rather than
// Math.random(), so wandering is reproducible along with everything else
// under a given ?seed=.

const WILDLIFE_BOUNDS = { width: 960, height: 640 };
const FIREFLY_COUNT = 6;
const LADYBUG_COUNT = 3;

// How long a ladybug waits after granting its power-up before it can be
// clicked again — keeps the mechanic from being spammed with 3 of them
// wandering around, while still coming back around over a session.
const LADYBUG_COOLDOWN = 20;
const LADYBUG_CLICK_RADIUS = 14;

function createWildlifeEntity(kind) {
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

function createWildlifeSwarm() {
  const swarm = [];
  for (let i = 0; i < FIREFLY_COUNT; i += 1) swarm.push(createWildlifeEntity('firefly'));
  for (let i = 0; i < LADYBUG_COUNT; i += 1) swarm.push(createWildlifeEntity('ladybug'));
  return swarm;
}

function updateWildlife(swarm, deltaSeconds) {
  swarm.forEach((entity) => {
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

function renderWildlife(ctx, swarm, time, kind) {
  swarm.forEach((entity) => {
    if (entity.kind !== kind) return;
    if (kind === 'firefly') drawFirefly(ctx, entity, time);
    else drawLadybug(ctx, entity);
  });
}
