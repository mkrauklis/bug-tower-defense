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
const ENEMY_TYPES = {
  ant: { name: 'Ant', speedMultiplier: 0.5, health: 1, color: '#8d6e63', radius: 8, bounty: 2 },
  worm: { name: 'Worm', speedMultiplier: 0.6, health: 5, color: '#c0ca33', radius: 10, bounty: 5 },
  tinyIsopod: { name: 'Tiny Isopod', speedMultiplier: 0.7, health: 10, color: '#78909c', radius: 12, bounty: 10 },
};

// Intro/difficulty order. Also gates which enemy types are unlocked at a
// given round (see getUnlockedEnemyTypes).
const ENEMY_ORDER = ['ant', 'worm', 'tinyIsopod'];

// Bosses, keyed by boss tier (tier 1 = round 25, tier 2 = round 50, ...).
// Only tier 1 is designed so far — add more tiers here as they're designed.
const BOSS_TYPES = {
  1: { name: 'Giant Beetle', speedMultiplier: 0.4, health: 50, color: '#4e342e', radius: 18, bounty: 50 },
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
  const unlockedCount = Math.min(ENEMY_ORDER.length, Math.floor((round - 1) / 5) + 1);
  return ENEMY_ORDER.slice(0, unlockedCount);
}

// Simple, generic round-over-round scaling: more enemies each round, and a
// little tougher every few rounds. Not tuned — just a reasonable baseline.
function getRoundScaling(round) {
  return {
    countMultiplier: 1 + (round - 1) * 0.2,
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

  return unlocked.map((key) => {
    const type = ENEMY_TYPES[key];
    return {
      enemyKey: key,
      name: type.name,
      color: type.color,
      radius: type.radius,
      count: Math.max(1, Math.round(3 * scaling.countMultiplier)),
      health: Math.round(type.health * scaling.healthMultiplier),
      speedMultiplier: type.speedMultiplier,
      isBoss: false,
      bounty: type.bounty,
    };
  });
}

// Live enemy instances for the current wave.
let activeEnemies = [];

function spawnWave(composition) {
  activeEnemies = [];
  let spawnDelay = 0;

  composition.forEach((entry) => {
    for (let i = 0; i < entry.count; i += 1) {
      activeEnemies.push({
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
        spawnDelay,
        spawned: false,
      });
      spawnDelay += 0.5; // stagger spawns half a second apart so they don't overlap
    }
  });
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

    let remaining = enemy.speed * deltaSeconds;
    while (remaining > 0 && enemy.waypointIndex < MAP_PATH_WAYPOINTS.length - 1) {
      const target = MAP_PATH_WAYPOINTS[enemy.waypointIndex + 1];
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const dist = Math.hypot(dx, dy);

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
// only, no external art. Scoped to visual clarity, not a detailed art pass.
function drawAnt(ctx, e) {
  ctx.strokeStyle = '#2b1c12';
  ctx.lineWidth = 1.5;
  [-1, 0, 1].forEach((i) => {
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x - e.radius * 1.3, e.y + i * e.radius * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + e.radius * 1.3, e.y + i * e.radius * 0.6);
    ctx.stroke();
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.9, e.radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.9, e.y, e.radius * 0.4, 0, Math.PI * 2);
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
  ctx.fillStyle = e.color;
  const segments = 3;
  for (let i = 0; i < segments; i += 1) {
    const offset = (i - (segments - 1) / 2) * e.radius * 0.8;
    ctx.beginPath();
    ctx.arc(e.x + offset, e.y, e.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTinyIsopod(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.7, 0, 0, Math.PI * 2);
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

function drawGiantBeetle(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.9, e.y, e.radius * 0.45, 0, Math.PI * 2);
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
}

function drawEnemyShape(ctx, enemy) {
  if (enemy.isBoss) {
    drawGiantBeetle(ctx, enemy);
    return;
  }
  if (enemy.enemyKey === 'ant') {
    drawAnt(ctx, enemy);
  } else if (enemy.enemyKey === 'worm') {
    drawWorm(ctx, enemy);
  } else if (enemy.enemyKey === 'tinyIsopod') {
    drawTinyIsopod(ctx, enemy);
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

    drawEnemyShape(ctx, enemy);

    if (enemy.burn) {
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.arc(enemy.x + enemy.radius * 0.7, enemy.y - enemy.radius * 0.7, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const barWidth = enemy.radius * 2;
    const healthRatio = Math.max(0, enemy.health / enemy.maxHealth);
    ctx.fillStyle = '#000';
    ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 8, barWidth, 4);
    ctx.fillStyle = '#e53935';
    ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 8, barWidth * healthRatio, 4);
  });
}
