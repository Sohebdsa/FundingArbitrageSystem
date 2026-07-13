# ArbList Page — Design & Implementation Document

## Purpose

The **ArbList** page is a new sidebar section that continuously monitors funding rates across all supported exchanges (Binance, Bybit, BloFin), computes pairwise spread opportunities for every available perpetual contract, and presents them in a ranked, filterable, paginated table. It provides a bird's-eye view of arbitrage opportunities instead of requiring the user to manually compare individual coins.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       ArbList Page                               │
│                                                                  │
│  [Filter Bar] — coin search, exchange pair, min spread, APY,     │
│               confidence, sort, reset                            │
│                                                                  │
│  [Stats Bar]  — total symbols scanned, viable pairs,             │
│                 best spread, top APY                             │
│                                                                  │
│  [Table]      — 30 rows/page, sortable columns                   │
│                 Rank | Coin | Long Ex | Short Ex |               │
│                 Long Rate | Short Rate | Spread | APY | Conf     │
│                                                                  │
│  [Pagination] — prev / page numbers / next                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
ArbList.jsx (mounts / 30s poll)
  │
  ├── fetchBinanceAll()    → https://fapi.binance.com/fapi/v1/premiumIndex
  ├── fetchBybitAll()      → https://api.bybit.com/v5/market/tickers?category=linear
  └── fetchBlofinAll()     → GET /proxy/blofin/funding-all (backend proxy)
                                       ↓
                           normalizeAll() → RateData[]
                                       ↓
                           buildSpreadOpportunities()
                           coin-matrix → pairwise spreads → sort DESC
                                       ↓
                           applyFilters() → paginate(30) → render
```

---

## Unified RateData Schema

```javascript
{
  exchange: 'binance' | 'bybit' | 'blofin',
  coin: string,           // "BTC", "ETH", "SOL"
  symbol: string,         // exchange-native symbol
  markPrice: number|null,
  lastFundingRate: number, // decimal (0.0001 = 0.01%)
  nextFundingTime: number, // ms timestamp
}
```

---

## Opportunity Schema

```javascript
{
  coin: string,
  spreadAbs: number,       // |rateA - rateB|
  annualizedApy: number,   // spreadAbs * 3 * 365 * 100
  confidence: 'HIGH'|'MED'|'LOW'|'NONE',
  long: { exchange, rate, markPrice },
  short: { exchange, rate, markPrice },
  timestamp: number,
}
```

---

## Confidence Thresholds

| Level | Spread (absolute) | Spread (%) |
|-------|-------------------|------------|
| HIGH  | > 0.0003          | > 0.03%    |
| MED   | > 0.0001          | > 0.01%    |
| LOW   | > 0.00005         | > 0.005%   |
| NONE  | ≤ 0.00005         | ≤ 0.005%   |

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `client/src/pages/ArbList.jsx` | Main ArbList page component |
| `client/src/utils/FundingApi/allExchanges.js` | Bulk fetch + spread compute utility |

### Modified Files
| File | Change |
|------|--------|
| `server/server.js` | Added `/proxy/blofin/funding-all` route |
| `client/src/components/LeftSidebar.jsx` | Added "Arb List" menu entry |
| `client/src/App.jsx` | Import + routing for ArbList |

---

## Filter Options

| Filter | Type | Default |
|--------|------|---------|
| Coin Search | Text | "" |
| Exchange A | Dropdown (All / Binance / Bybit / BloFin) | All |
| Exchange B | Dropdown (All / Binance / Bybit / BloFin) | All |
| Min Spread % | Number | 0 |
| Min APY % | Number | 0 |
| Confidence | Dropdown (All / HIGH / MED / LOW) | All |
| Sort Column | Click header | spreadAbs DESC |

---

## Pagination

- **Page size**: 30 items
- Resets to page 1 on filter change
- Controls: ← Prev · 1 2 3 … · Next →

---

## Polling

- Auto-refresh every 30 seconds
- Manual "Refresh Now" button
- Live "Last updated Xs ago" counter
- Loading skeleton state

---

## Notes

- BloFin's bulk endpoint (`/api/v1/market/funding-rate` without `instId`) is routed through the backend proxy to bypass CORS. If it returns an error or empty list, BloFin rows are gracefully skipped.
- Only coins appearing on **≥ 2 exchanges** produce spread rows.
- Bybit's ticker endpoint returns up to 1000 results per call; the implementation requests without a cursor which covers all major USDT perpetuals.
