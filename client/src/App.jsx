import { useEffect, useState, useCallback, useRef } from "react";
import { wsUrl } from "./utils/baseurl";
import { EXCHANGES, fetchFundingRate } from "./utils/FundingApi/exchanges";
import "./App.css";

const POLL_MS = 5000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPrice(p) {
  if (!p) return "—";
  return parseFloat(p).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRate(r) {
  if (r == null) return "—";
  const pct = parseFloat(r) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(4) + "%";
}

function fmtCountdown(ms) {
  if (!ms) return "—";
  const diff = ms - Date.now();
  if (diff <= 0) return "Soon";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function rateClass(r) {
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

function computeCardSignal(rate, isHigher, isBothSameCoin) {
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

function computeArbitrageSignal(funding1, funding2, coin1, coin2, exchange1, exchange2) {
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

// ── ExchangeIcon ──────────────────────────────────────────────────────────────
function ExchangeIcon({ exchangeId, size = 28 }) {
  const ex = EXCHANGES[exchangeId];
  if (!ex) return null;

  // Unique geometric icons per exchange using pure SVG shapes
  const icons = {
    binance: (
      // Binance: diamond/hexagon mark
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <polygon points="16,3 28,10 28,22 16,29 4,22 4,10" fill={ex.bgColor} stroke={ex.color} strokeWidth="1.5" />
        <polygon points="16,9 21,13 16,17 11,13" fill={ex.color} opacity="0.9" />
        <polygon points="16,15 21,19 16,23 11,19" fill={ex.color} opacity="0.6" />
        <rect x="10" y="13.5" width="4" height="5" rx="1" fill={ex.color} opacity="0.5" transform="rotate(-30 12 16)" />
        <rect x="18" y="13.5" width="4" height="5" rx="1" fill={ex.color} opacity="0.5" transform="rotate(30 20 16)" />
      </svg>
    ),
    bybit: (
      // Bybit: clean bold B lettermark
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="8" fill={ex.bgColor} stroke={ex.color} strokeWidth="1.5" />
        <text x="16" y="22" textAnchor="middle" fontFamily="sans-serif" fontWeight="900" fontSize="18" fill={ex.color}>B</text>
      </svg>
    ),
    blofin: (
      // BloFin: angular crystal/gem shape
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <polygon points="16,2 30,10 30,22 16,30 2,22 2,10" fill={ex.bgColor} stroke={ex.color} strokeWidth="1.5" />
        <polygon points="16,8 24,13 24,19 16,24 8,19 8,13" fill={ex.color} opacity="0.25" />
        <line x1="16" y1="8" x2="16" y2="24" stroke={ex.color} strokeWidth="1" opacity="0.6" />
        <line x1="8" y1="13" x2="24" y2="19" stroke={ex.color} strokeWidth="1" opacity="0.4" />
        <line x1="8" y1="19" x2="24" y2="13" stroke={ex.color} strokeWidth="1" opacity="0.4" />
      </svg>
    ),
  };

  return icons[exchangeId] || null;
}

// ── CoinIcon ──────────────────────────────────────────────────────────────────
function CoinIcon({ symbol }) {
  const abbr = symbol.slice(0, 3).toUpperCase();
  const colors = { BTC: "#f7931a", ETH: "#627eea", SOL: "#9945ff", BNB: "#f3ba2f" };
  const color = colors[abbr] || "#3d8bff";
  return (
    <div className="coin-icon" style={{ color, borderColor: `${color}40` }}>
      {abbr}
    </div>
  );
}

// ── ExchangeSelect ────────────────────────────────────────────────────────────
function ExchangeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = EXCHANGES[value];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="exchange-select-wrap" ref={ref}>
      <button
        type="button"
        className="exchange-select-trigger"
        style={{ "--ex-color": current.color, "--ex-bg": current.bgColor, "--ex-border": current.borderColor }}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ExchangeIcon exchangeId={value} size={20} />
        <span className="exchange-select-name">{current.name}</span>
        <svg className={`exchange-caret ${open ? "open" : ""}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul className="exchange-dropdown" role="listbox">
          {Object.values(EXCHANGES).map((ex) => (
            <li
              key={ex.id}
              role="option"
              aria-selected={ex.id === value}
              className={`exchange-option ${ex.id === value ? "selected" : ""}`}
              style={{ "--ex-color": ex.color, "--ex-bg": ex.bgColor }}
              onClick={() => { onChange(ex.id); setOpen(false); }}
            >
              <ExchangeIcon exchangeId={ex.id} size={22} />
              <div className="exchange-option-info">
                <span className="exchange-option-name">{ex.name}</span>
                <span className="exchange-option-label">{ex.label}</span>
              </div>
              {ex.id === value && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7l4 4 6-6" stroke={ex.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── LoadingSkeleton ───────────────────────────────────────────────────────────
function LoadingSkeleton({ coin }) {
  return (
    <div className="card-loading">
      <div className="skeleton skel-label" />
      <div className="skeleton skel-price" />
      <div className="skeleton skel-row" style={{ marginTop: 8 }} />
      <div className="skeleton skel-row" />
      <p className="card-loading-text">Waiting for {coin.toUpperCase()}…</p>
    </div>
  );
}

// ── SignalPanel ───────────────────────────────────────────────────────────────
function SignalPanel({ signal, coin }) {
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
              <path d="M11 18V4M5 10l6-6 6 6" stroke="#00e5a0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 4v14M5 12l6 6 6-6" stroke="#ff4757" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
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

// ── CryptoCard ────────────────────────────────────────────────────────────────
function CryptoCard({
  coin, trade, funding, pairLabel,
  inputValue, onInputChange, onApply,
  exchange, onExchangeChange,
  signal,
}) {
  const [countdown, setCountdown] = useState("—");
  const ex = EXCHANGES[exchange];

  useEffect(() => {
    if (!funding?.nextFundingTime) return;
    const tick = () => setCountdown(fmtCountdown(funding.nextFundingTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [funding?.nextFundingTime]);

  const ready = trade && funding;

  const handleSubmit = (e) => {
    e.preventDefault();
    onApply();
  };

  return (
    <div
      className="crypto-card"
      style={{ "--card-accent": ex.color, "--card-accent-bg": ex.bgColor, "--card-accent-border": ex.borderColor }}
    >
      {/* Top accent line matches exchange color */}
      <div className="card-accent-line" style={{ background: `linear-gradient(90deg, transparent, ${ex.color}60, transparent)` }} />

      {/* Header */}
      <div className="card-header">
        <div className="coin-identity">
          <CoinIcon symbol={coin} />
          <div>
            <div className="coin-name">{coin.toUpperCase()}</div>
            <div className="coin-pair">{coin.toUpperCase()}USDT · PERP</div>
          </div>
        </div>
        <div className="header-right">
          {/* Exchange icon badge */}
          <div
            className="exchange-badge"
            style={{ background: ex.bgColor, border: `1px solid ${ex.borderColor}`, color: ex.color }}
            title={ex.label}
          >
            <ExchangeIcon exchangeId={exchange} size={16} />
            <span>{ex.name}</span>
          </div>
          <div className="live-badge">
            <span className="live-dot" />
            LIVE
          </div>
        </div>
      </div>

      {/* Exchange + Coin Selector row */}
      <form onSubmit={handleSubmit} className="card-coin-selector">
        <label className="card-pair-label">{pairLabel}</label>
        <ExchangeSelect value={exchange} onChange={onExchangeChange} />
        <div className="coin-input-wrap">
          <input
            type="text"
            value={inputValue}
            placeholder={coin}
            onChange={(e) => onInputChange(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-update btn-update-sm">Apply</button>
      </form>

      {!ready ? (
        <LoadingSkeleton coin={coin} />
      ) : (
        <>
          {/* Live Price */}
          <div className="card-price">
            <div className="price-label">Last Trade Price</div>
            <div className="price-value">
              <span className="currency">$</span>
              {fmtPrice(trade.price)}
            </div>
            <div className="price-qty">
              Qty&nbsp;<span>{parseFloat(trade.quantity).toFixed(4)}</span>
            </div>
          </div>

          {/* Funding Data */}
          <div className="card-funding">
            <div className="funding-title">
              Funding Data
              <span className="funding-source-tag" style={{ color: ex.color, background: ex.bgColor, border: `1px solid ${ex.borderColor}` }}>
                via {ex.name}
              </span>
              <span style={{ flex: 1 }} />
            </div>
            <div className="funding-grid">
              <div className="funding-item">
                <div className="funding-item-label">Mark Price</div>
                <div className="funding-item-value">
                  {funding.markPrice ? `$${fmtPrice(funding.markPrice)}` : "—"}
                </div>
              </div>
              <div className="funding-item">
                <div className="funding-item-label">Index Price</div>
                <div className="funding-item-value">
                  {funding.indexPrice ? `$${fmtPrice(funding.indexPrice)}` : "—"}
                </div>
              </div>
              <div className="funding-item">
                <div className="funding-item-label">Funding Rate</div>
                <div className={`funding-item-value ${rateClass(funding.lastFundingRate)}`}>
                  {fmtRate(funding.lastFundingRate)}
                </div>
              </div>
              <div className="funding-item">
                <div className="funding-item-label">Next Funding</div>
                <div className="funding-item-value neutral">{countdown}</div>
              </div>
            </div>
          </div>

          {/* Signal Panel */}
          <SignalPanel signal={signal} coin={coin} />
        </>
      )}
    </div>
  );
}

// ── WatchItem ─────────────────────────────────────────────────────────────────
function WatchItem({ coin, onRemove }) {
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
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ open, onClose, tab, onTab, log, watchList, onWatchAdd, onWatchRemove, pollMs, onPollMs }) {
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
              <rect x="1" y="2" width="14" height="2" rx="1" fill="currentColor" opacity="0.9"/>
              <rect x="1" y="7" width="10" height="2" rx="1" fill="currentColor" opacity="0.6"/>
              <rect x="1" y="12" width="12" height="2" rx="1" fill="currentColor" opacity="0.4"/>
            </svg>
            <span className="sidebar-title">Control Panel</span>
          </div>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close panel">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="sidebar-tabs">
          {[{id:"log",label:"Signal Log"},{id:"watch",label:"Watchlist"},{id:"config",label:"Config"}].map(t => (
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
                  {[2,5,10,15,30].map(s => (
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

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [trade1, setTrade1] = useState(null);
  const [trade2, setTrade2] = useState(null);
  const [funding1, setFunding1] = useState(null);
  const [funding2, setFunding2] = useState(null);

  const [inputCoin1, setInputCoin1] = useState("btc");
  const [inputCoin2, setInputCoin2] = useState("eth");
  const [coin1, setCoin1] = useState("btc");
  const [coin2, setCoin2] = useState("eth");

  // Per-card exchange selection
  const [exchange1, setExchange1] = useState("binance");
  const [exchange2, setExchange2] = useState("bybit");

  // ── Profit calculator state ──
  const [arbAmount, setArbAmount] = useState("100");
  const [arbLev, setArbLev] = useState("1");

  // ── Sidebar state ──
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("log");
  const [signalLog, setSignalLog] = useState([]);
  const [watchList, setWatchList] = useState(["sol", "bnb", "xrp"]);
  const [pollMsConfig, setPollMsConfig] = useState(5000);

  // ── Live price via WebSocket ──
  useEffect(() => {
    setTrade1(null);
    setTrade2(null);
    const ws = new WebSocket(`${wsUrl}?coin1=${coin1}&coin2=${coin2}`);
    ws.onopen = () => console.log(`[WS] Connected: ${coin1} & ${coin2}`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.coin === coin1) setTrade1(data);
      if (data.coin === coin2) setTrade2(data);
    };
    ws.onerror = (err) => console.error("[WS] Error:", err);
    ws.onclose = () => console.log("[WS] Disconnected");
    return () => ws.close();
  }, [coin1, coin2]);

  // ── Funding rate polling ──
  const fetchFunding = useCallback(async () => {
    try {
      const [d1, d2] = await Promise.all([
        fetchFundingRate(exchange1, coin1),
        fetchFundingRate(exchange2, coin2),
      ]);
      setFunding1(d1);
      setFunding2(d2);
      // Push to signal log
      setSignalLog(prev => [{
        ts: Date.now(),
        coin1, coin2, exchange1, exchange2,
        ex1Color: EXCHANGES[exchange1]?.color,
        ex2Color: EXCHANGES[exchange2]?.color,
        rate1: d1.lastFundingRate,
        rate2: d2.lastFundingRate,
        spread: parseFloat(d1.lastFundingRate) - parseFloat(d2.lastFundingRate),
      }, ...prev].slice(0, 100));
      console.log(`[REST] ${exchange1}:${coin1} rate=${d1.lastFundingRate} | ${exchange2}:${coin2} rate=${d2.lastFundingRate}`);
    } catch (err) {
      console.error("[REST] Funding fetch failed:", err.message);
    }
  }, [coin1, coin2, exchange1, exchange2]);

  useEffect(() => {
    setFunding1(null);
    setFunding2(null);
    fetchFunding();
    const id = setInterval(fetchFunding, pollMsConfig);
    return () => clearInterval(id);
  }, [fetchFunding, pollMsConfig]);

  // ── Funding rate spread & signals ──
  const spread = funding1 && funding2
    ? ((parseFloat(funding1.lastFundingRate) - parseFloat(funding2.lastFundingRate)) * 100).toFixed(6)
    : null;

  const arb = computeArbitrageSignal(funding1, funding2, coin1, coin2, exchange1, exchange2);

  // Per-card signals (cross-exchange aware)
  const r1 = funding1 ? parseFloat(funding1.lastFundingRate) : null;
  const r2 = funding2 ? parseFloat(funding2.lastFundingRate) : null;
  const signal1 = (r1 != null && r2 != null)
    ? computeCardSignal(r1, r1 >= r2, coin1 === coin2)
    : null;
  const signal2 = (r1 != null && r2 != null)
    ? computeCardSignal(r2, r2 > r1, coin1 === coin2)
    : null;

  const handleApply1 = () => {
    const c1 = inputCoin1.trim().toLowerCase().replace(/usdt$/, "");
    if (c1) setCoin1(c1);
  };

  const handleApply2 = () => {
    const c2 = inputCoin2.trim().toLowerCase().replace(/usdt$/, "");
    if (c2) setCoin2(c2);
  };

  const ex1 = EXCHANGES[exchange1];
  const ex2 = EXCHANGES[exchange2];

  return (
    <>
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <span className="app-logo-dot" />
          <div>
            <div className="app-title">Funding Arbitrage</div>
            <div className="app-subtitle">Perpetual Futures Monitor</div>
          </div>
        </div>
        <div className="header-exchanges-pill">
          <span className="header-exchange-chip" style={{ color: ex1.color, background: ex1.bgColor }}>
            <ExchangeIcon exchangeId={exchange1} size={14} />
            {ex1.name}
          </span>
          <span className="header-vs">vs</span>
          <span className="header-exchange-chip" style={{ color: ex2.color, background: ex2.bgColor }}>
            <ExchangeIcon exchangeId={exchange2} size={14} />
            {ex2.name}
          </span>
        </div>
        <button
          className={`sidebar-toggle-btn ${sidebarOpen ? "sb-toggle-active" : ""}`}
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Open control panel"
          title="Control Panel"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="3" width="14" height="2" rx="1" fill="currentColor"/>
            <rect x="2" y="8" width="10" height="2" rx="1" fill="currentColor" opacity="0.7"/>
            <rect x="2" y="13" width="12" height="2" rx="1" fill="currentColor" opacity="0.5"/>
          </svg>
          {signalLog.length > 0 && <span className="sb-toggle-badge">{signalLog.length > 99 ? "99+" : signalLog.length}</span>}
        </button>
      </header>

      {/* Cards */}
      <div className="cards-grid">
        <CryptoCard
          coin={coin1}
          trade={trade1}
          funding={funding1}
          pairLabel="Pair 1"
          inputValue={inputCoin1}
          onInputChange={setInputCoin1}
          onApply={handleApply1}
          exchange={exchange1}
          onExchangeChange={(ex) => { setExchange1(ex); setFunding1(null); }}
          signal={signal1}
        />
        <CryptoCard
          coin={coin2}
          trade={trade2}
          funding={funding2}
          pairLabel="Pair 2"
          inputValue={inputCoin2}
          onInputChange={setInputCoin2}
          onApply={handleApply2}
          exchange={exchange2}
          onExchangeChange={(ex) => { setExchange2(ex); setFunding2(null); }}
          signal={signal2}
        />
      </div>

      {/* Arbitrage Panel */}
      {arb && (
        <div className={`arb-panel ${arb.viable ? (arb.confidence === "HIGH" ? "arb-high" : "arb-med") : "arb-low"}`}>
          {/* Header */}
          <div className="arb-header">
            <div className="arb-title-block">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span className="arb-title">Arbitrage Signal</span>
              <span
                className="arb-conf-badge"
                style={{
                  color: arb.confidence === "HIGH" ? "#00e5a0" : arb.confidence === "MED" ? "#f5a623" : arb.confidence === "LOW" ? "#3d8bff" : "#3e5068",
                  borderColor: arb.confidence === "HIGH" ? "rgba(0,229,160,0.35)" : arb.confidence === "MED" ? "rgba(245,166,35,0.35)" : "rgba(61,139,255,0.35)",
                  background: arb.confidence === "HIGH" ? "rgba(0,229,160,0.08)" : arb.confidence === "MED" ? "rgba(245,166,35,0.08)" : "rgba(61,139,255,0.08)",
                }}
              >
                ⬤ {arb.confidence} CONFIDENCE
              </span>
            </div>
            <div className="arb-refresh">Refreshes every 5s · REST</div>
          </div>

          {/* Trade instructions */}
          <div className="arb-trades">
            {/* Card 1 trade */}
            <div className={`arb-trade ${arb.action1 === "SHORT" ? "arb-trade-short" : "arb-trade-long"}`}>
              <div className="arb-trade-exchange">
                <ExchangeIcon exchangeId={exchange1} size={18} />
                <span style={{ color: ex1.color }}>{ex1.name}</span>
              </div>
              <div className={`arb-trade-action ${arb.action1 === "SHORT" ? "act-short" : "act-long"}`}>
                {arb.action1 === "SHORT" ? "▼ SELL / SHORT" : "▲ BUY / LONG"}
              </div>
              <div className="arb-trade-coin">{coin1.toUpperCase()}USDT</div>
              <div className="arb-trade-rate">
                Rate: <span className={arb.r1 >= 0 ? "positive" : "negative"}>{fmtRate(arb.r1)}</span>
              </div>
            </div>

            {/* Spread center */}
            <div className="arb-center">
              <div className="arb-spread-arrow">⇄</div>
              <div className="arb-spread-label">Spread</div>
              <div className="arb-spread-value" style={{ color: arb.viable ? "var(--green)" : "var(--gold)" }}>
                {(arb.spreadAbs * 100).toFixed(5)}%
              </div>
              <div className="arb-spread-sub">per 8h</div>
            </div>

            {/* Card 2 trade */}
            <div className={`arb-trade ${arb.action2 === "SHORT" ? "arb-trade-short" : "arb-trade-long"}`}>
              <div className="arb-trade-exchange">
                <ExchangeIcon exchangeId={exchange2} size={18} />
                <span style={{ color: ex2.color }}>{ex2.name}</span>
              </div>
              <div className={`arb-trade-action ${arb.action2 === "SHORT" ? "act-short" : "act-long"}`}>
                {arb.action2 === "SHORT" ? "▼ SELL / SHORT" : "▲ BUY / LONG"}
              </div>
              <div className="arb-trade-coin">{coin2.toUpperCase()}USDT</div>
              <div className="arb-trade-rate">
                Rate: <span className={arb.r2 >= 0 ? "positive" : "negative"}>{fmtRate(arb.r2)}</span>
              </div>
            </div>
          </div>

          {/* Bottom metrics */}
          <div className="arb-metrics">
            <div className="arb-metric">
              <div className="arb-metric-label">Est. Annual Yield</div>
              <div className="arb-metric-value" style={{ color: arb.viable ? "var(--green)" : "var(--gold)" }}>~{arb.annualSpread}% APY</div>
            </div>
            <div className="arb-metric-div" />
            <div className="arb-metric">
              <div className="arb-metric-label">Funding Spread</div>
              <div className="arb-metric-value" style={{ color: arb.viable ? "var(--green)" : "var(--gold)" }}>
                {spread > 0 ? "+" : ""}{spread}%
              </div>
            </div>
            <div className="arb-metric-div" />
            <div className="arb-metric">
              <div className="arb-metric-label">Strategy</div>
              <div className="arb-metric-value" style={{ color: "var(--text-bright)" }}>Delta-Neutral</div>
            </div>
          </div>

          {/* ── Profit Calculator ── */}
          <div className="arb-calc">
            <div className="arb-calc-header">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M4 4h5M4 6.5h5M4 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              Profit Calculator
            </div>
            <div className="arb-calc-inputs">
              <div className="arb-calc-field">
                <label className="arb-calc-label">Capital ($)</label>
                <div className="arb-calc-input-wrap">
                  <span className="arb-calc-prefix">$</span>
                  <input
                    className="arb-calc-input"
                    type="number"
                    min="1"
                    step="10"
                    value={arbAmount}
                    onChange={e => setArbAmount(e.target.value)}
                    placeholder="100"
                  />
                </div>
              </div>
              <div className="arb-calc-times">×</div>
              <div className="arb-calc-field">
                <label className="arb-calc-label">Leverage</label>
                <div className="arb-calc-input-wrap">
                  <input
                    className="arb-calc-input"
                    type="number"
                    min="1"
                    max="125"
                    step="1"
                    value={arbLev}
                    onChange={e => setArbLev(e.target.value)}
                    placeholder="1"
                  />
                  <span className="arb-calc-suffix">x</span>
                </div>
              </div>
              <div className="arb-calc-eq">=</div>
              <div className="arb-calc-field">
                <label className="arb-calc-label">Notional</label>
                <div className="arb-calc-notional">
                  ${((parseFloat(arbAmount) || 0) * (parseFloat(arbLev) || 1)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="arb-calc-results">
              {(() => {
                const notional = (parseFloat(arbAmount) || 0) * (parseFloat(arbLev) || 1);
                const profit8h  = arb.spreadAbs * notional;
                const profitDay = profit8h * 3;
                const profitMo  = profitDay * 30;
                const profitYr  = profitDay * 365;
                const fmt = v => v < 0.01
                  ? v.toFixed(6)
                  : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                return (
                  <>
                    <div className="arb-calc-result">
                      <div className="arb-calc-result-label">Per 8h</div>
                      <div className="arb-calc-result-value arb-r-hi">~${fmt(profit8h)}</div>
                    </div>
                    <div className="arb-calc-result-div" />
                    <div className="arb-calc-result">
                      <div className="arb-calc-result-label">Per Day</div>
                      <div className="arb-calc-result-value arb-r-hi">~${fmt(profitDay)}</div>
                    </div>
                    <div className="arb-calc-result-div" />
                    <div className="arb-calc-result">
                      <div className="arb-calc-result-label">Per Month</div>
                      <div className="arb-calc-result-value arb-r-mid">~${fmt(profitMo)}</div>
                    </div>
                    <div className="arb-calc-result-div" />
                    <div className="arb-calc-result">
                      <div className="arb-calc-result-label">Per Year</div>
                      <div className="arb-calc-result-value arb-r-mid">~${fmt(profitYr)}</div>
                    </div>
                    <div className="arb-calc-result-div" />
                    <div className="arb-calc-result">
                      <div className="arb-calc-result-label">APY</div>
                      <div className="arb-calc-result-value arb-r-apy">
                        ~{notional > 0 ? ((profitYr / notional) * 100).toFixed(2) : "0.00"}%
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {!arb.viable && (
            <div className="arb-warning">
              ⚠ Spread too thin — fees may exceed profit. Wait for higher divergence.
            </div>
          )}
        </div>
      )}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        tab={sidebarTab}
        onTab={setSidebarTab}
        log={signalLog}
        watchList={watchList}
        onWatchAdd={c => setWatchList(prev => [...prev, c])}
        onWatchRemove={c => setWatchList(prev => prev.filter(x => x !== c))}
        pollMs={pollMsConfig}
        onPollMs={setPollMsConfig}
      />
    </>
  );
}

export default App;
