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
// Every enemy type's health across every map was doubled a second time in
// an earlier pass (a straight 2x on each type's own then-current stored
// health — see git history). Bosses/armored beetles ended up ~4x their
// original pre-either-buff values from that; this file's rosters below
// reflect all of that history already baked in.
//
// Third balance pass (direct request, broader again: "make the game
// overall harder, ramp up difficulty faster, AND give each map a felt
// difficulty gap"): see getRoundScaling()'s own comment for the two
// systemic levers this pass added (a steeper, front-loaded round curve;
// a per-map difficulty-tier multiplier) — those alone make every map
// harder sooner without touching a single stored number here. On TOP of
// that, this pass also individually re-tuned every REGULAR roster
// entry's own stored health/speed below (tier1 ×1.4 health/×1.15 speed,
// tier2 ×1.25/×1.08, tier3 ×1.15/unchanged speed) — a tiered rather than
// flat bump, deliberately weighted toward the EARLY tiers specifically
// because "the early game drags on too easy" was the pass's own stated
// problem, and tier3 enemies already arrive late enough (round 51+) to
// get the full force of the steeper round curve by the time a player
// meets them. Bosses' and the shared armored beetles' own stored health
// were deliberately left untouched by this individual re-tune (per the
// request's own "don't touch bosses'/armored thresholds unless they
// clearly need to move too" — they're still hit by both new systemic
// multipliers at spawn time regardless, same mechanism as every other
// enemy, just not re-tuned a second way on top of that). Bounty was left
// untouched on every individually-re-tuned enemy too — see
// getRoundScaling()'s own comment for why that's an acknowledged,
// deliberate side effect rather than a miss. One exception to "speed
// unchanged on tier3": none of tier3 here needed a change since the
// user's own original snake numbers already read as intentional.
const FOREST_ROSTER = {
  enemyTypes: {
    // Bounties follow the file's established ~HP/2 convention (rounded),
    // with Ant bumped from the literal round(2/2)=1 up to 2 so the
    // cheapest enemy in the game is never worth nothing — same exception
    // the original Ant entry made before the roster was replaced. Health/
    // speed below are tier1's ×1.4/×1.15 re-tune (see this file's own
    // top-level comment); bounty intentionally untouched.
    ant: { name: 'Ant', speedMultiplier: 0.8, health: 6, color: '#8d6e63', radius: 7, bounty: 2 },
    fireAnt: { name: 'Fire Ant', speedMultiplier: 1.0, health: 8, color: '#d84315', radius: 8, bounty: 2 },
    armoredAnt: { name: 'Armored Ant', speedMultiplier: 0.7, health: 28, color: '#4e342e', radius: 10, bounty: 5 },
    // Tier2's ×1.25/×1.08 re-tune.
    babyBeetle: { name: 'Baby Beetle', speedMultiplier: 0.76, health: 63, color: '#558b2f', radius: 9, bounty: 13 },
    dungBeetle: { name: 'Dung Beetle', speedMultiplier: 0.65, health: 113, color: '#3e2723', radius: 10, bounty: 23 },
    tigerBeetle: { name: 'Tiger Beetle', speedMultiplier: 0.86, health: 125, color: '#2e7d32', radius: 9, bounty: 25 },
    // Snakes (direct request): Deep Forest's first tier-3 roster — well
    // above the ant/beetle lines' own HP, exactly the "clearly belongs
    // later" gap orderTier3's existing every-5-rounds-starting-after-
    // round-50 cadence was already built for (round 51/56/61/66, one new
    // snake each), so they slot in as its 4 entries rather than needing
    // any new unlock machinery. Health below is tier3's own ×1.15
    // re-tune (speed/bounty unchanged — the user's original numbers
    // already read as intentional, no reason to touch them). Armored
    // Snake is the one judgment call: given the armor-gate mechanic
    // (armorThreshold, see damageEnemy()) by name-thematic request, but
    // calibrated as a light, early nod to it rather than a real forcing
    // function on the Armored Beetle line's own scale — threshold 5 blocks
    // only the very weakest tier-1 hits (Fire/Storm/Decay, 3-5 damage)
    // while every tier-2+ build (and Solar Path at any tier) still gets
    // through untouched; it unlocks at round 61, a full 14 rounds before
    // Carapace Beetle's own round-75/threshold-8 debut, so it reads as a
    // preview of the mechanic, not a repeat of it.
    gardenerSnake: { name: 'Gardener Snake', speedMultiplier: 0.8, health: 345, color: '#558b2f', radius: 9, bounty: 75 },
    bananaSnake: { name: 'Banana Snake', speedMultiplier: 0.7, health: 518, color: '#fdd835', radius: 10, bounty: 113 },
    armoredSnake: {
      name: 'Armored Snake',
      speedMultiplier: 0.5,
      health: 805,
      color: '#6d7a5a',
      radius: 11,
      bounty: 175,
      armorThreshold: 5,
    },
    // radius bumped 13 -> 19 (direct follow-up: "noticeably larger and way
    // longer... clearly bigger than the other Deep Forest snakes") — health/
    // speedMultiplier/bounty deliberately untouched, this is visual-only.
    // See MILLIPEDE_BODY's own anaconda entry below for the matching
    // "way longer" body-segment bump; radius alone only controls how big
    // the HEAD reads, not how many segments trail behind it.
    anaconda: { name: 'Anaconda', speedMultiplier: 0.4, health: 1035, color: '#1b3a1b', radius: 19, bounty: 225 },
  },
  // Boss health doubled across every map in an earlier pass — a straight
  // 2x multiplier on each boss's own health only, not a redesign; bounty/
  // speed/radius are untouched, so bounty no longer lands at the usual
  // ~round(HP/2) convention for these four (that's expected, not a bug).
  // A second, later across-the-board doubling pass applied on top of
  // THIS one for every enemy including these bosses (~4x the enemy's
  // original pre-either-buff health, baked into the values below) — and
  // per this file's own top-level comment, the THIRD pass's individual
  // re-tune deliberately skipped bosses entirely (they still get hit by
  // both of that pass's systemic multipliers — the steeper round curve
  // and the per-map difficulty tier — at spawn time, same as always).
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

// Third balance pass (see FOREST_ROSTER's own top-level comment for the
// full writeup): tier1 ×1.4 health/×1.15 speed, tier2 ×1.25/×1.08 — with
// one deliberate exception below (Frog Larva's speed).
const MARSH_ROSTER = {
  enemyTypes: {
    tadpole: { name: 'Tadpole', speedMultiplier: 0.58, health: 14, color: '#5a7a3a', radius: 7, bounty: 3 },
    froglet: { name: 'Froglet', speedMultiplier: 0.8, health: 28, color: '#66bb6a', radius: 8, bounty: 5 },
    // Notably slow/tanky relative to the other two tier-1 types — direct
    // from spec, not a typo: a deliberately slow, tanky enemy this early
    // acts as a "soak damage, buys the other two time to get past"
    // road-bump. Its speed is the one enemy in this whole re-tune pass
    // deliberately left out of the tier1 speed bump — bumping its
    // signature slowness would have undercut the exact trait the spec
    // called out by name; only its health got the tier1 health re-tune.
    frogLarva: { name: 'Frog Larva', speedMultiplier: 0.2, health: 64, color: '#c5c87a', radius: 11, bounty: 12 },
    appleSnail: { name: 'Apple Snail', speedMultiplier: 0.43, health: 125, color: '#d4a017', radius: 9, bounty: 25 },
    slug: { name: 'Slug', speedMultiplier: 0.54, health: 188, color: '#bf7e4a', radius: 10, bounty: 38 },
    assassinSnail: { name: 'Assassin Snail', speedMultiplier: 0.65, health: 213, color: '#6d4c23', radius: 9, bounty: 43 },
    // Fish (direct request): Marshland's first tier-3 roster — the same
    // "an empty orderTier3 slot was already there waiting" fit Deep
    // Forest's snakes and Savanah's scorpions found, zero engine changes.
    // No numbers given; escalate clearly past this roster's own tier2
    // ceiling (Assassin Snail's 213), weakest-to-strongest. A 4th fish,
    // Electric Eel, was part of the same request but is a boss instead
    // (see bossTypes[3] below) — not one of these three.
    piranha: { name: 'Piranha', speedMultiplier: 0.95, health: 260, color: '#4a6b5a', radius: 8, bounty: 110 },
    arowana: { name: 'Arowana', speedMultiplier: 0.75, health: 340, color: '#b8923a', radius: 9, bounty: 150 },
    redtailCatfish: {
      name: 'Redtail Catfish',
      speedMultiplier: 0.5,
      health: 460,
      color: '#3a2e24',
      radius: 11,
      bounty: 200,
    },
  },
  // Boss health doubled (direct request) — see Deep Forest's bossTypes
  // comment above for the same scope note, including the later
  // across-the-board second doubling pass this stacks with.
  bossTypes: {
    1: { name: 'Frog Boss', speedMultiplier: 0.5, health: 260, color: '#33691e', radius: 20, bounty: 33 }, // was 65, then 130, then this; bounty unchanged
    2: { name: 'Military Helmet Snail', speedMultiplier: 0.3, health: 600, color: '#8d6e4a', radius: 24, bounty: 75 }, // was 150, then 300, then this
    // Electric Eel (direct request): built as a boss from the start, not
    // a regular enemy — Marshland's first real 3rd boss tier, same shape
    // as Whirlpool's own 3-tier roster. "Slow but tanky" boss profile:
    // slower than every regular fish above AND slower than this roster's
    // own tier1/2 bosses, with health escalating past Military Helmet
    // Snail the same ~1.9x ratio Savanah's own tier1->tier2 boss jump
    // (300->580) used, for a consistent "how much does a 3rd tier boss
    // escalate" feel across maps.
    3: { name: 'Electric Eel', speedMultiplier: 0.22, health: 1150, color: '#1a3a4a', radius: 18, bounty: 575 },
  },
  order: ['tadpole', 'froglet', 'frogLarva'],
  orderTier2: ['appleSnail', 'slug', 'assassinSnail'],
  orderTier3: ['piranha', 'arowana', 'redtailCatfish'],
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
// Third balance pass (see FOREST_ROSTER's own top-level comment for the
// full writeup): tier1 ×1.4 health/×1.15 speed, tier2 ×1.25/×1.08.
const SAVANAH_ROSTER = {
  enemyTypes: {
    sandLion: { name: 'Sand Lion', speedMultiplier: 0.8, health: 17, color: '#d2a24c', radius: 8, bounty: 3 },
    sandworm: {
      name: 'Sandworm',
      speedMultiplier: 0.7,
      health: 42,
      color: '#b8926a',
      radius: 8,
      bounty: 8,
      tunnelInterval: 3,
      tunnelDuration: 2,
    },
    desertAnt: { name: 'Desert Ant', speedMultiplier: 1.15, health: 70, color: '#9c5a2e', radius: 7, bounty: 13 },
    giantLubberGrasshopper: {
      name: 'Giant Lubber Grasshopper',
      speedMultiplier: 0.54,
      health: 150,
      color: '#2b2a1f',
      radius: 11,
      bounty: 30,
    },
    desertPrayingMantis: {
      name: 'Desert Praying Mantis',
      speedMultiplier: 0.97,
      health: 125,
      color: '#a9a265',
      radius: 9,
      bounty: 25,
    },
    kissingBug: { name: 'Kissing Bug', speedMultiplier: 0.86, health: 188, color: '#2e1f1a', radius: 8, bounty: 38 },
    // Scorpions (direct request): Savanah's first tier-3 roster — same
    // "an empty orderTier3 slot was already there waiting" fit the Deep
    // Forest snakes found, so this needed the same zero engine changes,
    // only data. No health/speed numbers were given again — picked to
    // escalate clearly past this roster's own tier2 ceiling (kissingBug's
    // 150) the same way Deep Forest's snakes escalated past its own tier2,
    // just not quite as extreme a jump (this is "a new mid-tier line," not
    // explicitly asked to dwarf everything before it the way the snakes'
    // own final tier was). Bounty follows the usual ~HP/2 convention.
    // Health below is tier3's own ×1.15 re-tune (speed/bounty/armor
    // unchanged — same "already intentional, no reason to touch" call as
    // Deep Forest's snakes).
    //
    // Emperor Scorpion WAS a 4th entry here (the roster's own judgment-
    // call armored type, threshold 6) but was retrofitted into this
    // roster's own bossTypes[3] instead (direct request) — see that
    // entry's own comment. Removing it here demotes this tier back to a
    // clean 3-enemy lineup, same shape as every other map's own tier3.
    stripedScorpion: { name: 'Striped Scorpion', speedMultiplier: 0.8, health: 184, color: '#b8946a', radius: 8, bounty: 80 },
    duneScorpion: { name: 'Dune Scorpion', speedMultiplier: 0.6, health: 253, color: '#c9a876', radius: 9, bounty: 110 },
    redScorpion: { name: 'Red Scorpion', speedMultiplier: 0.7, health: 368, color: '#a13a2a', radius: 9, bounty: 160 },
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
    // Emperor Scorpion retrofit (direct request): pulled out of the
    // regular tier3 roster above and rebuilt as this roster's first real
    // 3rd boss tier instead — "slow but tanky," same profile every other
    // boss here uses, not just a bump from its old regular-enemy numbers.
    // Speed dropped well below its old regular 0.45 (and below tier1/2's
    // own 0.6/0.7) to read as unmistakably boss-slow. Health escalates
    // past Blue Death Beetle by the same ~1.9x ratio tier1->tier2 already
    // used here, landing solidly in this roster's own boss ballpark
    // rather than just above its previous regular-tier number. Keeps its
    // signature armorThreshold (6, unchanged) — generateWave()/
    // getSpawnEntryForEnemyKey() were updated to read a boss's own
    // armorThreshold instead of hardcoding 0, specifically so this move
    // doesn't silently strip the one trait Emperor Scorpion was built
    // around. Reuses drawEmperorScorpion's existing art (see
    // BOSS_DRAW_FUNCTIONS/BOSS_FACING_OFFSET) — same creature, just a
    // boss now, no new art needed.
    3: {
      name: 'Emperor Scorpion',
      speedMultiplier: 0.35,
      health: 1120,
      color: '#2a2420',
      radius: 20,
      bounty: 560,
      armorThreshold: 6,
    },
  },
  order: ['sandLion', 'sandworm', 'desertAnt'],
  orderTier2: ['giantLubberGrasshopper', 'desertPrayingMantis', 'kissingBug'],
  // Scorpions unlock weakest-to-strongest on the same every-5-rounds-
  // after-round-50 cadence (round 51/56/61/66) every other map's own
  // orderTier3 already uses. Emperor Scorpion (formerly round 66 here)
  // was retrofitted into bossTypes[3] above — see its own comment — so
  // this is now a clean 3-enemy tier3, same shape as every other map's.
  orderTier3: ['stripedScorpion', 'duneScorpion', 'redScorpion'],
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
//
// Third balance pass (see FOREST_ROSTER's own top-level comment for the
// full writeup): tier1 ×1.4 health/×1.15 speed, tier2 ×1.25/×1.08, tier3
// ×1.15 health/unchanged speed. Whirlpool is also Hard-tier under the new
// per-map multiplier (getRoundScaling()), so these individually-re-tuned
// numbers compound with that at spawn time — intentional, not a miss.
const OCEAN_ROSTER = {
  enemyTypes: {
    seaCucumber: { name: 'Sea Cucumber', speedMultiplier: 0.35, health: 11, color: '#6b5a3a', radius: 8, bounty: 4 },
    urchin: { name: 'Urchin', speedMultiplier: 0.46, health: 21, color: '#2a1a3a', radius: 9, bounty: 8 },
    clownFish: { name: 'Clown Fish', speedMultiplier: 1.0, health: 17, color: '#ff7a33', radius: 7, bounty: 6 },
    starfish: { name: 'Starfish', speedMultiplier: 0.32, health: 112, color: '#d9622b', radius: 10, bounty: 45 },
    seahorse: { name: 'Seahorse', speedMultiplier: 0.38, health: 138, color: '#c9a04a', radius: 8, bounty: 55 },
    horseshoeCrab: { name: 'Horseshoe Crab', speedMultiplier: 0.32, health: 212, color: '#4a4030', radius: 11, bounty: 85 },
    stingray: { name: 'Stingray', speedMultiplier: 0.6, health: 288, color: '#6a7f8a', radius: 13, bounty: 125 },
    tuna: { name: 'Tuna', speedMultiplier: 1.1, health: 368, color: '#395a78', radius: 10, bounty: 160 }, // the fastest regular enemy on this map — real tuna are famously quick, unchanged by the tier3 re-tune
    marlin: { name: 'Marlin', speedMultiplier: 1, health: 460, color: '#1f3a5c', radius: 11, bounty: 200 },
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

// Tundra (direct request): a snowy Hard-tier roster, given as one ordered,
// weakest-to-strongest list of 12 (3 regular tiers of 3 plus 3 bosses at
// positions 4/8/12) — the exact same shape Whirlpool's own 12-entry list
// used, so it maps directly onto this file's existing
// order/bossTypes[1]/orderTier2/bossTypes[2]/orderTier3/bossTypes[3]
// structure with zero engine changes, only data.
//
// REVISED on direct report ("make tundra easier its impossible right
// now"). The roster originally shipped with health deliberately ABOVE
// Whirlpool's own equivalent tiers (see git history for the old numbers
// and the "matching or exceeding Whirlpool's intensity" rationale that
// produced them) — on top of Tundra's two paths (TUNDRA_PATH_A/TUNDRA_PATH_B,
// map.js) each being noticeably SHORTER than Whirlpool's long inward
// spiral, meaning towers get far less total time/exposure against any
// one enemy before it reaches a goal here than they would on Whirlpool.
// Higher health AND less tower-exposure time compounded into something
// well past "Hard," not just a notch above it. Fixed by bringing every
// health number down BELOW its Whirlpool equivalent instead of above it
// (tier1 ~12-20hp, tier2 ~95-150hp, tier3 ~250-380hp, bosses 220/420/1200
// vs. Whirlpool's 250/480/1400) — Tundra's shorter paths alone are now
// what keeps it feeling like Hard tier, rather than stacking a tougher
// roster on top of that. The early fliers' speed was also trimmed a
// notch (arcticBumblebee/deerFly/arcticRinglet/snowScorpionFly/
// arcticBluet/polarBumblebee/wolfSpider all eased down) since the short
// paths were giving the player especially little reaction time on an
// early-game economy before any real towers are up. The flat
// MAP_DIFFICULTY_MULTIPLIER (1.8x, below) is untouched — it's still the
// uniform "Hard tier" lever every Hard map shares; this was specifically
// the roster's OWN numbers overshooting that tier, not the tier itself.
//
// Speed is still the "weakest to strongest" list's OTHER axis, same
// spirit as every other roster: smaller/faster fliers up front (deer
// flies and bumblebees are notoriously quick/annoying), heavier/slower
// things (beetles, the woolly bear's fuzzy caterpillar-like bulk)
// trending slower despite more health, same non-monotonic-with-health
// pattern Whirlpool's own tuna/marlin already established — just eased
// down in absolute terms across the board per the above.
//
// Tundra's own difficulty TIER (MAP_DIFFICULTY_MULTIPLIER, this file)
// stays matched to Whirlpool's 1.8x Hard multiplier exactly — see that
// constant's own comment.
const TUNDRA_ROSTER = {
  enemyTypes: {
    arcticBumblebee: { name: 'Arctic Bumblebee', speedMultiplier: 0.65, health: 12, color: '#2b2420', radius: 7, bounty: 6 },
    deerFly: { name: 'Deer Fly', speedMultiplier: 0.8, health: 16, color: '#5c5048', radius: 6, bounty: 8 },
    arcticMoth: { name: 'Arctic Moth', speedMultiplier: 0.55, health: 20, color: '#d8dde2', radius: 9, bounty: 10 },
    arcticRinglet: { name: 'Arctic Ringlet', speedMultiplier: 0.6, health: 95, color: '#6b5a42', radius: 7, bounty: 40 },
    snowScorpionFly: { name: 'Snow Scorpion Fly', speedMultiplier: 0.65, health: 120, color: '#8a7a5c', radius: 7, bounty: 50 },
    arcticBluet: { name: 'Arctic Bluet', speedMultiplier: 0.7, health: 150, color: '#3a7ab8', radius: 6, bounty: 60 },
    polarBumblebee: { name: 'Polar Bumblebee', speedMultiplier: 0.65, health: 250, color: '#f0f4f7', radius: 9, bounty: 100 },
    snowGroundBeetle: { name: 'Snow Ground Beetle', speedMultiplier: 0.55, health: 300, color: '#23282b', radius: 9, bounty: 120 },
    wolfSpider: { name: 'Wolf Spider', speedMultiplier: 0.6, health: 380, color: '#5a4a3a', radius: 10, bounty: 150 },
  },
  bossTypes: {
    1: { name: 'Arctic Fritillary', speedMultiplier: 0.45, health: 220, color: '#e8923a', radius: 16, bounty: 110 },
    2: { name: 'Arctic Woolly Bear Moth', speedMultiplier: 0.38, health: 420, color: '#4a3826', radius: 19, bounty: 210 },
    // The map's true final boss, same "noticeably tougher, not just
    // incrementally so" billing Great White got on Whirlpool — but now
    // below Great White's own 1400, not above it (see this roster's own
    // top comment for why).
    3: { name: 'Giant Arctic Wolf Spider', speedMultiplier: 0.42, health: 1200, color: '#3a2e24', radius: 23, bounty: 600 },
  },
  order: ['arcticBumblebee', 'deerFly', 'arcticMoth'],
  orderTier2: ['arcticRinglet', 'snowScorpionFly', 'arcticBluet'],
  orderTier3: ['polarBumblebee', 'snowGroundBeetle', 'wolfSpider'],
};

// Volcanic (direct request): originally shipped as exactly 8 named
// creatures — 3 regular tier1 insects, a boss, 3 regular tier2 reptiles,
// and a second boss — NOT the usual 3-regular-tiers-plus-3-bosses shape
// every other built-in roster above uses; `orderTier3` shipped as a
// deliberately empty array (getUnlockedEnemyTypes() below reads
// `roster.orderTier3.length` unconditionally once round > 50, so an
// actually-missing field would throw) and getBossForRound()'s own
// existing highest-designed-tier fallback meant round 75 just reused
// Marine Iguana (bossTypes[2]) again, the same "fewer tiers than 3 is
// fine" tolerance FOREST_ROSTER's own 2-boss shape already established.
//
// A later direct request ("add new enemies to volcano") filled that
// empty tier3 slot in for real, the same "an empty orderTier3 slot was
// already there waiting" pattern Deep Forest's snakes/Marshland's fish/
// Savanah's scorpions all used for their own follow-up tier3s — Volcanic
// now has a real 3rd boss too (Namib Desert Beetle), making round 75 a
// genuine new boss rather than a Marine Iguana rematch. 3 new insects,
// weakest to strongest as given (Velvet Ant, Volcanic Longhorn Beetle,
// Fire-Loving Beetle), escalating past Lava Iguana's own tier2 ceiling
// (150) same as every other map's own tier3 escalates past its tier2.
// Namib Desert Beetle's health follows the same "~1.9x the previous
// boss" escalation Savanah's Emperor Scorpion/Marshland's Electric Eel
// both used for their own boss3 (both later follow-up additions too).
//
// Health/speed otherwise calibrated at TUNDRA_ROSTER's own POST-NERF
// baseline (see that roster's comment above for why it was nerfed —
// tuned below Whirlpool's equivalents, not above), not Whirlpool's own
// numbers directly: this is brand new, never-played content, and
// Volcanic's single path (VOLCANIC_WAYPOINTS, map.js) — while
// meaningfully longer than Tundra's own paths — is still shorter than
// Whirlpool's long inward spiral, so erring toward the already-proven-
// safe baseline rather than Whirlpool's own (longer-path-calibrated)
// numbers avoids shipping a second "impossible" Hard map on day one.
const VOLCANIC_ROSTER = {
  enemyTypes: {
    lavaCricket: { name: 'Lava Cricket', speedMultiplier: 0.7, health: 13, color: '#4a1510', radius: 6, bounty: 6 },
    volcanicAshBeetle: { name: 'Volcanic Ash Beetle', speedMultiplier: 0.55, health: 19, color: '#5c5650', radius: 8, bounty: 8 },
    wekiuBug: { name: 'Wēkiu Bug', speedMultiplier: 0.65, health: 15, color: '#1c1a18', radius: 5, bounty: 7 },
    landIguana: { name: 'Land Iguana', speedMultiplier: 0.5, health: 100, color: '#6b7a4a', radius: 11, bounty: 42 },
    pinkIguana: { name: 'Pink Iguana', speedMultiplier: 0.55, health: 125, color: '#d98fa3', radius: 11, bounty: 52 },
    lavaIguana: { name: 'Lava Iguana', speedMultiplier: 0.6, health: 150, color: '#3a2420', radius: 11, bounty: 62 },
    // Tier3 (direct follow-up request): real velvet ants are actually
    // wingless wasps, not ants, famous for their painful sting and dense
    // fuzzy black-and-red/orange banded coat — drawVelvetAnt below leans
    // on that banding since it's this insect's own single most
    // recognizable trait. A fast runner (real velvet ants are notably
    // quick on the ground), the weakest of this new trio per the
    // request's own given order.
    velvetAnt: { name: 'Velvet Ant', speedMultiplier: 0.75, health: 180, color: '#b8360f', radius: 8, bounty: 90 },
    // A long-antennae beetle, recolored into Volcanic's own lava-dark
    // palette with a glowing orange antennae/joint accent rather than a
    // literal-brown longhorn beetle — same "fits THIS map's theme" spirit
    // every other Volcanic insect already uses.
    volcanicLonghornBeetle: {
      name: 'Volcanic Longhorn Beetle',
      speedMultiplier: 0.5,
      health: 230,
      color: '#2e1a14',
      radius: 10,
      bounty: 115,
    },
    // Real fire-loving beetles (genus Melanophila) are famous for
    // literally being drawn to fires/heat via dedicated infrared-sensing
    // pits — a perfect native fit for a volcanic map, not a reskin of
    // anything. drawFireLovingBeetle below gives it a pair of small
    // glowing heat-pit accents as its own signature trait. The strongest
    // of this new trio, per the request's own given order.
    fireLovingBeetle: { name: 'Fire-Loving Beetle', speedMultiplier: 0.55, health: 290, color: '#1c1410', radius: 9, bounty: 145 },
  },
  bossTypes: {
    1: { name: 'Haleakalā Mecyclothorax Beetle', speedMultiplier: 0.45, health: 220, color: '#2e2a26', radius: 17, bounty: 110 },
    2: { name: 'Marine Iguana', speedMultiplier: 0.4, health: 420, color: '#23282a', radius: 21, bounty: 210 },
    // Namib Desert Beetle (direct follow-up request, the new tier3's own
    // boss): a real beetle famous for the bumpy, fog-harvesting shell
    // covering its back (drawNamibDesertBeetle below gives it exactly
    // that bumpy texture) — grey/tan rather than this roster's otherwise
    // dark, lava-charred palette, a deliberate "pale desert beetle" visual
    // contrast against everything else here. The map's true "last
    // designed" boss now (getBossForRound()'s own fallback no longer
    // needs to reuse Marine Iguana past round 75) — biggest, slowest, and
    // tankiest thing on this map, same billing every other map's final
    // boss gets.
    3: { name: 'Namib Desert Beetle', speedMultiplier: 0.35, health: 800, color: '#6b6255', radius: 19, bounty: 400 },
  },
  order: ['lavaCricket', 'volcanicAshBeetle', 'wekiuBug'],
  orderTier2: ['landIguana', 'pinkIguana', 'lavaIguana'],
  orderTier3: ['velvetAnt', 'volcanicLonghornBeetle', 'fireLovingBeetle'],
};

// Caves (direct request, relayed from the peer session, from 3 reference
// photos given as a written description instead): a dark cave roster of
// 12 named creatures given in one ordered, weakest-to-strongest list —
// but only 2 boss tiers, not the usual 3 (explicitly called out in the
// request itself: "same shape as Volcanic/Deep Forest's existing 2-boss
// fallback"). Unlike Whirlpool/Tundra's own 12-entry lists (which split
// evenly into 3 regular tiers of 3 plus 3 bosses at positions 4/8/12),
// this list's 2 bosses sit at positions 4 and 12 — Cave Midge (round 25)
// and Blind Cavefish (the FINAL entry, explicitly called out as "the
// toughest in this roster"). That leaves 7 regular enemies between the
// two bosses (positions 5-11), not the usual 3-then-3 split a 3-boss list
// would give — rather than force an arbitrary tier2/tier3 split the
// request's own ordering doesn't support, all 7 go into orderTier2 as one
// longer list (nothing in getUnlockedEnemyTypes()'s own every-5-rounds
// cadence requires exactly 3 entries — any length works), unlocking
// progressively from round 26 through round 56; orderTier3 is left empty,
// same "no 3rd regular tier designed" shape Volcanic originally shipped
// with (see that roster's own history, now filled in by its own later
// follow-up) before this. getBossForRound()'s own existing fallback means
// round 75+ just keeps reusing Blind Cavefish, the same tolerance
// FOREST_ROSTER's 2-boss shape already established.
//
// Difficulty tier: Medium (MAP_DIFFICULTY_MULTIPLIER below), not Hard —
// nothing in the request named a tier explicitly, so this is a judgment
// call; a cave full of bats/moths/birds/blind salamanders reads as
// atmospheric and a little spooky rather than the brutal gauntlet
// Whirlpool/Tundra/Volcanic's own rosters are calibrated for, so health/
// speed below are calibrated at Marshland/Savanah's own Medium-tier
// baseline (tier1 ~15-55hp, climbing to boss2's 600 — in the same range
// Marshland's Military Helmet Snail/Savanah's Blue Death Beetle sit at
// for their own boss2) rather than Whirlpool/Tundra/Volcanic's Hard-tier
// numbers. Bounty is a clean round(health/2) throughout — brand new
// content, no earlier pre-doubling baggage to account for, same approach
// Whirlpool/Volcanic's own numbers used when they were new.
//
// Speed is the usual second axis, independent of the health-ordered list:
// real swifts/swiftlets are famously fast fliers (faster even than the
// bat), while blind cave salamanders/the final cavefish boss are slow
// crawlers/drifters despite real toughness, matching the non-monotonic-
// with-health pattern every other roster's own "weakest to strongest"
// list already establishes (e.g. Whirlpool's tuna, Savanah's desertAnt).
const CAVES_ROSTER = {
  enemyTypes: {
    bat: { name: 'Bat', speedMultiplier: 1.0, health: 15, color: '#2b2a2e', radius: 7, bounty: 8 },
    // Color REVISED alongside the Moth's own art redesign (direct
    // follow-up request, from a real reference photo) — the wings now
    // have their own fixed amber-brown/dark-border/eyespot palette
    // (MOTH_WING_COLOR etc., drawMoth), independent of this field; this
    // is now specifically the fuzzy body's own "fat brown body" color,
    // not the pale cream it was before the redesign.
    moth: { name: 'Moth', speedMultiplier: 0.55, health: 30, color: '#5c4028', radius: 9, bounty: 15 },
    fungusGnat: { name: 'Fungus Gnats', speedMultiplier: 0.95, health: 55, color: '#6b6255', radius: 5, bounty: 28 },
    oilbird: { name: 'Oilbird', speedMultiplier: 0.55, health: 85, color: '#6b4a32', radius: 11, bounty: 43 },
    // Swifts (real ones) are among the fastest fliers in nature —
    // drawCaveBirdBody's own `longWings` option (a longer, narrower
    // scythe-shaped wing) is this family's shared signature trait, and
    // the fastest regular enemy on this map, same "small/fast up front"
    // convention Whirlpool's tuna/Savanah's desertAnt already use.
    swiftlet: { name: 'Swiftlet', speedMultiplier: 1.1, health: 115, color: '#3a3a42', radius: 7, bounty: 58 },
    whiteCollaredSwift: {
      name: 'White-collared Swift',
      speedMultiplier: 1.05,
      health: 150,
      color: '#454552',
      radius: 7,
      bounty: 75,
    },
    caveSwallow: { name: 'Cave Swallow', speedMultiplier: 0.9, health: 190, color: '#7a5a3a', radius: 7, bounty: 95 },
    // Color REVISED on user bug report (relayed from the peer session):
    // originally too close to Texas Blind Salamander's own color below
    // ('#d9b8ae' vs '#c9a8b8' — both pale desaturated pinks, barely
    // distinguishable at a glance). Olm is "pale pinkish/flesh-colored"
    // per the real animal — a clearer, warmer pink-flesh tone now. See
    // drawOlm's own comment for the real shape/gill differences added
    // alongside this color fix.
    olm: { name: 'Olm', speedMultiplier: 0.35, health: 240, color: '#dba89c', radius: 10, bounty: 120 },
    // Color REVISED alongside Olm's own fix above — a pale, cool grey-
    // tan now (reads as "pale/translucent" per the real animal) instead
    // of a pink too close to Olm's own, a different hue family entirely
    // rather than just a different shade of the same pink.
    texasBlindSalamander: {
      name: 'Texas Blind Salamander',
      speedMultiplier: 0.3,
      health: 300,
      color: '#c7c2b4',
      radius: 10,
      bounty: 150,
    },
    caveShrimp: { name: 'Cave Shrimp', speedMultiplier: 0.5, health: 370, color: '#cfe0d8', radius: 6, bounty: 185 },
  },
  bossTypes: {
    1: { name: 'Cave Midge', speedMultiplier: 0.55, health: 260, color: '#5c3a2e', radius: 16, bounty: 130 },
    // The map's true final boss (explicitly called out in the request:
    // "should be the toughest in this roster") — biggest, slowest, and
    // by far the tankiest thing here, same billing every other map's
    // final boss gets. Deliberately eyeless (drawBlindCavefish below
    // draws no eye at all, unlike every other fish-shaped creature in
    // this game) — "blind," its own namesake trait.
    2: { name: 'Blind Cavefish', speedMultiplier: 0.28, health: 600, color: '#d8dce0', radius: 21, bounty: 300 },
  },
  order: ['bat', 'moth', 'fungusGnat'],
  orderTier2: ['oilbird', 'swiftlet', 'whiteCollaredSwift', 'caveSwallow', 'olm', 'texasBlindSalamander', 'caveShrimp'],
  orderTier3: [],
};

// Deep Sea (direct request: "ruins, sand... dark blue... the [goal
// structure] will be a submarine" — see map.js's own
// DEEP_SEA_SUBMARINE/DEEP_SEA_RUINS comment for the terrain/open-field
// side of this). Same 2-boss shape as CAVES_ROSTER above (order/
// orderTier2 of 3 each, orderTier3 empty, bossTypes only at tiers 1/2 —
// getBossForRound() already falls back to the highest designed tier past
// that, so nothing past round 50 needs a 3rd boss defined) rather than
// the usual 3-boss shape, per the request's own explicit roster (6
// regular species plus exactly 2 named bosses: Whalefish, California Sun
// Star). Named species real-world-accurate where it matters for the
// silhouette (an anglerfish-like Whalefish with an oversized mouth/lure,
// a many-armed California Sun Star rather than a plain 5-point starfish)
// — same "look like the real species, not just the right color" bar
// every other roster's own creatures are held to.
const DEEP_SEA_ROSTER = {
  enemyTypes: {
    snailFish: { name: 'Snailfish', speedMultiplier: 0.55, health: 12, color: '#d9b8c0', radius: 7, bounty: 5 },
    rattailFish: { name: 'Rattail Fish', speedMultiplier: 0.6, health: 26, color: '#8a7a6a', radius: 9, bounty: 10 },
    giantCuskEel: { name: 'Giant Cusk Eel', speedMultiplier: 0.65, health: 58, color: '#3a2a42', radius: 10, bounty: 18 },
    spinyStar: { name: 'Spiny Star', speedMultiplier: 0.3, health: 95, color: '#c9502e', radius: 11, bounty: 30 },
    giantSeaSpider: { name: 'Giant Sea Spider', speedMultiplier: 0.42, health: 130, color: '#aab8ae', radius: 12, bounty: 42 },
    fragilePinkSeaUrchin: { name: 'Fragile Pink Sea Urchin', speedMultiplier: 0.22, health: 65, color: '#e88fb0', radius: 10, bounty: 32 },
  },
  bossTypes: {
    1: { name: 'Whalefish', speedMultiplier: 0.38, health: 340, color: '#1a2436', radius: 22, bounty: 160 },
    // The map's true final boss, same "biggest/slowest/tankiest" billing
    // every other map's final boss gets.
    2: { name: 'California Sun Star', speedMultiplier: 0.28, health: 680, color: '#d9622b', radius: 26, bounty: 340 },
  },
  order: ['snailFish', 'rattailFish', 'giantCuskEel'],
  orderTier2: ['spinyStar', 'giantSeaSpider', 'fragilePinkSeaUrchin'],
  orderTier3: [],
};

// --- The Hollow Event (direct request, relayed from the peer session) -----
// "Adventures" is a brand-new top-level entry on the main menu (see
// renderMenu() in game.js), distinct from the normal Map/Mode flow every
// other roster above is reached through: it drops straight into this one
// fixed stage (see GAME_MODES.adventure in game.js) rather than offering a
// map or mode choice, and the run is a single continuous climb to round
// 50 — not an endless climb like every other map — where round 50 is
// this stage's own fixed climactic final-boss round (see
// triggerStageComplete()/the round-cap check in game.js's update()).
//
// Same "3 regular tier1 + a mid boss + 3 regular tier2 + a 2nd (here,
// FINAL) boss, empty orderTier3" shape Volcanic originally shipped as
// (see that roster's own comment) — exactly what this stage needs, since
// getUnlockedEnemyTypes()'s own generic cadence (enemies.js, unchanged)
// already unlocks tier1 across rounds 1/6/11, the round-25 boss slot
// (BOSS_INTERVAL) lands Mournful Sphinx exactly where the request's own
// "an earlier round, per your usual boss-cadence logic" asked for, tier2
// unlocks across rounds 26/31/36 (comfortably before round 50), and the
// round-50 boss slot (BOSS_INTERVAL * 2) lands The Hollow Crow on
// EXACTLY round 50 — the request's own explicit requirement — for free,
// with zero new cadence machinery needed anywhere in this file.
//
// Health/speed/bounty calibrated against Volcanic's own original
// (never-played-yet) baseline and Tundra's post-nerf numbers (tier1
// ~12-20hp, tier2 ~100-150hp, boss1 ~220-250hp, boss2 ~400-450hp) — this
// is brand-new content on a reused Deep Forest path shape (see
// MAP_TYPES.theHollowEvent in map.js), so erring toward an already-proven
// baseline rather than inventing new numbers from scratch. The Hollow
// Crow (final boss) is the one deliberate departure from that baseline:
// per the request's own "distinct/more significant... higher stats and a
// standout visual, similar to how your other maps' final bosses outscale
// their mid bosses," it's tuned closer to a true TIER-3 final boss
// elsewhere (800hp, between Namib Desert Beetle's 800 and Giant Arctic
// Wolf Spider's 1200) even though it only ever occupies this roster's
// bossTypes[2] slot — because round 50 genuinely IS this stage's whole
// climax, not a mid-point the way round 50 is on an endless map, it
// earns a "true finale" stat budget rather than a plain ~2x-the-midboss
// one. Bounty on both bosses follows the roster-wide ~HP/2 convention
// every boss above already uses (Tundra/Volcanic/Ocean); regular-enemy
// bounty follows the ~HP/2.3-2.5 convention those same rosters' own
// regular entries use.
//
// Bounties/order deliberately follow the request's own given numbered
// list (weakest-to-strongest within each tier), same "the user's own
// given order IS the intended power curve" convention Volcanic's own
// tier3 trio and Marshland/Savanah's own tier3 fish/scorpions used.
const HOLLOW_ROSTER = {
  enemyTypes: {
    // Real oakleaf butterflies (genus Kallima) fold their wings shut at
    // rest to look exactly like a dead leaf, down to a fake "leaf vein"
    // line down the middle — drawOakleafButterfly below draws a single
    // closed, pointed-leaf silhouette instead of an open wing pair, the
    // one shape in this roster that isn't built from drawInsectWings.
    // The roster's own weakest/fastest entry, per the request's given
    // order.
    oakleafButterfly: { name: 'Oakleaf Butterfly', speedMultiplier: 0.9, health: 13, color: '#c9842f', radius: 6, bounty: 6 },
    // Real dead-leaf mantises (genus Deroplatys) are slow, patient
    // ambush predators camouflaged as a dead leaf, with raised, folded
    // "praying" forelegs — see drawDeadleafMantis below. Deliberately
    // the slowest of this tier (an ambush hunter, not a flier).
    deadleafMantis: { name: 'Deadleaf Mantis', speedMultiplier: 0.55, health: 19, color: '#8a7249', radius: 8, bounty: 8 },
    // Real buff-tip moths (Phalera bucephala) are famous for resembling
    // a snapped birch twig at rest — dull grey-brown wings each tipped
    // with a pale buff/cream patch mimicking pale broken wood. The
    // strongest of this tier, per the request's given order.
    bufftipMoth: { name: 'Buff-tip Moth', speedMultiplier: 0.7, health: 24, color: '#6b5d4a', radius: 7, bounty: 10 },
    // Real orb weavers build webs rather than chase prey — slow and
    // ground-bound here (it has to walk the path like everything else),
    // tanky for its tier to match that "patient, armored" read. The
    // roster's own weakest tier2 entry, per the request's given order.
    orbWeaver: { name: 'Orb Weaver', speedMultiplier: 0.55, health: 100, color: '#5c3a1e', radius: 9, bounty: 42 },
    // Real eastern red bats are solitary, fast-flying, and famously
    // reddish-orange furred (unlike the grey-brown of Caves' own Bat) —
    // reuses drawBat's shared body wholesale, color alone does the work,
    // same "shared body, color tells them apart" convention Volcanic's
    // own 3 iguanas already established.
    // Enemy-art realism pass follow-up: this roster's own top comment
    // originally called "color alone does the work" sufficient — revised
    // after applying the same standard this pass used everywhere else
    // (Desert Ant, Pink Iguana) to every other "shared body, only color
    // differs" case found. Real Eastern Red Bats do have one further
    // genuine field mark beyond color: a heavily furred tail membrane
    // (most bats, Caves' own plain Bat included, have a bare one) — see
    // drawBat's own new `furredTail` option, used only here.
    easternRedBat: { name: 'Eastern Red Bat', speedMultiplier: 0.95, health: 125, color: '#a13a1f', radius: 8, bounty: 52 },
    // Real (red-morph) Eastern Screech Owls are small but fierce nocturnal
    // predators — reuses Caves' own shared drawCaveBirdBody, plus ear
    // tufts and big forward-facing eyes (the 2 traits that read as "owl"
    // rather than just "bird"). The roster's own strongest tier2 entry,
    // per the request's given order.
    redEasternScreechOwl: { name: 'Red Eastern Screech Owl', speedMultiplier: 0.6, health: 150, color: '#a0522d', radius: 9, bounty: 62 },
  },
  bossTypes: {
    // A real sphinx/hawkmoth species — Latin "lugubris" literally means
    // "mournful," matching the somber dark-grey/furred design below
    // (drawMournfulSphinx: 2 layered wing pairs at different tints/
    // spreads, a bigger, boss-tier step up from Buff-tip Moth's single
    // pair). This stage's own mid-boss, landing on round 25 (BOSS_INTERVAL)
    // per the request's own "an earlier round" ask.
    1: { name: 'Mournful Sphinx', speedMultiplier: 0.45, health: 230, color: '#4a4036', radius: 18, bounty: 115 },
    // The stage's own true, climactic final boss — lands on EXACTLY round
    // 50 (BOSS_INTERVAL * 2) via the same generic boss-cadence machinery
    // every other roster's own tier2 boss already uses, no special-casing
    // needed. Tuned well above a plain "2x the mid-boss" step (see this
    // roster's own top comment for the exact reasoning) and visually
    // distinct via drawHollowCrow's own pale glowing "hollow" eye sockets
    // and tattered, notched wing edges — "hollow"/decaying rather than a
    // clean, healthy crow, and the biggest boss radius in the game so far
    // (27, versus Great White's 24 and Giant Arctic Wolf Spider's 23),
    // the standout-silhouette half of the request's own "standout visual"
    // ask.
    // Stat tweak (direct follow-up request, relayed from the peer
    // session): "cut its movement speed way down... a real lumbering/
    // inevitable-feeling final boss" and "multiply its current health by
    // 20x." speedMultiplier 0.35 -> 0.1 — well below every other boss in
    // the game (the previous slowest, Electric Eel's 0.22 and Blind
    // Cavefish's 0.28, both stay faster than this), unambiguously the
    // slowest thing in the whole roster rather than just "a bit slower."
    // health 800 -> 16000 (20x), literal. Damage/bounty/armor left
    // untouched, per the request's own default — the one place this
    // needed a real judgment call (whether the health change "suddenly
    // breaks" anything) was update()'s own leak-damage mechanic
    // (maxHealth-based damage when an enemy reaches the goal): that was
    // ALREADY effectively "instant game over" at the OLD 800 health
    // (past PLAYER_STARTING_HEALTH's 500), so 16000 doesn't newly break
    // anything there — letting the stage's own final boss through was
    // already meant to be catastrophic, not something this change
    // introduces.
    2: { name: 'The Hollow Crow', speedMultiplier: 0.1, health: 16000, color: '#1c1c1c', radius: 27, bounty: 400 },
  },
  order: ['oakleafButterfly', 'deadleafMantis', 'bufftipMoth'],
  orderTier2: ['orbWeaver', 'easternRedBat', 'redEasternScreechOwl'],
  // Deliberately empty, same Volcanic-original/Caves precedent (this
  // roster's own top comment) — the stage ends at round 50, so a tier3
  // slot (which wouldn't start unlocking until round 51 anyway, per
  // getUnlockedEnemyTypes()'s own cadence) would simply never be seen.
  orderTier3: [],
};

// Keyed by TERRAIN id (map.js's TERRAIN_THEMES keys — 'forest'/'marsh'/
// 'desert'), not the map's own id ('deepForest'/'marshland'/'savanah') —
// getActiveRoster() below looks this up via getActiveMap().terrain.
const MAP_ROSTERS = {
  forest: FOREST_ROSTER,
  marsh: MARSH_ROSTER,
  desert: SAVANAH_ROSTER,
  ocean: OCEAN_ROSTER,
  tundra: TUNDRA_ROSTER,
  volcano: VOLCANIC_ROSTER,
  caves: CAVES_ROSTER,
  deepSea: DEEP_SEA_ROSTER,
  hollow: HOLLOW_ROSTER,
};

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
// Originally shared across every map (direct request: "regardless of
// map"), later narrowed (direct request, relayed from the peer session:
// "stop injecting it regardless of map... remove from maps where it was
// only ever an off-theme bolt-on") to only the terrains whose own native
// roster already includes a beetle-family enemy — see
// ARMORED_BEETLE_TERRAINS just below the theme table. Every enabled
// terrain still gets the identical three tiers, unlocking by round alone.
// Deliberately NOT using orderTier3's existing unlock cadence (every-5-
// rounds-per-type starting right after round 50, landing at round
// 51/56/61) since that can't be made to land on the specific rounds
// asked for here — these use their own explicit unlockRound instead.
//
// Threshold calibration — pulled every attacking path's real per-hit
// damage at each of its own 4 tiers from towers.js (Sunflower's Solar/
// Fire/Storm, Rose's Thorn/Root/Projectile, Mushroom's Decay; Enable
// Path buffs OTHER towers rather than the Mushroom's own hit, and Infect
// Path deals no damage at all — neither has a "per-hit damage" to
// calibrate against, so they're excluded from this comparison on
// purpose, not an oversight):
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
// Per-terrain reskin history (user bug report: literal land beetles were
// showing up on every map — Whirlpool's ocean floor originally, then
// flagged again more broadly as "beetles in random maps" once Marshland/
// Savanah/Tundra existed too) — REMOVED below (direct request, relayed
// from the peer session), not just reskinned, on the three terrains where
// a beetle (or a themed stand-in) never belonged to begin with: Whirlpool
// (ocean), Marshland (marsh), Tundra (tundra). ARMORED_BEETLE_TERRAINS
// just below gates the forcing function itself (getUnlockedArmoredBeetleKeys/
// getAllSpawnableEnemyKeys) so those three terrains never unlock, spawn,
// or offer these enemies at all any more — simpler than keeping some
// equivalent armor-gated enemy there instead, and what was actually asked
// for. The two terrains that keep it (Deep Forest/Savanah, both already
// having native beetle-family enemies of their own — babyBeetle/
// dungBeetle/tigerBeetle/Longhorn Beetle, and Blue Death Beetle,
// respectively) now ALSO lost their old per-terrain reskin (Savanah's
// "Desert Carapace Beetle" etc.) per the same request's own wording —
// "as literal beetles, no reskin needed" — so this table is left with
// only Volcanic's entry, which (unlike Savanah's) was always color-only on
// the same literal beetle shape and silhouette, not a cosmetic rename;
// Volcanic also already has its own native beetle-family enemies
// (Volcanic Ash Beetle, Haleakalā Mecyclothorax Beetle), so the same "fits
// natively" logic that keeps Deep Forest/Savanah enabled applies here too
// — this wasn't called out explicitly in the request, but follows the
// same stated principle. Deep Forest/Savanah have no entry here any more:
// both now fall through to the tier's own stored name/color unchanged,
// the same "native" land-beetle look Deep Forest always had.
const ARMORED_BEETLE_THEME_BY_TERRAIN = {
  volcano: {
    carapaceBeetle: { name: 'Obsidian Carapace Beetle', color: '#3a2e28' },
    ironshellBeetle: { name: 'Magma Ironshell Beetle', color: '#8a3a1a' },
    titanBeetle: { name: 'Molten Titan Beetle', color: '#c85a1e' },
  },
};

// Terrains whose own native roster already includes a beetle-family enemy
// — the only terrains where ARMORED_BEETLE_TIERS below still unlocks/
// spawns/is Sandbox-spawnable at all (see getUnlockedArmoredBeetleKeys()
// and getAllSpawnableEnemyKeys() further down, the two choke points this
// gates). 'forest' (Deep Forest: babyBeetle/dungBeetle/tigerBeetle/
// Longhorn Beetle), 'desert' (Savanah: Blue Death Beetle), and 'volcano'
// (Volcanic: Volcanic Ash Beetle/Haleakalā Mecyclothorax Beetle) all have
// one; 'ocean' (Whirlpool)/'marsh' (Marshland)/'tundra' (Tundra) don't.
const ARMORED_BEETLE_TERRAINS = new Set(['forest', 'desert', 'volcano']);

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
  if (!ARMORED_BEETLE_TERRAINS.has(getActiveMap().terrain)) return [];
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
// Electric Eel (direct request: "make electric eel behave like the
// snake") joined this family despite being a boss, not a regular roster
// entry — nothing about the mechanism cares whether an enemyKey belongs
// to a regular type or a boss, it's keyed the same way either way (see
// generateWave()'s boss enemyKey format), and a genuinely serpentine
// swimmer is an even better fit for "curls around corners instead of
// snapping to one rigid rotation" than the snakes it's borrowing the
// mechanic from.
const MILLIPEDE_FAMILY_KEYS = new Set(['gardenerSnake', 'bananaSnake', 'armoredSnake', 'anaconda', 'marsh-boss-tier-3']);

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

  // Armored beetles (only on terrains in ARMORED_BEETLE_TERRAINS — see
  // that constant's own comment) unlock on their own explicit rounds, not
  // this function's every-5-rounds cadence; getUnlockedArmoredBeetleKeys()
  // itself already returns [] on every other terrain, so nothing further
  // needs to check that here.
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
// goes, the gap only widens in the player's favor. The fix was to make
// enemy health compound too: a fixed 3.5% COMPOUNDING increase every
// single round, i.e. healthMultiplier = 1.035^(round-1).
//
// Second balance pass (direct request, broader than the first): "the
// game doesn't get hard SOON enough" — the 3.5% curve above, while a
// real fix for the late-game plateau, still left round 1 at exactly 1x
// and only reached 2.28x by round 25, which read as a long, easy ramp-up
// before anything resembling real pressure showed up. Two changes:
//   1. A flat BASE_HEALTH_MULTIPLIER (1.5x) applied at every round,
//      including round 1 — so the very first enemies a player ever faces
//      are already tougher, not just "the curve eventually gets there."
//   2. The per-round compound rate itself raised from 3.5% to 4.5%
//      (HEALTH_GROWTH_PER_ROUND) — a real ~29% faster per-round ramp, not
//      just a bigger constant multiplied on top of the old rate.
// Together: round 1 is 1.5x tougher than the original pre-either-pass
// baseline (was 1.0x); round 25 is 1.5 * 1.045^24 ≈ 4.42x (was 2.28x,
// ~1.9x harder); round 50 ≈ 12.97x (was 5.49x, ~2.4x harder); round 100 ≈
// 117.0x (was 29.0x, ~4.0x harder). The ratio climbs smoothly from ~2x to
// ~4x harder-than-before rather than jumping unevenly, so early rounds
// feel the "reach real challenge sooner" push most directly while late
// rounds still end up substantially harder too, not just proportionally
// equal. (Sanity-checked against the starting economy: a single base
// Sunflower, $50, can still kill a round-1 base-tier enemy in ~1 second
// under the new numbers — the early game got harder, not unfair.)
//
// Per-map difficulty tiers (direct request, this same pass): Deep Forest
// = Easy, Marshland/Savanah = Medium, Whirlpool = Hard — a flat
// multiplier per TERRAIN (MAP_DIFFICULTY_MULTIPLIER below, keyed the same
// way TERRAIN_THEMES/MAP_ROSTERS already are) folded into this exact same
// function, "the same lever, not hand-tuned per enemy" the request itself
// suggested — every regular enemy, boss, and armored beetle on a given
// map gets hit by its own map's multiplier uniformly, with zero changes
// needed in generateWave() below (it already reads everything through
// this one function). Picked from the request's own suggested ranges:
// Easy stays at 1x (a true baseline, nothing extra), Medium 1.3x, Hard
// 1.8x — enough that the SAME round on Whirlpool is unmistakably harder
// than Deep Forest (a straight 1.8x/1.0x = 1.8x health/bounty gap at any
// equivalent round), without Hard being so extreme it reads as a
// different game rather than a harder version of the same one.
//
// bounty (generateWave() below) scales by this exact same multiplier, on
// both regular enemies and bosses, so a kill's reward keeps pace with how
// much tankier that enemy actually is at this round AND on this map,
// rather than staying flat while the enemy itself keeps getting harder to
// kill. The one acknowledged side effect: the INDIVIDUAL per-type
// health re-tune this same pass also applied directly to every regular
// roster entry's own stored health (see each roster's own comment) was
// NOT mirrored onto bounty — a re-tuned enemy is tankier per dollar
// earned than before, a deliberate (if modest) economic tightening in
// the same "make it harder" spirit, not an oversight. Bosses' and the
// shared armored beetles' own stored health were deliberately left
// untouched by that individual re-tune (they still get hit by both
// multipliers below, same as always) — see FOREST_ROSTER's own comment
// for why.
const HEALTH_GROWTH_PER_ROUND = 1.045;
const BASE_HEALTH_MULTIPLIER = 1.5;

const MAP_DIFFICULTY_MULTIPLIER = {
  forest: 1, // Easy
  marsh: 1.3, // Medium
  desert: 1.3, // Medium
  ocean: 1.8, // Hard
  // Tundra (direct request): explicitly Hard-tier too, matched to
  // Whirlpool's own 1.8x exactly rather than going above it — the
  // roster's own numbers (see TUNDRA_ROSTER's own comment, revised after
  // a "this is impossible" report) are now tuned BELOW Whirlpool's
  // equivalents specifically because Tundra's shorter paths already give
  // towers less exposure time per enemy than Whirlpool's long spiral
  // does; this one multiplier is what keeps it at "Hard" without
  // double-counting that gap on top.
  tundra: 1.8, // Hard
  // Volcanic (direct request): also explicitly Hard-tier, matched to the
  // same 1.8x every other Hard map uses rather than inventing a new tier
  // — VOLCANIC_ROSTER's own numbers (above) are what carries this map's
  // relative brutality, same "roster's own numbers are the one place a
  // future Hard map's relative brutality actually lives" convention
  // this constant's own comment on tundra already established.
  volcano: 1.8, // Hard
  // Caves (direct request, relayed from the peer session): Medium, not
  // Hard — see CAVES_ROSTER's own comment for the judgment call (nothing
  // in the request named a tier explicitly; a cave of bats/birds/blind
  // salamanders reads as atmospheric rather than brutal, so it's
  // calibrated alongside Marshland/Savanah, not Whirlpool/Tundra/
  // Volcanic).
  caves: 1.3, // Medium
  // Deep Sea (direct request): Hard — matched to the same 1.8x every
  // other Hard map uses (Whirlpool/Tundra/Volcanic), same reasoning as
  // those: DEEP_SEA_ROSTER's own numbers (above) carry this map's
  // relative brutality, not a bespoke multiplier.
  deepSea: 1.8, // Hard
  // The Hollow Event ("Adventures"): Easy, matching Deep Forest's own
  // baseline exactly — this is a single, bite-sized 50-round event stage
  // (not an endless map a player grinds for hours), and reaching its own
  // round-50 climax is already the real challenge this pass is tuned
  // around (see HOLLOW_ROSTER's own top comment on The Hollow Crow's
  // deliberately boosted stats) — stacking a second systemic difficulty
  // multiplier on top would risk making the whole run feel punishing
  // rather than a fun, approachable event.
  hollow: 1, // Easy
};

function getRoundScaling(round) {
  const mapMultiplier = MAP_DIFFICULTY_MULTIPLIER[getActiveMap().terrain] ?? 1;
  return {
    healthMultiplier: BASE_HEALTH_MULTIPLIER * HEALTH_GROWTH_PER_ROUND ** (round - 1) * mapMultiplier,
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
        // Defaults to 0 for every existing boss (none set their own
        // armorThreshold) — added so a boss CAN carry the armor-gate trait
        // through from its own bossTypes entry, needed for Savanah's
        // Emperor Scorpion retrofit (see SAVANAH_ROSTER's own comment):
        // moving a regular enemy into a boss slot shouldn't silently strip
        // a trait it was specifically designed around.
        armorThreshold: boss.armorThreshold || 0,
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
    const theme = ARMORED_BEETLE_THEME_BY_TERRAIN[getActiveMap().terrain]?.[key];
    return {
      enemyKey: key,
      name: theme ? theme.name : tier.name,
      color: theme ? theme.color : tier.color,
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

// Deep Sea lanternfish event (direct follow-up request, relayed from the
// peer session): "if there are more than 10 enemies currently on the
// board when it triggers, it eats one of them (removes it from play)
// during that window." Removes the enemy directly from activeEnemies —
// deliberately NOT via damageEnemy/setting health to 0, which would route
// it through updateEnemies()'s own "killed" sweep and award its bounty;
// the peer's own stated default is "no bounty/kill credit for the eaten
// enemy," so a plain removal is the correct mechanism, not a shortcut.
// Bosses are excluded from eligibility (this assistant's own call, per
// the request's own explicit guidance: "must NOT allow eating boss-tier
// enemies in a way that could trivialize a boss fight") — picked
// uniformly at random (the game's own seeded random(), same reproducible-
// under-?seed= convention every other roll in this file already follows)
// among whatever's left. Returns the eaten enemy (or null if nothing was
// eligible — e.g. every current enemy happens to be a boss) so game.js
// can use it for logging/floating-text if it ever wants to, though the
// request's own "purely atmospheric... doesn't eat anything" framing
// doesn't currently ask for that.
function eatRandomEligibleEnemy() {
  const eligible = activeEnemies.filter((enemy) => !enemy.isBoss);
  if (eligible.length === 0) return null;
  const chosen = eligible[Math.floor(random() * eligible.length)];
  activeEnemies = activeEnemies.filter((enemy) => enemy !== chosen);
  return chosen;
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
  // Scorpions: pincers forward (-x), same convention as every other
  // Savanah type above. Emperor Scorpion moved to bossTypes (see
  // BOSS_FACING_OFFSET) and is no longer a regular-enemy key.
  stripedScorpion: Math.PI,
  duneScorpion: Math.PI,
  redScorpion: Math.PI,
  // Marshland fish: head/front toward -x, same convention as the fish
  // above and every other type in this table.
  piranha: Math.PI,
  arowana: Math.PI,
  redtailCatfish: Math.PI,
  // Tundra: whichever of these has a real eye/tail/head feature draws it
  // on the -x side, same convention as everything above. Arctic Moth,
  // Arctic Ringlet, and the Woolly Bear Moth boss (see BOSS_FACING_OFFSET)
  // are all roughly radially symmetric (no eye, stinger, or other one-
  // sided feature), so they're left out entirely, same as Starfish/Urchin
  // above.
  arcticBumblebee: Math.PI,
  deerFly: Math.PI,
  snowScorpionFly: Math.PI,
  arcticBluet: Math.PI,
  polarBumblebee: Math.PI,
  snowGroundBeetle: Math.PI,
  wolfSpider: Math.PI,
  // Caves (direct request, relayed from the peer session): every one-
  // sided shape draws head/front/antennae toward -x, same convention as
  // everything above. Moth and Fungus Gnats are left out entirely, same
  // "radially-ish symmetric, reads fine at any rotation" reasoning Arctic
  // Moth's own entry above already established.
  bat: Math.PI,
  oilbird: Math.PI,
  swiftlet: Math.PI,
  whiteCollaredSwift: Math.PI,
  caveSwallow: Math.PI,
  olm: Math.PI,
  texasBlindSalamander: Math.PI,
  caveShrimp: Math.PI,
  // The Hollow Event ("Adventures," direct request relayed from the peer
  // session): every one-sided shape here draws its own head/front/leaf-
  // tip toward -x too, same convention as everything above.
  oakleafButterfly: Math.PI,
  deadleafMantis: Math.PI,
  bufftipMoth: Math.PI,
  orbWeaver: Math.PI,
  easternRedBat: Math.PI,
  redEasternScreechOwl: Math.PI,
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
  // marsh-boss-tier-3 (Electric Eel) has no entry here — the millipede-
  // body family computes each segment's own heading straight from the
  // trail, same as every snake (none of which have an entry here either).
  'desert-boss-tier-3': Math.PI, // Emperor Scorpion (retrofit) — reuses drawEmperorScorpion, same pincers-forward convention
  'tundra-boss-tier-1': 0, // Arctic Fritillary — radially symmetric wing markings, no one-sided feature
  'tundra-boss-tier-2': 0, // Arctic Woolly Bear Moth — radially symmetric banding, no one-sided feature
  'tundra-boss-tier-3': Math.PI, // Giant Arctic Wolf Spider — same spider-body convention as the regular Wolf Spider
  'caves-boss-tier-1': 0, // Cave Midge — radially-ish symmetric wings/body, no one-sided feature, same reasoning as the Arctic Fritillary/Woolly Bear Moth bosses above
  'caves-boss-tier-2': Math.PI, // Blind Cavefish — same fish-body convention as every other fish in this game, even with no eye drawn
  // The Hollow Event ("Adventures," direct request relayed from the peer
  // session): both bosses have a clear one-sided head/eye feature, same
  // -x-forward convention as every other type above.
  'hollow-boss-tier-1': Math.PI, // Mournful Sphinx — same moth-body convention as Buff-tip Moth
  'hollow-boss-tier-2': Math.PI, // The Hollow Crow — same bird-body convention as the regular Red Eastern Screech Owl
};

function getInitialPathHeading(path) {
  const dx = path[1].x - path[0].x;
  const dy = path[1].y - path[0].y;
  return Math.atan2(dy, dx);
}

// Open-field rework: the one read-site change that lets every existing
// waypoint-follow/zombie-backward-walk/leak-detection call below keep
// working completely unchanged for BOTH kinds of map. An open-field
// enemy (createEnemyInstance below) carries its own route — built once at
// spawn by buildOpenFieldRoute() (map.js), already routed around that
// map's obstacles — instead of sharing one of MAP_PATHS' hand-authored
// waypoint arrays; this is the one place that decides which of the two
// an enemy actually walks. Every other function in this file (the
// forward-movement loop, updateZombieMovement, the leak/removal filters)
// calls this instead of reading MAP_PATHS[enemy.pathIndex] directly.
function getEnemyPath(enemy) {
  return enemy.path || MAP_PATHS[enemy.pathIndex || 0];
}

// Shared by spawnWave() and spawnSingleEnemy() (Sandbox mode) so the two
// spawning paths can't drift apart on the enemy object's own shape —
// that's bitten this file before (immobilizedRemaining was added in one
// place and had to be remembered everywhere else enemies get created).
function createEnemyInstance(entry, spawnDelay) {
  // Open-field rework: an open-field map has no shared MAP_PATHS to pick
  // from at all — instead, this enemy gets its own route, from a
  // randomly-rolled point along the map's spawn edge (same seeded
  // random() the multi-path roll below already uses, so it stays
  // reproducible under ?seed=) to the map's goal structure, threaded
  // around that map's obstacles by buildOpenFieldRoute() (map.js) once
  // here at spawn time. `path` stays null for every ordinary map — see
  // getEnemyPath()'s own comment for how that null falls back to the
  // pathIndex/MAP_PATHS system below unchanged.
  let path = null;
  let pathIndex = 0;
  if (MAP_OPEN_FIELD) {
    // Spawn-from-all-sides follow-up (Whirlpool, relayed from the peer
    // session): "Distribute each wave's spawns across all sides (random
    // or round-robin per enemy, your judgment) rather than adding extra
    // enemies — same total enemy count per round." Round-robin chosen
    // over random specifically so a short wave still visibly covers
    // every side rather than clustering by chance — spawnEdgeRoundRobin
    // is a simple, ever-incrementing module-level counter (not reset per
    // wave/round) shared by every open-field map; for every map besides
    // Whirlpool, MAP_SPAWN_EDGES is a 1-element array, so `% length` is
    // always 0 and behavior is identical to before this change.
    const edge = MAP_SPAWN_EDGES[spawnEdgeRoundRobin % MAP_SPAWN_EDGES.length];
    spawnEdgeRoundRobin += 1;
    const t = random();
    const spawnX = edge.x1 + (edge.x2 - edge.x1) * t;
    const spawnY = edge.y1 + (edge.y2 - edge.y1) * t;
    path = buildOpenFieldRoute(spawnX, spawnY, MAP_GOAL.x, MAP_GOAL.y, MAP_OBSTACLES, entry.radius);
  } else {
    // Multi-path maps (Savanah): each enemy independently rolls which of
    // the map's paths it spawns onto, via the game's own seeded random()
    // — the simplest rule that needed no extra shared state (an
    // alternating/evenly-split rule would need a counter threaded
    // through every spawn call site). For a single-path map this is
    // always 0, the only option, so Marshland enemies behave exactly as
    // before. The enemy keeps this path for its whole life — see
    // getEnemyPath() above, read by updateEnemies()/
    // updateZombieMovement() below instead of MAP_PATHS[pathIndex]
    // directly.
    pathIndex = Math.floor(random() * MAP_PATHS.length);
    path = MAP_PATHS[pathIndex];
  }
  const spawnPoint = path[0];
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
    // null for every ordinary map (see getEnemyPath()); an open-field
    // enemy's own spawn-to-goal route otherwise.
    path: MAP_OPEN_FIELD ? path : null,
    x: spawnPoint.x,
    y: spawnPoint.y,
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
    // Arctic Willow's Brittle Path (direct follow-up request): seconds
    // left fully stopped by its own on-hit freeze, same "a separate
    // field from immobilizedRemaining/infectedRemaining, own distinct
    // visual" reasoning as infectedRemaining's own comment just above —
    // movement is blocked while any of the 3 is above 0 (see
    // updateEnemies()). frozenTick (null unless actually frozen) carries
    // the fixed per-0.25s damage amount/timer/source-tower for the
    // freeze's own periodic damage — ticked in updateEnemies() too,
    // unconditionally (same as burn), independent of the movement block.
    frozenRemaining: 0,
    frozenTick: null,
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
    // Hop correction (direct follow-up request: frogs were sliding
    // forward continuously with a hop animation layered on top, instead
    // of actually pausing at ground level between hops). A stable
    // per-enemy phase offset, rolled once at spawn via the game's own
    // seeded random() (not derived from enemy.x/y, which change as it
    // moves — a position-derived seed would make the hop cycle itself
    // jitter every frame) — see getHopState() below for how this is
    // used. Harmless/unused on every non-hopping enemy.
    hopSeed: random() * HOP_PERIOD,
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

// Spawn-from-all-sides follow-up (Whirlpool) — see createEnemyInstance's
// own comment above for why round-robin, not random. Reset alongside
// activeEnemies at the top of every spawnWave() call (start of a run AND
// every subsequent round) so each round's own distribution starts from
// the same first edge rather than carrying an odd remainder in from
// whatever the previous round's enemy count happened to be.
let spawnEdgeRoundRobin = 0;

function spawnWave(composition) {
  activeEnemies = [];
  spawnEdgeRoundRobin = 0;
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
  // Only offered for Sandbox discovery on terrains that actually spawn
  // them in a real game — see ARMORED_BEETLE_TERRAINS' own comment.
  const armoredKeys = ARMORED_BEETLE_TERRAINS.has(terrain) ? ARMORED_BEETLE_TIERS.map((tier) => tier.key) : [];
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
      armorThreshold: boss.armorThreshold || 0,
    };
  }

  // Armored beetles (shared across every map, not part of any one
  // roster's own enemyTypes) are checked before falling through to the
  // active roster.
  const armoredTier = getArmoredBeetleTier(key);
  if (armoredTier) {
    const theme = ARMORED_BEETLE_THEME_BY_TERRAIN[getActiveMap().terrain]?.[key];
    return {
      enemyKey: key,
      name: theme ? theme.name : armoredTier.name,
      color: theme ? theme.color : armoredTier.color,
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
// `sourceTower` is optional and new (direct request: a per-tower lifetime
// damage-dealt counter) — every call site in game.js that has a tower handy
// passes itself, and this is the one place that actually credits it,
// keeping every other damageEnemy() call site below (and every other file)
// untouched. Deliberately credited AFTER the armor gate above: an attack
// armor fully blocks dealt zero real damage, so it shouldn't inflate the
// tower's counter. A couple of damage sources genuinely have no single
// owning tower to credit — a zombie's own death explosion (zombieExplosionDamage,
// below) isn't an attack by any currently-placed tower, it's the zombie
// itself going off — so those calls simply omit the argument rather than
// forcing a dubious attribution.
function damageEnemy(enemy, amount, sourceTower) {
  if (enemy.armorThreshold > 0 && amount < enemy.armorThreshold) return;
  const wasAlive = enemy.health > 0;
  enemy.health -= amount;
  if (sourceTower) {
    sourceTower.totalDamageDealt += amount;
    // killFlash (make-Prodigies-cooler follow-up, towers.js): a generic
    // "just landed a killing blow" visual pulse, same shape as attackFlash.
    // Guarded by wasAlive so it only fires once, right at the actual kill —
    // not on every later DoT tick against an already-dead enemy still
    // waiting on this frame's removal sweep.
    if (wasAlive && enemy.health <= 0) sourceTower.killFlash = KILL_FLASH_DURATION;
  }
}

// `sourceTower` (same new optional argument as damageEnemy above) is stashed
// on the burn state itself so the DoT ticks below — which fire on their own,
// long after the hit that started them, with no tower reference otherwise in
// scope — can still credit the tower that applied it.
function applyBurn(enemy, burn, sourceTower) {
  enemy.burn = { damagePerSecond: burn.damagePerSecond, remaining: burn.duration, sourceTower };
}

// Corpse Flower's Acidic Mixture Path (direct request): a genuinely new
// mechanic — a timed speed REDUCTION, distinct from the existing
// immobilizedRemaining/infectedRemaining (a full stop at 0 speed). Same
// plain-overwrite convention as applyBurn above (a fresh hit replaces
// whatever slow was already active rather than stacking or taking
// whichever is stronger) — simplest, and consistent with how burn
// already works. `multiplier` is the fraction of normal speed the enemy
// moves at while slowed (e.g. 0.8 for "slows them down 20%"), not the
// amount removed.
function applySlow(enemy, slow) {
  enemy.slow = { multiplier: slow.multiplier, remaining: slow.duration };
}

// Arctic Willow's Brittle Path (direct follow-up request, mutually
// exclusive with Frosted Path — the existing single-chosen-path lock
// already handles that): a FULL stop (unlike applySlow's own partial
// speed reduction), for a fixed duration, plus a fixed per-tick damage
// amount on its own 0.25s timer (the request's own wording: "X damage
// every 1/4 of a second the enemy is frozen") — ticked in
// updateEnemies() below, where enemy.frozenRemaining is also read
// alongside immobilizedRemaining/infectedRemaining to block movement.
// The request explicitly suggested reusing the existing stun/freeze
// machinery rather than building a parallel one — immobilizedRemaining/
// infectedRemaining already establish "any of several `xRemaining`
// fields blocks movement while > 0," so frozenRemaining is a 3rd field
// in that same shape (not a reuse of infectedRemaining itself, which
// stays Mushroom-specific — same reasoning infectedRemaining's own
// comment gives for not reusing immobilizedRemaining: each gets its own
// distinct visual in renderEnemies() without the two ever being
// conflated). Same plain-overwrite convention applyBurn/applySlow
// already use — a fresh freeze replaces whatever was ticking, never
// stacks or extends.
function applyFreeze(enemy, freeze, sourceTower) {
  enemy.frozenRemaining = freeze.duration;
  enemy.frozenTick = { damage: freeze.tickDamage, timer: 0.25, sourceTower };
}

function updateEnemies(deltaSeconds) {
  enemyMovementClock += deltaSeconds;
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
      damageEnemy(enemy, enemy.burn.damagePerSecond * deltaSeconds, enemy.burn.sourceTower);
      enemy.burn.remaining -= deltaSeconds;
      if (enemy.burn.remaining <= 0) enemy.burn = null;
    }

    // Corpse Flower's Acidic Mixture Path: a timed speed reduction, ticked
    // down the same way burn is above — a slowed enemy still moves (unlike
    // immobilizedRemaining/infectedRemaining below, a full stop), just at
    // a fraction of its own speed, applied to `remaining` further down.
    if (enemy.slow) {
      enemy.slow.remaining -= deltaSeconds;
      if (enemy.slow.remaining <= 0) enemy.slow = null;
    }

    // Arctic Willow's Brittle Path: ticks (and deals its own damage)
    // unconditionally, same "keeps running regardless of the movement-
    // blocking check below" shape burn/slow above already use — the
    // movement-blocking return further down is what actually stops this
    // enemy from walking while frozen; this block is only the damage
    // side of it.
    if (enemy.frozenTick) {
      enemy.frozenTick.timer -= deltaSeconds;
      if (enemy.frozenTick.timer <= 0) {
        damageEnemy(enemy, enemy.frozenTick.damage, enemy.frozenTick.sourceTower);
        enemy.frozenTick.timer += 0.25;
      }
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

    // Grabbed by a Tanglement root, stunned by Infect Path's spore
    // infection, and/or fully frozen by Arctic Willow's Brittle Path —
    // any one alone (or several at once) holds the enemy in place;
    // movement only, burn/freeze-tick damage above still tick normally.
    // All 3 timers count down regardless of which ones are actually
    // still active, so whichever ends first just quietly reaches 0
    // without affecting the others.
    if (enemy.immobilizedRemaining > 0 || enemy.infectedRemaining > 0 || enemy.frozenRemaining > 0) {
      enemy.immobilizedRemaining = Math.max(0, enemy.immobilizedRemaining - deltaSeconds);
      enemy.infectedRemaining = Math.max(0, enemy.infectedRemaining - deltaSeconds);
      enemy.frozenRemaining = Math.max(0, enemy.frozenRemaining - deltaSeconds);
      if (enemy.frozenRemaining <= 0) enemy.frozenTick = null;
      return;
    }

    // getEnemyPath() prefers this enemy's own open-field route
    // (enemy.path) when it has one; otherwise falls back to path 0 for
    // any enemy without its own pathIndex (a synthetic test fixture,
    // say) — harmless on every ordinary built-in map, and exactly
    // matches the old single-path behavior for Marshland.
    const path = getEnemyPath(enemy);
    const effectiveSpeed = enemy.slow ? enemy.speed * enemy.slow.multiplier : enemy.speed;
    let remaining = effectiveSpeed * deltaSeconds;
    // Hop correction (direct follow-up request): a frog-type enemy's
    // ACTUAL position only advances during the airborne portion of its
    // own hop cycle (getHopState(), above) — completely still the rest
    // of the time, a real pause at ground level rather than just a
    // visual bob layered on top of continuous movement. Boosted by
    // 1/HOP_AIRBORNE_FRACTION while airborne so its configured speed stat
    // still determines its average progress over a full cycle, same as
    // every other enemy, instead of quietly becoming slower just because
    // part of each cycle is motionless.
    if (HOPPING_ENEMY_KEYS.has(enemy.enemyKey)) {
      remaining = getHopState(enemy, enemyMovementClock).isAirborne ? remaining / HOP_AIRBORNE_FRACTION : 0;
    }
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
    (enemy) => !enemy.isZombie && enemy.health > 0 && enemy.waypointIndex >= getEnemyPath(enemy).length - 1
  );

  // Drop enemies that died or reached the final waypoint (the base/goal —
  // an open-field enemy's own route's last waypoint IS the goal
  // structure's position, see createEnemyInstance()) — or, for a zombie,
  // that it exploded (collided with a living enemy, or reached the
  // path's/route's start) this frame.
  activeEnemies = activeEnemies.filter((enemy) => {
    if (enemy.isZombie) return !enemy.markedForRemoval;
    return enemy.health > 0 && enemy.waypointIndex < getEnemyPath(enemy).length - 1;
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
  // Same getEnemyPath() preference as the forward-movement loop above —
  // an open-field zombie walks backward through its own spawn-to-goal
  // route (the exact one it walked forward through), reaching "the
  // start" (waypointIndex < 0, below) exactly when it's back at its own
  // spawn point, with zero other changes needed here.
  const path = getEnemyPath(enemy);
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

// Enemy-art realism pass (direct request): a real fire ant's single most
// recognizable trait is its two-tone body — a reddish-copper head/thorax
// with a noticeably DARKER gaster (abdomen) — not just "a reddish ant,"
// which is what the shared drawAntBody() alone produces (every part in
// one flat color). Re-filled here, after the shared body, in a near-black
// shade rather than inventing a second color field on the roster entry.
function drawFireAnt(ctx, e) {
  drawAntBody(ctx, e);

  ctx.fillStyle = shadeColor(e.color, -55);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.8, e.radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

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

// --- Marshland: fish -------------------------------------------------------
// Piranha/Arowana/Redtail Catfish (direct request): Marshland's first
// tier-3 roster, same fit Deep Forest's snakes and Savanah's scorpions
// found in their own empty orderTier3 slot. Electric Eel from the same
// request is drawn separately below, alongside the other bosses, since
// it's a boss rather than a regular roster entry (see MARSH_ROSTER's own
// bossTypes[3] comment).

// Small, round-bodied, sharp-toothed — the roster's fastest/lowest-health
// fish, reading as an aggressive swarm threat rather than a tank.
function drawPiranha(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.95, e.radius * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.7, e.y);
  ctx.lineTo(e.x + e.radius * 1.3, e.y - e.radius * 0.45);
  ctx.lineTo(e.x + e.radius * 1.3, e.y + e.radius * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 3; i += 1) {
    const tx = e.x - e.radius * 0.75 + i * e.radius * 0.2;
    ctx.beginPath();
    ctx.moveTo(tx, e.y - e.radius * 0.1);
    ctx.lineTo(tx + e.radius * 0.07, e.y + e.radius * 0.05);
    ctx.lineTo(tx + e.radius * 0.14, e.y - e.radius * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.8, e.y + e.radius * 0.1, e.radius * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

// A long, graceful body with one long dorsal fin running most of its
// length — the real fish's own signature feature, distinguishing it from
// Piranha's compact round body and Redtail Catfish's whiskered one.
function drawArowana(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 1.3, e.radius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(e.color, -20);
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.9, e.y);
  ctx.lineTo(e.x + e.radius * 1.7, e.y - e.radius * 0.4);
  ctx.lineTo(e.x + e.radius * 1.7, e.y + e.radius * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shadeColor(e.color, 25);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.9, e.y - e.radius * 0.35);
  ctx.quadraticCurveTo(e.x, e.y - e.radius * 0.65, e.x + e.radius * 0.9, e.y - e.radius * 0.3);
  ctx.lineTo(e.x + e.radius * 0.7, e.y - e.radius * 0.12);
  ctx.quadraticCurveTo(e.x, e.y - e.radius * 0.35, e.x - e.radius * 0.7, e.y - e.radius * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 1.1, e.y - e.radius * 0.05, e.radius * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

// A long, dark, whiskered bottom-dweller with a distinctive red-tipped
// tail — the roster's slowest/tankiest fish, visually a bulkier
// silhouette than the other two rather than a palette swap.
function drawRedtailCatfish(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 1.2, e.radius * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.9, e.y);
  ctx.lineTo(e.x + e.radius * 1.6, e.y - e.radius * 0.5);
  ctx.lineTo(e.x + e.radius * 1.6, e.y + e.radius * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, -20);
  ctx.lineWidth = Math.max(1, e.radius * 0.08);
  [-0.2, 0.2].forEach((dy) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 1.1, e.y + dy * e.radius * 0.5);
    ctx.quadraticCurveTo(
      e.x - e.radius * 1.6,
      e.y + dy * e.radius * 1.1,
      e.x - e.radius * 2.0,
      e.y + dy * e.radius * 1.3
    );
    ctx.stroke();
  });
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.95, e.y - e.radius * 0.1, e.radius * 0.07, 0, Math.PI * 2);
  ctx.fill();
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

// Enemy-art realism pass (direct request): this used to be the one
// exception to Fire Ant/Armored Ant's own precedent — THEY each add a
// real distinguishing feature on top of the shared ant body (mandibles,
// an armor plate), this one added nothing but a color swap. Real desert
// ants (e.g. the Saharan silver ant, genus Cataglyphis) have a famous
// adaptation for this exact environment: a silvery, reflective sheen on
// the abdomen that helps them survive scorching surface temperatures —
// drawn here as a pale metallic highlight — alongside visibly longer legs
// than the plain Ant, matching this roster's own fastest tier-1 enemy
// (Cataglyphis is also the fastest-running ant genus known, for the same
// real heat-survival reason).
function drawDesertAnt(ctx, e) {
  drawAntBody(ctx, e);

  ctx.strokeStyle = shadeColor(e.color, 10);
  ctx.lineWidth = 1.2;
  [-1, 1].forEach((i) => {
    const kneeY = e.y + i * e.radius * 0.65;
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 1.1, e.y + i * e.radius * 0.55);
    ctx.lineTo(e.x - e.radius * 1.7, kneeY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.x + e.radius * 1.1, e.y + i * e.radius * 0.55);
    ctx.lineTo(e.x + e.radius * 1.7, kneeY);
    ctx.stroke();
  });

  ctx.fillStyle = 'rgba(230, 225, 210, 0.55)';
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.1, e.y - e.radius * 0.15, e.radius * 0.45, e.radius * 0.2, -0.2, 0, Math.PI * 2);
  ctx.fill();
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

// --- Per-terrain armored reskins (REMOVED) ---------------------------------
// This section used to hold drawArmoredShellBody/drawArmoredHermitCrab/
// drawSpinyLobster/drawGiantIsopod and an ARMORED_BEETLE_DRAW_FUNCTIONS_BY_
// TERRAIN dispatch table — alternate crab/turtle/isopod art swapped in for
// the armored beetle line on Whirlpool/Marshland/Tundra. Deleted (direct
// request, relayed from the peer session) along with the forcing function
// itself on those three terrains — see ARMORED_BEETLE_TERRAINS' own comment
// further up for the full rationale. drawEnemyShape() below no longer has
// any terrain-override branch at all: every remaining terrain that still
// spawns these (Deep Forest/Savanah/Volcanic) always uses the literal
// beetle art in ENEMY_DRAW_FUNCTIONS, same as before any of this existed.

// --- Savanah: scorpions ---------------------------------------------------

// Shared body plan for all 4 scorpions below — a segmented tail curling up
// and back over the body to a stinger, an oval body, two front pincers,
// and three pairs of legs. `banded` draws Striped Scorpion's dark bands
// across the body; `pincerScale` lets Emperor Scorpion's own pincers read
// as visibly larger/more imposing than the other three's, rather than
// every scorpion sharing identical-sized claws.
function drawScorpionBody(ctx, e, { banded = false, pincerScale = 1 } = {}) {
  ctx.strokeStyle = shadeColor(e.color, -10);
  ctx.lineWidth = Math.max(2, e.radius * 0.25);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.3, e.y);
  ctx.quadraticCurveTo(e.x + e.radius * 1.1, e.y - e.radius * 0.2, e.x + e.radius * 1.2, e.y - e.radius * 0.9);
  ctx.quadraticCurveTo(e.x + e.radius * 1.25, e.y - e.radius * 1.3, e.x + e.radius * 0.9, e.y - e.radius * 1.35);
  ctx.stroke();

  ctx.fillStyle = shadeColor(e.color, -25);
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.9, e.y - e.radius * 1.35);
  ctx.lineTo(e.x + e.radius * 0.75, e.y - e.radius * 1.55);
  ctx.lineTo(e.x + e.radius * 1.05, e.y - e.radius * 1.45);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.75, e.radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  if (banded) {
    ctx.strokeStyle = shadeColor(e.color, -35);
    ctx.lineWidth = 1.3;
    [-0.3, 0, 0.3].forEach((dx) => {
      ctx.beginPath();
      ctx.moveTo(e.x + dx * e.radius, e.y - e.radius * 0.5);
      ctx.lineTo(e.x + dx * e.radius, e.y + e.radius * 0.5);
      ctx.stroke();
    });
  }

  ctx.fillStyle = shadeColor(e.color, 10);
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.ellipse(
      e.x - e.radius * 0.9 * pincerScale,
      e.y + side * e.radius * 0.35,
      e.radius * 0.35 * pincerScale,
      e.radius * 0.22 * pincerScale,
      side * 0.3,
      0,
      Math.PI * 2
    );
    ctx.fill();
  });

  ctx.strokeStyle = shadeColor(e.color, -20);
  ctx.lineWidth = 1;
  [-1, 1].forEach((side) => {
    [0, 1, 2].forEach((i) => {
      ctx.beginPath();
      ctx.moveTo(e.x - e.radius * 0.3 + i * e.radius * 0.25, e.y + side * e.radius * 0.3);
      ctx.lineTo(e.x - e.radius * 0.3 + i * e.radius * 0.25 + side * e.radius * 0.15, e.y + side * e.radius * 0.6);
      ctx.stroke();
    });
  });
}

function drawStripedScorpion(ctx, e) {
  drawScorpionBody(ctx, e, { banded: true });
}

// Sandy camouflage tone (its own color, set on the roster entry) plus a
// few darker mottled specks on the body — reads as "blending into the
// dunes" rather than a flat color swap.
function drawDuneScorpion(ctx, e) {
  drawScorpionBody(ctx, e);
  ctx.fillStyle = shadeColor(e.color, -18);
  [[-0.2, -0.1], [0.15, 0.15], [-0.3, 0.2]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y + dy * e.radius, e.radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Enemy-art realism pass (direct request): unlike its two tier-3
// siblings (Striped Scorpion's banding, Dune Scorpion's mottled
// camouflage specks), this one used to call the shared body with zero
// options at all — a flat color swap and nothing else. Many real
// reddish-brown scorpion species (e.g. Hadrurus/Vaejovis) have a notably
// smoother, glossier cuticle than banded/mottled desert species — drawn
// here as a glossy highlight stripe down the back — plus slightly bigger
// pincers than its own tier-3 siblings, reading as the toughest of the 3
// regular scorpions (same "bigger claws = tougher" language Emperor
// Scorpion's own, even-larger pincers already use one tier up).
function drawRedScorpion(ctx, e) {
  drawScorpionBody(ctx, e, { pincerScale: 1.15 });
  ctx.fillStyle = shadeColor(e.color, 35);
  ctx.beginPath();
  ctx.ellipse(e.x - e.radius * 0.1, e.y - e.radius * 0.15, e.radius * 0.4, e.radius * 0.15, -0.15, 0, Math.PI * 2);
  ctx.fill();
}

// Larger, darker, with visibly bigger pincers than the other three — the
// roster's own strongest and most imposing scorpion.
function drawEmperorScorpion(ctx, e) {
  drawScorpionBody(ctx, e, { pincerScale: 1.4 });
}

// --- Tundra: arctic insects/arachnids -------------------------------------

// Shared wing shape for every flying insect below (bees/moths/ringlet/
// bluet/fritillary) — a pair of pale, semi-translucent teardrop shapes
// behind the body, rotated outward. `spread` widens the angle between
// them (bees fold close, moths/the fritillary spread wide); `elongated`
// stretches them lengthwise instead of broad (a damselfly's own long,
// narrow wings, held close together rather than bee/moth's wide fold).
function drawInsectWings(ctx, e, { spread = 0.5, elongated = false, tint = 'rgba(255, 255, 255, 0.55)' } = {}) {
  ctx.fillStyle = tint;
  [-1, 1].forEach((side) => {
    ctx.save();
    ctx.translate(e.x - e.radius * 0.1, e.y);
    ctx.rotate(side * spread);
    ctx.beginPath();
    ctx.ellipse(
      0,
      -e.radius * 0.1,
      e.radius * (elongated ? 1.1 : 0.75),
      e.radius * (elongated ? 0.3 : 0.45),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  });
}

// Fuzzy, round-bodied, with pale frost-white bands standing in for a
// regular bee's usual yellow — "snow-dusted coloring," the one trait the
// spec called out by name for this one.
function drawArcticBumblebee(ctx, e) {
  drawInsectWings(ctx, e, { spread: 0.35 });
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.9, e.radius * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5f5f0';
  [-0.3, 0.05, 0.4].forEach((dx) => {
    ctx.beginPath();
    ctx.ellipse(e.x + dx * e.radius, e.y, e.radius * 0.14, e.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.85, e.y, e.radius * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

// Smaller and duller than every other flier here, with oversized reddish
// eyes (real deer flies' own distinctive feature) — the roster's own
// weakest, least distinctive-looking entry, by design.
function drawDeerFly(ctx, e) {
  drawInsectWings(ctx, e, { spread: 0.25, tint: 'rgba(200, 200, 200, 0.4)' });
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.65, e.radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a1a1a';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.5, e.y, e.radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

// Pale wing patterns (a scatter of darker spots against a light wing) —
// the spec's own called-out trait for this one.
function drawArcticMoth(ctx, e) {
  drawInsectWings(ctx, e, { spread: 0.75, tint: 'rgba(216, 221, 226, 0.75)' });
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.5, e.radius * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(e.color, -30);
  [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y + dy * e.radius, e.radius * 0.12, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Boss: distinct black-dot wing markings over its own orange (color)
// wings — "distinct wing markings," the spec's own called-out trait.
function drawArcticFritillary(ctx, e) {
  drawInsectWings(ctx, e, { spread: 0.9, tint: e.color });
  ctx.fillStyle = '#1a1410';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.22, e.radius * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  [-1, 1].forEach((side) => {
    [0.3, 0.6, 0.9].forEach((t) => {
      ctx.beginPath();
      ctx.arc(e.x + side * e.radius * t * 0.9, e.y - e.radius * 0.1, e.radius * 0.09, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

// Small, with round wings each carrying a simple ring-shaped eyespot —
// "small/round-winged," the spec's own called-out trait.
function drawArcticRinglet(ctx, e) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.arc(e.x + side * e.radius * 0.55, e.y, e.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.35, e.radius * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, 30);
  ctx.lineWidth = 1;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.arc(e.x + side * e.radius * 0.55, e.y, e.radius * 0.22, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// Its signature curled tail (a scorpion-like stinger-shaped abdomen tip,
// the real insect's own namesake feature) — unrelated to the Armored
// Beetle/Emperor Scorpion armor mechanic, purely visual here.
function drawSnowScorpionFly(ctx, e) {
  drawInsectWings(ctx, e, { spread: 0.3, tint: 'rgba(230, 230, 230, 0.5)' });
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.7, e.radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = Math.max(1.3, e.radius * 0.15);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.6, e.y);
  ctx.quadraticCurveTo(e.x + e.radius * 1.15, e.y - e.radius * 0.15, e.x + e.radius * 1.0, e.y - e.radius * 0.55);
  ctx.stroke();
}

// A damselfly-like look: a thin, elongated body (a stroked line, not a
// filled oval) with long narrow wings held close together, not spread —
// "damselfly-like," the spec's own called-out trait.
function drawArcticBluet(ctx, e) {
  drawInsectWings(ctx, e, { spread: 0.12, elongated: true, tint: 'rgba(230, 240, 250, 0.6)' });
  ctx.strokeStyle = e.color;
  ctx.lineWidth = Math.max(2, e.radius * 0.3);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.1, e.y);
  ctx.lineTo(e.x + e.radius * 1.1, e.y);
  ctx.stroke();
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 1.1, e.y, e.radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

// Boss: fuzzy, caterpillar-banded body (dark/light/dark bands plus a
// scatter of short bristle-dashes for texture) — "fuzzy/caterpillar-
// patterned," the spec's own called-out trait for this one.
function drawArcticWoollyBearMoth(ctx, e) {
  drawInsectWings(ctx, e, { spread: 0.8, tint: 'rgba(74, 56, 38, 0.4)' });
  ['#2b2018', '#6b4a2e', '#2b2018'].forEach((band, i) => {
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y - e.radius * 0.5 + i * e.radius * 0.5, e.radius * 0.55, e.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.strokeStyle = shadeColor(e.color, 20);
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(angle) * e.radius * 0.5, e.y + Math.sin(angle) * e.radius * 0.5);
    ctx.lineTo(e.x + Math.cos(angle) * e.radius * 0.75, e.y + Math.sin(angle) * e.radius * 0.75);
    ctx.stroke();
  }
}

// Shares Arctic Bumblebee's exact body plan — "bigger/tougher bee" reads
// entirely through this roster's own bigger radius/health, same as every
// other "same silhouette, different scale" pair elsewhere in this file —
// plus one added frost-glow outline so it doesn't read as a plain
// palette-swap at a glance.
function drawPolarBumblebee(ctx, e) {
  drawArcticBumblebee(ctx, e);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 1.05, e.radius * 0.78, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// Dark and visibly plated — reuses the shared beetle body plan
// (drawBeetleBody) plus the Armored Beetle line's own plate pattern
// (drawBeetlePlates) purely for the "armored-looking" visual the spec
// calls for; unlike the real Armored Beetle line this has no
// armorThreshold of its own, a deliberate look-not-mechanic choice (the
// request only asked for a dark, armored LOOK, not a second gated-armor
// forcing function on a third map).
function drawSnowGroundBeetle(ctx, e) {
  drawBeetleBody(ctx, e);
  drawBeetlePlates(ctx, e, 3, false);
}

// Shared 8-legged body for both wolf spiders below — four leg-pairs
// radiating diagonally from the body, an oval abdomen plus a smaller
// round head/cephalothorax. `hairy` adds short bristle-dashes around the
// abdomen's own edge for the Giant version's own "hairier" billing.
function drawSpiderBody(ctx, e, { hairy = false } = {}) {
  ctx.strokeStyle = shadeColor(e.color, -20);
  ctx.lineWidth = Math.max(1.2, e.radius * 0.12);
  ctx.lineCap = 'round';
  [-0.9, -0.5, 0.5, 0.9].forEach((t) => {
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + side * e.radius * 1.2, e.y + t * e.radius * 0.9);
      ctx.stroke();
    });
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.1, e.y, e.radius * 0.55, e.radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.4, e.y, e.radius * 0.32, 0, Math.PI * 2);
  ctx.fill();

  if (hairy) {
    ctx.strokeStyle = shadeColor(e.color, 30);
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const bx = e.x + e.radius * 0.1 + Math.cos(angle) * e.radius * 0.5;
      const by = e.y + Math.sin(angle) * e.radius * 0.36;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(angle) * e.radius * 0.15, by + Math.sin(angle) * e.radius * 0.15);
      ctx.stroke();
    }
  }
}

// Larger/hairier/more menacing than the regular Wolf Spider below — same
// shared body plan, just `hairy: true` plus a pair of small red eyes
// (menace, the one feature a plain scale-up alone wouldn't convey).
function drawGiantArcticWolfSpider(ctx, e) {
  drawSpiderBody(ctx, e, { hairy: true });
  ctx.fillStyle = '#c0392b';
  [-0.15, 0.15].forEach((dy) => {
    ctx.beginPath();
    ctx.arc(e.x - e.radius * 0.6, e.y + dy * e.radius * 0.3, e.radius * 0.08, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawWolfSpider(ctx, e) {
  drawSpiderBody(ctx, e, { hairy: true });
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.6, e.y, e.radius * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

// --- Volcanic's own roster art -------------------------------------------

// Big folded hind "jump" legs (same silhouette-first-then-body ordering
// Giant Lubber Grasshopper's own legs use) plus a pair of long thread-like
// antennae — real crickets' own signature trait a beetle's stubbier,
// antennae-less look doesn't have.
function drawLavaCricket(ctx, e) {
  ctx.strokeStyle = shadeColor(e.color, 35);
  ctx.lineWidth = Math.max(1.2, e.radius * 0.16);
  ctx.lineCap = 'round';
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(e.x, e.y + side * e.radius * 0.25);
    ctx.lineTo(e.x - e.radius * 0.5, e.y + side * e.radius * 0.5);
    ctx.lineTo(e.x - e.radius * 1.2, e.y + side * e.radius * 1.0);
    ctx.stroke();
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.7, e.radius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 0.65, e.y, e.radius * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shadeColor(e.color, 50);
  ctx.lineWidth = 1;
  [-0.15, 0.15].forEach((dy) => {
    ctx.beginPath();
    ctx.moveTo(e.x + e.radius * 0.9, e.y + dy * e.radius * 0.5);
    ctx.lineTo(e.x + e.radius * 1.6, e.y + dy * e.radius * 1.6);
    ctx.stroke();
  });
}

// drawBeetleBody's own base shell plus a dusting of lighter ash-grey
// speckles scattered across it — the "dusted with volcanic ash" look the
// name itself calls for, the same "shared base body + a few extra
// species-specific marks" pattern Tiger Beetle's own racing-stripe
// treatment of that same base body uses.
function drawVolcanicAshBeetle(ctx, e) {
  drawBeetleBody(ctx, e);
  ctx.fillStyle = 'rgba(200, 195, 188, 0.75)';
  [[-0.3, -0.3], [0.1, -0.15], [-0.1, 0.25], [0.35, 0.1], [-0.4, 0.05]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y + dy * e.radius, e.radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Tiny and wingless (the real insect's own signature trait — it never
// flies, unlike every other bug on this tier) — just a small rounded body
// and a few short legs, no head bump or wings at all: the roster's own
// smallest and plainest-looking entry by design, same "weakest reads as
// the least distinctive" convention Deer Fly's own comment calls out.
function drawWekiuBug(ctx, e) {
  ctx.strokeStyle = shadeColor(e.color, 40);
  ctx.lineWidth = Math.max(1, e.radius * 0.14);
  ctx.lineCap = 'round';
  [-0.4, 0, 0.4].forEach((t) => {
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(e.x + t * e.radius, e.y);
      ctx.lineTo(e.x + t * e.radius, e.y + side * e.radius * 0.6);
      ctx.stroke();
    });
  });
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.55, e.radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Boss (round 25): drawBeetleBody's own base shell, 3 ridged plate
// segments (the same ridged-plate detail Titan Beetle's own tier uses for
// "boss-tier, not just another regular beetle"), plus a pair of forward
// mandibles — real ground beetles' own hunting trait, and the one visual
// cue that reads as "boss" rather than just "bigger Volcanic Ash Beetle."
function drawHaleakalaMecyclothoraxBeetle(ctx, e) {
  drawBeetleBody(ctx, e);
  drawBeetlePlates(ctx, e, 3, true);

  ctx.strokeStyle = shadeColor(e.color, -40);
  ctx.lineWidth = Math.max(1.5, e.radius * 0.14);
  ctx.lineCap = 'round';
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 1.2, e.y + side * e.radius * 0.1);
    ctx.quadraticCurveTo(
      e.x - e.radius * 1.55, e.y + side * e.radius * 0.3,
      e.x - e.radius * 1.7, e.y + side * e.radius * 0.05
    );
    ctx.stroke();
  });
}

// Shared "land lizard in side profile" body for Volcanic's whole iguana
// family (landIguana/pinkIguana/lavaIguana/the Marine Iguana boss) — a
// long low torso, a tapering tail, 3 pairs of short bent legs, and a
// blunt head with one visible eye, the same "one shared body, color/
// trait options vary the species" convention drawSpiderBody/
// drawScorpionBody use for their own families. `crested` draws a row of
// small dorsal spikes down the back (Lava Iguana's own rough ridge,
// Marine Iguana's real spiky dorsal crest); `snoutColor` tints just the
// snout tip (Marine Iguana's real white salt-crusted nose — it excretes
// excess salt through its nose, the one trait that visibly sets it apart
// from the other 3 at a glance).
function drawIguanaBody(ctx, e, { crested = false, snoutColor = null, banded = false } = {}) {
  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = Math.max(1.5, e.radius * 0.16);
  ctx.lineCap = 'round';
  [-0.55, -0.15, 0.25].forEach((t) => {
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(e.x + t * e.radius, e.y + side * e.radius * 0.35);
      ctx.lineTo(e.x + t * e.radius - e.radius * 0.1, e.y + side * e.radius * 0.85);
      ctx.stroke();
    });
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.7, e.y - e.radius * 0.18);
  ctx.quadraticCurveTo(e.x - e.radius * 1.6, e.y, e.x - e.radius * 0.7, e.y + e.radius * 0.18);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.15, e.y, e.radius * 0.85, e.radius * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 1.0, e.y, e.radius * 0.35, e.radius * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();

  if (banded) {
    ctx.fillStyle = shadeColor(e.color, -35);
    [-0.5, -0.1, 0.35].forEach((t) => {
      ctx.beginPath();
      ctx.ellipse(e.x + t * e.radius, e.y, e.radius * 0.12, e.radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  if (snoutColor) {
    ctx.fillStyle = snoutColor;
    ctx.beginPath();
    ctx.ellipse(e.x + e.radius * 1.25, e.y, e.radius * 0.14, e.radius * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 1.05, e.y - e.radius * 0.1, e.radius * 0.06, 0, Math.PI * 2);
  ctx.fill();

  if (crested) {
    ctx.fillStyle = shadeColor(e.color, -20);
    [-0.5, -0.2, 0.1, 0.4].forEach((t) => {
      ctx.beginPath();
      ctx.moveTo(e.x + t * e.radius, e.y - e.radius * 0.38);
      ctx.lineTo(e.x + t * e.radius - e.radius * 0.06, e.y - e.radius * 0.6);
      ctx.lineTo(e.x + t * e.radius + e.radius * 0.06, e.y - e.radius * 0.6);
      ctx.closePath();
      ctx.fill();
    });
  }
}

// Real land iguanas (Conolophus subcristatus) have a relatively plain,
// stocky body — no crest, no banding — so the shared body's own default
// (everything off) is already the right look, not a missing feature.
function drawLandIguana(ctx, e) {
  drawIguanaBody(ctx, e);
}

// Enemy-art realism pass (direct request): this used to call the shared
// body with zero options too — identical geometry to Land Iguana, only
// its color differed. The real pink iguana (Conolophus marthae, the
// species this one's named for) has a genuinely distinguishing trait
// beyond its rosy color: dark crossbands running across its back, which
// `banded` now draws in.
function drawPinkIguana(ctx, e) {
  drawIguanaBody(ctx, e, { banded: true });
}

// Real lava lizards have a faint rough dorsal ridge — reuses the shared
// body's own `crested` option rather than a separate one-off detail.
function drawLavaIguana(ctx, e) {
  drawIguanaBody(ctx, e, { crested: true });
}

// Boss: the biggest of the 4, a real spiky dorsal crest, and the real
// species' own white salt-crusted snout — see drawIguanaBody's own
// comment for why both options are reused rather than new one-off code.
function drawMarineIguana(ctx, e) {
  drawIguanaBody(ctx, e, { crested: true, snoutColor: '#e8e4da' });
}

// --- Volcanic tier3 (direct follow-up request) -----------------------------

// Reuses the shared ant body (3 pairs of legs, oval body, round head) —
// real velvet ants are wingless wasps with an ant-like fuzzy 3-segment
// body, so the shared ant silhouette is the right starting shape. The
// dense black-and-red/orange banded fuzz is this insect's own single
// most recognizable trait (and its whole namesake), so it's the one
// thing added on top rather than anything beetle-specific.
function drawVelvetAnt(ctx, e) {
  drawAntBody(ctx, e);
  ctx.fillStyle = '#0d0a08';
  [-0.3, 0.3].forEach((dx) => {
    ctx.beginPath();
    ctx.ellipse(e.x + dx * e.radius, e.y, e.radius * 0.18, e.radius * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Shares drawBeetleBody/drawBeetlePlates with every other Volcanic beetle
// here, but with its own long, prominent curving antennae (this beetle's
// own namesake trait) ending in a small glowing-orange tip — reading as
// "lava-hot," same visual language Volcanic's own magma path/pools use,
// rather than a literal brown longhorn beetle.
function drawVolcanicLonghornBeetle(ctx, e) {
  drawBeetleBody(ctx, e);
  ctx.strokeStyle = shadeColor(e.color, 55);
  ctx.lineWidth = Math.max(1, e.radius * 0.08);
  ctx.lineCap = 'round';
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 1.1, e.y + side * e.radius * 0.1);
    ctx.quadraticCurveTo(
      e.x - e.radius * 1.7, e.y + side * e.radius * 0.5,
      e.x - e.radius * 2.1, e.y + side * e.radius * 0.35
    );
    ctx.stroke();
    ctx.fillStyle = '#e8540f';
    ctx.beginPath();
    ctx.arc(e.x - e.radius * 2.1, e.y + side * e.radius * 0.35, e.radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Real fire-loving beetles (genus Melanophila) have dedicated infrared-
// sensing pits that let them detect fires from miles away — the one
// signature trait drawn here, a pair of small glowing-orange pits on an
// otherwise plain dark charred-black beetle body.
function drawFireLovingBeetle(ctx, e) {
  drawBeetleBody(ctx, e);
  ctx.fillStyle = 'rgba(232, 84, 15, 0.85)';
  [-0.25, 0.25].forEach((dy) => {
    ctx.beginPath();
    ctx.arc(e.x + e.radius * 0.3, e.y + dy * e.radius, e.radius * 0.12, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Boss (round 75, this tier's own): shares drawBeetleBody/drawBeetlePlates
// (3 ridged segments, same "boss-tier, not just another regular beetle"
// treatment Haleakalā Mecyclothorax Beetle's own tier uses), plus a
// scatter of small raised bumps across the shell — the real Namib Desert
// Beetle's own famous fog-harvesting bumpy texture — in a pale grey/tan
// rather than this roster's otherwise dark, lava-charred palette, a
// deliberate "pale desert beetle" visual contrast.
function drawNamibDesertBeetle(ctx, e) {
  drawBeetleBody(ctx, e);
  drawBeetlePlates(ctx, e, 3, true);
  ctx.fillStyle = shadeColor(e.color, 30);
  [[-0.5, -0.25], [-0.15, -0.35], [0.2, -0.2], [-0.35, 0.2], [0.05, 0.3], [0.4, 0.05]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y + dy * e.radius, e.radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });
}

// --- Caves (direct request, relayed from the peer session) ----------------
// Every one-sided shape below draws its own head/front toward -x, same
// convention as every other roster in this file — see ENEMY_FACING_OFFSET/
// BOSS_FACING_OFFSET's own Caves entries further up.

// Angular bat wings (a sharp, pointed silhouette) rather than the round
// drawInsectWings every flying insect elsewhere in this file uses — bats
// are mammals, not insects, and their own real wing shape is the one
// thing that should read as unmistakably different at a glance.
function drawBat(ctx, e, { furredTail = false } = {}) {
  ctx.fillStyle = e.color;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 0.2, e.y);
    ctx.lineTo(e.x - e.radius * 0.9, e.y + side * e.radius * 0.3);
    ctx.lineTo(e.x - e.radius * 1.6, e.y + side * e.radius * 1.1);
    ctx.lineTo(e.x - e.radius * 0.9, e.y + side * e.radius * 0.9);
    ctx.closePath();
    ctx.fill();
  });

  // Real Eastern Red Bats have one further genuinely distinguishing trait
  // beyond their reddish color: a heavily FURRED tail membrane (most bat
  // species, including Caves' own plain Bat, have a bare one) — a small
  // fuzzy triangular flap trailing behind the body, drawn in the same
  // base color with a fringe of short bristle-dashes along its edge.
  if (furredTail) {
    ctx.beginPath();
    ctx.moveTo(e.x + e.radius * 0.1, e.y);
    ctx.lineTo(e.x + e.radius * 0.7, e.y - e.radius * 0.35);
    ctx.lineTo(e.x + e.radius * 0.7, e.y + e.radius * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shadeColor(e.color, 20);
    ctx.lineWidth = 1;
    [-0.25, 0, 0.25].forEach((t) => {
      ctx.beginPath();
      ctx.moveTo(e.x + e.radius * 0.5, e.y + t * e.radius * 0.6);
      ctx.lineTo(e.x + e.radius * 0.75, e.y + t * e.radius * 0.9);
      ctx.stroke();
    });
  }

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.5, e.radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.45, e.y, e.radius * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.55, e.y - e.radius * 0.2);
  ctx.lineTo(e.x - e.radius * 0.45, e.y - e.radius * 0.55);
  ctx.lineTo(e.x - e.radius * 0.3, e.y - e.radius * 0.22);
  ctx.closePath();
  ctx.fill();
}

// REDESIGNED on a direct follow-up request (relayed from the peer
// session, from a real reference photo of a pinned moth specimen — wings
// fully spread flat, not folded/angled like a resting or flying moth):
// 4 distinct wing lobes (2 bigger forewings, 2 smaller hindwings, each
// pair mirrored left-right) rather than drawInsectWings' usual 2-wing
// fan, tracing a wide bowtie/"W" silhouette when spread — the request's
// own called-out overall shape. Warm golden-tan/amber-brown wings with a
// darker brown border band (MOTH_WING_COLOR/MOTH_WING_BORDER_COLOR,
// drawn as 2 concentric ellipses rather than a stroke so the border
// reads as a solid band, not a thin outline), and one prominent eyespot
// per wing (a dark ring around a pale center, MOTH_EYESPOT_RING_COLOR/
// MOTH_EYESPOT_CENTER_COLOR) — all 4 wings share identical coloring, the
// real animal's own actual symmetry. No facing offset (see this
// section's own top comment): same "reads fine at any rotation" shape
// Arctic Moth's own entry already relies on — a pinned-specimen display
// pose doesn't have a meaningful "direction of travel" to begin with.
const MOTH_WING_COLOR = '#c99a4a';
const MOTH_WING_BORDER_COLOR = '#5c3a1a';
const MOTH_EYESPOT_RING_COLOR = '#2e1c0e';
const MOTH_EYESPOT_CENTER_COLOR = '#f0e4c8';

// One wing lobe, drawn in its own local, unrotated frame then
// transformed into place — `angle` is how far this lobe's own long axis
// tilts away from the body, same "fan the lobe outward" role `side`
// plays for drawInsectWings elsewhere in this file. Reused 4 times (fore/
// hind, left/right) by drawMoth below.
function drawMothWing(ctx, cx, cy, length, width, angle) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  ctx.fillStyle = MOTH_WING_BORDER_COLOR;
  ctx.beginPath();
  ctx.ellipse(0, 0, length, width, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = MOTH_WING_COLOR;
  ctx.beginPath();
  ctx.ellipse(0, 0, length * 0.82, width * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = MOTH_EYESPOT_RING_COLOR;
  ctx.beginPath();
  ctx.arc(length * 0.08, 0, width * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MOTH_EYESPOT_CENTER_COLOR;
  ctx.beginPath();
  ctx.arc(length * 0.14, 0, width * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMoth(ctx, e) {
  [-1, 1].forEach((side) => {
    // Forewing: the bigger of the pair, closer to the head.
    drawMothWing(
      ctx,
      e.x + side * e.radius * 0.95,
      e.y - e.radius * 0.35,
      e.radius * 1.1,
      e.radius * 0.55,
      side * 0.4
    );
    // Hindwing: smaller, trailing further back toward the tail.
    drawMothWing(
      ctx,
      e.x + side * e.radius * 0.7,
      e.y + e.radius * 0.55,
      e.radius * 0.7,
      e.radius * 0.4,
      side * 0.9
    );
  });

  // Fuzzy, fat body where all 4 wings meet — drawn on top of the wings
  // so it reads as the thorax/abdomen sitting over them, same layering
  // every winged creature elsewhere in this file already uses.
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.36, e.radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Feathery/comb-like antennae, sticking up and out from the head — a
  // few short side-teeth along each main antenna shaft give it that
  // comb texture rather than a plain bare line.
  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = Math.max(1, e.radius * 0.09);
  ctx.lineCap = 'round';
  [-1, 1].forEach((side) => {
    const baseX = e.x + side * e.radius * 0.08;
    const baseY = e.y - e.radius * 0.45;
    const tipX = e.x + side * e.radius * 0.4;
    const tipY = e.y - e.radius * 0.95;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(e.x + side * e.radius * 0.3, e.y - e.radius * 0.75, tipX, tipY);
    ctx.stroke();
    [0.35, 0.6, 0.85].forEach((t) => {
      const toothX = baseX + (tipX - baseX) * t;
      const toothY = baseY + (tipY - baseY) * t;
      ctx.beginPath();
      ctx.moveTo(toothX, toothY);
      ctx.lineTo(toothX + side * e.radius * 0.1, toothY - e.radius * 0.03);
      ctx.stroke();
    });
  });
}

// Tiny — the roster's own smallest, plainest entry by design, same
// "weakest reads as the least distinctive" convention Deer Fly's own
// comment calls out. No facing offset, same reasoning as Moth above.
function drawFungusGnat(ctx, e) {
  drawInsectWings(ctx, e, { spread: 0.4, tint: 'rgba(220, 220, 220, 0.35)' });
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.4, e.radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Boss (round 25): a bigger, boss-scaled take on the same small-flying-
// insect silhouette Fungus Gnat uses, plus a pair of small glowing-red
// eye dots — the one visual cue that reads as "boss" rather than just
// "bigger gnat," same role Haleakalā Mecyclothorax Beetle's own forward
// mandibles play for its tier. No facing offset, same reasoning as every
// other wings-only creature in this section.
function drawCaveMidge(ctx, e) {
  drawInsectWings(ctx, e, { spread: 0.5, tint: 'rgba(200, 200, 210, 0.5)' });
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.5, e.radius * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c62828';
  [-0.18, 0.18].forEach((dx) => {
    ctx.beginPath();
    ctx.arc(e.x + dx * e.radius, e.y - e.radius * 0.45, e.radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Shared bird silhouette for Caves' own 4 birds (Oilbird/Swiftlet/White-
// collared Swift/Cave Swallow) — no bird shape existed anywhere in this
// codebase before, so this is new rather than a reuse. A plain oval body
// with a small round head and pointed beak toward -x, swept-back wings,
// and a plain pointed tail by default. `longWings` (real swifts/swiftlets
// are famously fast, long-winged fliers) draws a longer, narrower scythe-
// shaped wing instead of the default stubby one; `tailFork` draws a
// swallow's own forked tail instead of the plain pointed one; `collarColor`
// draws a pale band around the throat — each option is this family's own
// real, named distinguishing trait,
// same "one shared body, a small flag picks the detail" convention
// Volcanic's drawIguanaBody (`crested`/`snoutColor`) already established.
function drawCaveBirdBody(ctx, e, { tailFork = false, collarColor = null, longWings = false, spotted = false } = {}) {
  const wingReach = longWings ? 1.5 : 1.0;
  ctx.fillStyle = shadeColor(e.color, -15);
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(e.x, e.y + side * e.radius * 0.15);
    ctx.quadraticCurveTo(
      e.x + e.radius * 0.3 * wingReach, e.y + side * e.radius * 0.7 * wingReach,
      e.x + e.radius * 0.9 * wingReach, e.y + side * e.radius * 1.1 * wingReach
    );
    ctx.quadraticCurveTo(e.x + e.radius * 0.5, e.y + side * e.radius * 0.5, e.x, e.y + side * e.radius * 0.15);
    ctx.closePath();
    ctx.fill();
  });

  ctx.fillStyle = e.color;
  if (tailFork) {
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(e.x + e.radius * 0.6, e.y);
      ctx.lineTo(e.x + e.radius * 1.3, e.y + side * e.radius * 0.5);
      ctx.lineTo(e.x + e.radius * 0.95, e.y + side * e.radius * 0.1);
      ctx.closePath();
      ctx.fill();
    });
  } else {
    ctx.beginPath();
    ctx.moveTo(e.x + e.radius * 0.6, e.y - e.radius * 0.25);
    ctx.lineTo(e.x + e.radius * 1.2, e.y);
    ctx.lineTo(e.x + e.radius * 0.6, e.y + e.radius * 0.25);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.75, e.radius * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  if (collarColor) {
    ctx.strokeStyle = collarColor;
    ctx.lineWidth = Math.max(1.5, e.radius * 0.18);
    ctx.beginPath();
    ctx.arc(e.x - e.radius * 0.35, e.y, e.radius * 0.3, -Math.PI * 0.6, Math.PI * 0.6);
    ctx.stroke();
  }

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.75, e.y, e.radius * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2420';
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 1.05, e.y);
  ctx.lineTo(e.x - e.radius * 1.3, e.y - e.radius * 0.08);
  ctx.lineTo(e.x - e.radius * 1.05, e.y + e.radius * 0.12);
  ctx.closePath();
  ctx.fill();

  // Enemy-art realism pass (direct request): real oilbirds (Steatornis
  // caripensis) are famous specifically for small white spots scattered
  // across their otherwise plain rufous-brown plumage — their own single
  // most recognizable field mark, and the one real trait this bird
  // family's shared body had no way to draw before now. Kept deliberately
  // modest (no structural change like longWings/tailFork/collarColor get)
  // so Oilbird stays this roster's own least-ornamented bird overall,
  // just no longer missing its real signature marking entirely.
  if (spotted) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    [[0.15, -0.55], [0.45, -0.35], [0.3, 0.1], [0.5, 0.4], [0.1, 0.55]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(e.x + dx * e.radius, e.y + dy * e.radius, e.radius * 0.07, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// Larger brown bird (the request's own called-out trait) with real
// oilbird white wing-spotting (`spotted`) — otherwise plain, no
// structural embellishment like the other 3 birds get, so it's still
// this roster's own least-ornamented bird overall.
function drawOilbird(ctx, e) {
  drawCaveBirdBody(ctx, e, { spotted: true });
}

function drawSwiftlet(ctx, e) {
  drawCaveBirdBody(ctx, e, { longWings: true });
}

// A real swift species too (not just named like one) — same long-winged
// treatment as Swiftlet, plus its own real pale throat band.
function drawWhiteCollaredSwift(ctx, e) {
  drawCaveBirdBody(ctx, e, { longWings: true, collarColor: '#f0ece0' });
}

function drawCaveSwallow(ctx, e) {
  drawCaveBirdBody(ctx, e, { tailFork: true });
}

// Shared body for Caves' 2 blind cave salamanders (Olm/Texas Blind
// Salamander) — a low body/tail, 2 pairs of short bent limbs, and a
// blunt head toward -x with NO eye at all (both real animals are blind)
// — the one deliberate omission that most reads as "cave-adapted" at a
// glance, the same role deliberately omitting Blind Cavefish's own eye
// plays below.
//
// FIXED on user bug report (relayed from the peer session): the two
// callers below originally only varied `gillColor`, and by two nearly
// identical shades of red at that — same body geometry, same `radius`
// (CAVES_ROSTER), colors too close to tell apart at a glance, so the two
// read as the same creature in-game despite being meant as visually
// distinct. `stretch`/`gillSize`/`headFlatten` are new options giving
// each caller a genuinely different silhouette, not just a color swap:
// `stretch` scales body length up (thinner, more eel-like) or down
// (stockier, fatter) while the body WIDTH scales inversely, so a longer
// body doesn't just look like a bigger version of a shorter one;
// `headFlatten` flattens the head ellipse's own vertical radius;
// `gillSize` scales both the gill strokes' width and how far the fronds
// reach. All 3 default to 1 (today's exact prior geometry) when omitted,
// so nothing else that might ever reuse this shared body is affected.
function drawCaveSalamanderBody(ctx, e, { gillColor, gillSize = 1, stretch = 1, headFlatten = 1 } = {}) {
  const bodyWidth = (e.radius * 0.38) / stretch;
  const tailOffset = e.radius * 0.3 * stretch;
  const headOffset = e.radius * 0.95 * stretch;

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x + tailOffset, e.y, e.radius * 1.3 * stretch, bodyWidth, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shadeColor(e.color, -15);
  ctx.lineWidth = Math.max(1.2, e.radius * 0.12);
  ctx.lineCap = 'round';
  [-0.3 * stretch, 0.6 * stretch].forEach((t) => {
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(e.x + t * e.radius, e.y + side * bodyWidth * 0.65);
      ctx.lineTo(e.x + t * e.radius - e.radius * 0.1, e.y + side * bodyWidth * 1.6);
      ctx.stroke();
    });
  });

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x - headOffset, e.y, e.radius * 0.42, e.radius * 0.32 * headFlatten, 0, 0, Math.PI * 2);
  ctx.fill();

  if (gillColor) {
    ctx.strokeStyle = gillColor;
    ctx.lineWidth = Math.max(1, e.radius * 0.1 * gillSize);
    ctx.lineCap = 'round';
    [-1, 1].forEach((side) => {
      [0.15, 0, -0.15].forEach((t) => {
        ctx.beginPath();
        ctx.moveTo(e.x - headOffset * 0.63, e.y + side * e.radius * 0.25 + t * e.radius * 0.1);
        ctx.quadraticCurveTo(
          e.x - headOffset * 0.37, e.y + side * e.radius * (0.25 + 0.3 * gillSize) + t * e.radius * 0.1,
          e.x - headOffset * 0.53, e.y + side * e.radius * (0.25 + 0.5 * gillSize) + t * e.radius * 0.1
        );
        ctx.stroke();
      });
    });
  }
}

// Real Olms are notably elongated and eel-like with large, prominent
// feathery gills (external gills it never outgrows, even as an adult —
// its own famous signature trait) — a longer, thinner body (stretch
// 1.3) and big, vivid gill fronds (gillSize 1.4) read that clearly.
function drawOlm(ctx, e) {
  drawCaveSalamanderBody(ctx, e, { gillColor: '#e8506a', gillSize: 1.4, stretch: 1.3 });
}

// Real Texas Blind Salamanders are stockier/shorter than an Olm, with a
// flatter head and smaller, less prominent gills — a shorter, fatter
// body (stretch 0.75, the inverse of Olm's own 1.3), a flattened head
// (headFlatten 0.65), and small, duller gill fronds (gillSize 0.55, a
// paler/dustier accent color than Olm's own vivid one) read that
// clearly — genuinely distinct proportions, not just a different color
// on the same silhouette (see this file's own bug-fix note above).
function drawTexasBlindSalamander(ctx, e) {
  drawCaveSalamanderBody(ctx, e, { gillColor: '#c2889a', gillSize: 0.55, stretch: 0.75, headFlatten: 0.65 });
}

// A small curved, pale/translucent body (read through a light color
// choice rather than actual alpha transparency, same convention every
// other "pale" creature in this file already uses) with a few thin legs
// and a pair of long antennae toward -x.
function drawCaveShrimp(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.8, e.y - e.radius * 0.3);
  ctx.quadraticCurveTo(e.x + e.radius * 0.3, e.y - e.radius * 0.7, e.x + e.radius * 0.9, e.y);
  ctx.quadraticCurveTo(e.x + e.radius * 0.3, e.y + e.radius * 0.5, e.x - e.radius * 0.6, e.y + e.radius * 0.35);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = shadeColor(e.color, -20);
  ctx.lineWidth = 1;
  [0.4, 0.1, -0.2].forEach((t) => {
    ctx.beginPath();
    ctx.moveTo(e.x + t * e.radius, e.y + e.radius * 0.1);
    ctx.lineTo(e.x + t * e.radius, e.y + e.radius * 0.5);
    ctx.stroke();
  });

  ctx.strokeStyle = shadeColor(e.color, -10);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.75, e.y - e.radius * 0.25);
  ctx.lineTo(e.x - e.radius * 1.3, e.y - e.radius * 0.5);
  ctx.stroke();
}

// Boss (the map's own final boss, round 50): an elongated, pale fish
// body with a tail fin and a translucent dorsal-fin ridge — but
// deliberately NO eye at all, the one thing every other fish-shaped
// creature in this entire file (Clown Fish, Marlin, the sharks, etc.)
// always draws. "Blind" is this fish's whole namesake, so the missing
// eye is the single most important visual choice here, not an oversight.
function drawBlindCavefish(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 1.15, e.radius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.95, e.y);
  ctx.lineTo(e.x + e.radius * 1.5, e.y - e.radius * 0.45);
  ctx.lineTo(e.x + e.radius * 1.5, e.y + e.radius * 0.45);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shadeColor(e.color, -15);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.2, e.y - e.radius * 0.4);
  ctx.quadraticCurveTo(e.x + e.radius * 0.3, e.y - e.radius * 0.7, e.x + e.radius * 0.6, e.y - e.radius * 0.35);
  ctx.closePath();
  ctx.fill();
}

// --- Deep Sea: ruins/sand creatures ---------------------------------------

// Snailfish are famously soft/gelatinous, tadpole-shaped — a big
// rounded head tapering straight into a thin tail, no hard scales or
// fins to speak of.
function drawSnailFish(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius, e.y);
  ctx.quadraticCurveTo(e.x - e.radius * 0.3, e.y - e.radius * 0.9, e.x + e.radius * 0.6, e.y - e.radius * 0.25);
  ctx.quadraticCurveTo(e.x + e.radius * 1.6, e.y, e.x + e.radius * 0.6, e.y + e.radius * 0.25);
  ctx.quadraticCurveTo(e.x - e.radius * 0.3, e.y + e.radius * 0.9, e.x - e.radius, e.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.55, e.y - e.radius * 0.2, e.radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

// A grenadier/rattail's own namesake trait: a disproportionately large
// head tapering straight into a very long, thin whip of a tail.
function drawRattailFish(ctx, e) {
  ctx.strokeStyle = e.color;
  ctx.lineWidth = Math.max(1, e.radius * 0.1);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.2, e.y);
  ctx.quadraticCurveTo(e.x - e.radius * 1.6, e.y + e.radius * 0.1, e.x - e.radius * 2.6, e.y);
  ctx.stroke();

  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.3, e.y, e.radius * 0.8, e.radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(e.color, -18);
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.9, e.y - e.radius * 0.35);
  ctx.lineTo(e.x + e.radius * 1.35, e.y - e.radius * 0.1);
  ctx.lineTo(e.x + e.radius * 0.9, e.y + e.radius * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 0.55, e.y - e.radius * 0.15, e.radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

// A long, thin, scaleless eel body — a slight S-curve bend baked into
// the shape itself (not an animated slither; this project's eel/snake
// movement-animation pass, if and when it reaches this roster, would
// animate the undulation at render time on top of this base shape).
function drawGiantCuskEel(ctx, e) {
  ctx.strokeStyle = e.color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, e.radius * 0.7);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 2.2, e.y);
  ctx.quadraticCurveTo(e.x - e.radius * 0.8, e.y - e.radius * 0.3, e.x + e.radius * 0.6, e.y);
  ctx.quadraticCurveTo(e.x + e.radius * 1.4, e.y + e.radius * 0.15, e.x + e.radius * 1.9, e.y);
  ctx.stroke();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(e.x + e.radius * 1.6, e.y - e.radius * 0.08, e.radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

// A 5-armed starfish with short spine ticks along each arm, distinct
// from the plain-smooth Whirlpool starfish.
function drawSpinyStar(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const outerAngle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const innerAngle = outerAngle + Math.PI / 5;
    const ox = e.x + Math.cos(outerAngle) * e.radius;
    const oy = e.y + Math.sin(outerAngle) * e.radius;
    const ix = e.x + Math.cos(innerAngle) * e.radius * 0.42;
    const iy = e.y + Math.sin(innerAngle) * e.radius * 0.42;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = shadeColor(e.color, -22);
  ctx.lineWidth = Math.max(1, e.radius * 0.08);
  for (let i = 0; i < 5; i += 1) {
    const armAngle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    [0.5, 0.7, 0.9].forEach((t) => {
      const px = e.x + Math.cos(armAngle) * e.radius * t;
      const py = e.y + Math.sin(armAngle) * e.radius * t;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(armAngle + 0.5) * e.radius * 0.15, py + Math.sin(armAngle + 0.5) * e.radius * 0.15);
      ctx.stroke();
    });
  }
  ctx.fillStyle = shadeColor(e.color, 20);
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

// A sea spider's own namesake trait: a tiny body almost lost among very
// long, thin, radiating legs (real pycnogonids are famously "all legs").
function drawGiantSeaSpider(ctx, e) {
  ctx.strokeStyle = e.color;
  ctx.lineWidth = Math.max(1, e.radius * 0.1);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const kneeX = e.x + Math.cos(angle) * e.radius * 1.1;
    const kneeY = e.y + Math.sin(angle) * e.radius * 1.1;
    const footX = e.x + Math.cos(angle) * e.radius * 2.1;
    const footY = e.y + Math.sin(angle) * e.radius * 2.1 * 0.6;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();
  }
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

// A delicate pink urchin with thin, sparse spines (vs. the Whirlpool
// urchin's thicker, denser ones) — "fragile" per its own name.
function drawFragilePinkSeaUrchin(ctx, e) {
  ctx.strokeStyle = e.color;
  ctx.lineWidth = Math.max(0.8, e.radius * 0.07);
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(angle) * e.radius * 0.45, e.y + Math.sin(angle) * e.radius * 0.45);
    ctx.lineTo(e.x + Math.cos(angle) * e.radius * 1.4, e.y + Math.sin(angle) * e.radius * 1.4);
    ctx.stroke();
  }
  ctx.fillStyle = shadeColor(e.color, 15);
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

// Whalefish boss — an anglerfish-like silhouette: a bulbous, mostly-mouth
// body, tiny eye, and a small glowing lure dangling in front (whalefishes
// are deep-sea anglerfish relatives with huge mouths and tiny eyes).
function drawWhalefish(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 1.1, e.radius * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shadeColor(e.color, -18);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.3, e.y + e.radius * 0.2);
  ctx.quadraticCurveTo(e.x - e.radius * 1.1, e.y + e.radius * 0.5, e.x - e.radius * 1.3, e.y + e.radius * 0.05);
  ctx.quadraticCurveTo(e.x - e.radius * 0.9, e.y - e.radius * 0.1, e.x - e.radius * 0.3, e.y - e.radius * 0.05);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.55, e.y - e.radius * 0.3, e.radius * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#2a3440';
  ctx.lineWidth = Math.max(1, e.radius * 0.07);
  ctx.beginPath();
  ctx.moveTo(e.x - e.radius * 0.9, e.y - e.radius * 0.8);
  ctx.quadraticCurveTo(e.x - e.radius * 1.1, e.y - e.radius * 1.3, e.x - e.radius * 0.85, e.y - e.radius * 1.5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(140, 230, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.85, e.y - e.radius * 1.5, e.radius * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

// California Sun Star boss — unlike a plain 5-point starfish, real
// California sun stars have 8-24 short, fat arms around a wide, mottled
// central disc; drawn here with 10 arms and a 2-tone mottled pattern.
function drawCaliforniaSunStar(ctx, e) {
  const armCount = 10;
  ctx.fillStyle = e.color;
  ctx.beginPath();
  for (let i = 0; i < armCount; i += 1) {
    const outerAngle = (i / armCount) * Math.PI * 2 - Math.PI / 2;
    const innerAngle = outerAngle + Math.PI / armCount;
    const ox = e.x + Math.cos(outerAngle) * e.radius;
    const oy = e.y + Math.sin(outerAngle) * e.radius;
    const ix = e.x + Math.cos(innerAngle) * e.radius * 0.6;
    const iy = e.y + Math.sin(innerAngle) * e.radius * 0.6;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();

  // Mottled purple patches, scattered across the disc/arms — the real
  // animal's own blotchy multi-color pattern, not a flat single color.
  ctx.fillStyle = 'rgba(120, 60, 120, 0.45)';
  for (let i = 0; i < armCount; i += 1) {
    const angle = (i / armCount) * Math.PI * 2 - Math.PI / 2 + Math.PI / armCount;
    const px = e.x + Math.cos(angle) * e.radius * 0.5;
    const py = e.y + Math.sin(angle) * e.radius * 0.5;
    ctx.beginPath();
    ctx.arc(px, py, e.radius * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = shadeColor(e.color, 24);
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// --- The Hollow Event ("Adventures," direct request relayed from the -----
// --- peer session) -------------------------------------------------------
// Every one-sided shape below draws its own head/front toward -x, same
// convention as every other roster in this file — see
// ENEMY_FACING_OFFSET/BOSS_FACING_OFFSET's own entries for these types.

// Real oakleaf butterflies (genus Kallima) fold their wings shut at rest
// to look exactly like a dead leaf: a single pointed silhouette (not an
// open wing pair the way every other flier in this file draws itself)
// with a dark "leaf vein" line down the middle — the one shape in this
// roster NOT built from drawInsectWings, since the mimicry is the whole
// point and an open-wing pair wouldn't read as a closed leaf at all.
function drawOakleafButterfly(ctx, e) {
  ctx.fillStyle = e.color;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(e.x + e.radius * 0.9, e.y);
    ctx.quadraticCurveTo(e.x - e.radius * 0.3, e.y + side * e.radius * 0.9, e.x - e.radius * 1.1, e.y + side * e.radius * 0.15);
    ctx.quadraticCurveTo(e.x - e.radius * 0.3, e.y + side * e.radius * 0.25, e.x + e.radius * 0.9, e.y);
    ctx.closePath();
    ctx.fill();
  });
  ctx.strokeStyle = shadeColor(e.color, -35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(e.x + e.radius * 0.85, e.y);
  ctx.lineTo(e.x - e.radius * 1.0, e.y);
  ctx.stroke();
}

// Real dead-leaf mantises (genus Deroplatys) are slow, patient ambush
// predators camouflaged as a dead leaf, with raised, folded "praying"
// forelegs — a long leaf-shaped abdomen plus 2 bent/raised forelegs is
// the pair of traits that reads as "mantis" rather than just "bug."
function drawDeadleafMantis(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.1, e.y, e.radius * 1.3, e.radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 1.0, e.y, e.radius * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shadeColor(e.color, -30);
  ctx.lineWidth = Math.max(1.5, e.radius * 0.12);
  ctx.lineCap = 'round';
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * 0.7, e.y + side * e.radius * 0.15);
    ctx.quadraticCurveTo(
      e.x - e.radius * 1.1, e.y - side * e.radius * 0.5,
      e.x - e.radius * 0.6, e.y - side * e.radius * 0.75
    );
    ctx.stroke();
  });
}

// Real buff-tip moths (Phalera bucephala) are famous for resembling a
// snapped birch twig at rest — dull grey-brown wings folded tight along
// the body, each tipped with a distinct pale buff/cream patch mimicking
// pale, broken wood. Built as its own bespoke wing pair (rather than
// drawInsectWings) so that pale tip patch can be placed precisely at
// each wing's own local tip regardless of rotation.
function drawBufftipMoth(ctx, e) {
  [-1, 1].forEach((side) => {
    ctx.save();
    ctx.translate(e.x - e.radius * 0.1, e.y);
    ctx.rotate(side * 0.25);
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.ellipse(0, -e.radius * 0.1, e.radius * 1.0, e.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8c9a0';
    ctx.beginPath();
    ctx.ellipse(e.radius * 0.75, -e.radius * 0.1, e.radius * 0.3, e.radius * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.fillStyle = shadeColor(e.color, -15);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.4, e.radius * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
}

// A real sphinx/hawkmoth species — Latin "lugubris" literally means
// "mournful," matching the somber, dark-furred design here: 2 layered
// wing pairs at different spreads/tints (a bigger, boss-tier step up
// from Buff-tip Moth's single pair, same "more ornamented at boss scale"
// convention every other map's own mid-boss gets) plus a stout furry
// body.
function drawMournfulSphinx(ctx, e) {
  drawInsectWings(ctx, e, { spread: 0.3, elongated: true, tint: shadeColor(e.color, 12) });
  drawInsectWings(ctx, e, { spread: 0.55, elongated: true, tint: 'rgba(20, 18, 16, 0.55)' });
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.radius * 0.5, e.radius * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(e.color, -25);
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.5, e.y, e.radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// Shared 4-pairs-of-bent-legs spider body, generalized from drawAntBody's
// own 3-pairs-of-legs loop above but splayed out to the sides (a spider's
// own stance) rather than trailing behind. Any future spider-shaped type
// can reuse this the same way drawAntBody/drawBeetleBody are already
// shared across several callers each.
function drawSpiderLegs(ctx, e) {
  ctx.strokeStyle = shadeColor(e.color, -35);
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  [-1, 1].forEach((side) => {
    [-0.9, -0.3, 0.3, 0.9].forEach((t) => {
      const kneeX = e.x + t * e.radius * 0.9;
      const kneeY = e.y + side * e.radius * 0.9;
      ctx.beginPath();
      ctx.moveTo(e.x + t * e.radius * 0.3, e.y);
      ctx.quadraticCurveTo(kneeX, kneeY, e.x + t * e.radius * 1.3, e.y + side * e.radius * 1.5);
      ctx.stroke();
    });
  });
}

// Real orb weavers build webs rather than chase prey down — a bulbous,
// boldly-marked abdomen (their own signature trait, drawn here as a pale
// dorsal stripe over the base color) is what reads as "orb weaver"
// rather than a generic spider.
function drawOrbWeaver(ctx, e) {
  drawSpiderLegs(ctx, e);
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.15, e.y, e.radius * 0.85, e.radius * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.7, e.y, e.radius * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(e.color, 40);
  ctx.beginPath();
  ctx.ellipse(e.x + e.radius * 0.15, e.y, e.radius * 0.25, e.radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Real eastern red bats are solitary, fast fliers, famously reddish-
// orange furred (unlike the grey-brown of Caves' own Bat) — reuses
// drawBat's shared body wholesale, color alone tells them apart, same
// "shared body, color does the work" convention Volcanic's own 3
// iguanas already established.
function drawEasternRedBat(ctx, e) {
  drawBat(ctx, e, { furredTail: true });
}

// Real (red-morph) Eastern Screech Owls are small, fierce nocturnal
// predators — reuses Caves' own shared drawCaveBirdBody, plus ear tufts
// and big forward-facing eyes, the 2 traits that read as "owl" rather
// than just "bird" at this scale.
function drawRedEasternScreechOwl(ctx, e) {
  drawCaveBirdBody(ctx, e);
  ctx.fillStyle = shadeColor(e.color, -20);
  [-0.15, 0.25].forEach((dx) => {
    ctx.beginPath();
    ctx.moveTo(e.x - e.radius * (0.85 - dx), e.y - e.radius * 0.25);
    ctx.lineTo(e.x - e.radius * (0.95 - dx), e.y - e.radius * 0.55);
    ctx.lineTo(e.x - e.radius * (0.7 - dx), e.y - e.radius * 0.3);
    ctx.closePath();
    ctx.fill();
  });
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.8, e.y, e.radius * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a0f00';
  ctx.beginPath();
  ctx.arc(e.x - e.radius * 0.8, e.y, e.radius * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

// One splayed primary (flight) feather, drawn in its own local frame then
// rotated/translated into place — drawCrowWing() below calls this 5 times
// per wing to fan them apart at the tip, the real bird's own "fingered"
// wingtip (clearly separated feather tips, not one solid paddle shape) —
// a direct reference-photo callout. `torn` bites a jagged notch out of
// the tip instead of leaving it a clean point — the "hollow"/tattered
// touch, now applied to an anatomically real feather shape instead of a
// generic wing edge.
function drawCrowPrimaryFeather(ctx, originX, originY, angle, length, width, torn) {
  ctx.save();
  ctx.translate(originX, originY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -width / 2);
  if (torn) {
    ctx.lineTo(length * 0.55, -width * 0.1);
    ctx.lineTo(length * 0.35, 0);
    ctx.lineTo(length * 0.6, width * 0.12);
  } else {
    ctx.lineTo(length, 0);
  }
  ctx.lineTo(0, width / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// One wing, swept back from the shoulder to a joint and then a tip — the
// same 2-segment sweep drawCaveBirdBody's own wings use — but ending in 5
// separated, fanned primary feathers instead of curving smoothly back to
// a single point, per the flight reference photo's own "fingered"
// wingtip. A soft purple/blue-green overlay along the leading edge reads
// as the real bird's own oil-slick iridescent sheen rather than flat
// matte black. 2 of the 5 primaries are drawn torn/notched — this map's
// existing "hollow"/tattered touch, carried over onto the new real
// feather shapes.
function drawCrowWing(ctx, e, side) {
  const r = e.radius;
  const baseX = e.x;
  const baseY = e.y + side * r * 0.15;
  const jointX = e.x + r * 0.35;
  const jointY = e.y + side * r * 0.78;
  const tipX = e.x + r * 0.85;
  const tipY = e.y + side * r * 1.12;

  ctx.fillStyle = shadeColor(e.color, 6);
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(jointX, jointY, tipX, tipY);
  ctx.quadraticCurveTo(e.x + r * 0.55, e.y + side * r * 0.55, baseX, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, -30);
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.stroke();

  ctx.fillStyle = 'rgba(120, 90, 190, 0.22)';
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(jointX, jointY, tipX, tipY);
  ctx.quadraticCurveTo(e.x + r * 0.48, e.y + side * r * 0.78, baseX, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(70, 160, 140, 0.16)';
  ctx.beginPath();
  ctx.ellipse(jointX, jointY, r * 0.28, r * 0.12, Math.atan2(tipY - baseY, tipX - baseX), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shadeColor(e.color, -8);
  const sweepAngle = Math.atan2(tipY - jointY, tipX - jointX);
  const fingerCount = 5;
  for (let i = 0; i < fingerCount; i += 1) {
    const t = i - (fingerCount - 1) / 2; // -2..2
    const fanAngle = sweepAngle + t * (side * 0.17);
    const length = r * (0.42 - Math.abs(t) * 0.07);
    drawCrowPrimaryFeather(ctx, jointX, jointY, fanAngle, length, r * 0.22, i === 1 || i === 3);
  }
}

// Boss (the stage's own true, climactic final boss, round 50): redrawn
// from scratch as its own real crow anatomy (direct follow-up request,
// from 2 real reference photos — a perched profile shot and a wings-
// spread flight shot) rather than reusing the generic drawCaveBirdBody
// every other Caves/Hollow bird shares, since the features called out
// (a heavy hook-tipped beak, iridescent sheen, fingered wingtip
// feathers, visible taloned legs, a flat-topped skull) are too crow-
// specific to express through that shared shape's own small option set.
// The existing "hollow" supernatural touches (glowing eye socket,
// tattered wingtips) are layered ON TOP of this more anatomically-
// correct base, not replacing it, per the request's own explicit
// instruction — this same function also draws the splash screen's giant
// hero version (see drawHollowSplashCrow in game.js), just at a much
// bigger radius with its own extra aura wrapped around it.
function drawHollowCrow(ctx, e) {
  const r = e.radius;

  drawCrowWing(ctx, e, -1);
  drawCrowWing(ctx, e, 1);

  // Tail — a broad, fanned, rounded-square shape (per the flight
  // reference photo) rather than a thin forked V.
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(e.x + r * 0.55, e.y - r * 0.32);
  ctx.quadraticCurveTo(e.x + r * 1.35, e.y - r * 0.38, e.x + r * 1.45, e.y);
  ctx.quadraticCurveTo(e.x + r * 1.35, e.y + r * 0.38, e.x + r * 0.55, e.y + r * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shadeColor(e.color, -25);
  ctx.lineWidth = 1;
  [-0.6, -0.2, 0.2, 0.6].forEach((t) => {
    ctx.beginPath();
    ctx.moveTo(e.x + r * 0.9, e.y + t * r * 0.32);
    ctx.lineTo(e.x + r * 1.42, e.y + t * r * 0.36);
    ctx.stroke();
  });

  // Body — glossy black with a diagonal iridescent sheen streak (real
  // crow plumage catches light with a purplish/blue-green shimmer, not
  // flat matte black) rather than one flat fill.
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, r * 0.8, r * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(130, 100, 200, 0.2)';
  ctx.beginPath();
  ctx.ellipse(e.x + r * 0.1, e.y - r * 0.12, r * 0.55, r * 0.14, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(80, 170, 150, 0.15)';
  ctx.beginPath();
  ctx.ellipse(e.x - r * 0.15, e.y + r * 0.1, r * 0.4, r * 0.1, -0.25, 0, Math.PI * 2);
  ctx.fill();

  // Head — flatter/more elongated than a round ball (a real corvid's own
  // flat-topped skull profile, per the reference photos) rather than a
  // perfect circle.
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(e.x - r * 0.78, e.y, r * 0.34, r * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();

  // Beak — thick and substantial relative to the head, straight-ish with
  // a slight downward hook right at the tip, plus a few small bristle
  // feathers near the base at the nostrils — not the old thin pointed
  // triangle.
  ctx.fillStyle = '#121212';
  ctx.beginPath();
  ctx.moveTo(e.x - r * 1.08, e.y - r * 0.17);
  ctx.lineTo(e.x - r * 1.55, e.y - r * 0.04);
  ctx.quadraticCurveTo(e.x - r * 1.68, e.y + r * 0.02, e.x - r * 1.58, e.y + r * 0.1);
  ctx.lineTo(e.x - r * 1.08, e.y + r * 0.17);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#121212';
  ctx.lineWidth = 1;
  [-0.1, 0.02, 0.14].forEach((dy) => {
    ctx.beginPath();
    ctx.moveTo(e.x - r * 1.05, e.y + dy * r);
    ctx.lineTo(e.x - r * 0.98, e.y + dy * r * 1.4);
    ctx.stroke();
  });

  // Legs + talons — drawn after the body/wings/tail (so they're never
  // hidden underneath the wing panels, which span most of that same
  // area) rather than before them. "Strong black legs with sharp, curved
  // talons," not just small stick legs, one of the reference photos' own
  // called-out traits.
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = Math.max(1.6, r * 0.11);
  ctx.lineCap = 'round';
  [-1, 1].forEach((side) => {
    const footX = e.x - r * 0.05;
    const footY = e.y + side * r * 0.56;
    ctx.beginPath();
    ctx.moveTo(e.x + r * 0.1, e.y + side * r * 0.2);
    ctx.lineTo(footX, footY);
    ctx.stroke();

    ctx.fillStyle = '#0a0a0a';
    [-1, 0, 1].forEach((toe) => {
      const toeAngle = Math.PI * 0.5 + toe * 0.55;
      ctx.beginPath();
      ctx.moveTo(footX, footY);
      ctx.quadraticCurveTo(
        footX - Math.cos(toeAngle) * r * 0.22, footY + side * Math.sin(toeAngle) * r * 0.22,
        footX - Math.cos(toeAngle) * r * 0.34 - r * 0.05, footY + side * Math.sin(toeAngle) * r * 0.3
      );
      ctx.lineTo(footX - Math.cos(toeAngle) * r * 0.22 - r * 0.03, footY + side * Math.sin(toeAngle) * r * 0.2);
      ctx.closePath();
      ctx.fill();
    });
  });

  // The hollow supernatural touch, kept: a small (anatomically real eye
  // size this time, not an oversized "googly eye" circle) pale, glowing
  // socket where a real crow's small dark eye would sit, its glow doing
  // the "eerie" work instead of the socket's own size. shadowBlur is
  // capped rather than scaled straight off `r` — at the splash screen's
  // own much bigger radius, an uncapped blur washed out most of the head.
  ctx.save();
  ctx.shadowColor = 'rgba(235, 230, 255, 0.9)';
  ctx.shadowBlur = Math.min(16, Math.max(3, r * 0.18));
  ctx.fillStyle = 'rgba(230, 230, 245, 0.95)';
  ctx.beginPath();
  ctx.arc(e.x - r * 0.82, e.y - r * 0.04, r * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(e.x - r * 0.82, e.y - r * 0.04, r * 0.055, 0, Math.PI * 2);
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
  stripedScorpion: drawStripedScorpion,
  duneScorpion: drawDuneScorpion,
  redScorpion: drawRedScorpion,
  // emperorScorpion was here, but it's now a boss (desert-boss-tier-3,
  // see BOSS_DRAW_FUNCTIONS below) — no longer a regular-enemy key.
  piranha: drawPiranha,
  arowana: drawArowana,
  redtailCatfish: drawRedtailCatfish,
  arcticBumblebee: drawArcticBumblebee,
  deerFly: drawDeerFly,
  arcticMoth: drawArcticMoth,
  arcticRinglet: drawArcticRinglet,
  snowScorpionFly: drawSnowScorpionFly,
  arcticBluet: drawArcticBluet,
  polarBumblebee: drawPolarBumblebee,
  snowGroundBeetle: drawSnowGroundBeetle,
  wolfSpider: drawWolfSpider,
  lavaCricket: drawLavaCricket,
  volcanicAshBeetle: drawVolcanicAshBeetle,
  wekiuBug: drawWekiuBug,
  landIguana: drawLandIguana,
  pinkIguana: drawPinkIguana,
  lavaIguana: drawLavaIguana,
  velvetAnt: drawVelvetAnt,
  volcanicLonghornBeetle: drawVolcanicLonghornBeetle,
  fireLovingBeetle: drawFireLovingBeetle,
  bat: drawBat,
  moth: drawMoth,
  fungusGnat: drawFungusGnat,
  oilbird: drawOilbird,
  swiftlet: drawSwiftlet,
  whiteCollaredSwift: drawWhiteCollaredSwift,
  caveSwallow: drawCaveSwallow,
  olm: drawOlm,
  texasBlindSalamander: drawTexasBlindSalamander,
  caveShrimp: drawCaveShrimp,
  oakleafButterfly: drawOakleafButterfly,
  deadleafMantis: drawDeadleafMantis,
  bufftipMoth: drawBufftipMoth,
  orbWeaver: drawOrbWeaver,
  easternRedBat: drawEasternRedBat,
  redEasternScreechOwl: drawRedEasternScreechOwl,
  snailFish: drawSnailFish,
  rattailFish: drawRattailFish,
  giantCuskEel: drawGiantCuskEel,
  spinyStar: drawSpinyStar,
  giantSeaSpider: drawGiantSeaSpider,
  fragilePinkSeaUrchin: drawFragilePinkSeaUrchin,
};

const BOSS_DRAW_FUNCTIONS = {
  'forest-boss-tier-1': drawQueenAnt,
  'forest-boss-tier-2': drawLonghornBeetle,
  'marsh-boss-tier-1': drawFrogBoss,
  'marsh-boss-tier-2': drawMilitaryHelmetSnail,
  // marsh-boss-tier-3 (Electric Eel) was here, but it joined the
  // millipede-body family (MILLIPEDE_FAMILY_KEYS) and renders through
  // renderMillipedeBody() instead — same as every snake, none of which
  // have an entry here either (their Sandbox-menu tile icon falls back to
  // drawFallbackCircle, same precedent this follows).
  'desert-boss-tier-1': drawDesertTermite,
  'desert-boss-tier-2': drawBlueDeathBeetle,
  'desert-boss-tier-3': drawEmperorScorpion, // retrofit — reuses the same art, just a boss now
  'ocean-boss-tier-1': drawReefShark,
  'ocean-boss-tier-2': drawHammerhead,
  'ocean-boss-tier-3': drawGreatWhite,
  'tundra-boss-tier-1': drawArcticFritillary,
  'tundra-boss-tier-2': drawArcticWoollyBearMoth,
  'tundra-boss-tier-3': drawGiantArcticWolfSpider,
  'volcano-boss-tier-1': drawHaleakalaMecyclothoraxBeetle,
  'volcano-boss-tier-2': drawMarineIguana,
  'volcano-boss-tier-3': drawNamibDesertBeetle,
  'caves-boss-tier-1': drawCaveMidge,
  'caves-boss-tier-2': drawBlindCavefish,
  'deepSea-boss-tier-1': drawWhalefish,
  'deepSea-boss-tier-2': drawCaliforniaSunStar,
  'hollow-boss-tier-1': drawMournfulSphinx,
  'hollow-boss-tier-2': drawHollowCrow,
};

function drawFallbackCircle(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemyShape(ctx, enemy) {
  // Armored beetles no longer have any per-terrain art override — see
  // this file's own "per-terrain armored reskins (REMOVED)" comment
  // further up. Every terrain that still spawns them (Deep Forest/
  // Savanah/Volcanic) just falls through to the normal lookup below, same
  // literal beetle art ENEMY_DRAW_FUNCTIONS already has.
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
  // segmentCount 8 -> 14 and spacingFactor 1.0 -> 1.1 (same follow-up as
  // the radius bump above): combined with the bigger radius, total
  // head-to-tail length goes from 13*1.0*8=104px to 19*1.1*14≈293px, a
  // ~2.8x longer body — "way longer," not just a bigger head. No change
  // needed to the trail-following math itself (renderMillipedeBody/
  // getTrailPointAtDistance/recordTrailPoint's own maxPoints calc) — it
  // already derives everything from these two numbers plus enemy.radius,
  // so the longer body tracks waypoints/corners exactly as correctly as
  // every other snake already does, just over a longer arc length.
  anaconda: { segmentCount: 14, spacingFactor: 1.1, segmentDrawFn: drawAnacondaSegment },
  'marsh-boss-tier-3': { segmentCount: 7, spacingFactor: 1.0, segmentDrawFn: drawElectricEelSegment },
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
// belly highlight down the underside on every type, plus (segment 0, the
// head, only) a pair of eyes and an occasionally-flicking forked tongue
// so the head end reads as a snake's at a glance regardless of which of
// the 4 types it is.
//
// Enemy-art realism pass (direct request: "redesign each one's canvas art
// to actually look like its real-world namesake... not just a
// recognizable blob in roughly the right color"): before this, all 4 of
// Deep Forest's snakes routed through here with `scaled` either on or off
// and were otherwise visually IDENTICAL but for color/size — exactly the
// "shared helper at the cost of per-species accuracy" bug the user's own
// olm/Texas-blind-salamander report (see drawOlm/drawTexasBlindSalamander
// below) already flagged once before. `pattern` replaces that single
// boolean with each snake's own real, distinguishing marking:
//   - 'stripes'  (Gardener Snake): a garter snake's own single most
//     recognizable trait — a pale dorsal stripe plus two lateral ones
//     running the full body length, not a blotched or plain snake at all.
//   - 'blotches' (Anaconda): a real green anaconda's own signature
//     marking — large dark saddle-shaped blotches down the back,
//     alternating side to side, with small pale eye-spot flecks along the
//     flanks — plus a visibly BULKIER cross-section than the other 3,
//     since anacondas are the most massive-bodied snake species in the
//     world by weight, not merely "longer" (the earlier "way longer"
//     follow-up already made it longer and gave it a bigger head radius;
//     this adds the "thicker barrel of a body" half of that same real
//     trait, on top of the per-segment pattern).
//   - 'plated'   (Armored Snake): not a real species — its own spec calls
//     for a visibly armored/plated look, now 2 overlapping scutes per
//     segment (was 1) for a clearer armadillo/pangolin-style banded read.
//   - 'plain'    (Banana Snake): no real "banana snake" species exists to
//     match a pattern to — kept smooth/unpatterned (its own bright,
//     uniform yellow is already its real distinguishing trait) rather
//     than inventing a fictional marking.
function drawSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, pattern, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);

  const bulky = pattern === 'blotches';
  const bodyRx = bulky ? radius * 1.35 : radius * 1.15;
  const bodyRy = bulky ? radius * 0.95 : radius * 0.75;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyRx, bodyRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // Every real snake's underside reads paler than its back — drawn first,
  // underneath, on every type (even Banana Snake's otherwise-unpatterned
  // body) rather than only on the ones with a pattern.
  ctx.fillStyle = shadeColor(color, 30);
  ctx.beginPath();
  ctx.ellipse(0, bodyRy * 0.45, bodyRx * 0.85, bodyRy * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  if (pattern === 'plated') {
    ctx.fillStyle = shadeColor(color, -25);
    const baseOffset = segmentIndex % 2 === 0 ? -radius * 0.3 : radius * 0.3;
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(baseOffset + side * radius * 0.35, -radius * 0.05);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-radius * 0.26, -radius * 0.26, radius * 0.52, radius * 0.52);
      ctx.restore();
    });
  } else if (pattern === 'stripes') {
    ctx.strokeStyle = shadeColor(color, 55);
    ctx.lineWidth = Math.max(1, radius * 0.22);
    ctx.beginPath();
    ctx.moveTo(-bodyRx, 0);
    ctx.lineTo(bodyRx, 0);
    ctx.stroke();
    ctx.strokeStyle = shadeColor(color, 28);
    ctx.lineWidth = Math.max(1, radius * 0.16);
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(-bodyRx, side * bodyRy * 0.55);
      ctx.lineTo(bodyRx, side * bodyRy * 0.55);
      ctx.stroke();
    });
  } else if (pattern === 'blotches') {
    ctx.fillStyle = shadeColor(color, -35);
    const side = segmentIndex % 2 === 0 ? -1 : 1;
    ctx.beginPath();
    ctx.ellipse(side * bodyRx * 0.08, -bodyRy * 0.1, bodyRx * 0.48, bodyRy * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8d44d';
    ctx.beginPath();
    ctx.arc(side * bodyRx * 0.55, bodyRy * 0.6, bodyRx * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }

  if (segmentIndex === 0) {
    ctx.fillStyle = '#1a1a1a';
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.arc(bodyRx * 0.55, side * bodyRy * 0.45, radius * 0.12, 0, Math.PI * 2);
      ctx.fill();
    });
    // The tongue only flicks out part of the time, not every frame —
    // reads as a periodic flick rather than a permanently-extended prop.
    if (Math.sin(time * 8) > 0.3) {
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bodyRx, 0);
      ctx.lineTo(bodyRx * 1.3, 0);
      ctx.moveTo(bodyRx * 1.3, 0);
      ctx.lineTo(bodyRx * 1.45, -radius * 0.12);
      ctx.moveTo(bodyRx * 1.3, 0);
      ctx.lineTo(bodyRx * 1.45, radius * 0.12);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// Deep Forest's 4 snakes (direct request) all share drawSnakeSegment()
// above — these thin wrappers are what MILLIPEDE_BODY's segmentDrawFn
// actually points at, since that field takes a plain
// (ctx, x, y, radius, color, heading, segmentIndex, time) function and
// `pattern` isn't part of that generic signature, so each type's own
// real marking is baked in here instead of threaded through the whole
// shared mechanism for every caller's benefit.
function drawGardenerSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, time) {
  drawSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, 'stripes', time);
}
function drawBananaSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, time) {
  drawSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, 'plain', time);
}
function drawArmoredSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, time) {
  drawSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, 'plated', time);
}
function drawAnacondaSegment(ctx, x, y, radius, color, heading, segmentIndex, time) {
  drawSnakeSegment(ctx, x, y, radius, color, heading, segmentIndex, 'blotches', time);
}

// Electric Eel's own segment — shares drawSnakeSegment's basic "elongated
// ellipse with a lighter belly stripe" body plan (same per-segment look
// every snake above uses) but with its own simpler head (a single eye, no
// forked tongue — a fish, not a reptile) and a pale-yellow glowing stripe
// instead of a plain highlight, matching the standalone glow look this
// boss had before it joined the millipede family.
function drawElectricEelSegment(ctx, x, y, radius, color, heading, segmentIndex) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.15, radius * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f4d03f';
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.1, radius * 0.95, radius * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  if (segmentIndex === 0) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(radius * 0.7, -radius * 0.15, radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// The millipede-family renderer: draws the head at the enemy's own (x, y)/
// heading like any other enemy, then walks the trail to place each
// trailing segment at a fixed arc-length distance behind it, each with its
// own heading computed from the segment just ahead of it — this is what
// actually produces the "curls around corners" look instead of the whole
// body snapping to one rotation.
// Slither (direct request, applies to every snake/eel-type enemy — this
// whole shared-body system already exists ONLY for MILLIPEDE_FAMILY_KEYS
// members, so nothing new to gate or configure per type): "the body
// visibly undulates side to side along its length as it advances, not a
// rigid shape translating in a straight line." Each segment gets its own
// small sideways offset, PERPENDICULAR to its own local heading, from a
// sine wave that travels down the body over time (phased by segment
// index, same "wave with a per-segment phase offset" technique this
// project's own grass/seaweed sway already uses elsewhere) — the classic
// traveling S-curve a real snake's body shows while moving. Scales with
// the enemy's own radius so a tiny Gardener Snake and a huge Anaconda
// both read as a proportional wiggle rather than the same fixed pixel
// amount looking enormous on one and invisible on the other.
const SLITHER_SPEED = 6;
const SLITHER_WAVELENGTH = 0.9;

function renderMillipedeBody(ctx, enemy, time) {
  const body = MILLIPEDE_BODY[enemy.enemyKey] || DEFAULT_MILLIPEDE_BODY;
  const draw = body.segmentDrawFn || drawMillipedeSegment;
  const spacing = enemy.radius * body.spacingFactor;
  const amplitude = enemy.radius * 0.35;

  const headWave = Math.sin(time * SLITHER_SPEED) * amplitude;
  const headX = enemy.x - Math.sin(enemy.heading) * headWave;
  const headY = enemy.y + Math.cos(enemy.heading) * headWave;
  draw(ctx, headX, headY, enemy.radius, enemy.color, enemy.heading, 0, time);

  let prevX = headX;
  let prevY = headY;
  for (let i = 1; i <= body.segmentCount; i += 1) {
    const point = getTrailPointAtDistance(enemy, i * spacing);
    const heading = Math.atan2(point.y - prevY, point.x - prevX) + Math.PI; // facing back toward the segment ahead
    const wave = Math.sin(time * SLITHER_SPEED - i * SLITHER_WAVELENGTH) * amplitude;
    const waveX = point.x - Math.sin(heading) * wave;
    const waveY = point.y + Math.cos(heading) * wave;
    const taper = Math.max(0.4, 1 - i * 0.09);
    draw(ctx, waveX, waveY, enemy.radius * taper, enemy.color, heading, i, time);
    prevX = waveX;
    prevY = waveY;
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

// Hop (direct request, applies to every frog-type enemy — not Tadpole or
// Frog Larva, both legless/larval and still swimming rather than
// hopping; checked against the full roster, not just memory of it, per
// the request's own instruction). A periodic jump arc — rises and falls
// with each stride rather than smoothly sliding along its route — with a
// brief squash on landing.
//
// REVISED on direct follow-up ("frogs should be completely stationary
// between hops... right now it sounds like they're continuously sliding
// forward with a hop animation layered on top"). The first version only
// ever added a render-time visual bob/squash on top of the enemy's own
// continuously-advancing position — a real hop needs the ACTUAL movement
// gated to the airborne portion of the cycle too, with a genuine pause
// at ground level in between, not just a soft landing. getHopState()
// below is the single source of truth both updateEnemies() (gates how
// far this frame's movement actually advances) and renderEnemies() (the
// visual lift/squash) read, so the two always agree: it's airborne, and
// only airborne, exactly when it's actually moving. Each enemy's own
// hopSeed (set once at spawn, see createEnemyInstance) phases its cycle
// so multiple frogs hopping at once don't all land in lockstep.
const HOPPING_ENEMY_KEYS = new Set(['froglet', 'marsh-boss-tier-1']);
// Seconds per full hop-then-rest cycle, and the fraction of that cycle
// actually spent airborne/moving — the rest is the real pause at ground
// level the follow-up asked for. During the airborne window, movement
// speed is boosted by 1/HOP_AIRBORNE_FRACTION so the enemy's own
// configured speed stat still determines its AVERAGE progress over a
// full cycle (same "reasonable forward progress over time" the request
// asked for), rather than quietly becoming far slower than every other
// enemy just because it spends part of each cycle motionless.
const HOP_PERIOD = 0.9;
const HOP_AIRBORNE_FRACTION = 0.35;

// How much of the cycle right after touchdown still shows a brief
// landing squash, as a fraction of the full HOP_PERIOD.
const HOP_SQUASH_WINDOW = 0.12;

// A self-contained clock, local to this file and advanced by
// updateEnemies() below using the exact same deltaSeconds game.js's own
// animationTime already advances by — deliberately NOT reading
// animationTime directly (a game.js global): enemies.js's own light test
// harness loads this file without game.js at all, and every other
// per-frame value this file hands between its own render/update
// functions (renderEnemies' own `time` parameter, etc.) is already
// passed explicitly rather than read off a cross-file global, so this
// keeps getHopState() consistent with that and independently testable.
let enemyMovementClock = 0;

function getHopState(enemy, time) {
  const cyclePos = ((time + enemy.hopSeed) % HOP_PERIOD) / HOP_PERIOD; // 0 -> 1 across each cycle
  const isAirborne = cyclePos < HOP_AIRBORNE_FRACTION;
  const liftProgress = isAirborne ? cyclePos / HOP_AIRBORNE_FRACTION : 0; // 0 -> 1 across just the airborne window
  const lift = isAirborne ? Math.sin(liftProgress * Math.PI) : 0; // rises then falls, 0 at both ends of the hop

  const sinceLanding = isAirborne ? 1 : (cyclePos - HOP_AIRBORNE_FRACTION) / HOP_SQUASH_WINDOW;
  const squash = !isAirborne && sinceLanding < 1 ? (1 - sinceLanding) * 0.18 : 0;

  return { isAirborne, lift, squash };
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
      if (HOPPING_ENEMY_KEYS.has(enemy.enemyKey)) {
        const { lift, squash } = getHopState(enemy, time);
        const stretch = lift * 0.15; // a touch taller/thinner mid-air
        ctx.translate(enemy.x, enemy.y - lift * enemy.radius * 0.6);
        ctx.scale(1 - stretch * 0.5 + squash * 0.5, 1 + stretch - squash);
        ctx.translate(-enemy.x, -enemy.y);
      }
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

    // Arctic Willow's Brittle Path full freeze gets its own distinct
    // look too — a cold icy-blue glow (same shadowBlur-glow technique
    // Infect Path's own stun uses just above, blue instead of green)
    // plus a few small angular ice-shard marks, so "frozen" reads as its
    // own thing rather than blending into Tanglement's dashed ring or
    // Infect Path's mold patches.
    if (enemy.frozenRemaining > 0) {
      ctx.save();
      ctx.shadowColor = '#4fc3f7';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#b3e5fc';
      [[-0.45, -0.35], [0.35, -0.2], [0, 0.4]].forEach(([dx, dy]) => {
        const sx = enemy.x + dx * enemy.radius;
        const sy = enemy.y + dy * enemy.radius;
        ctx.beginPath();
        ctx.moveTo(sx, sy - enemy.radius * 0.16);
        ctx.lineTo(sx + enemy.radius * 0.1, sy);
        ctx.lineTo(sx, sy + enemy.radius * 0.16);
        ctx.lineTo(sx - enemy.radius * 0.1, sy);
        ctx.closePath();
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
