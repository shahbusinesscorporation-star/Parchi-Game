const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ✅ Isse badal kar yeh kar dein:
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  // === NEW FEATURES SETUP ===
    // 1. Join Room Notification
    socket.on('joinRoomNotification', ({ roomId, username }) => {
        socket.to(roomId).emit('notification', `${username} room me aagaye hain!`);
    });

    // 2. THAP Winner Broadcast
    socket.on('claimThapWin', ({ roomId, username }) => {
        io.in(roomId).emit('gameOver', { 
            winner: username, 
            message: `${username} ne THAP maar ke game jeet liya!` 
        });
    });

    // 3. WebRTC Voice Chat Signaling
    socket.on('voiceSignal', ({ targetId, signalData }) => {
        io.to(targetId).emit('voiceSignal', {
            callerId: socket.id,
            signalData: signalData
        });
    });
    // ==========================

  // 1. CREATE ROOM
  socket.on('createRoom', ({ hostName, customNames }) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();

    rooms[roomId] = {
      roomId,
      customNames,
      players: [{ id: socket.id, name: hostName, parchiyan: [] }],
      currentTurnIndex: 0,
      gameStarted: false
    };

    socket.join(roomId);
    socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
  });

  // 2. JOIN ROOM
  socket.on('joinRoom', ({ playerName, roomId }) => {
    const room = rooms[roomId];

    if (!room) {
      socket.emit('errorMsg', 'Room code galat hai!');
      return;
    }

    if (room.players.length >= 4) {
      socket.emit('errorMsg', 'Room pehle se full hai!');
      return;
    }

    room.players.push({ id: socket.id, name: playerName, parchiyan: [] });
    socket.join(roomId);

    io.to(roomId).emit('updatePlayers', room.players);

    if (room.players.length === 4) {
      startGame(roomId);
    }
  });

  // 3. PARCHI PASS LOGIC
  socket.on('passParchi', ({ roomId, parchiIndex }) => {
    const room = rooms[roomId];
    if (!room) return;

    const senderIndex = room.players.findIndex(p => p.id === socket.id);
    
    if (senderIndex !== room.currentTurnIndex || room.players[senderIndex].parchiyan.length < 4) {
      return;
    }

    const receiverIndex = (senderIndex + 1) % 4;
    const passedParchi = room.players[senderIndex].parchiyan.splice(parchiIndex, 1)[0];
    
    room.players[receiverIndex].parchiyan.push(passedParchi);
    room.currentTurnIndex = receiverIndex;

    checkWin(room, receiverIndex);

    io.to(roomId).emit('gameStateUpdate', room);
  });
});

function startGame(roomId) {
  const room = rooms[roomId];
  let deck = [];

  room.customNames.forEach(name => {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: Math.random(), name });
    }

  });

  deck.sort(() => Math.random() - 0.5);

  room.players.forEach((player, index) => {
    player.parchiyan = deck.slice(index * 4, (index + 1) * 4);
  });

  room.gameStarted = true;
  io.to(roomId).emit('gameStateUpdate', room);
}

function checkWin(room, playerIndex) {
  const player = room.players[playerIndex];
  if (player.parchiyan.length !== 4) return;

  const firstName = player.parchiyan[0].name;
  const isWinner = player.parchiyan.every(p => p.name === firstName);

  if (isWinner) {
    io.to(room.roomId).emit('gameOver', { winnerName: player.name, parchiName: firstName });
  }
}

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});