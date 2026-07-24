const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const rooms = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Create Room
    socket.on('createRoom', ({ roomId, username }) => {
        socket.join(roomId);
        rooms[roomId] = [{ id: socket.id, username }];
        socket.emit('roomCreated', { roomId, players: rooms[roomId] });
    });

    // Join Room
    socket.on('joinRoom', ({ roomId, username }) => {
        if (!rooms[roomId]) {
            socket.emit('errorMsg', 'Room nahi mila! Code check karein.');
            return;
        }

        if (rooms[roomId].length >= 4) {
            socket.emit('errorMsg', 'Room full ho chuka hai (Max 4 Players)!');
            return;
        }

        socket.join(roomId);
        rooms[roomId].push({ id: socket.id, username });

        // Update all players in this room
        io.to(roomId).emit('playerJoined', { players: rooms[roomId] });
        socket.to(roomId).emit('notification', `${username} room me aagaye hain!`);
    });

    // Claim THAP Win
    socket.on('claimThapWin', ({ roomId, username }) => {
        io.to(roomId).emit('gameOver', { winner: username, message: `${username} ne THAP maarkar game jeet liya!` });
    });

    // WebRTC Voice Chat
    socket.on('voiceSignal', (data) => {
        socket.to(data.roomId).emit('voiceSignal', data);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
