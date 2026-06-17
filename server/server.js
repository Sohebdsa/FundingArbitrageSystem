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
