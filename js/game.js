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
// The pixel space every render/layout function in this file is written
// in — independent of canvas.width/canvas.height themselves, which on a
// narrow phone are now scaled up by devicePixelRatio (see applyLayout()'s
// own comment below) so on-canvas buttons keep their real intended
// physical size instead of shrinking along with the whole canvas. Every
// existing reference to canvas.width/canvas.height for LAYOUT math (menu
// centering, map-select grid columns, tooltip clamping, etc.) was swapped
// to these two instead — canvas.width/height are now purely "how big is
// the backing store," not "how big is the game," and the two stopped
// being interchangeable the moment stacked mode started scaling them
// independently.
let logicalWidth = WORLD_WIDTH + PANEL_WIDTH_SIDE;
let logicalHeight = Math.max(WORLD_HEIGHT, PANEL_HEIGHT);

// Resizes the canvas and repositions the panel for the current viewport.
// Narrow screens get the world and panel stacked (both full WORLD_WIDTH in
// logical units, so every button keeps the same LOGICAL size as the
// already-shipped mobile support for the world itself) instead of shrunk
// side by side.
function applyLayout() {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : WORLD_WIDTH + PANEL_WIDTH_SIDE;
  layoutMode = viewportWidth < NARROW_BREAKPOINT ? 'stacked' : 'side';

  if (layoutMode === 'stacked') {
    panelX = 0;
    panelY = WORLD_HEIGHT;
    panelWidth = WORLD_WIDTH;
    panelHeight = PANEL_HEIGHT;
    logicalWidth = WORLD_WIDTH;
    logicalHeight = WORLD_HEIGHT + PANEL_HEIGHT;
  } else {
    panelX = WORLD_WIDTH;
    panelY = 0;
    panelWidth = PANEL_WIDTH_SIDE;
    panelHeight = PANEL_HEIGHT;
    logicalWidth = WORLD_WIDTH + PANEL_WIDTH_SIDE;
    logicalHeight = Math.max(WORLD_HEIGHT, PANEL_HEIGHT);
  }

  // Mobile bug fix (user report: touch controls/UI feel broken/awkward on
  // a phone). Root cause: style.css's canvas rule (max-width:100%;
  // height:auto) shrinks this logically-960px-wide canvas down to fit a
  // real phone's much narrower CSS viewport (~375-430px is typical) —
  // around a 0.4x shrink — and that shrinks every on-canvas button by the
  // exact same ratio, since logical pixels ARE the canvas's backing-store
  // pixels today. A 44px Sandbox tile (SANDBOX_TILE_SIZE) reads as ~18px
  // on an actual phone screen, well under any usable tap-target size —
  // this is a real, physical-size bug, not just "things look small."
  //
  // Fix: in stacked mode only, stop letting the browser's own CSS auto-
  // shrink the canvas's display size — pin canvas.style.width/height to
  // the real viewport width directly in JS instead, and make the backing
  // store that many devicePixelRatio-scaled pixels. Every render function
  // below still draws in plain logicalWidth/logicalHeight units via the
  // ctx.setTransform() scale factor applied here, so nothing about their
  // own drawing code needed to change — only the handful of places that
  // read canvas.width/canvas.height directly for LAYOUT math (not drawing)
  // were swapped to logicalWidth/logicalHeight below, since those two
  // stopped being the same number the moment this scaling was introduced.
  // Side (desktop) layout is intentionally untouched — this wasn't
  // reported as broken there, and desktop viewports are normally wide
  // enough that the canvas was never being shrunk in the first place.
  if (layoutMode === 'stacked' && typeof window !== 'undefined') {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(1, viewportWidth / logicalWidth);
    canvas.style.width = `${Math.round(logicalWidth * scale)}px`;
    canvas.style.height = `${Math.round(logicalHeight * scale)}px`;
    canvas.width = Math.round(logicalWidth * scale * dpr);
    canvas.height = Math.round(logicalHeight * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  } else {
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.width = logicalWidth;
    canvas.height = logicalHeight;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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

// Game modes — Easy/Hard (plain stat-multiplier tiers) were removed on
// direct request, leaving Medium as the one standard-rules mode alongside
// Sandbox and the new Horde Mode below. "Difficulty" was the old framing
// for this picker (three tiers of the same game); "game modes" is the
// current one (several different ways to play), so user-facing text calls
// it that now — see renderModeSelect()'s "Choose a Mode" title and the
// MENU_MODE_ORDER comment below.
//
// Multipliers of 1 / flags of false are deliberate no-ops (kept explicit
// rather than omitted) so every mode lists the same shape and nothing is
// "missing" by omission. `horde` parallels `sandbox`: a mode-specific flag
// the rest of the game checks rather than inferring from the mode key.
const GAME_MODES = {
  medium: {
    name: 'Medium',
    description: 'Standard rules. No modifiers.',
    healthMultiplier: 1,
    speedMultiplier: 1,
    bountyMultiplier: 1,
    sandbox: false,
    horde: false,
  },
  horde: {
    name: 'Horde Mode',
    description: 'Enemies never stop coming — no "Next Round" to wait for. 2x as many enemies as the normal count curve.',
    healthMultiplier: 1,
    speedMultiplier: 1,
    bountyMultiplier: 1,
    sandbox: false,
    horde: true,
  },
  sandbox: {
    name: 'Sandbox',
    description:
      'No waves or rounds. Freely spawn any enemy type, no matter what you’ve defeated before, to test builds. ' +
      'Unlimited money — place, upgrade, and sell towers freely.',
    healthMultiplier: 1,
    speedMultiplier: 1,
    bountyMultiplier: 1,
    sandbox: true,
    horde: false,
  },
};

// Every placed tower lives here, including the first one bought — there's
// no special "demo" tower anymore. The Upgrades panel always follows
// `selectedTower`, which the player sets by clicking a tower on the map.
let towers = [];
let selectedTower = null;

let round = 1;
let currentWave = [];

// Starting money — same in every mode; nothing about starting money
// differing per mode was ever asked for, so this doesn't vary. Bumped
// from $50 to $75 (direct request, part of the same balance pass that
// doubled every tower's base placement cost — see SHOP_ITEMS) so the
// player can still afford an opening tower or two under the new prices
// without feeling too pinched in the first couple of rounds.
const STARTING_MONEY = 75;
let money = STARTING_MONEY;

// Player/base health — starts at 500, loses an enemy's own max HP (not
// whatever partial HP it had left after tower damage — a tougher enemy
// that gets through should punish more; the user's phrasing was a little
// ambiguous, this is the reading taken) every time that enemy reaches the
// goal instead of dying first. Hitting 0 ends the run (see triggerGameOver
// below). Sandbox deliberately never touches this at all — consistent
// with its existing "no-consequence testing space" philosophy (same
// reasoning as its unlimited money) rather than tracking loss but
// clamping it at some floor above 0.
const PLAYER_STARTING_HEALTH = 500;
let playerHealth = PLAYER_STARTING_HEALTH;

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
// Base placement costs doubled across the board (direct request, part of
// the same balance pass as the $75 starting money above) — just the shop
// price to place a brand new tower, not any upgrade cost.
const SHOP_ITEMS = [
  { typeKey: 'sunflower', name: 'Sunflower', cost: 50 }, // was 25
  { typeKey: 'rose', name: 'Rose', cost: 90 }, // was 45
  { typeKey: 'mushroom', name: 'Mushroom', cost: 150 }, // was 75
  { typeKey: 'corpseFlower', name: 'Corpse Flower', cost: 750 }, // direct request — a brand-new 5th base tower
];

function getShopItemCost(item) {
  return item.cost;
}

// The Fungal Mess's reanimated purple zombie deals this flat amount when it
// reaches the goal, replacing (not adding to) the usual maxHealth-based
// leak damage every other enemy deals — see update()'s leaked-enemy block.
const PURPLE_ZOMBIE_LEAK_DAMAGE = 20;

// Prodigies (reworked per direct request: an upgrade on an already-maxed
// tower, not a separate standalone tower bought from the shop). Once a
// base tower reaches tier 4 on its own chosen path, it can be upgraded ONE
// MORE TIME into its ultimate "Prodigy" form — see activateRegion()'s
// 'prodigy-upgrade' branch, which replaces the tower in place (same spot
// on the field) rather than requiring a brand-new placement. Looked up by
// base type -> Prodigy typeKey; the inverse of PRODIGY_BASE_TYPE
// (towers.js), computed on demand rather than hand-maintained as a second
// mapping that could drift out of sync with it.
function getProdigyTypeKeyFor(baseTypeKey) {
  return Object.keys(PRODIGY_BASE_TYPE).find((key) => PRODIGY_BASE_TYPE[key] === baseTypeKey) || null;
}

// The Prodigy option available for a specific tower right now, or null if
// none applies — re-checked fresh every call (not cached), same as every
// other live UI-gating function in this file. null covers every reason a
// tower might not have one: it's not maxed yet, its base type doesn't have
// a Prodigy at all (Corpse Flower), or that Prodigy is already capped at 1
// on the field (independent per type — a maxed Rose never blocks a maxed
// Sunflower's own option, and vice versa).
function getProdigyOption(tower) {
  if (!tower || tower.upgradesPurchased < 4) return null;
  const prodigyTypeKey = getProdigyTypeKeyFor(tower.type);
  if (!prodigyTypeKey) return null;
  if (towers.some((other) => other.type === prodigyTypeKey)) return null;
  const prodigyType = TOWER_TYPES[prodigyTypeKey];
  return { typeKey: prodigyTypeKey, name: prodigyType.name, cost: prodigyType.cost };
}

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

// The map chosen on the map-select screen, carried into mode-select and
// then into startGame() below. Stays set after a game starts (so "← Menu"
// followed by picking a mode again defaults back to the same map — see
// renderMapSelect) until a different map is explicitly chosen.
let selectedMap = MAP_TYPES.deepForest;

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
  menuTrophyEnemies = null; // invalidate — the main menu's trophy trail rebuilds next time it's shown
}

// Every map the map-select screen can offer. The map editor (and the
// custom/imported maps it produced) was removed — this now just lists the
// built-ins, but stays its own function since renderMapSelect() already
// calls it and shouldn't care whether the list is built-ins-only or not.
function listAllMaps() {
  return MAP_TYPE_ORDER.map((key) => MAP_TYPES[key]);
}

// Applies the current mode's health/speed multipliers to a wave composition
// generated by enemies.js's generateWave() — kept entirely in game.js so
// enemies.js itself stays mode-agnostic (it only knows about rounds/health
// scaling, not game modes). Bosses go through the exact same map() as
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
  setActiveMap(selectedMap);
  currentModeKey = modeKey;
  currentMode = GAME_MODES[modeKey];
  gameState = 'playing';

  towers = [];
  selectedTower = null;
  selectedShopItem = null;
  projectiles = [];
  round = 1;
  money = STARTING_MONEY;
  playerHealth = PLAYER_STARTING_HEALTH;
  wildlife = createWildlifeSwarm(getActiveMap());

  if (currentMode.sandbox) {
    currentWave = [];
    spawnWave([]); // clears activeEnemies without duplicating that logic here
  } else if (currentMode.horde) {
    spawnWave([]); // same "clear activeEnemies" starting point as every other mode
    startHordeBatch();
  } else {
    currentWave = applyModeToWaveComposition(generateWave(round));
    spawnWave(currentWave);
  }
}

// Snapshot of a couple of stats at the moment the run ended, so the Game
// Over screen can show them after gameState has moved on from 'playing'
// (round/currentMode themselves keep changing/reset on the next game).
let gameOverStats = { round: 0, modeName: '' };

function triggerGameOver() {
  gameOverStats = { round, modeName: currentMode ? currentMode.name : '' };
  gameState = 'gameOver';
}

// The game's own simulation clock, advanced in update() rather than read
// from the wall clock — idle animation (sway, pulses) stays tied to game
// speed/determinism instead of real time.
let animationTime = 0;

// Purely decorative fireflies/frogs (js/wildlife.js) — ladybugs (and the
// click-for-+50%-damage power-up that came with them) were removed per
// direct request; see git history. Regenerated per game start (see
// startGame()) since which critters spawn depends on the active map
// (frogs only where there are lily pads to hop between) — the initial
// value here only matters before any mode is chosen, while the menu is up.
let wildlife = createWildlifeSwarm(getActiveMap());

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

// Neurological's one-time tower-consumption (see consumeTowersInRange()
// below) needs some feedback at each consumed tower's former position —
// an expanding, fading dark ring — so it doesn't look like towers just
// silently vanished. One entry per consumed tower, independent of the
// infectStun mechanic's own per-frame state.
const CONSUMED_EFFECT_DURATION = 0.6;
let consumedTowerEffects = [];

function updateConsumedTowerEffects(deltaSeconds) {
  consumedTowerEffects.forEach((effect) => {
    effect.remaining -= deltaSeconds;
  });
  consumedTowerEffects = consumedTowerEffects.filter((effect) => effect.remaining > 0);
}

function renderConsumedTowerEffects(ctx) {
  consumedTowerEffects.forEach((effect) => {
    const progress = 1 - effect.remaining / CONSUMED_EFFECT_DURATION; // 0 -> 1 as it expands/fades
    ctx.strokeStyle = `rgba(123, 31, 162, ${1 - progress})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, 10 + progress * 40, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// A small, generic floating-text popup system — originally built for the
// (since-removed) Coneflower's "+$X" income ticks, kept as reusable,
// genuinely generic infrastructure rather than deleted outright: anything
// that wants a brief rising/fading label (a damage number, a bonus-effect
// callout, etc.) can call spawnFloatingText() without building its own
// one-off version of this. Each entry rises a fixed distance and fades
// out linearly over FLOATING_TEXT_DURATION; `color` is a full
// ctx.fillStyle-ready string (so callers can pass rgba() directly if they
// want their own fade curve, though the default alpha fade here covers
// the common case).
const FLOATING_TEXT_DURATION = 1;
const FLOATING_TEXT_RISE = 30; // px risen over its full lifetime
let floatingTexts = [];

function spawnFloatingText(x, y, text, color = '#8bc34a') {
  floatingTexts.push({ x, y, text, color, remaining: FLOATING_TEXT_DURATION });
}

function updateFloatingTexts(deltaSeconds) {
  floatingTexts.forEach((entry) => {
    entry.remaining -= deltaSeconds;
  });
  floatingTexts = floatingTexts.filter((entry) => entry.remaining > 0);
}

function renderFloatingTexts(ctx) {
  floatingTexts.forEach((entry) => {
    const progress = 1 - entry.remaining / FLOATING_TEXT_DURATION; // 0 -> 1 as it rises/fades
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = entry.color;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(entry.text, entry.x, entry.y - progress * FLOATING_TEXT_RISE);
    ctx.restore();
  });
}

function spawnProjectile(tower, target, damageMultiplier = 1) {
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
    damage: tower.stats.damage * damageMultiplier,
    burn: tower.burn,
    color: tower.attackType === 'fireball' ? '#ff5722' : tower.stats.color,
    shape:
      tower.attackType === 'fireball' ? 'fireball' : tower.type === 'mushroom' || tower.type === 'fungalMess' ? 'spore' : 'petal',
    // Mushroom's Zombify: carried per-projectile (not read from the tower
    // at resolve time) since the tower that fired it is the one and only
    // source of truth for "was this a spore, and at what chance/damage" —
    // resolveProjectile() below doesn't need a reference back to the tower.
    isSpore: tower.type === 'mushroom',
    zombifyChance: tower.type === 'mushroom' ? tower.zombifyChance : 0,
    zombieExplosionDamage: tower.type === 'mushroom' ? tower.zombieExplosionDamage : 0,
    // The Fungal Mess (Mushroom's Prodigy): a completely separate roll from
    // Zombify above (deliberately not folded into isSpore/zombifyChance —
    // see towers.js's own comment on reanimateChance for why these two
    // "a kill doesn't quite take" mechanics are kept apart) that can
    // reanimate its own killing blow's victim as a purple zombie instead —
    // see resolveProjectile() below and turnIntoPurpleZombie() in enemies.js.
    reanimateChance: tower.type === 'fungalMess' ? tower.reanimateChance : 0,
    resolved: false,
  });
}

// Corpse Flower's Acidic Mixture Path: a distinct projectile from the
// tower's own base attack (see updateTowerAcidShot() below for the
// separate fixed-cadence firing that calls this) — same travel-with-
// target-drift-tolerance mechanics as spawnProjectile()'s own
// projectiles (reuses resolveProjectile() unchanged below), but carries
// `slow` instead of `burn`/Zombify/reanimate, and its own damage/color
// read straight off the tower's current acid tier (tower.acid) rather
// than tower.stats.damage.
function spawnAcidProjectile(tower, target) {
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
    damage: tower.acid.damage,
    burn: null,
    slow: { multiplier: tower.acid.slowMultiplier, duration: tower.acid.slowDuration },
    // Same acid-color progression as the tower's own dripping-acid visual
    // (drawCorpseFlowerHead, towers.js) — toxic green-yellow through
    // tier 2, red from tier 3 on ("the acid turns red") — tower.acid.color
    // is the single source of truth both read, set per tier in TOWER_TYPES.
    color: tower.acid.color,
    shape: 'acid',
    isSpore: false,
    zombifyChance: 0,
    zombieExplosionDamage: 0,
    reanimateChance: 0,
    resolved: false,
  });
}

function resolveProjectile(projectile) {
  const { target } = projectile;
  // A zombie is a separate state machine (turnIntoZombie()/
  // updateZombieMovement() in enemies.js) that doesn't take normal combat
  // damage any more — without this check, a second projectile already in
  // flight toward an enemy that turned into a zombie from an *earlier*-
  // resolving projectile this same tick (e.g. two towers both targeting
  // the same low-health enemy) would still land on it here, driving its
  // health back to <=0 while isZombie stayed true. That combination used
  // to freeze the zombie in place forever — see the matching fix/comment
  // in enemies.js's updateEnemies() for the other half of this.
  if (!target || target.health <= 0 || target.isZombie) return; // fizzle: target already dead or already a zombie

  const driftFromAim = Math.hypot(target.x - projectile.aimX, target.y - projectile.aimY);
  if (driftFromAim > target.radius + PROJECTILE_HIT_TOLERANCE) return; // fizzle: wandered off

  damageEnemy(target, projectile.damage);
  if (projectile.burn) applyBurn(target, projectile.burn);
  if (projectile.slow) applySlow(target, projectile.slow);

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

  // The Fungal Mess's reanimation: same "only this hit's own killing blow
  // counts, never a boss" shape as Zombify above, just a separate chance
  // rolled independently (a target could in principle be eligible for
  // both rolls if some future upgrade let it, and they wouldn't interact —
  // whichever check runs first and succeeds wins, since both set health
  // back to a positive number and return via their own distinct flag).
  if (
    target.health <= 0 &&
    !target.isBoss &&
    projectile.reanimateChance > 0 &&
    random() < projectile.reanimateChance
  ) {
    turnIntoPurpleZombie(target);
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

// Mushroom's Enable Path: finds the strongest Enable-Path aura currently
// reaching `targetTower` (any Enable-Path Mushroom — including another
// Mushroom — whose own attack range reaches it, excluding the tower
// buffing itself), or null. "Strongest" = highest tier owned
// (upgradesPurchased doubles as the tier number on this path, 1-4, and
// each later tier is a strict upgrade over the one before it — Power's
// 1.5x damage-only beats Speed's interval-only, Fungus Juice beats
// everything), so multiple auras overlapping the same tower never stack —
// simplest unambiguous ranking rather than scoring each aura's stats
// individually. Recomputed fresh every call (not cached on the buffed
// tower) specifically so the buff turns off the instant the Mushroom is
// sold or either tower moves out of range, with nothing to "turn off."
function getStrongestAuraFor(targetTower) {
  let bestMushroom = null;
  towers.forEach((tower) => {
    if (tower === targetTower || tower.type !== 'mushroom' || !tower.aura) return;
    const dist = Math.hypot(tower.x - targetTower.x, tower.y - targetTower.y);
    if (dist > tower.stats.range) return;
    if (!bestMushroom || tower.upgradesPurchased > bestMushroom.upgradesPurchased) bestMushroom = tower;
  });
  return bestMushroom ? bestMushroom.aura : null;
}

function updateTowerAttack(tower, x, y, deltaSeconds) {
  // Enable Path's aura buffs a tower's *primary* attack only (range/
  // damage/interval) — the same scoping the old ladybug damage-boost used
  // ("your towers hit harder," not every damage source in the game, so
  // vines/thorn-shot/puddles/etc. are untouched). Looked up fresh every
  // tick (see getStrongestAuraFor's own comment) rather than written into
  // tower.stats, so nothing here is a permanent mutation.
  const aura = getStrongestAuraFor(tower);
  const auraIntervalMultiplier = (aura && aura.attackIntervalMultiplier) || 1;
  const auraDamageMultiplier = (aura && aura.damageMultiplier) || 1;
  const auraRangeMultiplier = (aura && aura.rangeMultiplier) || 1;

  tower.target = findNearestEnemyInRange(x, y, tower.stats.range * auraRangeMultiplier);
  tower.attackFlash = Math.max(0, tower.attackFlash - deltaSeconds);

  tower.attackCooldown = Math.max(0, tower.attackCooldown - deltaSeconds);
  if (tower.target && tower.attackCooldown <= 0) {
    if (tower.attackType === 'ray') {
      // A continuous beam hits instantly — there's no travel time to model.
      damageEnemy(tower.target, tower.stats.damage * auraDamageMultiplier);
      if (tower.burn) applyBurn(tower.target, tower.burn);
    } else {
      // Damage (and burn) travel with the projectile and apply on arrival —
      // the aura multiplier is baked into the projectile's own damage at
      // the moment it's fired, same snapshot-at-launch convention burn and
      // Zombify chance already use for a projectile in flight.
      spawnProjectile(tower, tower.target, auraDamageMultiplier);
    }
    tower.attackCooldown = tower.stats.attackInterval * auraIntervalMultiplier;
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
  if (tower.infectStun) updateTowerInfectStun(tower, x, y, deltaSeconds);
  if (tower.grabInterval > 0) updateTowerGrab(tower, x, y, deltaSeconds);
  if (tower.gasCloud) updateTowerGasCloud(tower, x, y, deltaSeconds);
  if (tower.acid) updateTowerAcidShot(tower, x, y, deltaSeconds);
  tower.shockwavePulse = Math.max(0, tower.shockwavePulse - deltaSeconds);
}

// Corpse Flower's Hazard Path (tier 2+) gas cloud: every
// GAS_CLOUD_TICK_INTERVAL (towers.js — a fixed 0.2s, never itself changed
// per tier), damages every enemy currently standing within the cloud's
// own radius — completely independent of the tower's normal attack/
// targeting (no findNearestEnemyInRange, no cooldown shared with
// attackCooldown): a persistent AoE zone, not a second shot. A new,
// reusable mechanic (distinct from Mushroom's non-damaging buff/debuff
// aura) — any future tower wanting the same "always-on damage zone
// centered on itself" behavior just needs its own gasCloud/
// gasCloudCooldown fields (see createTower() in towers.js).
function updateTowerGasCloud(tower, x, y, deltaSeconds) {
  tower.gasCloudCooldown -= deltaSeconds;
  if (tower.gasCloudCooldown > 0) return;
  tower.gasCloudCooldown = GAS_CLOUD_TICK_INTERVAL;

  getEnemiesInRadius(x, y, tower.gasCloud.radius).forEach((enemy) => damageEnemy(enemy, tower.gasCloud.damagePerTick));
}

// Corpse Flower's Acidic Mixture Path (all 4 tiers): every
// ACID_SHOT_INTERVAL (towers.js — a fixed 2s, never itself changed per
// tier), fires one acid projectile at the tower's own current target in
// range — completely independent of the tower's base-attack cooldown
// (its own separate tower.acidCooldown, not shared with
// tower.attackCooldown), same "a second independent effect on its own
// cooldown" shape as updateTowerGrab below. Finds its own target rather
// than reusing tower.target (set by the base attack above) since the two
// cooldowns can drift out of phase with each other — by the time this
// fires, the base attack's own target may have died, left range, or
// never existed yet this tick.
function updateTowerAcidShot(tower, x, y, deltaSeconds) {
  tower.acidCooldown -= deltaSeconds;
  if (tower.acidCooldown > 0) return;
  tower.acidCooldown = ACID_SHOT_INTERVAL;

  const target = findNearestEnemyInRange(x, y, tower.stats.range);
  if (!target) return;
  spawnAcidProjectile(tower, target);
}

// The Mangler (Rose's Prodigy) only: every grabInterval seconds, grabs one
// random non-boss enemy currently in range, dealing grabDamage bonus
// damage and holding it immobilized for grabDuration — additive on top of
// the tower's own normal continuous attack above, not a replacement (same
// "a second independent effect on its own cooldown" shape as every other
// periodic add-on in this file). Reuses the existing immobilizedRemaining
// field — the same one Rose's own Root Path grab sets — rather than
// inventing a parallel "held" state.
function updateTowerGrab(tower, x, y, deltaSeconds) {
  tower.grabCooldown -= deltaSeconds;
  if (tower.grabCooldown > 0) return;
  tower.grabCooldown = tower.grabInterval;

  const eligible = getEnemiesInRadius(x, y, tower.stats.range).filter((enemy) => !enemy.isBoss);
  if (eligible.length === 0) return;
  const victim = eligible[Math.floor(random() * eligible.length)];
  damageEnemy(victim, tower.grabDamage);
  victim.immobilizedRemaining = Math.max(victim.immobilizedRemaining, tower.grabDuration);
}

// Mushroom's Infect Path (all 4 tiers): once a second, independently roll
// tower.infectStun.chance against every enemy currently in range — same
// periodic-timer shape as updateTowerPuddle's interval cooldown above, but
// every enemy gets its own roll each tick rather than one roll per cycle,
// since the spec calls for an independent per-enemy chance, not an
// all-or-nothing area proc. A hit sets enemy.infectedRemaining up to the
// tier's duration (never down — re-infecting mid-stun just refreshes it,
// same `Math.max` convention immobilize already uses) rather than stacking
// durations, which would let overlapping Mushrooms chain-stun forever.
function updateTowerInfectStun(tower, x, y, deltaSeconds) {
  tower.infectCooldown -= deltaSeconds;
  if (tower.infectCooldown > 0) return;
  tower.infectCooldown += 1;

  getEnemiesInRadius(x, y, tower.stats.range).forEach((enemy) => {
    if (random() < tower.infectStun.chance) {
      enemy.infectedRemaining = Math.max(enemy.infectedRemaining, tower.infectStun.duration);
    }
  });
}

// Every other tower whose center sits within `mushroom`'s own range stat —
// the same "towers in its range" reading the Enable Path's aura already
// uses (there it buffs them, here Neurological destroys them). A plain
// query function, no side effects, so both the confirm-prompt preview in
// activateRegion and consumeTowersInRange() itself can share it.
function getTowersInRange(mushroom) {
  return towers.filter((tower) => tower !== mushroom && Math.hypot(tower.x - mushroom.x, tower.y - mushroom.y) <= mushroom.stats.range);
}

// Every other tower on the field sharing `tower`'s own base type — what
// the Prodigy upgrade destroys when it transforms `tower` (direct
// request). A plain query function, same "shared by the confirm-prompt
// preview and the thing that actually destroys them" reasoning as
// getTowersInRange() above.
function getOtherTowersOfSameType(tower) {
  return towers.filter((other) => other !== tower && other.type === tower.type);
}

// Removes every tower in `victims` from the field, no refund, each leaving
// behind the same fading "consumed" ring effect — shared by Neurological
// (consumeTowersInRange(), below) and the Prodigy upgrade's same-type
// destruction (activateRegion()'s 'prodigy-upgrade' branch) rather than
// each duplicating this.
function destroyTowers(victims) {
  victims.forEach((tower) => {
    consumedTowerEffects.push({ x: tower.x, y: tower.y, remaining: CONSUMED_EFFECT_DURATION });
  });
  towers = towers.filter((tower) => !victims.includes(tower));
}

// Neurological's one-time effect: instantly destroys every other tower
// currently in range, no refund, the moment it's purchased — confirmed by
// the user as a ONE-TIME effect, not an ongoing aura, so this runs once
// from activateRegion's upgrade-purchase branch and nothing re-checks it
// later. Towers placed afterward, or towers that move into range later,
// are never touched by it.
function consumeTowersInRange(mushroom) {
  destroyTowers(getTowersInRange(mushroom));
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

  // An enemy that reached the goal alive costs the player health equal to
  // that enemy's own max HP (see PLAYER_STARTING_HEALTH's comment for why
  // max rather than whatever health it had left) — skipped entirely in
  // Sandbox, same "no consequences" treatment as its unlimited money.
  if (!currentMode.sandbox) {
    const leaked = getLastLeakedEnemies();
    if (leaked.length > 0) {
      // A purple zombie (The Fungal Mess's reanimation) deals a flat 20
      // instead of its own maxHealth — per spec, this replaces the usual
      // health-based leak damage for that one enemy, it doesn't add to it.
      const totalDamage = leaked.reduce(
        (sum, enemy) => sum + (enemy.isPurpleZombie ? PURPLE_ZOMBIE_LEAK_DAMAGE : enemy.maxHealth),
        0
      );
      playerHealth = Math.max(0, playerHealth - totalDamage);
      if (playerHealth <= 0) {
        triggerGameOver();
        return; // nothing below matters once the run has ended
      }
    }
  }

  towers.forEach((tower) => updateTowerAttack(tower, tower.x, tower.y, deltaSeconds));
  updateProjectiles(deltaSeconds);
  updateConsumedTowerEffects(deltaSeconds);
  updateFloatingTexts(deltaSeconds);

  // Horde Mode has no wave boundary to auto-continue across — it paces
  // itself independently of autoContinue/activeEnemies, via its own timer.
  if (currentMode.horde) {
    hordeSpawnTimer -= deltaSeconds;
    if (hordeSpawnTimer <= 0) {
      round += 1;
      startHordeBatch();
    }
    return;
  }

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

  if (MENU_STATES.has(gameState)) {
    canvas.style.cursor = 'default';
    if (gameState === 'menu') renderMenu(ctx);
    else if (gameState === 'mapSelect') renderMapSelect(ctx);
    else if (gameState === 'modeSelect') renderModeSelect(ctx);
    else renderGameOver(ctx);
    return;
  }

  canvas.style.cursor = selectedShopItem ? 'crosshair' : 'default';

  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  // map.js only reads .width/.height off what's passed here — this keeps
  // the world's own rendering fixed at WORLD_WIDTH x WORLD_HEIGHT regardless
  // of how big the real canvas is (map.js itself is untouched).
  renderMap(ctx, { width: WORLD_WIDTH, height: WORLD_HEIGHT }, animationTime);
  renderWildlife(ctx, wildlife, animationTime, 'frog'); // ground-level, under everything else

  towers.forEach((tower) => renderTowerGroundEffects(ctx, tower));
  towers.forEach((tower) => drawTowerWithRay(tower, tower.x, tower.y));

  renderEnemies(ctx, animationTime);
  renderProjectiles(ctx);
  renderConsumedTowerEffects(ctx);
  renderWildlife(ctx, wildlife, animationTime, 'firefly'); // glowing, drawn on top so it reads over everything
  renderFloatingTexts(ctx); // "+$X" income popups etc. — always the topmost world layer, so they stay legible

  if (selectedShopItem && mouseX !== null && isWorldPoint(mouseX, mouseY)) {
    const buildable =
      canAfford(getShopItemCost(selectedShopItem)) &&
      !isPointOnPath(mouseX, mouseY, PLACEMENT_PATH_MARGIN) &&
      !isTowerPlacementBlocked(mouseX, mouseY, selectedShopItem.typeKey);
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

// Direct request: towers can't be placed overlapping each other. A new
// tower needs to be at least both towers' own current visual radii apart
// from every existing one — reusing getTowerVisualSize() (not a flat
// placement radius) means a big upgraded tower blocks more space around
// it than a freshly-placed one would, and a freshly-placed big tower
// (Rose's Root Path can push size up to ~200+) correctly needs more
// clearance too. The candidate's own size is read off the cached shop-
// preview tower (base stats, pre-upgrade — exactly what a brand new
// tower's size actually is at the moment it's placed) rather than
// creating a throwaway tower just to measure it. Shared by the hover
// preview (render()) and the actual placement (handleCanvasTap()) so
// both agree on exactly the same spots, in both normal play and Sandbox
// — handleCanvasTap is the one placement code path for both.
function isTowerPlacementBlocked(x, y, typeKey) {
  const newSize = getTowerVisualSize(getShopPreviewTower(typeKey));
  return towers.some((tower) => Math.hypot(tower.x - x, tower.y - y) < newSize + getTowerVisualSize(tower));
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
  // Floored defensively rather than assumed-integer — `money` should
  // already be a whole number in practice (bounties round to the
  // nearest dollar), but flooring here costs nothing and guards against
  // any future source that isn't quite so tidy.
  ctx.fillText(currentMode && currentMode.sandbox ? '∞' : `$${Math.floor(money)}`, x + width, y + 1);
  ctx.textAlign = 'left';
  y += 26;

  let tileX = x;
  let rowY = y;
  SHOP_ITEMS.forEach((item) => {
    if (tileX + SHOP_TILE_SIZE > x + width) {
      tileX = x;
      rowY += SHOP_TILE_SIZE + SHOP_TILE_GAP;
    }

    const affordable = canAfford(getShopItemCost(item));
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
    // The Prodigy upgrade (direct request): offered here, below the 3
    // regular paths, rather than as a 4th path column — it isn't tied to
    // any one of them (a tower reaches it from whichever path it maxed),
    // and it replaces the whole tower rather than adding one more tier.
    const prodigyOption = getProdigyOption(selectedTower);
    if (prodigyOption) {
      const affordableProdigy = canAfford(prodigyOption.cost);
      uiDrawButton(ctx, {
        x,
        y,
        w: width,
        h: 28,
        label: `Become ${prodigyOption.name} ($${prodigyOption.cost})`,
        state: affordableProdigy ? 'accent' : 'disabled',
        hovered: Boolean(hoverRegion) && hoverRegion.id === 'prodigy-upgrade',
      });
      uiRegisterRegion('prodigy-upgrade', x, y, width, 28, prodigyOption);
      y += 36;
    }

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

  // Player/base health — this function is only ever called outside
  // Sandbox (see renderUI()'s dispatch and renderSandboxSpawnSection's own
  // separate panel section), so there's no extra mode check needed here:
  // Sandbox simply never reaches this code, matching its "no consequences"
  // treatment of health loss itself.
  ctx.fillStyle = '#f0f0f0';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Health', x, y);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.ceil(playerHealth)} / ${PLAYER_STARTING_HEALTH}`, x + width, y);
  ctx.textAlign = 'left';
  y += 18;

  const healthRatio = Math.max(0, playerHealth / PLAYER_STARTING_HEALTH);
  const healthBarHeight = 10;
  uiRoundRect(ctx, x, y, width, healthBarHeight, 4);
  ctx.fillStyle = '#1c2028';
  ctx.fill();
  if (healthRatio > 0) {
    uiRoundRect(ctx, x, y, Math.max(healthBarHeight, width * healthRatio), healthBarHeight, 4);
    ctx.fillStyle = healthRatio > 0.5 ? '#4caf50' : healthRatio > 0.25 ? '#ffb300' : '#e53935';
    ctx.fill();
  }
  y += healthBarHeight + 12;

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

  // Horde Mode has no discrete round to wait at — no Next Round button (it
  // can never be "pressed," enemies just keep coming) and no Auto-Continue
  // toggle (that preference is effectively always-on here, so there's
  // nothing for it to toggle).
  const isHorde = Boolean(currentMode && currentMode.horde);

  if (isHorde) {
    uiDrawButton(ctx, {
      x,
      y,
      w: width,
      h: 30,
      label: 'Enemies spawning continuously…',
      state: 'disabled',
    });
    y += 38;
  } else {
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
  }

  // A 4-stop discrete speed control (1x/2x/3x/4x) — replaces the old
  // 1x/2x-only toggle button. Click/tap-to-select one of 4 fixed segments
  // rather than a true draggable handle; there's nothing in between the 4
  // stops for a handle to usefully rest at, so this is the simplest
  // reliable implementation for a 4-way discrete choice, not a cut corner.
  const speedSegmentGap = 6;
  const speedSegmentWidth = (width - speedSegmentGap * (SPEED_OPTIONS.length - 1)) / SPEED_OPTIONS.length;
  let speedX = x;
  SPEED_OPTIONS.forEach((speed) => {
    const regionId = `speed:${speed}`;
    uiDrawButton(ctx, {
      x: speedX,
      y,
      w: speedSegmentWidth,
      h: 30,
      label: `${speed}x`,
      state: gameSpeed === speed ? 'accent' : 'default',
      hovered: Boolean(hoverRegion) && hoverRegion.id === regionId,
    });
    uiRegisterRegion(regionId, speedX, y, speedSegmentWidth, 30, { speed });
    speedX += speedSegmentWidth + speedSegmentGap;
  });
  y += 38;

  if (!isHorde) {
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
  }

  ctx.fillStyle = '#777';
  ctx.font = '11px sans-serif';
  ctx.fillText(`Seed: ${GAME_SEED}`, x, y);
  y += 16;

  return y;
}

// Sandbox's replacement for the Wave section — no rounds, so instead this
// is a palette of every enemy type (regular and boss alike), one small
// tile each, reusing the exact drawEnemyShape() art enemies.js already has
// rather than separate icons. Every tile is always spawnable in Sandbox —
// there used to be a "must have defeated this enemy in a real game first"
// lock here (mirroring the upgrade-path tiers' locked-tile look), but that
// was removed on direct request ("spawn in any enemy i want in sandbox no
// matter what"). defeatedEnemyKeys itself is untouched — it still gates
// the separate menu-backdrop trophy gallery, just not this palette.
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
  const hintLines = uiWrapText(ctx, 'No rounds here — click any enemy to spawn one.', width);
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
    const regionId = `spawn:${key}`;
    const hovered = hoverRegion && hoverRegion.id === regionId;

    uiRoundRect(ctx, tileX, rowY, SANDBOX_TILE_SIZE, SANDBOX_TILE_SIZE, 6);
    ctx.fillStyle = hovered ? '#262b35' : '#1c2028';
    ctx.fill();
    ctx.strokeStyle = '#454c5c';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    uiRoundRect(ctx, tileX, rowY, SANDBOX_TILE_SIZE, SANDBOX_TILE_SIZE, 6);
    ctx.clip();
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

    uiRegisterRegion(regionId, tileX, rowY, SANDBOX_TILE_SIZE, SANDBOX_TILE_SIZE, {
      key,
      name: entry.name,
    });
    tileX += SANDBOX_TILE_SIZE + SANDBOX_TILE_GAP;
  });

  return rowY + SANDBOX_TILE_SIZE + 16;
}

// The canvas-drawn menu screens — shown instead of the whole game+panel
// while gameState is 'menu' | 'mapSelect' | 'modeSelect' (see MENU_STATES
// below). Each draws across the entire canvas (there's no world/panel
// split to respect here, nothing's running yet) and reuses the same
// uiRegions/uiHitTest hit-testing the in-game panel already relies on, so
// the click/hover routing in the event listeners below just works for them
// too without a separate input system.
//
// Flow: 'menu' (Play) → 'mapSelect' (pick a map) → 'modeSelect' (pick a
// game mode — Medium/Horde Mode/Sandbox — for that map) → startGame().
// Both the map and the mode are picked as their own explicit step rather
// than folded into one screen — each stays a simple tile grid/list instead
// of needing a two-axis picker. 'gameOver' (see renderGameOver below) is
// also a full-screen UI state with no world/panel split, so it shares this
// set too despite the name — every input handler below just cares "is the
// whole canvas UI right now," not specifically "is this a menu."
const MENU_STATES = new Set(['menu', 'mapSelect', 'modeSelect', 'gameOver']);
const MENU_MODE_ORDER = ['medium', 'horde', 'sandbox'];

// `skipBackground` lets renderMenu() paint its own forest-trail backdrop
// (see renderMenuBackdrop below) instead of the flat fill every other
// screen that calls this (mapSelect/modeSelect) still gets.
function drawMenuTitle(ctx, title, subtitle, skipBackground) {
  if (!skipBackground) {
    ctx.fillStyle = '#10131a';
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  }

  ctx.fillStyle = '#f0f0f0';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(title, logicalWidth / 2, 50);

  ctx.fillStyle = '#aaa';
  ctx.font = '13px sans-serif';
  ctx.fillText(subtitle, logicalWidth / 2, 92);
}

function drawMenuTooltip(ctx) {
  const tooltipRegion = getActiveTooltipRegion();
  if (!tooltipRegion) return;
  const lines = getTooltipLines(tooltipRegion);
  if (lines.length) {
    uiDrawTooltip(ctx, tooltipRegion.x + tooltipRegion.w / 2, tooltipRegion.y, lines, logicalWidth, logicalHeight);
  }
}

// ---------------------------------------------------------------------------
// Main-menu "trophy trail": every distinct enemy type the player has ever
// defeated (the same defeatedEnemyKeys set that used to also gate
// Sandbox's spawn palette, before that lock was removed), walking a loop
// along Deep Forest's real path, behind the menu
// buttons — pure ambient decoration, not clickable, no gameplay effect.
// Always Deep Forest specifically (not "whatever map was last played") so
// the backdrop reads as a stable "forest" regardless of where the player's
// last session happened to end.
// ---------------------------------------------------------------------------

// null means "needs rebuilding" — built lazily the next time the menu is
// shown (see renderMenuBackdrop) rather than on every recordDefeatedEnemy
// call, and invalidated (set back to null) there whenever the defeated set
// actually grows.
let menuTrophyEnemies = null;

// A defeated key could be from either map's roster — looked up against
// both (boss keys are already terrain-prefixed, so only one ever matches)
// rather than assuming it came from whichever map is currently active.
// Returns null for a stale/unrecognized key (e.g. one saved under an
// older version of a roster) so the trail just skips it, rather than
// crashing on a lookup that comes up empty.
function resolveDefeatedEnemyVisual(key) {
  for (const terrain of Object.keys(MAP_ROSTERS)) {
    const roster = MAP_ROSTERS[terrain];
    const bossPrefix = `${terrain}-boss-tier-`;
    if (key.startsWith(bossPrefix)) {
      const boss = roster.bossTypes[Number(key.slice(bossPrefix.length))];
      if (boss) return { color: boss.color, radius: boss.radius, isBoss: true };
    } else if (roster.enemyTypes[key]) {
      const type = roster.enemyTypes[key];
      return { color: type.color, radius: type.radius, isBoss: false };
    }
  }
  return null;
}

// Places a point `t` (0..1) of the way along a waypoint path by arc
// length, returning both the point and the waypoint index just behind it
// — used to spread trophies out along the path instead of bunching them
// all at the start.
function getPointAtPathFraction(waypoints, t) {
  const segmentLengths = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const length = Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].y - waypoints[i].y);
    segmentLengths.push(length);
    total += length;
  }

  let target = t * total;
  for (let i = 0; i < segmentLengths.length; i += 1) {
    if (target <= segmentLengths[i] || i === segmentLengths.length - 1) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      const frac = segmentLengths[i] === 0 ? 0 : Math.min(1, target / segmentLengths[i]);
      return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac, waypointIndex: i };
    }
    target -= segmentLengths[i];
  }
  return { x: waypoints[0].x, y: waypoints[0].y, waypointIndex: 0 };
}

function buildMenuTrophyEnemies() {
  const keys = [...defeatedEnemyKeys];
  const waypoints = MAP_TYPES.deepForest.paths[0]; // the menu backdrop is always Deep Forest's one path

  menuTrophyEnemies = keys
    .map((key, i) => {
      const visual = resolveDefeatedEnemyVisual(key);
      if (!visual) return null;
      const start = getPointAtPathFraction(waypoints, i / keys.length);
      return {
        enemyKey: key,
        color: visual.color,
        radius: visual.radius,
        isBoss: visual.isBoss,
        x: start.x,
        y: start.y,
        waypointIndex: start.waypointIndex,
        heading: 0,
        speed: BASE_SPEED * 0.45, // a relaxed amble, not combat pace
      };
    })
    .filter(Boolean);
}

// Walks each trophy forward along Deep Forest's path, looping back to the
// start instead of despawning at the end — "walking... on a loop," purely
// cosmetic. Driven by real elapsed time from loop() (see its own call
// site), not the fixed-step accumulator update() uses, since nothing here
// needs deterministic simulation.
function updateMenuTrophyEnemies(deltaSeconds) {
  const waypoints = MAP_TYPES.deepForest.paths[0];
  menuTrophyEnemies.forEach((enemy) => {
    let remaining = enemy.speed * deltaSeconds;
    while (remaining > 0) {
      const target = waypoints[enemy.waypointIndex + 1];
      if (!target) {
        enemy.waypointIndex = 0;
        enemy.x = waypoints[0].x;
        enemy.y = waypoints[0].y;
        break;
      }
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
}

// Deep Forest's real terrain/path/decor rendering, scaled to cover the
// whole menu canvas (not just the WORLD_WIDTH x WORLD_HEIGHT corner a 1:1
// draw would leave), with the trophy trail walking it and a darkening
// overlay on top so the menu buttons/text on top of this stay clearly
// readable regardless of how busy the forest scene underneath gets.
function renderMenuBackdrop(ctx) {
  const map = MAP_TYPES.deepForest;
  const theme = TERRAIN_THEMES.forest;
  const scale = Math.max(logicalWidth / MAP_WORLD_WIDTH, logicalHeight / MAP_WORLD_HEIGHT);
  const offsetX = (logicalWidth - MAP_WORLD_WIDTH * scale) / 2;
  const offsetY = (logicalHeight - MAP_WORLD_HEIGHT * scale) / 2;

  if (!menuTrophyEnemies) buildMenuTrophyEnemies();

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, MAP_WORLD_WIDTH, MAP_WORLD_HEIGHT);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = map.pathColors.outline;
  ctx.lineWidth = map.pathWidth + 10;
  strokeMapPath(ctx, map.paths[0]); // Deep Forest only ever has the one path
  ctx.strokeStyle = map.pathColors.fill;
  ctx.lineWidth = map.pathWidth;
  strokeMapPath(ctx, map.paths[0]);
  theme.renderDecor(ctx, map.decor);

  menuTrophyEnemies.forEach((enemy) => {
    const facingOffset = enemy.isBoss
      ? (BOSS_FACING_OFFSET[enemy.enemyKey] ?? 0)
      : (ENEMY_FACING_OFFSET[enemy.enemyKey] ?? 0);
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.heading + facingOffset);
    ctx.translate(-enemy.x, -enemy.y);
    drawEnemyShape(ctx, enemy);
    ctx.restore();
  });

  ctx.restore();

  ctx.fillStyle = 'rgba(8, 10, 14, 0.6)';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);
}

// Top-level menu. Used to also offer a Map Editor option here — removed
// per direct request, along with its whole UI/input flow and the JSON
// export/import + localStorage custom-map persistence that went with it
// (see git history for that code). Deep Forest/Marshland and the
// generalized MAP_TYPES/per-map-roster architecture underneath this screen
// are untouched; only the ability to author/import a custom map is gone.
// Kept as its own screen (rather than collapsing straight into map-select
// now that it's down to one button) since nothing asked for that flow
// change — just the removal.
function renderMenu(ctx) {
  uiBeginFrame();
  renderMenuBackdrop(ctx);
  drawMenuTitle(ctx, 'Bug Tower Defense', 'Choose how to begin', true);

  const buttonWidth = Math.min(420, logicalWidth - 40);
  const buttonHeight = 72;
  const gap = 16;
  const startY = 140;
  const x = logicalWidth / 2 - buttonWidth / 2;

  [
    { id: 'start:play', label: 'Play', description: 'Pick a map, then a mode, and start defending.' },
  ].forEach((entry, i) => {
    const y = startY + i * (buttonHeight + gap);
    const hovered = hoverRegion && hoverRegion.id === entry.id;

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
    ctx.fillText(entry.label, x + 18, y + 12);

    ctx.font = '12px sans-serif';
    const lines = uiWrapText(ctx, entry.description, buttonWidth - 36);
    uiDrawTextLines(ctx, lines, x + 18, y + 36, 15, '#aaa', '12px sans-serif');

    uiRegisterRegion(entry.id, x, y, buttonWidth, buttonHeight, {});
  });

  drawMenuTooltip(ctx);
}

// Direct follow-up request: "make the map-select screen scrollable...
// with much bigger map preview images... actually render that map's real
// terrain and detail... basically a screenshot-quality look," replacing
// the old small-tile grid above. One large card at a time (arrow buttons
// step through the list, wrapping at either end) rather than a scrolling
// grid — "use your judgment on exact interaction" — since a single big
// preview is what actually makes "much bigger" possible at all on a
// normal-size screen; a grid of equally-bigger tiles wouldn't fit. The
// preview itself is renderMapPreview() (map.js): the real map-drawing
// code (paths, ground, full decor) at a larger size, not hand-drawn
// preview art — the same "built from real output" rule this game's other
// art (tool thumbnails, Concept Lab mosaic on the portfolio site) already
// follows.
const MAP_PREVIEW_WIDTH = 580;
const MAP_PREVIEW_HEIGHT = Math.round((MAP_PREVIEW_WIDTH * MAP_WORLD_HEIGHT) / MAP_WORLD_WIDTH); // same 3:2 world aspect ratio, so nothing looks stretched
const MAP_NAV_BUTTON_SIZE = 48;
const MAP_NAV_GAP = 20;

// Which map the carousel is currently showing — independent of
// selectedMap (only set once the big preview itself is actually clicked).
// Persists across a round trip through mode-select-and-back, same as
// gameSpeed/autoContinue already do, rather than resetting to 0 every
// time this screen is re-entered.
let mapCarouselIndex = 0;

function renderMapSelect(ctx) {
  uiBeginFrame();
  drawMenuTitle(ctx, 'Choose a Map', 'Browse with the arrows, click the map to continue');

  const maps = listAllMaps();
  // Clamped (not just wrapped) defensively in case the list ever shrinks
  // out from under a stale index — ((n % len) + len) % len always lands
  // in [0, len) for any integer n, positive or negative.
  mapCarouselIndex = ((mapCarouselIndex % maps.length) + maps.length) % maps.length;
  const map = maps[mapCarouselIndex];

  const cardX = logicalWidth / 2 - MAP_PREVIEW_WIDTH / 2;
  const cardY = 120;
  const cardRegionId = `mapselect:${map.id}`;
  const cardHovered = hoverRegion && hoverRegion.id === cardRegionId;
  const selected = selectedMap && selectedMap.id === map.id;

  uiRoundRect(ctx, cardX, cardY, MAP_PREVIEW_WIDTH, MAP_PREVIEW_HEIGHT, 10);
  ctx.fillStyle = '#10131a';
  ctx.fill();
  ctx.strokeStyle = selected ? '#8bc34a' : cardHovered ? '#5a8a3e' : '#3a4050';
  ctx.lineWidth = selected ? 3 : 1;
  ctx.stroke();

  renderMapPreview(ctx, map, cardX, cardY, MAP_PREVIEW_WIDTH, MAP_PREVIEW_HEIGHT, animationTime);
  uiRegisterRegion(cardRegionId, cardX, cardY, MAP_PREVIEW_WIDTH, MAP_PREVIEW_HEIGHT, { map });

  const navY = cardY + MAP_PREVIEW_HEIGHT / 2 - MAP_NAV_BUTTON_SIZE / 2;
  const prevX = cardX - MAP_NAV_GAP - MAP_NAV_BUTTON_SIZE;
  const nextX = cardX + MAP_PREVIEW_WIDTH + MAP_NAV_GAP;
  uiDrawButton(ctx, {
    x: prevX,
    y: navY,
    w: MAP_NAV_BUTTON_SIZE,
    h: MAP_NAV_BUTTON_SIZE,
    label: '‹', // ‹
    hovered: Boolean(hoverRegion) && hoverRegion.id === 'mapselect:prev',
  });
  uiRegisterRegion('mapselect:prev', prevX, navY, MAP_NAV_BUTTON_SIZE, MAP_NAV_BUTTON_SIZE, {});
  uiDrawButton(ctx, {
    x: nextX,
    y: navY,
    w: MAP_NAV_BUTTON_SIZE,
    h: MAP_NAV_BUTTON_SIZE,
    label: '›', // ›
    hovered: Boolean(hoverRegion) && hoverRegion.id === 'mapselect:next',
  });
  uiRegisterRegion('mapselect:next', nextX, navY, MAP_NAV_BUTTON_SIZE, MAP_NAV_BUTTON_SIZE, {});

  const labelY = cardY + MAP_PREVIEW_HEIGHT + 14;
  ctx.fillStyle = '#f0f0f0';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(map.name, logicalWidth / 2, labelY);
  ctx.fillStyle = '#888';
  ctx.font = '12px sans-serif';
  ctx.fillText(
    `${mapCarouselIndex + 1} of ${maps.length}${map.builtin ? '' : ' — Custom'}`,
    logicalWidth / 2,
    labelY + 22
  );

  const backWidth = 120;
  const backY = labelY + 50;
  uiDrawButton(ctx, {
    x: logicalWidth / 2 - backWidth / 2,
    y: backY,
    w: backWidth,
    h: 32,
    label: '← Back',
    hovered: Boolean(hoverRegion) && hoverRegion.id === 'mapselect:back',
  });
  uiRegisterRegion('mapselect:back', logicalWidth / 2 - backWidth / 2, backY, backWidth, 32, {});

  drawMenuTooltip(ctx);
}

// Mode select: the original mode-list screen, now shown for whichever map
// was just picked (named in the subtitle) instead of being the first thing
// the player sees.
function renderModeSelect(ctx) {
  uiBeginFrame();
  drawMenuTitle(ctx, 'Choose a Mode', selectedMap ? `Playing: ${selectedMap.name}` : 'Choose a mode to begin');

  const buttonWidth = Math.min(420, logicalWidth - 40);
  const minButtonHeight = 72;
  const gap = 16;
  const x = logicalWidth / 2 - buttonWidth / 2;
  let y = 140;

  MENU_MODE_ORDER.forEach((key) => {
    const mode = GAME_MODES[key];
    const regionId = `mode:${key}`;
    const hovered = hoverRegion && hoverRegion.id === regionId;

    // Each card's own height grows to fit its description instead of a
    // fixed 72px for every card — a fixed height clipped Sandbox's longer
    // description past the card's bottom edge (a real bug report: visibly
    // cut off text, unlike Medium/Horde Mode's shorter ones that happened
    // to fit). Measuring before drawing means this scales automatically
    // for any future mode with an even longer description too.
    ctx.font = '12px sans-serif';
    const lines = uiWrapText(ctx, mode.description, buttonWidth - 36);
    const buttonHeight = Math.max(minButtonHeight, 36 + lines.length * 15 + 12);

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
    uiDrawTextLines(ctx, lines, x + 18, y + 36, 15, '#aaa', '12px sans-serif');

    uiRegisterRegion(regionId, x, y, buttonWidth, buttonHeight, { modeKey: key });
    y += buttonHeight + gap;
  });

  const backWidth = 120;
  const backY = y + 6;
  uiDrawButton(ctx, {
    x: logicalWidth / 2 - backWidth / 2,
    y: backY,
    w: backWidth,
    h: 32,
    label: '← Maps',
    hovered: Boolean(hoverRegion) && hoverRegion.id === 'mode:back',
  });
  uiRegisterRegion('mode:back', logicalWidth / 2 - backWidth / 2, backY, backWidth, 32, {});

  drawMenuTooltip(ctx);
}

// Game Over — gameState === 'gameOver', reached when playerHealth hits 0
// (see triggerGameOver() in update()). Stops the simulation simply by
// being a gameState other than 'playing' (loop()'s accumulator only ticks
// update() during 'playing', so nothing else needs to explicitly "pause").
function renderGameOver(ctx) {
  uiBeginFrame();
  drawMenuTitle(ctx, 'Game Over', `${gameOverStats.modeName} — reached round ${gameOverStats.round}`);

  const buttonWidth = Math.min(300, logicalWidth - 40);
  const y = 220;
  const x = logicalWidth / 2 - buttonWidth / 2;

  uiDrawButton(ctx, {
    x,
    y,
    w: buttonWidth,
    h: 36,
    label: '← Back to Menu',
    state: 'accent',
    hovered: Boolean(hoverRegion) && hoverRegion.id === 'gameover:menu',
  });
  uiRegisterRegion('gameover:menu', x, y, buttonWidth, 36, {});

  drawMenuTooltip(ctx);
}

// The map editor (gameState === 'editor': draw/save/export/import a
// custom map) used to live here — removed per direct request, along with
// its localStorage persistence and the custom-map branch of map-select's
// listAllMaps(). Deep Forest/Marshland and the menu/mode-select screens
// above are untouched.

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
    // Shows which map is being played alongside the mode — the mode name
    // alone was already here; the map name was only ever visible back on
    // the map-select screen before this, with nothing in the actual
    // in-game HUD naming it.
    label: `← Menu (${getActiveMap().name} · ${currentMode ? currentMode.name : ''})`,
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
        logicalWidth,
        logicalHeight
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
    return [item.name, `$${getShopItemCost(item)} — place on open ground`];
  }

  if (region.id === 'prodigy-upgrade') {
    const option = region.data;
    return [
      `Become ${option.name}`,
      `$${option.cost} — replaces this tower in place with its ultimate form.`,
    ];
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

  if (region.id.startsWith('speed:')) return [`${region.data.speed}x simulation speed.`];

  if (region.id === 'auto-continue-toggle') {
    return [
      autoContinue ? 'Auto-Continue is on.' : 'Auto-Continue is off.',
      'When on, the next round starts itself as soon as the current wave fully clears.',
    ];
  }

  if (region.id === 'sell-tower') {
    return [`Sell this tower for $${region.data.refund}`, `(${Math.round(SELL_REFUND_RATE * 100)}% of what was spent on it)`];
  }

  if (region.id === 'menu-return') return ['Back to the main menu.'];

  if (region.id.startsWith('spawn:')) {
    return [region.data.name, 'Click to spawn one.'];
  }

  if (region.id.startsWith('mode:')) {
    if (region.id === 'mode:back') return ['Back to map selection.'];
    const mode = GAME_MODES[region.data.modeKey];
    return [mode.name, ...uiWrapText(ctx, mode.description, 260)];
  }

  if (region.id.startsWith('mapselect:')) {
    if (region.id === 'mapselect:back') return ['Back to the main menu.'];
    if (region.id === 'mapselect:prev') return ['Previous map.'];
    if (region.id === 'mapselect:next') return ['Next map.'];
    const map = region.data.map;
    return [map.name, map.builtin ? 'Built-in map' : 'Custom map'];
  }

  if (region.id === 'start:play') return ['Pick a map, then a mode.'];
  if (region.id === 'gameover:menu') return ['Back to the main menu.'];

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

  if (region.id === 'prodigy-upgrade') {
    if (!selectedTower) return;
    // Re-validated here, not just trusted from the button's own render —
    // the option is live (another tower could grab the last singleton-cap
    // slot, or this exact tower could already have stopped qualifying)
    // between the frame that drew the button and the click landing on it.
    const option = getProdigyOption(selectedTower);
    if (!option || !canAfford(option.cost)) return;
    if (!towers.includes(selectedTower)) return;

    // Direct request: becoming a Prodigy destroys every OTHER tower of the
    // same base type still on the field (e.g. every other Sunflower, the
    // moment this one becomes The Sunlit Conductor) — a real tradeoff for
    // the upgrade's power, not a free lateral move. Same no-refund,
    // confirm-first treatment as Mushroom's Neurological upgrade above
    // (same destroyTowers() helper and visual effect too), and skipped
    // entirely when there's nothing else of that type to lose.
    const sameTypeVictims = getOtherTowersOfSameType(selectedTower);
    if (sameTypeVictims.length > 0) {
      const baseName = TOWER_TYPES[selectedTower.type].name;
      const confirmed = confirm(
        `Becoming ${option.name} will destroy ${sameTypeVictims.length} other ${baseName}(s) on the field. No refund. Continue?`
      );
      if (!confirmed) return;
    }

    // Transforms the tower in place: a brand-new Prodigy tower (clean
    // defaults for every upgrade-effect field — none of the old tower's
    // path effects carry over, it's a genuinely different tower, not a
    // 4th tier bolted onto the old one) at the exact same spot, with
    // everything ever spent on the old tower plus this upgrade's own cost
    // folded into its moneySpent — so selling it afterward refunds a fair
    // share of the whole investment, not just this last step.
    const prodigy = createTower(option.typeKey);
    prodigy.x = selectedTower.x;
    prodigy.y = selectedTower.y;
    prodigy.moneySpent = selectedTower.moneySpent + option.cost;

    if (sameTypeVictims.length > 0) destroyTowers(sameTypeVictims);
    // destroyTowers() (when it ran) just reassigned `towers` to a filtered
    // copy — selectedTower itself is never in that filter, so it's still
    // in the new array, just possibly at a different index than before.
    towers[towers.indexOf(selectedTower)] = prodigy;
    selectedTower = prodigy;
    money -= option.cost;
    return;
  }

  if (region.id.startsWith('upgrade:')) {
    const { pathIndex, upgrade, isNextInLine } = region.data;
    if (!isNextInLine || !selectedTower) return;
    if (!canAfford(upgrade.cost)) return;

    // Neurological's one-time tower-consumption (consumeTowersInRange,
    // below) needs explicit confirmation before committing — there's no
    // refund or undo once it's done, so it must never happen silently.
    // Skipped when nothing is actually in range to consume, so an empty
    // board isn't bothered with a pointless prompt.
    if (upgrade.effects.consumeTowersInRange) {
      const victims = getTowersInRange(selectedTower);
      if (victims.length > 0) {
        const confirmed = confirm(
          `This will instantly destroy ${victims.length} other tower(s) in range. No refund. Continue?`
        );
        if (!confirmed) return;
      }
    }

    if (purchaseUpgrade(selectedTower, pathIndex)) {
      money -= upgrade.cost;
      selectedTower.moneySpent += upgrade.cost;
      if (upgrade.effects.consumeTowersInRange) consumeTowersInRange(selectedTower);
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
    const entry = getSpawnEntryForEnemyKey(region.data.key);
    if (entry) spawnSingleEnemy(entry);
    return;
  }

  if (region.id === 'mode:back') {
    gameState = 'mapSelect';
    return;
  }
  if (region.id.startsWith('mode:')) {
    startGame(region.data.modeKey);
    return;
  }

  if (region.id === 'start:play') {
    gameState = 'mapSelect';
    return;
  }

  if (region.id === 'gameover:menu') {
    gameState = 'menu';
    return;
  }

  if (region.id === 'mapselect:back') {
    gameState = 'menu';
    return;
  }
  if (region.id === 'mapselect:prev') {
    mapCarouselIndex -= 1; // wraps/clamps back into range at the top of renderMapSelect()
    return;
  }
  if (region.id === 'mapselect:next') {
    mapCarouselIndex += 1;
    return;
  }
  if (region.id.startsWith('mapselect:')) {
    selectedMap = region.data.map;
    gameState = 'modeSelect';
    return;
  }

  if (region.id.startsWith('speed:')) {
    gameSpeed = region.data.speed;
  }
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (logicalWidth / rect.width),
    y: (event.clientY - rect.top) * (logicalHeight / rect.height),
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

// World-area tap handling (placement/tower-select) — shared by the
// mouse click handler and the touch "quick tap" path below. Only called for
// points inside the game world; panel taps go through activateRegion()
// instead (see the click/touch handlers).
function handleCanvasTap(x, y) {
  if (selectedShopItem) {
    const cost = getShopItemCost(selectedShopItem);
    if (!canAfford(cost)) return;
    if (isPointOnPath(x, y, PLACEMENT_PATH_MARGIN)) return;
    if (isTowerPlacementBlocked(x, y, selectedShopItem.typeKey)) return;

    const tower = createTower(selectedShopItem.typeKey);
    tower.x = x;
    tower.y = y;
    tower.moneySpent = cost; // tracked for the Sell button's refund — see getSellRefund()
    towers.push(tower);
    money -= cost;

    selectedTower = tower; // jump straight to managing the tower just bought
    return;
  }

  // Not placing — select/switch/deselect a tower.
  const clicked = findTowerAt(x, y);
  selectedTower = clicked === selectedTower ? null : clicked;
}

canvas.addEventListener('mousemove', (event) => {
  const point = getCanvasPoint(event);
  mouseX = point.x;
  mouseY = point.y;

  // On the full-screen menu states, the whole canvas is UI — there's no
  // "world" to exclude.
  hoverRegion = MENU_STATES.has(gameState) || !isWorldPoint(point.x, point.y) ? uiHitTest(point.x, point.y) : null;
});

canvas.addEventListener('mouseleave', () => {
  mouseX = null;
  mouseY = null;
  hoverRegion = null;
});

canvas.addEventListener('click', (event) => {
  const { x, y } = getCanvasPoint(event);

  if (MENU_STATES.has(gameState)) {
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

// Mouse wheel over the map-select carousel steps through the list one map
// at a time — desktop convenience alongside the arrow buttons (which do
// the same thing and work everywhere, including touch). Deliberately
// listens anywhere on the mapSelect screen, not just while hovering the
// card itself, since there's nothing else on that screen a wheel could
// plausibly mean. { passive: false } + preventDefault so the browser
// doesn't also try to scroll/zoom the page on a wheel/trackpad gesture.
canvas.addEventListener(
  'wheel',
  (event) => {
    if (gameState !== 'mapSelect') return;
    event.preventDefault();
    mapCarouselIndex += event.deltaY > 0 ? 1 : -1;
  },
  { passive: false }
);

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

    if (MENU_STATES.has(gameState) || !isWorldPoint(x, y)) {
      const region = uiHitTest(x, y);
      if (region) {
        touchHold = { region, startX: x, startY: y, startTime: performance.now(), tooltipShown: false };
        return;
      }
      if (MENU_STATES.has(gameState)) return; // full-screen menus have no world fallback to tap into
    }

    handleCanvasTap(x, y);
  },
  { passive: false }
);

canvas.addEventListener(
  'touchmove',
  (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    const { x, y } = getCanvasPoint(touch);

    if (!touchHold) return;
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
// The 4 selectable stops for the speed control in renderWaveSection.
const SPEED_OPTIONS = [1, 2, 3, 4];
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

// Horde Mode: no "wave" to clear and no Next Round button (see
// renderWaveSection) — enemies are meant to never stop coming. Counts down
// in update() below; when it hits zero, the batch just started has
// finished *spawning* (not necessarily dying), so the next one begins
// immediately — see spawnWaveAdditive()'s own doc comment in enemies.js for
// how the handoff stays seamless instead of bursty.
let hordeSpawnTimer = 0;

// Reuses generateWave()'s existing round-indexed count/health curve as the
// baseline and doubles the regular (non-boss) enemy count on top of it —
// "2x more enemies" read as the normal wave-size curve, not a doubled
// boss (a boss round still spawns exactly one boss; doubling a unique boss
// didn't seem like the intent). `round` is reused as Horde's own ongoing
// counter — same variable, same "Round: N" display in the Wave panel the
// other modes already use — incremented once per batch below, even though
// there's no discrete "round boundary" to wait at in Horde Mode.
const HORDE_COUNT_MULTIPLIER = 2;

function startHordeBatch() {
  const scaled = applyModeToWaveComposition(generateWave(round)).map((entry) => ({
    ...entry,
    count: entry.isBoss ? entry.count : entry.count * HORDE_COUNT_MULTIPLIER,
  }));
  currentWave = scaled; // the Wave panel's composition readout stays accurate
  hordeSpawnTimer = spawnWaveAdditive(scaled);
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
  // it's up, same as the game being paused. The menu's own trophy-trail
  // animation is purely cosmetic and runs on real elapsed time instead,
  // independent of this accumulator.
  if (gameState === 'playing') {
    accumulator += frameTime * gameSpeed;
    while (accumulator >= FIXED_DT) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
    }
  } else if (gameState === 'menu' && menuTrophyEnemies) {
    updateMenuTrophyEnemies(frameTime);
  }

  render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
