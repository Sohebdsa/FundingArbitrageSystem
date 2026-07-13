# System Architecture & Low-Level Design: Multi-Exchange Best Spread Service

This document describes the High-Level Architecture and Low-Level Design (LLD) for the **Best Spread Finder Service**. This service continuously monitors funding rate indicators across different crypto exchanges, calculates spreads, ranks opportunities, and broadcasts them.

---

## 1. High-Level Architecture (HLD)

The service runs inside the Node.js backend. It operates on an event-driven, polling-based pipeline.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                INGESTION                                    │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────────────┐  │
│  │ Binance Adapter  │    │  Bybit Adapter   │    │    BloFin Adapter     │  │
│  └────────┬─────────┘    └────────┬─────────┘    └──────────┬────────────┘  │
└───────────┼───────────────────────┼─────────────────────────┼───────────────┘
            │                       │                         │
            └───────────────┬───────┴─────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                PROCESSING                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          Divergence Engine                            │  │
│  │  1. Match symbols across exchanges (e.g., SOLUSDT vs SOL-USDT)        │  │
│  │  2. Compute pairwise spreads: Diff = Rate(A) - Rate(B)                │  │
│  │  3. Filter by liquidity thresholds (24h volume)                       │  │
│  │  4. Sort opportunities by spread magnitude descending                 │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               DISTRIBUTION                                  │
│  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────┐  │
│  │    In-Memory Cache    │ │ WebSocket Broadcaster │ │    Alert Bridge   │  │
│  │ (REST /api/spreads)   │ │  (Real-time streams)  │ │ (Telegram alerts) │  │
│  └───────────────────────┘ └───────────────────────┘ └───────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure LLD

The service is integrated into the backend (`server`) directory structure as follows:

```
server/
├── api/
│   └── telegram.js           # Telegram dispatcher helper
├── config/
│   └── constants.js          # Shared threshold configs & API URLs
├── services/
│   ├── spread/
│   │   ├── DivergenceEngine.js  # Main pipeline manager
│   │   ├── OpportunityRanker.js # Sorting and filtering logic
│   │   └── AlertManager.js      # Cooldowns and notifications
│   └── exchanges/
│       ├── ExchangeAdapter.js   # Abstract base/interface adapter
│       ├── BinanceAdapter.js    # Binance REST/WS client
│       ├── BybitAdapter.js      # Bybit REST/WS client
│       └── BlofinAdapter.js     # BloFin REST/WS client
├── server.js                 # App server bootloader
└── .env                      # API keys and variables
```

---

## 3. Low-Level Design (LLD) Class Interfaces

### 3.1. Exchange Ingestion Layer

All exchanges must inherit from the base `ExchangeAdapter` to guarantee a unified output structure.

```javascript
// services/exchanges/ExchangeAdapter.js
export class ExchangeAdapter {
  constructor(exchangeId, baseUrl) {
    this.exchangeId = exchangeId;
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch active perpetual contracts list.
   * @returns {Promise<string[]>} List of normalized coins (e.g., ['BTC', 'ETH', 'SOL'])
   */
  async getActiveCoins() {
    throw new Error("Method 'getActiveCoins()' must be implemented.");
  }

  /**
   * Fetch current rates snapshot.
   * @returns {Promise<Map<string, FundingRateData>>} Map of coin name to funding rate metadata
   */
  async fetchFundingRates() {
    throw new Error("Method 'fetchFundingRates()' must be implemented.");
  }
}

/**
 * @typedef {Object} FundingRateData
 * @property {string} exchange - Exchange identifier (e.g. 'binance')
 * @property {string} symbol - Normalized symbol name (e.g. 'BTCUSDT')
 * @property {number} markPrice - Current mark price
 * @property {number} indexPrice - Current index price
 * @property {number} lastFundingRate - Last funding rate (expressed as decimal)
 * @property {number} nextFundingTime - Milliseconds timestamp of next funding cycle
 */
```

#### Concrete Implementation Example (BinanceAdapter):
```javascript
// services/exchanges/BinanceAdapter.js
import { ExchangeAdapter } from "./ExchangeAdapter.js";

export class BinanceAdapter extends ExchangeAdapter {
  constructor() {
    super("binance", "https://fapi.binance.com");
  }

  async fetchFundingRates() {
    try {
      const response = await fetch(`${this.baseUrl}/fapi/v1/premiumIndex`);
      const data = await response.json();
      
      const ratesMap = new Map();
      for (const item of data) {
        if (!item.symbol.endsWith("USDT")) continue;
        const coin = item.symbol.replace("USDT", "");
        
        ratesMap.set(coin, {
          exchange: this.exchangeId,
          symbol: item.symbol,
          markPrice: parseFloat(item.markPrice),
          indexPrice: parseFloat(item.indexPrice),
          lastFundingRate: parseFloat(item.lastFundingRate),
          nextFundingTime: parseInt(item.nextFundingTime)
        });
      }
      return ratesMap;
    } catch (error) {
      console.error(`[BinanceAdapter] Ingestion failure: ${error.message}`);
      return new Map();
    }
  }
}
```

---

### 3.2. Divergence Engine & Ranker

The `DivergenceEngine` acts as the coordinator. It queries the adapters in parallel, passes snapshots to the `OpportunityRanker`, and saves the results.

```javascript
// services/spread/DivergenceEngine.js
import { OpportunityRanker } from "./OpportunityRanker.js";

export class DivergenceEngine {
  /**
   * @param {ExchangeAdapter[]} adapters
   */
  constructor(adapters) {
    this.adapters = adapters;
    this.ranker = new OpportunityRanker();
    this.currentBestSpreads = [];
    this.isProcessing = false;
  }

  /**
   * Pipeline controller. Runs on cron tick.
   */
  async executeCycle() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    try {
      // 1. Fetch from all exchanges concurrently with promise wrappers
      const fetchPromises = this.adapters.map(adapter => 
        Promise.resolve(adapter.fetchFundingRates())
          .catch(err => {
            console.error(`[Engine] Fail on ${adapter.exchangeId}:`, err.message);
            return new Map();
          })
      );
      
      const results = await Promise.all(fetchPromises);
      
      // 2. Pivot data structures: Map<Coin -> Map<ExchangeId -> RateData>>
      const coinMatrix = new Map();
      
      results.forEach((ratesMap) => {
        ratesMap.forEach((rateData, coin) => {
          if (!coinMatrix.has(coin)) {
            coinMatrix.set(coin, new Map());
          }
          coinMatrix.get(coin).set(rateData.exchange, rateData);
        });
      });

      // 3. Compute and rank spreads
      this.currentBestSpreads = this.ranker.calculate(coinMatrix);
      
    } finally {
      this.isProcessing = false;
    }
  }

  getBestSpreads() {
    return this.currentBestSpreads;
  }
}
```

#### Filtering and Sorting Algorithm:
```javascript
// services/spread/OpportunityRanker.js
export class OpportunityRanker {
  constructor(options = {}) {
    this.minSpreadThreshold = options.minSpreadThreshold || 0.0001; // 0.01%
    this.minVolume24h = options.minVolume24h || 1000000;          // $1M
  }

  /**
   * @param {Map<string, Map<string, FundingRateData>>} coinMatrix 
   */
  calculate(coinMatrix) {
    const opportunities = [];

    coinMatrix.forEach((exchangeMap, coin) => {
      const exchanges = Array.from(exchangeMap.keys());
      if (exchanges.length < 2) return; // Pairwise check requires at least 2 exchanges

      // Double-loop combinations: C(n, 2)
      for (let i = 0; i < exchanges.length; i++) {
        for (let j = i + 1; j < exchanges.length; j++) {
          const exA = exchanges[i];
          const exB = exchanges[j];

          const rateA = exchangeMap.get(exA);
          const rateB = exchangeMap.get(exB);

          const rawDiff = rateA.lastFundingRate - rateB.lastFundingRate;
          const spreadAbs = Math.abs(rawDiff);

          if (spreadAbs < this.minSpreadThreshold) continue;

          // Establish direction: short the higher rate, long the lower rate
          const shortEx = rawDiff >= 0 ? exA : exB;
          const longEx = rawDiff >= 0 ? exB : exA;

          opportunities.push({
            coin,
            spreadAbs,
            annualizedApy: parseFloat((spreadAbs * 3 * 365 * 100).toFixed(2)),
            short: {
              exchange: shortEx,
              rate: exchangeMap.get(shortEx).lastFundingRate,
              price: exchangeMap.get(shortEx).markPrice
            },
            long: {
              exchange: longEx,
              rate: exchangeMap.get(longEx).lastFundingRate,
              price: exchangeMap.get(longEx).markPrice
            },
            timestamp: Date.now()
          });
        }
      }
    });

    // Sort descending by spread size
    return opportunities.sort((a, b) => b.spreadAbs - a.spreadAbs);
  }
}
```

---

### 3.3. Alert Manager & Cooldown Control

The Alert Manager prevents telegram alerts from flooding by maintaining a cooldown map.

```javascript
// services/spread/AlertManager.js
export class AlertManager {
  constructor(cooldownMinutes = 60) {
    this.cooldownDurationMs = cooldownMinutes * 60 * 1000;
    this.cooldownMap = new Map(); // Map<CoinName, LastAlertTimestamp>
  }

  /**
   * Checks status and pushes alerts to telegram if criteria met
   * @param {Object} opportunity
   */
  async processOpportunity(opportunity) {
    const { coin, annualizedApy, spreadAbs } = opportunity;
    const now = Date.now();

    // 1. Cooldown Guard
    if (this.cooldownMap.has(coin)) {
      const lastAlert = this.cooldownMap.get(coin);
      if (now - lastAlert < this.cooldownDurationMs) {
        return; // Suppressed
      }
    }

    // 2. Alert criteria trigger (e.g., > 0.02% spread)
    if (spreadAbs >= 0.0002) {
      this.cooldownMap.set(coin, now);
      await this.sendTelegramNotification(opportunity);
    }
  }

  async sendTelegramNotification(opp) {
    const text = `🚨 <b>Real-time Arbitrage Detected</b>\n\n` +
                 `Asset: <b>${opp.coin}</b>\n` +
                 `Spread: <b>${(opp.spreadAbs * 100).toFixed(4)}%</b>\n` +
                 `Annual Spread: <b>${opp.annualizedApy}% APY</b>\n\n` +
                 `- SHORT: ${opp.short.exchange.toUpperCase()} (Rate: ${(opp.short.rate * 100).toFixed(4)}%)\n` +
                 `- LONG: ${opp.long.exchange.toUpperCase()} (Rate: ${(opp.long.rate * 100).toFixed(4)}%)\n`;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "HTML"
        })
      });
    } catch (err) {
      console.error(`[AlertManager] Dispatch failed: ${err.message}`);
    }
  }
}
```

---

## 4. Cache & Memory Schema

For fast UI retrieval, data is stored in Redis under the following keys:

- **Key**: `spread:best` (Sorted Set - ZSET)
  - **Score**: `spreadAbs`
  - **Value**: JSON string containing opportunity details (Coin, exchanges, directions).
  - **TTL**: 15 seconds.
- **Key**: `rate_limit:telegram:{coin}` (String)
  - Used to handle cluster-wide cooldowns.
  - **TTL**: Cooldown minutes.
