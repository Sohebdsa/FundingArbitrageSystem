import React from "react";

export default function CoinIcon({ symbol }) {
  const abbr = symbol.slice(0, 3).toUpperCase();
  const colors = { BTC: "#f7931a", ETH: "#627eea", SOL: "#9945ff", BNB: "#f3ba2f" };
  const color = colors[abbr] || "#3d8bff";
  return (
    <div className="coin-icon" style={{ color, borderColor: `${color}40` }}>
      {abbr}
    </div>
  );
}
