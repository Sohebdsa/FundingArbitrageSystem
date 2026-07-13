import WebSocket from 'ws';

export default function ConnectWebSocket(clientWs, coin1, coin2) {

  const socket = new WebSocket(
    `wss://fstream.binance.com/stream?streams=${coin1}usdt@trade/${coin2}usdt@trade`
  );

  // Prevent crashes on network errors or unreachable hosts
  socket.on("error", (err) => {
    console.error("[Upstream WS Error]:", err.message);
  });

  clientWs.on("error", (err) => {
    console.error("[Client WS Error]:", err.message);
  });

  socket.on("message", (msg) => {
    try {
      const response = JSON.parse(msg);
      const trade = response.data;
      if (!trade) return;

      const payload = {
        coin: trade.s.toLowerCase().replace("usdt", ""), 
        symbol: trade.s,
        price: trade.p,
        quantity: trade.q
      };

      console.log(`[Server WS] Sending → coin: "${payload.coin}" | symbol: "${payload.symbol}" | price: ${payload.price}`);

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    } catch (err) {
      console.error("[WS Message Error]:", err.message);
    }
  });

  clientWs.on("close", () => {
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    } catch (err) {
      console.error("[WS Close Error]:", err.message);
    }
  });

}

