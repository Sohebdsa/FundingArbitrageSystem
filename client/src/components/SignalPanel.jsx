import React from "react";
import { fmtRate } from "../utils/helpers";

export default function SignalPanel({ signal, coin }) {
  if (!signal) return null;
  const isBuy = signal.signal === "LONG";
  const isSell = signal.signal === "SHORT";

  const confColor = signal.confidence === "HIGH" ? "#00e5a0" : signal.confidence === "MED" ? "#f5a623" : "#3d8bff";

  return (
    <div className={`signal-panel ${isBuy ? "signal-long" : "signal-short"}`}>
      {/* Main action */}
      <div className="signal-action-block">
        <div className="signal-icon">
          {isBuy ? (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 18V4M5 10l6-6 6 6" stroke="#00e5a0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 4v14M5 12l6 6 6-6" stroke="#ff4757" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div>
          <div className="signal-action-label">Recommended Action</div>
          <div className={`signal-action-text ${isBuy ? "sig-long" : "sig-short"}`}>
            {isBuy ? "▲ LONG / BUY" : "▼ SHORT / SELL"}
          </div>
          <div className="signal-coin">{coin.toUpperCase()}USDT PERP</div>
        </div>
        <div className="signal-conf-block">
          <div className="signal-conf-label">Confidence</div>
          <div className="signal-conf-value" style={{ color: confColor }}>⬤ {signal.confidence}</div>
        </div>
      </div>

      {/* Reason + yield */}
      <div className="signal-reason">{signal.crossReason}</div>

      {/* Metrics */}
      <div className="signal-metrics">
        <div className="signal-metric">
          <div className="signal-metric-label">Est. Annual Yield</div>
          <div className="signal-metric-value" style={{ color: signal.color }}>~{signal.annualYield}% APY</div>
        </div>
        <div className="signal-metric">
          <div className="signal-metric-label">Rate per 8h</div>
          <div className={`signal-metric-value ${signal.rate >= 0 ? "sig-pos" : "sig-neg"}`}>
            {fmtRate(signal.rate)}
          </div>
        </div>
      </div>
    </div>
  );
}
