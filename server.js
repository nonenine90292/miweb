// server.js
// Node + Express + Socket.io basic authoritative server for the bubble game.
// Guarda este archivo como server.js y ejecuta: npm install && node server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingTimeout: 60000 });

// Serve static client (index.html + assets)
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

// --- World / server setup ---
const WORLD = { width: 4000, height: 4000 };
const TICK_MS = 100; // 10 ticks / s
const FOOD_TARGET_PER_SERVER = 300; // ajusta según performance

// Example servers (puedes añadir más/leer de DB)
let servers = [
  { id: 1, name: 'EU #1', map: 'Procedural', playersCur: 0, playersMax: 200, tags: ['PVE'], flags: { MENSUAL: true } },
  { id: 2, name: 'US #1', map: 'Procedural', playersCur: 0, playersMax: 200, tags: ['PVP'], flags: { MENSUAL: true } }
];

// Each server state holds authoritative entities
const serverStates = {}; // serverId -> { players: {}, foods: {}, bots: {} }

function createEmptyServerState(serverId) {
  return {
    players: {},   // socketId -> playerObject
    foods: {},     // foodId -> {id,x,y,radius,color}
    bots: {},      // optional
    lastFoodId: 0
  };
}
for (const s of servers) serverStates[s.id] = createEmptyServerState(s.id);

// helpers
function randBetween(a,b){ return a + Math.random()*(b-a); }
function makeFood(state) {
  const id = `f${++state.lastFoodId}`;
  return {
    id,
    x: Math.floor(randBetween(0, WORLD.width)),
    y: Math.floor(randBetween(0, WORLD.height)),
    radius: 8 + Math.random()*6,
    color: `hsl(${Math.floor(Math.random()*360)},70%,50%)`
  };
}
function distance(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
function wrapPos(e){
  if(e.x < 0) e.x += WORLD.width;
  if(e.x > WORLD.width) e.x -= WORLD.width;
  if(e.y < 0) e.y += WORLD.height;
  if(e.y > WORLD.height) e.y -= WORLD.height;
}

// Initialize foods for each server
for (const sid in serverStates){
  const st = serverStates[sid];
  while(Object.keys(st.foods).length < FOOD_TARGET_PER_SERVER){
    const f = makeFood(st);
    st.foods[f.id] = f;
  }
}

// --- Socket.io events ---
io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  // Client asks for servers list
  socket.on('getServers', () => {
    // update playersCur from state
    const sList = servers.map(s => {
      const st = serverStates[s.id];
      return { ...s, playersCur: Object.keys(st.players).length };
    });
    socket.emit('servers', sList);
  });

  // Player joins a specific game server/room
  socket.on('joinServer', ({ serverId, playerData }) => {
    const sid = Number(serverId);
    const state = serverStates[sid];
    if(!state) {
      socket.emit('error', 'Server not found');
      return;
    }

    socket.join(`server:${sid}`);
    // create player server-side
    const spawnX = Math.floor(randBetween(0, WORLD.width));
    const spawnY = Math.floor(randBetween(0, WORLD.height));
    const player = {
      id: socket.id,
      name: (playerData && playerData.name) ? playerData.name : `Guest-${socket.id.slice(0,4)}`,
      x: spawnX,
      y: spawnY,
      radius: (playerData && playerData.radius) || 30,
      speed: (playerData && playerData.speed) || 2.4,
      color: (playerData && playerData.color) || '#ccc',
      points: (playerData && playerData.points) || 0,
      moveDir: { x: 0, y: 0 },
      purchases: (playerData && playerData.purchases) || {}
    };
    state.players[socket.id] = player;

    // notify counts to everyone
    emitPlayerCounts();

    // Send initial full state to the new socket
    socket.emit('state', {
      players: state.players,
      bots: state.bots,
      miniBots: {}, // if used
      foods: state.foods
    });

    // Also notify the whole room (including new player) so they see new player
    io.to(`server:${sid}`).emit('state', {
      players: state.players,
      bots: state.bots,
      miniBots: {},
      foods: state.foods
    });

    console.log(`socket ${socket.id} joined server ${sid}`);
  });

  // Move direction from client (normalized direction vector)
  socket.on('move', (dir) => {
    // find which server room this socket is in
    const rooms = Array.from(socket.rooms).filter(r => r.startsWith('server:'));
    if(rooms.length === 0) return;
    const sid = Number(rooms[0].split(':')[1]);
    const st = serverStates[sid];
    if(!st || !st.players[socket.id]) return;
    const p = st.players[socket.id];
    // clamp dir
    p.moveDir = { x: Number(dir.x) || 0, y: Number(dir.y) || 0 };
  });

  // Chat: broadcast to room
  socket.on('chat', (text) => {
    const rooms = Array.from(socket.rooms).filter(r => r.startsWith('server:'));
    if(rooms.length === 0) return;
    const sid = Number(rooms[0].split(':')[1]);
    io.to(`server:${sid}`).emit('chat', { sender: socket.id, text });
  });

  // UpdatePlayer: client requested Avatar/skin/points update, apply to server copy
  socket.on('updatePlayer', (data) => {
    const rooms = Array.from(socket.rooms).filter(r => r.startsWith('server:'));
    if(rooms.length === 0) return;
    const sid = Number(rooms[0].split(':')[1]);
    const st = serverStates[sid];
    if(!st || !st.players[socket.id]) return;
    const p = st.players[socket.id];
    // copy allowed fields
    if(typeof data.color === 'string') p.color = data.color;
    if(typeof data.radius === 'number') p.radius = data.radius;
    if(typeof data.points === 'number') p.points = data.points;
    if(typeof data.skinImg === 'string') p.skinImg = data.skinImg;
    if(typeof data.flag === 'string') p.flag = data.flag;
    if(data.purchases) p.purchases = data.purchases;
    // broadcast updated player to room
    io.to(`server:${sid}`).emit('state', {
      players: st.players,
      bots: st.bots,
      miniBots: {},
      foods: st.foods
    });
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    // remove from any server
    for(const sid in serverStates){
      const st = serverStates[sid];
      if(st.players[socket.id]){
        delete st.players[socket.id];
        io.to(`server:${sid}`).emit('state', {
          players: st.players,
          bots: st.bots,
          miniBots: {},
          foods: st.foods
        });
      }
    }
    emitPlayerCounts();
    console.log('client disconnected', socket.id);
  });

  // explicit client disconnect event (from your client 'disconnectPlayer')
  socket.on('disconnectPlayer', () => {
    for(const sid in serverStates){
      const st = serverStates[sid];
      if(st.players[socket.id]){
        delete st.players[socket.id];
        io.to(`server:${sid}`).emit('state', {
          players: st.players,
          bots: st.bots,
          miniBots: {},
          foods: st.foods
        });
      }
    }
    emitPlayerCounts();
  });
});

// helper: send players count summary
function emitPlayerCounts(){
  const counts = {};
  for(const s of servers){
    counts[s.id] = Object.keys(serverStates[s.id].players).length;
  }
  io.emit('playerCountUpdate', counts);
}

// --- Server tick: update positions, collisions, and broadcast to rooms ---
setInterval(() => {
  const now = Date.now();

  for (const sid in serverStates) {
    const st = serverStates[sid];

    // Update player positions from their moveDir
    for (const pid in st.players) {
      const p = st.players[pid];
      if (!p) continue;

      // move using speed and tick interval
      const vx = (p.moveDir.x || 0) * p.speed * (TICK_MS / 16.67); // approximate compensation
      const vy = (p.moveDir.y || 0) * p.speed * (TICK_MS / 16.67);
      p.x += vx;
      p.y += vy;
      wrapPos(p);
    }

    // Collision: players eat foods
    for (const fid in st.foods) {
      const f = st.foods[fid];
      let eatenBy = null;
      for (const pid in st.players) {
        const p = st.players[pid];
        const d = Math.hypot(p.x - f.x, p.y - f.y);
        if (d < (p.radius + f.radius) * 0.9) { // collision threshold
          eatenBy = p;
          break;
        }
      }
      if (eatenBy) {
        // remove the food
        delete st.foods[fid];
        // grow player (simple mass increase)
        const addRadius = Math.max(1.2, f.radius * 0.35);
        eatenBy.radius = Math.min(1200, eatenBy.radius + addRadius);
        eatenBy.points = (eatenBy.points || 0) + Math.floor(addRadius * 2);
      }
    }

    // Refill foods to target count gradually
    const currentFoodCount = Object.keys(st.foods).length;
    const missing = FOOD_TARGET_PER_SERVER - currentFoodCount;
    if (missing > 0) {
      // spawn up to 10 per tick to avoid spikes
      const spawn = Math.min(missing, 10);
      for (let i=0;i<spawn;i++){
        const nf = makeFood(st);
        st.foods[nf.id] = nf;
      }
    }

    // Broadcast updated state to everyone in the room
    io.to(`server:${sid}`).emit('state', {
      players: st.players,
      bots: st.bots,
      miniBots: {},
      foods: st.foods
    });
  }

  // occasionally broadcast player counts
  emitPlayerCounts();

}, TICK_MS);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT}/index.html`);
});
