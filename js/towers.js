// Generic tower + upgrade-path data model.
//
// Rules that apply to every tower:
// - Exactly 3 upgrade paths per tower.
// - Each path is an ordered track of 4 upgrades, bought in order, each pricier
//   than the last.
// - Buying a path's first upgrade locks the tower into that path; the other
//   two paths become unavailable for that tower instance (no switching).
//
// A path that hasn't been designed yet is represented as `null` in
// `upgradePaths` rather than omitted, so every tower visibly has 3 slots.

const TOWER_TYPES = {
  sunflower: {
    name: 'Sunflower',
    baseStats: {
      damage: 5,
      size: 20,
      color: '#e6c229',
      range: 170, // px — baseline pick: covers the path segments nearest a
                  // typical placement without reaching across the whole map.
      attackInterval: 0.6, // seconds between attacks — baseline cadence, not balanced.
    },
    upgradePaths: [
      {
        name: 'Solar Path',
        upgrades: [
          {
            name: 'Glare',
            description: 'Sunflower becomes slightly bigger; damage doubles.',
            cost: 50,
            effects: { sizeMultiplier: 1.15, damageMultiplier: 2 },
          },
          {
            name: 'Precision Rays',
            description: 'Damage increases 1.5x; sunflower gains a ray/beam attack and a small fire mark on its face.',
            cost: 250,
            effects: { damageMultiplier: 1.5, attackType: 'ray', fireMark: true },
          },
          {
            name: 'Sun Ray',
            description: 'Sunflower glows yellow; damage doubles again.',
            cost: 650,
            effects: { damageMultiplier: 2, glow: '#ffe066' },
          },
          {
            name: 'Solar Ray',
            description:
              'Sunflower turns neon; its ray ignites bugs it hits, dealing burn damage over time.',
            cost: 1500,
            effects: {
              color: '#39ff14',
              burn: { damagePerSecond: 10, duration: 5 },
            },
          },
        ],
      },
      {
        name: 'Fire Path',
        upgrades: [
          {
            name: 'Spark',
            description: 'Attack speed doubles; sunflower becomes slightly smaller and gains a small flame on its head.',
            cost: 50,
            effects: { attackIntervalMultiplier: 0.5, sizeMultiplier: 0.8, flame: 'small' },
          },
          {
            // No name given in the spec — picked to fit the magma-puddle
            // mechanic this upgrade introduces (the sunflower's building
            // internal heat, about to start erupting).
            name: 'Molten Core',
            description:
              'Sunflower turns more orange; attack speed increases further (2.67x from base); damage doubles; ' +
              'periodically spits a magma puddle that burns bugs standing in it.',
            cost: 300,
            effects: {
              color: '#ff7043',
              // Balance pass (direct request — see getRoundScaling()'s own
              // comment in enemies.js for the full writeup): this used to
              // be another flat 0.5x (a second full speed-doubling, on top
              // of Spark's own), combining with this path's three separate
              // damageMultiplier:2 tiers (8x total) for a ~32x DPS
              // multiplier from base before the puddle/orbit AoE are even
              // counted — dramatically ahead of Solar Path's ~6x and Storm
              // Path's ~2.5x for comparable total cost, the clearest
              // single outlier found while reviewing all 4 towers' paths.
              // Softened to 0.75x (interval chain becomes 0.5 * 0.75 =
              // 0.375, i.e. 2.67x speed instead of 4x) — still the
              // fastest-attacking Sunflower path by a wide margin once the
              // puddle/orbit AoE are added back in, just no longer in a
              // different league entirely.
              attackIntervalMultiplier: 0.75,
              damageMultiplier: 2,
              // Baseline numbers, not balanced/tuned: a puddle every 5s,
              // lasting 2.5s, dealing 12 dmg/s to anything standing in its
              // 40px radius.
              puddle: { interval: 5, duration: 2.5, damagePerSecond: 12, radius: 40 },
            },
          },
          {
            name: 'Flamewall',
            description: 'Sunflower grows 3x in size and is engulfed in a large flame; damage doubles again.',
            cost: 1000,
            effects: { sizeMultiplier: 3, flame: 'large', damageMultiplier: 2 },
          },
          {
            name: 'Wildfire',
            description:
              "Sunflower's attack becomes a thrown fireball; damage doubles again; " +
              'gains fireball embers that continuously orbit it, burning any bug they touch.',
            cost: 2500,
            effects: {
              attackType: 'fireball',
              damageMultiplier: 2,
              // Baseline numbers, not balanced/tuned: 3 embers circling at
              // 65px radius (kept outside Flamewall's ~53px flame so they
              // stay visible instead of blending into it), one full orbit
              // every 2s, each dealing 15 dmg/s to anything within 8px of it.
              orbit: { count: 3, radius: 65, angularSpeed: Math.PI, damagePerSecond: 15, emberRadius: 8 },
            },
          },
        ],
      },
      {
        // No name given in the spec, only the 4 upgrades (electric/lightning-
        // themed) — picked to match the "Solar Path"/"Fire Path" convention
        // (a weather/element name + "Path") rather than something literal
        // like "Electric Path".
        name: 'Storm Path',
        upgrades: [
          {
            name: 'Jolt',
            description:
              'Sunflower turns a brighter yellow and crackles with small electric sparks; attack speed increases 15%.',
            cost: 25,
            // "+15% faster" etc. below all mean new_interval = old_interval / (1 + pct) —
            // same "on top of current" multiplicative stacking as Solar/Fire's
            // attackIntervalMultiplier, just expressed as a speed percentage
            // instead of a flat multiplier since that's how the spec states it.
            effects: { color: '#fff176', sparks: 'small', attackIntervalMultiplier: 1 / 1.15 },
          },
          {
            name: 'Shock',
            description: 'Sunflower glows yellow; attack speed increases another 50% (on top of Jolt).',
            cost: 100,
            effects: { glow: '#fff59d', attackIntervalMultiplier: 1 / 1.5 },
          },
          {
            name: 'Conductor',
            description:
              "A lightning-bolt mark appears on the sunflower's head; attack speed increases another 15%; range " +
              'doubles; periodically arcs a single-target jolt at the closest bug in range.',
            cost: 300,
            effects: {
              boltMark: true,
              attackIntervalMultiplier: 1 / 1.15,
              rangeMultiplier: 2,
              // Baseline numbers, not balanced/tuned: a 7-damage jolt at the
              // single closest enemy in range, once a second — single-target,
              // distinct from Fire Path's puddle (which is area-based).
              spark: { interval: 1, damage: 7 },
            },
          },
          {
            name: 'Shockwave',
            description:
              'Sunflower doubles in size and gathers spinning storm clouds; attack speed increases another 25%; ' +
              'periodically unleashes a lightning shockwave that strikes every bug in range at once.',
            cost: 750,
            effects: {
              sizeMultiplier: 2,
              attackIntervalMultiplier: 1 / 1.25,
              // Baseline numbers, not balanced/tuned: a 15-damage pulse
              // hitting every enemy currently in range (true AoE) — distinct
              // from, and stacks alongside, Conductor's single-target jolt
              // above: buying this doesn't replace that effect, both keep
              // ticking independently once both are owned.
              shockwave: { interval: 2.5, damage: 15 },
              // Purely visual (like Fire Path's orbiting embers, but with no
              // damage of their own) — the clouds just spin; the shockwave's
              // own damage pulse is a separate visual (see shockwavePulse in
              // game.js), not tied to the clouds.
              clouds: { count: 3, radius: 58, angularSpeed: Math.PI * 0.6 },
            },
          },
        ],
      },
    ],
  },
  rose: {
    name: 'Rose',
    baseStats: {
      damage: 4, // doubled from the original 2 in a balance pass — base stat only, flows through the existing damageMultiplier chain same as before
      size: 18, // starts a touch smaller than the Sunflower; Thorns' own sizeMultiplier grows it from here
      color: '#c2185b',
      range: 170, // unspecified by the brief — matches Sunflower's baseline rather than inventing a different number
      attackInterval: 0.6, // same baseline cadence as Sunflower; the base attack is a thrown petal like Sunflower's, just weaker — the vines (once grown) are the Rose's real draw
    },
    upgradePaths: [
      {
        // Not named in the spec, only the 4 upgrades (thorn-vine themed) —
        // picked to match the existing "<theme> Path" convention.
        name: 'Thorn Path',
        upgrades: [
          {
            name: 'Thorns',
            description:
              'Rose grows a thorn vine that lashes a nearby bug once a second for 2 damage — a second, separate ' +
              "attack alongside the Rose's normal one, not a replacement for it; flower head grows 10%.",
            cost: 100,
            effects: {
              // Introduces the vine subsystem once, at its own starting
              // damage/cadence — addVines (below) is what actually grows the
              // vine count, here and on every later tier of this path, so a
              // future tower/path could reuse either independently.
              vine: { damage: 2, interval: 1 },
              addVines: 1,
              sizeMultiplier: 1.1,
            },
          },
          {
            name: 'Puncture',
            description:
              'A second vine grows, each now bristling with more thorns; rose grows 25% bigger; damage doubles ' +
              '(the base attack and every vine alike).',
            cost: 500,
            effects: { addVines: 1, moreThorns: true, sizeMultiplier: 1.25, damageMultiplier: 2 },
          },
          {
            name: 'Overgrowth',
            description:
              'Three more vines grow (5 total); rose grows 50% bigger; vines reach twice as far; damage doubles again.',
            cost: 1250,
            // vineRangeMultiplier is a real mechanical range boost for the
            // vines specifically (not just a visual flourish) — judgment
            // call per the brief, since "how far the vines reach" reads as
            // gameplay-relevant once there's an actual attack tied to them.
            effects: { addVines: 3, sizeMultiplier: 1.5, vineRangeMultiplier: 2, damageMultiplier: 2 },
          },
          {
            name: 'Vigorous',
            description: 'Three more vines grow (8 total); the stem grows taller; damage doubles once more.',
            cost: 2250,
            effects: { addVines: 3, tallStem: true, damageMultiplier: 2 },
          },
        ],
      },
      {
        // Named "Root Path" to match the "<theme> Path" convention already
        // set by Thorn Path — kept as-is now that all 4 tiers are in (it
        // was only ever provisional for being incomplete, not for being
        // the wrong name).
        name: 'Root Path',
        upgrades: [
          {
            name: 'Rooting',
            description:
              '3 root traps sprout along the path near the Rose; the first bug to step on one takes 2 damage ' +
              "(single-use — each root is spent after one hit); the Rose's own attack damage increases 1.5x.",
            cost: 150,
            effects: {
              damageMultiplier: 1.5,
              // count/damage only — where exactly they land is worked out
              // at purchase time (see spawnRoseRoots()), since it depends
              // on the tower's own position and the map's path shape, not
              // anything fixed in this data.
              roots: { count: 3, damage: 2 },
            },
          },
          {
            name: 'Rootbound',
            description:
              'Damage doubles; 2 more root traps sprout nearby (5 total); the Rose itself sprouts visible roots ' +
              'from its own body.',
            cost: 750,
            effects: {
              damageMultiplier: 2,
              roots: { count: 2, damage: 2 },
              bodyRootGrowths: true, // visual-only — roots growing out of the plant itself, not a ground trap
            },
          },
          {
            name: 'Tanglement',
            description:
              'Damage doubles again; 5 more root traps sprout nearby (10 total); every root now has a 15% ' +
              'chance to also grab the bug that steps on it — on top of its normal 2 damage, not instead of it ' +
              '— holding it in place for 2s and dealing 10 extra damage; two small rose-bud growths appear on ' +
              'the body; the Rose grows to a massive 11.5x its size.',
            cost: 2000,
            effects: {
              damageMultiplier: 2,
              roots: { count: 5, damage: 2 },
              // Deliberately additive, not a replacement for the base
              // trigger — see updateTowerRoots() in game.js. chance/damage/
              // duration bundled into one effect since they're introduced
              // together and nothing before this tier has any of them.
              rootGrab: { chance: 0.15, damage: 10, duration: 2 },
              bodyFlowerGrowths: 2, // additive — Stranglement adds 2 more on top of these
              sizeMultiplier: 11.5, // a big, deliberate number per the user, not a typo
            },
          },
          {
            name: 'Stranglement',
            description:
              '15 more root traps sprout nearby (25 total); two more rose-bud growths appear on the body (4 ' +
              "total); the body's root growths lengthen. No further damage multiplier at this tier.",
            cost: 5000,
            effects: {
              roots: { count: 15, damage: 2 },
              bodyFlowerGrowths: 2,
              longThorns: true, // lengthens Rootbound's body-root growths — see the note by drawRoseBodyRoots()
            },
          },
        ],
      },
      {
        // Not named in the spec — picked to describe the path's signature
        // new mechanic (a ranged thorn-shooting attack), matching the
        // "<theme> Path" convention the other two paths already use.
        name: 'Projectile Path',
        upgrades: [
          {
            name: 'Poke',
            description:
              "Rose's attack damage increases 1.5x. (Thorn Path's vines would grow 2x longer here, but Path 1 " +
              'and Path 3 are mutually exclusive — on a Projectile Path Rose there are never any vines to ' +
              'lengthen, so this has no visible effect; included for data completeness, not a bug.)',
            cost: 50,
            effects: { damageMultiplier: 1.5, vineRangeMultiplier: 2 },
          },
          {
            name: 'Projectiles',
            description:
              'Rose gains a new ranged attack: shoots a thorn at the nearest bug for 2 damage every 1.5s, ' +
              "alongside its normal attack; the Rose's own (base) attack speed increases 20%. (Also: more " +
              'thorns would grow on the vines here — same inert caveat as Poke.)',
            cost: 250,
            effects: {
              // Introduces the thorn-shot subsystem once, at its own
              // starting damage/cadence — same pattern Thorn Path's `vine`
              // effect used for vines.
              thornShot: { damage: 2, interval: 1.5 },
              attackIntervalMultiplier: 1 / 1.2,
              moreThorns: true, // inert without vines — see Poke's note
            },
          },
          {
            name: 'Even More Projectiles',
            description:
              'The thorn-shot attack now fires 3 thorns at once instead of 1 (interpreted as "more thorns per ' +
              'volley", not a faster cadence); base attack speed increases another 20%; Rose turns greenish.',
            cost: 450,
            effects: { thornShotCountMultiplier: 3, attackIntervalMultiplier: 1 / 1.2, color: '#6b8e4e' },
          },
          {
            name: 'Poison Projectiles',
            description:
              'Shot thorns now poison on hit, dealing 5 damage/sec for 3 seconds; Rose turns fully green; ' +
              'damage doubles (base attack and thorn-shot alike, the usual shared multiplier).',
            cost: 850,
            effects: {
              thornShotPoison: { damagePerSecond: 5, duration: 3 },
              color: '#2e7d32',
              damageMultiplier: 2,
            },
          },
        ],
      },
    ],
  },
  mushroom: {
    name: 'Mushroom',
    baseStats: {
      damage: 3,
      size: 18,
      color: '#a1887f', // plain tan cap — Decay is the first upgrade to actually turn it green
      range: 170, // unspecified by the brief — matches Sunflower/Rose's own baseline rather than inventing a new number
      attackInterval: 1, // "every second" baseline, as specified
    },
    upgradePaths: [
      {
        // Not named in the spec — picked to describe the path's signature
        // mechanic (decay/rot, culminating in the zombie mechanic),
        // matching the "<theme> Path" convention the other towers use.
        name: 'Decay Path',
        upgrades: [
          {
            name: 'Decay',
            description:
              'Bugs hit by spores turn pale and take 1 damage/sec for 5 seconds, on top of the direct hit; ' +
              'Mushroom turns green and grows slightly taller.',
            cost: 250,
            // Reuses the exact same burn shape/pipeline Solar Path's Solar
            // Ray already introduced — applyBurn()/resolveProjectile()
            // don't care which tower's projectile carries it.
            effects: { burn: { damagePerSecond: 1, duration: 5 }, color: '#4caf50', capHeightMultiplier: 1.15 },
          },
          {
            name: 'Zombify',
            description:
              'When a spore lands the killing blow on a non-boss bug (never any other damage source), 20% ' +
              'chance it rises as a zombie instead of dying outright — shambling backward toward the path’s ' +
              'start until it either collides with a living bug (dealing 3 damage and exploding) or reaches the ' +
              'start (exploding harmlessly off-screen); Mushroom turns darker green, looks a little decayed, ' +
              'and grows taller again.',
            cost: 750,
            effects: { zombifyChance: 0.2, zombieExplosionDamage: 3, color: '#2e7d32', capHeightMultiplier: 1.15 },
          },
          {
            name: 'Undead Army',
            description:
              'Spore damage increases 2.5x; zombify chance rises to 30% (replacing 20%, not stacking with it); ' +
              'Mushroom gains a skull on its head and gas wafts off its body.',
            cost: 1750,
            effects: { damageMultiplier: 2.5, zombifyChance: 0.3, hasSkull: true, gasColor: '#66bb6a' },
          },
          {
            name: 'Necro-Mush',
            description:
              'Damage doubles again; zombify chance rises to 50% (replacing 30%); a zombie’s explosion now ' +
              'deals 10 damage instead of 3; Mushroom and its gas both turn purple.',
            cost: 2250,
            effects: {
              damageMultiplier: 2,
              zombifyChance: 0.5,
              zombieExplosionDamage: 10,
              color: '#6a1b9a',
              gasColor: '#9c27b0',
            },
          },
        ],
      },
      {
        // Named explicitly by the user this time, unlike Decay Path's
        // invented name. An AURA path — unlike every other upgrade in the
        // game so far, it doesn't buff the Mushroom itself, it buffs
        // *other* towers within the Mushroom's own range. Each tier's aura
        // REPLACES the previous tier's with its own complete, absolute
        // spec (owning "Power" means nearby towers get exactly 1.5x
        // damage, full stop) rather than compounding tier over tier — a
        // direct design call: the numbers don't cleanly compound (0.8x
        // then 0.7x isn't a clean product of anything; 1.5x/1.5x then a
        // clean 2x at the top read as deliberately-chosen final values,
        // not products of prior tiers), so this doesn't try to force the
        // "on top of current" stacking every other multiplier-based
        // effect in this file uses — see purchaseUpgrade()'s `aura`
        // handling. "Towers in range" uses the Mushroom's own attack-range
        // stat as the aura radius (the same number serves both purposes),
        // which is also why the Range/Fungus Juice tiers widen the
        // Mushroom's own range to match. Multiple Enable-Path Mushrooms
        // overlapping the same tower never stack — the strongest single
        // aura wins (ranked by tier owned, simplest unambiguous rule
        // since each later tier is a strict upgrade over the one before
        // it), not a multiplicative combination of both — see
        // getStrongestAuraFor() in game.js, which is also where the aura
        // is actually applied each tick (every stat here is cosmetic/data
        // only; nothing about the buff lives permanently on the buffed
        // tower).
        name: 'Enable Path',
        upgrades: [
          {
            name: 'Speed',
            description:
              'Towers within this Mushroom’s range attack 20% faster (0.8x attack interval); Mushroom glows ' +
              'softly with a few drifting spore particles.',
            cost: 200,
            effects: { aura: { attackIntervalMultiplier: 0.8 }, glow: '#80deea', sporeParticles: true },
          },
          {
            name: 'Power',
            description:
              'Towers within range deal 1.5x damage (replaces Speed’s interval bonus, not stacked with it); ' +
              'Mushroom looks sturdier and more vividly colored.',
            cost: 600,
            effects: { aura: { damageMultiplier: 1.5 }, color: '#e65100', capHeightMultiplier: 1.1 },
          },
          {
            name: 'Range',
            description:
              'Towers within range get 1.5x their own attack range (replaces Power’s damage bonus); the ' +
              'Mushroom’s own range — and therefore its aura’s reach — widens to match, its cap visibly ' +
              'broadening with extra gill detail underneath.',
            cost: 1500,
            effects: { aura: { rangeMultiplier: 1.5 }, color: '#fbc02d', capWidthMultiplier: 1.3, gillLines: true },
          },
          {
            name: 'Fungus Juice',
            description:
              'Towers within range get all three at once: 0.7x attack interval, 2x damage, 2x range. The ' +
              'Mushroom’s own range doubles to match; it grows larger and brighter, with a visible spore-cloud ' +
              'ring marking its reach.',
            cost: 5000,
            effects: {
              aura: { attackIntervalMultiplier: 0.7, damageMultiplier: 2, rangeMultiplier: 2 },
              color: '#8e24aa',
              capHeightMultiplier: 1.15,
              capWidthMultiplier: 1.15,
              gasColor: '#ce93d8',
              showAuraRing: true,
            },
          },
        ],
      },
      {
        // Named explicitly by the user. A periodic AoE crowd-control path:
        // once a second, every bug currently within range gets its own
        // independent roll to be stunned — reusing the "periodic effect
        // ticking down its own cooldown" shape Storm Path's
        // Conductor/Shockwave and magma puddles already established, not a
        // new timing mechanism (see updateTowerInfectStun() in game.js).
        // Each tier's chance/duration REPLACES the previous tier's outright
        // (same reasoning/mechanism as Enable Path's aura and Decay's
        // zombifyChance — these are absolute per-tier numbers, not deltas).
        // A stunned bug gets its own distinct "infected" visual (a pulsing
        // green glow + mold flecks — see renderEnemies() in enemies.js),
        // separate from Root Path's immobilize ring so the two effects
        // never visually collide if a bug is ever hit by both at once.
        //
        // Neurological's one-time tower-consumption: confirmed with the
        // user directly — it only fires at the instant of purchase (every
        // *other* tower currently in the Mushroom's range right then is
        // destroyed, no refund; towers placed in range afterward are safe).
        // Implemented as a plain `consumeTowersInRange` flag this path's
        // data carries — the actual removal (and the confirmation prompt
        // before committing to anything destructive/irreversible) happens
        // in game.js's activateRegion, which is the one place that already
        // has both the global towers list and the player's input.
        name: 'Infect Path',
        upgrades: [
          {
            name: 'Rashy',
            description:
              'Every second, each bug within range independently has a 10% chance to stop moving (stunned) for ' +
              '1 second.',
            cost: 300,
            effects: { infectStun: { chance: 0.1, duration: 1 } },
          },
          {
            name: 'Respiratory',
            description:
              'Every second, each bug within range has a 15% chance to stop for 2 seconds (replaces Rashy’s ' +
              'numbers, not stacked with them).',
            cost: 850,
            effects: { infectStun: { chance: 0.15, duration: 2 } },
          },
          {
            name: 'Circulatory',
            description: 'Every second, each bug within range has a 20% chance to stop for 3 seconds.',
            cost: 2000,
            effects: { infectStun: { chance: 0.2, duration: 3 } },
          },
          {
            name: 'Neurological',
            description:
              'Every second, each bug within range has a 30% chance to stop for 5 seconds. One-time effect: the ' +
              'instant this is bought, every other tower currently in range is destroyed — no refund.',
            cost: 5000,
            effects: { infectStun: { chance: 0.3, duration: 5 }, consumeTowersInRange: true },
          },
        ],
      },
    ],
  },
  // A different kind of tower entirely — passive income, no combat. Same
  // generic 3-path/4-upgrade model as every other tower (mutually
  // exclusive paths, cost gates, etc.) even though it never attacks:
  // damage/range/attackInterval are just zeroed out rather than special-
  // cased away, which is what makes updateTowerAttack() in game.js need
  // no Coneflower-specific branch at all — a 0 range means
  // findNearestEnemyInRange() never finds a target, so the attack-firing
  // branch simply never runs. baseIncomeRate (not part of baseStats,
  // same reasoning as zombifyChance/aura below being plain top-level
  // tower fields rather than nested in stats) is the new generic bit:
  // see createTower()'s incomeRate/incomeTickInterval fields and
  // updateTowerIncome() in game.js, which pays out every tower's
  // incomeRate once per incomeTickInterval seconds — Coneflower is just
  // the first tower to ever set incomeRate to something nonzero, not a
  // hardcoded special case.
  //
  // Income is a discrete per-tick payout (incomeRate dollars, once every
  // incomeTickInterval seconds), not a smooth per-second accrual — this
  // is what makes the Overgrowth Path's "X% faster" tiers (below) mean
  // something concrete (a shorter interval between payouts) rather than
  // a vague rate bump, and it's also what the tick-synced "+$X" floating
  // popup (updateTowerIncome()) is actually timed to. For the Quality
  // Path, which never touches incomeTickInterval (stays at its default
  // 1), a flat per-tick amount at a 1-second cadence is numerically
  // identical to the "$X/sec" language its own descriptions use.
  coneflower: {
    name: 'Coneflower',
    baseStats: {
      damage: 0,
      size: 16,
      color: '#b06bc4',
      range: 0,
      attackInterval: 999999,
    },
    baseIncomeRate: 2, // $ per tick (every incomeTickInterval seconds) while a wave is active
    upgradePaths: [
      {
        name: 'Quality Path',
        upgrades: [
          {
            name: 'Quality Control',
            description: 'Grows taller and brighter; income becomes $5/sec (replaces the base rate, not additive).',
            cost: 600,
            effects: { sizeMultiplier: 1.2, glow: '#e0b0ff', income: 5 },
          },
          {
            name: 'High Standard',
            description: 'Grows larger still and sprouts two extra stems; income becomes $12/sec.',
            cost: 1500,
            effects: { sizeMultiplier: 1.3, extraStems: true, income: 12 },
          },
          {
            name: 'Quality Market',
            description: 'Grows taller again and the flower turns gold; income becomes $20/sec.',
            cost: 4500,
            effects: { sizeMultiplier: 1.2, color: '#ffd54f', income: 20 },
          },
          {
            name: 'Perfect Condition',
            description:
              'The flower turns ruby red and sheds a faint red mist drifting down from it; income becomes $35/sec.',
            cost: 8000,
            effects: { color: '#c62828', redMist: true, income: 35 },
          },
        ],
      },
      // User's exact tier wording (quoted in each description) was fairly
      // terse/informal — judgment calls made to turn it into concrete
      // numbers, documented here rather than re-litigated per tier below:
      // plant count doubles tier over tier (1 -> 2 -> 4 -> 8), except the
      // last tier which is explicitly additive ("3 more grow", not
      // "double again") -> 11 total. Only the first tier states a cash
      // amount ("3 cash"), so perPlantCash is set once, there, and never
      // touched again — later tiers only ever mention speed. Total
      // incomeRate is always perPlantCash * numPlants (recomputed
      // whenever either changes, see purchaseUpgrade()), so this path's
      // growing payout comes from growing the plant count, not from
      // repeatedly bumping the per-plant rate. Each tier's "X% faster"
      // compounds on the current incomeTickInterval (tower.stats-style
      // multiplicative stacking, same convention as Sunflower/Rose's own
      // self-buff paths — deliberately NOT the Mushroom-aura/zombifyChance
      // REPLACE convention, since the user's wording reads as each tier
      // adding its own further speedup on top of the last, not restating
      // an absolute new interval).
      {
        name: 'Overgrowth Path',
        upgrades: [
          {
            name: 'Overgrowth',
            description: 'The flower doubles into 2 flowers, each worth $3, and the cash tick comes 25% faster.',
            cost: 300,
            effects: { plantMultiplier: 2, perPlantCash: 3, incomeTickIntervalMultiplier: 0.75 },
          },
          {
            name: 'Splurge',
            description: 'The number of plants doubles again (4 total) and the cash tick comes 30% faster still.',
            cost: 850,
            effects: { plantMultiplier: 2, incomeTickIntervalMultiplier: 0.7 },
          },
          {
            name: 'Surplus',
            description: 'The number of plants doubles again (8 total) and the cash tick comes 25% faster still.',
            cost: 2000,
            effects: { plantMultiplier: 2, incomeTickIntervalMultiplier: 0.75 },
          },
          {
            name: 'Plantation',
            description:
              'The plant grows taller and 3 more spring up (11 total); the cash tick comes 50% faster still.',
            cost: 10000, // balance tweak (direct request): was $5000
            effects: { addPlants: 3, incomeTickIntervalMultiplier: 0.5, tallPlant: true },
          },
        ],
      },
      null, // Path 3 — not yet designed
    ],
  },
  // Prodigies (direct request, reworked from an earlier standalone-tower
  // design to an UPGRADE instead): one ultimate, 4th-tier form per base
  // type (Sunflower/Rose/Mushroom — Coneflower doesn't get one, it's a
  // different kind of tower entirely). Once a tower of one of these 3
  // types reaches tier 4 on its own chosen path, it can be upgraded one
  // more time into this — see getProdigyOption()/activateRegion()'s
  // 'prodigy-upgrade' branch in game.js, which replaces the tower in
  // place (same spot on the field, no separate purchase-and-place step)
  // rather than requiring a brand-new tower. No upgrade paths of their
  // own — they're already the reward for maxing one out, not a tower to
  // max out further — same "every tower visibly has 3 slots" convention
  // as every other tower, just all 3 slots null here. Capped at 1 of each
  // on the field at a time, independently per type (see getProdigyOption()
  // in game.js).
  sunlitConductor: {
    name: 'The Sunlit Conductor',
    cost: 30000, // the price of the Prodigy UPGRADE itself — see getProdigyOption() in game.js
    baseStats: {
      damage: 65,
      size: 32,
      color: '#ffd700',
      range: 200,
      // Direct request: Prodigies attack 2x faster than the literal "once
      // a second" spec reading — 65 damage every 0.5s = 130 dps.
      attackInterval: 0.5,
    },
    baseAttackType: 'ray', // an instant, continuous-reading beam — see createTower()'s own comment
    upgradePaths: [null, null, null],
  },
  mangler: {
    name: 'The Mangler',
    cost: 45000,
    baseStats: {
      damage: 40,
      size: 30,
      color: '#ad1457',
      range: 200,
      // Direct request: Prodigies attack 2x faster — 40 damage every 0.5s
      // = 80 dps continuous, same convention as Sunlit Conductor.
      attackInterval: 0.5,
    },
    // Every 5s: grabs one random non-boss enemy in range, holds it 1s,
    // 50 bonus damage — additive on top of the continuous 80 dps above,
    // not a replacement. The grab's own 5s cadence is untouched by the
    // 2x attack-speed change — "attack" refers to the base continuous
    // attack above, not this separate periodic ability. See
    // updateTowerGrab() in game.js.
    grabInterval: 5,
    grabDamage: 50,
    grabDuration: 1,
    upgradePaths: [null, null, null],
  },
  fungalMess: {
    name: 'The Fungal Mess',
    cost: 60000,
    baseStats: {
      damage: 50,
      size: 30,
      color: '#4a148c',
      range: 200,
      // Mushroom's own natural cadence (every 1s, "every hit" per the
      // spec) would otherwise match TOWER_TYPES.mushroom's own
      // attackInterval directly — halved on top of that per the later
      // direct request that all 3 Prodigies attack 2x faster.
      attackInterval: 0.5,
    },
    // 15% chance a killing blow reanimates the victim as a purple
    // zombie instead of it dying outright — see turnIntoPurpleZombie()
    // in enemies.js and resolveProjectile()'s own reanimateChance roll
    // in game.js (the same shape as Decay Path's zombifyChance roll,
    // deliberately a separate chance/flag so the two never collide).
    reanimateChance: 0.15,
    upgradePaths: [null, null, null],
  },
};

// Keyed by Prodigy typeKey -> the base tower type it's the ultimate
// form of. The one place this mapping lives — getProdigyOption() in
// game.js reads through it (both directions — see its own
// getProdigyTypeKeyFor() helper), so a future Prodigy only needs an
// entry here (plus its own TOWER_TYPES entry with a `cost`) to get the
// generic tier-4-upgrade/singleton-cap treatment for free.
const PRODIGY_BASE_TYPE = {
  sunlitConductor: 'sunflower',
  mangler: 'rose',
  fungalMess: 'mushroom',
};

function createTower(typeKey) {
  const type = TOWER_TYPES[typeKey];
  if (!type) throw new Error(`Unknown tower type: ${typeKey}`);

  return {
    type: typeKey,
    chosenPath: null,
    upgradesPurchased: 0, // count of upgrades bought within the chosen path
    stats: { ...type.baseStats },
    // 'projectile' unless a type states its own baseAttackType (Prodigies
    // only, so far — e.g. the Sunlit Conductor's continuous ray — since
    // every other tower starts as a thrown projectile and only switches
    // via an upgrade effect; Prodigies have no upgrades of their own to
    // do that switch with, so they need to be able to state it up front).
    attackType: type.baseAttackType || 'projectile',
    glow: null,
    burn: null,
    flame: null, // 'small' | 'large' — a visual-only flame overlay
    puddle: null, // magma-puddle config, once bought
    puddleCooldown: 0,
    activePuddles: [], // live puddle instances: {x, y, radius, damagePerSecond, remaining}
    orbit: null, // orbiting-ember config, once bought
    orbitAngle: 0,
    sparks: null, // 'small' — visual-only spark overlay, once bought (Storm Path)
    boltMark: false, // visual-only lightning mark on the flower's head, once bought (Storm Path)
    fireMark: false, // visual-only fire mark on the flower's face, once bought (Solar Path's Precision Rays)
    spark: null, // single-target periodic jolt config, once bought (Storm Path)
    sparkCooldown: 0,
    shockwave: null, // AoE periodic pulse config, once bought (Storm Path)
    shockwaveCooldown: 0,
    shockwavePulse: 0, // seconds left of the shockwave's expanding-ring visual
    clouds: null, // decorative-only orbiting storm-cloud config, once bought (Storm Path)
    cloudsAngle: 0,
    // Thorn vines (Rose's Thorn Path): a second, independent attack that
    // ticks on its own cooldown alongside the tower's normal attack — see
    // updateTowerVines() in game.js. vineCount is literal "how many vines"
    // (added to, not multiplied, by each tier); vineDamage/vineInterval are
    // introduced once by the `vine` effect and then scaled the same way
    // tower.stats.damage is by any later damageMultiplier.
    vineCount: 0,
    vineDamage: 0,
    vineInterval: 0,
    vineCooldown: 0,
    vineRangeMultiplier: 1,
    // Per-vine lash-animation state, one entry per vine (grown alongside
    // vineCount in purchaseUpgrade). { timeRemaining, angle } — set by
    // updateTowerVines() in game.js whenever that specific vine actually
    // hits something, so renderRoseVines() can swing it toward the target
    // and back instead of leaving it at its fixed idle angle.
    vineLashes: [],
    moreThorns: false, // visual-only denser thorn spikes, once bought
    tallStem: false, // visual-only taller stem, once bought
    // Root traps (Rose's Root Path): fixed ground spots near the tower,
    // placed once at purchase time (see spawnRoseRoots()), each one-shot —
    // the first enemy to touch one is damaged and it's removed from this
    // list. { x, y, damage } per entry; checked every frame in game.js's
    // updateTowerRoots().
    roots: [],
    bodyRootGrowths: false, // visual-only roots on the plant's own body, once bought (Rootbound)
    bodyFlowerGrowths: 0, // count of small rose-bud growths on the body, additive (Tanglement/Stranglement)
    longThorns: false, // visual-only — lengthens bodyRootGrowths, once bought (Stranglement)
    // Root grab (Tanglement): a chance, on top of a root's normal hit, to
    // also immobilize the enemy and deal bonus damage — see
    // updateTowerRoots() in game.js and enemy.immobilizedRemaining in
    // enemies.js. All three start at 0/falsy so a Rose without Tanglement
    // never rolls for it.
    rootGrabChance: 0,
    rootGrabDamage: 0,
    rootGrabDuration: 0,
    // Thorn-shot (Rose's Projectile Path): a second, independent ranged
    // attack alongside the base one — same spirit as Thorn Path's vines,
    // just a travel-time projectile instead of a melee-style tick. See
    // updateTowerThornShot()/spawnThornProjectile() in game.js.
    hasThornShot: false,
    thornShotDamage: 0,
    thornShotInterval: 0,
    thornShotCooldown: 0,
    thornShotCount: 1, // projectiles fired per shot, once hasThornShot is true
    thornShotPoison: null, // {damagePerSecond, duration} once bought
    // Mushroom's Decay Path: zombifyChance/zombieExplosionDamage feed into
    // every spore projectile this tower fires (see spawnProjectile() in
    // game.js) — resolveProjectile() rolls the zombify chance itself when
    // a spore's hit is the killing blow. capHeightMultiplier/hasSkull/
    // gasColor are purely visual (drawMushroom()).
    capHeightMultiplier: 1,
    zombifyChance: 0,
    zombieExplosionDamage: 0,
    hasSkull: false,
    gasColor: null,
    // Mushroom's Enable Path: { attackIntervalMultiplier?, damageMultiplier?,
    // rangeMultiplier? } once bought, applied to *other* towers within this
    // Mushroom's range each tick — see game.js's getStrongestAuraFor(). null
    // for every tower that never bought into this path (including Decay/
    // Infect Mushrooms), so "does this tower grant an aura" is just a
    // truthy check.
    aura: null,
    // Enable Path visuals — all purely cosmetic (drawMushroom()). glow
    // (Speed) and capHeightMultiplier (shared with Decay) are already
    // generic fields reused here; these are new to this path.
    sporeParticles: false, // Speed: a couple of small drifting spore flecks, lighter than gasColor's heavier cloud
    capWidthMultiplier: 1, // Range/Fungus Juice: the cap visibly widens
    gillLines: false, // Range and up: extra gill detail under the cap
    showAuraRing: false, // Fungus Juice only: a faint ring at the aura's actual radius
    // Mushroom's Infect Path: { chance, duration } once bought, REPLACED
    // (not compounded) by each later tier the same way Enable Path's aura
    // and Decay's zombifyChance already are — each tier states its own
    // complete absolute numbers, not a delta on the last. Rolled once a
    // second per enemy currently in range — see updateTowerInfectStun() in
    // game.js. infectCooldown is the periodic timer driving that roll
    // (same "don't fire instantly on purchase" convention puddle/spark/
    // shockwave already use). The species drawn also changes per tier —
    // see drawInfectMushroom() in this file — so chosenPath/
    // upgradesPurchased alone (not a separate flag) pick the art once this
    // is non-null.
    infectStun: null,
    infectCooldown: 0,
    attackCooldown: 0, // seconds until this tower can attack again
    target: null, // the enemy it's currently aiming at, if any
    attackFlash: 0, // seconds left of the "just fired" visual pulse
    // Coneflower: $/sec generated while a wave is active (see
    // updateTowerIncome() in game.js) — 0 for every tower type without a
    // baseIncomeRate, which is every type except Coneflower today. Not
    // nested in `stats` for the same reason zombifyChance/aura aren't:
    // each Quality Path tier replaces this outright rather than scaling
    // it, same REPLACE convention as those.
    incomeRate: type.baseIncomeRate || 0, // $ paid out per tick — see updateTowerIncome() in game.js
    // Seconds between income payouts (and the "+$X" popup, which fires on
    // the same tick — see updateTowerIncome()/spawnFloatingText() in
    // game.js). 1 for every tower by default; Coneflower's Overgrowth
    // Path is the only thing that ever shortens it. incomeTickCooldown
    // counts down to the next payout, starting at 1 (not 0) so it doesn't
    // pay out instantly the instant a wave begins — same "don't fire
    // instantly on purchase/activation" convention puddle/infectStun
    // already use.
    incomeTickInterval: 1,
    incomeTickCooldown: 1,
    // Coneflower's Overgrowth Path: incomeRate above is always
    // perPlantCash * numPlants once this path is chosen (recomputed in
    // purchaseUpgrade() whenever either changes) — these two are tracked
    // separately rather than just mutating incomeRate directly because
    // the path's own tiers state "the flower doubles"/"3 more grow" as
    // plant-count changes, not as income-rate changes; incomeRate is a
    // derived value, not the thing each tier directly edits. Irrelevant
    // (stays 1/0) for every tower that never buys into this path.
    numPlants: 1,
    perPlantCash: 0,
    hasTallPlant: false, // Plantation tier only — purely visual (drawConeflower())
    hasExtraStems: false, // Quality Path's High Standard tier and up — purely visual (drawConeflower())
    hasRedMist: false, // Quality Path's Perfect Condition tier only — purely visual (drawConeflower())
    // The Mangler (Rose's Prodigy) only: every grabInterval seconds,
    // grabs one random non-boss enemy in range for grabDamage bonus
    // damage, holding it immobilized for grabDuration — on top of (not
    // instead of) the tower's own normal continuous attack. See
    // updateTowerGrab() in game.js. 0 for every tower without a
    // grabInterval of its own, so the `if (tower.grabInterval > 0)` gate
    // in updateTowerAttack skips everyone else entirely. grabCooldown
    // starts at the full interval, same "don't fire instantly" convention
    // every other periodic effect in this file already uses.
    grabInterval: type.grabInterval || 0,
    grabDamage: type.grabDamage || 0,
    grabDuration: type.grabDuration || 0,
    grabCooldown: type.grabInterval || 0,
    // The Fungal Mess (Mushroom's Prodigy) only: chance, on a killing
    // blow, that the victim reanimates as a purple zombie instead of
    // dying outright — a completely separate state from Decay Path's
    // isZombie (see turnIntoPurpleZombie() in enemies.js for exactly how
    // and why). 0 for every tower without one.
    reanimateChance: type.reanimateChance || 0,
  };
}

// Returns the next purchasable upgrade for a given path, or null if that
// path is undesigned, locked out by a different chosen path, or maxed out.
function getAvailableUpgrade(tower, pathIndex) {
  const type = TOWER_TYPES[tower.type];
  const path = type.upgradePaths[pathIndex];
  if (!path) return null;
  if (tower.chosenPath !== null && tower.chosenPath !== pathIndex) return null;

  const nextIndex = tower.chosenPath === pathIndex ? tower.upgradesPurchased : 0;
  return path.upgrades[nextIndex] || null;
}

function purchaseUpgrade(tower, pathIndex) {
  const upgrade = getAvailableUpgrade(tower, pathIndex);
  if (!upgrade) return false;

  if (tower.chosenPath === null) tower.chosenPath = pathIndex;

  const effects = upgrade.effects;
  if (effects.damageMultiplier) {
    tower.stats.damage *= effects.damageMultiplier;
    // Applies to vine/thorn-shot damage too, same "on top of current"
    // stacking as the base attack — neither has its own separate
    // damageMultiplier chain, they just ride along with the tower's.
    if (tower.vineDamage) tower.vineDamage *= effects.damageMultiplier;
    if (tower.thornShotDamage) tower.thornShotDamage *= effects.damageMultiplier;
  }
  if (effects.sizeMultiplier) tower.stats.size *= effects.sizeMultiplier;
  if (effects.attackIntervalMultiplier) tower.stats.attackInterval *= effects.attackIntervalMultiplier;
  if (effects.color) tower.stats.color = effects.color;
  if (effects.glow) tower.glow = effects.glow;
  if (effects.flame) tower.flame = effects.flame;
  if (effects.attackType) tower.attackType = effects.attackType;
  if (effects.burn) tower.burn = effects.burn;
  if (effects.puddle) {
    tower.puddle = effects.puddle;
    tower.puddleCooldown = effects.puddle.interval; // don't fire instantly on purchase
  }
  if (effects.orbit) tower.orbit = effects.orbit;
  if (effects.rangeMultiplier) tower.stats.range *= effects.rangeMultiplier;
  if (effects.sparks) tower.sparks = effects.sparks;
  if (effects.boltMark) tower.boltMark = true;
  if (effects.fireMark) tower.fireMark = true;
  if (effects.spark) {
    tower.spark = effects.spark;
    tower.sparkCooldown = effects.spark.interval; // don't fire instantly on purchase
  }
  if (effects.shockwave) {
    tower.shockwave = effects.shockwave;
    tower.shockwaveCooldown = effects.shockwave.interval; // don't fire instantly on purchase
  }
  if (effects.clouds) tower.clouds = effects.clouds;
  if (effects.vine) {
    tower.vineDamage = effects.vine.damage;
    tower.vineInterval = effects.vine.interval;
    tower.vineCooldown = effects.vine.interval; // don't fire instantly on purchase
  }
  if (effects.addVines) {
    tower.vineCount += effects.addVines;
    while (tower.vineLashes.length < tower.vineCount) tower.vineLashes.push({ timeRemaining: 0, angle: 0 });
  }
  if (effects.moreThorns) tower.moreThorns = true;
  if (effects.vineRangeMultiplier) tower.vineRangeMultiplier *= effects.vineRangeMultiplier;
  if (effects.tallStem) tower.tallStem = true;
  if (effects.roots) {
    // Passes the roots already placed so a later tier's new ones don't
    // land on top of an earlier tier's (separation is checked across all
    // of them, not just within one call's own batch).
    const spots = spawnRoseRoots(tower.x, tower.y, effects.roots.count, tower.roots);
    spots.forEach((spot) => tower.roots.push({ x: spot.x, y: spot.y, damage: effects.roots.damage }));
  }
  if (effects.bodyRootGrowths) tower.bodyRootGrowths = true;
  if (effects.bodyFlowerGrowths) tower.bodyFlowerGrowths += effects.bodyFlowerGrowths;
  if (effects.longThorns) tower.longThorns = true;
  if (effects.rootGrab) {
    tower.rootGrabChance = effects.rootGrab.chance;
    tower.rootGrabDamage = effects.rootGrab.damage;
    tower.rootGrabDuration = effects.rootGrab.duration;
  }
  if (effects.thornShot) {
    tower.hasThornShot = true;
    tower.thornShotDamage = effects.thornShot.damage;
    tower.thornShotInterval = effects.thornShot.interval;
    tower.thornShotCooldown = effects.thornShot.interval; // don't fire instantly on purchase
  }
  if (effects.thornShotCountMultiplier) tower.thornShotCount *= effects.thornShotCountMultiplier;
  if (effects.thornShotPoison) tower.thornShotPoison = effects.thornShotPoison;
  if (effects.capHeightMultiplier) tower.capHeightMultiplier *= effects.capHeightMultiplier;
  // zombifyChance/zombieExplosionDamage REPLACE the previous value (each
  // tier states its own new number outright — "30%, replacing 20%"), not
  // compound with it, unlike every multiplier-based effect above.
  if (effects.zombifyChance !== undefined) tower.zombifyChance = effects.zombifyChance;
  if (effects.zombieExplosionDamage) tower.zombieExplosionDamage = effects.zombieExplosionDamage;
  if (effects.hasSkull) tower.hasSkull = true;
  if (effects.gasColor) tower.gasColor = effects.gasColor;
  // Mushroom's Enable Path: each tier's aura REPLACES the previous tier's
  // outright (its own complete, absolute spec — e.g. owning "Power" means
  // nearby towers get exactly 1.5x damage, full stop) rather than
  // compounding with it the way every multiplier-based effect above does.
  // The numbers don't cleanly compound tier-to-tier (Speed's 0.8x and
  // Fungus Juice's 0.7x aren't related by some other tier's multiplier;
  // Power/Range's clean 1.5x and Fungus Juice's clean 2x read as deliberately-
  // chosen final values, not products) — read as a deliberate design call,
  // not an oversight, and applied the same way zombifyChance already does
  // for the same reason. See game.js's getStrongestAuraFor()/
  // updateTowerAttack() for where the aura is actually applied to other
  // towers each tick (never written into any tower's own base stats).
  if (effects.aura !== undefined) {
    tower.aura = effects.aura;
    // The "Range" tier's 1.5x (and Fungus Juice's 2x) widens the Mushroom's
    // OWN attack range to match, since that same stat doubles as the
    // aura's radius — "whichever towers are in its range" reads one number
    // both ways. Replaces whatever stats.range was set to by an earlier
    // aura tier rather than compounding, same reasoning as the aura object
    // itself (and safe to do unconditionally: Enable Path's tiers are
    // strictly sequential, so there's never an earlier non-aura range
    // multiplier on this tower to clobber).
    const baseRange = TOWER_TYPES[tower.type].baseStats.range;
    tower.stats.range = baseRange * (effects.aura.rangeMultiplier || 1);
  }
  if (effects.sporeParticles) tower.sporeParticles = true;
  if (effects.capWidthMultiplier) tower.capWidthMultiplier *= effects.capWidthMultiplier;
  if (effects.gillLines) tower.gillLines = true;
  if (effects.showAuraRing) tower.showAuraRing = true;
  if (effects.infectStun !== undefined) {
    tower.infectStun = effects.infectStun;
    tower.infectCooldown = 1; // don't roll instantly on purchase
  }
  // consumeTowersInRange (Neurological) is handled entirely in game.js's
  // activateRegion — it needs the global towers list (to actually remove
  // them) and the player's confirmation first, neither of which belongs
  // in this generic, side-effect-free-on-other-towers function. Nothing
  // to do with it here beyond leaving it in `effects` for that caller to
  // read.

  // Coneflower's Quality Path: each tier's income REPLACES the previous
  // tier's outright, same convention as zombifyChance/aura/infectStun
  // above (the spec gives each tier as an absolute $/sec rate, not a
  // multiplier) — see updateTowerIncome() in game.js for what actually
  // reads tower.incomeRate. extraStems/redMist are purely visual
  // (drawConeflower()).
  if (effects.income !== undefined) tower.incomeRate = effects.income;
  if (effects.extraStems) tower.hasExtraStems = true;
  if (effects.redMist) tower.hasRedMist = true;

  // Coneflower's Overgrowth Path: numPlants/perPlantCash each compound or
  // get set independently (see each field's own comment on createTower()
  // above), then incomeRate is recomputed from whichever of the two this
  // purchase actually touched — covers every tier without needing each
  // one to also restate effects.income itself.
  if (effects.plantMultiplier) tower.numPlants *= effects.plantMultiplier;
  if (effects.addPlants) tower.numPlants += effects.addPlants;
  if (effects.perPlantCash !== undefined) tower.perPlantCash = effects.perPlantCash;
  if (effects.plantMultiplier || effects.addPlants || effects.perPlantCash !== undefined) {
    tower.incomeRate = tower.perPlantCash * tower.numPlants;
  }
  if (effects.incomeTickIntervalMultiplier) tower.incomeTickInterval *= effects.incomeTickIntervalMultiplier;
  if (effects.tallPlant) tower.hasTallPlant = true;

  tower.upgradesPurchased += 1;
  return true;
}

// Root spots have to land somewhere an enemy can actually reach — enemies
// (enemies.js's updateEnemies) walk the map's path polyline exactly along
// its centerline, not anywhere within the path's visual width, so a root
// placed just "near the tower" at random could easily miss the path
// entirely. This instead samples points that lie ON the path within
// ROOT_SPAWN_RADIUS of (cx, cy): it walks each path segment in short steps,
// keeps the sub-stretches that fall within range, then picks `count` points
// from that combined coverage using the game's own seeded random() (not
// Math.random(), per the determinism work) — rerolling a pick that lands
// too close to one already chosen so the roots read as separate spots, not
// a cluster. Gives up after a bounded number of attempts and returns
// however many distinct points it found (including none, if no path
// segment is in range at all — e.g. a tower placed in a far corner).
//
// Sized for Root Path's eventual 25 roots (Stranglement): the whole map's
// path is only ~1860px total, so a tight radius/separation (first tried:
// 100 / 30) could only fit a handful of points near a tower close to a
// corner before random retries stopped finding room — tested and bumped
// both up until a typical placement can actually reach 25. A tower in a
// genuinely path-sparse spot may still end up with fewer than requested;
// that's an accepted, documented limit of "best effort" placement rather
// than a hard guarantee.
const ROOT_SPAWN_RADIUS = 220;
const ROOT_MIN_SEPARATION = 18;

function spawnRoseRoots(cx, cy, count, existingPoints = []) {
  const coverage = [];
  let totalLength = 0;

  // Walks every one of the map's paths (not just one) so a Rose placed
  // near Savanah's temple, where both paths converge, can seed roots along
  // either — same generalization isPointOnPath() in map.js already made.
  MAP_PATHS.forEach((path) => {
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i];
      const b = path[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segmentLength = Math.hypot(dx, dy);
      if (segmentLength === 0) continue;

      const steps = Math.max(2, Math.ceil(segmentLength / 5));
      let runStart = null;
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const within = Math.hypot(a.x + dx * t - cx, a.y + dy * t - cy) <= ROOT_SPAWN_RADIUS;
        if (within && runStart === null) runStart = t;
        if ((!within || s === steps) && runStart !== null) {
          const runEnd = within ? t : (s - 1) / steps;
          const length = (runEnd - runStart) * segmentLength;
          if (length > 0) {
            coverage.push({ a, dx, dy, tStart: runStart, tEnd: runEnd, length });
            totalLength += length;
          }
          runStart = null;
        }
      }
    }
  });

  if (totalLength === 0) return [];

  const points = [];
  let attempts = 0;
  // A generous retry budget — later Root Path tiers call this with up to
  // 15 already-placed roots to avoid on top of their own batch's
  // separation, so it needs real headroom to still hit the requested count.
  while (points.length < count && attempts < (count + existingPoints.length) * 60) {
    attempts += 1;
    let target = random() * totalLength;
    const run = coverage.find((candidate) => {
      if (target <= candidate.length) return true;
      target -= candidate.length;
      return false;
    });
    if (!run) continue;

    const t = run.tStart + (target / run.length) * (run.tEnd - run.tStart);
    const x = run.a.x + run.dx * t;
    const y = run.a.y + run.dy * t;
    const tooClose = (p) => Math.hypot(p.x - x, p.y - y) < ROOT_MIN_SEPARATION;
    if (points.some(tooClose) || existingPoints.some(tooClose)) continue;
    points.push({ x, y });
  }

  return points;
}

// Lightens (positive percent) or darkens (negative) a "#rrggbb" color —
// a cheap way to fake depth/shading without creating gradient objects
// every frame (gradients are fine in moderation, but towers/enemies can
// redraw every frame, so plain fillStyle swaps stay cheaper at scale).
function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return `rgb(${r}, ${g}, ${b})`;
}

// Visuals, kept alongside each tower's data so a new tower type brings its
// own look with it. Canvas primitives only, no external art. `time` is the
// game's own deterministic simulation clock (seconds), used for idle
// animation — not wall-clock time, so animation speed is tied to game
// speed/pausing rather than real time.
// A tower's real `size` stat (used for nothing mechanical — no damage/
// range/etc. is derived from it, only rendering and click hit-testing) is
// capped here for rendering/hit-testing purposes. Sunflower's biggest tier
// (Flamewall) tops out well under this; Rose's Root Path Tanglement can
// push the real stat to ~200+ (11.5x base), which an earlier fix (capping
// just the stem height) didn't fully address — the bloom itself still
// rendered that big and could swallow nearby towers/path/enemies
// regardless of where it was placed. Both renderTower() below and game.js's
// hit-testing (click-to-select, the selection ring) read a tower's visual
// size through getTowerVisualSize() so what's drawn and what's clickable
// always agree; tower.stats.size itself is left uncapped, since nothing
// mechanical reads it and there's no reason to lose the real number.
const MAX_TOWER_VISUAL_SIZE = 65;
function getTowerVisualSize(tower) {
  return Math.min(tower.stats.size, MAX_TOWER_VISUAL_SIZE);
}

function renderTower(ctx, tower, x, y, time) {
  const size = getTowerVisualSize(tower);
  const flashAmount = tower.attackFlash / ATTACK_FLASH_DURATION;
  if (tower.type === 'sunflower') {
    drawSunflower(ctx, x, y, size, tower.stats.color, tower.glow, time, flashAmount);
  } else if (tower.type === 'rose') {
    // Vines are rooted appendages, not decoration riding on top of the
    // flower — drawn first so the bloom and stem render over their bases.
    if (tower.vineCount > 0) renderRoseVines(ctx, tower, x, y, time);
    drawRose(
      ctx,
      x,
      y,
      size,
      tower.stats.color,
      tower.glow,
      time,
      flashAmount,
      tower.tallStem,
      tower.bodyRootGrowths,
      tower.bodyFlowerGrowths,
      tower.longThorns
    );
  } else if (tower.type === 'mushroom') {
    // Infect Path (index 2) changes the Mushroom's actual species per
    // tier rather than recoloring the same toadstool shape — see
    // drawInfectMushroom()'s own comment for why it's a separate function
    // instead of more parameters on drawMushroom().
    if (tower.chosenPath === 2 && tower.upgradesPurchased >= 1) {
      drawInfectMushroom(ctx, x, y, size, time, flashAmount, tower.upgradesPurchased);
    } else {
      drawMushroom(
        ctx,
        x,
        y,
        size,
        tower.stats.color,
        tower.glow,
        time,
        flashAmount,
        tower.capHeightMultiplier,
        tower.hasSkull,
        tower.gasColor,
        tower.capWidthMultiplier,
        tower.gillLines,
        tower.showAuraRing ? tower.stats.range : 0,
        tower.sporeParticles
      );
    }
  } else if (tower.type === 'coneflower') {
    drawConeflower(
      ctx,
      x,
      y,
      size,
      tower.stats.color,
      tower.glow,
      time,
      flashAmount,
      tower.hasExtraStems,
      tower.hasRedMist,
      tower.numPlants,
      tower.hasTallPlant
    );
  } else if (tower.type === 'sunlitConductor') {
    drawSunlitConductor(ctx, x, y, size, tower.stats.color, tower.glow, time, flashAmount);
  } else if (tower.type === 'mangler') {
    drawMangler(ctx, x, y, size, tower.stats.color, tower.glow, time, flashAmount);
  } else if (tower.type === 'fungalMess') {
    drawFungalMess(ctx, x, y, size, tower.stats.color, tower.glow, time, flashAmount);
  } else {
    // Fallback for any future tower type without custom art yet.
    ctx.fillStyle = tower.stats.color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  if (tower.flame === 'small') drawFlame(ctx, x, y - size * 0.9, size * 0.35, '#ff7043');
  if (tower.flame === 'large') drawFlame(ctx, x, y, size * 1.1, '#ff5722');

  if (tower.sparks === 'small') drawSparks(ctx, x, y, size);
  if (tower.boltMark) drawBoltMark(ctx, x, y, size);
  if (tower.fireMark) drawFireMark(ctx, x, y, size);

  if (tower.orbit) renderTowerOrbit(ctx, tower, x, y);
  if (tower.clouds) renderTowerClouds(ctx, tower, x, y);
}

// A few small jagged yellow zigzags radiating from the body — cheap
// stand-in for "crackling with electric sparks."
function drawSparks(ctx, x, y, size) {
  ctx.strokeStyle = '#fff59d';
  ctx.lineWidth = 1.5;
  [0.4, 1.8, 3.3, 4.9].forEach((angle) => {
    const baseX = x + Math.cos(angle) * size * 0.75;
    const baseY = y + Math.sin(angle) * size * 0.75;
    const midX = baseX + Math.cos(angle) * size * 0.2;
    const midY = baseY + Math.sin(angle) * size * 0.2 - size * 0.1;
    const tipX = midX + Math.cos(angle) * size * 0.2;
    const tipY = midY + Math.sin(angle) * size * 0.2 + size * 0.15;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(midX, midY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  });
}

// A small lightning-bolt mark on the flower's own face/head.
function drawBoltMark(ctx, x, y, size) {
  const s = size * 0.28;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(s * 0.15, -s);
  ctx.lineTo(-s * 0.35, s * 0.15);
  ctx.lineTo(0, s * 0.15);
  ctx.lineTo(-s * 0.15, s);
  ctx.lineTo(s * 0.35, -s * 0.15);
  ctx.lineTo(0, -s * 0.15);
  ctx.closePath();
  ctx.fillStyle = '#fff9c4';
  ctx.fill();
  ctx.strokeStyle = '#8d6e00';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// A small two-tone flame mark on the flower's face (Precision Rays) — a
// smaller, always-on cousin of drawFlame's bigger Fire Path overlay, placed
// at the tower's own center like drawBoltMark rather than above/engulfing it.
function drawFireMark(ctx, x, y, size) {
  const s = size * 0.3;
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#ff7043';
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.6, -s * 0.1, 0, s * 0.9);
  ctx.quadraticCurveTo(-s * 0.6, -s * 0.1, 0, -s);
  ctx.fill();

  ctx.fillStyle = '#ffee58';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.3);
  ctx.quadraticCurveTo(s * 0.3, s * 0.1, 0, s * 0.6);
  ctx.quadraticCurveTo(-s * 0.3, s * 0.1, 0, -s * 0.3);
  ctx.fill();

  ctx.restore();
}

// Decorative-only (no damage, unlike renderTowerOrbit's embers) storm
// clouds slowly circling the tower — a flattened orbit so they read as
// hovering above it rather than passing through the ground.
function renderTowerClouds(ctx, tower, x, y) {
  const { count, radius } = tower.clouds;
  for (let i = 0; i < count; i += 1) {
    const angle = tower.cloudsAngle + (i * 2 * Math.PI) / count;
    const cx = x + radius * Math.cos(angle);
    const cy = y + radius * Math.sin(angle) * 0.6 - radius * 0.3;

    ctx.fillStyle = '#4a4f5c';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c6270';
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy - 2, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFlame(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x + size * 0.6, y - size * 0.2, x, y + size * 0.4);
  ctx.quadraticCurveTo(x - size * 0.6, y - size * 0.2, x, y - size);
  ctx.fill();
}

function renderTowerOrbit(ctx, tower, x, y) {
  const { count, radius, emberRadius } = tower.orbit;
  for (let i = 0; i < count; i += 1) {
    const angle = tower.orbitAngle + (i * 2 * Math.PI) / count;
    ctx.fillStyle = '#ff5722';
    ctx.beginPath();
    ctx.arc(x + radius * Math.cos(angle), y + radius * Math.sin(angle), emberRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Ground-layer effects (e.g. magma puddles) — drawn separately so callers
// can put them underneath towers/enemies instead of on top.
function renderTowerGroundEffects(ctx, tower) {
  tower.activePuddles.forEach((puddle) => {
    ctx.fillStyle = 'rgba(255, 87, 34, 0.5)';
    ctx.beginPath();
    ctx.arc(puddle.x, puddle.y, puddle.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  // A couple of small thorny root spikes poking out of the ground at each
  // trap — deliberately small and plain so it doesn't get confused with the
  // bigger, moving thorn vines radiating from the tower itself.
  // Roots land exactly on the path centerline (see spawnRoseRoots), which
  // is a mid-brown — a dark brown spike was nearly invisible against it in
  // testing, so this uses the Rose's own pink/red (plus a dark outline for
  // contrast against the lighter grass too) instead, reading as "this is
  // the Rose's trap" rather than blending into the dirt.
  tower.roots.forEach((root) => {
    ctx.strokeStyle = '#1b0e10';
    ctx.lineWidth = 2.5;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(root.x + side * 5, root.y + 4);
      ctx.lineTo(root.x + side * 2, root.y - 7);
      ctx.stroke();
    });
    ctx.fillStyle = '#e91e63';
    ctx.beginPath();
    ctx.arc(root.x, root.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1b0e10';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

// How long the "just fired" pulse lasts.
const ATTACK_FLASH_DURATION = 0.15;

function drawSunflower(ctx, x, y, size, color, glow, time, flashAmount) {
  const stemHeight = size * 1.3;
  const groundY = y + stemHeight;
  // Gentle idle sway; phase offset by x so multiple towers don't move in
  // lockstep. This rotates the whole plant (stem+head) around its base —
  // the tower's actual attack origin (x, y) doesn't move with it, so at
  // this sway amplitude the mismatch is a few pixels at most, not worth
  // the extra complexity of keeping them in sync.
  const sway = Math.sin(time * 1.5 + x * 0.01) * 0.06;

  ctx.save();
  ctx.translate(x, groundY);
  ctx.rotate(sway);
  ctx.translate(-x, -groundY);

  ctx.fillStyle = '#2e7d32';
  ctx.strokeStyle = '#1b5e20';
  ctx.lineWidth = 1;
  ctx.fillRect(x - size * 0.08, y, size * 0.16, stemHeight);
  ctx.strokeRect(x - size * 0.08, y, size * 0.16, stemHeight);

  ctx.beginPath();
  ctx.ellipse(x - size * 0.35, y + stemHeight * 0.5, size * 0.3, size * 0.12, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + size * 0.35, y + stemHeight * 0.7, size * 0.3, size * 0.12, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // The flower head pulses slightly bigger right after an attack.
  ctx.translate(x, y);
  ctx.scale(1 + flashAmount * 0.15, 1 + flashAmount * 0.15);
  ctx.translate(-x, -y);

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 25;
  }

  const petalCount = 10;
  const darkerColor = shadeColor(color, -12);

  for (let i = 0; i < petalCount; i += 1) {
    const angle = (i / petalCount) * Math.PI * 2;
    ctx.fillStyle = i % 2 === 0 ? color : darkerColor;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(size * 0.55, 0, size * 0.42, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // A few concentric rings suggest a seed-head pattern, cheaply.
  const centerShades = ['#3c2510', '#4a2f12', '#5a3a18'];
  centerShades.forEach((shade, i) => {
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.55 * (1 - i * 0.22), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawRose(ctx, x, y, size, color, glow, time, flashAmount, tallStem, bodyRootGrowths, bodyFlowerGrowths, longThorns) {
  // Capped: Root Path's Tanglement can push `size` up to 11.5x (a Rose's
  // base size 18 -> ~207), and an uncapped stem at that scale (207 * 1.3 =
  // ~269px) pushed the stem's ground point, and the body growths anchored
  // near it, off the bottom of the 640px-tall world for anything placed in
  // the lower half of the map — confirmed in testing. The bloom itself
  // (this function's real "big, deliberate" visual) stays fully
  // proportional to `size` and uncapped; only the stem's footprint is
  // bounded, which reads as a dramatically oversized flower on a normal-
  // ish stem rather than one that runs off-screen. Thorn Path's tallStem
  // never gets remotely close to this cap on its own, so it's unaffected.
  const STEM_HEIGHT_CAP = 160;
  const stemHeight = Math.min(size * (tallStem ? 1.7 : 1.3), STEM_HEIGHT_CAP); // Vigorous grows the stem taller
  const groundY = y + stemHeight;
  const sway = Math.sin(time * 1.3 + x * 0.013) * 0.05;

  ctx.save();
  ctx.translate(x, groundY);
  ctx.rotate(sway);
  ctx.translate(-x, -groundY);

  ctx.fillStyle = '#2e7d32';
  ctx.strokeStyle = '#1b5e20';
  ctx.lineWidth = 1;
  ctx.fillRect(x - size * 0.07, y, size * 0.14, stemHeight);
  ctx.strokeRect(x - size * 0.07, y, size * 0.14, stemHeight);

  ctx.beginPath();
  ctx.ellipse(x - size * 0.3, y + stemHeight * 0.45, size * 0.26, size * 0.11, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + size * 0.3, y + stemHeight * 0.65, size * 0.26, size * 0.11, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Root Path body growths — drawn on the stem itself (sway with the
  // plant, but not affected by the bloom's attack-flash pulse below).
  if (bodyRootGrowths) drawRoseBodyRoots(ctx, x, y, groundY, size, longThorns);
  if (bodyFlowerGrowths > 0) drawRoseBodyFlowers(ctx, x, y, groundY, size, color, bodyFlowerGrowths);

  // The bloom pulses slightly bigger right after an attack, same cue as the Sunflower.
  ctx.translate(x, y);
  ctx.scale(1 + flashAmount * 0.15, 1 + flashAmount * 0.15);
  ctx.translate(-x, -y);

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 25;
  }

  // Three interleaved rings of petals, shrinking and darkening toward the
  // center — reads as an inward-curling rose bloom rather than the
  // Sunflower's single flat radiating ring.
  const layers = [
    { count: 6, radius: 0.62, petalW: 0.34, petalH: 0.22, shade: 10 },
    { count: 5, radius: 0.42, petalW: 0.28, petalH: 0.2, shade: -5 },
    { count: 4, radius: 0.22, petalW: 0.2, petalH: 0.16, shade: -18 },
  ];
  layers.forEach((layer, layerIndex) => {
    for (let i = 0; i < layer.count; i += 1) {
      const angle = (i / layer.count) * Math.PI * 2 + layerIndex * 0.4;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = shadeColor(color, layer.shade);
      ctx.beginPath();
      ctx.ellipse(size * layer.radius, 0, size * layer.petalW, size * layer.petalH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });

  ctx.fillStyle = shadeColor(color, -30);
  ctx.beginPath();
  ctx.arc(x, y, size * 0.14, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Root Path's Rootbound: small root spikes jutting out near the stem's
// base, distinct from both the ground-trap roots (drawn on the path
// itself, see renderTowerGroundEffects) and the Thorn Path's vines (which
// radiate from the flower head, not the stem) — this Rose only ever has
// one of the two paths at once, so there's no risk of confusing the two.
// Stranglement's longThorns lengthens these specifically (see that tier's
// description for why "longer thorns" applies here rather than to vines,
// which a Root Path Rose never has).
function drawRoseBodyRoots(ctx, x, y, groundY, size, longThorns) {
  const spikeLength = size * (longThorns ? 0.5 : 0.3);
  const angles = [-2.4, -1.9, 1.9, 2.4]; // roughly down-and-outward on each side
  ctx.strokeStyle = '#4e342e';
  ctx.lineWidth = 2.5;
  angles.forEach((angle) => {
    const baseX = x + Math.cos(angle) * size * 0.1;
    const baseY = groundY - size * 0.08;
    const tipX = baseX + Math.cos(angle) * spikeLength;
    const tipY = baseY + Math.sin(angle) * spikeLength * 0.6;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(baseX + Math.cos(angle) * spikeLength * 0.5, baseY + spikeLength * 0.15, tipX, tipY);
    ctx.stroke();
  });
}

// Tanglement/Stranglement: small extra rose-bud growths along the stem —
// capped to 4 fixed slots regardless of size, so a Tanglement-scale (11.5x)
// Rose doesn't need more draw calls, just bigger ones.
function drawRoseBodyFlowers(ctx, x, y, groundY, size, color, count) {
  const slots = [
    { dx: -0.45, dyFrac: 0.35 },
    { dx: 0.45, dyFrac: 0.3 },
    { dx: -0.3, dyFrac: 0.75 },
    { dx: 0.3, dyFrac: 0.7 },
  ];
  slots.slice(0, Math.min(count, slots.length)).forEach((slot) => {
    const bx = x + slot.dx * size * 0.55;
    const by = y + (groundY - y) * slot.dyFrac;
    ctx.fillStyle = shadeColor(color, -10);
    ctx.beginPath();
    ctx.arc(bx, by, size * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bx, by, size * 0.07, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Thorn vines (Rose's Thorn Path) — fixed-angle appendages radiating from
// the tower (rooted, not orbiting), each with a couple of thorn-spike tick
// marks. Purely the visual side; the actual periodic damage lives in
// game.js's updateTowerVines(), driven by the same tower.vineCount this
// reads. moreThorns (Puncture) just densifies the tick marks, same spirit
// as flame's small/large or sparks' overlay.
// How long a vine's lash-toward-target-and-back animation lasts once it
// hits something — kept short so it reads as a quick whip, not a slow
// swing, and comfortably finishes within a 1s vine interval. Also used by
// game.js's updateTowerVines() to start the per-vine timer.
const VINE_LASH_DURATION = 0.3;

// Shortest signed angular distance from `from` to `to`, wrapped to
// [-PI, PI] — lets the lash swing take the short way around regardless of
// where a vine's idle angle happens to sit relative to its target.
function shortestAngleDiff(from, to) {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function renderRoseVines(ctx, tower, x, y, time) {
  const baseLength = tower.stats.size * 1.8 * tower.vineRangeMultiplier;
  const thornTicks = tower.moreThorns ? 4 : 2;

  for (let i = 0; i < tower.vineCount; i += 1) {
    const idleAngle = (i / tower.vineCount) * Math.PI * 2 + Math.sin(time * 0.6 + i) * 0.05;
    let angle = idleAngle;
    let length = baseLength;

    const lash = tower.vineLashes[i];
    if (lash && lash.timeRemaining > 0) {
      // 0 right when it fires -> 1 once the lash finishes; sin() of that
      // gives a swing-out-and-back motion rather than a linear snap.
      const swingT = 1 - lash.timeRemaining / VINE_LASH_DURATION;
      const swingAmount = Math.sin(swingT * Math.PI);
      angle = idleAngle + shortestAngleDiff(idleAngle, lash.angle) * swingAmount;
      length = baseLength * (1 + 0.2 * swingAmount); // a little extra reach at the peak of the whip
    }

    const tipX = x + Math.cos(angle) * length;
    const tipY = y + Math.sin(angle) * length;
    const midX = x + Math.cos(angle) * length * 0.55;
    const midY = y + Math.sin(angle) * length * 0.55 - length * 0.08;

    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.stroke();

    ctx.strokeStyle = '#1b3a1d';
    ctx.lineWidth = 1.5;
    for (let t = 1; t <= thornTicks; t += 1) {
      const frac = t / (thornTicks + 1);
      const px = x + (tipX - x) * frac;
      const py = y + (tipY - y) * frac;
      const perp = angle + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(perp) * 4, py + Math.sin(perp) * 4);
      ctx.stroke();
    }
  }
}

function drawMushroom(
  ctx,
  x,
  y,
  size,
  color,
  glow,
  time,
  flashAmount,
  capHeightMultiplier,
  hasSkull,
  gasColor,
  capWidthMultiplier = 1,
  gillLines = false,
  auraRingRadius = 0,
  sporeParticles = false
) {
  const stemHeight = size * 0.9 * capHeightMultiplier;
  const groundY = y + stemHeight;
  const sway = Math.sin(time * 1.1 + x * 0.011) * 0.04;

  // Fungus Juice only: a faint, slowly pulsing ring drawn at the aura's
  // actual radius (the Mushroom's own stats.range, widened by the Range/
  // Fungus Juice tiers — see purchaseUpgrade()) — drawn outside the
  // sway/flash transform below since it's anchored to the tower's fixed
  // position, not its wobbling cap.
  if (auraRingRadius > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.5);
    ctx.save();
    ctx.strokeStyle = `rgba(156, 39, 176, ${0.15 + pulse * 0.1})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(x, y, auraRingRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, groundY);
  ctx.rotate(sway);
  ctx.translate(-x, -groundY);

  // A slightly tapered stem — wider at the cap than at the ground.
  ctx.fillStyle = '#fff8e1';
  ctx.strokeStyle = '#d7ccc8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.22, groundY);
  ctx.quadraticCurveTo(x - size * 0.26, y + stemHeight * 0.4, x - size * 0.16, y);
  ctx.lineTo(x + size * 0.16, y);
  ctx.quadraticCurveTo(x + size * 0.26, y + stemHeight * 0.4, x + size * 0.22, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // The cap pulses slightly bigger right after an attack, same cue as the other towers.
  ctx.translate(x, y);
  ctx.scale(1 + flashAmount * 0.15, 1 + flashAmount * 0.15);
  ctx.translate(-x, -y);

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 20;
  }

  const capWidth = size * 0.75 * capWidthMultiplier;

  // The cap: a half-dome with a darker underside rim for a touch of depth.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, capWidth, size * 0.55, 0, Math.PI, 0, false);
  ctx.fill();
  ctx.fillStyle = shadeColor(color, -22);
  ctx.beginPath();
  ctx.ellipse(x, y, capWidth, size * 0.14, 0, 0, Math.PI, false);
  ctx.fill();

  // Range tier and up: extra gill lines fanning out under the (now wider)
  // cap — the detail the "Range" tier's description asks for alongside
  // the literal widening above.
  if (gillLines) {
    ctx.strokeStyle = shadeColor(color, -35);
    ctx.lineWidth = 1;
    [-0.5, -0.25, 0, 0.25, 0.5].forEach((t) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + t * capWidth * 1.3, y + size * 0.12);
      ctx.stroke();
    });
  }

  // Classic toadstool spots.
  ctx.fillStyle = '#fff8e1';
  [
    [-0.35, -0.28],
    [0.12, -0.42],
    [0.42, -0.18],
    [-0.05, -0.12],
  ].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(x + dx * size, y + dy * size, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
  });

  if (hasSkull) drawMushroomSkull(ctx, x, y - size * 0.55, size * 0.22);
  if (gasColor) drawMushroomGas(ctx, x, y, size, gasColor, time);
  if (sporeParticles) drawMushroomSporeParticles(ctx, x, y, size, time);

  ctx.restore();
}

// Speed tier: a couple of tiny spore flecks drifting slowly around the
// cap — a lighter, more subtle cue than gasColor's heavier rising-puff
// cloud (reserved for Decay's later tiers and Fungus Juice), fitting
// "subtle glow/pulsing spore particles" without competing visually with
// the glow halo drawn alongside it.
function drawMushroomSporeParticles(ctx, x, y, size, time) {
  ctx.fillStyle = 'rgba(200, 230, 255, 0.6)';
  [0, 1].forEach((i) => {
    const t = time * 0.6 + i * Math.PI;
    const px = x + Math.cos(t) * size * 0.9;
    const py = y - size * 0.3 + Math.sin(t * 1.3) * size * 0.3;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3 + i * 2);
    ctx.globalAlpha = 0.3 + pulse * 0.4;
    ctx.beginPath();
    ctx.arc(px, py, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// A small skull sitting on the cap (Undead Army and later) — a simple
// pale circle with two dark eye sockets, enough to read at tower scale.
function drawMushroomSkull(ctx, x, y, size) {
  ctx.fillStyle = '#fafafa';
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#212121';
  ctx.beginPath();
  ctx.arc(x - size * 0.35, y, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + size * 0.35, y, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

// A few soft, rising, fading puffs of gas (Undead Army and later) — color
// comes from tower.gasColor (greenish, then purple at Necro-Mush), cycling
// on the game's own deterministic clock so it stays in sync with
// everything else instead of drifting on real time.
function drawMushroomGas(ctx, x, y, size, color, time) {
  ctx.fillStyle = color;
  [0, 1, 2].forEach((i) => {
    const t = (time * 0.4 + i / 3) % 1;
    const gx = x + Math.sin(time * 0.7 + i * 2) * size * 0.4;
    const gy = y - size * 0.5 - t * size * 1.3;
    ctx.globalAlpha = 0.35 * (1 - t);
    ctx.beginPath();
    ctx.arc(gx, gy, size * 0.16 * (1 + t * 0.6), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// Infect Path (TOWER_TYPES.mushroom.upgradePaths[2]) swaps the Mushroom's
// actual species at each tier instead of recoloring the same toadstool
// shape — the same "real visual variety, not just color/size tweaks" bar
// the Enable Path's sprite work was held to, pushed further here since the
// spec explicitly calls for escalating diseased/parasitic/alien species.
// Kept as its own function (rather than more parameters bolted onto
// drawMushroom()) since the body shapes genuinely differ tier to tier, not
// just their colors/details — Neurological in particular isn't a domed
// cap at all.
function drawInfectMushroom(ctx, x, y, size, time, flashAmount, tier) {
  const isStinkhorn = tier >= 4;
  const stemHeight = size * (isStinkhorn ? 1.25 : 0.9);
  const stemWidth = isStinkhorn ? 0.09 : 0.2;
  const groundY = y + stemHeight;
  const sway = Math.sin(time * 1.1 + x * 0.011) * 0.04;

  ctx.save();
  ctx.translate(x, groundY);
  ctx.rotate(sway);
  ctx.translate(-x, -groundY);

  // Stem sickens from pale cream toward blackened rot as the tiers climb,
  // same escalation the cap shapes themselves follow.
  ctx.fillStyle = tier === 1 ? '#f1e8d0' : tier === 2 ? '#ece7da' : tier === 3 ? '#8a7d6b' : '#44392f';
  ctx.strokeStyle = tier === 1 ? '#c9b896' : '#2e2620';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - size * stemWidth, groundY);
  ctx.quadraticCurveTo(x - size * (stemWidth + 0.04), y + stemHeight * 0.4, x - size * (stemWidth - 0.06), y);
  ctx.lineTo(x + size * (stemWidth - 0.06), y);
  ctx.quadraticCurveTo(x + size * (stemWidth + 0.04), y + stemHeight * 0.4, x + size * stemWidth, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.translate(x, y);
  ctx.scale(1 + flashAmount * 0.15, 1 + flashAmount * 0.15);
  ctx.translate(-x, -y);

  if (tier === 1) drawRashyCap(ctx, x, y, size, time);
  else if (tier === 2) drawRespiratoryCap(ctx, x, y, size, time);
  else if (tier === 3) drawCirculatoryCap(ctx, x, y, size, time);
  else drawNeurologicalCap(ctx, x, y, size, time);

  ctx.restore();
}

// Rashy ($300): the mildest tier — still a recognizable toadstool cap, but
// a sickly yellow-green instead of a healthy color, with irregular red
// rash blotches (faintly pulsing) replacing the classic white spots.
function drawRashyCap(ctx, x, y, size, time) {
  const capWidth = size * 0.75;
  const base = '#9fae5a';
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(x, y, capWidth, size * 0.55, 0, Math.PI, 0, false);
  ctx.fill();
  ctx.fillStyle = shadeColor(base, -22);
  ctx.beginPath();
  ctx.ellipse(x, y, capWidth, size * 0.14, 0, 0, Math.PI, false);
  ctx.fill();

  ctx.fillStyle = '#c0392b';
  [
    [-0.35, -0.3],
    [0.15, -0.42],
    [0.4, -0.15],
    [-0.05, -0.1],
    [0.3, -0.3],
    [-0.25, -0.15],
  ].forEach(([dx, dy], i) => {
    const pulse = 0.5 + 0.5 * Math.sin(time * 2 + i);
    ctx.globalAlpha = 0.55 + pulse * 0.2;
    ctx.beginPath();
    ctx.ellipse(x + dx * size, y + dy * size, size * 0.1, size * 0.07, dx, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// Respiratory ($850): Lion's Mane — a shaggy pale pom-pom instead of a
// smooth domed cap. Radiating, slightly wobbling spike lines sell the
// "shaggy" read at tower scale; a literal fur texture wouldn't survive
// this small.
function drawRespiratoryCap(ctx, x, y, size, time) {
  ctx.fillStyle = '#ece7da';
  ctx.beginPath();
  ctx.arc(x, y - size * 0.1, size * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#d8d0bc';
  ctx.lineWidth = 1.5;
  const spikeCount = 14;
  for (let i = 0; i < spikeCount; i += 1) {
    const angle = (i / spikeCount) * Math.PI * 2 + time * 0.1;
    const innerR = size * 0.42;
    const outerR = size * (0.58 + 0.08 * Math.sin(time * 3 + i));
    const innerX = x + Math.cos(angle) * innerR;
    const innerY = y - size * 0.1 + Math.sin(angle) * innerR * 0.7;
    const outerX = x + Math.cos(angle) * outerR;
    const outerY = y - size * 0.1 + Math.sin(angle) * outerR * 0.7;
    ctx.beginPath();
    ctx.moveTo(innerX, innerY);
    ctx.lineTo(outerX, outerY);
    ctx.stroke();
  }
}

// Circulatory ($2000): a deep red cap with branching, vein-like lines
// pulsing brighter in sync with the same clock driving the infected-enemy
// glow in enemies.js — ties the tower's own art to the effect it inflicts.
function drawCirculatoryCap(ctx, x, y, size, time) {
  const capWidth = size * 0.78;
  const base = '#6b1515';
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(x, y, capWidth, size * 0.56, 0, Math.PI, 0, false);
  ctx.fill();
  ctx.fillStyle = shadeColor(base, -25);
  ctx.beginPath();
  ctx.ellipse(x, y, capWidth, size * 0.14, 0, 0, Math.PI, false);
  ctx.fill();

  const pulse = 0.5 + 0.5 * Math.sin(time * 4);
  ctx.strokeStyle = `rgba(255, 60, 60, ${0.4 + pulse * 0.3})`;
  ctx.lineWidth = 1.2;
  [-0.5, -0.22, 0, 0.22, 0.5].forEach((t) => {
    const midX = x + t * capWidth * 0.6;
    const midY = y - size * 0.18;
    const endX = x + t * capWidth * 1.3;
    const endY = y - size * 0.02;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(midX + t * capWidth * 0.2, midY - size * 0.1);
    ctx.stroke();
  });
}

// Neurological ($5000): a stinkhorn — a tall narrow dark cone, not a dome
// at all, the most alien-looking of the four. Matches the tier that also
// one-time-consumes every other tower in range on purchase (see
// consumeTowersInRange() in game.js); dripping dark marks down the cap
// plus one slowly falling droplet sell "actively oozing," not just
// discolored.
function drawNeurologicalCap(ctx, x, y, size, time) {
  ctx.fillStyle = '#2b1f33';
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.75);
  ctx.lineTo(x - size * 0.32, y + size * 0.05);
  ctx.lineTo(x + size * 0.32, y + size * 0.05);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1a1220';
  [
    [-0.1, 0.1],
    [0.15, 0.25],
    [-0.2, 0.3],
    [0.05, 0.4],
  ].forEach(([dx, dyFrac]) => {
    ctx.beginPath();
    ctx.arc(x + dx * size, y - size * 0.75 + dyFrac * size, size * 0.04, 0, Math.PI * 2);
    ctx.fill();
  });

  const dripT = (time * 0.3) % 1;
  ctx.globalAlpha = 1 - dripT;
  ctx.beginPath();
  ctx.arc(x + size * 0.08, y - size * 0.6 + dripT * size * 0.7, size * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// --- Coneflower (passive income, no combat) --------------------------------

// A ring of narrow pointed petals around a raised, bristly central cone —
// the cone is the one feature that reads as "coneflower" rather than a
// generic daisy/sunflower-shaped bloom. Shared between the main flower
// head and High Standard's extra side stems (isMain just thins out the
// bristle count on the smaller side heads so they don't look as busy).
function drawConeflowerHead(ctx, x, y, size, color, isMain) {
  const petalCount = 10;
  const darkerColor = shadeColor(color, -15);
  for (let i = 0; i < petalCount; i += 1) {
    const angle = (i / petalCount) * Math.PI * 2;
    ctx.fillStyle = i % 2 === 0 ? color : darkerColor;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(size * 0.2, 0);
    ctx.quadraticCurveTo(size * 0.75, -size * 0.14, size * 0.95, 0);
    ctx.quadraticCurveTo(size * 0.75, size * 0.14, size * 0.2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = '#6b4423';
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.42, size * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor('#6b4423', -12);
  ctx.beginPath();
  ctx.arc(x, y - size * 0.08, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a2f18';
  const bristleCount = isMain ? 10 : 6;
  for (let i = 0; i < bristleCount; i += 1) {
    const angle = (i / bristleCount) * Math.PI * 2 + 0.3;
    const bx = x + Math.cos(angle) * size * 0.22;
    const by = y - size * 0.08 + Math.sin(angle) * size * 0.2;
    ctx.beginPath();
    ctx.arc(bx, by, size * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Perfect Condition only: a few faint red motes drifting DOWN from the
// flower head — deliberately the opposite direction of Mushroom's rising
// gasColor puffs, so the two don't read as the same effect recolored.
function drawConeflowerRedMist(ctx, x, y, size, time) {
  ctx.fillStyle = 'rgba(198, 40, 40, 0.5)';
  [0, 1, 2].forEach((i) => {
    const t = (time * 0.35 + i / 3) % 1;
    const mx = x + Math.sin(time * 0.8 + i * 2) * size * 0.3;
    const my = y + size * 0.2 + t * size * 1.4;
    ctx.globalAlpha = 0.5 * (1 - t);
    ctx.beginPath();
    ctx.arc(mx, my, size * 0.14 * (1 - t * 0.4), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// Overgrowth Path (tier 1 and up): the single flower head is replaced by
// a ring of smaller heads, one per plant — capped at a reasonable visual
// density (past it, individual heads stop being legible at tower-icon
// scale anyway). The economy-facing numPlants value itself is never
// capped, only how many heads actually get drawn — Plantation's real 11
// plants reads as "a dense little flower bed," not literally 11
// countable blooms.
const CONEFLOWER_CLUSTER_VISUAL_CAP = 8;

function drawConeflowerCluster(ctx, x, y, size, color, numPlants) {
  const count = Math.min(numPlants, CONEFLOWER_CLUSTER_VISUAL_CAP);
  const headSize = size * (0.62 - Math.min(count, 6) * 0.04);
  const ringRadius = size * 0.38;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const hx = x + Math.cos(angle) * ringRadius;
    const hy = y + Math.sin(angle) * ringRadius * 0.7;
    drawConeflowerHead(ctx, hx, hy, headSize, color, false);
  }
}

function drawConeflower(ctx, x, y, size, color, glow, time, flashAmount, hasExtraStems, hasRedMist, numPlants = 1, tallPlant = false) {
  // Plantation's "grows taller" — the only Overgrowth Path visual that
  // isn't just "more heads," so it gets its own flag rather than being
  // folded into the cluster-drawing logic above.
  const stemHeight = size * 1.3 * (tallPlant ? 1.3 : 1);
  const groundY = y + stemHeight;
  const sway = Math.sin(time * 1.4 + x * 0.01) * 0.05;

  ctx.save();
  ctx.translate(x, groundY);
  ctx.rotate(sway);
  ctx.translate(-x, -groundY);

  ctx.fillStyle = '#4b7a3a';
  ctx.strokeStyle = '#2f5522';
  ctx.lineWidth = 1;
  ctx.fillRect(x - size * 0.07, y, size * 0.14, stemHeight);
  ctx.strokeRect(x - size * 0.07, y, size * 0.14, stemHeight);

  // High Standard tier and up: two smaller side stems, each with their
  // own small flower head, so the plant reads as visibly bushier rather
  // than just uniformly scaled up.
  if (hasExtraStems) {
    [-1, 1].forEach((side) => {
      const stemX = x + side * size * 0.45;
      const stemTopY = y + stemHeight * 0.25;
      ctx.strokeStyle = '#4b7a3a';
      ctx.lineWidth = Math.max(1.5, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.quadraticCurveTo(x + side * size * 0.3, groundY - stemHeight * 0.4, stemX, stemTopY);
      ctx.stroke();
      drawConeflowerHead(ctx, stemX, stemTopY, size * 0.45, color, false);
    });
  }

  ctx.fillStyle = '#4b7a3a';
  ctx.beginPath();
  ctx.ellipse(x - size * 0.3, y + stemHeight * 0.55, size * 0.26, size * 0.1, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + size * 0.3, y + stemHeight * 0.75, size * 0.26, size * 0.1, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Never actually pulses today (Coneflower has no attack, so
  // flashAmount is always 0) but kept for the same structural reason
  // every other tower's draw function keeps it: free consistency, no
  // cost if it's a no-op.
  ctx.translate(x, y);
  ctx.scale(1 + flashAmount * 0.15, 1 + flashAmount * 0.15);
  ctx.translate(-x, -y);

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 20;
  }

  if (numPlants > 1) {
    drawConeflowerCluster(ctx, x, y, size, color, numPlants);
  } else {
    drawConeflowerHead(ctx, x, y, size, color, true);
  }
  if (hasRedMist) drawConeflowerRedMist(ctx, x, y, size, time);

  ctx.restore();
}

// --- Prodigies ---------------------------------------------------------

// A large, slowly spinning sun disc with radiating rays, drawn BEHIND the
// sunflower it belongs to (called before drawSunflower below) — the one
// feature the spec calls for beyond "giant sunflower."
function drawRotatingSun(ctx, x, y, radius, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.5);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.35)';
  const rayCount = 12;
  for (let i = 0; i < rayCount; i += 1) {
    ctx.save();
    ctx.rotate((i / rayCount) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.5);
    ctx.lineTo(radius * 0.1, -radius * 1.15);
    ctx.lineTo(-radius * 0.1, -radius * 1.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(255, 235, 150, 0.45)';
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

// Sunflower's Prodigy ($30,000, direct request): just the shared
// drawSunflower() body — already exactly "a sunflower," nothing about
// its own shape needs to change — with the rotating sun behind it as the
// one new visual element.
function drawSunlitConductor(ctx, x, y, size, color, glow, time, flashAmount) {
  drawRotatingSun(ctx, x, y, size * 1.6, time);
  drawSunflower(ctx, x, y, size, color, glow, time, flashAmount);
}

// A handful of long, independently swaying vines, each ending in a
// small bud — purely decorative here (The Mangler's real grab mechanic
// is a plain damage/immobilize roll, not a per-vine simulation), but
// visually read as "the thing that's doing the grabbing" per the spec.
function drawManglerVines(ctx, x, y, size, time) {
  const vineCount = 4;
  for (let i = 0; i < vineCount; i += 1) {
    const baseAngle = (i / vineCount) * Math.PI * 2;
    const sway = Math.sin(time * 1.8 + i * 1.7) * 0.6;
    const len = size * 1.3;
    const startAngle = baseAngle;
    const endAngle = baseAngle + sway;
    const startX = x + Math.cos(startAngle) * size * 0.3;
    const startY = y + Math.sin(startAngle) * size * 0.3 * 0.6;
    const endX = x + Math.cos(endAngle) * len;
    const endY = y + Math.sin(endAngle) * len * 0.6;
    const ctrlAngle = endAngle + Math.PI / 2;
    const ctrlX = (startX + endX) / 2 + Math.cos(ctrlAngle) * size * 0.3;
    const ctrlY = (startY + endY) / 2 + Math.sin(ctrlAngle) * size * 0.3 * 0.6;

    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = Math.max(2, size * 0.1);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
    ctx.stroke();

    ctx.fillStyle = '#c2185b';
    ctx.beginPath();
    ctx.arc(endX, endY, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Rose's Prodigy ($45,000, direct request): the shared drawRose() body
// with tallStem forced on ("an extra-long stem" per the spec) plus the
// swinging vines above — drawn first/behind, same "rooted appendages
// render under the bloom" convention the regular vine-growing Thorn
// Path already follows.
function drawMangler(ctx, x, y, size, color, glow, time, flashAmount) {
  drawManglerVines(ctx, x, y, size, time);
  drawRose(ctx, x, y, size, color, glow, time, flashAmount, true, false, 0, false);
}

// A ring of soft, slowly rotating purple fog blobs circling the whole
// tower at a wide radius — the follow-up request's "purple fog/mist
// circling around it," distinct from drawMushroomGas's rising puff
// (anchored above the cap, drifts straight up) and sporeParticles'
// drifting flecks (tight orbit near the cap only): this one visibly
// sweeps around the tower's full body, flattened into an ellipse so it
// reads as mist swirling at ground level rather than steam off the cap.
function drawFungalMessMist(ctx, x, y, size, time) {
  const mistCount = 4;
  const radius = size * 1.1;
  for (let i = 0; i < mistCount; i += 1) {
    const angle = time * 0.5 + (i / mistCount) * Math.PI * 2;
    const mx = x + Math.cos(angle) * radius;
    const my = y + Math.sin(angle) * radius * 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2 + i);
    ctx.fillStyle = `rgba(171, 71, 182, ${0.18 + pulse * 0.12})`;
    ctx.beginPath();
    ctx.arc(mx, my, size * (0.28 + pulse * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }
}

// Mushroom's Prodigy ($60,000, direct request; visual revised per a
// follow-up spec — "a giant purple mushroom with a bunch of tiny
// mushrooms growing out of its body, and a purple fog/mist circling
// around it"): one big central mushroom (the same drawMushroom() body
// every tier of the base tower already uses, at full size) with several
// small sprouts clustered tight around its own base/stem — close enough
// to read as growing FROM it, not as separate same-size neighbors the
// way an earlier version of this tower drew its cluster — plus the
// circling mist above, drawn first/behind everything.
function drawFungalMess(ctx, x, y, size, color, glow, time, flashAmount) {
  drawFungalMessMist(ctx, x, y, size, time);
  drawMushroom(ctx, x, y, size, color, glow, time, flashAmount, 1, false, null, 1, false, 0, true);

  // The tiny sprouts are drawn LAST, on top of the main mushroom, at a
  // radius that pokes out just past its stem base — so they read as
  // growing out of its body instead of being hidden behind it.
  const sproutCount = 5;
  for (let i = 0; i < sproutCount; i += 1) {
    const angle = (i / sproutCount) * Math.PI * 2 + 0.4;
    const dist = size * 0.62;
    const sx = x + Math.cos(angle) * dist;
    const sy = y + size * 0.65 + Math.sin(angle) * dist * 0.3;
    drawMushroom(ctx, sx, sy, size * 0.22, shadeColor(color, i % 2 === 0 ? 20 : -10), null, time, 0, 1, false, null, 1, false, 0, false);
  }
}
