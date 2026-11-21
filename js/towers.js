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
            // 2nd balance pass (direct request: "make towers not
            // overpowered for their price" — a fresh, broader pass than
            // the one-time fix the comment on Molten Core below
            // describes). A $/DPS survey across every tower/path found
            // Fire Path still the single cheapest DPS in the game by a
            // wide margin even after that earlier nerf: Spark's own
            // attack-speed DOUBLING, stacking with Molten Core's own
            // SEPARATE speed boost right below (2.67x combined) on top of
            // this path's full 8x damage-multiplier chain (same chain
            // Solar Path's own 6x already carries), produced close to
            // 2x Solar's and 2.5x Storm's DPS for a comparable spend.
            // Softened from a flat halving (2x speed) to a 25% speedup
            // (1.25x) — Spark still reads as "noticeably snappier," just
            // not a second full damage axis stacked on top of the
            // existing 8x damage chain.
            name: 'Spark',
            description: 'Attack speed increases 25%; sunflower becomes slightly smaller and gains a small flame on its head.',
            cost: 50,
            effects: { attackIntervalMultiplier: 0.8, sizeMultiplier: 0.8, flame: 'small' },
          },
          {
            // No name given in the spec — picked to fit the magma-puddle
            // mechanic this upgrade introduces (the sunflower's building
            // internal heat, about to start erupting).
            name: 'Molten Core',
            description: 'Sunflower turns more orange; damage doubles; periodically spits a magma puddle that burns bugs standing in it.',
            cost: 300,
            effects: {
              color: '#ff7043',
              // This tier's own attackIntervalMultiplier (a SECOND speed
              // boost on top of Spark's) was removed entirely in the 2nd
              // balance pass above — see Spark's own comment for the full
              // reasoning. The path's damage already doubles 3 separate
              // times (here, Flamewall, Wildfire); it doesn't also need a
              // second speed axis stacked alongside that chain.
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
              'A second vine grows, each now bristling with more thorns; rose grows 25% bigger; base attack damage ' +
              'doubles; each vine now hits for 4.',
            cost: 500,
            // 2nd balance pass (direct request: "make towers not
            // overpowered for their price") — see purchaseUpgrade()'s own
            // comment on effects.vineDamage for the full reasoning. Vine
            // damage now grows on its own explicit, much gentler curve
            // (2 -> 4 -> 6 -> 8) instead of compounding with this path's
            // own damageMultiplier chain the way it used to (which would
            // have put it at 16/vine here, 8x the original).
            effects: { addVines: 1, moreThorns: true, sizeMultiplier: 1.25, damageMultiplier: 2, vineDamage: 4 },
          },
          {
            name: 'Overgrowth',
            description:
              'Three more vines grow (5 total); rose grows 50% bigger; vines reach twice as far; base attack ' +
              'damage doubles again; each vine now hits for 6.',
            cost: 1250,
            // vineRangeMultiplier is a real mechanical range boost for the
            // vines specifically (not just a visual flourish) — judgment
            // call per the brief, since "how far the vines reach" reads as
            // gameplay-relevant once there's an actual attack tied to them.
            effects: { addVines: 3, sizeMultiplier: 1.5, vineRangeMultiplier: 2, damageMultiplier: 2, vineDamage: 6 },
          },
          {
            name: 'Vigorous',
            description:
              'Three more vines grow (8 total); the stem grows taller; base attack damage doubles once more; ' +
              'each vine now hits for 8.',
            cost: 2250,
            effects: { addVines: 3, tallStem: true, damageMultiplier: 2, vineDamage: 8 },
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
  // Corpse Flower (direct request): a brand-new 5th base tower, $750 to
  // place, 10 damage/sec baseline. All 3 of its mutually-exclusive paths
  // arrived across separate follow-ups (Hazard, then Acidic Mixture, then
  // Growth), same one-path-at-a-time pattern Mushroom's own paths used —
  // each left as null until its own request landed.
  corpseFlower: {
    name: 'Corpse Flower',
    baseStats: {
      damage: 10,
      size: 26, // big and fleshy — see drawCorpseFlower()
      color: '#8c3522', // deep brick-red/rust-red, matching the real Rafflesia reference photo
      range: 160,
      attackInterval: 1, // 10 damage once a second = 10 dps baseline, the literal spec
    },
    upgradePaths: [
      {
        name: 'Hazard Path',
        upgrades: [
          {
            name: 'Hazard',
            description: 'Corpse Flower turns more green and grows spikes; base attack damage becomes 20/sec.',
            cost: 1500,
            // attackDamage is an ABSOLUTE replace, same convention as
            // income/zombifyChance/aura below — the spec states each
            // tier's own new damage outright ("it deals 20 damage now"),
            // not a multiplier on the last. Deliberately a different key
            // from the existing damageMultiplier (which COMPOUNDS) so the
            // two conventions never get confused with each other.
            effects: { attackDamage: 20, hasSpikes: true, color: '#5a7a3a' },
          },
          {
            name: 'Pre-caution',
            description:
              'Corpse Flower turns completely green and grows slightly taller; a deadly gas now circles it, dealing 3 damage every 0.2s (15 dps) to anything standing inside it — independent of, and on top of, its own attack, which becomes 25/sec.',
            cost: 4000,
            // gasCloud is a whole-object REPLACE (same convention as
            // puddle/aura/infectStun above) — a persistent, always-on
            // AoE damage zone centered on the tower itself, distinct
            // from its own attack/range. See updateTowerGasCloud() in
            // game.js; GAS_CLOUD_TICK_INTERVAL (this file) is the fixed
            // 0.2s cadence every tier shares — only damagePerTick/radius/
            // color change tier to tier, never the interval itself.
            effects: {
              attackDamage: 25,
              color: '#3d6b2e',
              gasCloud: { radius: 70, damagePerTick: 3, color: 'rgba(124, 179, 66, 0.4)' },
            },
          },
          {
            name: 'Eminent Chamber',
            description:
              'Corpse Flower glows, and the gas around it grows and now deals 5 damage every 0.2s (25 dps); its own attack becomes 30/sec.',
            cost: 8500,
            effects: {
              attackDamage: 30,
              glow: '#8bc34a',
              gasCloud: { radius: 100, damagePerTick: 5, color: 'rgba(124, 179, 66, 0.4)' },
            },
          },
          {
            name: 'Gas Leak',
            description:
              'Corpse Flower grows taller, turns yellow, and glows more; its gas turns bright yellow and now deals 7 damage every 0.2s (35 dps); its own attack becomes 45/sec.',
            cost: 15000,
            effects: {
              attackDamage: 45,
              color: '#c9a227',
              glow: '#ffeb3b',
              gasCloud: { radius: 100, damagePerTick: 7, color: 'rgba(255, 235, 59, 0.45)' },
            },
          },
        ],
      },
      // Acidic Mixture Path (direct request, mutually exclusive with
      // Hazard Path above): a second, independent damage source — a
      // distinct acid projectile fired on its own fixed 2-second cooldown
      // (ACID_SHOT_INTERVAL, this file), completely separate from the
      // base attack's own cadence, dealing its own damage AND applying a
      // timed speed-slow debuff (applySlow()/enemy.slow, enemies.js — a
      // genuinely new mechanic, distinct from the existing
      // immobilizedRemaining full-stop) on hit. See updateTowerAcidShot()/
      // spawnAcidProjectile() in game.js for the firing/travel/impact
      // logic, and resolveProjectile()'s own `if (projectile.slow)`
      // branch for where the debuff is actually applied.
      //
      // attackDamage is the SAME absolute-replace key Hazard Path's own
      // base-attack damage uses (7 -> 15 -> 20 -> 20) — note tier 1's own
      // 7 is LOWER than the unupgraded tower's base 10 damage, per the
      // user's literal numbers: a deliberate early trade-off for the acid
      // utility, not a bug. acid.slowMultiplier is the FRACTION of normal
      // speed while slowed (0.8/0.7/0.65/0.65 for "slows them 20/30/35/
      // 35%"); acid.slowDuration only changes at tier 4 (5s -> 7s).
      // sizeMultiplier (tier 1, "larger") and color (every tier, "darker")
      // are the same generic effects fields every other tower's paths
      // already use. Extra petals (tier 3+) and the taller stem (tier 2+,
      // shared with Hazard Path's own height-growth tiers — see
      // drawCorpseFlower()'s own comment) are driven directly off
      // upgradesPurchased in the render call (towers.js:drawTower), the
      // same way hasSpikes/hazardTier already are for Hazard Path, rather
      // than needing their own effects flags.
      {
        name: 'Acidic Mixture Path',
        upgrades: [
          {
            name: 'Acidic Mixture',
            description:
              'Corpse Flower turns darker and larger; it now spits acid that deals 5 damage and slows an enemy 20% for 5 seconds, and its base attack deals 7 damage.',
            cost: 1500,
            effects: {
              attackDamage: 7,
              sizeMultiplier: 1.15,
              color: '#6b2818',
              acid: { damage: 5, slowMultiplier: 0.8, slowDuration: 5, color: '#9ccc65' },
            },
          },
          {
            name: 'Acid Reflux',
            description:
              'Corpse Flower drips acid and grows taller and darker; the slow now reaches 30% and the acid deals 10 damage, with its base attack dealing 15 damage.',
            cost: 4000,
            effects: {
              attackDamage: 15,
              color: '#4a1c10',
              acid: { damage: 10, slowMultiplier: 0.7, slowDuration: 5, color: '#9ccc65' },
            },
          },
          {
            name: 'Acidtonics',
            description:
              'The acid turns red and the plant starts growing extra petals, turning darker; the slow now reaches 35% and the acid deals 15 damage, with its base attack dealing 20 damage.',
            cost: 8500,
            effects: {
              attackDamage: 20,
              color: '#331208',
              acid: { damage: 15, slowMultiplier: 0.65, slowDuration: 5, color: '#e53935' },
            },
          },
          {
            name: 'Dissolvable Mixture',
            description:
              'The acid glows red and the flower grows more petals and taller; the acid now lasts 7 seconds, still dealing 15 damage and a 35% slow, with its base attack still dealing 20 damage. The acid is its own separate projectile, fired once every 2 seconds.',
            cost: 15000,
            effects: {
              attackDamage: 20,
              glow: '#ff5252',
              acid: { damage: 15, slowMultiplier: 0.65, slowDuration: 7, color: '#e53935' },
            },
          },
        ],
      },
      // Growth Path (direct request): Corpse Flower's 3rd and final path,
      // mutually exclusive with Hazard/Acidic Mixture above. Pure damage
      // scaling with no secondary mechanic of its own (no gas, no acid
      // projectile) — every tier's own attackDamage is the SAME absolute-
      // replace key the other two paths use. Grows taller at EVERY tier
      // (not just tiers 2/4 like Hazard/Acidic — see drawCorpseFlower()'s
      // own comment for why this path's height formula is a separate,
      // continuous one), since "makes tower taller" is explicitly in the
      // user's own wording for 3 of its 4 tiers running, unlike either
      // other path. Giantness (tier 3) grows two small satellite blooms
      // next to the main one — "grows more stems with flowers," read
      // literally as more (smaller) complete flowers, not just more
      // petals on the one head (that's Acidic Mixture's own tier 3/4
      // trait, drawCorpseFlowerHead's extraPetalCount) — reuses
      // drawCorpseFlowerHead() directly at a smaller scale rather than a
      // new function. Color turns pink at tier 2 ("Growth Spurt") and
      // purple at tier 4 ("Titan Arum") — the real Titan Arum is the
      // actual common name for the corpse flower species this tower is
      // modeled on, so naming the final, biggest tier after it is a
      // direct nod, not a coincidence. Growth Spurt (tier 2) is also the
      // only tier that touches range (the generic rangeMultiplier effect,
      // same as every other tower's own range-boosting tiers).
      {
        name: 'Growth Path',
        upgrades: [
          {
            name: 'Sproutful',
            description: 'Corpse Flower grows taller; base attack damage becomes 25/sec.',
            cost: 1500,
            effects: { attackDamage: 25 },
          },
          {
            name: 'Growth Spurt',
            description:
              'Corpse Flower grows taller and its flower turns pink; range increases 40%; base attack damage becomes 45/sec.',
            cost: 4000,
            effects: { attackDamage: 45, color: '#d81b94', rangeMultiplier: 1.4 },
          },
          {
            name: 'Giantness',
            description:
              'Corpse Flower grows taller still and sprouts two more stems, each with its own small flower; base attack damage becomes 70/sec.',
            cost: 8500,
            effects: { attackDamage: 70 },
          },
          {
            name: 'Titan Arum',
            description:
              "Corpse Flower's flowers all turn purple and it deals a lot more damage; base attack damage becomes 120/sec.",
            cost: 15000,
            effects: { attackDamage: 120, color: '#6a1b9a' },
          },
        ],
      },
    ],
  },
  // Arctic Willow (direct request, from a real reference photo sent
  // directly — a willow catkin, not a round flower head like every other
  // base tower): a brand-new 6th base tower, $80 to place, 3 damage/sec
  // baseline ("3 damage every second," the same literal "every second"
  // phrasing Mushroom's own base stats already use). Only one upgrade
  // path given so far (named "Frosted Path" after its own first tier,
  // Frosted — not named as a whole by the user, same "pick a name
  // matching the convention" treatment Rose's own unnamed Thorn Path
  // got) — the other two are left null, same "arrives across separate
  // follow-ups" pattern Corpse Flower's own 3 paths used.
  //
  // Frosted Path is a crowd-control/slow path, not a pure damage path —
  // every tier's own "deals more damage" is read as a modest
  // damageMultiplier (same compounding convention Sunflower/Rose's own
  // paths already use, since no literal numbers were given, unlike Corpse
  // Flower's own absolute-replace attackDamage), while the REAL payoff is
  // the stacking slow effect. slow is a whole-object replace each tier
  // (same convention as acid/gasCloud above) — tower.slow rides along on
  // every ordinary hit via the generalized projectile.slow pipeline (see
  // spawnProjectile()/resolveProjectile() in game.js), not a separate
  // attack. Duration stays a flat 3s ("a couple seconds") at every tier —
  // only the slow's own intensity changes tier to tier, since the user
  // only ever said "slow down more," never a longer time. icicleCount
  // (tiers 1/3) is an absolute replacement (2 -> 5), same convention
  // Corpse Flower's own attackDamage/Mushroom's zombifyChance already
  // use. The tower only grows taller at tiers 1/3/4 — Frostbite (tier 2)
  // explicitly only changes color/slow/damage in the user's own wording,
  // no height mentioned — see drawArcticWillow()'s own heightMultiplier
  // formula for exactly how that's read off the tier number with no extra
  // field needed (same formula shape Corpse Flower's own drawCorpseFlower
  // already uses for its own skipped-tier height growth).
  arcticWillow: {
    name: 'Arctic Willow',
    baseStats: {
      damage: 3,
      size: 20,
      color: '#eef3f6', // pale frosty white, matching the reference photo's fuzzy catkin
      range: 170, // unspecified by the brief — matches every other base tower's own baseline
      attackInterval: 1, // "3 damage every second" baseline, as literally specified
    },
    upgradePaths: [
      {
        name: 'Frosted Path',
        upgrades: [
          {
            name: 'Frosted',
            description:
              'Enemies hit by Arctic Willow slow down for a few seconds; the plant gains a couple of icicles on ' +
              'its body, grows a bit taller, and deals a little more damage.',
            cost: 50,
            effects: { slow: { multiplier: 0.7, duration: 3 }, damageMultiplier: 1.3, icicleCount: 2 },
          },
          {
            name: 'Frostbite',
            description: 'Enemies hit slow down even more; Arctic Willow deals more damage and turns light blue.',
            cost: 250,
            effects: { slow: { multiplier: 0.5, duration: 3 }, damageMultiplier: 1.4, color: '#81d4fa' },
          },
          {
            name: 'Permafrost',
            description:
              'Enemies hit slow down further still; Arctic Willow deals more damage, gains more icicles, grows ' +
              'taller, and sprouts a ring of ice spikes pointing outward.',
            cost: 650,
            effects: { slow: { multiplier: 0.35, duration: 3 }, damageMultiplier: 1.5, icicleCount: 5, hasIceSpikes: true },
          },
          {
            name: 'Frosterizer',
            description:
              'Enemies hit slow down a brutal 90%; Arctic Willow deals more damage, grows taller again, and gains ' +
              'an icicle ring that circles around it.',
            cost: 1500,
            effects: { slow: { multiplier: 0.1, duration: 3 }, damageMultiplier: 1.6, hasIcicleRing: true },
          },
        ],
      },
      null,
      null,
    ],
  },
  // Prodigies (direct request, reworked from an earlier standalone-tower
  // design to an UPGRADE instead): one ultimate, 4th-tier form per base
  // type (Sunflower/Rose/Mushroom). Once a tower of one of these 3
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
  // Balance pass (direct request: "make prodigies actually worth the
  // money by making them deal more damage, attack faster etc"). A
  // roster-wide $/DPS survey found all 3 Prodigies dealt LESS raw DPS
  // than the base tower's own best maxed path they replace, for 8-12x
  // the total investment (path + Prodigy cost combined) — e.g. the old
  // Sunlit Conductor's 130 dps for $30,000 against a maxed Fire Path
  // Sunflower's own ~90-130 dps for $3,900. Every Prodigy below got a
  // real damage AND attack-speed increase (not just one or the other)
  // so each one now clearly outpaces its own lineage's best maxed path,
  // the whole point of spending real money on an "ultimate" upgrade.
  sunlitConductor: {
    name: 'The Sunlit Conductor',
    cost: 30000, // the price of the Prodigy UPGRADE itself — see getProdigyOption() in game.js
    baseStats: {
      damage: 150, // was 65
      size: 32,
      color: '#ffd700',
      range: 200,
      attackInterval: 0.35, // was 0.5 — 150 damage every 0.35s = ~429 dps (was 130)
    },
    baseAttackType: 'ray', // an instant, continuous-reading beam — see createTower()'s own comment
    upgradePaths: [null, null, null],
  },
  mangler: {
    name: 'The Mangler',
    cost: 45000,
    baseStats: {
      damage: 100, // was 40
      size: 30,
      color: '#ad1457',
      range: 200,
      attackInterval: 0.35, // was 0.5 — 100 damage every 0.35s = ~286 dps (was 80)
    },
    // Every 3s (was 5s): grabs one random non-boss enemy in range, holds
    // it 1s, 120 bonus damage (was 50) — additive on top of the
    // continuous dps above, not a replacement. "attack" in the stats
    // above refers to the base continuous attack, not this separate
    // periodic ability. See updateTowerGrab() in game.js.
    grabInterval: 3, // was 5
    grabDamage: 120, // was 50
    grabDuration: 1,
    upgradePaths: [null, null, null],
  },
  fungalMess: {
    name: 'The Fungal Mess',
    cost: 60000,
    baseStats: {
      damage: 130, // was 50
      size: 30,
      color: '#4a148c',
      range: 200,
      attackInterval: 0.4, // was 0.5 — 130 damage every 0.4s = 325 dps (was 100)
    },
    // 15% chance a killing blow reanimates the victim as a purple
    // zombie instead of it dying outright — see turnIntoPurpleZombie()
    // in enemies.js and resolveProjectile()'s own reanimateChance roll
    // in game.js (the same shape as Decay Path's zombifyChance roll,
    // deliberately a separate chance/flag so the two never collide).
    // Untouched by this pass — not a raw damage/speed stat, and Mushroom's
    // own lineage is already weak enough on raw DPS that a damage/speed
    // buff alone comfortably makes Fungal Mess worth it without also
    // needing a bigger reanimate chance.
    reanimateChance: 0.15,
    upgradePaths: [null, null, null],
  },
  // Corpse Flower's own Prodigy (direct request, from a real reference
  // photo sent directly — "a giant corpse flower... it will look like
  // this"): Corpse Flower never got one in the original Prodigy rollout
  // (see getProdigyOption()'s own comment in game.js, and the now-
  // outdated "Corpse Flower never gets a Prodigy option" test this change
  // also updates) — this is that missing 4th Prodigy. $100,000 — the
  // costliest tower in the game, roughly double The Fungal Mess's
  // $60,000, matching the user's own literal number rather than following
  // the other 3 Prodigies' $30k/$45k/$60k ladder.
  //
  // Three things the spec called for, each its own mechanic:
  // 1. A giant corpse flower that "looks like" the reference photo — a
  //    real Titan Arum (tall pale spadix spike + a wide ruffled maroon
  //    spathe skirt), NOT a scaled-up Rafflesia head (drawCorpseFlowerHead
  //    is a flat 5-petal pinwheel, a completely different real flower) —
  //    see drawAmorphophallusTitanum() below for the from-scratch art.
  // 2. "A gas ring around it" — read literally as a RING, not a filled
  //    disc like Hazard Path's own gasCloud: only damages an enemy whose
  //    distance from the tower falls between innerRadius and outerRadius.
  //    See updateTowerGasRing() in game.js.
  // 3. "It blooms and shoots acid at the bugs" (plural) — a periodic
  //    attack, independent of the base attack above, that visibly opens
  //    the flower (tower.bloomProgress drives drawAmorphophallusTitanum's
  //    own opening animation) and fires one acid projectile (the same
  //    slow-on-hit mechanic as Corpse Flower's own Acidic Mixture Path)
  //    at each of several different nearby bugs at once. See
  //    updateTowerBloom()/spawnBloomAcidProjectile() in game.js.
  amorphophallusTitanum: {
    name: 'Amorphophallus titanum',
    cost: 100000,
    baseStats: {
      damage: 200,
      size: 40, // the largest Prodigy — "giant" is explicit in the spec
      color: '#5c1a3d', // deep maroon/burgundy, matching the reference photo's spathe
      range: 220,
      attackInterval: 0.4, // 200 damage every 0.4s = 500 dps base — the highest base dps of any tower, matching its $100,000 price
    },
    // See updateTowerGasRing() in game.js — ticks on the same
    // GAS_CLOUD_TICK_INTERVAL cadence as Hazard Path's gasCloud, but only
    // hits an enemy standing between the two radii, never inside or past.
    gasRing: { innerRadius: 50, outerRadius: 95, damagePerTick: 8, color: 'rgba(216, 27, 96, 0.4)' },
    // See updateTowerBloom() in game.js. targetCount is how many
    // different enemies (closest first) one bloom fires acid at — "the
    // bugs," plural, read literally as several per bloom rather than one.
    bloom: { interval: 4, damage: 40, targetCount: 3, slowMultiplier: 0.5, slowDuration: 4, color: '#8e24aa' },
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
  amorphophallusTitanum: 'corpseFlower',
};

// Corpse Flower's Hazard Path gas cloud (and any future tower's own gas-
// cloud-style mechanic) always ticks on this fixed cadence — only a
// tier's damagePerTick/radius/color ever change, never the interval
// itself (see each tier's own effects.gasCloud in TOWER_TYPES above).
const GAS_CLOUD_TICK_INTERVAL = 0.2;

// Corpse Flower's Acidic Mixture Path: the acid projectile's own fixed
// firing cadence, explicitly stated by the user as "once every 2
// seconds" — completely independent of the tower's own base-attack
// cooldown (tower.stats.attackInterval). Only a tier's acid.damage/
// slowMultiplier/slowDuration ever change (see each tier's own
// effects.acid in TOWER_TYPES above), never this interval itself, same
// shape as GAS_CLOUD_TICK_INTERVAL just above.
const ACID_SHOT_INTERVAL = 2;

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
    // Corpse Flower's Hazard Path only. hasSpikes is purely visual (tier 1
    // and up, drawCorpseFlower()). gasCloud (tier 2 and up) is a whole-
    // object {radius, damagePerTick, color}, null until then — a
    // persistent, always-on AoE damage zone centered on the tower,
    // distinct from its own attack entirely (see updateTowerGasCloud() in
    // game.js, and GAS_CLOUD_TICK_INTERVAL above for the fixed cadence it
    // ticks on). gasCloudCooldown counts down to the next tick the same
    // "don't fire instantly on purchase" way every other periodic effect
    // in this file already does.
    hasSpikes: false,
    gasCloud: null,
    gasCloudCooldown: 0,
    // Corpse Flower's Acidic Mixture Path only (mutually exclusive with
    // Hazard Path above). acid is a whole-object {damage, slowMultiplier,
    // slowDuration}, null until that path's first tier — a distinct
    // projectile fired on its own fixed ACID_SHOT_INTERVAL cadence (see
    // updateTowerAcidShot() in game.js), completely separate from the
    // tower's own base attack. acidCooldown counts down to the next shot
    // the same "don't fire instantly on purchase" way every other
    // periodic effect in this file already does.
    acid: null,
    acidCooldown: 0,
    // Arctic Willow's Frosted Path only. slow is a whole-object
    // {multiplier, duration} replace each tier, null until the path's
    // first tier — rides along on the tower's own ordinary attack via the
    // generalized projectile.slow field (see spawnProjectile()/
    // resolveProjectile() in game.js), not a separate shot or its own
    // cooldown, unlike gasCloud/acid above. icicleCount (tiers 1/3) and
    // hasIceSpikes (tier 3)/hasIcicleRing (tier 4) are purely visual,
    // drawn by drawArcticWillow()/drawIcicleRing() in this file.
    slow: null,
    icicleCount: 0,
    hasIceSpikes: false,
    hasIcicleRing: false,
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
    // Amorphophallus titanum (Corpse Flower's Prodigy) only. gasRing is a
    // whole-object {innerRadius, outerRadius, damagePerTick, color}, null
    // for every other tower — a persistent ring-shaped (not filled-disc)
    // AoE damage zone centered on the tower, same "set once at creation,
    // no upgrade path to grant it later" convention grabInterval/
    // reanimateChance above already use for Prodigy-only fields. See
    // updateTowerGasRing() in game.js. gasRingCooldown starts at the
    // fixed GAS_CLOUD_TICK_INTERVAL, same "don't fire instantly" shape
    // tower.gasCloudCooldown above already follows.
    gasRing: type.gasRing || null,
    gasRingCooldown: type.gasRing ? GAS_CLOUD_TICK_INTERVAL : 0,
    // Amorphophallus titanum's bloom attack only: whole-object {interval,
    // damage, targetCount, slowMultiplier, slowDuration, color}, null for
    // every other tower. bloomCooldown starts at the bloom's own interval
    // (don't fire instantly); bloomProgress is a separate countdown (0
    // when idle) that drives the flower's own "just bloomed" opening
    // visual in drawAmorphophallusTitanum() — distinct from attackFlash,
    // since this is a much slower, longer pulse than the base attack's.
    bloom: type.bloom || null,
    bloomCooldown: type.bloom ? type.bloom.interval : 0,
    bloomProgress: 0,
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
    // Applies to thorn-shot damage too (Projectile Path), same "on top of
    // current" stacking as the base attack — it doesn't have its own
    // separate damageMultiplier chain, it just rides along with the
    // tower's. Vine damage USED to ride along here the same way, but see
    // effects.vineDamage below for why that changed in the balance pass.
    if (tower.thornShotDamage) tower.thornShotDamage *= effects.damageMultiplier;
  }
  // Thorn Path's vine damage: 2nd balance pass (direct request: "make
  // towers not overpowered for their price"). This used to compound with
  // the path's own damageMultiplier chain exactly like the base attack
  // above — fine in isolation, but with 8 separate vines all getting the
  // SAME full 8x compounding (2x at Puncture, 2x at Overgrowth, 2x at
  // Vigorous) by tier 4, the vines alone dealt ~128 dps, more than double
  // the base attack's own 53 — the single worst $/DPS outlier found in
  // the whole roster (worse than the already-nerfed Sunflower Fire Path).
  // Switched to an explicit absolute-replace per tier instead (same
  // convention Corpse Flower's attackDamage/Mushroom's zombifyChance
  // already use) — each tier still states real growth (2 -> 4 -> 6 -> 8),
  // just not blind exponential compounding across 8 simultaneous hits.
  if (effects.vineDamage !== undefined) tower.vineDamage = effects.vineDamage;
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

  // Corpse Flower's Hazard Path: attackDamage is an absolute replace (see
  // its own TOWER_TYPES comment for why this is a different key from the
  // compounding damageMultiplier every other tower's paths use).
  if (effects.attackDamage !== undefined) tower.stats.damage = effects.attackDamage;
  if (effects.hasSpikes) tower.hasSpikes = true;
  if (effects.gasCloud) {
    tower.gasCloud = effects.gasCloud;
    tower.gasCloudCooldown = GAS_CLOUD_TICK_INTERVAL; // don't fire instantly on purchase
  }
  // Corpse Flower's Acidic Mixture Path: a whole-object replace (same
  // convention as gasCloud/puddle/spark/shockwave above) — see
  // updateTowerAcidShot()/spawnAcidProjectile() in game.js for the actual
  // firing/travel/impact logic, and ACID_SHOT_INTERVAL just below for why
  // this tower's own fixed firing cadence is never itself part of the
  // effects object (it never changes tier to tier, same as
  // GAS_CLOUD_TICK_INTERVAL never does for Hazard Path's gas).
  if (effects.acid) {
    tower.acid = effects.acid;
    tower.acidCooldown = ACID_SHOT_INTERVAL; // don't fire instantly on purchase
  }
  // Arctic Willow's Frosted Path: a whole-object replace (same convention
  // as gasCloud/acid above) — no cooldown of its own to reset, since it
  // isn't a separate periodic shot; it just rides along on the tower's
  // ordinary attack from here on (see spawnProjectile() in game.js).
  if (effects.slow) tower.slow = effects.slow;
  // icicleCount REPLACES the previous value (each tier states its own new
  // count outright — "a couple," then "more"), same convention
  // zombifyChance/attackDamage above already use. hasIceSpikes/
  // hasIcicleRing are purely visual, same boolean-flag convention as
  // hasSpikes/hasSkull above.
  if (effects.icicleCount !== undefined) tower.icicleCount = effects.icicleCount;
  if (effects.hasIceSpikes) tower.hasIceSpikes = true;
  if (effects.hasIcicleRing) tower.hasIcicleRing = true;

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
  } else if (tower.type === 'corpseFlower') {
    // The gas cloud is drawn first/behind the tower itself — a backdrop
    // the flower sits inside, same "ambient effect renders under the
    // tower's own body" convention the Prodigies' own backdrops
    // (drawRotatingSun, drawManglerVines, drawFungalMessMist) already use.
    if (tower.gasCloud) drawGasCloud(ctx, x, y, tower.gasCloud.radius, tower.gasCloud.color, time);
    drawCorpseFlower(
      ctx,
      x,
      y,
      size,
      tower.stats.color,
      tower.glow,
      time,
      flashAmount,
      tower.hasSpikes,
      // Hazard Path's own tiered height growth is gated the same way
      // Coupons Path's (above) and Infect Path's own tiered art are —
      // chosenPath + upgradesPurchased directly, no extra per-tier field.
      tower.chosenPath === 0 ? tower.upgradesPurchased : 0,
      // Acidic Mixture Path's own tiered art (extra petals/drips/height) —
      // same chosenPath + upgradesPurchased gating, just path index 1.
      tower.chosenPath === 1 ? tower.upgradesPurchased : 0,
      // Growth Path's own tiered art (satellite blooms/continuous height)
      // — same chosenPath + upgradesPurchased gating, just path index 2.
      tower.chosenPath === 2 ? tower.upgradesPurchased : 0
    );
  } else if (tower.type === 'arcticWillow') {
    // Frosterizer's icicle ring is drawn first/behind the tower itself —
    // same "ambient circling effect renders under the tower's own body"
    // convention Corpse Flower's own gasCloud/gas ring already use.
    if (tower.hasIcicleRing) drawIcicleRing(ctx, x, y, size, time);
    drawArcticWillow(
      ctx,
      x,
      y,
      size,
      tower.stats.color,
      tower.glow,
      time,
      flashAmount,
      tower.icicleCount,
      tower.hasIceSpikes,
      // Frosted Path's own tiered height growth — same chosenPath +
      // upgradesPurchased gating every other tower's own tiered art uses.
      tower.chosenPath === 0 ? tower.upgradesPurchased : 0
    );
  } else if (tower.type === 'sunlitConductor') {
    drawSunlitConductor(ctx, x, y, size, tower.stats.color, tower.glow, time, flashAmount);
  } else if (tower.type === 'mangler') {
    drawMangler(ctx, x, y, size, tower.stats.color, tower.glow, time, flashAmount);
  } else if (tower.type === 'fungalMess') {
    drawFungalMess(ctx, x, y, size, tower.stats.color, tower.glow, time, flashAmount);
  } else if (tower.type === 'amorphophallusTitanum') {
    // The gas ring is drawn first/behind the flower itself — same
    // "ambient effect renders under the tower's own body" convention
    // Corpse Flower's own gasCloud (and the other Prodigies' own
    // backdrops) already use.
    if (tower.gasRing) {
      drawGasRing(ctx, x, y, tower.gasRing.innerRadius, tower.gasRing.outerRadius, tower.gasRing.color, time);
    }
    drawAmorphophallusTitanum(ctx, x, y, size, tower.stats.color, tower.glow, time, flashAmount, tower.bloomProgress);
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

// --- Corpse Flower -------------------------------------------------------

// A persistent, slowly pulsing filled circle plus a dashed outline ring —
// the Hazard Path's gas cloud (tier 2+), a genuinely new reusable mechanic
// (a tower-centered, always-on AoE damage zone, independent of the
// tower's own attack — see updateTowerGasCloud() in game.js) distinct
// from every existing aura/puddle/pulse visual in this file: unlike
// Mushroom's auraRingRadius (a thin dashed ring only, no fill, and it
// doesn't deal damage itself), Sunflower's puddle (spawned at a target's
// location and expires), or Storm Path's shockwave (a single brief
// expanding/fading pulse), this one sits fixed on the tower and is
// visibly, continuously "there" the whole time it's active.
function drawGasCloud(ctx, x, y, radius, color, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 1.2);
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.18 + pulse * 0.1;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// Rafflesia redesign (direct request, from a real reference photo): 5
// large, thick, fleshy petals splayed outward in a star/pinwheel pattern
// around a central cavity — a flat, ground-hugging flower seen from
// above/a slight angle, not a tall stem-and-bloom shape (drawCorpseFlower
// below still gives it a short stem so it has somewhere to visually
// "grow taller" at Hazard Path tiers 2/4, but the stem is deliberately
// short so this head — the actual flower — dominates the frame). Petal
// color comes from `color` (tier-driven, same as before: deep brick-red
// at the base tier, shifting green/yellow through Hazard Path); the dense
// pale cream wart/bump texture covering every petal edge-to-edge is drawn
// in a near-fixed off-white regardless of tier, since that mottled,
// diseased-looking rash texture — not the petals' own hue — is the single
// most distinctive trait of the reference and the one thing that has to
// survive every recolor for this to still read as the same flower at
// every tier. Petal edges are wavy/irregular (quadratic curves, not a
// smooth oval) with a curled tip, and the whole thing reads unsettling
// rather than pretty, in keeping with the tower's gas/hazard theme.
const CORPSE_FLOWER_PETAL_COUNT = 5;
const CORPSE_FLOWER_WART_COLOR = '#ded0ab';

function drawCorpseFlowerPetal(ctx, size, color) {
  const length = size * 1.4;
  const width = size * 0.68;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size * 0.12, -width * 0.32);
  ctx.quadraticCurveTo(length * 0.4, -width * 0.6, length * 0.82, -width * 0.24);
  ctx.quadraticCurveTo(length * 1.08, -width * 0.08, length * 0.95, width * 0.04); // curled tip
  ctx.quadraticCurveTo(length * 0.78, width * 0.3, length * 0.42, width * 0.56);
  ctx.quadraticCurveTo(size * 0.25, width * 0.4, size * 0.12, width * 0.3);
  ctx.closePath();
  ctx.fill();

  // Darker shading along the trailing edge — depth, not a flat cutout.
  ctx.fillStyle = shadeColor(color, -22);
  ctx.beginPath();
  ctx.moveTo(size * 0.18, width * 0.28);
  ctx.quadraticCurveTo(length * 0.5, width * 0.5, length * 0.88, width * 0.1);
  ctx.quadraticCurveTo(length * 0.5, width * 0.22, size * 0.18, width * 0.28);
  ctx.closePath();
  ctx.fill();

  // The dense, raised, pale wart/bump texture — covers the petal surface
  // edge-to-edge, the reference's own single most distinctive trait.
  ctx.fillStyle = CORPSE_FLOWER_WART_COLOR;
  const wartRows = 4;
  const wartCols = 6;
  for (let row = 0; row < wartRows; row += 1) {
    for (let col = 0; col < wartCols; col += 1) {
      const t = (col + 0.5) / wartCols; // 0 (base) -> 1 (tip)
      const s = (row + 0.5) / wartRows - 0.5; // -0.5 .. 0.5 across the width
      const taper = 1 - t * 0.35; // petal narrows toward its tip
      const wx = size * 0.2 + t * length * 0.82;
      const wy = s * width * 0.78 * taper;
      ctx.beginPath();
      ctx.arc(wx, wy, size * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCorpseFlowerHead(ctx, x, y, size, color, hasSpikes, acidTier = 0) {
  for (let i = 0; i < CORPSE_FLOWER_PETAL_COUNT; i += 1) {
    const angle = (i / CORPSE_FLOWER_PETAL_COUNT) * Math.PI * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    drawCorpseFlowerPetal(ctx, size, color);
    ctx.restore();
  }

  // Acidic Mixture Path tier 3+: smaller extra petals growing into the
  // gaps between the original 5 — "the plant starts growing extra
  // petals" (tier 3, 2 of the 5 gaps filled), "grows more petals" (tier
  // 4, 4 of the 5 filled) — progressively more, not a one-time add.
  const extraPetalCount = acidTier >= 4 ? 4 : acidTier >= 3 ? 2 : 0;
  for (let i = 0; i < extraPetalCount; i += 1) {
    const angle = ((i + 0.5) / CORPSE_FLOWER_PETAL_COUNT) * Math.PI * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(0.6, 0.6); // smaller than the original 5 — reads as newer growth
    drawCorpseFlowerPetal(ctx, size, color);
    ctx.restore();
  }

  // Acidic Mixture Path tier 2+: a few drips of the acid itself (not the
  // flower's own body color) hanging off the outer rim — "drips acid."
  // Toxic green-yellow through tier 2, turning red from tier 3 on ("the
  // acid turns red") — matches the acid projectile's own color exactly
  // (see spawnAcidProjectile() in game.js).
  if (acidTier >= 2) {
    ctx.fillStyle = acidTier >= 3 ? '#e53935' : '#9ccc65';
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + 0.6;
      const bx = x + Math.cos(angle) * size * 1.25;
      const by = y + Math.sin(angle) * size * 1.1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + size * 0.05, by + size * 0.25, bx, by + size * 0.4);
      ctx.quadraticCurveTo(bx - size * 0.05, by + size * 0.25, bx, by);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Hazard Path tier 1+: a ring of spikes poking out past the petals' own
  // outer edge, offset between petals so they read as a separate feature
  // rather than overlapping one.
  if (hasSpikes) {
    ctx.fillStyle = shadeColor(color, -35);
    for (let i = 0; i < CORPSE_FLOWER_PETAL_COUNT; i += 1) {
      const angle = (i / CORPSE_FLOWER_PETAL_COUNT) * Math.PI * 2 + Math.PI / CORPSE_FLOWER_PETAL_COUNT;
      const bx = x + Math.cos(angle) * size * 1.5;
      const by = y + Math.sin(angle) * size * 1.5;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.1);
      ctx.lineTo(size * 0.26, 0);
      ctx.lineTo(0, size * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Central cavity, drawn last (on top) since every petal converges into
  // it. Refined against the user's own real reference photo (sent
  // directly, not just described): the hole isn't a flat ring-then-black
  // jump — it reads in layers, outside-in: a pale spiky/hairy filament
  // ring right at the rim, a reddish-orange diaphragm band just inside
  // that (the photo's own visible "inner throat" texture, not a flat
  // color — directly where that single ring used to cut straight to
  // near-black), then near-black and finally pure black sunk deepest.
  ctx.strokeStyle = '#e8d9a8';
  ctx.lineWidth = Math.max(1.5, size * 0.065);
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * size * 0.3, y + Math.sin(angle) * size * 0.3);
    ctx.lineTo(x + Math.cos(angle) * size * 0.46, y + Math.sin(angle) * size * 0.46);
    ctx.stroke();
  }

  ctx.fillStyle = '#b5503a';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#140d08';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

// Corpse Flower's base tower art: a short stem (growing taller at tiers
// 2 and 4 of Hazard/Acidic Mixture Path, whichever is active — both use
// the identical cadence, so one shared formula covers both; growTier is
// a separate, continuous formula — Growth Path's own tiers 1-3 all say
// "taller" outright, unlike either other path's occasional restating —
// hazardTier/acidTier/growthTier are mutually exclusive since a tower
// only ever has one chosenPath, same chosenPath+upgradesPurchased tier-
// gating Coupons Path and Infect Path already use, no extra per-tier
// field needed) topped with the Rafflesia head above. The base-tier stem
// is deliberately short (the real flower is flat/ground-hugging, not a
// tall stem-and-bloom shape) — the height growth at later tiers still
// reads clearly relative to this shorter base, it's just no longer tall
// enough at tier 0 to fight the "ground-hugging" read of the head itself.
function drawCorpseFlower(
  ctx,
  x,
  y,
  size,
  color,
  glow,
  time,
  flashAmount,
  hasSpikes,
  hazardTier,
  acidTier = 0,
  growthTier = 0
) {
  const pathTier = Math.max(hazardTier, acidTier);
  const heightMultiplier =
    growthTier > 0 ? 1 + growthTier * 0.15 : pathTier >= 4 ? 1.5 : pathTier >= 2 ? 1.2 : 1;
  const stemHeight = size * 0.3 * heightMultiplier;
  const groundY = y + stemHeight;
  const sway = Math.sin(time * 1 + x * 0.009) * 0.04;

  ctx.save();
  ctx.translate(x, groundY);
  ctx.rotate(sway);
  ctx.translate(-x, -groundY);

  ctx.fillStyle = '#4a3a2a';
  ctx.strokeStyle = '#2e2318';
  ctx.lineWidth = 1;
  ctx.fillRect(x - size * 0.1, y, size * 0.2, stemHeight);
  ctx.strokeRect(x - size * 0.1, y, size * 0.2, stemHeight);

  ctx.translate(x, y);
  ctx.scale(1 + flashAmount * 0.15, 1 + flashAmount * 0.15);
  ctx.translate(-x, -y);

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 20;
  }

  // Growth Path tier 3+ ("Giantness," "grows more stems with flowers"):
  // two small satellite blooms, each a full (smaller) Rafflesia head in
  // its own right — read literally as more complete flowers growing in,
  // not just more petals on the one head (that's Acidic Mixture's own
  // trait — see drawCorpseFlowerHead's extraPetalCount). Drawn before the
  // main head so the main one still reads as the focal point on top.
  if (growthTier >= 3) {
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(x + side * size * 1.3, y + size * 0.3);
      ctx.scale(0.45, 0.45);
      drawCorpseFlowerHead(ctx, 0, 0, size, color, false);
      ctx.restore();
    });
  }

  drawCorpseFlowerHead(ctx, x, y, size, color, hasSpikes, acidTier);

  ctx.restore();
}

// --- Arctic Willow ---------------------------------------------------------

// Arctic Willow's base tower art, from a real reference photo sent
// directly: a willow catkin's own actual shape — a tall fuzzy white
// spike dotted with small curled red/pink marks — not a round flower
// head like every other base tower in the game. WILLOW_CATKIN_MARK_COUNT
// fixes how many of those curled marks are drawn; the fuzz itself is a
// ring of short radiating strokes rather than individually hand-placed,
// so it reads as texture rather than a countable feature.
const WILLOW_CATKIN_MARK_COUNT = 10;

// The catkin itself, plus Frosted Path's own 3 visual add-ons: icicles
// hanging loosely off the body (icicleCount, tiers 1/3 — a plain
// absolute count, not a formula, since the user's own wording jumps from
// "a couple" straight to "more" with no implied rate), and a ring of ice
// spikes pointing straight outward past its edges (hasIceSpikes, tier
// 3) — deliberately a different read from the icicles above (loose vs.
// a neat radiating ring), matching the user's own "icicles on its body"
// vs. "ice spikes pointing outward" distinction.
function drawArcticWillowCatkin(ctx, x, y, size, color, icicleCount, hasIceSpikes) {
  const catkinHeight = size * 1.5;
  const catkinWidth = size * 0.55;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y - catkinHeight * 0.5, catkinWidth * 0.5, catkinHeight * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // A soft fuzzy texture: short strokes just past the body's own outline,
  // all over its surface, reading as the real catkin's own fine white
  // fuzz rather than a flat smooth surface.
  ctx.strokeStyle = shadeColor(color, -8);
  ctx.lineWidth = 1;
  for (let i = 0; i < 24; i += 1) {
    const t = i / 24;
    const angle = t * Math.PI * 2;
    const spread = Math.abs(Math.sin(t * Math.PI * 3));
    const cx = x + Math.cos(angle) * catkinWidth * 0.5 * spread;
    const cy = y - catkinHeight * (0.05 + t * 0.9);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * 3, cy + Math.sin(angle) * 1.5);
    ctx.stroke();
  }

  // The small curled red/pink marks scattered across the body — the real
  // catkin's own visible stigmas, read directly off the reference photo.
  ctx.strokeStyle = '#c2185b';
  ctx.lineWidth = Math.max(1, size * 0.04);
  for (let i = 0; i < WILLOW_CATKIN_MARK_COUNT; i += 1) {
    const t = (i + 0.5) / WILLOW_CATKIN_MARK_COUNT;
    const side = i % 2 === 0 ? -1 : 1;
    const mx = x + side * catkinWidth * 0.32;
    const my = y - catkinHeight * (0.08 + t * 0.85);
    ctx.beginPath();
    ctx.arc(mx, my, size * 0.05, 0.3, Math.PI * 1.4);
    ctx.stroke();
  }

  if (icicleCount > 0) {
    ctx.fillStyle = '#b3e5fc';
    for (let i = 0; i < icicleCount; i += 1) {
      const t = (i + 0.5) / icicleCount;
      const side = i % 2 === 0 ? -1 : 1;
      const ix = x + side * catkinWidth * 0.5;
      const iy = y - catkinHeight * (0.15 + t * 0.7);
      ctx.beginPath();
      ctx.moveTo(ix, iy - size * 0.05);
      ctx.lineTo(ix + side * size * 0.18, iy);
      ctx.lineTo(ix, iy + size * 0.05);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (hasIceSpikes) {
    ctx.fillStyle = '#e1f5fe';
    const spikeCount = 6;
    for (let i = 0; i < spikeCount; i += 1) {
      const angle = (i / spikeCount) * Math.PI * 2;
      const baseX = x + Math.cos(angle) * catkinWidth * 0.5;
      const baseY = y - catkinHeight * 0.5 + Math.sin(angle) * catkinHeight * 0.5;
      ctx.save();
      ctx.translate(baseX, baseY);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.1);
      ctx.lineTo(size * 0.35, 0);
      ctx.lineTo(0, size * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

// Arctic Willow's full tower: a short woody stem with a couple of green
// leaves at its base (the same stem+leaves skeleton drawSunflower/
// drawRose/drawMushroom already use), topped with the catkin above.
// frostTier drives the height growth formula — Frosted Path grows the
// plant taller at tiers 1/3/4 only (Frostbite, tier 2, explicitly only
// changes color/slow/damage in the user's own wording, so the formula
// below deliberately gives tier 2 the same height as tier 1, same
// "skipped tier" shape drawCorpseFlower's own heightMultiplier already
// uses for Hazard/Acidic Mixture Path).
function drawArcticWillow(ctx, x, y, size, color, glow, time, flashAmount, icicleCount, hasIceSpikes, frostTier) {
  const heightMultiplier = frostTier >= 4 ? 1.5 : frostTier >= 3 ? 1.3 : frostTier >= 1 ? 1.15 : 1;
  const stemHeight = size * 1.1 * heightMultiplier;
  const groundY = y + stemHeight;
  const sway = Math.sin(time * 1.2 + x * 0.011) * 0.05;

  ctx.save();
  ctx.translate(x, groundY);
  ctx.rotate(sway);
  ctx.translate(-x, -groundY);

  ctx.fillStyle = '#6d4c35';
  ctx.strokeStyle = '#4e3524';
  ctx.lineWidth = 1;
  ctx.fillRect(x - size * 0.07, y, size * 0.14, stemHeight);
  ctx.strokeRect(x - size * 0.07, y, size * 0.14, stemHeight);

  ctx.fillStyle = '#4a7c3a';
  ctx.beginPath();
  ctx.ellipse(x - size * 0.3, y + stemHeight * 0.5, size * 0.26, size * 0.11, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + size * 0.3, y + stemHeight * 0.7, size * 0.26, size * 0.11, 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(x, y);
  ctx.scale(1 + flashAmount * 0.15, 1 + flashAmount * 0.15);
  ctx.translate(-x, -y);

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 20;
  }

  drawArcticWillowCatkin(ctx, x, y, size, color, icicleCount, hasIceSpikes);

  ctx.restore();
}

// Frosterizer (tier 4) only: a ring of small icicles slowly orbiting the
// whole tower at a fixed radius — "an icicle ring that circles around
// it," read literally as a ring, same orbiting-backdrop convention
// drawFungalMessMist/drawGasRing already use for their own circling
// effects.
function drawIcicleRing(ctx, x, y, size, time) {
  const icicleCount = 7;
  const radius = size * 1.3;
  for (let i = 0; i < icicleCount; i += 1) {
    const angle = time * 0.8 + (i / icicleCount) * Math.PI * 2;
    const ix = x + Math.cos(angle) * radius;
    const iy = y + Math.sin(angle) * radius * 0.55;
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = '#b3e5fc';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.22);
    ctx.lineTo(size * 0.08, 0);
    ctx.lineTo(0, size * 0.1);
    ctx.lineTo(-size * 0.08, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
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

// Amorphophallus titanum's own "gas ring" (direct request: "it will have
// a gas ring around it," distinct wording from Corpse Flower's own
// Hazard Path "gas" which is a filled disc — drawGasCloud above) — a
// pulsing ANNULUS between innerRadius and outerRadius, drawn with an
// even-odd fill so the inner circle is cut out rather than filled in,
// plus a dashed stroke tracing each of the ring's own two edges.
function drawGasRing(ctx, x, y, innerRadius, outerRadius, color, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 1.2);
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.2 + pulse * 0.12;
  ctx.beginPath();
  ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
  ctx.arc(x, y, innerRadius, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// Corpse Flower's Prodigy ($100,000, direct request, built from a real
// reference photo sent directly — "a giant corpse flower... it will look
// like this"): deliberately NOT a scaled-up version of the base tower's
// own drawCorpseFlowerHead (a flat 5-petal Rafflesia pinwheel — a
// completely different real flower from the actual Titan Arum/
// Amorphophallus titanum this Prodigy is named after). The real plant's
// own silhouette — a short, bulbous green base wrapped in a wide, deeply
// ruffled maroon "spathe" skirt, with one towering pale spadix spike
// rising far above it from the center — is built from scratch below as
// its own 3-piece shape: drawTitanBase(), drawTitanSpathe() (a ring of
// ruffled lobes, the same per-lobe rotate-and-draw loop
// drawCorpseFlowerPetal's own petals use, just longer/narrower/two-toned
// for the ruffled read) and drawTitanSpadix() (drawn last, on top, since
// it's the tallest feature and should never be hidden behind the skirt).

const TITAN_SPATHE_LOBE_COUNT = 10;

// One ruffled spathe lobe, drawn pointing straight "up" (away from the
// tower's own center) from the origin — rotated into place by the caller,
// same convention drawCorpseFlowerPetal already uses for its own petals.
// A deep-maroon bezier body plus a paler, slightly inset overlay tracing
// the same outline — reads as the two-toned, frilled inner face visible
// in the real flower's own reference photo, without needing an actually
// jagged/wobbled path.
function drawTitanSpatheLobe(ctx, length, width, color) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(width * 0.5, length * 0.3, width * 0.4, length * 0.8, 0, length);
  ctx.bezierCurveTo(-width * 0.4, length * 0.8, -width * 0.5, length * 0.3, 0, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, length * 0.15);
  ctx.bezierCurveTo(width * 0.3, length * 0.4, width * 0.25, length * 0.75, 0, length * 0.92);
  ctx.bezierCurveTo(-width * 0.25, length * 0.75, -width * 0.3, length * 0.4, 0, length * 0.15);
  ctx.closePath();
  ctx.fillStyle = shadeColor(color, 28);
  ctx.globalAlpha = 0.65;
  ctx.fill();
  ctx.globalAlpha = 1;
}

// The flared, ruffled spathe skirt, as a ring of lobes around the
// tower's own center. `openness` (0-1) lengthens every lobe outward —
// the bloom attack visibly pulls the whole skirt wider open right as it
// fires (see drawAmorphophallusTitanum()'s own bloomGlow below), on top
// of a slow idle breathing sway so it's never perfectly static even at
// rest.
function drawTitanSpathe(ctx, x, y, size, color, openness) {
  const lobeLength = size * (1.4 + openness * 0.5);
  const lobeWidth = size * 0.8;
  for (let i = 0; i < TITAN_SPATHE_LOBE_COUNT; i += 1) {
    const angle = (i / TITAN_SPATHE_LOBE_COUNT) * Math.PI * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    drawTitanSpatheLobe(ctx, lobeLength, lobeWidth, color);
    ctx.restore();
  }
}

// The short, bulbous green base the spathe/spadix both rise out of —
// the real flower's own ovary/calyx, a simple flattened ellipse low
// enough to read as sitting beneath the ruffled skirt rather than
// competing with it.
function drawTitanBase(ctx, x, y, size) {
  ctx.fillStyle = '#4a6b2a';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.12, size * 0.5, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

// The spadix: a single tall tapering spike rising from dead center, far
// above the spathe around it — the tallest feature on the tower, matching
// the real flower's own silhouette (a towering spike wrapped in a short,
// flared skirt, not the other way around — unlike every other tower in
// the game, this one's single most prominent feature is the plain, pale
// spike in the middle, not a brightly-colored bloom). Glows with a red
// acid-colored pulse at its own tip while `bloomGlow` is active — the
// "it blooms and shoots acid" moment made visible right at the source of
// the acid itself.
function drawTitanSpadix(ctx, x, y, size, bloomGlow) {
  const height = size * 3.2;
  const baseWidth = size * 0.55;

  ctx.fillStyle = '#c9c17a';
  ctx.beginPath();
  ctx.moveTo(x - baseWidth / 2, y);
  ctx.quadraticCurveTo(x - baseWidth * 0.3, y - height * 0.6, x, y - height);
  ctx.quadraticCurveTo(x + baseWidth * 0.3, y - height * 0.6, x + baseWidth / 2, y);
  ctx.closePath();
  ctx.fill();

  if (bloomGlow > 0) {
    ctx.save();
    ctx.globalAlpha = bloomGlow * 0.8;
    ctx.fillStyle = '#e53935';
    ctx.beginPath();
    ctx.arc(x, y - height, baseWidth * (0.5 + bloomGlow * 0.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawAmorphophallusTitanum(ctx, x, y, size, color, glow, time, flashAmount, bloomProgress = 0) {
  // bloomProgress counts down from its own fixed visual window (see
  // BLOOM_OPEN_DURATION in game.js) — normalized here to a 0-1 glow/
  // openness amount without towers.js needing to know that exact
  // duration, the same way flashAmount above is already handed in pre-
  // normalized by renderTower() rather than this function reading
  // ATTACK_FLASH_DURATION itself.
  const bloomGlow = Math.min(1, bloomProgress * 2);
  const sway = Math.sin(time * 0.6 + x * 0.007) * 0.03;
  const openness = Math.max(0, Math.min(1, 0.35 + 0.25 * Math.sin(time * 0.8) + bloomGlow * 0.4));

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.translate(-x, -y);
  ctx.translate(x, y);
  ctx.scale(1 + flashAmount * 0.1, 1 + flashAmount * 0.1);
  ctx.translate(-x, -y);

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 24;
  }

  drawTitanBase(ctx, x, y, size);
  drawTitanSpathe(ctx, x, y, size, color, openness);
  drawTitanSpadix(ctx, x, y, size, bloomGlow);

  ctx.restore();
}
