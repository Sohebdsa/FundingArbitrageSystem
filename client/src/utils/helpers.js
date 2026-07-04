// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtPrice(p) {
  if (!p) return "—";
  return parseFloat(p).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtRate(r) {
  if (r == null) return "—";
  const pct = parseFloat(r) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(4) + "%";
}

export function fmtCountdown(ms) {
  if (!ms) return "—";
  const diff = ms - Date.now();
  if (diff <= 0) return "Soon";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export function rateClass(r) {
  if (!r) return "";
  return parseFloat(r) >= 0 ? "positive" : "negative";
}

// ── Signal Engine ─────────────────────────────────────────────────────────────
// Funding arbitrage rule:
//   Positive funding rate → longs pay shorts → SHORT here to RECEIVE funding
//   Negative funding rate → shorts pay longs → LONG here to RECEIVE funding
//
// Cross-exchange signal:
//   Higher rate card → SHORT  (you collect from longs)
//   Lower rate card  → LONG   (you collect from shorts OR pay less)
//
// Profit per 8h = |rate| × notional
// Annual yield  = |rate| × 3 × 365

export function computeCardSignal(rate, isHigher, isBothSameCoin) {
  if (rate == null) return null;
  const r = parseFloat(rate);
  const absR = Math.abs(r);
  const annualYield = (absR * 3 * 365 * 100).toFixed(2); // % APY per position

  // Solo signal (just based on rate sign)
  const solo = r >= 0 ? "SHORT" : "LONG";
  const soloReason = r >= 0
    ? "Longs pay shorts — sell/short to collect funding"
    : "Shorts pay longs — buy/long to collect funding";

  // Cross-exchange signal (more profitable side)
  const cross = isHigher ? "SHORT" : "LONG";
  const crossReason = isHigher
    ? "Higher rate — short here, collect funding from longs"
    : "Lower rate — long here, cheaper side of the arb";

  const confidence = absR > 0.0003 ? "HIGH" : absR > 0.0001 ? "MED" : "LOW";
  const color = cross === "SHORT" ? "#ff4757" : "#00e5a0";

  return { signal: cross, solo, soloReason, crossReason, annualYield, confidence, color, rate: r, absR };
}

export function computeArbitrageSignal(funding1, funding2, coin1, coin2, exchange1, exchange2) {
  if (!funding1 || !funding2) return null;
  const r1 = parseFloat(funding1.lastFundingRate);
  const r2 = parseFloat(funding2.lastFundingRate);
  const spreadAbs = Math.abs(r1 - r2);
  const annualSpread = (spreadAbs * 3 * 365 * 100).toFixed(2);
  const per8h = (spreadAbs * 100).toFixed(6);

  // card1 action
  const action1 = r1 >= r2 ? "SHORT" : "LONG";
  const action2 = r2 >= r1 ? "SHORT" : "LONG";

  const viable = spreadAbs > 0.00005; // >0.005% spread threshold
  const confidence = spreadAbs > 0.0003 ? "HIGH" : spreadAbs > 0.0001 ? "MED" : spreadAbs > 0.00005 ? "LOW" : "NONE";

  return { action1, action2, spreadAbs, annualSpread, per8h, viable, confidence, r1, r2 };
}
