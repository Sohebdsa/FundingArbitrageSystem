import React, { useState } from "react";

export default function CalculateApy() {
  const [capital, setCapital] = useState("1000");
  const [leverage, setLeverage] = useState("3");
  const [rateSpread, setRateSpread] = useState("0.0250"); // spread percentage per 8h (e.g. 0.025%)

  const cap = parseFloat(capital) || 0;
  const lev = parseFloat(leverage) || 1;
  const spreadPct = parseFloat(rateSpread) || 0;

  const notional = cap * lev;
  // spread rate is in percentage, so divide by 100 to get absolute multiplier
  const spreadMultiplier = spreadPct / 100;
  const profit8h = notional * spreadMultiplier;
  const profitDay = profit8h * 3;
  const profitMo = profitDay * 30;
  const profitYr = profitDay * 365;

  const apy = cap > 0 ? (profitYr / cap) * 100 : 0;

  const fmtVal = (val) => {
    return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">APY Simulator</h1>
        <p className="page-description">Project yields and calculate leverage adjustments on delta-neutral portfolios</p>
      </div>

      <div className="premium-card calc-grid">
        <div className="premium-card-accent" />
        
        {/* Inputs */}
        <div>
          <h2 className="calc-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Parameters
          </h2>
          <form className="calc-form" onSubmit={(e) => e.preventDefault()}>
            <div className="calc-input-group">
              <label className="calc-label">Arbitrage Capital</label>
              <div className="calc-input-wrapper">
                <span className="calc-prefix">$</span>
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                />
              </div>
            </div>

            <div className="calc-input-group">
              <label className="calc-label">Execution Leverage</label>
              <div className="calc-input-wrapper">
                <input
                  type="number"
                  min="1"
                  max="125"
                  step="1"
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                />
                <span className="calc-suffix">x</span>
              </div>
            </div>

            <div className="calc-input-group">
              <label className="calc-label">Target Rate Spread (per 8h)</label>
              <div className="calc-input-wrapper">
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={rateSpread}
                  onChange={(e) => setRateSpread(e.target.value)}
                />
                <span className="calc-suffix">%</span>
              </div>
            </div>
          </form>
        </div>

        {/* Results */}
        <div style={{ background: "var(--surface2)", borderRadius: "12px", border: "1px solid var(--border)", padding: "20px" }}>
          <h2 className="calc-section-title" style={{ color: "var(--blue)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Yield Breakdown
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border)", paddingBottom: "10px" }}>
              <span style={{ fontSize: "12px", color: "var(--text)" }}>Total Notional Size</span>
              <span style={{ fontFamily: "var(--mono)", color: "var(--text-bright)", fontWeight: "bold" }}>${fmtVal(notional)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border)", paddingBottom: "10px" }}>
              <span style={{ fontSize: "12px", color: "var(--text)" }}>Estimated Per 8h</span>
              <span style={{ fontFamily: "var(--mono)", color: "var(--green)" }}>+${fmtVal(profit8h)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border)", paddingBottom: "10px" }}>
              <span style={{ fontSize: "12px", color: "var(--text)" }}>Estimated Per Day</span>
              <span style={{ fontFamily: "var(--mono)", color: "var(--green)" }}>+${fmtVal(profitDay)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border)", paddingBottom: "10px" }}>
              <span style={{ fontSize: "12px", color: "var(--text)" }}>Estimated Per Month</span>
              <span style={{ fontFamily: "var(--mono)", color: "var(--text-bright)" }}>+${fmtVal(profitMo)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border)", paddingBottom: "10px" }}>
              <span style={{ fontSize: "12px", color: "var(--text)" }}>Estimated Per Year</span>
              <span style={{ fontFamily: "var(--mono)", color: "var(--text-bright)" }}>+${fmtVal(profitYr)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "6px" }}>
              <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-bright)" }}>Projected APY</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: "18px", color: "var(--gold)", fontWeight: "bold" }}>~{apy.toFixed(2)}% APY</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
