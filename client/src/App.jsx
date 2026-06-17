import { useEffect, useState } from "react";
// import attachHandlers from "./utils/ws/websocket";
import { wsUrl } from "./utils/baseurl";

function App() {
  const [trade1, setTrade1] = useState(null);
  const [trade2, setTrade2] = useState(null);

  const [coin1, setCoin1] = useState("btc");
  const [coin2, setCoin2] = useState("eth");

  useEffect(() => {
    const ws = new WebSocket(
      `${wsUrl}?coin1=${coin1}&coin2=${coin2}`
    );

    ws.onopen = () => {
      console.log(`[Client WS] Connected | watching coin1="${coin1}" coin2="${coin2}"`);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // 🔍 LOG: confirm coin matching works
      console.log(
        `[Client WS] Received → coin: "${data.coin}" | coin1: "${coin1}" | coin2: "${coin2}"`,
        `| match1: ${data.coin === coin1} | match2: ${data.coin === coin2}`
      );

      if (data.coin === coin1) {
        setTrade1(data);
      }
      if (data.coin === coin2) {
        setTrade2(data);
      }
    };

    ws.onerror = (err) => console.error("[Client WS] Error:", err);
    ws.onclose = () => console.log("[Client WS] Disconnected");

    return () => ws.close();
  }, [coin1, coin2]);

  const handleSubmit = (e) => e.preventDefault();

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "20px" }}>
      <h1 style={{ textAlign: "center" }}>Live Crypto Prices</h1>

      {/* Coin 1 Input */}
      <form onSubmit={handleSubmit} style={{ marginBottom: "15px" }}>
        <label style={{ marginRight: "10px" }}>Coin 1:</label>
        <input
          className="Crypto-Input"
          type="text"
          value={coin1}
          placeholder="Enter first coin..."
          onChange={(e) => setCoin1(e.target.value)}
        />
        <button type="submit">Update</button>
      </form>

      {/* Coin 2 Input */}
      <form onSubmit={handleSubmit} style={{ marginBottom: "15px" }}>
        <label style={{ marginRight: "10px" }}>Coin 2:</label>
        <input
          className="Crypto-Input"
          type="text"
          value={coin2}
          placeholder="Enter second coin..."
          onChange={(e) => setCoin2(e.target.value)}
        />
        <button type="submit">Update</button>
      </form>

      {/* Trade 1 Display */}
      {trade1 && (
        <div style={{ marginBottom: "20px", borderBottom: "1px solid #ccc" }}>
          <h2>{trade1.symbol}</h2>
          <h3>${trade1.price}</h3>
          <p>Qty: {trade1.quantity}</p>
        </div>
      )}

      {/* Trade 2 Display */}
      {trade2 && (
        <div style={{ marginBottom: "20px", borderBottom: "1px solid #ccc" }}>
          <h2>{trade2.symbol}</h2>
          <h3>${trade2.price}</h3>
          <p>Qty: {trade2.quantity}</p>
        </div>
      )}
    </div>
  );
}

export default App;
