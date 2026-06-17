import WebSocket from 'ws';

export default function ConnectWebSocket(clientWs, coin1, coin2) {

  const socket = new WebSocket(
    `wss://fstream.binance.com/stream?streams=${coin1}usdt@trade/${coin2}usdt@trade`
  );

  socket.on("message", (msg) => {
    const response = JSON.parse(msg);
    const trade = response.data;
    const payload = {
      coin: trade.s.toLowerCase().replace("usdt", ""), 
      symbol: trade.s,
      price: trade.p,
      quantity: trade.q
    };

    // 🔍 LOG: shows what coin value is actually being sent to the client
    console.log(`[Server WS] Sending → coin: "${payload.coin}" | symbol: "${payload.symbol}" | price: ${payload.price}`);

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(payload));
    }

  });

  clientWs.on("close", () => socket.close());

}

