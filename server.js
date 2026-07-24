const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const rooms = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Create Room
    socket.on('createRoom', ({ roomId, username, parchis }) => {
        socket.join(roomId);
        rooms[roomId] = {
            players: [{ id: socket.id, username, isReady: true }],
            parchis: parchis,
            cards: {},
            turnIndex: 0,
            isGameStarted: false
        };
        socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
    });

    // Join Room
    socket.on('joinRoom', ({ roomId, username }) => {
        const room = rooms[roomId];
        if (!room) return socket.emit('errorMsg', 'Room nahi mila!');
        if (room.isGameStarted) return socket.emit('errorMsg', 'Game pehle se shuru ho chuka hai!');
        if (room.players.length >= 4) return socket.emit('errorMsg', 'Room full hai!');

        room.players.push({ id: socket.id, username, isReady: true });
        socket.join(roomId);

        io.to(roomId).emit('playerJoined', { roomId, players: room.players });
        
        // Notify existing players about new WebRTC peer
        socket.to(roomId).emit('userConnectedWebRTC', { socketId: socket.id, username });
    });

    // Start Game
    socket.on('startGame', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        if (room.players.length < 2) {
            return socket.emit('errorMsg', 'Kam se kam 2 players chahiye!');
        }

        room.isGameStarted = true;
        const deck = [];
        const numTypes = Math.min(room.players.length, room.parchis.length);
        
        for (let i = 0; i < numTypes; i++) {
            for (let j = 0; j < 4; j++) {
                deck.push(room.parchis[i]);
            }
        }

        // Shuffle deck
        deck.sort(() => Math.random() - 0.5);

        // Distribute 4 cards to each player
        room.players.forEach((p, idx) => {
            room.cards[p.username] = deck.slice(idx * 4, (idx + 1) * 4);
            io.to(p.id).emit('yourCards', { cards: room.cards[p.username] });
        });

        room.turnIndex = 0;
        io.to(roomId).emit('turnUpdate', { activePlayer: room.players[room.turnIndex].username });
    });

    // Pass Card
    socket.on('passCard', ({ roomId, cardIndex }) => {
        const room = rooms[roomId];
        if (!room || !room.isGameStarted) return;

        const currentP = room.players[room.turnIndex];
        const nextIndex = (room.turnIndex + 1) % room.players.length;
        const nextP = room.players[nextIndex];

        const passedCard = room.cards[currentP.username].splice(cardIndex, 1)[0];
        room.cards[nextP.username].push(passedCard);

        io.to(currentP.id).emit('yourCards', { cards: room.cards[currentP.username] });
        io.to(nextP.id).emit('yourCards', { cards: room.cards[nextP.username] });

        room.turnIndex = nextIndex;
        io.to(roomId).emit('turnUpdate', { activePlayer: room.players[room.turnIndex].username });
    });

    // Claim THAP Win
    socket.on('claimThapWin', ({ roomId, username }) => {
        const room = rooms[roomId];
        if (!room) return;

        const pCards = room.cards[username];
        if (pCards && pCards.length === 4 && pCards.every(c => c === pCards[0])) {
            room.isGameStarted = false;
            room.players.forEach(p => p.isReady = false);
            io.to(roomId).emit('gameOver', { winner: username, message: `🎉 ${username} ne THAP maarkar jeet liya!`, players: room.players });
        } else {
            socket.emit('errorMsg', 'Aapke paas 4 same parchiyan nahi hain!');
        }
    });

    // Player Ready for Restart
    socket.on('playerReady', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        const p = room.players.find(pl => pl.id === socket.id);
        if (p) p.isReady = true;

        io.to(roomId).emit('readyStatusUpdate', { players: room.players });

        if (room.players.every(pl => pl.isReady)) {
            socket.emit('startGame', { roomId });
        }
    });

    // --- TEXT CHAT HANDLER ---
    socket.on('sendChatMessage', ({ roomId, username, message }) => {
        io.to(roomId).emit('receiveChatMessage', { username, message });
    });

    // --- WEBRTC VOICE CHAT SIGNALING ---
    socket.on('webrtcSignal', ({ targetId, signal }) => {
        io.to(targetId).emit('webrtcSignal', { senderId: socket.id, signal });
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        for (const rId in rooms) {
            const room = rooms[rId];
            const pIdx = room.players.findIndex(p => p.id === socket.id);
            if (pIdx !== -1) {
                room.players.splice(pIdx, 1);
                io.to(rId).emit('playerJoined', { roomId: rId, players: room.players });
                io.to(rId).emit('userDisconnectedWebRTC', { socketId: socket.id });
                if (room.players.length === 0) delete rooms[rId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
