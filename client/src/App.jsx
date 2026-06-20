import { useEffect, useState, useCallback } from "react";
import { wsUrl } from "./utils/baseurl";
import "./App.css";

const FUNDING_API = "https://fapi.binance.com/fapi/v1/premiumIndex";
const POLL_MS = 5000;

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── CoinIcon ─────────────────────────────────────────────────────────────────
function CoinIcon({ symbol }) {
  const abbr = symbol.slice(0, 3).toUpperCase();
  const colors = { BTC: "#f7931a", ETH: "#627eea", SOL: "#9945ff", BNB: "#f3ba2f" };
  const color = colors[abbr] || "#3d8bff";
  return (
    <div className="coin-icon" style={{ color }}>
      {abbr}
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
function CryptoCard({ coin, trade, funding, pairLabel, inputValue, onInputChange, onApply }) {
  const [countdown, setCountdown] = useState("—");

  // Live countdown ticker
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
    <div className="crypto-card">
      {/* Header */}
      <div className="card-header">
        <div className="coin-identity">
          <CoinIcon symbol={coin} />
          <div>
            <div className="coin-name">{coin.toUpperCase()}</div>
            <div className="coin-pair">{coin.toUpperCase()}USDT · PERP</div>
          </div>
        </div>
        <div className="live-badge">
          <span className="live-dot" />
          LIVE
        </div>
      </div>

      {/* Coin Selector inside card */}
      <form onSubmit={handleSubmit} className="card-coin-selector">
        <label className="card-pair-label">{pairLabel}</label>
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
            <div className="funding-title">Funding Data</div>
            <div className="funding-grid">
              <div className="funding-item">
                <div className="funding-item-label">Mark Price</div>
                <div className="funding-item-value">
                  ${fmtPrice(funding.markPrice)}
                </div>
              </div>
              <div className="funding-item">
                <div className="funding-item-label">Index Price</div>
                <div className="funding-item-value">
                  ${fmtPrice(funding.indexPrice)}
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

  // ── Funding rate via REST polling ──
  const fetchFunding = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch(`${FUNDING_API}?symbol=${coin1.toUpperCase()}USDT`),
        fetch(`${FUNDING_API}?symbol=${coin2.toUpperCase()}USDT`),
      ]);
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
      setFunding1(d1);
      setFunding2(d2);
      console.log(`[REST] Funding updated: ${coin1} rate=${d1.lastFundingRate} | ${coin2} rate=${d2.lastFundingRate}`);
    } catch (err) {
      console.error("[REST] Funding fetch failed:", err.message);
    }
  }, [coin1, coin2]);

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
        <div className="header-badge">Binance Futures</div>
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
        />
        <CryptoCard
          coin={coin2}
          trade={trade2}
          funding={funding2}
          pairLabel="Pair 2"
          inputValue={inputCoin2}
          onInputChange={setInputCoin2}
          onApply={handleApply2}
        />
      </div>

      {/* Spread Bar */}
      {spread !== null && (
        <div className="spread-bar">
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
