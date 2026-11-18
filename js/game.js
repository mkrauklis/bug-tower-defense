const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// The game world (map/towers/enemies) is always WORLD_WIDTH x WORLD_HEIGHT —
// unrelated to the canvas's own size, which also has to fit the control
// panel (Shop/Selected Tower/Wave) now that the panel is drawn on canvas
// instead of being separate DOM elements (see js/ui.js). The panel sits
// beside the world on a wide screen, or below it (full-width, same content)
// on a narrow one — applyLayout() below picks which and resizes the canvas
// to match. Only js/map.js/js/wildlife.js use WORLD_WIDTH/WORLD_HEIGHT
// (their own MAP_PATH_WAYPOINTS/WILDLIFE_BOUNDS are defined in world space
// and untouched by this file).
const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 640;
const PANEL_WIDTH_SIDE = 320;
const PANEL_PADDING = 14;
// Fixed height budget for the panel's content (Shop + Selected Tower incl.
// both upgrade columns + Wave incl. both buttons, the Back-to-Menu button,
// and Auto-Continue) — the same in both layouts since neither saves much
// room by being wider: most of the panel's height comes from fixed-size
// rows (shop tiles, upgrade tiers, buttons), not text wrapping. This is a
// hard limit, not just a starting guess with a safety net — canvas.height
// is derived from it (see applyLayout() below), so content drawn past it
// is genuinely clipped by the canvas's own pixel buffer, not just scrolled
// out of view (confirmed directly: Auto-Continue's button silently drew
// itself off the bottom of the canvas here once the panel grew past this
// value, with no error or visual sign anything was wrong). Bump this
// whenever a new panel section is added, rather than assuming there's
// slack — verify there actually is some left, live, after adding one.
const PANEL_HEIGHT = 760;
const NARROW_BREAKPOINT = 820;

let layoutMode = 'side'; // 'side' | 'stacked'
let panelX = WORLD_WIDTH;
let panelY = 0;
let panelWidth = PANEL_WIDTH_SIDE;
let panelHeight = PANEL_HEIGHT;

// Resizes the canvas and repositions the panel for the current viewport.
// Narrow screens get the world and panel stacked (both full WORLD_WIDTH, so
// touch targets stay the same real size as the already-shipped mobile
// support for the world itself) instead of shrunk side by side.
function applyLayout() {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : WORLD_WIDTH + PANEL_WIDTH_SIDE;
  layoutMode = viewportWidth < NARROW_BREAKPOINT ? 'stacked' : 'side';

  if (layoutMode === 'stacked') {
    panelX = 0;
    panelY = WORLD_HEIGHT;
    panelWidth = WORLD_WIDTH;
    panelHeight = PANEL_HEIGHT;
    canvas.width = WORLD_WIDTH;
    canvas.height = WORLD_HEIGHT + PANEL_HEIGHT;
  } else {
    panelX = WORLD_WIDTH;
    panelY = 0;
    panelWidth = PANEL_WIDTH_SIDE;
    panelHeight = PANEL_HEIGHT;
    canvas.width = WORLD_WIDTH + PANEL_WIDTH_SIDE;
    canvas.height = Math.max(WORLD_HEIGHT, PANEL_HEIGHT);
  }
}

applyLayout();
if (typeof window !== 'undefined') window.addEventListener('resize', applyLayout);

// Whether (x, y) in canvas-pixel space falls inside the game world (as
// opposed to the panel) — depends on layoutMode, since the panel moves from
// "beside" to "below" the world.
function isWorldPoint(x, y) {
  return layoutMode === 'stacked' ? y < WORLD_HEIGHT : x < WORLD_WIDTH;
}

// 'menu' (canvas-drawn mode-select screen, see renderMenu()) or 'playing'
// (the existing gameplay) — the game boots into the menu and only starts
// simulating once a mode is chosen (see startGame() below). gameSpeed/
// lastTime/accumulator keep running regardless of state (see loop()), but
// update() is only ever called while 'playing', so nothing advances while
// the menu is up.
let gameState = 'menu';
let currentModeKey = null;
let currentMode = null;

// Easy/Hard are stat multipliers layered on top of the exact same combat/
// wave/tower code Medium already uses — not separate reimplementations.
// Sandbox has no wave progression at all; see startGame()/the sandbox
// spawn-palette panel section instead. Multipliers of 1 are deliberate
// no-ops (kept explicit rather than omitted) so every mode lists the same
// shape and nothing is "missing" by omission.
const GAME_MODES = {
  easy: {
    name: 'Easy',
    description: 'Enemies have 15% less health and move 15% slower. Earn 10% more money from bounties.',
    healthMultiplier: 0.85,
    speedMultiplier: 0.85,
    bountyMultiplier: 1.1,
    sandbox: false,
  },
  medium: {
    name: 'Medium',
    description: 'Standard rules. No modifiers.',
    healthMultiplier: 1,
    speedMultiplier: 1,
    bountyMultiplier: 1,
    sandbox: false,
  },
  hard: {
    name: 'Hard',
    description: 'Enemies move 20% faster. Health and money are unchanged.',
    healthMultiplier: 1,
    speedMultiplier: 1.2,
    bountyMultiplier: 1,
    sandbox: false,
  },
  sandbox: {
    name: 'Sandbox',
    description:
      'No waves or rounds. Freely spawn any enemy type you’ve defeated before, to test builds. ' +
      'Unlimited money — place, upgrade, and sell towers freely.',
    healthMultiplier: 1,
    speedMultiplier: 1,
    bountyMultiplier: 1,
    sandbox: true,
  },
};

// Every placed tower lives here, including the first one bought — there's
// no special "demo" tower anymore. The Upgrades panel always follows
// `selectedTower`, which the player sets by clicking a tower on the map.
let towers = [];
let selectedTower = null;

let round = 1;
let currentWave = [];

// Starting money — $50 in every mode; only Easy's bounty bonus was asked
// for, nothing about starting money differing per mode, so this doesn't
// vary either.
let money = 50;

// Sandbox gets unlimited money: every affordability check below goes
// through this instead of a raw `money >= cost` comparison. `money` itself
// is left completely alone (still earns bounties, still gets spent) — it's
// just never checked or displayed as a real number while in Sandbox, so it
// can't go "weird" (overflow, drift) no matter how it changes underneath.
function canAfford(cost) {
  return Boolean(currentMode && currentMode.sandbox) || money >= cost;
}

// Buyable towers. Scaffolded as a list so more towers can be added later;
// only the Sunflower is a real purchasable option for now.
const SHOP_ITEMS = [
  { typeKey: 'sunflower', name: 'Sunflower', cost: 25 },
  { typeKey: 'rose', name: 'Rose', cost: 45 },
  { typeKey: 'mushroom', name: 'Mushroom', cost: 75 }, // cost confirmed directly with the user
];

// How far a placed tower's center must stay from the path's centerline,
// on top of the path's own half-width — keeps towers clear of the lane
// instead of just touching its edge.
const PLACEMENT_PATH_MARGIN = 20;

// Minimum click-hit radius for selecting a tower, so a tiny (shrunk) tower
// is still easy to click.
const MIN_SELECT_RADIUS = 18;

let selectedShopItem = null;
let mouseX = null;
let mouseY = null;

// Which enemy types (ENEMY_TYPES/BOSS_TYPES keys) the player has ever
// killed at least once in a real (non-Sandbox) game — persisted across
// sessions via localStorage, since this is what gates Sandbox's spawn
// palette (see renderSandboxSpawnSection()). Wrapped in try/catch: a
// private-browsing tab or a blocked/disabled localStorage shouldn't crash
// the game, it just won't remember between visits.
const DEFEATED_ENEMIES_STORAGE_KEY = 'bugTowerDefense.defeatedEnemies';

function loadDefeatedEnemyKeys() {
  try {
    const raw = localStorage.getItem(DEFEATED_ENEMIES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    return new Set();
  }
}

function saveDefeatedEnemyKeys() {
  try {
    localStorage.setItem(DEFEATED_ENEMIES_STORAGE_KEY, JSON.stringify([...defeatedEnemyKeys]));
  } catch (error) {
    // Nothing to do — this run just won't persist.
  }
}

let defeatedEnemyKeys = loadDefeatedEnemyKeys();

// Called on every real kill (see update()) — Sandbox kills never call this,
// so Sandbox itself can't be used to unlock its own spawn palette.
function recordDefeatedEnemy(enemyKey) {
  if (defeatedEnemyKeys.has(enemyKey)) return;
  defeatedEnemyKeys.add(enemyKey);
  saveDefeatedEnemyKeys();
}

// Applies the current mode's health/speed multipliers to a wave composition
// generated by enemies.js's generateWave() — kept entirely in game.js so
// enemies.js itself stays mode-agnostic (it only knows about rounds/health-
// scaling, not Easy/Hard). Bosses go through the exact same map() as
// regular entries; nothing in the brief exempted them.
function applyModeToWaveComposition(composition) {
  return composition.map((entry) => ({
    ...entry,
    health: Math.max(1, Math.round(entry.health * currentMode.healthMultiplier)),
    speedMultiplier: entry.speedMultiplier * currentMode.speedMultiplier,
  }));
}

// Resets every piece of run state and starts a fresh game in the chosen
// mode — the only place any of this state gets initialized now that it's
// not run unconditionally at module load (the player has to pick a mode
// on the menu first). Sandbox never auto-spawns a wave; every other mode
// spawns round 1 immediately, same as the game always has.
function startGame(modeKey) {
  currentModeKey = modeKey;
  currentMode = GAME_MODES[modeKey];
  gameState = 'playing';

  towers = [];
  selectedTower = null;
  selectedShopItem = null;
  projectiles = [];
  damageBoostRemaining = 0;
  round = 1;
  money = 50;

  if (currentMode.sandbox) {
    currentWave = [];
    spawnWave([]); // clears activeEnemies without duplicating that logic here
  } else {
    currentWave = applyModeToWaveComposition(generateWave(round));
    spawnWave(currentWave);
  }
}

// The game's own simulation clock, advanced in update() rather than read
// from the wall clock — idle animation (sway, pulses) stays tied to game
// speed/determinism instead of real time.
let animationTime = 0;

// Purely decorative fireflies, plus ladybugs that grant a power-up when
// clicked (js/wildlife.js). Neither fights or is fought.
const wildlife = createWildlifeSwarm();

// Clicking a ladybug grants every tower +50% damage for 10 seconds —
// a simple, clearly-beneficial, temporary power-up. Baseline numbers,
// not balanced/tuned. Scoped to each tower's primary attack (the ray's
// instant hit, or a projectile's damage payload) rather than every damage
// source in the game (puddle/orbit DoT, burn), to keep it simple to reason
// about: "your towers hit harder," not a blanket multiplier on everything.
const DAMAGE_BOOST_MULTIPLIER = 1.5;
const DAMAGE_BOOST_DURATION = 10;
let damageBoostRemaining = 0;

function getEffectiveDamage(tower) {
  return tower.stats.damage * (damageBoostRemaining > 0 ? DAMAGE_BOOST_MULTIPLIER : 1);
}

// Visible, damage-carrying projectiles for the attack types that don't
// already have their own always-on visual (the ray beam draws itself
// straight to the target every frame and hits instantly — it's a
// continuous beam, not a thrown object, so instant-hit is correct for it
// and it never spawns one of these). A petal/fireball instead carries its
// damage (and burn, if any) with it and only actually hits on arrival —
// simple, no real physics: it flies in a straight line toward where the
// target was at the moment it was fired and does not home in, so a target
// that moves, dies, or leaves range mid-flight can cause a miss:
// - Target already dead by the time the projectile arrives: it fizzles,
//   no damage (there's nothing left to hit).
// - Target still alive but has wandered away from the aimed-at point by
//   more than HIT_TOLERANCE: also fizzles, treated as a miss rather than
//   homing in — it only needs to have drifted a little to still land,
//   since enemies are far slower than projectiles.
const PROJECTILE_SPEED = 400; // px/second, baseline pick — fast but visible
const PROJECTILE_HIT_TOLERANCE = 20; // px of target drift still counted as a hit
let projectiles = [];

function spawnProjectile(tower, target) {
  const dx = target.x - tower.x;
  const dy = target.y - tower.y;
  const distance = Math.hypot(dx, dy) || 1;
  projectiles.push({
    x: tower.x,
    y: tower.y,
    vx: (dx / distance) * PROJECTILE_SPEED,
    vy: (dy / distance) * PROJECTILE_SPEED,
    distanceLeft: distance,
    aimX: target.x,
    aimY: target.y,
    target,
    damage: getEffectiveDamage(tower),
    burn: tower.burn,
    color: tower.attackType === 'fireball' ? '#ff5722' : tower.stats.color,
    shape: tower.attackType === 'fireball' ? 'fireball' : tower.type === 'mushroom' ? 'spore' : 'petal',
    // Mushroom's Zombify: carried per-projectile (not read from the tower
    // at resolve time) since the tower that fired it is the one and only
    // source of truth for "was this a spore, and at what chance/damage" —
    // resolveProjectile() below doesn't need a reference back to the tower.
    isSpore: tower.type === 'mushroom',
    zombifyChance: tower.type === 'mushroom' ? tower.zombifyChance : 0,
    zombieExplosionDamage: tower.type === 'mushroom' ? tower.zombieExplosionDamage : 0,
    resolved: false,
  });
}

function resolveProjectile(projectile) {
  const { target } = projectile;
  if (!target || target.health <= 0) return; // fizzle: target already dead

  const driftFromAim = Math.hypot(target.x - projectile.aimX, target.y - projectile.aimY);
  if (driftFromAim > target.radius + PROJECTILE_HIT_TOLERANCE) return; // fizzle: wandered off

  damageEnemy(target, projectile.damage);
  if (projectile.burn) applyBurn(target, projectile.burn);

  // Zombify: only a spore's own killing blow counts (never any other
  // damage source — burn, a root, another tower entirely, etc. — and never
  // a boss). This check runs immediately after the damage above, so
  // target.health <= 0 here specifically means *this* hit was the one
  // that finished it off.
  if (
    projectile.isSpore &&
    target.health <= 0 &&
    !target.isBoss &&
    projectile.zombifyChance > 0 &&
    random() < projectile.zombifyChance
  ) {
    turnIntoZombie(target, projectile.zombieExplosionDamage);
  }
}

function updateProjectiles(deltaSeconds) {
  projectiles.forEach((projectile) => {
    const step = PROJECTILE_SPEED * deltaSeconds;
    projectile.x += projectile.vx * deltaSeconds;
    projectile.y += projectile.vy * deltaSeconds;
    projectile.distanceLeft -= step;

    if (projectile.distanceLeft <= 0 && !projectile.resolved) {
      resolveProjectile(projectile);
      projectile.resolved = true;
    }
  });
  projectiles = projectiles.filter((projectile) => !projectile.resolved);
}

function renderProjectiles(ctx) {
  projectiles.forEach((projectile) => {
    if (projectile.shape === 'fireball') {
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 6, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (projectile.shape === 'thorn') {
      // A small triangular spike, point-first along its direction of travel.
      ctx.save();
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, -3);
      ctx.lineTo(-5, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    if (projectile.shape === 'spore') {
      // A small puff — a round cloud with a lighter core, no directional
      // orientation needed (spores drift, they don't fly point-first).
      ctx.fillStyle = projectile.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff8e1';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    // A small petal: an ellipse oriented along its direction of travel.
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function updateTowerAttack(tower, x, y, deltaSeconds) {
  tower.target = findNearestEnemyInRange(x, y, tower.stats.range);
  tower.attackFlash = Math.max(0, tower.attackFlash - deltaSeconds);

  tower.attackCooldown = Math.max(0, tower.attackCooldown - deltaSeconds);
  if (tower.target && tower.attackCooldown <= 0) {
    if (tower.attackType === 'ray') {
      // A continuous beam hits instantly — there's no travel time to model.
      damageEnemy(tower.target, getEffectiveDamage(tower));
      if (tower.burn) applyBurn(tower.target, tower.burn);
    } else {
      // Damage (and burn) travel with the projectile and apply on arrival.
      spawnProjectile(tower, tower.target);
    }
    tower.attackCooldown = tower.stats.attackInterval;
    tower.attackFlash = ATTACK_FLASH_DURATION;
  }

  if (tower.puddle) updateTowerPuddle(tower, deltaSeconds);
  if (tower.orbit) updateTowerOrbit(tower, x, y, deltaSeconds);
  if (tower.spark) updateTowerSpark(tower, x, y, deltaSeconds);
  if (tower.shockwave) updateTowerShockwave(tower, x, y, deltaSeconds);
  if (tower.clouds) tower.cloudsAngle += tower.clouds.angularSpeed * deltaSeconds;
  if (tower.vineCount > 0) updateTowerVines(tower, x, y, deltaSeconds);
  tower.vineLashes.forEach((lash) => {
    lash.timeRemaining = Math.max(0, lash.timeRemaining - deltaSeconds);
  });
  if (tower.roots.length > 0) updateTowerRoots(tower);
  if (tower.hasThornShot) updateTowerThornShot(tower, x, y, deltaSeconds);
  tower.shockwavePulse = Math.max(0, tower.shockwavePulse - deltaSeconds);
}

// Rose's Projectile Path: a second, independent ranged attack alongside the
// base one — fires tower.thornShotCount thorn projectiles each cooldown,
// each re-querying the nearest enemy (same "multiple projectiles can
// converge on one target" precedent already set by the vines). Reuses the
// existing travel-time projectile pipeline (spawnThornProjectile below
// just adds a differently-shaped entry to the same `projectiles` array
// updateProjectiles()/resolveProjectile() already handle generically).
function updateTowerThornShot(tower, x, y, deltaSeconds) {
  tower.thornShotCooldown -= deltaSeconds;
  if (tower.thornShotCooldown <= 0) {
    tower.thornShotCooldown = tower.thornShotInterval;
    for (let i = 0; i < tower.thornShotCount; i += 1) {
      const target = findNearestEnemyInRange(x, y, tower.stats.range);
      if (target) spawnThornProjectile(tower, target);
    }
  }
}

function spawnThornProjectile(tower, target) {
  const dx = target.x - tower.x;
  const dy = target.y - tower.y;
  const distance = Math.hypot(dx, dy) || 1;
  projectiles.push({
    x: tower.x,
    y: tower.y,
    vx: (dx / distance) * PROJECTILE_SPEED,
    vy: (dy / distance) * PROJECTILE_SPEED,
    distanceLeft: distance,
    aimX: target.x,
    aimY: target.y,
    target,
    damage: tower.thornShotDamage,
    burn: tower.thornShotPoison, // same {damagePerSecond, duration} shape applyBurn/resolveProjectile already expect
    color: '#4e342e',
    shape: 'thorn',
    resolved: false,
  });
}

// Root Path's ground traps (Rooting) — fixed spots placed once at purchase
// time (see spawnRoseRoots() in towers.js), each single-use: the first
// enemy found within ROOT_TRIGGER_RADIUS of a root is damaged and that
// root is removed from the list for good (no respawn — a deliberate, the
// simplest valid choice for this first tier; a later tier could add one).
const ROOT_TRIGGER_RADIUS = 14;

function updateTowerRoots(tower) {
  tower.roots = tower.roots.filter((root) => {
    const [victim] = getEnemiesInRadius(root.x, root.y, ROOT_TRIGGER_RADIUS);
    if (!victim) return true;

    damageEnemy(victim, root.damage); // the base "step on it" hit — always happens

    // Tanglement's grab is additive, not a replacement for the above: a
    // root with a successful roll still dealt its normal hit this same
    // trigger, then also immobilizes and deals bonus damage. Uses the
    // game's seeded random() (not Math.random()), same as everywhere else
    // that needs randomness.
    if (tower.rootGrabChance > 0 && random() < tower.rootGrabChance) {
      damageEnemy(victim, tower.rootGrabDamage);
      victim.immobilizedRemaining = Math.max(victim.immobilizedRemaining, tower.rootGrabDuration);
    }

    return false; // consumed either way — a root is still single-use
  });
}

function updateTowerPuddle(tower, deltaSeconds) {
  tower.puddleCooldown -= deltaSeconds;
  if (tower.puddleCooldown <= 0) {
    tower.puddleCooldown = tower.puddle.interval;
    // Only spawns if something's actually in range to spit at — otherwise
    // just waits for the next cycle rather than wasting a puddle on nothing.
    if (tower.target) {
      tower.activePuddles.push({
        x: tower.target.x,
        y: tower.target.y,
        radius: tower.puddle.radius,
        damagePerSecond: tower.puddle.damagePerSecond,
        remaining: tower.puddle.duration,
      });
    }
  }

  tower.activePuddles.forEach((puddle) => {
    puddle.remaining -= deltaSeconds;
    getEnemiesInRadius(puddle.x, puddle.y, puddle.radius).forEach((enemy) => {
      damageEnemy(enemy, puddle.damagePerSecond * deltaSeconds);
    });
  });
  tower.activePuddles = tower.activePuddles.filter((puddle) => puddle.remaining > 0);
}

function updateTowerOrbit(tower, x, y, deltaSeconds) {
  tower.orbitAngle += tower.orbit.angularSpeed * deltaSeconds;

  for (let i = 0; i < tower.orbit.count; i += 1) {
    const angle = tower.orbitAngle + (i * 2 * Math.PI) / tower.orbit.count;
    const emberX = x + tower.orbit.radius * Math.cos(angle);
    const emberY = y + tower.orbit.radius * Math.sin(angle);
    getEnemiesInRadius(emberX, emberY, tower.orbit.emberRadius).forEach((enemy) => {
      damageEnemy(enemy, tower.orbit.damagePerSecond * deltaSeconds);
    });
  }
}

// Storm Path's single-target periodic jolt (Conductor) — unlike the puddle/
// orbit AoE effects above, this only ever hits the single closest enemy
// currently in range, same targeting rule the tower's main attack uses.
function updateTowerSpark(tower, x, y, deltaSeconds) {
  tower.sparkCooldown -= deltaSeconds;
  if (tower.sparkCooldown <= 0) {
    tower.sparkCooldown = tower.spark.interval;
    const target = findNearestEnemyInRange(x, y, tower.stats.range);
    if (target) damageEnemy(target, tower.spark.damage);
  }
}

// How long the shockwave's expanding-ring visual lasts — purely cosmetic,
// unrelated to the shockwave's own damage interval.
const SHOCKWAVE_PULSE_DURATION = 0.4;

// Storm Path's AoE periodic pulse (Shockwave) — hits every enemy currently
// within the tower's range at once, independent of (and stacking with)
// Conductor's single-target spark above; buying this doesn't replace that
// effect, both keep ticking on their own schedules.
function updateTowerShockwave(tower, x, y, deltaSeconds) {
  tower.shockwaveCooldown -= deltaSeconds;
  if (tower.shockwaveCooldown <= 0) {
    tower.shockwaveCooldown = tower.shockwave.interval;
    getEnemiesInRadius(x, y, tower.stats.range).forEach((enemy) => damageEnemy(enemy, tower.shockwave.damage));
    tower.shockwavePulse = SHOCKWAVE_PULSE_DURATION;
  }
}

// Rose's thorn vines (Thorn Path) — a second, independent attack alongside
// the tower's normal one. All vines share a single cooldown (they all tick
// "once a second" together, per the spec) rather than staggering; each
// vine independently targets the single nearest enemy in vine range, so
// with multiple vines and only one enemy nearby, that enemy just takes a
// hit from every vine — simple and explicitly fine per the brief ("possibly
// multiple vines able to hit the same enemy — doesn't need to be fancy").
function updateTowerVines(tower, x, y, deltaSeconds) {
  tower.vineCooldown -= deltaSeconds;
  if (tower.vineCooldown <= 0) {
    tower.vineCooldown = tower.vineInterval;
    const vineRange = tower.stats.range * tower.vineRangeMultiplier;
    for (let i = 0; i < tower.vineCount; i += 1) {
      const target = findNearestEnemyInRange(x, y, vineRange);
      if (target) {
        damageEnemy(target, tower.vineDamage);
        // Starts that specific vine's lash-toward-target animation (see
        // renderRoseVines in towers.js) — only when it actually hit
        // something, so an idle vine with nothing in range stays put.
        tower.vineLashes[i].timeRemaining = VINE_LASH_DURATION;
        tower.vineLashes[i].angle = Math.atan2(target.y - y, target.x - x);
      }
    }
  }
}

function update(deltaSeconds) {
  animationTime += deltaSeconds;
  updateWildlife(wildlife, deltaSeconds);

  damageBoostRemaining = Math.max(0, damageBoostRemaining - deltaSeconds);

  const killedEnemies = updateEnemies(deltaSeconds);
  if (killedEnemies.length > 0) {
    const totalBounty = killedEnemies.reduce((sum, enemy) => sum + enemy.bounty, 0);
    money += Math.round(totalBounty * currentMode.bountyMultiplier);
    // No DOM to refresh any more — the panel is redrawn from current state
    // every render() frame anyway (see renderUI()), so a kill just needs to
    // update `money` and the next frame picks it up for free.

    // Sandbox kills don't count — that'd make its own unlock gate
    // meaningless (defeat something in Sandbox to... unlock it in Sandbox).
    if (!currentMode.sandbox) killedEnemies.forEach((enemy) => recordDefeatedEnemy(enemy.enemyKey));
  }

  towers.forEach((tower) => updateTowerAttack(tower, tower.x, tower.y, deltaSeconds));
  updateProjectiles(deltaSeconds);

  // Fires exactly once per clear: the instant activeEnemies hits 0 (the
  // same condition the manual Next Round button's own waveInProgress gate
  // checks), starting the next round immediately repopulates activeEnemies
  // via spawnWave(), so this naturally can't re-trigger on the very next
  // frame without a separate "already triggered" flag.
  if (autoContinue && !currentMode.sandbox && activeEnemies.length === 0) startNextRound();
}

function drawTowerWithRay(tower, x, y) {
  if (tower.attackType === 'ray' && tower.target) {
    ctx.strokeStyle = tower.burn ? '#ff6600' : '#fff59d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tower.target.x, tower.target.y);
    ctx.stroke();
  }

  renderTower(ctx, tower, x, y, animationTime);

  if (tower.shockwavePulse > 0) {
    const progress = 1 - tower.shockwavePulse / SHOCKWAVE_PULSE_DURATION; // 0 -> 1 as it expands/fades
    ctx.strokeStyle = `rgba(255, 245, 157, ${1 - progress})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, tower.stats.range * progress, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (tower === selectedTower) {
    // Cheap given the selection ring already exists — the same real
    // current range (including any range-boosting upgrades) a buildable-
    // spot preview would show, just for an already-placed tower.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(x, y, tower.stats.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(getTowerVisualSize(tower), MIN_SELECT_RADIUS) + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function render() {
  updateTouchHold();

  if (gameState === 'menu') {
    canvas.style.cursor = 'default';
    renderMenu(ctx);
    return;
  }

  canvas.style.cursor = selectedShopItem ? 'crosshair' : 'default';

  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // map.js only reads .width/.height off what's passed here — this keeps
  // the world's own rendering fixed at WORLD_WIDTH x WORLD_HEIGHT regardless
  // of how big the real canvas is (map.js itself is untouched).
  renderMap(ctx, { width: WORLD_WIDTH, height: WORLD_HEIGHT });
  renderWildlife(ctx, wildlife, animationTime, 'ladybug'); // ground-level, under everything else

  towers.forEach((tower) => renderTowerGroundEffects(ctx, tower));
  towers.forEach((tower) => drawTowerWithRay(tower, tower.x, tower.y));

  renderEnemies(ctx);
  renderProjectiles(ctx);
  renderWildlife(ctx, wildlife, animationTime, 'firefly'); // glowing, drawn on top so it reads over everything

  if (selectedShopItem && mouseX !== null && isWorldPoint(mouseX, mouseY)) {
    const buildable = canAfford(selectedShopItem.cost) && !isPointOnPath(mouseX, mouseY, PLACEMENT_PATH_MARGIN);
    ctx.fillStyle = buildable ? 'rgba(76, 175, 80, 0.4)' : 'rgba(229, 57, 53, 0.4)';
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 20, 0, Math.PI * 2);
    ctx.fill();

    // The tower's attack-range preview, so the player can see coverage
    // before committing — this already updates continuously on hover
    // since it's drawn every frame the shop item is armed and the mouse is
    // over a world point, not just at click time.
    const range = TOWER_TYPES[selectedShopItem.typeKey].baseStats.range;
    ctx.strokeStyle = buildable ? 'rgba(76, 175, 80, 0.7)' : 'rgba(229, 57, 53, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  renderUI(ctx);
}

// ---------------------------------------------------------------------------
// Canvas-drawn control panel (Shop / Selected Tower / Wave) — see js/ui.js
// for the small hit-testing/tooltip toolkit this leans on. Everything below
// is immediate-mode: it reads current game state and redraws from scratch
// every frame, same as the rest of render() — there's no retained DOM to
// patch any more, so a state change (money, selection, a purchase) just
// shows up on the very next frame for free.
// ---------------------------------------------------------------------------

// Solar = yellow, Fire = orange — matches each path's own visual theme on
// the tower itself (glow/flame colors), index-aligned with upgradePaths.
const PATH_COLORS = ['#ffd54f', '#ff7043'];

// Currently hovered panel region (desktop mouse only — see getCanvasPoint's
// callers below), used both to draw hover feedback and to pick which
// tooltip (if any) to show.
let hoverRegion = null;

// Cached preview tower instances (base stats, no upgrades bought) used to
// draw each shop item's icon with the tower's own real renderTower() art
// instead of a generic placeholder or plain text label.
const shopPreviewTowers = {};
function getShopPreviewTower(typeKey) {
  if (!shopPreviewTowers[typeKey]) shopPreviewTowers[typeKey] = createTower(typeKey);
  return shopPreviewTowers[typeKey];
}

const SHOP_TILE_SIZE = 60;
const SHOP_TILE_GAP = 10;

function renderShopSection(ctx, x, width, startY) {
  let y = startY;

  ctx.fillStyle = '#f0f0f0';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Shop', x, y);
  ctx.fillStyle = '#c0ca33';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(currentMode && currentMode.sandbox ? '∞' : `$${money}`, x + width, y + 1);
  ctx.textAlign = 'left';
  y += 26;

  let tileX = x;
  let rowY = y;
  SHOP_ITEMS.forEach((item) => {
    if (tileX + SHOP_TILE_SIZE > x + width) {
      tileX = x;
      rowY += SHOP_TILE_SIZE + SHOP_TILE_GAP;
    }

    const affordable = canAfford(item.cost);
    const selected = selectedShopItem === item;
    const regionId = `shop:${item.typeKey}`;
    const hovered = hoverRegion && hoverRegion.id === regionId;

    uiRoundRect(ctx, tileX, rowY, SHOP_TILE_SIZE, SHOP_TILE_SIZE, 6);
    ctx.fillStyle = selected ? '#3a5a2e' : hovered ? '#262b35' : '#1c2028';
    ctx.fill();
    ctx.strokeStyle = selected ? '#8bc34a' : affordable ? '#454c5c' : '#3a2020';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();

    ctx.save();
    uiRoundRect(ctx, tileX, rowY, SHOP_TILE_SIZE, SHOP_TILE_SIZE, 6);
    ctx.clip();
    if (!affordable) ctx.globalAlpha = 0.45;
    const iconCenterX = tileX + SHOP_TILE_SIZE / 2;
    const iconCenterY = rowY + SHOP_TILE_SIZE / 2;
    ctx.translate(iconCenterX, iconCenterY);
    ctx.scale(0.8, 0.8);
    ctx.translate(-iconCenterX, -iconCenterY);
    renderTower(ctx, getShopPreviewTower(item.typeKey), iconCenterX, iconCenterY - 6, animationTime);
    ctx.restore();

    uiRegisterRegion(regionId, tileX, rowY, SHOP_TILE_SIZE, SHOP_TILE_SIZE, item);
    tileX += SHOP_TILE_SIZE + SHOP_TILE_GAP;
  });

  return rowY + SHOP_TILE_SIZE + 16;
}

function renderSelectedTowerSection(ctx, x, width, startY) {
  let y = startY;

  ctx.fillStyle = '#f0f0f0';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Selected Tower', x, y);
  y += 22;

  if (!selectedTower) {
    ctx.font = '12px sans-serif';
    const lines = uiWrapText(
      ctx,
      'Click a Shop item, then click open ground to place a tower — or click an existing tower to manage it here.',
      width
    );
    y = uiDrawTextLines(ctx, lines, x, y, 15, '#aaa', '12px sans-serif') + 8;
  } else {
    const burnText = selectedTower.burn
      ? `${selectedTower.burn.damagePerSecond}/s for ${selectedTower.burn.duration}s`
      : 'none';
    const puddleText = selectedTower.puddle
      ? `${selectedTower.puddle.damagePerSecond}/s every ${selectedTower.puddle.interval}s`
      : 'none';
    const orbitText = selectedTower.orbit
      ? `${selectedTower.orbit.count} embers, ${selectedTower.orbit.damagePerSecond}/s each`
      : 'none';
    const vineText =
      selectedTower.vineCount > 0
        ? `${selectedTower.vineCount}, ${selectedTower.vineDamage}/hit every ${selectedTower.vineInterval}s`
        : 'none';
    const rootsText = selectedTower.roots.length > 0 ? `${selectedTower.roots.length} armed` : 'none';
    const thornShotText = selectedTower.hasThornShot
      ? `${selectedTower.thornShotCount}x ${selectedTower.thornShotDamage}/hit every ${selectedTower.thornShotInterval}s${
          selectedTower.thornShotPoison ? ', poisons' : ''
        }`
      : 'none';
    const lines = [
      `Damage: ${selectedTower.stats.damage.toFixed(1)}`,
      `Size: ${selectedTower.stats.size.toFixed(1)}`,
      `Attack interval: ${selectedTower.stats.attackInterval.toFixed(2)}s`,
      `Attack: ${selectedTower.attackType}`,
      `Burn: ${burnText}`,
      `Puddle: ${puddleText}`,
      `Orbit: ${orbitText}`,
      `Vines: ${vineText}`,
      `Roots: ${rootsText}`,
      `Thorn Shot: ${thornShotText}`,
    ];
    y = uiDrawTextLines(ctx, lines, x, y, 14, '#ccc', '12px sans-serif') + 8;
  }

  y = renderUpgradePaths(ctx, x, width, y) + 10;

  if (selectedTower) {
    const refund = getSellRefund(selectedTower);
    uiDrawButton(ctx, {
      x,
      y,
      w: width,
      h: 28,
      label: `Sell (+$${refund})`,
      state: 'default',
      hovered: Boolean(hoverRegion) && hoverRegion.id === 'sell-tower',
    });
    uiRegisterRegion('sell-tower', x, y, width, 28, { refund });
    y += 36;
  }

  return y;
}

// Refunds a fraction of everything actually spent on a tower — its base
// purchase cost plus every upgrade tier actually bought on it — rather than
// a flat amount unrelated to what the player put into it. 50% is a common
// tower-defense convention (steep enough that selling isn't a free way to
// shuffle towers around, generous enough to be worth using to recover from
// a bad placement).
const SELL_REFUND_RATE = 0.5;

function getSellRefund(tower) {
  return Math.floor((tower.moneySpent || 0) * SELL_REFUND_RATE);
}

function renderUpgradePaths(ctx, x, width, startY) {
  const type = selectedTower ? TOWER_TYPES[selectedTower.type] : TOWER_TYPES.sunflower;
  const columnGap = 8;
  const columnWidth = (width - columnGap * 2) / 3;
  const tierHeight = 32;
  const tierGap = 4;
  let maxBottom = startY;

  type.upgradePaths.forEach((path, pathIndex) => {
    const colX = x + pathIndex * (columnWidth + columnGap);
    let colY = startY;

    if (!path) {
      ctx.fillStyle = '#888';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Path ${pathIndex + 1}`, colX + columnWidth / 2, colY);
      colY += 16;
      ctx.font = '10px sans-serif';
      ctx.fillText('Not yet designed.', colX + columnWidth / 2, colY);
      ctx.textAlign = 'left';
      colY += 16;
      maxBottom = Math.max(maxBottom, colY);
      return;
    }

    const pathColor = PATH_COLORS[pathIndex];
    const isLockedOut = Boolean(selectedTower) && selectedTower.chosenPath !== null && selectedTower.chosenPath !== pathIndex;

    ctx.fillStyle = isLockedOut ? '#666' : pathColor;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(path.name, colX + columnWidth / 2, colY);
    ctx.textAlign = 'left';
    colY += 16;

    path.upgrades.forEach((upgrade, tierIndex) => {
      // A path can be partially designed — some tiers real, later ones
      // still `null` placeholders (same "Not yet designed" idea as an
      // entirely-undesigned path above, just one tier at a time). Muted,
      // no hit region, so it can't be hovered/clicked.
      if (!upgrade) {
        uiRoundRect(ctx, colX, colY, columnWidth, tierHeight, 4);
        ctx.fillStyle = '#14161b';
        ctx.fill();
        ctx.strokeStyle = '#24272e';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#555';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('Not yet designed', colX + 4, colY + 11);
        colY += tierHeight + tierGap;
        return;
      }

      const bought = Boolean(selectedTower) && selectedTower.chosenPath === pathIndex && tierIndex < selectedTower.upgradesPurchased;
      const isNextInLine =
        Boolean(selectedTower) &&
        !isLockedOut &&
        ((selectedTower.chosenPath === pathIndex && tierIndex === selectedTower.upgradesPurchased) ||
          (selectedTower.chosenPath === null && tierIndex === 0));
      const affordable = isNextInLine && canAfford(upgrade.cost);

      let fill = '#181b22';
      let border = '#2e333e';
      let textColor = '#777';
      let statusGlyph = '\u{1F512}'; // lock
      if (bought) {
        fill = 'rgba(76, 175, 80, 0.18)';
        border = '#4caf50';
        textColor = '#ddd';
        statusGlyph = '✓'; // check
      } else if (isLockedOut) {
        textColor = '#555';
      } else if (isNextInLine) {
        border = affordable ? pathColor : '#555';
        textColor = affordable ? '#eee' : '#999';
        statusGlyph = '→'; // arrow
      }

      const regionId = `upgrade:${pathIndex}:${tierIndex}`;
      const hovered = hoverRegion && hoverRegion.id === regionId;

      uiRoundRect(ctx, colX, colY, columnWidth, tierHeight, 4);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (hovered) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fill();
      }

      ctx.save();
      uiRoundRect(ctx, colX, colY, columnWidth, tierHeight, 4);
      ctx.clip();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = textColor;
      ctx.font = '9px sans-serif';
      ctx.fillText(`${statusGlyph} ${upgrade.name}`, colX + 4, colY + 4);
      ctx.fillStyle = bought ? '#8bc34a' : textColor;
      ctx.fillText(bought ? 'Owned' : `$${upgrade.cost}`, colX + 4, colY + 17);
      ctx.restore();

      uiRegisterRegion(regionId, colX, colY, columnWidth, tierHeight, {
        pathIndex,
        tierIndex,
        upgrade,
        bought,
        isNextInLine,
        isLockedOut,
        affordable,
      });

      colY += tierHeight + tierGap;
    });

    maxBottom = Math.max(maxBottom, colY);
  });

  return maxBottom;
}

function renderWaveSection(ctx, x, width, startY) {
  let y = startY;

  ctx.fillStyle = '#f0f0f0';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Wave', x, y);
  y += 22;

  ctx.font = '12px sans-serif';
  const waveLines = [
    `Round: ${round}`,
    ...currentWave.map((entry) =>
      entry.isBoss
        ? `BOSS: ${entry.name} (${entry.health} HP, ${entry.speedMultiplier}x speed)`
        : `${entry.name} x${entry.count} (${entry.health} HP each, ${entry.speedMultiplier}x speed)`
    ),
  ];
  const wrapped = waveLines.flatMap((line) => uiWrapText(ctx, line, width));
  y = uiDrawTextLines(ctx, wrapped, x, y, 14, '#ccc', '12px sans-serif') + 10;

  const waveInProgress = activeEnemies.length > 0;
  uiDrawButton(ctx, {
    x,
    y,
    w: width,
    h: 30,
    label: waveInProgress ? 'Wave in progress…' : 'Next Round',
    state: waveInProgress ? 'disabled' : 'accent',
    hovered: Boolean(hoverRegion) && hoverRegion.id === 'next-round' && !waveInProgress,
  });
  uiRegisterRegion('next-round', x, y, width, 30, { waveInProgress });
  y += 38;

  uiDrawButton(ctx, {
    x,
    y,
    w: width,
    h: 30,
    label: `${gameSpeed}x Speed`,
    state: 'default',
    hovered: Boolean(hoverRegion) && hoverRegion.id === 'speed-toggle',
  });
  uiRegisterRegion('speed-toggle', x, y, width, 30, {});
  y += 38;

  uiDrawButton(ctx, {
    x,
    y,
    w: width,
    h: 26,
    label: autoContinue ? 'Auto-Continue: On' : 'Auto-Continue: Off',
    state: autoContinue ? 'accent' : 'default',
    hovered: Boolean(hoverRegion) && hoverRegion.id === 'auto-continue-toggle',
  });
  uiRegisterRegion('auto-continue-toggle', x, y, width, 26, {});
  y += 34;

  if (damageBoostRemaining > 0) {
    ctx.fillStyle = '#ff8a65';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Damage Boost: ${damageBoostRemaining.toFixed(1)}s`, x, y);
  }
  y += 18;

  ctx.fillStyle = '#777';
  ctx.font = '11px sans-serif';
  ctx.fillText(`Seed: ${GAME_SEED}`, x, y);
  y += 16;

  return y;
}

// Sandbox's replacement for the Wave section — no rounds, so instead this
// is a palette of every enemy type (regular and boss alike, same unlock
// rule for both), one small tile each, reusing the exact drawEnemyShape()
// art enemies.js already has rather than separate icons. A type the
// player hasn't defeated yet in a real (non-Sandbox) game shows dimmed
// with a lock glyph and isn't clickable — same locked-tile convention the
// upgrade-path tiers already use.
const SANDBOX_TILE_SIZE = 44;
const SANDBOX_TILE_GAP = 6;

function renderSandboxSpawnSection(ctx, x, width, startY) {
  let y = startY;

  ctx.fillStyle = '#f0f0f0';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Spawn Enemy', x, y);
  y += 22;

  ctx.fillStyle = '#aaa';
  ctx.font = '11px sans-serif';
  const hintLines = uiWrapText(
    ctx,
    'No rounds here — click a defeated enemy to spawn one. Locked ones need a kill in Easy/Medium/Hard first.',
    width
  );
  y = uiDrawTextLines(ctx, hintLines, x, y, 13, '#aaa', '11px sans-serif') + 8;

  let tileX = x;
  let rowY = y;
  getAllSpawnableEnemyKeys().forEach((key) => {
    if (tileX + SANDBOX_TILE_SIZE > x + width) {
      tileX = x;
      rowY += SANDBOX_TILE_SIZE + SANDBOX_TILE_GAP;
    }

    const entry = getSpawnEntryForEnemyKey(key);
    if (!entry) return;
    const defeated = defeatedEnemyKeys.has(key);
    const regionId = `spawn:${key}`;
    const hovered = hoverRegion && hoverRegion.id === regionId;

    uiRoundRect(ctx, tileX, rowY, SANDBOX_TILE_SIZE, SANDBOX_TILE_SIZE, 6);
    ctx.fillStyle = hovered && defeated ? '#262b35' : '#1c2028';
    ctx.fill();
    ctx.strokeStyle = defeated ? '#454c5c' : '#3a2020';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    uiRoundRect(ctx, tileX, rowY, SANDBOX_TILE_SIZE, SANDBOX_TILE_SIZE, 6);
    ctx.clip();
    if (!defeated) ctx.globalAlpha = 0.35;
    const iconCenterX = tileX + SANDBOX_TILE_SIZE / 2;
    const iconCenterY = rowY + SANDBOX_TILE_SIZE / 2;
    // Scales the preview down so a boss's much larger radius still fits
    // the same small tile every regular enemy uses.
    const scale = Math.min(1, (SANDBOX_TILE_SIZE * 0.32) / entry.radius);
    ctx.translate(iconCenterX, iconCenterY);
    ctx.scale(scale, scale);
    ctx.translate(-iconCenterX, -iconCenterY);
    drawEnemyShape(ctx, {
      enemyKey: entry.enemyKey,
      isBoss: entry.isBoss,
      color: entry.color,
      radius: entry.radius,
      x: iconCenterX,
      y: iconCenterY,
    });
    ctx.restore();

    if (!defeated) {
      ctx.fillStyle = '#eee';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u{1F512}', iconCenterX, iconCenterY);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }

    uiRegisterRegion(regionId, tileX, rowY, SANDBOX_TILE_SIZE, SANDBOX_TILE_SIZE, {
      key,
      defeated,
      name: entry.name,
    });
    tileX += SANDBOX_TILE_SIZE + SANDBOX_TILE_GAP;
  });

  return rowY + SANDBOX_TILE_SIZE + 16;
}

// The canvas-drawn main menu — shown instead of the whole game+panel while
// gameState === 'menu'. Draws across the entire canvas (there's no world/
// panel split to respect here, nothing's running yet) and reuses the same
// uiRegions/uiHitTest hit-testing the in-game panel already relies on, so
// the click/hover routing in the event listeners below just works for it
// too without a separate input system.
const MENU_MODE_ORDER = ['easy', 'medium', 'hard', 'sandbox'];

function renderMenu(ctx) {
  uiBeginFrame();

  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#f0f0f0';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Bug Tower Defense', canvas.width / 2, 50);

  ctx.fillStyle = '#aaa';
  ctx.font = '13px sans-serif';
  ctx.fillText('Choose a mode to begin', canvas.width / 2, 92);

  const buttonWidth = Math.min(420, canvas.width - 40);
  const buttonHeight = 72;
  const gap = 16;
  const startY = 140;
  const x = canvas.width / 2 - buttonWidth / 2;

  MENU_MODE_ORDER.forEach((key, i) => {
    const mode = GAME_MODES[key];
    const y = startY + i * (buttonHeight + gap);
    const regionId = `menu:${key}`;
    const hovered = hoverRegion && hoverRegion.id === regionId;

    uiRoundRect(ctx, x, y, buttonWidth, buttonHeight, 8);
    ctx.fillStyle = hovered ? '#262b35' : '#1a1e26';
    ctx.fill();
    ctx.strokeStyle = hovered ? '#8bc34a' : '#3a4050';
    ctx.lineWidth = hovered ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = '#f0f0f0';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(mode.name, x + 18, y + 12);

    ctx.font = '12px sans-serif';
    const lines = uiWrapText(ctx, mode.description, buttonWidth - 36);
    uiDrawTextLines(ctx, lines, x + 18, y + 36, 15, '#aaa', '12px sans-serif');

    uiRegisterRegion(regionId, x, y, buttonWidth, buttonHeight, { modeKey: key });
  });

  const tooltipRegion = getActiveTooltipRegion();
  if (tooltipRegion) {
    const lines = getTooltipLines(tooltipRegion);
    if (lines.length) {
      uiDrawTooltip(ctx, tooltipRegion.x + tooltipRegion.w / 2, tooltipRegion.y, lines, canvas.width, canvas.height);
    }
  }
}

function renderUI(ctx) {
  uiBeginFrame();

  ctx.fillStyle = '#12161c';
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = '#2a2f3a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (layoutMode === 'side') {
    ctx.moveTo(panelX + 0.5, panelY);
    ctx.lineTo(panelX + 0.5, panelY + panelHeight);
  } else {
    ctx.moveTo(panelX, panelY + 0.5);
    ctx.lineTo(panelX + panelWidth, panelY + 0.5);
  }
  ctx.stroke();

  const contentX = panelX + PANEL_PADDING;
  const contentWidth = panelWidth - PANEL_PADDING * 2;

  let y = panelY + PANEL_PADDING;

  // Small, low-profile — a nice-to-have, not worth eating much of the
  // panel's height budget.
  uiDrawButton(ctx, {
    x: contentX,
    y,
    w: contentWidth,
    h: 20,
    label: `← Menu (${currentMode ? currentMode.name : ''})`,
    state: 'default',
    hovered: Boolean(hoverRegion) && hoverRegion.id === 'menu-return',
  });
  uiRegisterRegion('menu-return', contentX, y, contentWidth, 20, {});
  y += 26;

  y = renderShopSection(ctx, contentX, contentWidth, y);
  y = renderSelectedTowerSection(ctx, contentX, contentWidth, y);
  if (currentMode && currentMode.sandbox) {
    renderSandboxSpawnSection(ctx, contentX, contentWidth, y);
  } else {
    renderWaveSection(ctx, contentX, contentWidth, y);
  }

  const tooltipRegion = getActiveTooltipRegion();
  if (tooltipRegion) {
    const lines = getTooltipLines(tooltipRegion);
    if (lines.length) {
      uiDrawTooltip(
        ctx,
        tooltipRegion.x + tooltipRegion.w / 2,
        tooltipRegion.y,
        lines,
        canvas.width,
        canvas.height
      );
    }
  }
}

// Builds the hover/hold tooltip content for a panel region. Shown for every
// upgrade tier — including locked and path-locked ones — so hovering/
// holding a future upgrade is a legitimate way to preview it before it's
// reachable, not just a convenience for the next-in-line tier.
function getTooltipLines(region) {
  if (region.id.startsWith('shop:')) {
    const item = region.data;
    return [item.name, `$${item.cost} — place on open ground`];
  }

  if (region.id.startsWith('upgrade:')) {
    const { upgrade, bought, isLockedOut } = region.data;
    ctx.font = '12px sans-serif';
    const lines = [upgrade.name, bought ? 'Owned' : `$${upgrade.cost}`];
    lines.push(...uiWrapText(ctx, upgrade.description, 220));
    if (isLockedOut) lines.push('Locked — a different path was chosen.');
    return lines;
  }

  if (region.id === 'next-round') {
    return region.data.waveInProgress ? ['Wait for the current wave to clear.'] : ['Start the next wave.'];
  }

  if (region.id === 'speed-toggle') return ['Toggle 1x / 2x simulation speed.'];

  if (region.id === 'auto-continue-toggle') {
    return [
      autoContinue ? 'Auto-Continue is on.' : 'Auto-Continue is off.',
      'When on, the next round starts itself as soon as the current wave fully clears.',
    ];
  }

  if (region.id === 'sell-tower') {
    return [`Sell this tower for $${region.data.refund}`, `(${Math.round(SELL_REFUND_RATE * 100)}% of what was spent on it)`];
  }

  if (region.id === 'menu-return') return ['Back to the mode-select menu.'];

  if (region.id.startsWith('spawn:')) {
    return region.data.defeated
      ? [region.data.name, 'Click to spawn one.']
      : [region.data.name, 'Defeat this enemy in Easy/Medium/Hard to unlock it here.'];
  }

  if (region.id.startsWith('menu:')) {
    const mode = GAME_MODES[region.data.modeKey];
    return [mode.name, ...uiWrapText(ctx, mode.description, 260)];
  }

  return [];
}

// Resolves a click/tap on a panel region into a game-state change. Shared by
// the mouse click handler and the touch "quick tap" path below.
function activateRegion(region) {
  if (region.id.startsWith('shop:')) {
    const item = region.data;
    selectedShopItem = selectedShopItem === item ? null : item;
    return;
  }

  if (region.id.startsWith('upgrade:')) {
    const { pathIndex, upgrade, isNextInLine } = region.data;
    if (!isNextInLine || !selectedTower) return;
    if (!canAfford(upgrade.cost)) return;
    if (purchaseUpgrade(selectedTower, pathIndex)) {
      money -= upgrade.cost;
      selectedTower.moneySpent += upgrade.cost;
    }
    return;
  }

  if (region.id === 'sell-tower') {
    if (!selectedTower) return;
    money += region.data.refund;
    towers = towers.filter((tower) => tower !== selectedTower);
    selectedTower = null;
    return;
  }

  if (region.id === 'next-round') {
    if (region.data.waveInProgress) return;
    startNextRound();
    return;
  }

  if (region.id === 'auto-continue-toggle') {
    autoContinue = !autoContinue;
    return;
  }

  if (region.id === 'menu-return') {
    gameState = 'menu';
    return;
  }

  if (region.id.startsWith('spawn:')) {
    if (!region.data.defeated) return;
    const entry = getSpawnEntryForEnemyKey(region.data.key);
    if (entry) spawnSingleEnemy(entry);
    return;
  }

  if (region.id.startsWith('menu:')) {
    startGame(region.data.modeKey);
    return;
  }

  if (region.id === 'speed-toggle') {
    gameSpeed = gameSpeed === 1 ? 2 : 1;
  }
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function findTowerAt(x, y) {
  let closest = null;
  let closestDist = Infinity;

  towers.forEach((tower) => {
    const hitRadius = Math.max(getTowerVisualSize(tower), MIN_SELECT_RADIUS);
    const dist = Math.hypot(tower.x - x, tower.y - y);
    if (dist <= hitRadius && dist < closestDist) {
      closest = tower;
      closestDist = dist;
    }
  });

  return closest;
}

// World-area tap handling (placement/ladybug/tower-select) — shared by the
// mouse click handler and the touch "quick tap" path below. Only called for
// points inside the game world; panel taps go through activateRegion()
// instead (see the click/touch handlers).
function handleCanvasTap(x, y) {
  if (selectedShopItem) {
    if (!canAfford(selectedShopItem.cost)) return;
    if (isPointOnPath(x, y, PLACEMENT_PATH_MARGIN)) return;

    const tower = createTower(selectedShopItem.typeKey);
    tower.x = x;
    tower.y = y;
    tower.moneySpent = selectedShopItem.cost; // tracked for the Sell button's refund — see getSellRefund()
    towers.push(tower);
    money -= selectedShopItem.cost;

    selectedTower = tower; // jump straight to managing the tower just bought
    return;
  }

  // Not placing — a ladybug takes priority over tower selection (a
  // one-off, intentional interaction), then falls back to
  // selecting/switching/deselecting a tower.
  const ladybug = findLadybugAt(wildlife, x, y);
  if (ladybug && ladybug.cooldownRemaining <= 0) {
    ladybug.cooldownRemaining = LADYBUG_COOLDOWN;
    damageBoostRemaining = DAMAGE_BOOST_DURATION;
    return;
  }

  const clicked = findTowerAt(x, y);
  selectedTower = clicked === selectedTower ? null : clicked;
}

canvas.addEventListener('mousemove', (event) => {
  const point = getCanvasPoint(event);
  mouseX = point.x;
  mouseY = point.y;
  // On the menu, the whole canvas is UI — there's no "world" to exclude.
  hoverRegion = gameState === 'menu' || !isWorldPoint(point.x, point.y) ? uiHitTest(point.x, point.y) : null;
});

canvas.addEventListener('mouseleave', () => {
  mouseX = null;
  mouseY = null;
  hoverRegion = null;
});

canvas.addEventListener('click', (event) => {
  const { x, y } = getCanvasPoint(event);
  if (gameState === 'menu') {
    const region = uiHitTest(x, y);
    if (region) activateRegion(region);
    return;
  }
  if (isWorldPoint(x, y)) {
    handleCanvasTap(x, y);
    return;
  }
  const region = uiHitTest(x, y);
  if (region) activateRegion(region);
});

// Touch equivalent of mouse hover + click. There's no mousemove-before-tap
// on touch, so hover doesn't apply — instead, a press-and-hold on a panel
// region shows its tooltip (same content a mouse hover would show) without
// triggering its action; releasing early (a normal quick tap) triggers the
// action and never shows a tooltip. Dragging past a small threshold cancels
// the hold outright (and triggers nothing), so scrolling/dragging the page
// doesn't accidentally fire a button. World-area touches are unaffected —
// they act immediately on touchstart, same as before.
let touchHold = null;
const TOUCH_HOLD_MS = 450;
const TOUCH_MOVE_CANCEL_PX = 12;

function updateTouchHold() {
  if (touchHold && !touchHold.tooltipShown && performance.now() - touchHold.startTime >= TOUCH_HOLD_MS) {
    touchHold.tooltipShown = true;
  }
}

function getActiveTooltipRegion() {
  if (hoverRegion) return hoverRegion;
  if (touchHold && touchHold.tooltipShown) return touchHold.region;
  return null;
}

canvas.addEventListener(
  'touchstart',
  (event) => {
    event.preventDefault();
    const touch = event.touches[0];
    if (!touch) return;
    const { x, y } = getCanvasPoint(touch);

    if (gameState === 'menu' || !isWorldPoint(x, y)) {
      const region = uiHitTest(x, y);
      if (region) {
        touchHold = { region, startX: x, startY: y, startTime: performance.now(), tooltipShown: false };
        return;
      }
      if (gameState === 'menu') return; // menu has no world fallback to tap into
    }

    handleCanvasTap(x, y);
  },
  { passive: false }
);

canvas.addEventListener(
  'touchmove',
  (event) => {
    if (!touchHold) return;
    const touch = event.touches[0];
    if (!touch) return;
    const { x, y } = getCanvasPoint(touch);
    if (Math.hypot(x - touchHold.startX, y - touchHold.startY) > TOUCH_MOVE_CANCEL_PX) {
      touchHold = null; // dragged away — cancel outright, no tooltip, no action
    }
  },
  { passive: true }
);

canvas.addEventListener(
  'touchend',
  () => {
    if (!touchHold) return;
    const held = touchHold;
    touchHold = null;
    if (!held.tooltipShown) activateRegion(held.region); // released before the hold threshold — a tap
  },
  { passive: true }
);

// Scales how much simulated time each real frame adds to the fixed-step
// accumulator below — covers enemy movement, attack cooldowns, every
// DoT/puddle/orbit tick, everything, since they all run through update().
let gameSpeed = 1;

// When on, starts the next round itself the instant the current wave
// fully clears, instead of waiting for a manual Next Round click. Not
// reset by startGame(), so the preference carries across a "Back to Menu"
// and a fresh game — update()'s own check still guards against Sandbox
// (no rounds to auto-advance there) in case it was left on from an
// earlier real-mode game.
let autoContinue = false;

// Shared by the manual Next Round button and auto-continue below, so the
// two can never drift apart on what "starting the next round" means.
function startNextRound() {
  round += 1;
  currentWave = applyModeToWaveComposition(generateWave(round));
  spawnWave(currentWave);
}

// Fixed-timestep accumulator: the simulation always advances in constant
// FIXED_DT slices, however ragged the display's actual frame times are —
// so outcomes depend on how much time passed, not on framerate/timing
// jitter. gameSpeed scales how much simulated time each real frame adds to
// the accumulator, not the size of a slice, so ticks stay the same length
// at 1x and 2x (2x just runs roughly twice as many of them per frame).
// frameTime is clamped so a long tab-background pause doesn't force a
// huge catch-up burst of ticks once the tab is foregrounded again.
const FIXED_DT = 1 / 60;
const MAX_FRAME_TIME = 0.25;
let lastTime = 0;
let accumulator = 0;

function loop(timestamp) {
  const frameTime = lastTime ? Math.min((timestamp - lastTime) / 1000, MAX_FRAME_TIME) : 0;
  lastTime = timestamp;

  // Nothing to simulate on the menu — time simply doesn't accumulate while
  // it's up, same as the game being paused.
  if (gameState === 'playing') {
    accumulator += frameTime * gameSpeed;
    while (accumulator >= FIXED_DT) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
    }
  }

  render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
