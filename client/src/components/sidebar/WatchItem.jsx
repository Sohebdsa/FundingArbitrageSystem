import React, { useState, useEffect } from "react";
import { fmtRate } from "../../utils/helpers";

export default function WatchItem({ coin, onRemove }) {
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const loadRate = async () => {
      try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${coin.toUpperCase()}USDT`);
        const d = await res.json();
        if (alive) { setRate(d.lastFundingRate); setLoading(false); }
      } catch { if (alive) setLoading(false); }
    };
    loadRate();
    const id = setInterval(loadRate, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [coin]);

  const r = rate != null ? parseFloat(rate) : null;
  return (
    <div className="watch-item">
      <div className="watch-coin">{coin.toUpperCase()}</div>
      <div className="watch-pair">USDT · Binance</div>
      {loading ? (
        <div className="watch-rate dim">…</div>
      ) : r == null ? (
        <div className="watch-rate dim">N/A</div>
      ) : (
        <div className={`watch-rate ${r >= 0 ? "pos" : "neg"}`}>{fmtRate(r)}</div>
      )}
      <button className="watch-remove" onClick={() => onRemove(coin)} title="Remove">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
