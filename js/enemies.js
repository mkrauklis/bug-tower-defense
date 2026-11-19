// Enemy + wave data model and spawning scaffolding.
//
// Speed is expressed as a multiplier of BASE_SPEED (pixels/second) — the
// speed a 1.0x-speed enemy would move at. Health is absolute hit points.
//
// Enemies move by following one of the active map's paths (MAP_PATHS,
// defined in map.js — load that script before this one; each enemy picks
// its own path at spawn time and remembers it as enemy.pathIndex, since a
// map can have more than one — see Savanah). This movement code is
// path-shape-agnostic: it just walks whichever waypoint list it's given,
// so a different map's path(s) work without any change here.

const BASE_SPEED = 60; // px/second

// Per-map enemy rosters — each map (keyed by its *terrain*, not its map id;
// see js/map.js) has its own regular-enemy and boss roster, instead of one
// global roster every map shared. getActiveRoster() below picks whichever
// roster matches the currently active map, and every lookup function in
// this file (getUnlockedEnemyTypes/getBossForRound/generateWave/
// getAllSpawnableEnemyKeys/getSpawnEntryForEnemyKey) reads through it —
// the wave-generation/scaling machinery itself (count curve, health-per-
// round scaling, every-5-round unlock cadence, round-25/round-50 boss
// slots) is completely unchanged, just parameterized by roster instead of
// reading hardcoded module-level consts.
//
// A custom (editor-authored) map has no roster of its own — it reuses
// whichever built-in roster matches the terrain THEME it was decorated
// with (Deep Forest or Marshland), the same choice that already picks its
// decor generator (see createMapFromCustomRecord() in map.js). Since
// getActiveRoster() keys off terrain either way, this falls out for free:
// no custom-map-specific code needed here at all.
//
// Regular-enemy keys only need to be unique *within* their own roster —
// only one roster is ever active at a time, so "ant" existing in both
// rosters wouldn't be ambiguous gameplay-wise. Boss keys are the one
// exception: they're built programmatically below as
// `${terrain}-boss-tier-${tier}`, deliberately including the terrain,
// because defeatedEnemyKeys (game.js's Sandbox-unlock tracker) is one
// global Set shared across every map — without the terrain prefix,
// "boss-tier-1" would silently mean two different bosses depending which
// map you were on when you earned it.
const FOREST_ROSTER = {
  enemyTypes: {
    // Bounties follow the file's established ~HP/2 convention (rounded),
    // with Ant bumped from the literal round(2/2)=1 up to 2 so the
    // cheapest enemy in the game is never worth nothing — same exception
    // the original Ant entry made before the roster was replaced.
    ant: { name: 'Ant', speedMultiplier: 0.7, health: 2, color: '#8d6e63', radius: 7, bounty: 2 },
    fireAnt: { name: 'Fire Ant', speedMultiplier: 0.9, health: 3, color: '#d84315', radius: 8, bounty: 2 }, // round(3/2)=2
    armoredAnt: { name: 'Armored Ant', speedMultiplier: 0.6, health: 10, color: '#4e342e', radius: 10, bounty: 5 },
    babyBeetle: { name: 'Baby Beetle', speedMultiplier: 0.7, health: 25, color: '#558b2f', radius: 9, bounty: 13 },
    dungBeetle: { name: 'Dung Beetle', speedMultiplier: 0.6, health: 45, color: '#3e2723', radius: 10, bounty: 23 },
    tigerBeetle: { name: 'Tiger Beetle', speedMultiplier: 0.8, health: 50, color: '#2e7d32', radius: 9, bounty: 25 },
  },
  bossTypes: {
    1: { name: 'Queen Ant', speedMultiplier: 0.5, health: 50, color: '#6d4c41', radius: 20, bounty: 25 },
    2: { name: 'Longhorn Beetle', speedMultiplier: 0.6, health: 100, color: '#5d4037', radius: 22, bounty: 50 },
  },
  order: ['ant', 'fireAnt', 'armoredAnt'],
  orderTier2: ['babyBeetle', 'dungBeetle', 'tigerBeetle'],
  orderTier3: [], // no tier-3 roster designed for this map (yet) — degrades the same way an empty roster always has
};

const MARSH_ROSTER = {
  enemyTypes: {
    tadpole: { name: 'Tadpole', speedMultiplier: 0.5, health: 5, color: '#5a7a3a', radius: 7, bounty: 3 }, // round(5/2)=3
    froglet: { name: 'Froglet', speedMultiplier: 0.7, health: 10, color: '#66bb6a', radius: 8, bounty: 5 },
    // Notably slow/tanky relative to the other two tier-1 types — direct
    // from spec, not a typo: a 0.2x speed, 23 HP enemy this early acts as
    // a "soak damage, buys the other two time to get past" road-bump.
    frogLarva: { name: 'Frog Larva', speedMultiplier: 0.2, health: 23, color: '#c5c87a', radius: 11, bounty: 12 }, // round(11.5)=12
    appleSnail: { name: 'Apple Snail', speedMultiplier: 0.4, health: 50, color: '#d4a017', radius: 9, bounty: 25 },
    slug: { name: 'Slug', speedMultiplier: 0.5, health: 75, color: '#bf7e4a', radius: 10, bounty: 38 }, // round(37.5)=38
    assassinSnail: { name: 'Assassin Snail', speedMultiplier: 0.6, health: 85, color: '#6d4c23', radius: 9, bounty: 43 }, // round(42.5)=43
  },
  bossTypes: {
    1: { name: 'Frog Boss', speedMultiplier: 0.5, health: 65, color: '#33691e', radius: 20, bounty: 33 }, // round(32.5)=33
    2: { name: 'Military Helmet Snail', speedMultiplier: 0.3, health: 150, color: '#8d6e4a', radius: 24, bounty: 75 },
  },
  order: ['tadpole', 'froglet', 'frogLarva'],
  orderTier2: ['appleSnail', 'slug', 'assassinSnail'],
  orderTier3: [],
};

// Savanah: a desert roster, same tier1/boss25/tier2/boss50 shape as the
// other two. Bounties follow the same ~round(HP/2) convention (see each
// entry's own comment where it deviates from an exact half).
//
// Sandworm and Desert Termite (the boss) share a "tunnels underground"
// trait: tunnelInterval/tunnelDuration (seconds) are plain per-type data
// fields here, threaded straight through generateWave()/
// getSpawnEntryForEnemyKey() into the spawned entry exactly like health/
// speedMultiplier already are, rather than a separate membership Set
// (MILLIPEDE_FAMILY_KEYS's pattern) keyed by enemyKey — a boss's real
// enemyKey is assembled at runtime (`${terrain}-boss-tier-${tier}`, see
// generateWave()), which would make a Set entry for "the Savanah boss"
// awkward and easy to get out of sync with whichever tier is actually
// designed. Reading the fields straight off the roster type means any
// future enemy (on any map) opts into the same mechanic just by setting
// these two numbers on its own entry — see updateEnemies()'s tunnel-timer
// block and createEnemyInstance() below for the rest of the mechanic.
const SAVANAH_ROSTER = {
  enemyTypes: {
    sandLion: { name: 'Sand Lion', speedMultiplier: 0.7, health: 6, color: '#d2a24c', radius: 8, bounty: 3 },
    sandworm: {
      name: 'Sandworm',
      speedMultiplier: 0.6,
      health: 15,
      color: '#b8926a',
      radius: 8,
      bounty: 8, // round(7.5)=8
      tunnelInterval: 3,
      tunnelDuration: 2,
    },
    desertAnt: { name: 'Desert Ant', speedMultiplier: 1, health: 25, color: '#9c5a2e', radius: 7, bounty: 13 }, // round(12.5)=13
    giantLubberGrasshopper: {
      name: 'Giant Lubber Grasshopper',
      speedMultiplier: 0.5,
      health: 60,
      color: '#2b2a1f',
      radius: 11,
      bounty: 30,
    },
    desertPrayingMantis: {
      name: 'Desert Praying Mantis',
      speedMultiplier: 0.9,
      health: 50,
      color: '#a9a265',
      radius: 9,
      bounty: 25,
    },
    kissingBug: { name: 'Kissing Bug', speedMultiplier: 0.8, health: 75, color: '#2e1f1a', radius: 8, bounty: 38 }, // round(37.5)=38
  },
  bossTypes: {
    1: {
      name: 'Desert Termite',
      speedMultiplier: 0.6,
      health: 75,
      color: '#dcc89a',
      radius: 21,
      bounty: 38, // round(37.5)=38
      tunnelInterval: 3,
      tunnelDuration: 2,
    },
    2: { name: 'Blue Death Beetle', speedMultiplier: 0.7, health: 145, color: '#2c4f7c', radius: 22, bounty: 73 }, // round(72.5)=73
  },
  order: ['sandLion', 'sandworm', 'desertAnt'],
  orderTier2: ['giantLubberGrasshopper', 'desertPrayingMantis', 'kissingBug'],
  orderTier3: [],
};

// Keyed by TERRAIN id (map.js's TERRAIN_THEMES keys — 'forest'/'marsh'/
// 'desert'), not the map's own id ('deepForest'/'marshland'/'savanah') —
// getActiveRoster() below looks this up via getActiveMap().terrain.
const MAP_ROSTERS = { forest: FOREST_ROSTER, marsh: MARSH_ROSTER, desert: SAVANAH_ROSTER };

// Falls back to the Forest roster if the active map's terrain isn't a
// known key (shouldn't happen — every terrain id in map.js's
// TERRAIN_THEMES has a matching roster here — but better a sensible
// default than a crash) and to the Forest roster outright before any game
// has started (getActiveMap() defaults to Deep Forest at module load).
function getActiveRoster() {
  const map = getActiveMap();
  return (map && MAP_ROSTERS[map.terrain]) || FOREST_ROSTER;
}

// Enemy types whose body visibly curls around corners as a chain of
// segments following the head's own recent path, instead of the single
// rigid heading every other enemy uses — add a key here (and a matching
// entry in MILLIPEDE_BODY below) to opt a new type into it. Empty for both
// current rosters — ants/beetles/frogs/snails are all single-body
// creatures, nothing here warrants it. See recordTrailPoint()/
// renderMillipedeBody() below for the (still-intact) generic mechanism
// this drives, kept ready for a future multi-segment type.
const MILLIPEDE_FAMILY_KEYS = new Set();

const BOSS_INTERVAL = 25;

function isBossRound(round) {
  return round % BOSS_INTERVAL === 0;
}

// Returns null when the active roster has no boss tier designed at all
// (empty bossTypes) — generateWave() below turns that into a graceful
// empty wave rather than spawning a boss built from missing data.
function getBossForRound(round) {
  const roster = getActiveRoster();
  const designedTiers = Object.keys(roster.bossTypes).map(Number);
  if (designedTiers.length === 0) return null;

  const tier = round / BOSS_INTERVAL;
  const highestDesigned = Math.max(...designedTiers);
  // Fall back to the strongest designed boss tier if this one hasn't been
  // designed yet, rather than inventing a new boss.
  const useTier = roster.bossTypes[tier] ? tier : highestDesigned;
  return { tier: useTier, terrain: getActiveMap().terrain, ...roster.bossTypes[useTier] };
}

function getUnlockedEnemyTypes(round) {
  const roster = getActiveRoster();
  const tier1Count = Math.min(roster.order.length, Math.floor((round - 1) / 5) + 1);
  const unlocked = roster.order.slice(0, tier1Count);

  // Tier 2 starts unlocking the round right after the round-25 boss, on the
  // same progressive every-5-rounds cadence as tier 1, just starting later
  // (round 26 unlocks the first tier-2 type, round 31 the second, round 36
  // the third) rather than being available from round 1.
  if (round > BOSS_INTERVAL) {
    const roundsSinceTier2Start = round - (BOSS_INTERVAL + 1);
    const tier2Count = Math.min(roster.orderTier2.length, Math.floor(roundsSinceTier2Start / 5) + 1);
    unlocked.push(...roster.orderTier2.slice(0, tier2Count));
  }

  // Tier 3 starts unlocking the round right after the round-50 boss, same
  // cadence again (round 51 unlocks the first tier-3 type, 56 the second,
  // 61 the third, 66 the fourth).
  if (round > BOSS_INTERVAL * 2) {
    const roundsSinceTier3Start = round - (BOSS_INTERVAL * 2 + 1);
    const tier3Count = Math.min(roster.orderTier3.length, Math.floor(roundsSinceTier3Start / 5) + 1);
    unlocked.push(...roster.orderTier3.slice(0, tier3Count));
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
        enemyKey: `${boss.terrain}-boss-tier-${boss.tier}`,
        name: boss.name,
        color: boss.color,
        radius: boss.radius,
        count: 1,
        health: boss.health,
        speedMultiplier: boss.speedMultiplier,
        isBoss: true,
        bounty: boss.bounty,
        tunnelInterval: boss.tunnelInterval || 0,
        tunnelDuration: boss.tunnelDuration || 0,
      },
    ];
  }

  const scaling = getRoundScaling(round);
  const unlocked = getUnlockedEnemyTypes(round);
  if (unlocked.length === 0) return []; // no regular types designed/unlocked yet
  const roster = getActiveRoster();
  // Spread this round's total wave size evenly across whichever types are
  // currently unlocked, so per-type count self-adjusts as new types unlock
  // rather than needing its own separate curve.
  const perTypeCount = Math.max(1, Math.round(getTotalWaveSize(round) / unlocked.length));

  return unlocked.map((key) => {
    const type = roster.enemyTypes[key];
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
      tunnelInterval: type.tunnelInterval || 0,
      tunnelDuration: type.tunnelDuration || 0,
    };
  });
}

// Live enemy instances for the current wave.
let activeEnemies = [];

// Set by updateEnemies() on every call (see below) — the enemies that
// reached the goal alive *during that specific call*, not an accumulating
// list. game.js's update() reads this via getLastLeakedEnemies() right
// after calling updateEnemies() each tick.
let lastLeakedEnemies = [];

function getLastLeakedEnemies() {
  return lastLeakedEnemies;
}

// Facing direction baked into each type's hand-drawn art (the angle, in the
// un-rotated drawing, that the enemy's "front" points toward) — used to
// offset the computed movement heading so the art actually turns to face
// where it's walking instead of just rotating around an arbitrary pivot.
// A missing key defaults to 0 wherever this is read (renderEnemies' `?? 0`).
//
// Ant/beetle/snail art all draws its head/front-end on the -x side (same
// convention the original roster's Ant/Giant Beetle used), so they all get
// Math.PI. Tadpole/Froglet draw roughly symmetric or already front-facing
// +x, so 0. Frog Larva has no strong head side (a soft blob), so it's left
// out entirely (falls through to the 0 default) same as it would if listed.
const ENEMY_FACING_OFFSET = {
  ant: Math.PI,
  fireAnt: Math.PI,
  armoredAnt: Math.PI,
  babyBeetle: Math.PI,
  dungBeetle: Math.PI,
  tigerBeetle: Math.PI,
  tadpole: 0,
  froglet: 0,
  appleSnail: Math.PI,
  slug: Math.PI,
  assassinSnail: Math.PI,
  // Savanah: all drawn head/front-toward -x, same convention as every
  // other type above.
  sandLion: Math.PI,
  sandworm: Math.PI,
  desertAnt: Math.PI,
  giantLubberGrasshopper: Math.PI,
  desertPrayingMantis: Math.PI,
  kissingBug: Math.PI,
};
// Keyed by enemyKey (e.g. 'forest-boss-tier-1'), same as
// ENEMY_FACING_OFFSET, since different boss tiers can have different
// default facing directions baked into their own art.
const BOSS_FACING_OFFSET = {
  'forest-boss-tier-1': Math.PI, // Queen Ant — same ant-body convention as the regular ants
  'forest-boss-tier-2': Math.PI, // Longhorn Beetle — same beetle-body convention
  'marsh-boss-tier-1': 0, // Frog Boss — same tadpole/froglet convention
  'marsh-boss-tier-2': Math.PI, // Military Helmet Snail — same snail-body convention
  'desert-boss-tier-1': Math.PI, // Desert Termite — same ant-body convention (reuses drawAntBody); keyed by TERRAIN id, not map id ("desert", not "savanah") — see generateWave()'s enemyKey format
  'desert-boss-tier-2': Math.PI, // Blue Death Beetle — same beetle-body convention
};

function getInitialPathHeading(path) {
  const dx = path[1].x - path[0].x;
  const dy = path[1].y - path[0].y;
  return Math.atan2(dy, dx);
}

// Shared by spawnWave() and spawnSingleEnemy() (Sandbox mode) so the two
// spawning paths can't drift apart on the enemy object's own shape —
// that's bitten this file before (immobilizedRemaining was added in one
// place and had to be remembered everywhere else enemies get created).
function createEnemyInstance(entry, spawnDelay) {
  // Multi-path maps (Savanah): each enemy independently rolls which of the
  // map's paths it spawns onto, via the game's own seeded random() — the
  // simplest rule that needed no extra shared state (an alternating/evenly-
  // split rule would need a counter threaded through every spawn call
  // site). For a single-path map this is always 0, the only option, so
  // Deep Forest/Marshland enemies behave exactly as before. The enemy
  // keeps this path for its whole life — see updateEnemies()/
  // updateZombieMovement() below, both of which read MAP_PATHS[pathIndex]
  // rather than a single shared MAP_PATH_WAYPOINTS.
  const pathIndex = Math.floor(random() * MAP_PATHS.length);
  const path = MAP_PATHS[pathIndex];
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
    pathIndex,
    x: path[0].x,
    y: path[0].y,
    heading: getInitialPathHeading(path),
    spawnDelay,
    spawned: false,
    immobilizedRemaining: 0, // seconds left held in place by Root Path's Tanglement grab, if any
    // Mushroom's Infect Path: seconds left stopped by its periodic stun
    // roll — a separate field from immobilizedRemaining (not reused) so
    // the two effects' own distinct visuals (a dashed hold-ring vs. an
    // infected tint, see renderEnemies()) can't get conflated if an enemy
    // somehow has both active at once; movement is blocked while *either*
    // is above 0 (see updateEnemies()).
    infectedRemaining: 0,
    // Savanah's Sandworm/Desert Termite (and any future type that sets
    // tunnelInterval on its own roster entry — see SAVANAH_ROSTER's
    // comment above): tunnelCooldown counts down to the next tunnel
    // event; tunneledRemaining counts down while underground, during
    // which the enemy keeps moving (see updateEnemies()) but is
    // completely untargetable (see findNearestEnemyInRange/
    // getEnemiesInRadius below) and renders as a mound instead of its own
    // body (see renderEnemies()). Both 0 for every type without
    // tunnelInterval, so the `if (enemy.tunnelInterval > 0)` check in
    // updateEnemies skips non-tunnelers entirely — same cheap-skip shape
    // as `enemy.trail &&` above.
    tunnelInterval: entry.tunnelInterval || 0,
    tunnelDuration: entry.tunnelDuration || 0,
    tunnelCooldown: entry.tunnelInterval || 0,
    tunneledRemaining: 0,
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
  const roster = getActiveRoster();
  const terrain = getActiveMap().terrain;
  const bossKeys = Object.keys(roster.bossTypes).map((tier) => `${terrain}-boss-tier-${tier}`);
  return [...roster.order, ...roster.orderTier2, ...roster.orderTier3, ...bossKeys];
}

// Looks up a spawn-ready entry (same shape generateWave() produces, base
// stats only — Sandbox doesn't apply round/mode scaling) for any key
// getAllSpawnableEnemyKeys() can return. Returns null for an unknown key
// rather than throwing, so a bad/renamed key just fails to spawn instead
// of crashing the panel.
function getSpawnEntryForEnemyKey(key) {
  const roster = getActiveRoster();
  const bossPrefix = `${getActiveMap().terrain}-boss-tier-`;

  if (key.startsWith(bossPrefix)) {
    const tier = Number(key.slice(bossPrefix.length));
    const boss = roster.bossTypes[tier];
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
      tunnelInterval: boss.tunnelInterval || 0,
      tunnelDuration: boss.tunnelDuration || 0,
    };
  }

  const type = roster.enemyTypes[key];
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
    tunnelInterval: type.tunnelInterval || 0,
    tunnelDuration: type.tunnelDuration || 0,
  };
}

// Combat helpers — kept here alongside the enemy data/state they act on.
function findNearestEnemyInRange(x, y, range) {
  let closest = null;
  let closestDist = Infinity;

  activeEnemies.forEach((enemy) => {
    // Zombies (Mushroom's Zombify) are deliberately excluded — "not
    // targetable/attackable by towers" — same as the spawn/health checks.
    // A tunneled Sandworm/Desert Termite (Savanah) gets the same
    // treatment — genuinely untouchable while underground, not just
    // visually hidden — via the exact same exclusion check, generically,
    // for every tower/aura/Infect-stun roll that reads through this.
    if (!enemy.spawned || enemy.health <= 0 || enemy.isZombie || enemy.tunneledRemaining > 0) return;
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
      enemy.spawned &&
      enemy.health > 0 &&
      !enemy.isZombie &&
      enemy.tunneledRemaining <= 0 &&
      Math.hypot(enemy.x - x, enemy.y - y) <= radius
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
    // A zombie (Mushroom's Zombify) is a completely separate little state
    // machine — it shambles backward toward the path's start instead of
    // forward, doesn't spawn-delay/burn/get held, and is removed via its
    // own markedForRemoval flag rather than health reaching 0 (a zombie's
    // health is kept positive specifically so it's immune to the normal
    // "killed" sweep below — see turnIntoZombie()).
    //
    // Checked *before* the health<=0 short-circuit below, deliberately —
    // this used to be the other way around, which caused a real stuck-
    // forever bug: a projectile already in flight toward an enemy that
    // turned into a zombie from an *earlier*-resolving projectile the same
    // tick could still land on it (resolveProjectile's own fizzle check
    // didn't know about zombies either — now fixed there too), driving its
    // health back to <=0 while isZombie stayed true. With the health check
    // first, that combination hit the early return below before the
    // isZombie branch ever ran again — updateZombieMovement() stopped
    // being called, so the zombie never moved, never exploded, and never
    // got marked for removal: a permanently frozen, untargetable (zombies
    // are already excluded from findNearestEnemyInRange/getEnemiesInRadius
    // regardless of health), unkillable husk sitting on the map forever.
    // Checking isZombie first means a zombie always keeps running its own
    // state machine no matter what its health ends up at.
    if (enemy.isZombie) {
      updateZombieMovement(enemy, deltaSeconds);
      return;
    }

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

    // Tunneling (Savanah's Sandworm/Desert Termite): a periodic cooldown
    // that starts a tunneledRemaining countdown every tunnelInterval
    // seconds, surfacing again once tunnelDuration has elapsed. Ticks
    // unconditionally, regardless of the immobilize/infect check below —
    // a stun that lands before an enemy tunnels still freezes it (the
    // movement-blocking `return` below takes priority either way), but
    // the tunnel clock itself keeps running underneath so the enemy still
    // resurfaces on schedule once the stun wears off, and it stays
    // untargetable (findNearestEnemyInRange/getEnemiesInRadius above) the
    // entire time it's tunneled regardless of what else is happening to
    // it.
    if (enemy.tunnelInterval > 0) {
      if (enemy.tunneledRemaining > 0) {
        enemy.tunneledRemaining = Math.max(0, enemy.tunneledRemaining - deltaSeconds);
      } else {
        enemy.tunnelCooldown -= deltaSeconds;
        if (enemy.tunnelCooldown <= 0) {
          enemy.tunneledRemaining = enemy.tunnelDuration;
          enemy.tunnelCooldown += enemy.tunnelInterval;
        }
      }
    }

    // Grabbed by a Tanglement root, and/or stunned by Infect Path's spore
    // infection — either one alone (or both at once) holds the enemy in
    // place; movement only, burn above still ticks normally. Both timers
    // count down regardless of which one is actually still active, so
    // whichever ends first just quietly reaches 0 without affecting the
    // other.
    if (enemy.immobilizedRemaining > 0 || enemy.infectedRemaining > 0) {
      enemy.immobilizedRemaining = Math.max(0, enemy.immobilizedRemaining - deltaSeconds);
      enemy.infectedRemaining = Math.max(0, enemy.infectedRemaining - deltaSeconds);
      return;
    }

    // Falls back to path 0 for any enemy without its own pathIndex (a
    // synthetic test fixture, say) — harmless on every built-in map so far
    // since path 0 always exists, and exactly matches the old single-path
    // behavior for Deep Forest/Marshland.
    const path = MAP_PATHS[enemy.pathIndex || 0];
    let remaining = enemy.speed * deltaSeconds;
    while (remaining > 0 && enemy.waypointIndex < path.length - 1) {
      const target = path[enemy.waypointIndex + 1];
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

  // Enemies that reached the goal alive this frame (the base/player-health
  // system in game.js reads this right after calling updateEnemies() to
  // deduct health) — kept as a module-level var + getter (see
  // getLastLeakedEnemies() below) rather than changing updateEnemies()'s
  // own return value, so every existing caller/test that already destructures
  // "the killed array" out of that return value keeps working unchanged.
  lastLeakedEnemies = activeEnemies.filter(
    (enemy) =>
      !enemy.isZombie && enemy.health > 0 && enemy.waypointIndex >= MAP_PATHS[enemy.pathIndex || 0].length - 1
  );

  // Drop enemies that died or reached the final waypoint (the base/goal) —
  // or, for a zombie, that it exploded (collided with a living enemy, or
  // reached the path's start) this frame.
  activeEnemies = activeEnemies.filter((enemy) => {
    if (enemy.isZombie) return !enemy.markedForRemoval;
    return enemy.health > 0 && enemy.waypointIndex < MAP_PATHS[enemy.pathIndex || 0].length - 1;
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
  const path = MAP_PATHS[enemy.pathIndex || 0];
  let remaining = enemy.speed * deltaSeconds;
  while (remaining > 0 && enemy.waypointIndex >= 0) {
    const target = path[enemy.waypointIndex];
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

// Simple, distinguishable silhouettes per enemy type — canvas primitives
// only, no external art, same budget/style as the rest of the game (a
// handful of draw calls each, curved legs/shading via shadeColor from
// towers.js, no gradients or per-frame allocation). Ant/beetle/snail
// families share a body-shape helper so the family reads consistently at a
// glance while each member still gets its own color + a distinguishing
// detail on top.

// --- Deep Forest: ants -----------------------------------------------

function drawAntBody(ctx, e) {
  ctx.strokeStyle = shadeColor(e.color, -30);
  ctx.lineWidth = 1.2;
  [-1, 0, 1].forEach((i) => {
    const kneeY = e.y + i * e.radius * 0.45;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.quadraticCurveTo(e.x - e.radius * 0.6, kneeY, e.x - e.radius * 1.1, e.y + i * e.radius * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.quadraticCurveTo(e.x + e.radius * 0.6, kneeY, e.x + e.radius * 1.1, e.y + i * e.radius * 0.55);
    ctx.stroke();
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.8, e.radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.85, e.y, e.radius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shadeColor(e.color, -20);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.1, e.y - e.radius * 0.2);
  ctx.lineTo(e.x - e.radius * 1.5, e.y - e.radius * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.1, e.y + e.radius * 0.2);
  ctx.lineTo(e.x - e.radius * 1.5, e.y + e.radius * 0.5);
  ctx.stroke();
}

function drawAnt(ctx, e) {
  drawAntBody(ctx, e);
}

// Same body plan as the plain Ant (just a different color, which alone
// reads as a distinct enemy), plus a pair of visible mandibles up front —
// a touch more aggressive-looking to match the name.
function drawFireAnt(ctx, e) {
  drawAntBody(ctx, e);
  ctx.strokeStyle = '#3e1a0a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.15, e.y - e.radius * 0.1);
  ctx.quadraticCurveTo(e.x - e.radius * 1.45, e.y - e.radius * 0.3, e.x - e.radius * 1.6, e.y - e.radius * 0.05);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.15, e.y + e.radius * 0.1);
  ctx.quadraticCurveTo(e.x - e.radius * 1.45, e.y + e.radius * 0.3, e.x - e.radius * 1.6, e.y + e.radius * 0.05);
  ctx.stroke();
}

// Bulkier ant with a visible armor-plate highlight on the abdomen and a
// larger body overall (bigger radius, set in FOREST_ROSTER).
function drawArmoredAnt(ctx, e) {
  drawAntBody(ctx, e);
  ctx.fillStyle = shadeColor(e.color, 30);
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.1, e.y - e.radius * 0.15, e.radius * 0.45, e.radius * 0.2, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

// Boss: a much bigger ant with wings (queens are the only winged caste)
// and small gold crown flecks trailing behind the head.
function drawQueenAnt(ctx, e) {
  ctx.fillStyle = 'rgba(224, 224, 224, 0.5)';
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.15, e.y - e.radius * 0.6, e.radius * 0.7, e.radius * 0.32, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.15, e.y + e.radius * 0.6, e.radius * 0.7, e.radius * 0.32, 0.3, 0, Math.PI * 2);
  ctx.fill();

  drawAntBody(ctx, e);

  ctx.fillStyle = '#ffd54f';
  [[0.3, -0.18], [0.3, 0.18], [0.5, 0]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y + dy * e.radius, e.radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });
}

// --- Deep Forest: beetles ----------------------------------------------

function drawBeetleBody(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.85, e.y, e.radius * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - e.radius * 0.7);
  ctx.lineTo(e.x, e.y + e.radius * 0.7);
  ctx.stroke();

  ctx.fillStyle = shadeColor(e.color, 20);
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.15, e.y - e.radius * 0.3, e.radius * 0.4, e.radius * 0.15, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawBabyBeetle(ctx, e) {
  drawBeetleBody(ctx, e);
}

// Its signature feature: a small dirt/dung ball drawn just ahead of the
// head, pushed in front of it as it walks. A fixed relative position
// rather than an independently spinning animation — in keeping with this
// file's "no per-frame allocation" art budget for enemies (nothing else
// here animates beyond the shared heading-rotation every enemy already
// gets), but still clearly reads as "rolling a ball in front of it."
function drawDungBeetle(ctx, e) {
  drawBeetleBody(ctx, e);

  const ballX = e.x - e.radius * 1.75;
  ctx.fillStyle = '#3e2723';
  ctx.beginPath();
  ctx.arc(ballX, e.y, e.radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor('#3e2723', -20);
  [[-0.15, -0.15], [0.2, 0.1], [-0.05, 0.25]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(ballX + dx * e.radius, e.y + dy * e.radius, e.radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Pale stripe markings (the real insect's iridescent look) and long,
// prominent mandibles — tiger beetles are known for both.
function drawTigerBeetle(ctx, e) {
  drawBeetleBody(ctx, e);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;
  [-0.3, 0, 0.3].forEach((off) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 0.5, e.y + off * e.radius);
    ctx.lineTo(e.x + e.radius * 0.6, e.y + off * e.radius);
    ctx.stroke();
  });

  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.15, e.y - e.radius * 0.15);
  ctx.lineTo(e.x - e.radius * 1.55, e.y - e.radius * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.15, e.y + e.radius * 0.15);
  ctx.lineTo(e.x - e.radius * 1.55, e.y + e.radius * 0.35);
  ctx.stroke();
}

// Boss: a bigger beetle whose extremely long, sweeping antennae (the
// animal's namesake feature) are the whole visual point.
function drawLonghornBeetle(ctx, e) {
  drawBeetleBody(ctx, e);

  ctx.strokeStyle = shadeColor(e.color, -10);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.8, e.y - e.radius * 0.2);
  ctx.quadraticCurveTo(e.x + e.radius * 0.5, e.y - e.radius * 1.1, e.x + e.radius * 1.8, e.y - e.radius * 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.8, e.y + e.radius * 0.2);
  ctx.quadraticCurveTo(e.x + e.radius * 0.5, e.y + e.radius * 1.1, e.x + e.radius * 1.8, e.y + e.radius * 0.9);
  ctx.stroke();
}

// --- Marshland: amphibians ----------------------------------------------

// A teardrop tail trailing behind a round head — head faces +x by default,
// matching ENEMY_FACING_OFFSET.tadpole === 0.
function drawTadpole(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.6, e.y);
  ctx.quadraticCurveTo(e.x - e.radius * 1.8, e.y - e.radius * 0.7, e.x - e.radius * 2.3, e.y);
  ctx.quadraticCurveTo(e.x - e.radius * 1.8, e.y + e.radius * 0.7, e.x - e.radius * 0.6, e.y);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shadeColor(e.color, 25);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.15, e.y - e.radius * 0.3, e.radius * 0.35, e.radius * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 0.3, e.y - e.radius * 0.3, e.radius * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 0.3, e.y + e.radius * 0.3, e.radius * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

// Mid-metamorphosis: small leg nubs just emerging, but still a stub of the
// tadpole tail left over — distinct from both the pure Tadpole and the
// fully-legged Frog Boss below.
function drawFroglet(ctx, e) {
  ctx.fillStyle = shadeColor(e.color, -10);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.6, e.y + e.radius * 0.5, e.radius * 0.3, e.radius * 0.2, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.6, e.y + e.radius * 0.5, e.radius * 0.3, e.radius * 0.2, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.7, e.y);
  ctx.quadraticCurveTo(e.x - e.radius * 1.2, e.y - e.radius * 0.3, e.x - e.radius * 1.4, e.y);
  ctx.quadraticCurveTo(e.x - e.radius * 1.2, e.y + e.radius * 0.3, e.x - e.radius * 0.7, e.y);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.9, e.radius * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();

  [-0.3, 0.3].forEach((dx) => {
    ctx.fillStyle = shadeColor(e.color, 20);
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y - e.radius * 0.55, e.radius * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y - e.radius * 0.55, e.radius * 0.11, 0, Math.PI * 2);
    ctx.fill();
  });
}

// A plump, soft-bodied blob with translucent-looking internal speckles and
// just a small tail nub — no legs yet, earlier-stage than even the
// Tadpole visually, matching its outsized HP/tankiness for this tier.
function drawFrogLarva(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shadeColor(e.color, 25);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.1, e.y - e.radius * 0.3, e.radius * 0.5, e.radius * 0.22, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shadeColor(e.color, -25);
  [[-0.3, 0.1], [0.2, -0.1], [0, 0.35], [0.35, 0.2], [-0.4, -0.2]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y + dy * e.radius, e.radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 1.05, e.y, e.radius * 0.3, e.radius * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Boss: a full adult frog — bulging eyes, a wide mouth line, properly
// folded-back legs instead of Froglet's small nubs.
function drawFrogBoss(ctx, e) {
  ctx.fillStyle = shadeColor(e.color, -10);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.7, e.y + e.radius * 0.45, e.radius * 0.55, e.radius * 0.35, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.7, e.y + e.radius * 0.45, e.radius * 0.55, e.radius * 0.35, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();

  [-0.35, 0.35].forEach((dx) => {
    ctx.fillStyle = shadeColor(e.color, 22);
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y - e.radius * 0.62, e.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y - e.radius * 0.62, e.radius * 0.13, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.strokeStyle = shadeColor(e.color, -35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.55, e.y + e.radius * 0.15);
  ctx.quadraticCurveTo(e.x, e.y + e.radius * 0.4, e.x + e.radius * 0.55, e.y + e.radius * 0.15);
  ctx.stroke();
}

// --- Marshland: mollusks -------------------------------------------------

function drawSnailBody(ctx, e) {
  ctx.fillStyle = shadeColor(e.color, -15);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.6, e.y, e.radius * 0.5, e.radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = 1.3;
  [-0.15, 0.15].forEach((dy) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius, e.y + dy * e.radius);
    ctx.lineTo(e.x - e.radius * 1.3, e.y + dy * e.radius * 1.8);
    ctx.stroke();
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 0.2, e.y, e.radius * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, -30);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 0.2, e.y, e.radius * 0.55, 0.5, Math.PI * 2.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 0.2, e.y, e.radius * 0.3, 0.5, Math.PI * 2.2);
  ctx.stroke();
}

function drawAppleSnail(ctx, e) {
  drawSnailBody(ctx, e);
}

// No shell — an elongated soft body with simple ripple segments and a pair
// of eye stalks, the classic slug silhouette.
function drawSlug(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 1.3, e.radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shadeColor(e.color, -20);
  ctx.lineWidth = 1;
  [-0.5, 0, 0.5].forEach((off) => {
    ctx.beginPath();
    ctx.moveTo(e.x + off * e.radius, e.y - e.radius * 0.5);
    ctx.lineTo(e.x + off * e.radius, e.y + e.radius * 0.5);
    ctx.stroke();
  });

  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = 1.3;
  [-0.12, 0.12].forEach((dy) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 1.2, e.y + dy * e.radius * 2);
    ctx.lineTo(e.x - e.radius * 1.5, e.y + dy * e.radius * 4);
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(e.x - e.radius * 1.5, e.y + dy * e.radius * 4, e.radius * 0.08, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Same foot/tentacles as the Apple Snail, but a more pointed, conical
// shell (the real animal's distinctive silhouette) with yellow banding
// instead of a round spiral shell.
function drawAssassinSnail(ctx, e) {
  ctx.fillStyle = shadeColor(e.color, -15);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.6, e.y, e.radius * 0.5, e.radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = 1.3;
  [-0.15, 0.15].forEach((dy) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius, e.y + dy * e.radius);
    ctx.lineTo(e.x - e.radius * 1.3, e.y + dy * e.radius * 1.8);
    ctx.stroke();
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 1.1, e.y);
  ctx.quadraticCurveTo(e.x + e.radius * 0.6, e.y - e.radius * 0.75, e.x - e.radius * 0.1, e.y - e.radius * 0.5);
  ctx.quadraticCurveTo(e.x + e.radius * 0.3, e.y, e.x - e.radius * 0.1, e.y + e.radius * 0.5);
  ctx.quadraticCurveTo(e.x + e.radius * 0.6, e.y + e.radius * 0.75, e.x + e.radius * 1.1, e.y);
  ctx.fill();

  ctx.strokeStyle = '#ffd54f';
  ctx.lineWidth = 1.5;
  [0.3, 0.6, 0.9].forEach((t) => {
    ctx.beginPath();
    ctx.arc(e.x + e.radius * (0.1 + t * 0.4), e.y, e.radius * (0.55 - t * 0.15), -0.9, 0.9);
    ctx.stroke();
  });
}

// Boss: a broad, flat conical shell — the "helmet" silhouette real helmet
// snails are named for — much bigger than any regular snail's shell.
function drawMilitaryHelmetSnail(ctx, e) {
  ctx.fillStyle = shadeColor(e.color, -15);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.65, e.y, e.radius * 0.55, e.radius * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = 1.5;
  [-0.15, 0.15].forEach((dy) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 1.05, e.y + dy * e.radius);
    ctx.lineTo(e.x - e.radius * 1.4, e.y + dy * e.radius * 1.8);
    ctx.stroke();
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.3, e.y, e.radius * 1.05, e.radius * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(e.color, 20);
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.2, e.y - e.radius * 0.2, e.radius * 0.55, e.radius * 0.3, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, -30);
  ctx.lineWidth = 1.3;
  [0.4, 0.7].forEach((r) => {
    ctx.beginPath();
    ctx.ellipse(e.x + e.radius * 0.3, e.y, e.radius * 1.05 * r, e.radius * 0.95 * r, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// --- Savanah: desert ------------------------------------------------------

// Round head, two small triangular ears, and a curled tail — simple but
// distinctly "small cat," unlike anything else in the roster so far.
function drawSandLion(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.15, e.y, e.radius * 0.95, e.radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.85, e.y, e.radius * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shadeColor(e.color, -20);
  [-0.3, 0.3].forEach((dy) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 1.1, e.y + dy * e.radius * 0.6);
    ctx.lineTo(e.x - e.radius * 0.95, e.y + dy * e.radius * 1.5);
    ctx.lineTo(e.x - e.radius * 0.7, e.y + dy * e.radius * 0.7);
    ctx.closePath();
    ctx.fill();
  });

  ctx.strokeStyle = shadeColor(e.color, -15);
  ctx.lineWidth = Math.max(1.5, e.radius * 0.15);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.9, e.y + e.radius * 0.2);
  ctx.quadraticCurveTo(e.x + e.radius * 1.5, e.y, e.x + e.radius * 1.3, e.y - e.radius * 0.6);
  ctx.stroke();
}

// Three overlapping segments trailing behind the head (toward +x, since
// the head faces -x like everything else here) — simpler than the
// millipede trail-following rig since a Sandworm never needs to curl
// around corners within one render call, just read as "segmented." Only
// drawn while surfaced — see drawTunnelMound() below for its hidden look.
function drawSandworm(ctx, e) {
  ctx.fillStyle = e.color;
  [0.9, 0.3, -0.3].forEach((dx, i) => {
    ctx.beginPath();
    ctx.ellipse(e.x + dx * e.radius, e.y, e.radius * (0.75 - i * 0.08), e.radius * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = 1;
  [0.5, 1.1].forEach((dx) => {
    ctx.beginPath();
    ctx.ellipse(e.x + dx * e.radius, e.y, e.radius * 0.1, e.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.fillStyle = '#2e2117';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.55, e.y, e.radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

// Same body plan as the Deep Forest ants (drawAntBody) — only the color
// (set in SAVANAH_ROSTER) needs to differ to read as a distinct enemy,
// same precedent Fire Ant/Armored Ant already set.
function drawDesertAnt(ctx, e) {
  drawAntBody(ctx, e);
}

// Big folded hind legs (the real insect's signature silhouette), drawn
// first so the body/head sit on top of them, plus a red/yellow banded
// underside over the roster's near-black base color.
function drawGiantLubberGrasshopper(ctx, e) {
  ctx.strokeStyle = shadeColor(e.color, 40);
  ctx.lineWidth = Math.max(1.5, e.radius * 0.18);
  ctx.lineCap = 'round';
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(e.x + e.radius * 0.2, e.y + side * e.radius * 0.3);
    ctx.lineTo(e.x + e.radius * 0.9, e.y + side * e.radius * 0.55);
    ctx.lineTo(e.x + e.radius * 1.5, e.y + side * e.radius * 1.1);
    ctx.stroke();
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.95, e.radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.95, e.y, e.radius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#c62828';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.6, e.y - e.radius * 0.4);
  ctx.lineTo(e.x + e.radius * 0.6, e.y - e.radius * 0.4);
  ctx.stroke();
  ctx.strokeStyle = '#fdd835';
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.6, e.y + e.radius * 0.4);
  ctx.lineTo(e.x + e.radius * 0.6, e.y + e.radius * 0.4);
  ctx.stroke();
}

// A long, slender body (unlike every other roster's stout ellipse) plus a
// small triangular head and a pair of folded front "praying" arms — the
// one unmistakable mantis silhouette.
function drawDesertPrayingMantis(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.2, e.y, e.radius * 1.3, e.radius * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.1, e.y);
  ctx.lineTo(e.x - e.radius * 0.55, e.y - e.radius * 0.25);
  ctx.lineTo(e.x - e.radius * 0.55, e.y + e.radius * 0.25);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = Math.max(1.3, e.radius * 0.14);
  ctx.lineCap = 'round';
  [-0.3, 0.3].forEach((dy) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 0.5, e.y + dy * e.radius * 0.5);
    ctx.lineTo(e.x - e.radius * 0.1, e.y + dy * e.radius * 0.1);
    ctx.lineTo(e.x - e.radius * 0.5, e.y + dy * e.radius * 0.05);
    ctx.stroke();
  });
}

// Same beetle body plan (drawBeetleBody) as the Deep Forest beetles, plus
// the real insect's signature orange/red stripe pattern along each side
// of its otherwise near-black body.
function drawKissingBug(ctx, e) {
  drawBeetleBody(ctx, e);
  ctx.strokeStyle = '#d84315';
  ctx.lineWidth = Math.max(1, e.radius * 0.12);
  [-0.35, 0.35].forEach((dy) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 0.6, e.y + dy * e.radius);
    ctx.lineTo(e.x + e.radius * 0.6, e.y + dy * e.radius);
    ctx.stroke();
  });
}

// Boss: a much bigger, paler ant-body (termites and ants share the same
// basic silhouette at this scale) with an oversized, soft pale abdomen —
// the one feature that actually reads as "termite" rather than just a
// big ant. Shares the Sandworm's tunnel trait (SAVANAH_ROSTER) and only
// draws this way while surfaced.
function drawDesertTermite(ctx, e) {
  drawAntBody(ctx, e);
  ctx.fillStyle = shadeColor(e.color, 10);
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.55, e.y, e.radius * 0.7, e.radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, -15);
  ctx.lineWidth = 1;
  [0.3, 0.6, 0.9].forEach((dx) => {
    ctx.beginPath();
    ctx.ellipse(e.x + dx * e.radius, e.y, e.radius * 0.08, e.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// Boss: a bright blue sheen band down the back (the real insect's
// iridescent blue elytra, the namesake feature) over the shared beetle
// body plan, plus legs tucked in close rather than splayed out — "death
// feigning" beetles famously play dead.
function drawBlueDeathBeetle(ctx, e) {
  drawBeetleBody(ctx, e);
  ctx.fillStyle = shadeColor(e.color, 45);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.85, e.radius * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shadeColor(e.color, -10);
  ctx.lineWidth = 1.2;
  [-0.6, 0.6].forEach((dy) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 0.3, e.y + dy * e.radius * 0.5);
    ctx.lineTo(e.x - e.radius * 0.1, e.y + dy * e.radius * 0.75);
    ctx.stroke();
  });
}

// Stands in for a tunneling enemy's own body while tunneledRemaining > 0
// (see renderEnemies()) — a low sandy mound with a dark seam down the
// middle, gently pulsing to read as "something's moving under there"
// rather than a static lump. Drawn at world coordinates directly (no
// heading rotation) since a mound has no facing direction to speak of.
function drawTunnelMound(ctx, x, y, radius, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 5);
  ctx.fillStyle = '#c9a86a';
  ctx.beginPath();
  ctx.ellipse(x, y, radius * (1.1 + pulse * 0.08), radius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a6855a';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.08, radius * 0.75, radius * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(60, 45, 25, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.5, y);
  ctx.lineTo(x + radius * 0.5, y);
  ctx.stroke();
}

const ENEMY_DRAW_FUNCTIONS = {
  ant: drawAnt,
  fireAnt: drawFireAnt,
  armoredAnt: drawArmoredAnt,
  babyBeetle: drawBabyBeetle,
  dungBeetle: drawDungBeetle,
  tigerBeetle: drawTigerBeetle,
  tadpole: drawTadpole,
  froglet: drawFroglet,
  frogLarva: drawFrogLarva,
  appleSnail: drawAppleSnail,
  slug: drawSlug,
  assassinSnail: drawAssassinSnail,
  sandLion: drawSandLion,
  sandworm: drawSandworm,
  desertAnt: drawDesertAnt,
  giantLubberGrasshopper: drawGiantLubberGrasshopper,
  desertPrayingMantis: drawDesertPrayingMantis,
  kissingBug: drawKissingBug,
};

const BOSS_DRAW_FUNCTIONS = {
  'forest-boss-tier-1': drawQueenAnt,
  'forest-boss-tier-2': drawLonghornBeetle,
  'marsh-boss-tier-1': drawFrogBoss,
  'marsh-boss-tier-2': drawMilitaryHelmetSnail,
  'desert-boss-tier-1': drawDesertTermite,
  'desert-boss-tier-2': drawBlueDeathBeetle,
};

function drawFallbackCircle(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemyShape(ctx, enemy) {
  const draw = enemy.isBoss ? BOSS_DRAW_FUNCTIONS[enemy.enemyKey] : ENEMY_DRAW_FUNCTIONS[enemy.enemyKey];
  (draw || drawFallbackCircle)(ctx, enemy);
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

function renderEnemies(ctx, time) {
  activeEnemies.forEach((enemy) => {
    if (!enemy.spawned) return;

    // Tunneled (Sandworm/Desert Termite mid-dive): hidden underground and
    // untargetable (see getEnemiesInRadius/findNearestEnemyInRange above),
    // so it draws as a mound in place of literally everything else below
    // — its own body, the health bar, burn/immobilize/infected status
    // rings included. Any pre-existing status effect (say, a burn or
    // infection applied just before it tunneled) keeps ticking down in
    // updateEnemies() regardless, it just doesn't get a visual while
    // hidden — consistent with "genuinely untouchable" meaning nothing
    // about it is visible either.
    if (enemy.tunneledRemaining > 0) {
      drawTunnelMound(ctx, enemy.x, enemy.y, enemy.radius, time);
      return;
    }

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

    // Infect Path's stun gets its own distinct look — a sickly green,
    // slowly pulsing glow hugging the body (via shadowBlur, same glow
    // technique fireflies already use elsewhere in this codebase, rather
    // than a canvas-compositing tint that would also bleed onto whatever's
    // drawn underneath) plus a few small fuzzy mold patches on top —
    // deliberately different from burn's small orange dot and Tanglement's
    // dashed ring, so "infected" reads as its own thing at a glance rather
    // than generic "stopped."
    if (enemy.infectedRemaining > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      ctx.save();
      ctx.shadowColor = '#7cb342';
      ctx.shadowBlur = 6 + pulse * 6;
      ctx.strokeStyle = `rgba(124, 179, 66, ${0.5 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#7cb342';
      [[-0.5, -0.3], [0.4, -0.1], [0.1, 0.4], [-0.3, 0.35]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.arc(enemy.x + dx * enemy.radius, enemy.y + dy * enemy.radius, enemy.radius * 0.18, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    const barWidth = enemy.radius * 2;
    const healthRatio = Math.max(0, enemy.health / enemy.maxHealth);
    ctx.fillStyle = '#000';
    ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 8, barWidth, 4);
    ctx.fillStyle = '#e53935';
    ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 8, barWidth * healthRatio, 4);
  });
}
