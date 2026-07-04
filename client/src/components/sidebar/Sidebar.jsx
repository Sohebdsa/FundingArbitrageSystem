import React, { useState, useRef } from "react";
import { fmtRate } from "../../utils/helpers";
import WatchItem from "./WatchItem";

export default function Sidebar({
  open,
  onClose,
  tab,
  onTab,
  log,
  watchList,
  onWatchAdd,
  onWatchRemove,
  pollMs,
  onPollMs,
}) {
  const [watchInput, setWatchInput] = useState("");
  const contentRef = useRef(null);

  const handleWatchSubmit = (e) => {
    e.preventDefault();
    const coin = watchInput.trim().toLowerCase().replace(/usdt$/, "");
    if (coin && !watchList.includes(coin)) onWatchAdd(coin);
    setWatchInput("");
  };

  return (
    <>
      {/* Backdrop */}
      <div className={`sidebar-backdrop ${open ? "sb-visible" : ""}`} onClick={onClose} />

      {/* Panel */}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        {/* Header */}
        <div className="sidebar-hd">
          <div className="sidebar-hd-left">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="2" width="14" height="2" rx="1" fill="currentColor" opacity="0.9" />
              <rect x="1" y="7" width="10" height="2" rx="1" fill="currentColor" opacity="0.6" />
              <rect x="1" y="12" width="12" height="2" rx="1" fill="currentColor" opacity="0.4" />
            </svg>
            <span className="sidebar-title">Control Panel</span>
          </div>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close panel">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="sidebar-tabs">
          {[{ id: "log", label: "Signal Log" }, { id: "watch", label: "Watchlist" }, { id: "config", label: "Config" }].map(t => (
            <button
              key={t.id}
              className={`sidebar-tab-btn ${tab === t.id ? "sb-tab-active" : ""}`}
              onClick={() => onTab(t.id)}
            >{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="sidebar-body" ref={contentRef}>
          {/* ── LOG TAB ── */}
          {tab === "log" && (
            <div className="sb-section">
              {log.length === 0 ? (
                <div className="sb-empty">No signal data yet. Waiting for first poll…</div>
              ) : log.map((entry, i) => (
                <div key={i} className="log-entry">
                  <div className="log-entry-ts">{new Date(entry.ts).toLocaleTimeString()}</div>
                  <div className="log-entry-row">
                    <span className="log-ex" style={{ color: entry.ex1Color }}>{entry.exchange1.toUpperCase()}</span>
                    <span className="log-coin">{entry.coin1.toUpperCase()}</span>
                    <span className={`log-rate ${parseFloat(entry.rate1) >= 0 ? "pos" : "neg"}`}>{fmtRate(entry.rate1)}</span>
                  </div>
                  <div className="log-entry-row">
                    <span className="log-ex" style={{ color: entry.ex2Color }}>{entry.exchange2.toUpperCase()}</span>
                    <span className="log-coin">{entry.coin2.toUpperCase()}</span>
                    <span className={`log-rate ${parseFloat(entry.rate2) >= 0 ? "pos" : "neg"}`}>{fmtRate(entry.rate2)}</span>
                  </div>
                  <div className="log-spread">
                    Spread: <span style={{ color: Math.abs(entry.spread) > 0.0001 ? "#00e5a0" : "#f5a623" }}>{(entry.spread * 100).toFixed(6)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── WATCH TAB ── */}
          {tab === "watch" && (
            <div className="sb-section">
              <form className="watch-add-form" onSubmit={handleWatchSubmit}>
                <div className="watch-input-wrap">
                  <input
                    className="watch-input"
                    value={watchInput}
                    onChange={e => setWatchInput(e.target.value)}
                    placeholder="Add coin (e.g. sol)"
                    autoComplete="off"
                  />
                </div>
                <button type="submit" className="watch-add-btn">+ Add</button>
              </form>
              <div className="watch-list">
                {watchList.length === 0 && (
                  <div className="sb-empty">No coins in watchlist. Add one above.</div>
                )}
                {watchList.map(coin => (
                  <WatchItem key={coin} coin={coin} onRemove={onWatchRemove} />
                ))}
              </div>
            </div>
          )}

          {/* ── CONFIG TAB ── */}
          {tab === "config" && (
            <div className="sb-section">
              <div className="config-group">
                <div className="config-label">Poll Interval</div>
                <div className="config-desc">How often to refresh funding rates from exchanges</div>
                <div className="config-slider-row">
                  <input
                    className="config-slider"
                    type="range"
                    min="2000"
                    max="30000"
                    step="1000"
                    value={pollMs}
                    onChange={e => onPollMs(Number(e.target.value))}
                  />
                  <span className="config-slider-val">{(pollMs / 1000).toFixed(0)}s</span>
                </div>
                <div className="config-ticks">
                  {[2, 5, 10, 15, 30].map(s => (
                    <button key={s} className={`config-tick ${pollMs === s * 1000 ? "tick-active" : ""}`} onClick={() => onPollMs(s * 1000)}>{s}s</button>
                  ))}
                </div>
              </div>

              <div className="config-group">
                <div className="config-label">About</div>
                <div className="config-about">
                  <div className="about-row"><span>Strategy</span><span>Delta-Neutral Funding Arb</span></div>
                  <div className="about-row"><span>Exchanges</span><span>Binance · Bybit · BloFin</span></div>
                  <div className="about-row"><span>Data</span><span>REST + WebSocket</span></div>
                  <div className="about-row"><span>Funding Cycle</span><span>Every 8 hours</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}