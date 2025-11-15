# BlitzTrade Arena 🚀📈

A fast-paced multiplayer stock trading game where players compete in 5-minute rounds to build the highest portfolio value!

## Features

✅ **Real-time multiplayer** - Compete against 2-8 players simultaneously
✅ **Live price updates** - Stocks move every 2 seconds with realistic momentum and volatility
✅ **5 unique stocks** - SUSHI, RAMEN, BOBA, TACO, PIZZA
✅ **Live leaderboard** - Watch your ranking change in real-time
✅ **Mobile-first design** - Fully responsive and touch-optimized
✅ **Quick rounds** - 5 minutes from lobby to results
✅ **Smart matchmaking** - Games start automatically when 2+ players join

## How to Play

1. Enter your name and join the arena
2. Wait for other players (minimum 2)
3. Buy and sell stocks during the 5-minute round
4. Watch prices fluctuate with market momentum and random events
5. Try to end with the highest portfolio value!

## Game Mechanics

- **Starting Capital**: $10,000
- **Round Duration**: 5 minutes
- **Price Updates**: Every 2 seconds
- **Stock Movement**: Random walk + momentum + occasional news events
- **Trading**: Buy/Sell 1 share at a time (rapid clicking encouraged!)
- **Portfolio Value**: Cash + (Holdings × Current Prices)

## Local Development

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## Deployment to Render

1. Push this code to GitHub
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Use these settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
5. Deploy!

Your game will be live at `https://your-app-name.onrender.com`

## File Structure

```
blitztrade-arena/
├── server.js           # Node.js server with game logic
├── package.json        # Dependencies
├── public/
│   ├── index.html     # Main HTML structure
│   ├── style.css      # Responsive styling
│   └── game.js        # Client-side game logic
└── README.md
```

## Technical Details

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: Vanilla JavaScript (no frameworks!)
- **Real-time**: WebSocket communication
- **Price Algorithm**: Random walk with momentum and mean reversion
- **Responsive**: Mobile-first CSS with desktop optimizations

## Future Enhancement Ideas

- Power-ups (freeze prices, insider info, etc.)
- Different difficulty levels (faster games, more volatility)
- Tournament mode with multiple rounds
- Player profiles and win tracking
- More stocks with different volatility levels
- Chat system between players
- Sound effects for trades and events
- Achievement system

## Tips for Winning

- Watch the mini-charts for trends
- Buy low, sell high (obvious but effective!)
- Don't hold cash too long - it doesn't grow
- Keep an eye on the leaderboard
- Quick decisions beat perfect decisions
- Momentum often continues for a few updates

## Credits

Created with ❤️ by Matthew for the thrill of fast-paced financial gaming!

Built with the same multiplayer architecture as Sushi Sprint 🍣
