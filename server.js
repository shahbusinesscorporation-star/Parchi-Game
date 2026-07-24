const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    pingInterval: 10000,
    pingTimeout: 5000 
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Prevent Server Crash on Uncaught Exceptions
process.on('uncaughtException', (err) => {
    console.error('Caught exception: ', err);
});

const rooms = {};

function generateDeck(parchiNames, playerCount) {
    let deck = [];
    for (let i = 0; i < playerCount; i++) {
        const type = (parchiNames && parchiNames[i % parchiNames.length]) || `Role ${i+1}`;
        for (let j = 0; j < 4; j++) {
            deck.push(type);
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    // Keep-Alive Ping
    socket.on('pingServer', () => {
        socket.emit('pongServer');
    });

    // Create Room
    socket.on('createRoom', ({ roomId, username, parchis }) => {
        try {
            socket.join(roomId);
            rooms[roomId] = {
                players: [{ id: socket.id, username, cards: [], isReady: false }],
                parchis: parchis && parchis.length === 4 ? parchis : ['Raja', 'Mantri', 'Chor', 'Sipahi'],
                gameStarted: false,
                currentTurnIndex: 0
            };
            socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
        } catch (e) { console.error(e); }
    });

    // Join Room
    socket.on('joinRoom', ({ roomId, username }) => {
        try {
            const room = rooms[roomId];
            if (!room) return socket.emit('errorMsg', 'Room nahi mila!');
            if (room.gameStarted) return socket.emit('errorMsg', 'Game shuru ho chuka hai!');
            if (room.players.length >= 4) return socket.emit('errorMsg', 'Room full hai!');

            socket.join(roomId);
            room.players.push({ id: socket.id, username, cards: [], isReady: false });
            io.to(roomId).emit('playerJoined', { players: room.players });
        } catch (e) { console.error(e); }
    });

    // Start Game
    socket.on('startGame', ({ roomId }) => {
        try {
            const room = rooms[roomId];
            if (!room || room.players.length < 2) return socket.emit('errorMsg', 'Kam se kam 2 players chahiye!');

            room.gameStarted = true;
            const deck = generateDeck(room.parchis, room.players.length);

            room.players.forEach((player) => {
                player.cards = deck.splice(0, 4);
                player.isReady = false;
                io.to(player.id).emit('yourCards', { cards: player.cards });
            });

            room.currentTurnIndex = 0;
            const currentTurnPlayer = room.players[0];
            io.to(roomId).emit('turnUpdate', { 
                activePlayer: currentTurnPlayer.username,
                message: `Game Shuru! Pehli turn ${currentTurnPlayer.username} ki hai.`
            });
        } catch (e) { console.error(e); }
    });

    // Pass Card
    socket.on('passCard', ({ roomId, cardIndex }) => {
        try {
            const room = rooms[roomId];
            if (!room || !room.gameStarted) return;

            const turnPlayer = room.players[room.currentTurnIndex];
            if (!turnPlayer || turnPlayer.id !== socket.id) return socket.emit('errorMsg', 'Abhi aapki turn nahi hai!');

            const passedCard = turnPlayer.cards.splice(cardIndex, 1)[0];
            const nextTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
            const nextPlayer = room.players[nextTurnIndex];

            nextPlayer.cards.push(passedCard);

            io.to(turnPlayer.id).emit('yourCards', { cards: turnPlayer.cards });
            io.to(nextPlayer.id).emit('yourCards', { cards: nextPlayer.cards });

            room.currentTurnIndex = nextTurnIndex;
            io.to(roomId).emit('turnUpdate', { 
                activePlayer: nextPlayer.username,
                message: `${turnPlayer.username} ne parchi pass ki!`
            });
        } catch (e) { console.error(e); }
    });

    // Claim THAP Win
    socket.on('claimThapWin', ({ roomId, username }) => {
        try {
            const room = rooms[roomId];
            if (!room) return;

            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.cards || player.cards.length !== 4) return;

            const parchiName = player.cards[0];
            const isWinValid = player.cards.every(c => c === parchiName);

            if (isWinValid) {
                room.gameStarted = false;
                room.players.forEach(p => {
                    p.cards = [];
                    p.isReady = false;
                });

                io.to(roomId).emit('gameOver', { 
                    winner: username, 
                    winningRole: parchiName,
                    players: room.players,
                    message: `BRAVO! ${username} ne 4 matching '${parchiName}' parchiyan ikat-thi karke THAP maara aur JEET GAYA!` 
                });
            } else {
                socket.emit('errorMsg', '❌ Jhootha THAP! Aapke paas 4 ek jaisi parchiyan nahi hain!');
            }
        } catch (e) { console.error(e); }
    });

    // Player Get Ready Event
    socket.on('playerReady', ({ roomId }) => {
        try {
            const room = rooms[roomId];
            if (!room) return;

            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.isReady = true;
            }

            io.to(roomId).emit('readyStatusUpdate', { players: room.players });

            const allReady = room.players.length >= 2 && room.players.every(p => p.isReady);
            if (allReady) {
                room.gameStarted = true;
                const deck = generateDeck(room.parchis, room.players.length);

                room.players.forEach((p) => {
                    p.cards = deck.splice(0, 4);
                    p.isReady = false;
                    io.to(p.id).emit('yourCards', { cards: p.cards });
                });

                room.currentTurnIndex = 0;
                const currentTurnPlayer = room.players[0];

                io.to(roomId).emit('gameRestarted', {
                    activePlayer: currentTurnPlayer.username,
                    message: `🔄 Sabhi ready ho gaye! Naya match shuru! Pehli turn ${currentTurnPlayer.username} ki hai.`
                });
            }
        } catch (e) { console.error(e); }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
