const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const rooms = {};

// Deck generator based on custom names
function generateDeck(parchiNames, playerCount) {
    let deck = [];
    for (let i = 0; i < playerCount; i++) {
        const type = parchiNames[i % parchiNames.length] || `Role ${i+1}`;
        for (let j = 0; j < 4; j++) {
            deck.push(type);
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    // Create Room with Custom Parchiyan
    socket.on('createRoom', ({ roomId, username, parchis }) => {
        socket.join(roomId);
        rooms[roomId] = {
            players: [{ id: socket.id, username, cards: [] }],
            parchis: parchis && parchis.length === 4 ? parchis : ['Raja', 'Mantri', 'Chor', 'Sipahi'],
            gameStarted: false,
            currentTurnIndex: 0
        };
        socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
    });

    // Join Room
    socket.on('joinRoom', ({ roomId, username }) => {
        const room = rooms[roomId];
        if (!room) return socket.emit('errorMsg', 'Room nahi mila!');
        if (room.gameStarted) return socket.emit('errorMsg', 'Game shuru ho chuka hai!');
        if (room.players.length >= 4) return socket.emit('errorMsg', 'Room full hai!');

        socket.join(roomId);
        room.players.push({ id: socket.id, username, cards: [] });
        io.to(roomId).emit('playerJoined', { players: room.players });
    });

    // Start Game
    socket.on('startGame', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.players.length < 2) return socket.emit('errorMsg', 'Kam se kam 2 players chahiye!');

        room.gameStarted = true;
        const deck = generateDeck(room.parchis, room.players.length);

        room.players.forEach((player) => {
            player.cards = deck.splice(0, 4);
            io.to(player.id).emit('yourCards', { cards: player.cards });
        });

        room.currentTurnIndex = 0;
        const currentTurnPlayer = room.players[0];
        io.to(roomId).emit('turnUpdate', { 
            activePlayer: currentTurnPlayer.username,
            message: `Game Shuru! Pehli turn ${currentTurnPlayer.username} ki hai.`
        });
    });

    // Pass Card
    socket.on('passCard', ({ roomId, cardIndex }) => {
        const room = rooms[roomId];
        if (!room || !room.gameStarted) return;

        const turnPlayer = room.players[room.currentTurnIndex];
        if (turnPlayer.id !== socket.id) return socket.emit('errorMsg', 'Abhi aapki turn nahi hai!');

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
    });

    // Claim THAP Win
    socket.on('claimThapWin', ({ roomId, username }) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const isWinValid = player.cards.length === 4 && player.cards.every(c => c === player.cards[0]);

        if (isWinValid) {
            io.to(roomId).emit('gameOver', { 
                winner: username, 
                message: `🎉 BRAVO! ${username} ne 4 matching '${player.cards[0]}' parchiyan ikat-thi karke THAP maara aur JEET GAYA!` 
            });
        } else {
            socket.emit('errorMsg', '❌ Jhootha THAP! Aapke paas 4 ek jaisi parchiyan nahi hain!');
        }
    });

    // Restart Game in Same Room Logic
    socket.on('restartGame', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.players.length < 2) return socket.emit('errorMsg', 'Atleast 2 players hone chahiye!');

        room.gameStarted = true;
        const deck = generateDeck(room.parchis, room.players.length);

        room.players.forEach((player) => {
            player.cards = deck.splice(0, 4);
            io.to(player.id).emit('yourCards', { cards: player.cards });
        });

        room.currentTurnIndex = 0;
        const currentTurnPlayer = room.players[0];

        io.to(roomId).emit('gameRestarted', {
            activePlayer: currentTurnPlayer.username,
            message: `🔄 Game Reload ho gaya! Pehli turn ${currentTurnPlayer.username} ki hai.`
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
