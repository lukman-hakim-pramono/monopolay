const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Konfigurasi CORS agar bisa diakses dari domain shared hosting
const io = new Server(server, {
  cors: {
    origin: "*", // Ganti dengan domain Anda saat production
    methods: ["GET", "POST"]
  }
});

let players = {};

io.on('connection', (socket) => {
  console.log('Pemain baru terhubung:', socket.id);
  
  // Tambahkan pemain dengan posisi awal di kotak 0
  players[socket.id] = {
    id: socket.id,
    position: 0,
    money: 1500,
    color: Math.floor(Math.random()*16777215).toString(16)
  };
  
  // Kirim data pemain saat ini ke pemain baru
  socket.emit('current_players', players);
  // Beritahu pemain lain ada yang baru bergabung
  socket.broadcast.emit('new_player', players[socket.id]);

  // Handle lemparan dadu
  socket.on('roll_dice', () => {
    const diceRoll = Math.floor(Math.random() * 6) + 1;
    let player = players[socket.id];
    
    if (player) {
      // Asumsi ada 24 kotak di papan heksagonal (4 per sisi)
      player.position = (player.position + diceRoll) % 24; 
      
      io.emit('player_moved', {
        id: socket.id,
        roll: diceRoll,
        newPosition: player.position
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Pemain terputus:', socket.id);
    delete players[socket.id];
    io.emit('player_disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket Server berjalan di port ${PORT}`);
});
