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
              'Sunflower turns more orange; attack speed doubles again (4x from base); damage doubles; ' +
              'periodically spits a magma puddle that burns bugs standing in it.',
            cost: 300,
            effects: {
              color: '#ff7043',
              attackIntervalMultiplier: 0.5,
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
};

function createTower(typeKey) {
  const type = TOWER_TYPES[typeKey];
  if (!type) throw new Error(`Unknown tower type: ${typeKey}`);

  return {
    type: typeKey,
    chosenPath: null,
    upgradesPurchased: 0, // count of upgrades bought within the chosen path
    stats: { ...type.baseStats },
    attackType: 'projectile',
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
    attackCooldown: 0, // seconds until this tower can attack again
    target: null, // the enemy it's currently aiming at, if any
    attackFlash: 0, // seconds left of the "just fired" visual pulse
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
  if (effects.damageMultiplier) tower.stats.damage *= effects.damageMultiplier;
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

  tower.upgradesPurchased += 1;
  return true;
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
function renderTower(ctx, tower, x, y, time) {
  if (tower.type === 'sunflower') {
    const flashAmount = tower.attackFlash / ATTACK_FLASH_DURATION;
    drawSunflower(ctx, x, y, tower.stats.size, tower.stats.color, tower.glow, time, flashAmount);
  } else {
    // Fallback for any future tower type without custom art yet.
    ctx.fillStyle = tower.stats.color;
    ctx.beginPath();
    ctx.arc(x, y, tower.stats.size, 0, Math.PI * 2);
    ctx.fill();
  }

  if (tower.flame === 'small') drawFlame(ctx, x, y - tower.stats.size * 0.9, tower.stats.size * 0.35, '#ff7043');
  if (tower.flame === 'large') drawFlame(ctx, x, y, tower.stats.size * 1.1, '#ff5722');

  if (tower.sparks === 'small') drawSparks(ctx, x, y, tower.stats.size);
  if (tower.boltMark) drawBoltMark(ctx, x, y, tower.stats.size);
  if (tower.fireMark) drawFireMark(ctx, x, y, tower.stats.size);

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
