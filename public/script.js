const socket = io("miweb-t3wt.onrender.com");
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let player = {}, mouse = { x: 0, y: 0 }, gameStarted = false;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function start() {
  const name = document.getElementById('nameInput').value.trim() || 'Player';
  socket.emit('join', name);
  show('');
  canvas.style.display = 'block';
  document.getElementById('leaderboard').style.display = 'block';
  gameStarted = true;
}

socket.on('init', (data) => {
  player.id = data.id;
});

socket.on('gameState', (state) => {
  if (!gameStarted) return;

  // Contador online
  document.getElementById('count').textContent = Object.keys(state.players).length;

  // Leaderboard
  const lb = document.getElementById('lbList');
  lb.innerHTML = '';
  state.leaderboard.forEach(p => {
    const li = document.createElement('li');
    li.textContent = `${p.name}: ${Math.floor(p.mass)}`;
    lb.appendChild(li);
  });

  // Render
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const p = state.players[player.id];
  if (!p) return;

  const scale = 1500 / p.mass;
  const offsetX = canvas.width / 2 - p.x;
  const offsetY = canvas.height / 2 - p.y;

  // Pellets
  state.pellets.forEach(pel => {
    ctx.fillStyle = pel.color;
    ctx.beginPath();
    ctx.arc(pel.x + offsetX, pel.y + offsetY, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Bots y jugadores
  [...Object.values(state.players), ...state.bots].forEach(entity => {
    const x = entity.x + offsetX;
    const y = entity.y + offsetY;
    const r = Math.sqrt(entity.mass);

    ctx.fillStyle = entity.color || '#fff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.font = 'bold ' + (r / 3) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(entity.name, x, y);
  });
});

// Movimiento
canvas.addEventListener('mousemove', (e) => {
  if (!gameStarted) return;
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  const p = player;
  if (p) {
    const worldX = e.clientX - canvas.width / 2 + p.x;
    const worldY = e.clientY - canvas.height / 2 + p.y;
    socket.emit('move', worldX, worldY);
  }
});

// Enviar movimiento continuo
setInterval(() => {
  if (gameStarted && player.id) {
    const p = player;
    const worldX = mouse.x - canvas.width / 2 + p.x;
    const worldY = mouse.y - canvas.height / 2 + p.y;
    socket.emit('move', worldX, worldY);
  }
}, 1000 / 30);