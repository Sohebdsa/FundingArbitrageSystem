# Telegram Bot — Advanced Per-User Interactive System

## Purpose

This document describes the design and implementation of the advanced Telegram bot that replaces the existing fire-and-forget alert system. The bot is fully interactive, maintaining independent state per user, supporting commands, paginated ArbList browsing, per-coin adaptive signal subscriptions, and on-demand signal retrieval.

---

## Architecture

```
Node.js Server (server.js)
├── telegram/
│   ├── TelegramBot.js        ← polling controller + command router
│   ├── UserStateStore.js     ← per-user in-memory state
│   ├── SignalScheduler.js    ← adaptive timer engine
│   ├── SpreadFetcher.js      ← server-side funding rate fetcher
│   └── MessageTemplates.js  ← message formatting helpers
```

---

## Command Reference

| Command | Description |
|---------|-------------|
| `/on` | Enable bot signals for this chat |
| `/off` | Disable all signals + clear all subscriptions |
| `/ArbList` | Paginated top-spreads list (10 per page) |
| `/ArbList-N` | Jump to page N of ArbList |
| `/BTC` | Subscribe to BTC adaptive funding signals |
| `/ETH` (etc.) | Subscribe to any supported coin |
| `/stop BTC` | Unsubscribe from a specific coin |
| `/status` | List all active subscriptions |
| `/help` | Show command reference |

---

## Per-User State

Each chat ID gets independent state tracked in `UserStateStore`:

```javascript
{
  chatId: string,
  enabled: boolean,             // /on /off
  subscriptions: Map<coin, { longExchange, shortExchange }>,
  signalTimers: Map<coin, TimerId>,
}
```

State is in-memory — resets on server restart.

---

## Adaptive Signal Schedule

Based on countdown to next funding event:

| Time Remaining | Signal Interval |
|----------------|-----------------|
| > 30 min | Every 30 min |
| 10–30 min | Every 10 min |
| 3–10 min | Every 3 min |
| 1–3 min | Every 1 min |
| ≤ 0 | Funding fired → reset cycle |

Each signal fires, fetches fresh data, and reschedules itself with the correct next interval.

---

## ArbList Pagination

- **10 rows per page**, sorted by spread descending
- Inline keyboard navigation: `◀ Prev` / `Next ▶` / `🔄 Refresh`
- Each row has a tap-to-subscribe button: `📌 Subscribe BTC`
- Command aliases: `/ArbList-1`, `/ArbList-2`, etc.

---

## Signal Message Format

```
🚨 Funding Signal — BTC

📈 Spread:   +0.00421%
💰 APY:      4.62% annualized
⏱ Funding:  7h 23m (Long Exchange)
             2h 55m (Short Exchange)

🟢 LONG:   Bybit     rate: -0.0010%
🔴 SHORT:  Binance   rate: +0.0032%

Next signal in: 30 min
```

Inline buttons:
- `📡 Get Signal Now` — on-demand immediate refresh
- `❌ Stop BTC` — unsubscribe

---

## Implementation Notes

- Uses **long-polling** (`getUpdates`) — no webhook/SSL required for local server
- `TelegramBot.startPolling()` is called once at server startup
- The existing `/api/telegram/send` REST route is preserved unchanged
- `SpreadFetcher.js` is a Node.js port of `client/src/utils/FundingApi/allExchanges.js`
- BloFin data still flows through the local proxy endpoints
