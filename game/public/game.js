const socket = io();

// DOM elements
const landingScreen = document.getElementById('landingScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const countdownScreen = document.getElementById('countdownScreen');
const gameScreen = document.getElementById('gameScreen');
const gameOverScreen = document.getElementById('gameOverScreen');

const playerNameInput = document.getElementById('playerNameInput');
const joinGameBtn = document.getElementById('joinGameBtn');
const playAgainBtn = document.getElementById('playAgainBtn');

const lobbyStatus = document.getElementById('lobbyStatus');
const countdownNumber = document.getElementById('countdownNumber');
const playersList = document.getElementById('playersList');

const gameTimer = document.getElementById('gameTimer');
const playerCash = document.getElementById('playerCash');
const playerPortfolio = document.getElementById('playerPortfolio');
const leaderboardList = document.getElementById('leaderboardList');
const stocksContainer = document.getElementById('stocksContainer');
const holdingsList = document.getElementById('holdingsList');
const finalLeaderboard = document.getElementById('finalLeaderboard');

// Game state
let currentScreen = 'landing';
let playerName = '';
let gameStocks = [];
let playerHoldings = new Map();
let selectedStockForPowerup = null;
let selectedGameMode = 'standard'; // default to 5 minutes
let playerPowerups = {
    insiderInfo: true,
    priceFreeze: true,
    marketManipulation: true
};

// Helper functions
function switchScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    switch(screenName) {
        case 'landing':
            landingScreen.classList.add('active');
            break;
        case 'lobby':
            lobbyScreen.classList.add('active');
            break;
        case 'countdown':
            countdownScreen.classList.add('active');
            break;
        case 'game':
            gameScreen.classList.add('active');
            break;
        case 'gameover':
            gameOverScreen.classList.add('active');
            break;
    }
    
    currentScreen = screenName;
}

function formatCurrency(value) {
    return '$' + Math.round(value).toLocaleString();
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function drawMiniChart(canvas, priceHistory) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (!priceHistory || priceHistory.length < 2) return;
    
    const minPrice = Math.min(...priceHistory);
    const maxPrice = Math.max(...priceHistory);
    const priceRange = maxPrice - minPrice || 1;
    
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    priceHistory.forEach((price, index) => {
        const x = (index / (priceHistory.length - 1)) * width;
        const y = height - ((price - minPrice) / priceRange) * height;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    
    // Check if trend is up or down
    const firstPrice = priceHistory[0];
    const lastPrice = priceHistory[priceHistory.length - 1];
    
    if (lastPrice < firstPrice) {
        ctx.strokeStyle = '#f44336';
    }
}

let stockCardsInitialized = false;

function renderStocks(stocks) {
    gameStocks = stocks;
    
    // Only create cards once on first render
    if (!stockCardsInitialized) {
        stocksContainer.innerHTML = '';
        
        stocks.forEach(stock => {
            const stockCard = document.createElement('div');
            stockCard.className = 'stock-card slide-up';
            stockCard.dataset.symbol = stock.symbol;
            
            const categoryEmoji = stock.category === 'tech' ? '💻' : stock.category === 'food' ? '🍔' : '🪙';
            
            stockCard.innerHTML = `
                <div class="stock-header">
                    <div class="stock-info">
                        <h4>${stock.symbol}</h4>
                        <div class="stock-name">${stock.name}</div>
                        <div class="stock-category ${stock.category}">${categoryEmoji} ${stock.category}</div>
                    </div>
                    <div class="stock-price">
                        <div class="price-value" data-price></div>
                        <div class="price-change" data-change></div>
                    </div>
                </div>
                <div class="stock-chart">
                    <canvas class="chart-line" width="300" height="60"></canvas>
                </div>
                <div class="stock-actions">
                    <button class="btn-buy" onclick="buyStock('${stock.symbol}', 1)">BUY 1</button>
                    <button class="btn-buy" onclick="buyStock('${stock.symbol}', 5)">BUY 5</button>
                    <button class="btn-buy" onclick="buyStock('${stock.symbol}', 10)">BUY 10</button>
                </div>
                <div class="stock-actions">
                    <button class="btn-sell" onclick="sellStock('${stock.symbol}', 1)">SELL 1</button>
                    <button class="btn-sell" onclick="sellStock('${stock.symbol}', 5)">SELL 5</button>
                    <button class="btn-sell" onclick="sellStock('${stock.symbol}', 10)">SELL 10</button>
                </div>
                <div class="stock-actions">
                    <button class="btn-powerup-target" onclick="selectStockForPowerup('${stock.symbol}')">
                        🎯 Select for Powerup
                    </button>
                </div>
            `;
            
            stocksContainer.appendChild(stockCard);
        });
        
        stockCardsInitialized = true;
    }
    
    // Update existing cards with new prices
    stocks.forEach(stock => {
        const stockCard = stocksContainer.querySelector(`[data-symbol="${stock.symbol}"]`);
        if (!stockCard) return;
        
        // Update special states
        stockCard.classList.remove('frozen', 'pumped');
        if (stock.frozen) stockCard.classList.add('frozen');
        if (stock.manipulated) stockCard.classList.add('pumped');
        
        const previousPrice = stock.priceHistory && stock.priceHistory.length > 1 
            ? stock.priceHistory[stock.priceHistory.length - 2] 
            : stock.price;
        const priceChange = stock.price - previousPrice;
        const priceChangePercent = previousPrice > 0 ? (priceChange / previousPrice * 100).toFixed(2) : 0;
        const changeClass = priceChange >= 0 ? 'positive' : 'negative';
        const changeSign = priceChange >= 0 ? '+' : '';
        
        // Update price
        const priceElement = stockCard.querySelector('[data-price]');
        priceElement.textContent = `$${stock.price.toFixed(2)}`;
        
        // Update change
        const changeElement = stockCard.querySelector('[data-change]');
        changeElement.textContent = `${changeSign}${priceChange.toFixed(2)} (${changeSign}${priceChangePercent}%)`;
        changeElement.className = `price-change ${changeClass}`;
        
        // Update chart
        const canvas = stockCard.querySelector('.chart-line');
        if (stock.priceHistory) {
            drawMiniChart(canvas, stock.priceHistory);
        }
    });
}

function updateLeaderboard(leaderboard) {
    leaderboardList.innerHTML = '';
    
    leaderboard.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = `leaderboard-item rank-${index + 1}`;
        
        const rank = index + 1;
        let medal = '';
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';
        
        item.innerHTML = `
            <span>${medal} ${rank}. ${player.name}</span>
            <span>${formatCurrency(player.portfolioValue)}</span>
        `;
        
        leaderboardList.appendChild(item);
    });
}

function updatePlayerState(state) {
    playerCash.textContent = formatCurrency(state.cash);
    playerPortfolio.textContent = formatCurrency(state.portfolioValue);
    
    // Update holdings
    playerHoldings.clear();
    state.holdings.forEach(holding => {
        playerHoldings.set(holding.symbol, holding.quantity);
    });
    
    // Render holdings
    if (state.holdings.length === 0) {
        holdingsList.innerHTML = '<div style="opacity: 0.6;">No holdings yet</div>';
    } else {
        holdingsList.innerHTML = '';
        state.holdings.forEach(holding => {
            const stock = gameStocks.find(s => s.symbol === holding.symbol);
            const value = stock ? stock.price * holding.quantity : 0;
            
            const item = document.createElement('div');
            item.className = 'holding-item';
            item.innerHTML = `
                <span>${holding.symbol} x${holding.quantity}</span>
                <span>${formatCurrency(value)}</span>
            `;
            holdingsList.appendChild(item);
        });
    }
}

function updateGameTimer(seconds) {
    gameTimer.textContent = formatTime(seconds);
    
    // Change color based on time remaining
    gameTimer.className = 'timer';
    if (seconds <= 30) {
        gameTimer.classList.add('danger');
    } else if (seconds <= 60) {
        gameTimer.classList.add('warning');
    }
}

function showNews(newsData) {
    const newsTicker = document.getElementById('newsTicker');
    const newsText = document.getElementById('newsText');
    
    if (!newsData) {
        newsTicker.style.display = 'none';
        return;
    }
    
    newsText.textContent = newsData.text;
    newsTicker.style.display = 'block';
    newsTicker.className = 'news-ticker';
    
    if (newsData.impact > 1) {
        newsTicker.classList.add('positive');
    }
}

function updatePowerupButtons(powerups) {
    if (!powerups) return;
    
    playerPowerups = powerups;
    
    const insiderBtn = document.getElementById('insiderInfoBtn');
    const freezeBtn = document.getElementById('priceFreezeBtn');
    const pumpBtn = document.getElementById('marketPumpBtn');
    
    insiderBtn.disabled = !powerups.insiderInfo;
    freezeBtn.disabled = !powerups.priceFreeze || !selectedStockForPowerup;
    pumpBtn.disabled = !powerups.marketManipulation || !selectedStockForPowerup;
}

window.selectStockForPowerup = function(symbol) {
    selectedStockForPowerup = symbol;
    console.log('🎯 Selected stock for powerup:', symbol);
    
    // Highlight selected stock
    document.querySelectorAll('.stock-card').forEach(card => {
        card.style.border = '';
    });
    
    const selectedCard = document.querySelector(`[data-symbol="${symbol}"]`);
    if (selectedCard) {
        selectedCard.style.border = '3px solid #ffd700';
    }
    
    // Enable powerup buttons that need a target
    const freezeBtn = document.getElementById('priceFreezeBtn');
    const pumpBtn = document.getElementById('marketPumpBtn');
    
    freezeBtn.disabled = !playerPowerups.priceFreeze;
    pumpBtn.disabled = !playerPowerups.marketManipulation;
};

window.usePowerup = function(powerupType) {
    console.log('🎮 Attempting powerup:', powerupType, 'on stock:', selectedStockForPowerup);
    
    if (powerupType === 'insiderInfo') {
        socket.emit('usePowerup', { powerupType });
    } else if (selectedStockForPowerup) {
        socket.emit('usePowerup', { 
            powerupType, 
            targetSymbol: selectedStockForPowerup 
        });
    } else {
        console.log('❌ No stock selected for powerup!');
    }
};

// Socket event handlers
socket.on('nameRejected', (data) => {
    alert(`Name rejected: ${data.error}\n\nPlease choose a different name.`);
    switchScreen('landing');
    playerNameInput.focus();
    playerNameInput.select();
});

socket.on('waitingForPlayers', (data) => {
    lobbyStatus.textContent = `Waiting for ${data.playersNeeded} more player(s)...`;
});

socket.on('gameStarting', (data) => {
    switchScreen('countdown');
    
    playersList.innerHTML = `
        <p>Players in this match:</p>
        <p>${data.players.join(', ')}</p>
    `;
    
    let countdown = data.countdown;
    countdownNumber.textContent = countdown;
    
    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            countdownNumber.textContent = countdown;
        } else {
            clearInterval(countdownInterval);
        }
    }, 1000);
});

socket.on('gameStarted', () => {
    stockCardsInitialized = false; // Reset for new game
    switchScreen('game');
});

socket.on('gameState', (state) => {
    renderStocks(state.stocks);
    updateGameTimer(state.gameTime);
    showNews(state.currentNews);
});

socket.on('leaderboard', (leaderboard) => {
    updateLeaderboard(leaderboard);
});

socket.on('playerState', (state) => {
    updatePlayerState(state);
    updatePowerupButtons(state.powerups);
});

socket.on('tradeResult', (result) => {
    // Visual feedback for trades
    if (!result.success) {
        // Could add error animation here
        console.log('Trade failed:', result);
    }
});

socket.on('powerupActivated', (result) => {
    console.log('✅ Powerup activated:', result);
    
    if (result.type === 'insiderInfo') {
        // Show predictions as overlay
        alert('INSIDER INFO:\n' + result.predictions.map(p => 
            `${p.symbol}: ${p.prediction}`
        ).join('\n'));
    } else if (result.type === 'priceFreeze') {
        console.log('❄️ FROZEN:', result.symbol, 'for', result.duration, 'ms');
    } else if (result.type === 'marketManipulation') {
        console.log('🚀 PUMPING:', result.symbol, 'for', result.duration, 'ms');
    }
});

socket.on('powerupFailed', (data) => {
    console.log('❌ Powerup failed:', data.powerupType);
});

socket.on('marketEffect', (data) => {
    // Show notification when someone uses a market-affecting powerup
    const message = data.type === 'priceFreeze' 
        ? `${data.player} FROZE ${data.symbol}! ❄️`
        : `${data.player} PUMPING ${data.symbol}! 🚀`;
    
    // Could add a toast notification here
    console.log(message);
});

socket.on('gameEnded', (data) => {
    switchScreen('gameover');
    
    finalLeaderboard.innerHTML = '';
    
    data.leaderboard.forEach((player, index) => {
        const rank = index + 1;
        const rankDiv = document.createElement('div');
        rankDiv.className = rank === 1 ? 'final-rank winner' : 'final-rank';
        
        let medal = '';
        if (rank === 1) medal = '🥇 ';
        else if (rank === 2) medal = '🥈 ';
        else if (rank === 3) medal = '🥉 ';
        
        rankDiv.innerHTML = `
            <span>${medal}${rank}. ${player.name}</span>
            <span>${formatCurrency(player.portfolioValue)}</span>
        `;
        
        finalLeaderboard.appendChild(rankDiv);
    });
});

// Trading functions (global for onclick)
window.buyStock = function(symbol, quantity) {
    socket.emit('buyStock', { symbol, quantity });
};

window.sellStock = function(symbol, quantity) {
    socket.emit('sellStock', { symbol, quantity });
};

// Event listeners
const singlePlayerBtn = document.getElementById('singlePlayerBtn');
const blitzModeBtn = document.getElementById('blitzModeBtn');
const standardModeBtn = document.getElementById('standardModeBtn');

// Mode selection
blitzModeBtn.addEventListener('click', () => {
    selectedGameMode = 'blitz';
    blitzModeBtn.classList.add('selected');
    standardModeBtn.classList.remove('selected');
});

standardModeBtn.addEventListener('click', () => {
    selectedGameMode = 'standard';
    standardModeBtn.classList.add('selected');
    blitzModeBtn.classList.remove('selected');
});

// Set default selection
standardModeBtn.classList.add('selected');

joinGameBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    
    if (name.length < 2) {
        alert('Please enter a name (at least 2 characters)');
        return;
    }
    
    playerName = name;
    socket.emit('joinLobby', { playerName, gameMode: selectedGameMode });
    switchScreen('lobby');
});

singlePlayerBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    
    if (name.length < 2) {
        alert('Please enter a name (at least 2 characters)');
        return;
    }
    
    playerName = name;
    socket.emit('joinSinglePlayer', { playerName, gameMode: selectedGameMode });
    switchScreen('countdown');
});

playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinGameBtn.click();
    }
});

playAgainBtn.addEventListener('click', () => {
    switchScreen('lobby');
    socket.emit('joinLobby', { playerName, gameMode: selectedGameMode });
});

// Focus name input on load
window.addEventListener('load', () => {
    playerNameInput.focus();
});
