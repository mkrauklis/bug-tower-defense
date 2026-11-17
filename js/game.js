const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Every placed tower lives here, including the first one bought — there's
// no special "demo" tower anymore. The Upgrades panel always follows
// `selectedTower`, which the player sets by clicking a tower on the map.
let towers = [];
let selectedTower = null;

let round = 1;
let currentWave = generateWave(round);
spawnWave(currentWave);

// Starting money — $50.
let money = 50;

// Buyable towers. Scaffolded as a list so more towers can be added later;
// only the Sunflower is a real purchasable option for now.
const SHOP_ITEMS = [{ typeKey: 'sunflower', name: 'Sunflower', cost: 25 }];

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
    shape: tower.attackType === 'fireball' ? 'fireball' : 'petal',
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

function update(deltaSeconds) {
  animationTime += deltaSeconds;
  updateWildlife(wildlife, deltaSeconds);

  damageBoostRemaining = Math.max(0, damageBoostRemaining - deltaSeconds);

  const killedEnemies = updateEnemies(deltaSeconds);
  if (killedEnemies.length > 0) {
    money += killedEnemies.reduce((sum, enemy) => sum + enemy.bounty, 0);
    // Cheap refreshes only — a kill can happen many times a second during a
    // big wave, and renderShop() tears down and rebuilds the whole shop
    // list (new elements, new listeners) every time it's called. Doing
    // that on every single kill was a real perf problem under load; these
    // two just update existing elements' text/disabled state instead.
    updateMoneyDisplay();
    renderPanel();
  }

  towers.forEach((tower) => updateTowerAttack(tower, tower.x, tower.y, deltaSeconds));
  updateProjectiles(deltaSeconds);
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

  if (tower === selectedTower) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(tower.stats.size, MIN_SELECT_RADIUS) + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function render() {
  renderMap(ctx, canvas);
  renderWildlife(ctx, wildlife, animationTime, 'ladybug'); // ground-level, under everything else

  towers.forEach((tower) => renderTowerGroundEffects(ctx, tower));
  towers.forEach((tower) => drawTowerWithRay(tower, tower.x, tower.y));

  renderEnemies(ctx);
  renderProjectiles(ctx);
  renderWildlife(ctx, wildlife, animationTime, 'firefly'); // glowing, drawn on top so it reads over everything
  updateNextRoundButton();
  updateBoostDisplay();

  if (selectedShopItem && mouseX !== null) {
    const buildable = money >= selectedShopItem.cost && !isPointOnPath(mouseX, mouseY, PLACEMENT_PATH_MARGIN);
    ctx.fillStyle = buildable ? 'rgba(76, 175, 80, 0.4)' : 'rgba(229, 57, 53, 0.4)';
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 20, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Solar = yellow, Fire = orange — matches each path's own visual theme on
// the tower itself (glow/flame colors), index-aligned with upgradePaths.
const PATH_COLORS = ['#ffd54f', '#ff7043'];

function renderPanel() {
  const statsEl = document.getElementById('stats');

  if (!selectedTower) {
    statsEl.innerHTML =
      'Click a Shop item, then click open ground to place a tower — or click an existing tower to manage it here.';
    renderUpgradePaths();
    return;
  }

  statsEl.innerHTML = `
    Damage: ${selectedTower.stats.damage.toFixed(1)}<br>
    Size: ${selectedTower.stats.size.toFixed(1)}<br>
    Attack interval: ${selectedTower.stats.attackInterval.toFixed(2)}s<br>
    Attack: ${selectedTower.attackType}<br>
    Burn: ${selectedTower.burn ? `${selectedTower.burn.damagePerSecond}/s for ${selectedTower.burn.duration}s` : 'none'}<br>
    Puddle: ${selectedTower.puddle ? `${selectedTower.puddle.damagePerSecond}/s every ${selectedTower.puddle.interval}s` : 'none'}<br>
    Orbit: ${selectedTower.orbit ? `${selectedTower.orbit.count} embers, ${selectedTower.orbit.damagePerSecond}/s each` : 'none'}
  `;

  renderUpgradePaths();
}

// Rebuilds the two (eventually three) upgrade-path columns from scratch —
// each tier shows one of: bought, available (next in line, affordable),
// unaffordable (next in line, can't afford yet), locked (a future tier),
// or path-locked (a different path was already chosen). Rebuilding here
// is cheap (a handful of small elements, not the shop's larger list), and
// only happens on purchase/selection changes, not every frame.
function renderUpgradePaths() {
  const container = document.getElementById('upgrade-paths');
  container.innerHTML = '';

  const type = selectedTower ? TOWER_TYPES[selectedTower.type] : TOWER_TYPES.sunflower;

  type.upgradePaths.forEach((path, pathIndex) => {
    const column = document.createElement('div');
    column.className = 'upgrade-path-column';

    if (!path) {
      column.classList.add('undesigned');
      column.style.setProperty('--path-color', '#666');
      const heading = document.createElement('h4');
      heading.textContent = 'Path 3';
      const note = document.createElement('p');
      note.className = 'path-note';
      note.textContent = 'Not yet designed.';
      column.append(heading, note);
      container.appendChild(column);
      return;
    }

    column.style.setProperty('--path-color', PATH_COLORS[pathIndex]);

    const isLockedOut =
      Boolean(selectedTower) && selectedTower.chosenPath !== null && selectedTower.chosenPath !== pathIndex;
    if (isLockedOut) column.classList.add('locked-out');

    const heading = document.createElement('h4');
    heading.textContent = path.name;
    column.appendChild(heading);

    path.upgrades.forEach((upgrade, tierIndex) => {
      const tierEl = document.createElement('div');

      const bought = Boolean(selectedTower) && selectedTower.chosenPath === pathIndex && tierIndex < selectedTower.upgradesPurchased;
      const isNextInLine =
        Boolean(selectedTower) &&
        !isLockedOut &&
        ((selectedTower.chosenPath === pathIndex && tierIndex === selectedTower.upgradesPurchased) ||
          (selectedTower.chosenPath === null && tierIndex === 0));

      if (bought) {
        tierEl.className = 'tier bought';
      } else if (isLockedOut) {
        tierEl.className = 'tier path-locked';
      } else if (isNextInLine) {
        const affordable = selectedTower && money >= upgrade.cost;
        tierEl.className = `tier ${affordable ? 'available' : 'unaffordable'}`;
      } else {
        tierEl.className = 'tier locked';
      }

      tierEl.innerHTML = `<span class="tier-status"></span><span class="tier-name">${upgrade.name}</span><span class="tier-cost">$${upgrade.cost}</span>`;

      if (isNextInLine) {
        tierEl.addEventListener('click', () => {
          if (money < upgrade.cost) return;
          if (purchaseUpgrade(selectedTower, pathIndex)) {
            money -= upgrade.cost;
            renderPanel();
            renderShop();
          }
        });
      }

      column.appendChild(tierEl);
    });

    container.appendChild(column);
  });
}

// Updates money's display and existing shop buttons' affordability without
// recreating any elements — cheap enough to call on every kill, unlike
// renderShop() itself (see the comment in update()).
function updateMoneyDisplay() {
  document.getElementById('money').textContent = `$${money}`;
  document.querySelectorAll('.shop-item').forEach((btn, i) => {
    const item = SHOP_ITEMS[i];
    if (item) btn.disabled = money < item.cost;
  });
}

function renderShop() {
  document.getElementById('money').textContent = `$${money}`;

  const listEl = document.getElementById('shop-list');
  listEl.innerHTML = '';
  SHOP_ITEMS.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shop-item' + (selectedShopItem === item ? ' selected' : '');
    btn.disabled = money < item.cost;
    btn.textContent = `${item.name} ($${item.cost})`;
    btn.addEventListener('click', () => {
      selectedShopItem = selectedShopItem === item ? null : item;
      renderShop();
    });
    listEl.appendChild(btn);
  });

  canvas.style.cursor = selectedShopItem ? 'crosshair' : 'default';
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
    const hitRadius = Math.max(tower.stats.size, MIN_SELECT_RADIUS);
    const dist = Math.hypot(tower.x - x, tower.y - y);
    if (dist <= hitRadius && dist < closestDist) {
      closest = tower;
      closestDist = dist;
    }
  });

  return closest;
}

// Shared by the mouse click handler and the touch handler below, so tap
// and click behave identically instead of maintaining two copies of this.
function handleCanvasTap(x, y) {
  if (selectedShopItem) {
    if (money < selectedShopItem.cost) return;
    if (isPointOnPath(x, y, PLACEMENT_PATH_MARGIN)) return;

    const tower = createTower(selectedShopItem.typeKey);
    tower.x = x;
    tower.y = y;
    towers.push(tower);
    money -= selectedShopItem.cost;

    selectedTower = tower; // jump straight to managing the tower just bought
    renderPanel();
    renderShop();
    return;
  }

  // Not placing — a ladybug takes priority over tower selection (a
  // one-off, intentional interaction), then falls back to
  // selecting/switching/deselecting a tower.
  const ladybug = findLadybugAt(wildlife, x, y);
  if (ladybug && ladybug.cooldownRemaining <= 0) {
    ladybug.cooldownRemaining = LADYBUG_COOLDOWN;
    damageBoostRemaining = DAMAGE_BOOST_DURATION;
    updateBoostDisplay();
    return;
  }

  const clicked = findTowerAt(x, y);
  selectedTower = clicked === selectedTower ? null : clicked;
  renderPanel();
}

canvas.addEventListener('mousemove', (event) => {
  const point = getCanvasPoint(event);
  mouseX = point.x;
  mouseY = point.y;
});

canvas.addEventListener('mouseleave', () => {
  mouseX = null;
  mouseY = null;
});

canvas.addEventListener('click', (event) => {
  const { x, y } = getCanvasPoint(event);
  handleCanvasTap(x, y);
});

// Touch equivalent of the click handler above — there's no hover/preview
// state on touch (no mousemove equivalent before a tap), so this just acts
// immediately on the tapped spot, same as a click. preventDefault keeps
// the page from scrolling/zooming on this gesture and stops the browser
// from also firing a synthetic "click" for the same tap (which would
// otherwise run handleCanvasTap a second time).
canvas.addEventListener(
  'touchstart',
  (event) => {
    event.preventDefault();
    const touch = event.touches[0];
    if (!touch) return;
    const { x, y } = getCanvasPoint(touch);
    handleCanvasTap(x, y);
  },
  { passive: false }
);

function renderWaveInfo() {
  const waveInfoEl = document.getElementById('wave-info');
  const lines = currentWave.map((entry) =>
    entry.isBoss
      ? `BOSS: ${entry.name} (${entry.health} HP, ${entry.speedMultiplier}x speed)`
      : `${entry.name} x${entry.count} (${entry.health} HP each, ${entry.speedMultiplier}x speed)`
  );
  waveInfoEl.innerHTML = `Round: ${round}<br>${lines.join('<br>')}`;
}

function updateBoostDisplay() {
  const el = document.getElementById('boost-info');
  el.textContent = damageBoostRemaining > 0 ? `Damage Boost: ${damageBoostRemaining.toFixed(1)}s` : '';
}

// Only one wave runs at a time: the Next Round button stays disabled until
// every enemy from the current wave is gone (dead or reached the goal).
function updateNextRoundButton() {
  const btn = document.getElementById('next-round-btn');
  const waveInProgress = activeEnemies.length > 0;
  btn.disabled = waveInProgress;
  btn.textContent = waveInProgress ? 'Wave in progress…' : 'Next Round';
}

document.getElementById('next-round-btn').addEventListener('click', () => {
  if (activeEnemies.length > 0) return; // belt-and-suspenders; the button is disabled too

  round += 1;
  currentWave = generateWave(round);
  spawnWave(currentWave);
  renderWaveInfo();
  updateNextRoundButton();
});

// Scales how much simulated time each real frame adds to the fixed-step
// accumulator below — covers enemy movement, attack cooldowns, every
// DoT/puddle/orbit tick, everything, since they all run through update().
let gameSpeed = 1;

document.getElementById('speed-toggle-btn').addEventListener('click', (event) => {
  gameSpeed = gameSpeed === 1 ? 2 : 1;
  event.target.textContent = `${gameSpeed}x Speed`;
});

document.getElementById('seed-info').textContent = `Seed: ${GAME_SEED}`;

renderPanel();
renderWaveInfo();
renderShop();
updateNextRoundButton();

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

  accumulator += frameTime * gameSpeed;
  while (accumulator >= FIXED_DT) {
    update(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
