const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// No tower starts on the map — the player buys their first one from the
// Shop. Whichever Sunflower they place first becomes the one tracked by
// the Upgrades panel below (there's no per-tower selection UI yet, so this
// is a simplification: only that first Sunflower is upgradeable for now).
let sunflower = null;

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

let placedTowers = [];
let selectedShopItem = null;
let mouseX = null;
let mouseY = null;

function updateTowerAttack(tower, x, y, deltaSeconds) {
  tower.target = findNearestEnemyInRange(x, y, tower.stats.range);

  tower.attackCooldown = Math.max(0, tower.attackCooldown - deltaSeconds);
  if (!tower.target || tower.attackCooldown > 0) return;

  damageEnemy(tower.target, tower.stats.damage);
  if (tower.burn) applyBurn(tower.target, tower.burn);
  tower.attackCooldown = tower.stats.attackInterval;
}

function update(deltaSeconds) {
  const killedEnemies = updateEnemies(deltaSeconds);
  if (killedEnemies.length > 0) {
    money += killedEnemies.reduce((sum, enemy) => sum + enemy.bounty, 0);
    renderShop();
  }

  if (sunflower) updateTowerAttack(sunflower, sunflower.x, sunflower.y, deltaSeconds);
  placedTowers.forEach((tower) => updateTowerAttack(tower, tower.x, tower.y, deltaSeconds));
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

  renderTower(ctx, tower, x, y);
}

function render() {
  renderMap(ctx, canvas);

  if (sunflower) drawTowerWithRay(sunflower, sunflower.x, sunflower.y);
  placedTowers.forEach((tower) => drawTowerWithRay(tower, tower.x, tower.y));

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

  if (!sunflower) {
    statsEl.innerHTML = 'Buy a Sunflower from the Shop to manage its upgrades here.';
    const path0Btn = document.querySelector('button[data-path="0"]');
    path0Btn.disabled = true;
    path0Btn.textContent = 'Buy a Sunflower first';
    return;
  }

  statsEl.innerHTML = `
    Damage: ${sunflower.stats.damage.toFixed(1)}<br>
    Size: ${sunflower.stats.size.toFixed(1)}<br>
    Attack: ${sunflower.attackType}<br>
    Burn: ${sunflower.burn ? `${sunflower.burn.damagePerSecond}/s for ${sunflower.burn.duration}s` : 'none'}
  `;

  for (let pathIndex = 0; pathIndex < 3; pathIndex += 1) {
    const btn = document.querySelector(`button[data-path="${pathIndex}"]`);
    const type = TOWER_TYPES[sunflower.type];
    const pathDefined = Boolean(type.upgradePaths[pathIndex]);
    if (!pathDefined) continue; // leave the "Not yet designed" placeholder as-is

    const upgrade = getAvailableUpgrade(sunflower, pathIndex);
    if (upgrade) {
      btn.disabled = false;
      btn.textContent = `${upgrade.name} ($${upgrade.cost})`;
    } else {
      btn.disabled = true;
      btn.textContent =
        sunflower.chosenPath !== null && sunflower.chosenPath !== pathIndex
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
  if (!selectedShopItem) return;

  const { x, y } = getCanvasPoint(event);
  if (money < selectedShopItem.cost) return;
  if (isPointOnPath(x, y, PLACEMENT_PATH_MARGIN)) return;

  const tower = createTower(selectedShopItem.typeKey);
  tower.x = x;
  tower.y = y;

  if (!sunflower && selectedShopItem.typeKey === 'sunflower') {
    sunflower = tower;
    renderPanel();
  } else {
    placedTowers.push(tower);
  }

  money -= selectedShopItem.cost;
  renderShop();
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
    const pathIndex = Number(btn.dataset.path);
    if (purchaseUpgrade(sunflower, pathIndex)) renderPanel();
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
