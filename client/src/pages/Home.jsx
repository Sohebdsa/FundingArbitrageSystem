import React from "react";

export default function Home({ onNavigate }) {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Delta-Neutral Funding Arbitrage</h1>
        <p className="page-description">Welcome to the Perpetual Futures Delta-Neutral Arbitrage Hub</p>
      </div>

      <div className="premium-card">
        <div className="premium-card-accent" />
        <h2 style={{ color: "var(--text-bright)", marginBottom: "12px", fontFamily: "var(--sans)" }}>System Status Overview</h2>
        <p style={{ lineHeight: "1.6", marginBottom: "20px" }}>
          This scanner monitors perpetual futures funding rates across leading derivative exchanges: <strong>Binance</strong>, <strong>Bybit</strong>, and <strong>BloFin</strong>. 
          By taking long positions on one exchange and short positions on another with equal size, you hedge price risk (delta-neutral) and harvest the funding spread yield.
        </p>
        <div className="home-stats-grid">
          <div className="stat-card">
            <span className="stat-label">Exchanges Status</span>
            <span className="stat-value" style={{ color: "var(--green)" }}>3 / 3 Active</span>
            <span className="stat-desc">Binance, Bybit, BloFin Proxy connected.</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Websocket Gateway</span>
            <span className="stat-value" style={{ color: "var(--green)" }}>Online</span>
            <span className="stat-desc">Receiving raw tick streams for BTC/ETH.</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Poll Frequency</span>
            <span className="stat-value">5.0s</span>
            <span className="stat-desc">REST premium index query frequency.</span>
          </div>
        </div>
      </div>

      <h3 style={{ color: "var(--text-bright)", fontSize: "16px", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "12px" }}>Quick Access Modules</h3>
      <div className="home-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("arb-scanner")}>
          <span className="stat-label" style={{ color: "var(--blue)" }}>Realtime Scanner</span>
          <span className="stat-value" style={{ fontSize: "18px", marginTop: "4px" }}>Arb Scanner →</span>
          <span className="stat-desc" style={{ marginTop: "6px" }}>Compare funding indices, calculate spreads, and preview recommended buy/sell actions instantly.</span>
        </div>

        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("calculate-apy")}>
          <span className="stat-label" style={{ color: "var(--gold)" }}>Compound Simulator</span>
          <span className="stat-value" style={{ fontSize: "18px", marginTop: "4px" }}>APY Calculator →</span>
          <span className="stat-desc" style={{ marginTop: "6px" }}>Run yield forecasts and simulate profit compounding with leverage across 8h funding cycles.</span>
        </div>

        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("telegram-setting")}>
          <span className="stat-label" style={{ color: "var(--red)" }}>Alert System</span>
          <span className="stat-value" style={{ fontSize: "18px", marginTop: "4px" }}>Telegram Config →</span>
          <span className="stat-desc" style={{ marginTop: "6px" }}>Setup webhook endpoints to push high-spread opportunities directly to your mobile devices.</span>
        </div>

        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("execution-engine")}>
          <span className="stat-label" style={{ color: "var(--text-bright)" }}>Automation Desk</span>
          <span className="stat-value" style={{ fontSize: "18px", marginTop: "4px" }}>Execution Bot →</span>
          <span className="stat-desc" style={{ marginTop: "6px" }}>Initialize delta-neutral position adjustments and control live order routing settings.</span>
        </div>
      </div>
    </div>
  );
}
