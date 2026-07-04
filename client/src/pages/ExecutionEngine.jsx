import React, { useState, useEffect, useRef } from "react";

export default function ExecutionEngine() {
  const [botActive, setBotActive] = useState(false);
  const [slippage, setSlippage] = useState("0.05");
  const [tradeSize, setTradeSize] = useState("250");
  const [logs, setLogs] = useState([
    { time: "15:00:00", tag: "INFO", message: "Execution Engine initialized." },
    { time: "15:00:05", tag: "INFO", message: "API credentials verified for Binance and Bybit." },
    { time: "15:00:10", tag: "SUCCESS", message: "Delta-Neutral engine sync complete." }
  ]);
  const logEndRef = useRef(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  useEffect(() => {
    if (!botActive) return;

    const interval = setInterval(() => {
      const symbols = ["BTC", "ETH", "SOL", "BNB"];
      const coin = symbols[Math.floor(Math.random() * symbols.length)];
      const spread = (0.01 + Math.random() * 0.04).toFixed(4);
      
      const newLogs = [
        {
          time: new Date().toLocaleTimeString(),
          tag: "INFO",
          message: `Scanning opportunities for ${coin}... Found spread: ${spread}%`
        }
      ];

      if (parseFloat(spread) > 0.02) {
        newLogs.push({
          time: new Date().toLocaleTimeString(),
          tag: "SUCCESS",
          message: `Arb Viable! Placing orders: SHORT ${coin}USDT on Binance | LONG ${coin}USDT on Bybit. Size: $${tradeSize}`
        });
      }

      setLogs((prev) => [...prev, ...newLogs].slice(-100));
    }, 4000);

    return () => clearInterval(interval);
  }, [botActive, tradeSize]);

  const toggleBot = () => {
    const time = new Date().toLocaleTimeString();
    if (!botActive) {
      setLogs((prev) => [
        ...prev,
        { time, tag: "WARNING", message: "Automated Hedging Loop started. Monitoring rate divergences..." }
      ]);
      setBotActive(true);
    } else {
      setLogs((prev) => [
        ...prev,
        { time, tag: "INFO", message: "Automated Hedging Loop stopped. In-flight positions unaffected." }
      ]);
      setBotActive(false);
    }
  };

  const clearLogs = () => {
    setLogs([{ time: new Date().toLocaleTimeString(), tag: "INFO", message: "Logs cleared." }]);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Execution Engine</h1>
        <p className="page-description">Automate delta-neutral order execution and manage slippage settings</p>
      </div>

      <div className="premium-card calc-grid">
        <div className="premium-card-accent" />
        
        {/* Controls */}
        <div>
          <h2 className="calc-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Bot Controller
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-bright)" }}>Auto-Hedge Bot Status</span>
              <button
                className="btn-primary"
                style={{
                  background: botActive ? "var(--red)" : "var(--green)",
                  borderColor: botActive ? "var(--red)" : "var(--green)",
                  color: "#080b10",
                  fontWeight: "bold",
                  minWidth: "120px"
                }}
                onClick={toggleBot}
              >
                {botActive ? "STOP BOT" : "START BOT"}
              </button>
            </div>

            <div className="calc-input-group">
              <label className="calc-label">Execution Size (USDT per trade)</label>
              <div className="calc-input-wrapper">
                <span className="calc-prefix">$</span>
                <input
                  type="number"
                  min="10"
                  step="50"
                  value={tradeSize}
                  onChange={(e) => setTradeSize(e.target.value)}
                />
              </div>
            </div>

            <div className="calc-input-group">
              <label className="calc-label">Slippage Tolerance</label>
              <div className="calc-input-wrapper">
                <input
                  type="number"
                  min="0.01"
                  max="1.0"
                  step="0.01"
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                />
                <span className="calc-suffix">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Logs Terminal */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="calc-section-title" style={{ margin: 0, color: "var(--text-bright)" }}>
              Live Log Console
            </h2>
            <button className="btn-update btn-update-sm" onClick={clearLogs}>
              Clear
            </button>
          </div>

          <div className="logs-panel">
            {logs.map((log, index) => (
              <div key={index} className="log-line">
                <span className="log-time">[{log.time}]</span>
                <span className={`log-tag ${log.tag.toLowerCase()}`}>{log.tag}:</span>
                <span style={{ color: "var(--text-bright)" }}>{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
