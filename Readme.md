# ⚡ Funding Arbitrage System

> A real-time perpetual futures monitor that tracks live trade prices and funding rates across crypto pairs, calculates the funding spread between them, and lays the groundwork for a full automated arbitrage engine.

---

## What This Project Actually Does

This system answers one question: **"Which coin is paying more funding right now — and by how much?"**

In perpetual futures markets, traders who hold positions pay or receive a **funding rate** every 8 hours. When the funding rate of one coin is significantly higher than another, there is an arbitrage opportunity:

- **Go short** on the coin paying a higher rate → you *receive* the funding
- **Go long** on the coin paying a lower rate (or receiving) → you *pay less or earn*

This creates a market-neutral trade — you profit from the **spread between funding rates**, not from the direction of prices.

Right now, the system is in its **monitoring phase**: it shows you live prices, funding data, and the current spread so you can make informed manual decisions. The engine to automate those trades is being built.

---

## System Architecture

The application has two separate runtimes that work together:

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENT (React)                     │
│                                                         │
│   ┌──────────────┐          ┌───────────────────────┐   │
│   │  WebSocket   │          │      REST Polling     │   │
│   │  (via server)│          │  (direct to Binance)  │   │
│   └──────┬───────┘          └──────────┬────────────┘   │
│          │ live prices                 │ funding rates   │
│          └──────────────┬──────────────┘                │
│                         ▼                               │
│              ┌──────────────────────┐                   │
│              │   Spread Calculator  │                   │
│              │ Coin1.rate - Coin2.rate                  │
│              └──────────────────────┘                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   SERVER (Node.js)                      │
│                                                         │
│   Binance Futures WebSocket (fstream.binance.com)       │
│           ↓                                             │
│   Proxy: streams two coin trade feeds to client         │
└─────────────────────────────────────────────────────────┘
```

---

## How the Data Flows

There are **two completely separate data pipelines** running simultaneously:

### Pipeline 1 — Live Trade Prices (WebSocket)

```
Binance Futures WSS
wss://fstream.binance.com/stream?streams=btcusdt@trade/ethusdt@trade
        ↓
Node.js server (Binance-ws.js)
  - Subscribes to both coin streams in a single connection
  - Extracts: symbol, price, quantity
  - Proxies message → client WebSocket
        ↓
React App (useEffect with WebSocket)
  - Receives price + quantity
  - Routes to correct card by coin name
  - Renders live price update instantly
```

**Why proxy through the server?** Because browsers can't upgrade to multi-stream Binance WebSocket connections directly due to CORS and protocol restrictions. The Node.js server acts as a trusted relay.

### Pipeline 2 — Funding Rates (REST Polling)

```
React App (useCallback + setInterval every 5 seconds)
        ↓
Binance Futures REST API
https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT
https://fapi.binance.com/fapi/v1/premiumIndex?symbol=ETHUSDT
        ↓
Returns: markPrice, indexPrice, lastFundingRate, nextFundingTime
        ↓
React state: setFunding1(d1), setFunding2(d2)
        ↓
Spread = (funding1.lastFundingRate - funding2.lastFundingRate) × 100
```

**Why go direct from the client (not through the server)?** Binance's public REST endpoints are open to browsers with CORS. No need for a server hop — going direct reduces latency.

---

## What You See on Screen

The UI has three visible sections:

### 1. Coin Cards (two, side by side)

Each card shows one perpetual futures pair. You can change which coin to watch at any time using the input inside the card.

| Field | Source | Update frequency |
|---|---|---|
| Last Trade Price | WebSocket stream | Every tick (real-time) |
| Mark Price | REST `/premiumIndex` | Every 5 seconds |
| Index Price | REST `/premiumIndex` | Every 5 seconds |
| Funding Rate | REST `/premiumIndex` | Every 5 seconds |
| Next Funding Countdown | Client-side timer | Every 1 second |

**Funding Rate color coding:**
- 🟢 **Green** — positive rate (longs pay shorts; shorts receive)
- 🔴 **Red** — negative rate (shorts pay longs; longs receive)

### 2. Spread Bar (bottom strip)

Shows the difference between the two funding rates in real time:

```
Funding Spread: +0.003200%   BTC pays more than ETH   Refreshes every 5s · REST API
```

A large spread (> 0.01%) is a signal worth investigating. A very small spread means both coins are in similar market sentiment — less arbitrage opportunity.

### 3. Loading Skeleton

Before data arrives, each card shows an animated shimmer skeleton so the UI never looks broken or empty.

---

## Project Structure

```
FundingArbitrageSystem/
├── client/                      # React + Vite frontend
│   └── src/
│       ├── App.jsx              # Main component — all UI logic lives here
│       ├── index.css            # Design system (tokens, cards, animations)
│       ├── main.jsx             # React entry point
│       └── utils/
│           └── baseurl.js       # WebSocket URL resolver (dev vs prod)
│
└── server/                      # Node.js + Express backend
    ├── server.js                # Entry point: HTTP + WebSocket server on port 8080
    ├── api/
    │   ├── Binance.js           # REST: spot price fetch (BTCUSDT ticker)
    │   └── BinanceFunding.js    # REST: funding data fetch (premiumIndex)
    └── ws/
        ├── Binance-ws.js        # Active: proxy WebSocket for trade stream
        └── Binance-fws.js       # Experimental: funding via WebSocket (markPrice@1s)
```

---

## Key Design Decisions

### Why two data sources?

| Data | Method | Why |
|---|---|---|
| Trade price | WebSocket | Prices change every millisecond; polling would miss ticks and burn API rate limits |
| Funding rate | REST polling | Funding only changes every 8 hours; 5s polling is more than sufficient and simpler |

### Why is there a `Binance-fws.js` file that's not used in production?

This is an experimental module that tried to stream the **funding rate via WebSocket** using Binance's `markPrice@1s` stream. It works, but for the current use case, polling the REST API every 5 seconds is simpler, more reliable, and avoids the complexity of maintaining a second persistent WebSocket connection just for data that updates every 8 hours. This file is kept as a **foundation for future upgrades** when millisecond-accurate funding data becomes needed.

### Why does the coin selector live inside each card?

Each card is self-contained and independently switchable. You can compare BTC vs SOL, or ETH vs BNB — any combination — without affecting the other card. The `coin1` and `coin2` state values control both the WebSocket subscription (reconnects automatically) and the REST polling (re-fetches on change).

---

## Running the Project Locally

### Prerequisites
- Node.js 18+
- npm

### Step 1 — Start the server

```bash
cd server
npm install
npm start
# Listening on port 8080
```

### Step 2 — Start the client

```bash
cd client
npm install
npm run dev
# Opens at http://localhost:5173
```

The client connects to the server WebSocket at `ws://localhost:8080` by default.

---

## What's Next: Future Updates

The current system is intentionally a **monitoring layer** — it shows you the opportunity without trading on it. Here's the roadmap for what comes next:

---

### Phase 2 — Multi-Exchange Support

Right now everything is Binance-only. The architecture was designed from day one to be multi-exchange (see `ARCHITECTURE.md`). The next step is:

- **Bybit integration** — Bybit has different funding intervals (4h on some pairs vs 8h on Binance). Differences in intervals create extra arbitrage surface.
- **Blofin, Deribit, Kraken** — Each exchange has its own funding mechanics. A large spread across exchanges (not just across coins) is a true cross-venue arbitrage.
- **Unified data layer** — A normalizer that maps each exchange's API format into a single internal schema so the UI and engine can reason about any coin/exchange combination without custom code per venue.

The `bybit-api` package is already installed in `client/package.json` — the groundwork has started.

---

### Phase 3 — Arbitrage Engine

Once multi-exchange data is flowing, the engine can be built:

**Signal Detection**

The engine continuously monitors the spread across all tracked pairs. When it detects a spread that exceeds a configurable threshold (e.g., `> 0.01%` after fees), it emits a signal.

```
signal = {
  long:  { exchange: "bybit",   symbol: "ETHUSDT", rate: -0.0001 },
  short: { exchange: "binance", symbol: "ETHUSDT", rate: +0.0112 },
  spread: 0.0113,
  annualizedYield: ~30%
}
```

**Risk Management Service**

Before any order is placed, a risk layer checks:
- Maximum position size per trade
- Total exposure cap across all open positions
- Correlation risk (avoid doubling up on directional exposure)
- Fee estimation (maker/taker fees must be less than spread profit)

**Order Execution Layer**

Sends matched orders to both exchanges simultaneously using their respective APIs. The goal is near-simultaneous entry to lock in the spread before it collapses.

**Position Tracking Service**

Monitors open positions, calculates PnL from realized funding payments, and determines exit conditions (when the spread closes or reverses).

---

### Phase 4 — Production Infrastructure

**gRPC Microservices**

The architecture diagram already shows the target state: Order Service, Risk Service, and Position Service communicating over gRPC. This makes each service independently deployable and scalable.

**Metrics Database**

All funding rates, spreads, signals generated, orders placed, and PnL data gets stored. This enables:
- Historical backtesting (did this spread pattern happen before?)
- Strategy optimization (what threshold gives the best risk-adjusted return?)
- Performance dashboard

**Alert System**

Push notifications (Telegram/Discord bot or email) when a high-value spread is detected so you can review before the engine acts — or to log what the engine did automatically.

**Historical Backtesting**

Replay months of historical funding rate data to simulate what the strategy would have earned. This validates that a spread threshold is profitable before risking real capital.

---

## Understanding Funding Rate Arbitrage

For context on the strategy this system is built around:

**Funding rates** in perpetual futures exist to anchor the perpetual price to the spot price. Every 8 hours (on Binance), longs pay shorts (positive rate) or shorts pay longs (negative rate), proportional to the rate and position size.

**The arbitrage:**
1. Find two situations where the funding rate spread is large enough to profit after fees
2. Open a long on the lower-rate side, short on the higher-rate side
3. Hold until the spread closes — collect the funding difference as profit
4. Close both positions — net price movement is zero (market neutral)

This is a **delta-neutral strategy**: because you're long one side and short the other (either same coin on two exchanges, or two correlated coins), your directional exposure is minimal. The profit comes purely from the funding rate differential.

**Risks:**
- Execution risk: rates can move between signal detection and order fill
- Liquidity risk: large positions might move the market
- Correlation risk: on cross-coin trades, the coins don't always move together
- Exchange risk: counterparty or technical failure on one leg

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 19 + Vite 8 | UI rendering, state management |
| Styling | Vanilla CSS + CSS variables | Design system, animations |
| Fonts | Space Mono + Syne (Google Fonts) | Monospace data display + clean headings |
| Backend | Node.js + Express 5 | WebSocket proxy server |
| WebSocket lib | `ws` (npm) | Server-side WebSocket connection |
| Data source | Binance Futures API | Trade stream + funding rates |
| Dev server | nodemon | Auto-restart on file change |
| Telegram | Interacting with user With Telegram |

---

*This document describes the system as it exists today and outlines the intended direction. The architecture was designed to scale from a single-exchange monitor to a fully automated multi-exchange arbitrage engine.*
