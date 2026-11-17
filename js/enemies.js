// Enemy + wave data model and spawning scaffolding.
//
// Speed is expressed as a multiplier of BASE_SPEED (pixels/second) — the
// speed a 1.0x-speed enemy would move at. Health is absolute hit points.
//
// Enemies move by following PATH_WAYPOINTS, an ordered list of {x, y}
// points. For now this is a placeholder straight line across the canvas's
// vertical center (there's no map yet); once a real map/path exists,
// replace PATH_WAYPOINTS with its waypoints and this movement code keeps
// working unchanged.

const BASE_SPEED = 60; // px/second

const ENEMY_TYPES = {
  ant: { name: 'Ant', speedMultiplier: 0.5, health: 1, color: '#8d6e63', radius: 8 },
  worm: { name: 'Worm', speedMultiplier: 0.6, health: 5, color: '#c0ca33', radius: 10 },
  tinyIsopod: { name: 'Tiny Isopod', speedMultiplier: 0.7, health: 10, color: '#78909c', radius: 12 },
};

// Intro/difficulty order. Also gates which enemy types are unlocked at a
// given round (see getUnlockedEnemyTypes).
const ENEMY_ORDER = ['ant', 'worm', 'tinyIsopod'];

// Bosses, keyed by boss tier (tier 1 = round 25, tier 2 = round 50, ...).
// Only tier 1 is designed so far — add more tiers here as they're designed.
const BOSS_TYPES = {
  1: { name: 'Giant Beetle', speedMultiplier: 0.4, health: 50, color: '#4e342e', radius: 18 },
};

const BOSS_INTERVAL = 25;

const PATH_WAYPOINTS = [
  { x: -20, y: 320 },
  { x: 980, y: 320 },
];

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
// { enemyKey, name, color, radius, count, health, speedMultiplier, isBoss }
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
        waypointIndex: 0,
        x: PATH_WAYPOINTS[0].x,
        y: PATH_WAYPOINTS[0].y,
        spawnDelay,
        spawned: false,
      });
      spawnDelay += 0.5; // stagger spawns half a second apart so they don't overlap
    }
  });
}

function updateEnemies(deltaSeconds) {
  activeEnemies.forEach((enemy) => {
    if (!enemy.spawned) {
      enemy.spawnDelay -= deltaSeconds;
      if (enemy.spawnDelay > 0) return;
      enemy.spawned = true;
    }

    let remaining = enemy.speed * deltaSeconds;
    while (remaining > 0 && enemy.waypointIndex < PATH_WAYPOINTS.length - 1) {
      const target = PATH_WAYPOINTS[enemy.waypointIndex + 1];
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

  // Drop enemies that reached the final waypoint (the base/goal, for now).
  activeEnemies = activeEnemies.filter(
    (enemy) => enemy.waypointIndex < PATH_WAYPOINTS.length - 1
  );
}

function renderEnemies(ctx) {
  activeEnemies.forEach((enemy) => {
    if (!enemy.spawned) return;

    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();

    const barWidth = enemy.radius * 2;
    const healthRatio = enemy.health / enemy.maxHealth;
    ctx.fillStyle = '#000';
    ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 8, barWidth, 4);
    ctx.fillStyle = '#e53935';
    ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 8, barWidth * healthRatio, 4);
  });
}
