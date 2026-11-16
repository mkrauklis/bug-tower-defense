const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let lastTime = 0;

function update(deltaSeconds) {
  // Game state updates will go here.
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#4caf50';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Bug Tower Defense', canvas.width / 2, canvas.height / 2);
}

function loop(timestamp) {
  const deltaSeconds = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(deltaSeconds);
  render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
