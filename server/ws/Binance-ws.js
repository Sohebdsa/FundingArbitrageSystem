import WebSocket from 'ws';

export default function ConnectWebSocket(clientWs, coin1, coin2) {

  const socket = new WebSocket(
    `wss://fstream.binance.com/stream?streams=${coin1}usdt@trade/${coin2}usdt@trade`
  );

  socket.on("message", (msg) => {

    const response = JSON.parse(msg);

    const trade = response.data;

    const payload = {
      coin: trade.s.toLowerCase(),
      symbol: trade.s,
      price: trade.p,
      quantity: trade.q
    };

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(payload));
    }

  });

  clientWs.on("close", () => socket.close());

}

