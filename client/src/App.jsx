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

// ── CryptoCard ────────────────────────────────────────────────────────────────
function CryptoCard({
  coin, trade, funding, pairLabel,
  inputValue, onInputChange, onApply,
  exchange, onExchangeChange,
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
        </>
      )}
    </div>
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
      console.log(`[REST] ${exchange1}:${coin1} rate=${d1.lastFundingRate} | ${exchange2}:${coin2} rate=${d2.lastFundingRate}`);
    } catch (err) {
      console.error("[REST] Funding fetch failed:", err.message);
    }
  }, [coin1, coin2, exchange1, exchange2]);

  useEffect(() => {
    setFunding1(null);
    setFunding2(null);
    fetchFunding();
    const id = setInterval(fetchFunding, POLL_MS);
    return () => clearInterval(id);
  }, [fetchFunding]);

  // ── Funding rate spread ──
  const spread = funding1 && funding2
    ? ((parseFloat(funding1.lastFundingRate) - parseFloat(funding2.lastFundingRate)) * 100).toFixed(6)
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
        />
      </div>

      {/* Spread Bar */}
      {spread !== null && (
        <div className="spread-bar">
          <div className="spread-exchanges">
            <span className="spread-ex-tag" style={{ color: ex1.color }}>
              <ExchangeIcon exchangeId={exchange1} size={14} />
              {ex1.name}/{coin1.toUpperCase()}
            </span>
            <span className="spread-arrow">→</span>
            <span className="spread-ex-tag" style={{ color: ex2.color }}>
              <ExchangeIcon exchangeId={exchange2} size={14} />
              {ex2.name}/{coin2.toUpperCase()}
            </span>
          </div>
          <span className="spread-label">Funding Spread</span>
          <span
            className="spread-value"
            style={{ color: Math.abs(parseFloat(spread)) > 0.001 ? "var(--green)" : "var(--gold)" }}
          >
            {spread > 0 ? "+" : ""}{spread}%
          </span>
          <span className="spread-label">
            {coin1.toUpperCase()} {parseFloat(spread) >= 0 ? "pays more" : "pays less"} than {coin2.toUpperCase()}
          </span>
          <span className="spread-note">Refreshes every 5s · REST API</span>
        </div>
      )}
    </>
  );
}

export default App;
