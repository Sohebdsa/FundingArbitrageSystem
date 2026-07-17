# ⚡ Funding Arbitrage System

> A professional-grade, multi-exchange perpetual futures monitor, calculator, and alert engine. The system tracks live tick prices and funding rates across Binance, Bybit, and BloFin, computes pairwise arbitrage spreads, estimates yield, and pushes automated, adaptive signals directly to Telegram.. 

---

## 🚀 Key Features

This system is a fully integrated, multi-page monitoring and interactive alerting suite:

### 1. 📊 Interactive Dashboard (`/client`)
- **Real-Time Spread Monitor (Home):** Visualizes live order-book tick prices (streamed over WebSockets) and premium index rates (polled every 5 seconds) side-by-side. 
- **Arbitrage Spread List (Arb List):** A paginated grid comparing pairwise rates across all supported venues. Supports search queries, exchange filters, minimum APY filters, confidence filters, and column sorting.
- **APY Calculator:** Estimates annualized yields on capital using custom leverages, fee structures, and holding periods.
- **Telegram Controller UI:** Allows users to sync their chat ID, define spread thresholds, configure message templates with variables, and view live delivery logs.
- **Execution Controller:** Tracks open arbitrage positions and simulates execution entries.

### 2. 🤖 Interactive Telegram Bot (`/server/telegram`)
- **Long-Polling Command Router:** A complete bot supporting user interactions:
  - `/start` or `/on` — Registers the user and activates alerts.
  - `/off` — Deregisters the chat and clears all subscriptions.
  - `/status` — Lists active subscriptions.
  - `/ArbList` — Renders the top 10 spreads with inline keyboard navigation (`Prev` / `Next` / `Refresh` / `Subscribe`).
  - `/COIN` (e.g. `/BTC`, `/SOL`) — Subscribes to adaptive signals for that coin.
  - `/stop COIN` — Unsubscribes from the coin.
- **Adaptive Scheduling Engine:** Adjusts alert frequencies dynamically as the funding event approaches (e.g., alert every 30m if >30m left; alert every 1m if <3m left) to keep you informed at the critical moments.

### 3. 🌐 API Proxy Layer (`/server`)
- **BloFin CORS Proxy:** Proxies bulk mark prices and funding snapshots to bypass browser restrictions.
- **REST Notification Gateway:** Exposes `/api/telegram/send` for manual or automated system integrations.

---

## 📐 Architecture & Data Pipelines

The system is designed with clear separation between high-frequency price feeds, low-frequency rate computations, and asynchronous client notifications.

```
                  ┌────────────────────────────────────────┐
                  │          LIQUIDITY ADAPTERS            │
                  │   Binance REST/WS    Bybit REST/WS     │
                  │             BloFin REST/Proxy          │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │          DIVERGENCE ENGINE             │
                  │  Matches symbols across venues,        │
                  │  calculates spreads, ranks APY,        │
                  │  and classifies confidence levels      │
                  └──────────┬──────────────────┬──────────┘
                             │                  │
            ┌────────────────┘                  └──────────────┐
            ▼                                                  ▼
┌───────────────────────┐                          ┌───────────────────────┐
│     CLIENT DASHBOARD  │                          │  SERVER TELEGRAM BOT  │
│  - Real-time WS feed  │                          │  - Active state store │
│  - Multi-exchange list│                          │  - Adaptive scheduler │
│  - Template Editor    │                          │  - Inline keyboards   │
└───────────────────────┘                          └───────────────────────┘
```

### Data Flows
1. **Live Trade Feeds (WebSockets):** The React frontend establishes a WebSocket connection with the Node.js server. The server opens a single multiplexed connection to Binance Futures (`fstream.binance.com`) for the requested coins and relays live trades back to the client.
2. **Bulk Rate Ingestion (REST):** 
   - **Client-Side:** `allExchanges.js` fetches rate arrays from Binance, Bybit, and the BloFin proxy, normalizes the data schema, pairs the tickers, and triggers a table rerender.
   - **Server-Side:** `SpreadFetcher.js` mirrors the normalization process, feeding the background scheduler.

---

## 🛠️ Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Frontend** | React 19 + Vite 8 | Single Page Application framework |
| **Styling** | Vanilla CSS + HSL variables | Custom dark mode UI with sleek components |
| **Fonts** | Space Mono + Syne (Google Fonts) | Headings and aligned data sheets |
| **Backend** | Node.js + Express 5 | REST API + WebSocket Server |
| **WS Library** | `ws` | Server socket streams and relays |
| **API Sources** | Binance, Bybit, BloFin | REST & WS data providers |

---

## ⚙️ Running Locally

### Prerequisites
- Node.js 18+
- npm

### Step 1: Server Configuration
1. Navigate to `/server`:
   ```bash
   cd server
   ```
2. Create or edit `.env` using the provided configuration variables:
   ```env
   PORT=3000
   BINANCE_API=https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
   BINANCE_API_KEY=your_key
   BINANCE_API_SECRET=your_secret
   TELEGRAM_BOT_TOKEN=your_bot_token
   ```
3. Install dependencies and start the backend:
   ```bash
   npm install
   npm start
   ```
   The backend will launch on **port 3000** and boot up the Telegram long-polling service.

### Step 2: Client Configuration
1. Navigate to `/client`:
   ```bash
   cd client
   ```
2. Install packages:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   Open your browser to `http://localhost:5173`. The UI points to the API server at `http://localhost:3000` via `baseurl.jsx`.

---

## 📖 Strategy Notes: Funding Rate Arbitrage

The system computes opportunities based on the difference between perpetual funding rates.
1. **Calculations:**
   $$\text{Spread} = \text{Rate}_{\text{Exchange A}} - \text{Rate}_{\text{Exchange B}}$$
   $$\text{Annualized APY} = \text{Spread} \times 3 \times 365 \times 100$$
2. **Confidence Classification:**
   - **HIGH:** Spread $> 0.03\%$
   - **MED:** Spread $> 0.01\%$
   - **LOW:** Spread $> 0.005\%$
   - **NONE:** Spread $\le 0.005\%$
3. **Execution Mode:**
   - Short the asset on the venue paying the higher funding rate.
   - Long the asset on the venue paying the lower funding rate.
   - Profit is accumulated every funding settlement interval (typically 8 hours).
