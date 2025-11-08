const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let gameState = { players: {}, pellets: [], bots: [], leaderboard: [] };
let playerId = null;
let mouse = { x: 0, y: 0 };
let gameStarted = false;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function start() {
  const name = document.getElementById('nameInput').value.trim() || 'Bubble';
  socket.emit('join', name);
  show(''); // Ocultar todos los menús
  canvas.classList.remove('hidden');
  document.getElementById('leaderboard').classList.remove('hidden');
  gameStarted = true;
  console.log('Juego iniciado');
}

// Recibir ID del jugador
socket.on('init', (data) => {
  playerId = data.id;
  console.log('Mi ID:', playerId);
});

// Recibir estado del juego (AHORA FUNCIONA)
socket.on('gameState', (state) => {
  gameState = state;
  
  // Actualizar contador online
  const countEl = document.getElementById('count');
  if (countEl) countEl.textContent = Object.keys(state.players).length;

  // Leaderboard
  const lbList = document.getElementById('lbList');
  if (lbList) {
    lbList.innerHTML = '';
    state.leaderboard.forEach((p, i) => {
      const li = document.createElement('li');
      li.textContent = `${i+1}. ${p.name}: ${Math.floor(p.mass)}`;
      lbList.appendChild(li);
    });
  }

  // Renderizar SOLO si el juego ha iniciado
  if (!gameStarted) return;
  render();
});

// FUNCIÓN DE RENDER SEPARADA (FIX del problema negro)
function render() {
  // Fondo negro con grid sutil
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Fondo con grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const myPlayer = gameState.players[playerId];
  if (!myPlayer) return; // ¡IMPORTANTE! Esperar a que el jugador exista

  // CÁLCULO CORREGIDO de cámara (esto arregla lo negro)
  const zoom = Math.max(64 / myPlayer.mass, 0.1) * 0.9;
  const camX = canvas.width / 2 + (mouse.x - canvas.width / 2) * 0.1;
  const camY = canvas.height / 2 + (mouse.y - canvas.height / 2) * 0.1;
  
  const offsetX = camX - myPlayer.x;
  const offsetY = camY - myPlayer.y;

  // Dibujar pellets (verdes)
  gameState.pellets.forEach(pel => {
    const screenX = (pel.x + offsetX) * zoom + canvas.width / 2;
    const screenY = (pel.y + offsetY) * zoom + canvas.height / 2;
    ctx.fillStyle = pel.color || '#4ADF58';
    ctx.beginPath();
    ctx.arc(screenX, screenY, 4 * zoom, 0, Math.PI * 2);
    ctx.fill();
  });

  // Dibujar jugadores y bots
  [...Object.values(gameState.players), ...gameState.bots].forEach(entity => {
    const screenX = (entity.x + offsetX) * zoom + canvas.width / 2;
    const screenY = (entity.y + offsetY) * zoom + canvas.height / 2;
    const radius = Math.max(10, Math.sqrt(entity.mass) * zoom);

    // Burbuja
    const gradient = ctx.createRadialGradient(screenX - radius/2, screenY - radius/2, 0, screenX, screenY, radius);
    gradient.addColorStop(0, entity.color || '#ffffff');
    gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Borde
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3 * zoom;
    ctx.stroke();

    // Nombre
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(12, radius / 3)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(entity.name, screenX, screenY - radius - 10);
    
    // Masa
    ctx.fillStyle = '#aaa';
    ctx.font = `${Math.max(10, radius / 4)}px Arial`;
    ctx.fillText(Math.floor(entity.mass), screenX, screenY + radius + 10);
  });
}

// Movimiento del mouse (corregido)
canvas.addEventListener('mousemove', (e) => {
  if (!gameStarted) return;
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

// Enviar posición objetivo cada 50ms
setInterval(() => {
  if (gameStarted && playerId && gameState.players[playerId]) {
    const p = gameState.players[playerId];
    const targetX = p.x + (mouse.x - canvas.width / 2) / 10;
    const targetY = p.y + (mouse.y - canvas.height / 2) / 10;
    socket.emit('move', targetX, targetY);
  }
}, 50);

// Loop de render continuo (60 FPS)
function gameLoop() {
  if (gameStarted) {
    render();
  }
  requestAnimationFrame(gameLoop);
}
gameLoop(); // ¡INICIAR LOOP!
