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

function updateTowerAttack(tower, x, y, deltaSeconds) {
  tower.target = findNearestEnemyInRange(x, y, tower.stats.range);

  tower.attackCooldown = Math.max(0, tower.attackCooldown - deltaSeconds);
  if (tower.target && tower.attackCooldown <= 0) {
    damageEnemy(tower.target, tower.stats.damage);
    if (tower.burn) applyBurn(tower.target, tower.burn);
    tower.attackCooldown = tower.stats.attackInterval;
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
  const killedEnemies = updateEnemies(deltaSeconds);
  if (killedEnemies.length > 0) {
    money += killedEnemies.reduce((sum, enemy) => sum + enemy.bounty, 0);
    renderShop();
  }

  towers.forEach((tower) => updateTowerAttack(tower, tower.x, tower.y, deltaSeconds));
}

function drawTowerWithRay(tower, x, y) {
  if (tower.attackType === 'ray' && tower.target) {
    ctx.strokeStyle = tower.burn ? '#ff6600' : '#fff59d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tower.target.x, tower.target.y);
    ctx.stroke();
  } else if (tower.attackType === 'fireball' && tower.target) {
    // Kept simple like the ray attack, no real projectile physics: the
    // ember's drawn position is just interpolated along the tower->target
    // line by how far through the current attack cooldown we are, purely
    // for visual flavor — damage itself still applies instantly on cooldown.
    const progress = 1 - tower.attackCooldown / tower.stats.attackInterval;
    const fx = x + (tower.target.x - x) * progress;
    const fy = y + (tower.target.y - y) * progress;
    ctx.fillStyle = '#ff5722';
    ctx.beginPath();
    ctx.arc(fx, fy, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  renderTower(ctx, tower, x, y);

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

  towers.forEach((tower) => renderTowerGroundEffects(ctx, tower));
  towers.forEach((tower) => drawTowerWithRay(tower, tower.x, tower.y));

  renderEnemies(ctx);

  if (selectedShopItem && mouseX !== null) {
    const buildable = money >= selectedShopItem.cost && !isPointOnPath(mouseX, mouseY, PLACEMENT_PATH_MARGIN);
    ctx.fillStyle = buildable ? 'rgba(76, 175, 80, 0.4)' : 'rgba(229, 57, 53, 0.4)';
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 20, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderPanel() {
  const statsEl = document.getElementById('stats');

  if (!selectedTower) {
    statsEl.innerHTML = 'Buy a Sunflower from the Shop, or click one already on the map, to manage its upgrades here.';
    ['0', '1'].forEach((pathIndex) => {
      const btn = document.querySelector(`button[data-path="${pathIndex}"]`);
      btn.disabled = true;
      btn.textContent = 'No tower selected';
    });
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

  for (let pathIndex = 0; pathIndex < 3; pathIndex += 1) {
    const btn = document.querySelector(`button[data-path="${pathIndex}"]`);
    const type = TOWER_TYPES[selectedTower.type];
    const pathDefined = Boolean(type.upgradePaths[pathIndex]);
    if (!pathDefined) continue; // leave the "Not yet designed" placeholder as-is

    const upgrade = getAvailableUpgrade(selectedTower, pathIndex);
    if (upgrade) {
      btn.disabled = money < upgrade.cost;
      btn.textContent = `${upgrade.name} ($${upgrade.cost})`;
    } else {
      btn.disabled = true;
      btn.textContent =
        selectedTower.chosenPath !== null && selectedTower.chosenPath !== pathIndex
          ? 'Locked out'
          : 'Maxed out';
    }
  }
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

  // Not placing — click selects/switches/deselects a tower instead.
  const clicked = findTowerAt(x, y);
  selectedTower = clicked === selectedTower ? null : clicked;
  renderPanel();
});

function renderWaveInfo() {
  const waveInfoEl = document.getElementById('wave-info');
  const lines = currentWave.map((entry) =>
    entry.isBoss
      ? `BOSS: ${entry.name} (${entry.health} HP, ${entry.speedMultiplier}x speed)`
      : `${entry.name} x${entry.count} (${entry.health} HP each, ${entry.speedMultiplier}x speed)`
  );
  waveInfoEl.innerHTML = `Round: ${round}<br>${lines.join('<br>')}`;
}

document.querySelectorAll('button[data-path]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!selectedTower) return;

    const pathIndex = Number(btn.dataset.path);
    const upgrade = getAvailableUpgrade(selectedTower, pathIndex);
    if (!upgrade || money < upgrade.cost) return; // can't afford it — same rule the Shop follows

    if (purchaseUpgrade(selectedTower, pathIndex)) {
      money -= upgrade.cost;
      renderPanel();
      renderShop();
    }
  });
});

document.getElementById('next-round-btn').addEventListener('click', () => {
  round += 1;
  currentWave = generateWave(round);
  spawnWave(currentWave);
  renderWaveInfo();
});

renderPanel();
renderWaveInfo();
renderShop();

let lastTime = 0;

function loop(timestamp) {
  const deltaSeconds = lastTime ? (timestamp - lastTime) / 1000 : 0;
  lastTime = timestamp;

  update(deltaSeconds);
  render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
