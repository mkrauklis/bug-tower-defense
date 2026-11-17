const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const sunflower = createTower('sunflower');

let round = 1;
let currentWave = generateWave(round);
spawnWave(currentWave);

// Fixed demo spot on the forest floor, off the dirt path — there's no
// tower-placement system yet, so this just stands in for "placed on
// buildable ground" until one exists.
const SUNFLOWER_DEMO_X = 650;
const SUNFLOWER_DEMO_Y = 320;

function updateTowerAttack(tower, x, y, deltaSeconds) {
  tower.target = findNearestEnemyInRange(x, y, tower.stats.range);

  tower.attackCooldown = Math.max(0, tower.attackCooldown - deltaSeconds);
  if (!tower.target || tower.attackCooldown > 0) return;

  damageEnemy(tower.target, tower.stats.damage);
  if (tower.burn) applyBurn(tower.target, tower.burn);
  tower.attackCooldown = tower.stats.attackInterval;
}

function update(deltaSeconds) {
  updateEnemies(deltaSeconds);
  updateTowerAttack(sunflower, SUNFLOWER_DEMO_X, SUNFLOWER_DEMO_Y, deltaSeconds);
}

function render() {
  renderMap(ctx, canvas);

  const x = SUNFLOWER_DEMO_X;
  const y = SUNFLOWER_DEMO_Y;

  if (sunflower.attackType === 'ray' && sunflower.target) {
    ctx.strokeStyle = sunflower.burn ? '#ff6600' : '#fff59d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(sunflower.target.x, sunflower.target.y);
    ctx.stroke();
  }

  renderTower(ctx, sunflower, x, y);

  renderEnemies(ctx);
}

function renderPanel() {
  const statsEl = document.getElementById('stats');
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

let lastTime = 0;

function loop(timestamp) {
  const deltaSeconds = lastTime ? (timestamp - lastTime) / 1000 : 0;
  lastTime = timestamp;

  update(deltaSeconds);
  render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
