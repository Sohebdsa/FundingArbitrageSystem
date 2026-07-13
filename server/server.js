import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { WebSocketServer } from 'ws';
//library imports
import getBinanceData from './api/Binance.js';
import ConnectWebSocket from './ws/Binance-ws.js';
//file imports

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(cors());

// REST API route
app.use('/binanceApi', async (req, res) => {
  const data = await getBinanceData();
  console.log(data);
  res.json(data);
});

// ── BloFin proxy (browser can't call blofin directly due to CORS) ──
app.get('/proxy/blofin/funding', async (req, res) => {
  const { instId } = req.query;
  if (!instId) return res.status(400).json({ error: 'instId required' });
  try {
    const upstream = await fetch(
      `https://openapi.blofin.com/api/v1/market/funding-rate?instId=${encodeURIComponent(instId)}`
    );
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    console.error('[Proxy] BloFin funding error:', err.message);
    res.status(502).json({ error: 'BloFin upstream error', detail: err.message });
  }
});

// ── BloFin tickers proxy (for mark/index price) ──
app.get('/proxy/blofin/ticker', async (req, res) => {
  const { instId } = req.query;
  if (!instId) return res.status(400).json({ error: 'instId required' });
  try {
    const upstream = await fetch(
      `https://openapi.blofin.com/api/v1/market/tickers?instId=${encodeURIComponent(instId)}`
    );
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    console.error('[Proxy] BloFin ticker error:', err.message);
    res.status(502).json({ error: 'BloFin upstream error', detail: err.message });
  }
});

// ── Telegram message sender ──
app.post('/api/telegram/send', async (req, res) => {
  const { chatId, message, parseMode, silent } = req.body;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return res.status(500).json({ error: 'Telegram credentials missing', detail: 'TELEGRAM_BOT_TOKEN is not configured in the server .env file.' });
  }
  if (!chatId || !message) {
    return res.status(400).json({ error: 'chatId and message are required' });
  }

  try {
    const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode || 'HTML',
        disable_notification: !!silent,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      return res.status(502).json({ error: 'Telegram API error', detail: data.description });
    }

    res.json({ success: true, result: data.result });
  } catch (err) {
    console.error('[Telegram] Error sending message:', err.message);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server is Listening on ${port}...`);
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const coin1 = url.searchParams.get("coin1") || "btc";
  const coin2 = url.searchParams.get("coin2") || "eth";
  ConnectWebSocket(ws, coin1, coin2);
});

