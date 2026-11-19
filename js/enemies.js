// Enemy + wave data model and spawning scaffolding.
//
// Speed is expressed as a multiplier of BASE_SPEED (pixels/second) — the
// speed a 1.0x-speed enemy would move at. Health is absolute hit points.
//
// Enemies move by following the map's path waypoints (MAP_PATH_WAYPOINTS,
// defined in map.js — load that script before this one). This movement
// code is path-shape-agnostic: it just walks the waypoint list, so a
// different map's path would work without any change here.

const BASE_SPEED = 60; // px/second

// The enemy roster: every regular enemy type the game can spawn, keyed by
// its own enemyKey. Deliberately empty right now — the entire previous
// roster (Ant, Worm, Tiny Isopod, Fly, Tadpole, Baby Frog, Poison Dart
// Frog, Hammerhead Worm, Baby/Armored Millipede, Giant Centipede) was
// removed on direct request to clear the way for a new design, along with
// every bit of roster-specific logic/art that only existed to serve those
// types (see drawEnemyShape's dispatch, ENEMY_FACING_OFFSET,
// MILLIPEDE_FAMILY_KEYS/MILLIPEDE_BODY, ENEMY_ORDER* below — all emptied,
// not deleted, since the generic engine around them stays intact and is
// meant to be filled back in). Shape a new entry needs:
// { name, speedMultiplier, health, color, radius, bounty }.
const ENEMY_TYPES = {};

// Enemy types whose body visibly curls around corners as a chain of
// segments following the head's own recent path, instead of the single
// rigid heading every other enemy uses — add a key here (and a matching
// entry in MILLIPEDE_BODY below) to opt a new type into it. See
// recordTrailPoint()/renderMillipedeBody() below for the (still-intact)
// generic mechanism this drives.
const MILLIPEDE_FAMILY_KEYS = new Set();

// Intro order for tier 1 (unlocked from round 1), tier 2 (unlocked
// starting after round 25), and tier 3 (unlocked starting after round 50)
// — see getUnlockedEnemyTypes. Kept as separate lists rather than one long
// ENEMY_ORDER so each tier can unlock on its own progressive every-5-rounds
// cadence instead of one continuous count across all of them. Empty for
// now, same as ENEMY_TYPES above — getUnlockedEnemyTypes degrades to
// returning no types for any round, and generateWave() degrades to an
// empty regular wave, rather than erroring.
const ENEMY_ORDER = [];
const ENEMY_ORDER_TIER2 = [];
const ENEMY_ORDER_TIER3 = [];

// Bosses, keyed by boss tier (tier 1 = round 25, tier 2 = round 50, ...).
// Empty for now, same as ENEMY_TYPES above — getBossForRound() degrades to
// returning null (no boss designed at all yet) rather than erroring, and
// generateWave() turns that into an empty wave on what would otherwise be
// a boss round.
const BOSS_TYPES = {};

const BOSS_INTERVAL = 25;

function isBossRound(round) {
  return round % BOSS_INTERVAL === 0;
}

// Returns null when no boss tier has been designed at all yet (empty
// BOSS_TYPES) — generateWave() below turns that into a graceful empty wave
// rather than spawning a boss built from missing data.
function getBossForRound(round) {
  const designedTiers = Object.keys(BOSS_TYPES).map(Number);
  if (designedTiers.length === 0) return null;

  const tier = round / BOSS_INTERVAL;
  const highestDesigned = Math.max(...designedTiers);
  // Fall back to the strongest designed boss tier if this one hasn't been
  // designed yet, rather than inventing a new boss.
  const useTier = BOSS_TYPES[tier] ? tier : highestDesigned;
  return { tier: useTier, ...BOSS_TYPES[useTier] };
}

function getUnlockedEnemyTypes(round) {
  const tier1Count = Math.min(ENEMY_ORDER.length, Math.floor((round - 1) / 5) + 1);
  const unlocked = ENEMY_ORDER.slice(0, tier1Count);

  // Tier 2 starts unlocking the round right after the round-25 boss, on the
  // same progressive every-5-rounds cadence as tier 1, just starting later
  // (round 26 unlocks the first tier-2 type, round 31 the second, round 36
  // the third) rather than being available from round 1.
  if (round > BOSS_INTERVAL) {
    const roundsSinceTier2Start = round - (BOSS_INTERVAL + 1);
    const tier2Count = Math.min(ENEMY_ORDER_TIER2.length, Math.floor(roundsSinceTier2Start / 5) + 1);
    unlocked.push(...ENEMY_ORDER_TIER2.slice(0, tier2Count));
  }

  // Tier 3 starts unlocking the round right after the round-50 boss, same
  // cadence again (round 51 unlocks the first tier-3 type, 56 the second,
  // 61 the third, 66 the fourth).
  if (round > BOSS_INTERVAL * 2) {
    const roundsSinceTier3Start = round - (BOSS_INTERVAL * 2 + 1);
    const tier3Count = Math.min(ENEMY_ORDER_TIER3.length, Math.floor(roundsSinceTier3Start / 5) + 1);
    unlocked.push(...ENEMY_ORDER_TIER3.slice(0, tier3Count));
  }

  return unlocked;
}

// Total enemies across a regular (non-boss) wave — reinstated per direct
// request, superseding an earlier change that kept wave size flat (that
// turned out to make every round feel the same, since the only real
// progression was per-enemy health). Scales linearly from
// WAVE_SIZE_AT_ROUND_1 at round 1 up to WAVE_SIZE_AT_ROUND_25 at round 25,
// then holds flat at that cap for every round after — a deliberate choice
// so very late waves don't grow unbounded; round-over-round difficulty past
// 25 keeps climbing via healthMultiplier (below) and the ongoing tier-2
// type unlocks instead of an ever-larger enemy count.
const WAVE_SIZE_AT_ROUND_1 = 5;
const WAVE_SIZE_AT_ROUND_25 = 25;

function getTotalWaveSize(round) {
  if (round >= 25) return WAVE_SIZE_AT_ROUND_25;
  const progress = (round - 1) / 24; // 0 at round 1, 1 at round 25
  return Math.round(WAVE_SIZE_AT_ROUND_1 + (WAVE_SIZE_AT_ROUND_25 - WAVE_SIZE_AT_ROUND_1) * progress);
}

// Round-over-round health scaling — unchanged, and still stacks with the
// count curve above rather than replacing it: rounds now get both more
// numerous and individually tougher enemies. Not tuned — just a reasonable
// baseline curve: +10% health every 3 rounds.
function getRoundScaling(round) {
  return {
    healthMultiplier: 1 + Math.floor((round - 1) / 3) * 0.1,
  };
}

// Builds this round's wave as a composition list:
// { enemyKey, name, color, radius, count, health, speedMultiplier, isBoss, bounty }
function generateWave(round) {
  if (isBossRound(round)) {
    const boss = getBossForRound(round);
    if (!boss) return []; // no boss tier designed yet — an empty wave, not a broken one
    return [
      {
        enemyKey: `boss-tier-${boss.tier}`,
        name: boss.name,
        color: boss.color,
        radius: boss.radius,
        count: 1,
        health: boss.health,
        speedMultiplier: boss.speedMultiplier,
        isBoss: true,
        bounty: boss.bounty,
      },
    ];
  }

  const scaling = getRoundScaling(round);
  const unlocked = getUnlockedEnemyTypes(round);
  if (unlocked.length === 0) return []; // no regular types designed/unlocked yet
  // Spread this round's total wave size evenly across whichever types are
  // currently unlocked, so per-type count self-adjusts as new types unlock
  // rather than needing its own separate curve.
  const perTypeCount = Math.max(1, Math.round(getTotalWaveSize(round) / unlocked.length));

  return unlocked.map((key) => {
    const type = ENEMY_TYPES[key];
    return {
      enemyKey: key,
      name: type.name,
      color: type.color,
      radius: type.radius,
      count: perTypeCount,
      health: Math.round(type.health * scaling.healthMultiplier),
      speedMultiplier: type.speedMultiplier,
      isBoss: false,
      bounty: type.bounty,
    };
  });
}

// Live enemy instances for the current wave.
let activeEnemies = [];

// Facing direction baked into each type's hand-drawn art (the angle, in the
// un-rotated drawing, that the enemy's "front" points toward) — used to
// offset the computed movement heading so the art actually turns to face
// where it's walking instead of just rotating around an arbitrary pivot.
// Empty for now along with the roster itself (see ENEMY_TYPES above) — a
// missing key already defaults to 0 wherever this is read (renderEnemies'
// `?? 0`), which is a perfectly fine default for art with no strong
// left/right "head" side, so there's nothing else to degrade here.
const ENEMY_FACING_OFFSET = {};
// Keyed by enemyKey (e.g. 'boss-tier-1'), same as ENEMY_FACING_OFFSET,
// since different boss tiers can have different default facing directions
// baked into their own art.
const BOSS_FACING_OFFSET = {};

function getInitialPathHeading() {
  const dx = MAP_PATH_WAYPOINTS[1].x - MAP_PATH_WAYPOINTS[0].x;
  const dy = MAP_PATH_WAYPOINTS[1].y - MAP_PATH_WAYPOINTS[0].y;
  return Math.atan2(dy, dx);
}

// Shared by spawnWave() and spawnSingleEnemy() (Sandbox mode) so the two
// spawning paths can't drift apart on the enemy object's own shape —
// that's bitten this file before (immobilizedRemaining was added in one
// place and had to be remembered everywhere else enemies get created).
function createEnemyInstance(entry, spawnDelay) {
  return {
    enemyKey: entry.enemyKey,
    name: entry.name,
    color: entry.color,
    radius: entry.radius,
    maxHealth: entry.health,
    health: entry.health,
    speed: BASE_SPEED * entry.speedMultiplier,
    isBoss: entry.isBoss,
    bounty: entry.bounty,
    waypointIndex: 0,
    x: MAP_PATH_WAYPOINTS[0].x,
    y: MAP_PATH_WAYPOINTS[0].y,
    heading: getInitialPathHeading(),
    spawnDelay,
    spawned: false,
    immobilizedRemaining: 0, // seconds left held in place by Root Path's Tanglement grab, if any
    // Millipede-family only: a trail of recent head positions, spaced by
    // arc length (not time), that trailing body segments read their own
    // position from — see recordTrailPoint()/renderMillipedeBody() below.
    // null (not []) for everything else, so the cheap `enemy.trail &&` check
    // in updateEnemies skips non-millipede enemies with no work at all.
    trail: MILLIPEDE_FAMILY_KEYS.has(entry.enemyKey) ? [] : null,
    // Mushroom's Zombify: a spore kill can raise a non-boss enemy as a
    // zombie instead of removing it — see turnIntoZombie()/
    // updateZombieMovement() below. zombieExplosionDamage is carried per-
    // zombie (set when it's created) rather than read from a shared
    // constant, since different Mushroom towers can be at different tiers.
    isZombie: false,
    markedForRemoval: false,
    zombieExplosionDamage: 0,
  };
}

function spawnWave(composition) {
  activeEnemies = [];
  let spawnDelay = 0;

  composition.forEach((entry) => {
    for (let i = 0; i < entry.count; i += 1) {
      activeEnemies.push(createEnemyInstance(entry, spawnDelay));
      spawnDelay += 0.5; // stagger spawns half a second apart so they don't overlap
    }
  });
}

// Horde Mode's spawner: same per-enemy 0.5s stagger as spawnWave() above,
// but appends to whatever's already alive instead of replacing it — Horde
// has no "wave" boundary to clear first, so each new batch has to land on
// top of however many enemies (from earlier batches) are still alive.
// Returns the batch's own total stagger duration (seconds from this call
// until its last enemy spawns) so the caller can time the *next* batch to
// start exactly then — see startHordeBatch() in game.js — keeping the
// overall spawn cadence seamless instead of bursty.
function spawnWaveAdditive(composition) {
  let spawnDelay = 0;

  composition.forEach((entry) => {
    for (let i = 0; i < entry.count; i += 1) {
      activeEnemies.push(createEnemyInstance(entry, spawnDelay));
      spawnDelay += 0.5;
    }
  });

  return Math.max(0, spawnDelay - 0.5);
}

// Sandbox mode: spawns exactly one enemy immediately (no stagger delay —
// this is a deliberate single click, not part of a wave), appended to
// whatever's already alive rather than replacing it like spawnWave() does.
function spawnSingleEnemy(entry) {
  activeEnemies.push(createEnemyInstance(entry, 0));
}

// Tier-1 + tier-2 regular enemies, then every designed boss tier, in that
// order — used by Sandbox's spawn palette (see
// renderSandboxSpawnSection() in game.js) to list every enemy type that
// could ever be spawnable, regardless of whether it's been unlocked yet.
function getAllSpawnableEnemyKeys() {
  const bossKeys = Object.keys(BOSS_TYPES).map((tier) => `boss-tier-${tier}`);
  return [...ENEMY_ORDER, ...ENEMY_ORDER_TIER2, ...ENEMY_ORDER_TIER3, ...bossKeys];
}

// Looks up a spawn-ready entry (same shape generateWave() produces, base
// stats only — Sandbox doesn't apply round/mode scaling) for any key
// getAllSpawnableEnemyKeys() can return. Returns null for an unknown key
// rather than throwing, so a bad/renamed key just fails to spawn instead
// of crashing the panel.
function getSpawnEntryForEnemyKey(key) {
  if (key.startsWith('boss-tier-')) {
    const tier = Number(key.slice('boss-tier-'.length));
    const boss = BOSS_TYPES[tier];
    if (!boss) return null;
    return {
      enemyKey: key,
      name: boss.name,
      color: boss.color,
      radius: boss.radius,
      health: boss.health,
      speedMultiplier: boss.speedMultiplier,
      isBoss: true,
      bounty: boss.bounty,
    };
  }

  const type = ENEMY_TYPES[key];
  if (!type) return null;
  return {
    enemyKey: key,
    name: type.name,
    color: type.color,
    radius: type.radius,
    health: type.health,
    speedMultiplier: type.speedMultiplier,
    isBoss: false,
    bounty: type.bounty,
  };
}

// Combat helpers — kept here alongside the enemy data/state they act on.
function findNearestEnemyInRange(x, y, range) {
  let closest = null;
  let closestDist = Infinity;

  activeEnemies.forEach((enemy) => {
    // Zombies (Mushroom's Zombify) are deliberately excluded — "not
    // targetable/attackable by towers" — same as the spawn/health checks.
    if (!enemy.spawned || enemy.health <= 0 || enemy.isZombie) return;
    const dist = Math.hypot(enemy.x - x, enemy.y - y);
    if (dist <= range && dist < closestDist) {
      closest = enemy;
      closestDist = dist;
    }
  });

  return closest;
}

// Unlike findNearestEnemyInRange (single-target), this returns every live
// enemy within radius — for AoE effects like a magma puddle or orbiting embers.
function getEnemiesInRadius(x, y, radius) {
  return activeEnemies.filter(
    (enemy) =>
      enemy.spawned && enemy.health > 0 && !enemy.isZombie && Math.hypot(enemy.x - x, enemy.y - y) <= radius
  );
}

function damageEnemy(enemy, amount) {
  enemy.health -= amount;
}

function applyBurn(enemy, burn) {
  enemy.burn = { damagePerSecond: burn.damagePerSecond, remaining: burn.duration };
}

function updateEnemies(deltaSeconds) {
  activeEnemies.forEach((enemy) => {
    // Already dead, just waiting to be swept up below — don't let it take
    // another burn tick or keep moving for the one extra frame before removal.
    if (enemy.health <= 0) return;

    // A zombie (Mushroom's Zombify) is a completely separate little state
    // machine — it shambles backward toward the path's start instead of
    // forward, doesn't spawn-delay/burn/get held, and is removed via its
    // own markedForRemoval flag rather than health reaching 0 (a zombie's
    // health is kept positive specifically so it's immune to the normal
    // "killed" sweep below — see turnIntoZombie()).
    if (enemy.isZombie) {
      updateZombieMovement(enemy, deltaSeconds);
      return;
    }

    if (!enemy.spawned) {
      enemy.spawnDelay -= deltaSeconds;
      if (enemy.spawnDelay > 0) return;
      enemy.spawned = true;
    }

    if (enemy.burn) {
      damageEnemy(enemy, enemy.burn.damagePerSecond * deltaSeconds);
      enemy.burn.remaining -= deltaSeconds;
      if (enemy.burn.remaining <= 0) enemy.burn = null;
    }

    // Grabbed by a Tanglement root — held in place (movement only; burn
    // above still ticks normally) until the hold expires.
    if (enemy.immobilizedRemaining > 0) {
      enemy.immobilizedRemaining = Math.max(0, enemy.immobilizedRemaining - deltaSeconds);
      return;
    }

    let remaining = enemy.speed * deltaSeconds;
    while (remaining > 0 && enemy.waypointIndex < MAP_PATH_WAYPOINTS.length - 1) {
      const target = MAP_PATH_WAYPOINTS[enemy.waypointIndex + 1];
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      enemy.heading = Math.atan2(dy, dx);

      if (dist <= remaining) {
        enemy.x = target.x;
        enemy.y = target.y;
        enemy.waypointIndex += 1;
        remaining -= dist;
      } else {
        enemy.x += (dx / dist) * remaining;
        enemy.y += (dy / dist) * remaining;
        remaining = 0;
      }
    }

    if (enemy.trail) recordTrailPoint(enemy);
  });

  // Enemies that died this frame (for bounty payout) — distinct from ones
  // that merely reached the final waypoint, which pay no bounty. Zombies
  // are excluded here even though a zombie's own origin enemy did die (that
  // death just never reached this point — see turnIntoZombie(), called
  // from resolveProjectile() before this sweep ever sees it as "killed")
  // — a zombie's own eventual removal (below) is never a bounty-eligible
  // kill either.
  const killed = activeEnemies.filter((enemy) => enemy.health <= 0 && !enemy.isZombie);

  // Drop enemies that died or reached the final waypoint (the base/goal,
  // for now — there's no base-health/lose-condition system yet) — or, for
  // a zombie, that it exploded (collided with a living enemy, or reached
  // the path's start) this frame.
  activeEnemies = activeEnemies.filter((enemy) => {
    if (enemy.isZombie) return !enemy.markedForRemoval;
    return enemy.health > 0 && enemy.waypointIndex < MAP_PATH_WAYPOINTS.length - 1;
  });

  return killed;
}

// Converts a just-killed, non-boss enemy into a zombie instead of letting
// it be swept up as a normal kill — called from resolveProjectile() in
// game.js the instant a Mushroom spore's zombify roll succeeds, which
// happens *after* this frame's updateEnemies() has already run (see
// update()'s call order in game.js), so setting health back to a positive
// number here is enough to keep the enemy out of the next frame's normal
// "killed" sweep for good; isZombie routes it to updateZombieMovement()
// instead of ordinary forward movement from here on.
function turnIntoZombie(enemy, explosionDamage) {
  enemy.isZombie = true;
  enemy.health = 1;
  enemy.zombieExplosionDamage = explosionDamage;
  // enemy.waypointIndex is left as-is: it's already "the waypoint behind
  // the enemy's current position" (forward movement always targets
  // waypointIndex + 1), which is exactly the first target a backward walk
  // needs.
}

// How close a zombie needs to get to a living enemy to detonate.
const ZOMBIE_COLLISION_RADIUS = 18;

// Walks a zombie backward through the waypoint list (the mirror image of
// the forward-movement loop above) and checks for a collision with a
// living enemy after moving. Marks the zombie markedForRemoval — rather
// than setting health <= 0, which the normal sweep would treat as a real
// kill — whether it reached the start or blew up on something.
function updateZombieMovement(enemy, deltaSeconds) {
  let remaining = enemy.speed * deltaSeconds;
  while (remaining > 0 && enemy.waypointIndex >= 0) {
    const target = MAP_PATH_WAYPOINTS[enemy.waypointIndex];
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    enemy.heading = Math.atan2(dy, dx);

    if (dist <= remaining) {
      enemy.x = target.x;
      enemy.y = target.y;
      enemy.waypointIndex -= 1;
      remaining -= dist;
    } else {
      enemy.x += (dx / dist) * remaining;
      enemy.y += (dy / dist) * remaining;
      remaining = 0;
    }
  }

  if (enemy.waypointIndex < 0) {
    enemy.markedForRemoval = true; // reached the start — explodes harmlessly off-screen
    return;
  }

  // getEnemiesInRadius already excludes zombies (and the dead/unspawned),
  // so whatever it finds here is a legitimate, living, non-zombie victim.
  const [victim] = getEnemiesInRadius(enemy.x, enemy.y, ZOMBIE_COLLISION_RADIUS);
  if (victim) {
    damageEnemy(victim, enemy.zombieExplosionDamage);
    enemy.markedForRemoval = true;
  }
}

// Per-type hand-drawn art (Ant, Worm, Tiny Isopod, Fly, Giant Beetle,
// Tadpole, Baby Frog, Poison Dart Frog, Hammerhead Worm, Boss Toad) was
// removed along with the roster it drew (see ENEMY_TYPES/BOSS_TYPES
// above) — every one of those draw functions existed only to be dispatched
// to by enemyKey below, so none of them have any purpose with no types left
// to reference them. drawEnemyShape itself stays: every caller (renderEnemies,
// the Sandbox spawn-palette preview in game.js) keeps working unchanged,
// just drawing the generic fallback until new per-type art is added back
// here with its own dispatch branch.
function drawEnemyShape(ctx, enemy) {
  ctx.fillStyle = enemy.color;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
  ctx.fill();
}

// How far apart (in pixels actually walked, not time) consecutive trail
// points are recorded — independent of frame rate or game speed, since
// it's driven by distance moved, not frames elapsed.
const TRAIL_POINT_SPACING = 4;

// How many segments trail the head, and how far apart they sit — tuned per
// type (e.g. a bigger, more "many-legged"-looking type would want more,
// wider-spaced segments than a small one). Segment spacing is expressed as
// a multiple of the type's own radius so it scales sensibly with body
// size. Empty for now along with MILLIPEDE_FAMILY_KEYS above — add a type's
// key to both to opt it into this rendering. DEFAULT_MILLIPEDE_BODY is the
// fallback for any key missing its own entry here, so the mechanism itself
// stays exercisable/testable even with no types configured.
const MILLIPEDE_BODY = {};
const DEFAULT_MILLIPEDE_BODY = { segmentCount: 5, spacingFactor: 1.3 };

// Appends the enemy's current (x, y) to its trail once it's moved at least
// TRAIL_POINT_SPACING since the last recorded point — called from
// updateEnemies() after the normal waypoint-following movement above, so
// the trail only grows when the head actually moves (an immobilized enemy
// just doesn't add points, which is correct: its trailing segments
// shouldn't advance either while it's held in place). Trimmed to just
// enough points to cover the longest body this type will ever need, so the
// array doesn't grow unbounded over a long-lived enemy's lifetime.
function recordTrailPoint(enemy) {
  const last = enemy.trail[enemy.trail.length - 1];
  if (last && Math.hypot(enemy.x - last.x, enemy.y - last.y) < TRAIL_POINT_SPACING) return;

  enemy.trail.push({ x: enemy.x, y: enemy.y });

  const body = MILLIPEDE_BODY[enemy.enemyKey] || DEFAULT_MILLIPEDE_BODY;
  const maxPoints = Math.ceil((body.segmentCount * enemy.radius * body.spacingFactor) / TRAIL_POINT_SPACING) + 4;
  if (enemy.trail.length > maxPoints) enemy.trail.shift();
}

// Walks backward from the head through the trail, returning the point
// `distance` px of arc length behind it (interpolating between the two
// trail points straddling that distance for a smooth result, not just
// snapping to the nearest recorded sample). If the enemy hasn't moved far
// enough yet to have that much trail (e.g. it just spawned), returns the
// oldest point available rather than extrapolating past real data.
function getTrailPointAtDistance(enemy, distance) {
  let prevX = enemy.x;
  let prevY = enemy.y;
  let remaining = distance;

  for (let i = enemy.trail.length - 1; i >= 0; i -= 1) {
    const point = enemy.trail[i];
    const segmentLength = Math.hypot(prevX - point.x, prevY - point.y);
    if (segmentLength >= remaining) {
      const t = segmentLength === 0 ? 0 : remaining / segmentLength;
      return { x: prevX + (point.x - prevX) * t, y: prevY + (point.y - prevY) * t };
    }
    remaining -= segmentLength;
    prevX = point.x;
    prevY = point.y;
  }

  return enemy.trail.length ? enemy.trail[0] : { x: enemy.x, y: enemy.y };
}

// Draws one tapering, shaded body segment (reusing shadeColor from
// towers.js) at its own position and heading — the same "curved legs +
// shading" level of detail the single-piece enemies above use, just
// repeated per segment instead of once for the whole body.
function drawMillipedeSegment(ctx, x, y, radius, color, heading, segmentIndex) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);

  ctx.fillStyle = segmentIndex % 2 === 0 ? color : shadeColor(color, -14);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shadeColor(color, -30);
  ctx.lineWidth = 1.2;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(0, side * radius * 0.6);
    ctx.lineTo(radius * 0.5, side * radius * 1.1);
    ctx.stroke();
  });

  ctx.restore();
}

// The millipede-family renderer: draws the head at the enemy's own (x, y)/
// heading like any other enemy, then walks the trail to place each
// trailing segment at a fixed arc-length distance behind it, each with its
// own heading computed from the segment just ahead of it — this is what
// actually produces the "curls around corners" look instead of the whole
// body snapping to one rotation.
function renderMillipedeBody(ctx, enemy) {
  const body = MILLIPEDE_BODY[enemy.enemyKey] || DEFAULT_MILLIPEDE_BODY;
  const spacing = enemy.radius * body.spacingFactor;

  drawMillipedeSegment(ctx, enemy.x, enemy.y, enemy.radius, enemy.color, enemy.heading, 0);

  let prevX = enemy.x;
  let prevY = enemy.y;
  for (let i = 1; i <= body.segmentCount; i += 1) {
    const point = getTrailPointAtDistance(enemy, i * spacing);
    const heading = Math.atan2(point.y - prevY, point.x - prevX) + Math.PI; // facing back toward the segment ahead
    const taper = Math.max(0.4, 1 - i * 0.09);
    drawMillipedeSegment(ctx, point.x, point.y, enemy.radius * taper, enemy.color, heading, i);
    prevX = point.x;
    prevY = point.y;
  }
}

// A small toadstool sitting just above a zombie's head — the one visual
// cue that reads regardless of the zombie's original body shape/color.
function drawZombieMushroomCap(ctx, x, y, size) {
  ctx.fillStyle = '#c62828';
  ctx.beginPath();
  ctx.ellipse(x, y, size, size * 0.6, 0, Math.PI, 0, false);
  ctx.fill();

  ctx.fillStyle = '#fff8e1';
  [[-0.4, -0.15], [0, -0.3], [0.4, -0.15]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(x + dx * size, y + dy * size, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#efebe9';
  ctx.fillRect(x - size * 0.15, y, size * 0.3, size * 0.45);
}

function renderEnemies(ctx) {
  activeEnemies.forEach((enemy) => {
    if (!enemy.spawned) return;

    if (enemy.trail) {
      // Millipede family: each body segment has its own position (read
      // from the trail) and its own heading, rather than the whole body
      // snapping to one rigid rotation — see renderMillipedeBody() below.
      renderMillipedeBody(ctx, enemy);
    } else {
      // Rotate the art to face the enemy's current movement heading,
      // correcting for that type's own baked-in default facing direction
      // (see ENEMY_FACING_OFFSET/BOSS_FACING_OFFSET above). Pivoting
      // around the enemy's own (x, y) means drawEnemyShape's existing
      // e.x/e.y-based drawing code needs no changes — it's drawn exactly
      // as before, just inside a rotated context.
      const facingOffset = enemy.isBoss
        ? (BOSS_FACING_OFFSET[enemy.enemyKey] ?? 0)
        : (ENEMY_FACING_OFFSET[enemy.enemyKey] ?? 0);
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.heading + facingOffset);
      ctx.translate(-enemy.x, -enemy.y);
      if (enemy.isZombie) {
        // Zombies render green regardless of their original type's color —
        // cheapest way to reuse every type's existing art is to draw it
        // with enemy.color swapped out for the duration of this one call.
        const originalColor = enemy.color;
        enemy.color = '#4caf50';
        drawEnemyShape(ctx, enemy);
        enemy.color = originalColor;
      } else {
        drawEnemyShape(ctx, enemy);
      }
      ctx.restore();
      if (enemy.isZombie) drawZombieMushroomCap(ctx, enemy.x, enemy.y - enemy.radius - 6, enemy.radius * 0.55);
    }

    if (enemy.burn) {
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.arc(enemy.x + enemy.radius * 0.7, enemy.y - enemy.radius * 0.7, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // A dashed brown ring reads as "wrapped/held" while a Tanglement grab
    // is active — distinct from the burn marker's small dot.
    if (enemy.immobilizedRemaining > 0) {
      ctx.save();
      ctx.strokeStyle = '#4e342e';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const barWidth = enemy.radius * 2;
    const healthRatio = Math.max(0, enemy.health / enemy.maxHealth);
    ctx.fillStyle = '#000';
    ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 8, barWidth, 4);
    ctx.fillStyle = '#e53935';
    ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 8, barWidth * healthRatio, 4);
  });
}
