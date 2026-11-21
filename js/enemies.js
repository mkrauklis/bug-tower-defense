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
// Every enemy type's health across every map, doubled a second time
// (direct request, second pass): a straight 2x on each type's own
// currently-stored base health value — regular enemies, bosses, the
// shared armored beetles, and the snakes all included ("enemies" with no
// exclusion stated). Speed, bounty, and armorThreshold are explicitly
// untouched, so every "round(X/2)"-style bounty comment below (and on
// MARSH_ROSTER/SAVANAH_ROSTER) now describes the OLD, pre-this-pass
// health, not the current value — expected drift from this pass, not a
// bug, the same way the bosses' own bounty comments already read
// "unchanged" against their first 2x. Bosses already got their own 2x
// earlier (see each bossTypes' own comment) — this stacks on top of that
// rather than replacing it, so bosses end up ~4x their original
// pre-either-buff values. Flagged back to the user in case that
// compounding wasn't intended.
const FOREST_ROSTER = {
  enemyTypes: {
    // Bounties follow the file's established ~HP/2 convention (rounded),
    // with Ant bumped from the literal round(2/2)=1 up to 2 so the
    // cheapest enemy in the game is never worth nothing — same exception
    // the original Ant entry made before the roster was replaced.
    ant: { name: 'Ant', speedMultiplier: 0.7, health: 4, color: '#8d6e63', radius: 7, bounty: 2 },
    fireAnt: { name: 'Fire Ant', speedMultiplier: 0.9, health: 6, color: '#d84315', radius: 8, bounty: 2 }, // round(3/2)=2 against the pre-2nd-doubling health of 3
    armoredAnt: { name: 'Armored Ant', speedMultiplier: 0.6, health: 20, color: '#4e342e', radius: 10, bounty: 5 },
    babyBeetle: { name: 'Baby Beetle', speedMultiplier: 0.7, health: 50, color: '#558b2f', radius: 9, bounty: 13 },
    dungBeetle: { name: 'Dung Beetle', speedMultiplier: 0.6, health: 90, color: '#3e2723', radius: 10, bounty: 23 },
    tigerBeetle: { name: 'Tiger Beetle', speedMultiplier: 0.8, health: 100, color: '#2e7d32', radius: 9, bounty: 25 },
    // Snakes (direct request): Deep Forest's first tier-3 roster — well
    // above the ant/beetle lines' own HP (2-50), exactly the "clearly
    // belongs later" gap orderTier3's existing every-5-rounds-starting-
    // after-round-50 cadence was already built for (round 51/56/61/66,
    // one new snake each), so they slot in as its 4 entries rather than
    // needing any new unlock machinery. Health/speed are the user's exact
    // numbers; bounty follows the roster's own ~HP/2 convention. Armored
    // Snake is the one judgment call: given the armor-gate mechanic
    // (armorThreshold, see damageEnemy()) by name-thematic request, but
    // calibrated as a light, early nod to it rather than a real forcing
    // function on the Armored Beetle line's own scale — threshold 5 blocks
    // only the very weakest tier-1 hits (Fire/Storm/Decay, 3-5 damage)
    // while every tier-2+ build (and Solar Path at any tier) still gets
    // through untouched; it unlocks at round 61, a full 14 rounds before
    // Carapace Beetle's own round-75/threshold-8 debut, so it reads as a
    // preview of the mechanic, not a repeat of it.
    gardenerSnake: { name: 'Gardener Snake', speedMultiplier: 0.8, health: 300, color: '#558b2f', radius: 9, bounty: 75 },
    bananaSnake: { name: 'Banana Snake', speedMultiplier: 0.7, health: 450, color: '#fdd835', radius: 10, bounty: 113 },
    armoredSnake: {
      name: 'Armored Snake',
      speedMultiplier: 0.5,
      health: 700,
      color: '#6d7a5a',
      radius: 11,
      bounty: 175,
      armorThreshold: 5,
    },
    anaconda: { name: 'Anaconda', speedMultiplier: 0.4, health: 900, color: '#1b3a1b', radius: 13, bounty: 225 },
  },
  // Boss health doubled across every map (direct request) — a straight
  // 2x multiplier on each boss's own health only, not a redesign; bounty/
  // speed/radius are untouched, so bounty no longer lands at the usual
  // ~round(HP/2) convention for these four (that's expected, not a bug).
  // A second, later across-the-board doubling pass (see this file's
  // top-level comment on FOREST_ROSTER) applies on top of THIS one for
  // every enemy including these bosses — the values below already have
  // both multipliers baked in (~4x the enemy's original pre-either-buff
  // health).
  bossTypes: {
    1: { name: 'Queen Ant', speedMultiplier: 0.5, health: 200, color: '#6d4c41', radius: 20, bounty: 25 }, // was 50, then 100, then this
    2: { name: 'Longhorn Beetle', speedMultiplier: 0.6, health: 400, color: '#5d4037', radius: 22, bounty: 50 }, // was 100, then 200, then this
  },
  order: ['ant', 'fireAnt', 'armoredAnt'],
  orderTier2: ['babyBeetle', 'dungBeetle', 'tigerBeetle'],
  // Snakes (direct request): unlock weakest-to-strongest on the existing
  // every-5-rounds-after-round-50 cadence (round 51/56/61/66) — see each
  // one's own entry above for the stat/armor rationale.
  orderTier3: ['gardenerSnake', 'bananaSnake', 'armoredSnake', 'anaconda'],
};

const MARSH_ROSTER = {
  enemyTypes: {
    tadpole: { name: 'Tadpole', speedMultiplier: 0.5, health: 10, color: '#5a7a3a', radius: 7, bounty: 3 }, // round(5/2)=3 against the pre-2nd-doubling health of 5
    froglet: { name: 'Froglet', speedMultiplier: 0.7, health: 20, color: '#66bb6a', radius: 8, bounty: 5 },
    // Notably slow/tanky relative to the other two tier-1 types — direct
    // from spec, not a typo: a 0.2x speed, 23 HP (pre-2nd-doubling) enemy
    // this early acts as a "soak damage, buys the other two time to get
    // past" road-bump.
    frogLarva: { name: 'Frog Larva', speedMultiplier: 0.2, health: 46, color: '#c5c87a', radius: 11, bounty: 12 }, // round(11.5)=12 against the pre-2nd-doubling health of 23
    appleSnail: { name: 'Apple Snail', speedMultiplier: 0.4, health: 100, color: '#d4a017', radius: 9, bounty: 25 },
    slug: { name: 'Slug', speedMultiplier: 0.5, health: 150, color: '#bf7e4a', radius: 10, bounty: 38 }, // round(37.5)=38 against the pre-2nd-doubling health of 75
    assassinSnail: { name: 'Assassin Snail', speedMultiplier: 0.6, health: 170, color: '#6d4c23', radius: 9, bounty: 43 }, // round(42.5)=43 against the pre-2nd-doubling health of 85
  },
  // Boss health doubled (direct request) — see Deep Forest's bossTypes
  // comment above for the same scope note, including the later
  // across-the-board second doubling pass this stacks with.
  bossTypes: {
    1: { name: 'Frog Boss', speedMultiplier: 0.5, health: 260, color: '#33691e', radius: 20, bounty: 33 }, // was 65, then 130, then this; bounty unchanged
    2: { name: 'Military Helmet Snail', speedMultiplier: 0.3, health: 600, color: '#8d6e4a', radius: 24, bounty: 75 }, // was 150, then 300, then this
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
    sandLion: { name: 'Sand Lion', speedMultiplier: 0.7, health: 12, color: '#d2a24c', radius: 8, bounty: 3 },
    sandworm: {
      name: 'Sandworm',
      speedMultiplier: 0.6,
      health: 30,
      color: '#b8926a',
      radius: 8,
      bounty: 8, // round(7.5)=8 against the pre-2nd-doubling health of 15
      tunnelInterval: 3,
      tunnelDuration: 2,
    },
    desertAnt: { name: 'Desert Ant', speedMultiplier: 1, health: 50, color: '#9c5a2e', radius: 7, bounty: 13 }, // round(12.5)=13 against the pre-2nd-doubling health of 25
    giantLubberGrasshopper: {
      name: 'Giant Lubber Grasshopper',
      speedMultiplier: 0.5,
      health: 120,
      color: '#2b2a1f',
      radius: 11,
      bounty: 30,
    },
    desertPrayingMantis: {
      name: 'Desert Praying Mantis',
      speedMultiplier: 0.9,
      health: 100,
      color: '#a9a265',
      radius: 9,
      bounty: 25,
    },
    kissingBug: { name: 'Kissing Bug', speedMultiplier: 0.8, health: 150, color: '#2e1f1a', radius: 8, bounty: 38 }, // round(37.5)=38 against the pre-2nd-doubling health of 75
  },
  // Boss health doubled (direct request) — see Deep Forest's bossTypes
  // comment (enemies.js, FOREST_ROSTER) for the same scope note, including
  // the later across-the-board second doubling pass this stacks with.
  bossTypes: {
    1: {
      name: 'Desert Termite',
      speedMultiplier: 0.6,
      health: 300, // was 75, then 150, then this
      color: '#dcc89a',
      radius: 21,
      bounty: 38, // unchanged; round(37.5)=38 against the ORIGINAL 75 HP, not re-derived from either doubling
      tunnelInterval: 3,
      tunnelDuration: 2,
    },
    2: { name: 'Blue Death Beetle', speedMultiplier: 0.7, health: 580, color: '#2c4f7c', radius: 22, bounty: 73 }, // was 145, then 290, then this; bounty unchanged
  },
  order: ['sandLion', 'sandworm', 'desertAnt'],
  orderTier2: ['giantLubberGrasshopper', 'desertPrayingMantis', 'kissingBug'],
  orderTier3: [],
};

// Whirlpool (direct request): an ocean-floor roster, and the first map with
// a real THIRD boss tier — the user gave all 12 enemies (3 regular tiers of
// 3 plus 3 bosses) as one ordered, weakest-to-strongest list, with the
// bosses sitting at positions 4/8/12. That maps directly onto this file's
// existing order/bossTypes[1]/orderTier2/bossTypes[2]/orderTier3/
// bossTypes[3] shape — getBossForRound()'s own fallback-to-highest-
// designed-tier logic already supports an arbitrary number of boss tiers
// (it was written generically, just never had a 3rd one to use before), so
// no engine changes were needed to add a real round-75 boss, only data.
//
// The user didn't give explicit health/speed numbers this time (unlike
// every other map's roster) — judgment calls below, picked to land in the
// same value ranges the other 3 rosters already sit in post the recent
// global 2x health pass (this is brand-new content, so there's no earlier,
// lower baseline for it to be "doubled" relative to — these are just
// chosen directly at the current scale other maps' numbers now live at):
// tier1 ~8-15hp, tier2 ~90-170hp, tier3 (the toughest regular tier) ~250-
// 400hp, boss1(round25) ~250hp, boss2(round50) ~480hp. Great White
// (boss3, round75) is deliberately well past ALL of that — 1400hp, even
// above the shared Titan Beetle's own 1200 — since the request was
// explicit that it should be "noticeably tougher... not just
// incrementally so" and "the strongest enemy in this entire roster," a
// genuine new high-water mark, not another modest step up the existing
// curve. Bounty follows the same ~HP/2 convention as every other roster,
// computed directly against these numbers (no stale pre-doubling drift to
// account for, again because this is new content).
const OCEAN_ROSTER = {
  enemyTypes: {
    seaCucumber: { name: 'Sea Cucumber', speedMultiplier: 0.3, health: 8, color: '#6b5a3a', radius: 8, bounty: 4 },
    urchin: { name: 'Urchin', speedMultiplier: 0.4, health: 15, color: '#2a1a3a', radius: 9, bounty: 8 }, // round(7.5)=8
    clownFish: { name: 'Clown Fish', speedMultiplier: 0.9, health: 12, color: '#ff7a33', radius: 7, bounty: 6 },
    starfish: { name: 'Starfish', speedMultiplier: 0.3, health: 90, color: '#d9622b', radius: 10, bounty: 45 },
    seahorse: { name: 'Seahorse', speedMultiplier: 0.35, health: 110, color: '#c9a04a', radius: 8, bounty: 55 },
    horseshoeCrab: { name: 'Horseshoe Crab', speedMultiplier: 0.3, health: 170, color: '#4a4030', radius: 11, bounty: 85 },
    stingray: { name: 'Stingray', speedMultiplier: 0.6, health: 250, color: '#6a7f8a', radius: 13, bounty: 125 },
    tuna: { name: 'Tuna', speedMultiplier: 1.1, health: 320, color: '#395a78', radius: 10, bounty: 160 }, // the fastest regular enemy on this map — real tuna are famously quick
    marlin: { name: 'Marlin', speedMultiplier: 1, health: 400, color: '#1f3a5c', radius: 11, bounty: 200 },
  },
  bossTypes: {
    1: { name: 'Reef Shark', speedMultiplier: 0.6, health: 250, color: '#6e7c82', radius: 16, bounty: 125 },
    2: { name: 'Hammerhead Shark', speedMultiplier: 0.55, health: 480, color: '#51626e', radius: 19, bounty: 240 },
    // The map's true final boss — see this roster's own top comment for
    // why it's set well above a simple next-step in the curve.
    3: { name: 'Great White', speedMultiplier: 0.55, health: 1400, color: '#8a9aa0', radius: 24, bounty: 700 },
  },
  order: ['seaCucumber', 'urchin', 'clownFish'],
  orderTier2: ['starfish', 'seahorse', 'horseshoeCrab'],
  orderTier3: ['stingray', 'tuna', 'marlin'],
};

// Keyed by TERRAIN id (map.js's TERRAIN_THEMES keys — 'forest'/'marsh'/
// 'desert'), not the map's own id ('deepForest'/'marshland'/'savanah') —
// getActiveRoster() below looks this up via getActiveMap().terrain.
const MAP_ROSTERS = { forest: FOREST_ROSTER, marsh: MARSH_ROSTER, desert: SAVANAH_ROSTER, ocean: OCEAN_ROSTER };

// Falls back to the Forest roster if the active map's terrain isn't a
// known key (shouldn't happen — every terrain id in map.js's
// TERRAIN_THEMES has a matching roster here — but better a sensible
// default than a crash) and to the Forest roster outright before any game
// has started (getActiveMap() defaults to Deep Forest at module load).
function getActiveRoster() {
  const map = getActiveMap();
  return (map && MAP_ROSTERS[map.terrain]) || FOREST_ROSTER;
}

// Armored enemies (direct request) — a forcing function meant to require
// an actually-upgraded tower, not just more base towers. The "armor"
// trait itself is generic and reusable (see damageEnemy() below): a
// hard per-hit minimum-damage gate, not a percentage reduction — any
// single hit dealing LESS than enemy.armorThreshold is fully negated (0
// damage), full stop. A future enemy on any roster can opt in just by
// setting its own armorThreshold.
//
// Shared across every map (direct request: "regardless of map") rather
// than reskinned per terrain or added into any one MAP_ROSTERS entry —
// every map gets the identical three tiers, unlocking by round alone.
// Deliberately NOT using orderTier3's existing unlock cadence (every-5-
// rounds-per-type starting right after round 50, landing at round
// 51/56/61) since that can't be made to land on the specific rounds
// asked for here — these use their own explicit unlockRound instead.
//
// Threshold calibration — pulled every attacking path's real per-hit
// damage at each of its own 4 tiers from towers.js (Sunflower's Solar/
// Fire/Storm, Rose's Thorn/Root/Projectile, Mushroom's Decay; Enable
// Path buffs OTHER towers rather than the Mushroom's own hit, Infect
// Path deals no damage at all, and Coneflower never attacks — none of
// those three have a "per-hit damage" to calibrate against, so they're
// excluded from this comparison on purpose, not an oversight):
//   tier1 hits: Solar 10, Fire 5, Storm 5, Thorn 4, Root 6, Projectile 6, Decay 3
//   tier2 hits: Solar 15, Fire 10, Storm 5, Thorn 8, Root 12, Projectile 6, Decay 3
//   tier3 hits: Solar 30, Fire 20, Storm 5, Thorn 16, Root 24, Projectile 6, Decay 7.5
//   tier4 hits: Solar 30, Fire 40, Storm 5, Thorn 32, Root 24, Projectile 12, Decay 15
// (Storm Path's own base attack never gains damage at any tier — it's a
// pure attack-speed/AoE-tick path; its spark/shockwave pulses are 7/15
// damage, each its own separate hit subject to the same gate.)
//
//   Carapace Beetle (round 75), threshold 8: blocks every tier-1 hit
//   except Solar's (an intentional, acceptable exception — Solar Path is
//   already the "hits hard early" path by its own numbers above); lets
//   most tier-2 builds (Solar/Fire/Thorn/Root) through while Storm/
//   Projectile/Decay — the speed/volume/DoT-flavored paths — still can't
//   scratch it even at tier 2.
//   Ironshell Beetle (round 100), threshold 16: no tier-2 hit reaches it
//   (max is 15); most tier-3 builds (Solar/Fire/Thorn/Root) get through.
//   Titan Beetle (round 125), threshold 24: no tier-3 hit but Solar's and
//   Root's own (30 and, at exactly 24, Root's tier-3 Tanglement) reach
//   it; needs genuine tier-4 investment (Fire, Thorn, and Root all clear
//   it) from a real heavy-hitter path. Storm, Projectile, and Decay
//   never break through at any tier even fully maxed — a deliberate
//   characterization (those are volume/speed/DoT playstyles, not single-
//   hit powerhouses), not an oversight; a player relying purely on one of
//   those needs a different tower in the mix once these show up.
//
// HP, separately from the armor gate (direct request: "not just
// unkillable until then... a real health sink once you can hurt them")
// — base values doubling tier over tier (150/300/600), which on top of
// the same round-based healthMultiplier every other enemy gets (far
// higher at round 125 than round 75 — see getRoundScaling()) compounds
// into a dramatic actual in-game HP curve, intentionally comparable to
// or past a same-tier boss's own HP: these are meant to read as a
// genuine elite threat once armor stops being the obstacle. Bounty
// follows the same ~HP/2 convention as everywhere else, scaled by the
// same round multiplier as every other enemy's bounty.
//
// Each tier spawns at a fixed count of 1 per wave (see generateWave()),
// not split evenly across unlocked types like regular roster enemies —
// a rare, attention-grabbing elite unit each wave, not a wave-filler.
//
// Health doubled a second time (direct request, the same across-the-board
// pass documented on FOREST_ROSTER above — these were explicitly called
// out as included: "armored beetles... everything"). armorThreshold,
// bounty, and speedMultiplier are untouched, so the tier-over-tier
// 150/300/600 progression this file's own comment above describes is now
// 300/600/1200 — still exactly 2x tier-over-tier, just from a doubled
// starting point.
const ARMORED_BEETLE_TIERS = [
  {
    key: 'carapaceBeetle',
    name: 'Carapace Beetle',
    unlockRound: 75,
    health: 300,
    armorThreshold: 8,
    color: '#5d6d4a',
    radius: 13,
    bounty: 75,
    speedMultiplier: 0.45,
  },
  {
    key: 'ironshellBeetle',
    name: 'Ironshell Beetle',
    unlockRound: 100,
    health: 600,
    armorThreshold: 16,
    color: '#4a5a6d',
    radius: 15,
    bounty: 150,
    speedMultiplier: 0.4,
  },
  {
    key: 'titanBeetle',
    name: 'Titan Beetle',
    unlockRound: 125,
    health: 1200,
    armorThreshold: 24,
    color: '#3a3a4a',
    radius: 18,
    bounty: 300,
    speedMultiplier: 0.35,
  },
];

function getUnlockedArmoredBeetleKeys(round) {
  return ARMORED_BEETLE_TIERS.filter((tier) => round >= tier.unlockRound).map((tier) => tier.key);
}

function getArmoredBeetleTier(key) {
  return ARMORED_BEETLE_TIERS.find((tier) => tier.key === key) || null;
}

// Enemy types whose body visibly curls around corners as a chain of
// segments following the head's own recent path, instead of the single
// rigid heading every other enemy uses — add a key here (and a matching
// entry in MILLIPEDE_BODY below) to opt a new type into it. Empty for both
// current rosters — ants/beetles/frogs/snails are all single-body
// creatures, nothing here warrants it. See recordTrailPoint()/
// renderMillipedeBody() below for the (still-intact) generic mechanism
// this drives, kept ready for a future multi-segment type.
const MILLIPEDE_FAMILY_KEYS = new Set(['gardenerSnake', 'bananaSnake', 'armoredSnake', 'anaconda']);

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

  // Armored beetles (shared across every map — see ARMORED_BEETLE_TIERS'
  // own comment) unlock on their own explicit rounds, not this function's
  // every-5-rounds cadence.
  unlocked.push(...getUnlockedArmoredBeetleKeys(round));

  return unlocked;
}

// Total enemies across a regular (non-boss) wave — reinstated per direct
// request, superseding an earlier change that kept wave size flat (that
// turned out to make every round feel the same, since the only real
// progression was per-enemy health). Scales linearly from
// WAVE_SIZE_AT_ROUND_1 at round 1 up to WAVE_SIZE_AT_ROUND_25 at round 25,
// then — direct request, part of the balance pass documented on
// getRoundScaling() below — keeps growing past round 25 too, just much
// more slowly (+1 enemy every 5 rounds) up to a hard ceiling
// (WAVE_SIZE_MAX), rather than freezing flat forever. A flat-forever cap
// meant the back half of a long game had literally zero count pressure,
// only healthMultiplier — some continued (gentle) count growth gives
// late rounds a second axis of difficulty too, without waves ballooning
// to an unmanageable/laggy size the way an uncapped linear curve would.
const WAVE_SIZE_AT_ROUND_1 = 5;
const WAVE_SIZE_AT_ROUND_25 = 25;
const WAVE_SIZE_MAX = 50; // reached at round 150 under the +1/5-rounds trickle below

function getTotalWaveSize(round) {
  if (round <= 25) {
    const progress = (round - 1) / 24; // 0 at round 1, 1 at round 25
    return Math.round(WAVE_SIZE_AT_ROUND_1 + (WAVE_SIZE_AT_ROUND_25 - WAVE_SIZE_AT_ROUND_1) * progress);
  }
  const extraPastRound25 = Math.floor((round - 25) / 5);
  return Math.min(WAVE_SIZE_MAX, WAVE_SIZE_AT_ROUND_25 + extraPastRound25);
}

// Round-over-round health scaling — balance pass (direct request): this
// used to be a flat +10% every 3 rounds (linear, ~3.3%/round on average,
// and literally flat for 2 out of every 3 rounds). That curve is the
// actual root cause behind "difficulty doesn't escalate meaningfully
// late-game": a single maxed-out tower path can reach a combined 20-30x
// damage/speed multiplier from its base stats well within an early-to-
// mid-game economy (e.g. Sunflower's Fire Path, ~32x before this same
// pass trimmed it — see its own comment in towers.js), and a player
// keeps adding MORE towers on top of that as rounds go on. Player power
// compounds; the old enemy curve didn't — it grows additively while
// player investment grows multiplicatively, so no matter how far a run
// goes, the gap only widens in the player's favor. The fix is to make
// enemy health compound too: a fixed 3.5% COMPOUNDING increase every
// single round (not bucketed by 3), i.e. healthMultiplier = 1.035^(round-1).
// This lands close to the old curve's round-25 value (2.28x new vs 1.8x
// old — a modest, not jarring, early-game bump) but diverges hard from
// there: 5.49x at round 50 (old: 2.6x) and 29.0x at round 100 (old:
// 4.3x) — roughly 6-7x tougher than before by the deep late-game, which
// is where the flat-feeling plateau actually lived.
//
// bounty (generateWave() below) scales by this exact same multiplier, on
// both regular enemies and bosses, so a kill's reward keeps pace with
// how much tankier that enemy actually is at this round — the old code
// left bounty flat forever, which (combined with Coneflower's passive,
// difficulty-independent income) let the player's economy float
// completely free of how hard the current round actually was. Boss
// health/bounty get the same treatment too (previously bosses never
// scaled with round at all, not even the old linear curve — every boss
// fight from its first designed round onward, round 25 or round 250
// alike, used identical stats. getBossForRound() already falls back to
// the strongest *designed* tier once round outgrows the roster, so this
// is what makes a round-75 rematch of a round-50 boss actually hit
// harder than the original fight, instead of being a verbatim replay).
const HEALTH_GROWTH_PER_ROUND = 1.035;

function getRoundScaling(round) {
  return {
    healthMultiplier: HEALTH_GROWTH_PER_ROUND ** (round - 1),
  };
}

// Builds this round's wave as a composition list:
// { enemyKey, name, color, radius, count, health, speedMultiplier, isBoss, bounty }
function generateWave(round) {
  const scaling = getRoundScaling(round);

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
        health: Math.round(boss.health * scaling.healthMultiplier),
        speedMultiplier: boss.speedMultiplier,
        isBoss: true,
        bounty: Math.round(boss.bounty * scaling.healthMultiplier),
        tunnelInterval: boss.tunnelInterval || 0,
        tunnelDuration: boss.tunnelDuration || 0,
        armorThreshold: 0,
      },
    ];
  }

  const unlocked = getUnlockedEnemyTypes(round);
  if (unlocked.length === 0) return []; // no regular types designed/unlocked yet
  const roster = getActiveRoster();

  // Armored beetles are pulled out of the regular per-type split below —
  // they spawn at a fixed count of 1 each (see ARMORED_BEETLE_TIERS' own
  // comment: a rare elite, not a wave-filler), not sharing the evenly-
  // divided perTypeCount every other unlocked type gets.
  const armoredKeys = new Set(getUnlockedArmoredBeetleKeys(round));
  const regularKeys = unlocked.filter((key) => !armoredKeys.has(key));

  // Spread this round's total wave size evenly across whichever REGULAR
  // types are currently unlocked, so per-type count self-adjusts as new
  // types unlock rather than needing its own separate curve.
  const perTypeCount =
    regularKeys.length > 0 ? Math.max(1, Math.round(getTotalWaveSize(round) / regularKeys.length)) : 0;

  const regularEntries = regularKeys.map((key) => {
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
      bounty: Math.round(type.bounty * scaling.healthMultiplier),
      tunnelInterval: type.tunnelInterval || 0,
      tunnelDuration: type.tunnelDuration || 0,
      armorThreshold: type.armorThreshold || 0,
    };
  });

  const armoredEntries = [...armoredKeys].map((key) => {
    const tier = getArmoredBeetleTier(key);
    return {
      enemyKey: key,
      name: tier.name,
      color: tier.color,
      radius: tier.radius,
      count: 1,
      health: Math.round(tier.health * scaling.healthMultiplier),
      speedMultiplier: tier.speedMultiplier,
      isBoss: false,
      bounty: Math.round(tier.bounty * scaling.healthMultiplier),
      tunnelInterval: 0,
      tunnelDuration: 0,
      armorThreshold: tier.armorThreshold,
    };
  });

  return [...regularEntries, ...armoredEntries];
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
  // Armored beetles (shared across every map): same shared beetle body
  // plan (drawBeetleBody), same head/front-toward -x convention.
  carapaceBeetle: Math.PI,
  ironshellBeetle: Math.PI,
  titanBeetle: Math.PI,
  // Whirlpool: every fish/shark/ray draws its own head/snout/bill toward
  // -x, same convention as everything above. Starfish and Urchin have no
  // real "front" (radially symmetric art) and are left out entirely,
  // falling through to the 0 default, same as Frog Larva's own comment.
  clownFish: Math.PI,
  seahorse: Math.PI,
  horseshoeCrab: Math.PI,
  stingray: Math.PI,
  tuna: Math.PI,
  marlin: Math.PI,
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
  'ocean-boss-tier-1': Math.PI, // Reef Shark
  'ocean-boss-tier-2': Math.PI, // Hammerhead Shark
  'ocean-boss-tier-3': Math.PI, // Great White
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
    // The Fungal Mess (Mushroom's Prodigy) only: a deliberately much
    // simpler, separate reanimation state from isZombie above — see
    // turnIntoPurpleZombie() below for exactly why it's kept apart (no
    // backward walk, no explosion, just a flat-damage leak) despite both
    // being "a kill that doesn't quite take."
    isPurpleZombie: false,
    // Armored beetles (and any future enemy that sets its own
    // armorThreshold on its roster/tier entry): a hard per-hit minimum-
    // damage gate, enforced generically in damageEnemy() below — any
    // single hit below this amount is fully negated. 0 for every type
    // without one, so the gate never applies by accident.
    armorThreshold: entry.armorThreshold || 0,
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
  const armoredKeys = ARMORED_BEETLE_TIERS.map((tier) => tier.key);
  return [...roster.order, ...roster.orderTier2, ...roster.orderTier3, ...armoredKeys, ...bossKeys];
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
      armorThreshold: 0,
    };
  }

  // Armored beetles (shared across every map, not part of any one
  // roster's own enemyTypes) are checked before falling through to the
  // active roster.
  const armoredTier = getArmoredBeetleTier(key);
  if (armoredTier) {
    return {
      enemyKey: key,
      name: armoredTier.name,
      color: armoredTier.color,
      radius: armoredTier.radius,
      health: armoredTier.health,
      speedMultiplier: armoredTier.speedMultiplier,
      isBoss: false,
      bounty: armoredTier.bounty,
      tunnelInterval: 0,
      tunnelDuration: 0,
      armorThreshold: armoredTier.armorThreshold,
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
    armorThreshold: type.armorThreshold || 0,
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

// The one choke point every damage source in the game already goes
// through (direct hits, projectiles, burn ticks, puddle/orbit ticks,
// root traps/rootGrab, spark/shockwave, vines, zombie explosions) — which
// is what makes the armor gate below apply generically everywhere for
// free, with no per-effect special-casing needed. A hit below
// enemy.armorThreshold is fully negated (0 damage, not reduced) — this
// includes DoT ticks (burn/puddle/orbit apply damagePerSecond*deltaSeconds
// as their own tiny individual "hit" every frame), so a weak-but-
// persistent effect can't bypass armor just by ticking enough times;
// deliberate, not an oversight — armor is a hard per-hit gate, not a
// damage-reduction percentage.
function damageEnemy(enemy, amount) {
  if (enemy.armorThreshold > 0 && amount < enemy.armorThreshold) return;
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
  const killed = activeEnemies.filter((enemy) => enemy.health <= 0 && !enemy.isZombie && !enemy.isPurpleZombie);

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

// The Fungal Mess's (Mushroom's Prodigy) reanimation: converts a just-
// killed, non-boss enemy into a "purple zombie" instead of letting it be
// swept up as a normal kill — called from resolveProjectile() in game.js
// when its reanimateChance roll succeeds. Deliberately NOT isZombie: true
// — a purple zombie is a much simpler, distinct state (per direct
// instruction, to keep it from colliding with Decay Path's own zombie
// system): resetting health to a positive number here is enough on its
// own to dodge the next frame's "killed" sweep above (the same trick
// turnIntoZombie() uses), and since isZombie/isPurpleZombie both stay
// false/true independently, updateEnemies() just keeps running this
// enemy through its ordinary forward-movement code with no rerouting —
// it walks toward the goal at its own normal speed, same as before it
// died, and deals the flat purple-zombie leak damage (see game.js's
// update()) instead of its own maxHealth if it gets there.
function turnIntoPurpleZombie(enemy) {
  enemy.isPurpleZombie = true;
  enemy.health = 1;
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

// --- Armored beetles (shared across every map) ----------------------------

// A thick, segmented plate pattern drawn over the shared beetle body —
// the one visual element all three armored tiers build on, progressively
// heavier/more ornate each tier. Distinct from the regular beetle types'
// smooth shell (drawBeetleBody's own highlight ellipse) by design: these
// need to read as "hard to crack" at a glance, not just a palette swap.
function drawBeetlePlates(ctx, e, plateCount, ridged) {
  ctx.strokeStyle = shadeColor(e.color, -40);
  ctx.lineWidth = Math.max(1.5, e.radius * 0.1);
  for (let i = 1; i < plateCount; i += 1) {
    const t = i / plateCount;
    const px = e.x + e.radius * (0.7 - t * 1.3);
    ctx.beginPath();
    ctx.moveTo(px, e.y - e.radius * 0.7);
    ctx.lineTo(px, e.y + e.radius * 0.7);
    ctx.stroke();
  }
  // Titan Beetle only: small ridged bumps along each plate seam, on top
  // of the segment lines every tier gets.
  if (ridged) {
    ctx.fillStyle = shadeColor(e.color, -20);
    for (let i = 0; i < plateCount; i += 1) {
      const t = (i + 0.5) / plateCount;
      const px = e.x + e.radius * (0.7 - t * 1.3);
      ctx.beginPath();
      ctx.moveTo(px, e.y - e.radius * 0.75);
      ctx.lineTo(px - e.radius * 0.08, e.y - e.radius * 0.55);
      ctx.lineTo(px + e.radius * 0.08, e.y - e.radius * 0.55);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// Round 75: 3 plate segments — armored, but the lightest of the three.
function drawCarapaceBeetle(ctx, e) {
  drawBeetleBody(ctx, e);
  drawBeetlePlates(ctx, e, 3, false);
}

// Round 100: 4 plate segments plus a few metallic rivets down the center
// seam — the one extra detail that reads as "iron," not just "more
// segmented than Carapace."
function drawIronshellBeetle(ctx, e) {
  drawBeetleBody(ctx, e);
  drawBeetlePlates(ctx, e, 4, false);
  ctx.fillStyle = shadeColor(e.color, 45);
  [-0.4, 0, 0.4].forEach((t) => {
    ctx.beginPath();
    ctx.arc(e.x, e.y + t * e.radius * 0.6, e.radius * 0.08, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Round 125: 5 ridged plate segments plus a heavy frontal horn — the
// horn is the one feature that reads as "titan" past just heavier
// plating, same spirit as the Longhorn Beetle boss's antennae being its
// one signature feature.
function drawTitanBeetle(ctx, e) {
  drawBeetleBody(ctx, e);
  drawBeetlePlates(ctx, e, 5, true);
  ctx.fillStyle = shadeColor(e.color, -30);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.9, e.y - e.radius * 0.15);
  ctx.quadraticCurveTo(e.x - e.radius * 1.5, e.y - e.radius * 0.1, e.x - e.radius * 1.7, e.y);
  ctx.quadraticCurveTo(e.x - e.radius * 1.5, e.y + e.radius * 0.1, e.x - e.radius * 0.9, e.y + e.radius * 0.15);
  ctx.closePath();
  ctx.fill();
}

// --- Whirlpool: ocean-floor creatures -------------------------------------

function drawSeaCucumber(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 1.3, e.radius * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(e.color, -18);
  [[-0.6, 0], [-0.1, 0.25], [0.4, -0.2], [0.8, 0.1]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.ellipse(e.x + dx * e.radius, e.y + dy * e.radius, e.radius * 0.18, e.radius * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawUrchin(ctx, e) {
  ctx.strokeStyle = e.color;
  ctx.lineWidth = Math.max(1.3, e.radius * 0.12);
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(angle) * e.radius * 0.5, e.y + Math.sin(angle) * e.radius * 0.5);
    ctx.lineTo(e.x + Math.cos(angle) * e.radius * 1.3, e.y + Math.sin(angle) * e.radius * 1.3);
    ctx.stroke();
  }
  ctx.fillStyle = shadeColor(e.color, 20);
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawClownFish(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.8, e.y);
  ctx.lineTo(e.x + e.radius * 1.5, e.y - e.radius * 0.5);
  ctx.lineTo(e.x + e.radius * 1.5, e.y + e.radius * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  [-0.3, 0.15].forEach((dx) => {
    ctx.beginPath();
    ctx.ellipse(e.x + dx * e.radius, e.y, e.radius * 0.12, e.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.7, e.y - e.radius * 0.15, e.radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

// Shared by Reef Shark/Hammerhead/Great White below — a generic predator
// silhouette (body + snout + dorsal fin + tail) each boss's own function
// tweaks (hammer-head bar, bigger snout/teeth) rather than duplicating.
function drawSharkBody(ctx, e, snoutLength) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius, e.y - e.radius * 0.15);
  ctx.quadraticCurveTo(e.x - e.radius * (1 + snoutLength), e.y, e.x - e.radius, e.y + e.radius * 0.25);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shadeColor(e.color, -15);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.1, e.y - e.radius * 0.4);
  ctx.lineTo(e.x + e.radius * 0.2, e.y - e.radius * (0.9 + snoutLength * 0.3));
  ctx.lineTo(e.x + e.radius * 0.45, e.y - e.radius * 0.4);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.95, e.y);
  ctx.lineTo(e.x + e.radius * 1.6, e.y - e.radius * 0.7);
  ctx.lineTo(e.x + e.radius * 1.15, e.y);
  ctx.lineTo(e.x + e.radius * 1.6, e.y + e.radius * 0.45);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shadeColor(e.color, 28);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + e.radius * 0.2, e.radius * 0.8, e.radius * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawReefShark(ctx, e) {
  drawSharkBody(ctx, e, 0.35);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.85, e.y - e.radius * 0.08, e.radius * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawStarfish(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const outerAngle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const innerAngle = outerAngle + Math.PI / 5;
    const ox = e.x + Math.cos(outerAngle) * e.radius;
    const oy = e.y + Math.sin(outerAngle) * e.radius;
    const ix = e.x + Math.cos(innerAngle) * e.radius * 0.45;
    const iy = e.y + Math.sin(innerAngle) * e.radius * 0.45;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shadeColor(e.color, 20);
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawSeahorse(ctx, e) {
  ctx.strokeStyle = e.color;
  ctx.lineWidth = Math.max(2, e.radius * 0.5);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - e.radius * 1.2);
  ctx.quadraticCurveTo(e.x + e.radius * 0.5, e.y - e.radius * 0.3, e.x, e.y + e.radius * 0.5);
  ctx.quadraticCurveTo(e.x - e.radius * 0.5, e.y + e.radius * 1.1, e.x + e.radius * 0.1, e.y + e.radius * 1.3);
  ctx.stroke();
  ctx.strokeStyle = shadeColor(e.color, -15);
  ctx.lineWidth = Math.max(1.5, e.radius * 0.25);
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - e.radius * 1.2);
  ctx.lineTo(e.x - e.radius * 0.5, e.y - e.radius * 1.4);
  ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 0.1, e.y - e.radius * 1.15, e.radius * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawHorseshoeCrab(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.3, e.y, e.radius * 0.7, e.radius * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.3, e.y, e.radius * 0.5, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  ctx.fillStyle = shadeColor(e.color, -20);
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.6, e.y - e.radius * 0.15);
  ctx.lineTo(e.x + e.radius * 1.5, e.y);
  ctx.lineTo(e.x + e.radius * 0.6, e.y + e.radius * 0.15);
  ctx.closePath();
  ctx.fill();
}

function drawHammerhead(ctx, e) {
  drawSharkBody(ctx, e, 0.3);
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.95, e.y, e.radius * 0.6, e.radius * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  [-1.45, -0.5].forEach((dx) => {
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y, e.radius * 0.08, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawStingray(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.3, e.y);
  ctx.quadraticCurveTo(e.x - e.radius * 0.3, e.y - e.radius * 1.1, e.x + e.radius * 0.6, e.y - e.radius * 0.15);
  ctx.quadraticCurveTo(e.x - e.radius * 0.3, e.y + e.radius * 1.1, e.x - e.radius * 1.3, e.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = e.color;
  ctx.lineWidth = Math.max(1.5, e.radius * 0.15);
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.55, e.y - e.radius * 0.1);
  ctx.quadraticCurveTo(e.x + e.radius * 1.3, e.y, e.x + e.radius * 1.7, e.y + e.radius * 0.3);
  ctx.stroke();
  ctx.fillStyle = shadeColor(e.color, 20);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.5, e.y, e.radius * 0.4, e.radius * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.9, e.y - e.radius * 0.1, e.radius * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

function drawTuna(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 1.2, e.radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 1.0, e.y);
  ctx.lineTo(e.x + e.radius * 1.7, e.y - e.radius * 0.55);
  ctx.lineTo(e.x + e.radius * 1.25, e.y);
  ctx.lineTo(e.x + e.radius * 1.7, e.y + e.radius * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shadeColor(e.color, -18);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.1, e.y - e.radius * 0.4);
  ctx.lineTo(e.x + e.radius * 0.15, e.y - e.radius * 0.85);
  ctx.lineTo(e.x + e.radius * 0.4, e.y - e.radius * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shadeColor(e.color, 30);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + e.radius * 0.18, e.radius * 0.9, e.radius * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 1.0, e.y - e.radius * 0.08, e.radius * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

function drawMarlin(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 1.1, e.radius * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, -20);
  ctx.lineWidth = Math.max(1.5, e.radius * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.0, e.y);
  ctx.lineTo(e.x - e.radius * 1.9, e.y);
  ctx.stroke();
  ctx.fillStyle = shadeColor(e.color, -15);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.3, e.y - e.radius * 0.35);
  ctx.lineTo(e.x + e.radius * 0.1, e.y - e.radius * 1.15);
  ctx.lineTo(e.x + e.radius * 0.5, e.y - e.radius * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.95, e.y);
  ctx.lineTo(e.x + e.radius * 1.6, e.y - e.radius * 0.5);
  ctx.lineTo(e.x + e.radius * 1.15, e.y);
  ctx.lineTo(e.x + e.radius * 1.6, e.y + e.radius * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.85, e.y - e.radius * 0.06, e.radius * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

// The map's final boss — biggest body, a long gaping snout with visible
// teeth (no other type on this roster shows teeth), distinctly scarier
// than the two reef-dwelling sharks earlier in the roster.
function drawGreatWhite(ctx, e) {
  ctx.fillStyle = shadeColor(e.color, 25);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + e.radius * 0.25, e.radius * 1.1, e.radius * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 1.25, e.radius * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.2, e.y - e.radius * 0.1);
  ctx.quadraticCurveTo(e.x - e.radius * 1.7, e.y, e.x - e.radius * 1.2, e.y + e.radius * 0.25);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shadeColor(e.color, -20);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.15, e.y - e.radius * 0.5);
  ctx.lineTo(e.x + e.radius * 0.2, e.y - e.radius * 1.5);
  ctx.lineTo(e.x + e.radius * 0.5, e.y - e.radius * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 1.1, e.y);
  ctx.lineTo(e.x + e.radius * 1.9, e.y - e.radius * 0.9);
  ctx.lineTo(e.x + e.radius * 1.35, e.y);
  ctx.lineTo(e.x + e.radius * 1.9, e.y + e.radius * 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fff';
  for (let i = 0; i < 4; i += 1) {
    const tx = e.x - e.radius * 1.1 + i * e.radius * 0.22;
    ctx.beginPath();
    ctx.moveTo(tx, e.y + e.radius * 0.2);
    ctx.lineTo(tx + e.radius * 0.08, e.y + e.radius * 0.38);
    ctx.lineTo(tx + e.radius * 0.16, e.y + e.radius * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 1.0, e.y - e.radius * 0.15, e.radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
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
  carapaceBeetle: drawCarapaceBeetle,
  ironshellBeetle: drawIronshellBeetle,
  titanBeetle: drawTitanBeetle,
  seaCucumber: drawSeaCucumber,
  urchin: drawUrchin,
  clownFish: drawClownFish,
  starfish: drawStarfish,
  seahorse: drawSeahorse,
  horseshoeCrab: drawHorseshoeCrab,
  stingray: drawStingray,
  tuna: drawTuna,
  marlin: drawMarlin,
};

const BOSS_DRAW_FUNCTIONS = {
  'forest-boss-tier-1': drawQueenAnt,
  'forest-boss-tier-2': drawLonghornBeetle,
  'marsh-boss-tier-1': drawFrogBoss,
  'marsh-boss-tier-2': drawMilitaryHelmetSnail,
  'desert-boss-tier-1': drawDesertTermite,
  'desert-boss-tier-2': drawBlueDeathBeetle,
  'ocean-boss-tier-1': drawReefShark,
  'ocean-boss-tier-2': drawHammerhead,
  'ocean-boss-tier-3': drawGreatWhite,
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
// size. `segmentDrawFn` lets a family member draw its segments its own
// way (e.g. the snakes below use a smooth, legless body instead of the
// default "many-legged" look) — defaults to drawMillipedeSegment when
// omitted. DEFAULT_MILLIPEDE_BODY is the fallback for any key missing its
// own entry here entirely, so the mechanism itself stays exercisable/
// testable even with a type that never opted into a custom one.
const MILLIPEDE_BODY = {
  gardenerSnake: { segmentCount: 4, spacingFactor: 1.1, segmentDrawFn: drawGardenerSnakeSegment },
  bananaSnake: { segmentCount: 5, spacingFactor: 1.1, segmentDrawFn: drawBananaSnakeSegment },
  armoredSnake: { segmentCount: 6, spacingFactor: 1.05, segmentDrawFn: drawArmoredSnakeSegment },
  anaconda: { segmentCount: 8, spacingFactor: 1.0, segmentDrawFn: drawAnacondaSegment },
};
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

// Shared snake-family segment renderer: a smooth, legless tapering body
// (no "leg" strokes — that look is millipede-specific) with a lighter
// belly stripe down the underside, plus (segment 0, the head, only) a
// pair of eyes and an occasionally-flicking forked tongue so the head end
// reads as a snake's at a glance regardless of which of the 4 types it is.
// `scaled` swaps the plain belly stripe for a line of diamond scale
// plates instead — Armored Snake only, the one type whose own spec calls
// for a visibly "plated/scaled" body distinct from the other three.
function drawSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, scaled, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.15, radius * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();

  if (scaled) {
    ctx.fillStyle = shadeColor(color, -25);
    const offset = segmentIndex % 2 === 0 ? -radius * 0.25 : radius * 0.25;
    ctx.save();
    ctx.translate(offset, -radius * 0.05);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-radius * 0.3, -radius * 0.3, radius * 0.6, radius * 0.6);
    ctx.restore();
  } else {
    ctx.fillStyle = shadeColor(color, 30);
    ctx.beginPath();
    ctx.ellipse(0, radius * 0.35, radius * 0.85, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (segmentIndex === 0) {
    ctx.fillStyle = '#1a1a1a';
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.arc(radius * 0.6, side * radius * 0.35, radius * 0.12, 0, Math.PI * 2);
      ctx.fill();
    });
    // The tongue only flicks out part of the time, not every frame —
    // reads as a periodic flick rather than a permanently-extended prop.
    if (Math.sin(time * 8) > 0.3) {
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(radius * 1.1, 0);
      ctx.lineTo(radius * 1.4, 0);
      ctx.moveTo(radius * 1.4, 0);
      ctx.lineTo(radius * 1.55, -radius * 0.12);
      ctx.moveTo(radius * 1.4, 0);
      ctx.lineTo(radius * 1.55, radius * 0.12);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// Deep Forest's 4 snakes (direct request) all share drawSnakeSegment()
// above — these thin wrappers are what MILLIPEDE_BODY's segmentDrawFn
// actually points at, since that field takes a plain
// (ctx, x, y, radius, color, heading, segmentIndex, time) function and
// `scaled` isn't part of that generic signature (only Armored Snake needs
// it, so it's baked in here per type instead of threaded through the
// whole shared mechanism for everyone else's benefit).
function drawGardenerSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, time) {
  drawSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, false, time);
}
function drawBananaSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, time) {
  drawSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, false, time);
}
function drawArmoredSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, time) {
  drawSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, true, time);
}
function drawAnacondaSegment(ctx, x, y, radius, color, heading, segmentIndex, time) {
  drawSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, false, time);
}

// The millipede-family renderer: draws the head at the enemy's own (x, y)/
// heading like any other enemy, then walks the trail to place each
// trailing segment at a fixed arc-length distance behind it, each with its
// own heading computed from the segment just ahead of it — this is what
// actually produces the "curls around corners" look instead of the whole
// body snapping to one rotation.
function renderMillipedeBody(ctx, enemy, time) {
  const body = MILLIPEDE_BODY[enemy.enemyKey] || DEFAULT_MILLIPEDE_BODY;
  const draw = body.segmentDrawFn || drawMillipedeSegment;
  const spacing = enemy.radius * body.spacingFactor;

  draw(ctx, enemy.x, enemy.y, enemy.radius, enemy.color, enemy.heading, 0, time);

  let prevX = enemy.x;
  let prevY = enemy.y;
  for (let i = 1; i <= body.segmentCount; i += 1) {
    const point = getTrailPointAtDistance(enemy, i * spacing);
    const heading = Math.atan2(point.y - prevY, point.x - prevX) + Math.PI; // facing back toward the segment ahead
    const taper = Math.max(0.4, 1 - i * 0.09);
    draw(ctx, point.x, point.y, enemy.radius * taper, enemy.color, heading, i, time);
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
      renderMillipedeBody(ctx, enemy, time);
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
      } else if (enemy.isPurpleZombie) {
        // Same color-swap trick as the green Decay-Path zombie above, just
        // purple and with no mushroom-cap decoration — that decoration is
        // specific to that other, unrelated zombie state.
        const originalColor = enemy.color;
        enemy.color = '#ab47bc';
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

    // Armor telegraph (direct request): always visible, not just on a
    // failed hit — the whole point is the player understanding *before*
    // attacking why a weak tower will do nothing, not being left to
    // guess after their shots silently fail. Sits just above the health
    // bar so it reads as "this enemy" rather than a separate HUD element.
    if (enemy.armorThreshold > 0) drawArmorShieldIcon(ctx, enemy.x, enemy.y - enemy.radius - 15, enemy.radius * 0.5);
  });
}

// A simple metallic shield badge — deliberately a different, unmistakable
// silhouette from the health bar/status rings every enemy already has, so
// "this one has armor" reads at a glance rather than blending into the
// existing UI chrome.
function drawArmorShieldIcon(ctx, x, y, size) {
  ctx.fillStyle = '#90a4ae';
  ctx.strokeStyle = '#263238';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.8, y - size * 0.5);
  ctx.lineTo(x + size * 0.8, y + size * 0.2);
  ctx.quadraticCurveTo(x + size * 0.8, y + size * 0.9, x, y + size * 1.2);
  ctx.quadraticCurveTo(x - size * 0.8, y + size * 0.9, x - size * 0.8, y + size * 0.2);
  ctx.lineTo(x - size * 0.8, y - size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#eceff1';
  ctx.lineWidth = Math.max(1, size * 0.18);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.35, y);
  ctx.lineTo(x - size * 0.1, y + size * 0.35);
  ctx.lineTo(x + size * 0.4, y - size * 0.35);
  ctx.stroke();
}
