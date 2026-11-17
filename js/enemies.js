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

// `bounty` is the money awarded when the enemy dies (health hits 0, not
// when it reaches the goal) — generic per enemy type, not hardcoded per-kill.
// Bounty was originally set to roughly match health 1:1 (with a small flat
// bump for the very cheapest enemy so it's not worth nothing), but a later
// balance pass doubled every enemy's base health (Ant 1->2, Worm 5->10,
// Tiny Isopod 10->20, Giant Beetle 50->100, Tadpole 20->40, Baby Frog
// 30->60, Poison Dart Frog 50->100, Boss Toad 100->200) without touching
// bounty — so the ratio is now roughly 1:2 (bounty ≈ half of health), not
// 1:1 any more. Noted here so a future addition doesn't "restore" a 1:1
// ratio that's no longer the actual convention.
const ENEMY_TYPES = {
  ant: { name: 'Ant', speedMultiplier: 0.5, health: 2, color: '#8d6e63', radius: 8, bounty: 2 },
  worm: { name: 'Worm', speedMultiplier: 0.6, health: 10, color: '#c0ca33', radius: 10, bounty: 5 },
  tinyIsopod: { name: 'Tiny Isopod', speedMultiplier: 0.7, health: 20, color: '#78909c', radius: 12, bounty: 10 },
  // Fastest tier-1 enemy by a wide margin (1x vs. 0.5-0.7x for the other
  // three) but fragile — introduced last in tier 1 (see ENEMY_ORDER) so the
  // "fast bug" challenge shows up once a player already has some defense
  // established, rather than complicating round 1. Bounty: ~HP/2 like the
  // rest of the roster, rounded to the nearest dollar (3/2 = 1.5 -> 2).
  fly: { name: 'Fly', speedMultiplier: 1, health: 3, color: '#424242', radius: 6, bounty: 2 },
  // Tier 2 — unlocks after round 25 (see getUnlockedEnemyTypes), same
  // progressive-unlock mechanism as tier 1, just gated to start later.
  // A lighter olive than a real tadpole's near-black so it still reads
  // clearly against the forest floor's own dark green.
  tadpole: { name: 'Tadpole', speedMultiplier: 0.7, health: 40, color: '#5a7a3a', radius: 7, bounty: 20 },
  babyFrog: { name: 'Baby Frog', speedMultiplier: 0.6, health: 60, color: '#66bb6a', radius: 10, bounty: 30 },
  poisonDartFrog: { name: 'Poison Dart Frog', speedMultiplier: 0.65, health: 100, color: '#2979ff', radius: 9, bounty: 50 },
};

// Intro/difficulty order for tier 1 (unlocked from round 1) and tier 2
// (unlocked starting after round 25 — see getUnlockedEnemyTypes). Kept as
// two separate lists rather than one long ENEMY_ORDER so each tier unlocks
// on its own progressive every-5-rounds cadence instead of one continuous
// count across both.
const ENEMY_ORDER = ['ant', 'worm', 'tinyIsopod', 'fly'];
const ENEMY_ORDER_TIER2 = ['tadpole', 'babyFrog', 'poisonDartFrog'];

// Bosses, keyed by boss tier (tier 1 = round 25, tier 2 = round 50, ...).
// Add more tiers here as they're designed — getBossForRound() falls back to
// the strongest designed tier for any round whose tier isn't here yet.
const BOSS_TYPES = {
  1: { name: 'Giant Beetle', speedMultiplier: 0.4, health: 100, color: '#4e342e', radius: 18, bounty: 50 },
  // Bounty follows the same ~1:1-with-health convention as the regular
  // roster above (based on the pre-doubling health values, left as-is).
  2: { name: 'Boss Toad', speedMultiplier: 0.4, health: 200, color: '#558b2f', radius: 24, bounty: 100 },
};

const BOSS_INTERVAL = 25;

function isBossRound(round) {
  return round % BOSS_INTERVAL === 0;
}

function getBossForRound(round) {
  const tier = round / BOSS_INTERVAL;
  const designedTiers = Object.keys(BOSS_TYPES).map(Number);
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
// Ant/Giant Beetle draw their head/mandibles on the -x side; Worm draws its
// eyes on the +x side; Tiny Isopod has no directional features, so its
// offset is arbitrary.
// Tadpole/Baby Frog/Poison Dart Frog have no strong left/right "head" side
// in their art (see draw functions below), so 0 is as good a default as
// any for them.
const ENEMY_FACING_OFFSET = {
  ant: Math.PI,
  worm: 0,
  tinyIsopod: 0,
  fly: 0, // symmetric top-down silhouette, no strong head side
  tadpole: 0,
  babyFrog: 0,
  poisonDartFrog: 0,
};
// Keyed by enemyKey (e.g. 'boss-tier-1'), same as ENEMY_FACING_OFFSET,
// since different boss tiers can have different default facing directions
// baked into their own art.
const BOSS_FACING_OFFSET = { 'boss-tier-1': Math.PI, 'boss-tier-2': 0 };

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
  return [...ENEMY_ORDER, ...ENEMY_ORDER_TIER2, ...bossKeys];
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
    if (!enemy.spawned || enemy.health <= 0) return;
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
    (enemy) => enemy.spawned && enemy.health > 0 && Math.hypot(enemy.x - x, enemy.y - y) <= radius
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
  });

  // Enemies that died this frame (for bounty payout) — distinct from ones
  // that merely reached the final waypoint, which pay no bounty.
  const killed = activeEnemies.filter((enemy) => enemy.health <= 0);

  // Drop enemies that died or reached the final waypoint (the base/goal,
  // for now — there's no base-health/lose-condition system yet).
  activeEnemies = activeEnemies.filter(
    (enemy) => enemy.health > 0 && enemy.waypointIndex < MAP_PATH_WAYPOINTS.length - 1
  );

  return killed;
}

// Simple, distinguishable silhouettes per enemy type — canvas primitives
// only, no external art. A step up from flat shapes (curved limbs, a touch
// of shading/highlight via shadeColor from towers.js) but still just a
// handful of draw calls each, since dozens of these can be on screen at
// once — no gradients or per-frame object allocation.
function drawAnt(ctx, e) {
  ctx.strokeStyle = '#2b1c12';
  ctx.lineWidth = 1.5;
  [-1, 0, 1].forEach((i) => {
    const kneeY = e.y + i * e.radius * 0.5;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.quadraticCurveTo(e.x - e.radius * 0.7, kneeY, e.x - e.radius * 1.3, e.y + i * e.radius * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.quadraticCurveTo(e.x + e.radius * 0.7, kneeY, e.x + e.radius * 1.3, e.y + i * e.radius * 0.6);
    ctx.stroke();
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.9, e.radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.9, e.y, e.radius * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // A small highlight on the abdomen suggests a glossy shell.
  ctx.fillStyle = shadeColor(e.color, 25);
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.15, e.y - e.radius * 0.2, e.radius * 0.3, e.radius * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.2, e.y - e.radius * 0.1);
  ctx.lineTo(e.x - e.radius * 1.7, e.y - e.radius * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.2, e.y + e.radius * 0.1);
  ctx.lineTo(e.x - e.radius * 1.7, e.y + e.radius * 0.5);
  ctx.stroke();
}

function drawWorm(ctx, e) {
  const segments = 3;
  for (let i = 0; i < segments; i += 1) {
    const offset = (i - (segments - 1) / 2) * e.radius * 0.8;
    // Alternating light/dark segments read as a simple ribbed body.
    ctx.fillStyle = i % 2 === 0 ? e.color : shadeColor(e.color, -15);
    ctx.beginPath();
    ctx.arc(e.x + offset, e.y, e.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes on the lead (front) segment.
  const frontOffset = ((segments - 1) / 2) * e.radius * 0.8;
  ctx.fillStyle = '#212121';
  ctx.beginPath();
  ctx.arc(e.x + frontOffset + e.radius * 0.15, e.y - e.radius * 0.2, e.radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x + frontOffset + e.radius * 0.15, e.y + e.radius * 0.2, e.radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawTinyIsopod(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // A lighter top band gives the shell some roundness.
  ctx.fillStyle = shadeColor(e.color, 20);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y - e.radius * 0.25, e.radius * 0.85, e.radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#37474f';
  ctx.lineWidth = 1.5;
  [-1, 0, 1].forEach((i) => {
    ctx.beginPath();
    ctx.moveTo(e.x + i * e.radius * 0.4, e.y - e.radius * 0.6);
    ctx.lineTo(e.x + i * e.radius * 0.4, e.y + e.radius * 0.6);
    ctx.stroke();
  });
}

// Small, round body with a pair of translucent wings and red compound eyes
// — the fastest tier-1 enemy, so a silhouette distinct enough to spot at a
// glance amid slower bugs.
function drawFly(ctx, e) {
  ctx.fillStyle = 'rgba(224, 224, 224, 0.55)';
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.3, e.y - e.radius * 0.5, e.radius * 0.55, e.radius * 0.3, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.3, e.y - e.radius * 0.5, e.radius * 0.55, e.radius * 0.3, 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.6, e.radius * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#c62828';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.25, e.y - e.radius * 0.5, e.radius * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 0.25, e.y - e.radius * 0.5, e.radius * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function drawGiantBeetle(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.9, e.y, e.radius * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // A shell highlight — a boss is rare on screen, so it can afford a bit
  // more detail than the common enemies above.
  ctx.fillStyle = shadeColor(e.color, 18);
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.1, e.y - e.radius * 0.3, e.radius * 0.5, e.radius * 0.2, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 1.05, e.y - e.radius * 0.15, e.radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 1.05, e.y + e.radius * 0.15, e.radius * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#2a1a10';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - e.radius * 0.7);
  ctx.lineTo(e.x, e.y + e.radius * 0.7);
  ctx.stroke();

  // Mandibles.
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.3, e.y - e.radius * 0.2);
  ctx.quadraticCurveTo(e.x - e.radius * 1.6, e.y - e.radius * 0.35, e.x - e.radius * 1.75, e.y - e.radius * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.3, e.y + e.radius * 0.2);
  ctx.quadraticCurveTo(e.x - e.radius * 1.6, e.y + e.radius * 0.35, e.x - e.radius * 1.75, e.y + e.radius * 0.1);
  ctx.stroke();
}

// Tier 2 (post-round-25) roster — same hand-drawn-primitives discipline as
// the tier-1 shapes above, each still distinguishable at a glance.
function drawTadpole(ctx, e) {
  // A teardrop tail trailing behind the round head (head faces +x by
  // default, matching ENEMY_FACING_OFFSET.tadpole === 0).
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.6, e.y);
  ctx.quadraticCurveTo(e.x - e.radius * 1.8, e.y - e.radius * 0.7, e.x - e.radius * 2.4, e.y);
  ctx.quadraticCurveTo(e.x - e.radius * 1.8, e.y + e.radius * 0.7, e.x - e.radius * 0.6, e.y);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
  ctx.fill();

  // A small highlight so the round head doesn't read as a flat disc.
  ctx.fillStyle = shadeColor(e.color, 25);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.15, e.y - e.radius * 0.3, e.radius * 0.35, e.radius * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 0.3, e.y - e.radius * 0.3, e.radius * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 0.3, e.y + e.radius * 0.3, e.radius * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

function drawBabyFrog(ctx, e) {
  // Folded back legs, bulging on each side.
  ctx.fillStyle = shadeColor(e.color, -10);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.7, e.y + e.radius * 0.4, e.radius * 0.5, e.radius * 0.32, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.7, e.y + e.radius * 0.4, e.radius * 0.5, e.radius * 0.32, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bulging eyes on top — a frog's most recognizable feature.
  [-0.35, 0.35].forEach((dx) => {
    ctx.fillStyle = shadeColor(e.color, 15);
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y - e.radius * 0.6, e.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y - e.radius * 0.6, e.radius * 0.12, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPoisonDartFrog(ctx, e) {
  // Same body plan as the baby frog, but with contrasting dark spots on a
  // vivid base color — the classic "poison" warning-color cue.
  ctx.fillStyle = shadeColor(e.color, -10);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.7, e.y + e.radius * 0.4, e.radius * 0.5, e.radius * 0.32, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.7, e.y + e.radius * 0.4, e.radius * 0.5, e.radius * 0.32, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1b1b1b';
  [[-0.4, -0.15], [0.35, -0.25], [0, 0.3], [0.45, 0.15], [-0.35, 0.3]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y + dy * e.radius, e.radius * 0.14, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - 0.3 * e.radius, e.y - e.radius * 0.55, e.radius * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x + 0.3 * e.radius, e.y - e.radius * 0.55, e.radius * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawBossToad(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Warts — a boss-sized toad can afford a bit more surface detail than the
  // common enemies above, same as Giant Beetle's shell highlight.
  ctx.fillStyle = shadeColor(e.color, -18);
  [[-0.5, -0.3], [0.4, -0.4], [0.1, 0.1], [-0.2, 0.4], [0.5, 0.3]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y + dy * e.radius, e.radius * 0.12, 0, Math.PI * 2);
    ctx.fill();
  });

  [-0.4, 0.4].forEach((dx) => {
    ctx.fillStyle = shadeColor(e.color, 25);
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y - e.radius * 0.65, e.radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c62828';
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y - e.radius * 0.65, e.radius * 0.13, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.strokeStyle = '#1b2e0e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.6, e.y + e.radius * 0.15);
  ctx.quadraticCurveTo(e.x, e.y + e.radius * 0.45, e.x + e.radius * 0.6, e.y + e.radius * 0.15);
  ctx.stroke();
}

function drawEnemyShape(ctx, enemy) {
  if (enemy.isBoss) {
    if (enemy.enemyKey === 'boss-tier-2') {
      drawBossToad(ctx, enemy);
    } else {
      drawGiantBeetle(ctx, enemy);
    }
    return;
  }
  if (enemy.enemyKey === 'ant') {
    drawAnt(ctx, enemy);
  } else if (enemy.enemyKey === 'worm') {
    drawWorm(ctx, enemy);
  } else if (enemy.enemyKey === 'tinyIsopod') {
    drawTinyIsopod(ctx, enemy);
  } else if (enemy.enemyKey === 'fly') {
    drawFly(ctx, enemy);
  } else if (enemy.enemyKey === 'tadpole') {
    drawTadpole(ctx, enemy);
  } else if (enemy.enemyKey === 'babyFrog') {
    drawBabyFrog(ctx, enemy);
  } else if (enemy.enemyKey === 'poisonDartFrog') {
    drawPoisonDartFrog(ctx, enemy);
  } else {
    // Fallback for any future enemy type without custom art yet.
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderEnemies(ctx) {
  activeEnemies.forEach((enemy) => {
    if (!enemy.spawned) return;

    // Rotate the art to face the enemy's current movement heading, correcting
    // for that type's own baked-in default facing direction (see
    // ENEMY_FACING_OFFSET/BOSS_FACING_OFFSET above). Pivoting around the
    // enemy's own (x, y) means drawEnemyShape's existing e.x/e.y-based
    // drawing code needs no changes — it's drawn exactly as before, just
    // inside a rotated context.
    const facingOffset = enemy.isBoss
      ? (BOSS_FACING_OFFSET[enemy.enemyKey] ?? 0)
      : (ENEMY_FACING_OFFSET[enemy.enemyKey] ?? 0);
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.heading + facingOffset);
    ctx.translate(-enemy.x, -enemy.y);
    drawEnemyShape(ctx, enemy);
    ctx.restore();

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
