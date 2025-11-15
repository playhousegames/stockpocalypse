const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// PROTECTION LEVEL B: Basic Validation + Profanity Filter
const PROFANITY_LIST = [
    'fuck', 'shit', 'ass', 'bitch', 'damn', 'hell', 'crap', 'piss',
    'cock', 'dick', 'pussy', 'bastard', 'slut', 'whore', 'fag',
    'nigger', 'nigga', 'retard', 'cunt', 'twat', 'wanker'
];

function validatePlayerName(name) {
    // Basic validation
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Name is required' };
    }
    
    // Trim whitespace
    name = name.trim();
    
    // Length check
    if (name.length < 2) {
        return { valid: false, error: 'Name must be at least 2 characters' };
    }
    if (name.length > 20) {
        return { valid: false, error: 'Name must be 20 characters or less' };
    }
    
    // Block URLs
    if (name.match(/https?:\/\//i) || name.match(/www\./i)) {
        return { valid: false, error: 'URLs not allowed in names' };
    }
    
    // Block excessive special characters
    const specialCharCount = (name.match(/[^a-zA-Z0-9\s]/g) || []).length;
    if (specialCharCount > 3) {
        return { valid: false, error: 'Too many special characters' };
    }
    
    // Profanity filter
    const nameLower = name.toLowerCase();
    for (const word of PROFANITY_LIST) {
        if (nameLower.includes(word)) {
            return { valid: false, error: 'Inappropriate language detected' };
        }
    }
    
    // Block common variations (leet speak, spacing)
    const cleanedName = nameLower.replace(/[^a-z]/g, '');
    for (const word of PROFANITY_LIST) {
        const cleanedWord = word.replace(/[^a-z]/g, '');
        if (cleanedName.includes(cleanedWord)) {
            return { valid: false, error: 'Inappropriate language detected' };
        }
    }
    
    return { valid: true, sanitized: name };
}

// Game state
const games = new Map();
const waitingPlayers = [];

// Stock configuration with categories
const STOCKS = [
    // Tech stocks - High volatility, big swings
    { symbol: 'SUSHI', name: 'Sushi Corp', basePrice: 50, momentum: 0, category: 'tech', volatility: 8 },
    { symbol: 'RAMEN', name: 'Ramen Industries', basePrice: 75, momentum: 0, category: 'tech', volatility: 8 },
    
    // Food stocks - Stable, smaller swings
    { symbol: 'BOBA', name: 'Boba Tea Co', basePrice: 30, momentum: 0, category: 'food', volatility: 3 },
    { symbol: 'TACO', name: 'Taco Systems', basePrice: 100, momentum: 0, category: 'food', volatility: 3 },
    
    // Crypto stocks - WILD, massive swings
    { symbol: 'PIZZA', name: 'Pizza Coin', basePrice: 60, momentum: 0, category: 'crypto', volatility: 15 }
];

const GAME_DURATION = 120; // 2 minutes in seconds
const PRICE_UPDATE_INTERVAL = 2000; // 2 seconds
const STARTING_CASH = 10000;

// News events that affect stocks
const NEWS_EVENTS = [
    { text: "BREAKING: Tech sector surges on AI breakthrough!", category: 'tech', impact: 1.3 },
    { text: "ALERT: Cybersecurity breach hits tech companies!", category: 'tech', impact: 0.7 },
    { text: "Food prices stabilize amid supply improvements", category: 'food', impact: 1.1 },
    { text: "Restaurant chains report declining sales", category: 'food', impact: 0.9 },
    { text: "🚀 CRYPTO MOON! Major adoption announced!", category: 'crypto', impact: 1.8 },
    { text: "⚠️ CRYPTO CRASH! Regulatory crackdown!", category: 'crypto', impact: 0.5 },
    { text: "Market-wide rally as economy strengthens!", category: 'all', impact: 1.2 },
    { text: "Flash crash! Panic selling across markets!", category: 'all', impact: 0.8 }
];

// Power-ups
const POWERUPS = {
    INSIDER_INFO: { name: 'Insider Info', duration: 10000, cooldown: 30000 },
    PRICE_FREEZE: { name: 'Price Freeze', duration: 10000, cooldown: 40000 },
    MARKET_MANIPULATION: { name: 'Market Pump', duration: 8000, cooldown: 35000 }
};

const BOT_NAMES = [
    'TradeMaster3000', 'WallStreetBot', 'BullRunner', 'BearHunter',
    'StockNinja', 'ProfitSeeker', 'MarketShark', 'DiamondHands',
    'PaperTrader', 'MoonShot', 'DipBuyer', 'HodlBot'
];

class Game {
    constructor(gameId, isSinglePlayer = false, gameMode = 'standard') {
        this.id = gameId;
        this.players = new Map();
        this.bots = new Map();
        this.isSinglePlayer = isSinglePlayer;
        this.gameMode = gameMode;
        this.stocks = JSON.parse(JSON.stringify(STOCKS));
        this.gameTime = gameMode === 'blitz' ? 120 : 300; // 2 min or 5 min
        this.gameActive = false;
        this.priceHistory = new Map();
        this.currentNews = null;
        this.newsTimeout = null;
        this.frozenStocks = new Set();
        this.manipulatedStocks = new Map();
        
        // Initialize price history
        this.stocks.forEach(stock => {
            this.priceHistory.set(stock.symbol, [stock.basePrice]);
        });
    }

    addPlayer(socketId, playerName) {
        this.players.set(socketId, {
            id: socketId,
            name: playerName,
            cash: STARTING_CASH,
            holdings: new Map(),
            portfolioValue: STARTING_CASH,
            powerups: {
                insiderInfo: { available: true, lastUsed: 0 },
                priceFreeze: { available: true, lastUsed: 0 },
                marketManipulation: { available: true, lastUsed: 0 }
            },
            achievements: {
                tradesCount: 0,
                biggestGain: 0,
                biggestLoss: 0,
                perfectTiming: 0
            }
        });
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
    }

    addBots(count) {
        const availableNames = [...BOT_NAMES];
        for (let i = 0; i < count; i++) {
            const nameIndex = Math.floor(Math.random() * availableNames.length);
            const botName = availableNames.splice(nameIndex, 1)[0];
            const botId = 'bot_' + Date.now() + '_' + i;
            
            this.bots.set(botId, {
                id: botId,
                name: botName,
                cash: STARTING_CASH,
                holdings: new Map(),
                portfolioValue: STARTING_CASH,
                strategy: Math.random() > 0.5 ? 'aggressive' : 'conservative',
                lastTradeTime: 0
            });
            
            // Add bots to players map so they appear in leaderboard
            this.players.set(botId, this.bots.get(botId));
        }
    }

    botTrade() {
        if (!this.gameActive) return;
        
        this.bots.forEach(bot => {
            // Bots trade every 3-8 seconds randomly
            const now = Date.now();
            const timeSinceLastTrade = now - bot.lastTradeTime;
            const tradeDelay = bot.strategy === 'aggressive' ? 3000 : 6000;
            
            if (timeSinceLastTrade < tradeDelay) return;
            
            bot.lastTradeTime = now;
            
            // Decide what to do
            const action = Math.random();
            
            if (action < 0.5) {
                // Buy stock
                const affordableStocks = this.stocks.filter(s => s.basePrice <= bot.cash);
                if (affordableStocks.length > 0) {
                    // Pick stock based on strategy
                    let targetStock;
                    if (bot.strategy === 'aggressive') {
                        // Buy stocks with positive momentum
                        const upwardStocks = affordableStocks.filter(s => s.momentum > 0);
                        targetStock = upwardStocks.length > 0 
                            ? upwardStocks[Math.floor(Math.random() * upwardStocks.length)]
                            : affordableStocks[Math.floor(Math.random() * affordableStocks.length)];
                    } else {
                        // Buy cheapest stocks (contrarian)
                        targetStock = affordableStocks.reduce((min, stock) => 
                            stock.basePrice < min.basePrice ? stock : min
                        );
                    }
                    
                    const maxQuantity = Math.floor(bot.cash / targetStock.basePrice);
                    const quantity = Math.min(
                        bot.strategy === 'aggressive' ? Math.ceil(maxQuantity * 0.3) : Math.ceil(maxQuantity * 0.1),
                        10
                    );
                    
                    if (quantity > 0) {
                        this.buyStock(bot.id, targetStock.symbol, quantity);
                    }
                }
            } else if (action < 0.8) {
                // Sell stock
                const ownedStocks = Array.from(bot.holdings.entries()).filter(([_, qty]) => qty > 0);
                if (ownedStocks.length > 0) {
                    const [symbol, quantity] = ownedStocks[Math.floor(Math.random() * ownedStocks.length)];
                    const stock = this.stocks.find(s => s.symbol === symbol);
                    
                    // Sell based on strategy
                    let sellQuantity;
                    if (bot.strategy === 'aggressive' && stock.momentum < 0) {
                        // Sell more when momentum is negative
                        sellQuantity = Math.min(Math.ceil(quantity * 0.5), quantity);
                    } else {
                        sellQuantity = Math.min(Math.ceil(quantity * 0.3), 5);
                    }
                    
                    if (sellQuantity > 0) {
                        this.sellStock(bot.id, symbol, sellQuantity);
                    }
                }
            }
            // else: hold (do nothing)
        });
    }

    startGame() {
        this.gameActive = true;
        this.gameTime = this.gameMode === 'blitz' ? 120 : 300;
        
        // Reset stocks
        this.stocks = JSON.parse(JSON.stringify(STOCKS));
        this.priceHistory.clear();
        this.stocks.forEach(stock => {
            this.priceHistory.set(stock.symbol, [stock.basePrice]);
        });

        // Start game timer
        this.gameTimer = setInterval(() => {
            this.gameTime--;
            
            if (this.gameTime <= 0) {
                this.endGame();
            }
        }, 1000);

        // Start price updates
        this.priceTimer = setInterval(() => {
            this.updatePrices();
        }, PRICE_UPDATE_INTERVAL);

        // Start bot trading if single player
        if (this.isSinglePlayer) {
            this.botTimer = setInterval(() => {
                this.botTrade();
            }, 1000); // Check for bot trades every second
        }

        // News events every 15-25 seconds
        this.scheduleNewsEvent();
    }

    scheduleNewsEvent() {
        const delay = 15000 + Math.random() * 10000; // 15-25 seconds
        this.newsTimeout = setTimeout(() => {
            if (this.gameActive) {
                this.triggerNewsEvent();
                this.scheduleNewsEvent(); // Schedule next event
            }
        }, delay);
    }

    triggerNewsEvent() {
        const event = NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
        this.currentNews = event;
        
        // Apply impact to affected stocks
        this.stocks.forEach(stock => {
            if (event.category === 'all' || event.category === stock.category) {
                stock.basePrice *= event.impact;
                stock.basePrice = Math.max(5, stock.basePrice); // Minimum price
            }
        });
        
        // Clear news after 5 seconds
        setTimeout(() => {
            this.currentNews = null;
        }, 5000);
    }

    updatePrices() {
        this.stocks.forEach(stock => {
            // Skip frozen stocks
            if (this.frozenStocks.has(stock.symbol)) {
                return;
            }
            
            // Normal price movement with category-based volatility
            const randomChange = (Math.random() - 0.5) * stock.volatility;
            const momentumChange = stock.momentum * 3;
            
            // Occasional momentum shifts (15% chance)
            if (Math.random() < 0.15) {
                const shift = (Math.random() - 0.5) * stock.volatility * 2;
                stock.momentum = shift > 0 ? 0.4 : -0.4;
            } else {
                // Momentum decay
                stock.momentum *= 0.92;
            }
            
            let priceChange = randomChange + momentumChange;
            
            // Add manipulation boost on top of normal movement
            const manipulation = this.manipulatedStocks.get(stock.symbol);
            if (manipulation) {
                console.log('🚀 PUMPING', stock.symbol, 'from', stock.basePrice.toFixed(2), 'adding +$10');
                priceChange += manipulation.direction * 10; // +$10 per update when pumping
            }
            
            stock.basePrice = Math.max(5, stock.basePrice + priceChange);
            
            // Store price history (keep last 50 points)
            const history = this.priceHistory.get(stock.symbol);
            history.push(stock.basePrice);
            if (history.length > 50) {
                history.shift();
            }
        });

        // Update all player portfolio values
        this.updatePortfolioValues();
    }

    buyStock(socketId, symbol, quantity) {
        const player = this.players.get(socketId);
        const stock = this.stocks.find(s => s.symbol === symbol);
        
        if (!player || !stock) return false;
        
        const cost = stock.basePrice * quantity;
        
        if (player.cash >= cost) {
            player.cash -= cost;
            const currentHolding = player.holdings.get(symbol) || 0;
            player.holdings.set(symbol, currentHolding + quantity);
            
            // Track achievements
            if (player.achievements) {
                player.achievements.tradesCount++;
            }
            
            this.updatePortfolioValues();
            return true;
        }
        
        return false;
    }

    sellStock(socketId, symbol, quantity) {
        const player = this.players.get(socketId);
        const stock = this.stocks.find(s => s.symbol === symbol);
        
        if (!player || !stock) return false;
        
        const currentHolding = player.holdings.get(symbol) || 0;
        
        if (currentHolding >= quantity) {
            const revenue = stock.basePrice * quantity;
            player.cash += revenue;
            player.holdings.set(symbol, currentHolding - quantity);
            this.updatePortfolioValues();
            return true;
        }
        
        return false;
    }

    updatePortfolioValues() {
        this.players.forEach(player => {
            let totalValue = player.cash;
            
            player.holdings.forEach((quantity, symbol) => {
                const stock = this.stocks.find(s => s.symbol === symbol);
                if (stock) {
                    totalValue += stock.basePrice * quantity;
                }
            });
            
            player.portfolioValue = totalValue;
        });
    }

    usePowerup(socketId, powerupType, targetSymbol = null) {
        const player = this.players.get(socketId);
        console.log('🎮 POWERUP ATTEMPT:', { socketId, powerupType, targetSymbol, hasPlayer: !!player });
        
        if (!player || !player.powerups) {
            console.log('❌ No player or no powerups');
            return false;
        }

        const now = Date.now();
        const powerup = player.powerups[powerupType];
        console.log('🎮 Powerup state:', powerup);
        
        if (!powerup || !powerup.available) {
            console.log('❌ Powerup not available');
            return false;
        }

        // Check cooldown
        const cooldown = POWERUPS[powerupType.toUpperCase().replace(/([A-Z])/g, '_$1').toUpperCase()]?.cooldown || 30000;
        if (now - powerup.lastUsed < cooldown) {
            console.log('❌ Powerup on cooldown');
            return false;
        }

        powerup.available = false;
        powerup.lastUsed = now;

        if (powerupType === 'insiderInfo') {
            console.log('✅ Insider Info activated');
            setTimeout(() => { powerup.available = true; }, POWERUPS.INSIDER_INFO.cooldown);
            return { type: 'insiderInfo', predictions: this.getPricePredictions() };
        } 
        else if (powerupType === 'priceFreeze' && targetSymbol) {
            console.log('✅ Price Freeze activated on', targetSymbol);
            this.frozenStocks.add(targetSymbol);
            setTimeout(() => {
                this.frozenStocks.delete(targetSymbol);
                powerup.available = true;
                console.log('⏰ Price Freeze ended on', targetSymbol);
            }, POWERUPS.PRICE_FREEZE.duration);
            return { type: 'priceFreeze', symbol: targetSymbol, duration: POWERUPS.PRICE_FREEZE.duration };
        }
        else if (powerupType === 'marketManipulation' && targetSymbol) {
            console.log('✅ Market Pump activated on', targetSymbol);
            this.manipulatedStocks.set(targetSymbol, { direction: 1, playerId: socketId });
            setTimeout(() => {
                this.manipulatedStocks.delete(targetSymbol);
                powerup.available = true;
                console.log('⏰ Market Pump ended on', targetSymbol);
            }, POWERUPS.MARKET_MANIPULATION.duration);
            return { type: 'marketManipulation', symbol: targetSymbol, duration: POWERUPS.MARKET_MANIPULATION.duration };
        }

        console.log('❌ Unknown powerup type or missing target');
        return false;
    }

    getPricePredictions() {
        return this.stocks.map(stock => ({
            symbol: stock.symbol,
            currentPrice: stock.basePrice,
            prediction: stock.momentum > 0 ? 'UP' : stock.momentum < 0 ? 'DOWN' : 'STABLE'
        }));
    }

    getLeaderboard() {
        const leaderboard = Array.from(this.players.values())
            .map(p => ({
                name: p.name,
                portfolioValue: Math.round(p.portfolioValue)
            }))
            .sort((a, b) => b.portfolioValue - a.portfolioValue);
        
        return leaderboard;
    }

    getGameState() {
        return {
            stocks: this.stocks.map(s => ({
                symbol: s.symbol,
                name: s.name,
                price: Math.round(s.basePrice * 100) / 100,
                category: s.category,
                priceHistory: this.priceHistory.get(s.symbol),
                frozen: this.frozenStocks.has(s.symbol),
                manipulated: this.manipulatedStocks.has(s.symbol)
            })),
            gameTime: this.gameTime,
            gameActive: this.gameActive,
            currentNews: this.currentNews
        };
    }

    getPlayerState(socketId) {
        const player = this.players.get(socketId);
        if (!player) return null;
        
        return {
            cash: Math.round(player.cash * 100) / 100,
            holdings: Array.from(player.holdings.entries()).map(([symbol, quantity]) => ({
                symbol,
                quantity
            })),
            portfolioValue: Math.round(player.portfolioValue * 100) / 100,
            powerups: player.powerups ? {
                insiderInfo: player.powerups.insiderInfo?.available,
                priceFreeze: player.powerups.priceFreeze?.available,
                marketManipulation: player.powerups.marketManipulation?.available
            } : null,
            achievements: player.achievements
        };
    }

    endGame() {
        this.gameActive = false;
        clearInterval(this.gameTimer);
        clearInterval(this.priceTimer);
        if (this.botTimer) {
            clearInterval(this.botTimer);
        }
        if (this.newsTimeout) {
            clearTimeout(this.newsTimeout);
        }
    }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Send current waiting players count to new connection
    socket.emit('waitingPlayersCount', waitingPlayers.length);

    socket.on('joinSinglePlayer', (data) => {
        const playerName = data.playerName || data;
        const gameMode = data.gameMode || 'standard';
        
        // VALIDATE NAME
        const validation = validatePlayerName(playerName);
        if (!validation.valid) {
            socket.emit('nameRejected', { error: validation.error });
            return;
        }
        
        console.log(`${validation.sanitized} starting single player game (${gameMode} mode)`);
        
        const gameId = 'game_' + Date.now();
        const game = new Game(gameId, true, gameMode); // Single player mode with game mode
        
        // Add human player
        game.addPlayer(socket.id, validation.sanitized);
        socket.join(gameId);
        socket.gameId = gameId;
        socket.playerName = validation.sanitized;
        
        // Add 3-7 bots
        const botCount = 3 + Math.floor(Math.random() * 5); // 3 to 7 bots
        game.addBots(botCount);
        
        games.set(gameId, game);
        
        // Notify player game is starting
        io.to(gameId).emit('gameStarting', {
            players: Array.from(game.players.values()).map(p => p.name),
            countdown: 3
        });
        
        // Start game after countdown
        setTimeout(() => {
            game.startGame();
            io.to(gameId).emit('gameStarted');
            
            // Start sending updates
            const updateInterval = setInterval(() => {
                if (!game.gameActive) {
                    clearInterval(updateInterval);
                    
                    // Send final results
                    io.to(gameId).emit('gameEnded', {
                        leaderboard: game.getLeaderboard()
                    });
                    
                    // Clean up game after 10 seconds
                    setTimeout(() => {
                        games.delete(gameId);
                    }, 10000);
                    
                    return;
                }
                
                // Send game state to player
                io.to(gameId).emit('gameState', game.getGameState());
                io.to(gameId).emit('leaderboard', game.getLeaderboard());
                
                // Send player state
                const playerSocket = io.sockets.sockets.get(socket.id);
                if (playerSocket) {
                    playerSocket.emit('playerState', game.getPlayerState(socket.id));
                }
            }, 500);
        }, 3000);
    });

    socket.on('joinLobby', (data) => {
        const playerName = data.playerName || data;
        const gameMode = data.gameMode || 'standard';
        
        // VALIDATE NAME
        const validation = validatePlayerName(playerName);
        if (!validation.valid) {
            socket.emit('nameRejected', { error: validation.error });
            return;
        }
        
        console.log(`${validation.sanitized} joining lobby (${gameMode} mode)`);
        
        waitingPlayers.push({ socketId: socket.id, name: validation.sanitized, gameMode });
        socket.playerName = validation.sanitized;
        
        // Broadcast updated waiting count to all connected clients
        io.emit('waitingPlayersCount', waitingPlayers.length);
        
        // Try to create a game if we have enough players
        if (waitingPlayers.length >= 2) {
            const gameId = 'game_' + Date.now();
            
            // Use the game mode from the first player (could be changed to majority vote)
            const firstPlayerMode = waitingPlayers[0].gameMode || 'standard';
            const game = new Game(gameId, false, firstPlayerMode);
            
            // Add players to game (up to 8)
            const playersForGame = waitingPlayers.splice(0, 8);
            playersForGame.forEach(p => {
                game.addPlayer(p.socketId, p.name);
                const playerSocket = io.sockets.sockets.get(p.socketId);
                if (playerSocket) {
                    playerSocket.join(gameId);
                    playerSocket.gameId = gameId;
                }
            });
            
            games.set(gameId, game);
            
            // Notify players game is starting
            io.to(gameId).emit('gameStarting', {
                players: Array.from(game.players.values()).map(p => p.name),
                countdown: 3
            });
            
            // Start game after countdown
            setTimeout(() => {
                game.startGame();
                io.to(gameId).emit('gameStarted');
                
                // Start sending updates
                const updateInterval = setInterval(() => {
                    if (!game.gameActive) {
                        clearInterval(updateInterval);
                        
                        // Send final results
                        io.to(gameId).emit('gameEnded', {
                            leaderboard: game.getLeaderboard()
                        });
                        
                        // Clean up game after 10 seconds
                        setTimeout(() => {
                            games.delete(gameId);
                        }, 10000);
                        
                        return;
                    }
                    
                    // Send game state to all players
                    io.to(gameId).emit('gameState', game.getGameState());
                    io.to(gameId).emit('leaderboard', game.getLeaderboard());
                    
                    // Send individual player states
                    game.players.forEach((player, socketId) => {
                        const playerSocket = io.sockets.sockets.get(socketId);
                        if (playerSocket) {
                            playerSocket.emit('playerState', game.getPlayerState(socketId));
                        }
                    });
                }, 500); // Update every 500ms
            }, 3000);
        } else {
            socket.emit('waitingForPlayers', {
                playersInLobby: waitingPlayers.length,
                playersNeeded: 2 - waitingPlayers.length
            });
        }
    });

    socket.on('buyStock', (data) => {
        const gameId = socket.gameId;
        const game = games.get(gameId);
        
        if (game && game.gameActive) {
            const success = game.buyStock(socket.id, data.symbol, data.quantity);
            socket.emit('tradeResult', { success, action: 'buy', symbol: data.symbol });
        }
    });

    socket.on('sellStock', (data) => {
        const gameId = socket.gameId;
        const game = games.get(gameId);
        
        if (game && game.gameActive) {
            const success = game.sellStock(socket.id, data.symbol, data.quantity);
            socket.emit('tradeResult', { success, action: 'sell', symbol: data.symbol });
        }
    });

    socket.on('usePowerup', (data) => {
        const gameId = socket.gameId;
        const game = games.get(gameId);
        
        if (game && game.gameActive) {
            const result = game.usePowerup(socket.id, data.powerupType, data.targetSymbol);
            if (result) {
                socket.emit('powerupActivated', result);
                
                // Notify all players if it affects the market
                if (data.powerupType === 'priceFreeze' || data.powerupType === 'marketManipulation') {
                    io.to(gameId).emit('marketEffect', {
                        type: data.powerupType,
                        symbol: data.targetSymbol,
                        player: socket.playerName
                    });
                }
            } else {
                socket.emit('powerupFailed', { powerupType: data.powerupType });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        // Remove from waiting players
        const waitingIndex = waitingPlayers.findIndex(p => p.socketId === socket.id);
        if (waitingIndex !== -1) {
            waitingPlayers.splice(waitingIndex, 1);
        }
        
        // Remove from active game
        const gameId = socket.gameId;
        if (gameId) {
            const game = games.get(gameId);
            if (game) {
                game.removePlayer(socket.id);
                
                // If no players left, end the game
                if (game.players.size === 0) {
                    game.endGame();
                    games.delete(gameId);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🔥 Stockpocalypse server running on port ${PORT}`);
});
