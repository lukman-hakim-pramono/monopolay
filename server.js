const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let waitingQueue = []; // Antrean pemain human untuk Find Match
let activeRooms = {}; // Room game aktif

const CHARACTERS = {
  indonesia: { name: "Batik Indonesia", skill: "Diskon Sewa 10%", color: 0xff5252, avatar: "👕" },
  japan: { name: "Kimono Jepang", skill: "Bonus Start +15%", color: 0xf06292, avatar: "👘" },
  arab: { name: "Thawb Arab", skill: "Upgrade Murah 10%", color: 0xffb74d, avatar: "👳" },
  india: { name: "Sari India", skill: "Bebas Denda 20%", color: 0xffd54f, avatar: "🥻" }
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 1. MATCHMAKING HUMAN (PLAY WITH HUMAN - Exactly 4 Players)
  socket.on('find_human_match', (userData) => {
    socket.userData = userData; // { userId, name, level, selectedCharacter, points }
    
    // Check if already in queue
    if (!waitingQueue.find(p => p.socketId === socket.id)) {
      waitingQueue.push({
        socketId: socket.id,
        userData: userData
      });
      console.log(`Pemain ${userData.name} masuk antrean. Total antrean: ${waitingQueue.length}/4`);
    }

    // Inform client about queue status
    socket.emit('queue_status', { count: waitingQueue.length, required: 4 });

    // Broadcast queue update to all waiting players
    waitingQueue.forEach(p => {
      io.to(p.socketId).emit('queue_status', { count: waitingQueue.length, required: 4 });
    });

    // When queue reaches 4 players -> Create Room!
    if (waitingQueue.length >= 4) {
      const matchPlayers = waitingQueue.splice(0, 4);
      const roomId = 'room_' + Date.now();

      activeRooms[roomId] = {
        id: roomId,
        isAiMatch: false,
        activeTurnIndex: 0,
        players: matchPlayers.map((p, idx) => ({
          id: p.userData.userId || idx,
          socketId: p.socketId,
          name: p.userData.name,
          level: p.userData.level || 1,
          isBot: false,
          characterKey: p.userData.selectedCharacter || 'indonesia',
          character: CHARACTERS[p.userData.selectedCharacter || 'indonesia'],
          money: 1500,
          position: 0,
          isBankrupt: false
        }))
      };

      // Notify all 4 players to start the game
      matchPlayers.forEach(p => {
        const clientSocket = io.sockets.sockets.get(p.socketId);
        if (clientSocket) {
          clientSocket.join(roomId);
          clientSocket.emit('match_found', {
            roomId: roomId,
            roomData: activeRooms[roomId]
          });
        }
      });
    }
  });

  // 2. PLAY WITH AI (Instant Start with 3 AI Bots)
  socket.on('start_ai_match', (userData) => {
    socket.userData = userData;
    const roomId = 'ai_room_' + Date.now();

    const humanPlayer = {
      id: userData.userId || 1,
      socketId: socket.id,
      name: userData.name || 'Pemain',
      level: userData.level || 1,
      isBot: false,
      characterKey: userData.selectedCharacter || 'indonesia',
      character: CHARACTERS[userData.selectedCharacter || 'indonesia'],
      money: 1500,
      position: 0,
      isBankrupt: false
    };

    const bots = [
      { id: 'bot_1', socketId: null, name: 'AI Totoro', level: 1, isBot: true, characterKey: 'japan', character: CHARACTERS.japan, money: 1500, position: 0, isBankrupt: false },
      { id: 'bot_2', socketId: null, name: 'AI Calcifer', level: 2, isBot: true, characterKey: 'arab', character: CHARACTERS.arab, money: 1500, position: 0, isBankrupt: false },
      { id: 'bot_3', socketId: null, name: 'AI No-Face', level: 3, isBot: true, characterKey: 'india', character: CHARACTERS.india, money: 1500, position: 0, isBankrupt: false }
    ];

    activeRooms[roomId] = {
      id: roomId,
      isAiMatch: true,
      activeTurnIndex: 0,
      players: [humanPlayer, ...bots]
    };

    socket.join(roomId);
    socket.emit('match_found', {
      roomId: roomId,
      roomData: activeRooms[roomId]
    });
  });

  // Cancel Find Match
  socket.on('cancel_find_match', () => {
    waitingQueue = waitingQueue.filter(p => p.socketId !== socket.id);
    waitingQueue.forEach(p => {
      io.to(p.socketId).emit('queue_status', { count: waitingQueue.length, required: 4 });
    });
    socket.emit('queue_cancelled');
  });

  // 3. GAMEPLAY EVENTS
  socket.on('roll_dice', ({ roomId }) => {
    const room = activeRooms[roomId];
    if (!room) return;

    const currentPlayer = room.players[room.activeTurnIndex];
    if (currentPlayer.socketId && currentPlayer.socketId !== socket.id && !currentPlayer.isBot) {
      return; // Not this player's turn
    }

    const diceRoll = Math.floor(Math.random() * 6) + 1;
    currentPlayer.position = (currentPlayer.position + diceRoll) % 24;

    io.to(roomId).emit('player_moved', {
      playerIndex: room.activeTurnIndex,
      player: currentPlayer,
      diceRoll: diceRoll,
      newPosition: currentPlayer.position
    });
  });

  socket.on('end_turn', ({ roomId }) => {
    const room = activeRooms[roomId];
    if (!room) return;

    // Move to next non-bankrupt player
    let attempts = 0;
    do {
      room.activeTurnIndex = (room.activeTurnIndex + 1) % room.players.length;
      attempts++;
    } while (room.players[room.activeTurnIndex].isBankrupt && attempts < 4);

    io.to(roomId).emit('turn_changed', {
      activeTurnIndex: room.activeTurnIndex,
      activePlayer: room.players[room.activeTurnIndex]
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    waitingQueue = waitingQueue.filter(p => p.socketId !== socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket Monopolay Server berjalan pada port ${PORT}`);
});
