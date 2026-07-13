import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';

const app = express();
const port = 4000;

const server = app.listen(port,()=>{
    console.log("server is listening on",port);
})

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const coin1 = url.searchParams.get("coin1") || "btc";
  const coin2 = url.searchParams.get("coin2") || "eth";
  ConnectFundingWebSocket(ws, coin1, coin2);
});

function ConnectFundingWebSocket(clientWs, coin1, coin2) {

  const socket = new WebSocket(
    `wss://fstream.binance.com/stream?streams=${coin1}usdt@markPrice@1s/${coin2}usdt@markPrice@1s`
  );

  socket.on("open", () => {
    console.log(`[Funding WS] Connected → watching ${coin1}usdt & ${coin2}usdt markPrice`);
  });

  socket.on("message", (msg) => {
    console.log("[Funding WS] RAW:", msg.toString());

    const response = JSON.parse(msg);
    const trade = response.data;

    if (!trade) {
      console.warn("[Funding WS] No data field in response:", response);
      return;
    }
    const payload = {
      coin: trade.s.toLowerCase().replace("usdt", ""),
      symbol: trade.s,
      markPrice: trade.p,
      fundingRate: trade.r,
      nextFundingTime: trade.T,
    };

    console.log(`[Funding WS] coin: "${payload.coin}" | markPrice: ${payload.markPrice} | fundingRate: ${payload.fundingRate} | nextFunding: ${new Date(payload.nextFundingTime).toISOString()}`);

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(payload));
    }
  });

  socket.on("error", (err) => {
    console.error("[Funding WS] Error:", err.message);
  });

  socket.on("close", () => {
    console.log("[Funding WS] Disconnected from Binance");
  });

  clientWs.on("close", () => socket.close());

}

ConnectFundingWebSocket({ readyState: -1, on: () => {} }, "btc", "btc");