const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Static files (index.html etc.) serve karein
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const rooms = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // 1. Join Room Notification
    socket.on('joinRoomNotification', ({ roomId, username }) => {
        socket.to(roomId).emit('notification', `${username} room me aagaye hain!`);
    });

    // 2. Claim THAP Win
    socket.on('claimThapWin', ({ roomId, username }) => {
        io.to(roomId).emit('gameOver', { winner: username, message: `${username} ne THAP maarkar game jeet liya!` });
    });

    // 3. WebRTC Voice Chat Signaling
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
