// server.js
const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // En producción restringe el origen
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

let players = {}; // { socketId: {id, name, x, y, color, size, lastUpdate} }

io.on("connection", (socket) => {
  console.log("Nuevo socket:", socket.id);

  // Esperamos que el cliente envíe 'newPlayer' con nombre y datos iniciales
  socket.on("newPlayer", (payload) => {
    const p = {
      id: socket.id,
      name: (payload && payload.name) || "Anon",
      x: (payload && payload.x) || Math.random() * 600 + 50,
      y: (payload && payload.y) || Math.random() * 400 + 50,
      vx: 0,
      vy: 0,
      size: 24,
      color: payload.color || `hsl(${Math.floor(Math.random()*360)},70%,50%)`,
      lastUpdate: Date.now()
    };
    players[socket.id] = p;

    // enviar a este cliente la lista actual y confirmar
    socket.emit("currentPlayers", players);

    // notificar al resto que entró uno nuevo
    socket.broadcast.emit("playerJoined", p);
  });

  // movimiento: cliente envía posición / velocidad
  socket.on("playerMove", (data) => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].vx = data.vx ?? 0;
    players[socket.id].vy = data.vy ?? 0;
    players[socket.id].lastUpdate = Date.now();
    // opcional: validar límites aquí
  });

  socket.on("disconnect", () => {
    console.log("Desconectado:", socket.id);
    if (players[socket.id]) {
      delete players[socket.id];
      socket.broadcast.emit("playerLeft", socket.id);
    }
  });
});

// Server tick: enviar snapshot a todos cada 50ms (20fps)
setInterval(() => {
  // prune jugadores inactivos (opcional)
  const now = Date.now();
  for (const id in players) {
    if (now - players[id].lastUpdate > 60_000) {
      delete players[id];
      io.emit("playerLeft", id);
    }
  }
  io.emit("state", players);
}, 50);

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
