import { useEffect, useState, useCallback, useRef } from "react";
import { wsUrl } from "./utils/baseurl";
import { EXCHANGES, fetchFundingRate } from "./utils/FundingApi/exchanges";
import "./App.css";

import {
  fmtRate,
  fmtCountdown,
  computeCardSignal,
  computeArbitrageSignal,
} from "./utils/helpers";
import ExchangeIcon from "./components/common/ExchangeIcon";
import CryptoCard from "./components/CryptoCard";
import Sidebar from "./components/sidebar/Sidebar";
import LeftSidebar from "./components/LeftSidebar";
import Home from "./pages/Home";
import CalculateApy from "./pages/CalculateApy";
import TelegramSetting from "./pages/TelegramSetting";
import ExecutionEngine from "./pages/ExecutionEngine";

const POLL_MS = 5000;

function App() {
  const [currentPage, setCurrentPage] = useState("home");
  const [mobileOpen, setMobileOpen] = useState(false);

  const [trade1, setTrade1] = useState(null);
  const [trade2, setTrade2] = useState(null);
  const [funding1, setFunding1] = useState(null);
  const [funding2, setFunding2] = useState(null);

  const [inputCoin1, setInputCoin1] = useState("btc");
  const [inputCoin2, setInputCoin2] = useState("btc");
  const [coin1, setCoin1] = useState("btc");
  const [coin2, setCoin2] = useState("btc");

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

  // ── Auto Telegram Alerting ──
  const lastAlertTimeRef = useRef(0);

  useEffect(() => {
    if (!arb) return;

    const chatId = localStorage.getItem("tg_chat_id");
    const threshold = parseFloat(localStorage.getItem("tg_threshold") || "0.0150");
    const cooldownMin = parseFloat(localStorage.getItem("tg_cooldown") || "60");
    const onlyHigh = localStorage.getItem("tg_only_high_conf") === "true";
    const silent = localStorage.getItem("tg_silent_mode") === "true";
    const parseMode = localStorage.getItem("tg_parse_mode") || "HTML";
    const template = localStorage.getItem("tg_custom_template");

    if (!chatId || !template) return;

    // Check if cooldown has elapsed
    const now = Date.now();
    const cooldownMs = cooldownMin * 60 * 1000;
    if (now - lastAlertTimeRef.current < cooldownMs) return;

    // Check if spread (in percentage) exceeds threshold
    const spreadPct = arb.spreadAbs * 100;
    if (spreadPct < threshold) return;

    // Check high confidence condition if enabled
    if (onlyHigh && arb.confidence !== "HIGH") return;

    // We have a match! Send notification
    lastAlertTimeRef.current = now;

    // Format template message
    const notional = (parseFloat(arbAmount) || 0) * (parseFloat(arbLev) || 1);
    const profit8h = arb.spreadAbs * notional;
    const profitYr = profit8h * 3 * 365;
    const projectedApy = notional > 0 ? ((profitYr / notional) * 100).toFixed(2) : "0.00";

    const formatRateVal = (r) => {
      const pct = parseFloat(r) * 100;
      return (pct >= 0 ? "+" : "") + pct.toFixed(4) + "%";
    };

    const buyEx = arb.action1 === "LONG" ? EXCHANGES[exchange1].name : EXCHANGES[exchange2].name;
    const sellEx = arb.action1 === "SHORT" ? EXCHANGES[exchange1].name : EXCHANGES[exchange2].name;
    const nextTime = funding1?.nextFundingTime || funding2?.nextFundingTime;
    const timeLeft = nextTime ? fmtCountdown(nextTime) : "—";

    let message = template
      .replace(/{coin}/g, coin1.toUpperCase())
      .replace(/{spread}/g, spreadPct.toFixed(5))
      .replace(/{buy_exchange}/g, `🟢 <b>${buyEx}</b>`)
      .replace(/{buy_rate}/g, arb.action1 === "LONG" ? formatRateVal(arb.r1) : formatRateVal(arb.r2))
      .replace(/{sell_exchange}/g, `🔴 <b>${sellEx}</b>`)
      .replace(/{sell_rate}/g, arb.action1 === "SHORT" ? formatRateVal(arb.r1) : formatRateVal(arb.r2))
      .replace(/{time_left}/g, timeLeft)
      .replace(/{apy}/g, projectedApy);

    message = `🚨 <b>REALTIME ARB DETECTED</b>\n\n${message}`;

    const dispatchAlert = async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/telegram/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            message,
            parseMode,
            silent
          })
        });
        const data = await res.json();
        const timestamp = new Date().toLocaleTimeString();
        let savedLogs = JSON.parse(localStorage.getItem("tg_alert_logs") || "[]");
        if (res.ok && data.success) {
          console.log("[Telegram Alert] Dispatched successfully.");
          savedLogs = [{ time: timestamp, status: "SUCCESS", details: `Auto-alert sent for ${coin1.toUpperCase()} spread: ${spreadPct.toFixed(5)}%` }, ...savedLogs].slice(0, 50);
        } else {
          console.error("[Telegram Alert] Failed to dispatch:", data.detail);
          savedLogs = [{ time: timestamp, status: "ERROR", details: `Auto-alert failed: ${data.detail || "Upstream reject"}` }, ...savedLogs].slice(0, 50);
        }
        localStorage.setItem("tg_alert_logs", JSON.stringify(savedLogs));
      } catch (err) {
        console.error("[Telegram Alert] Fetch error:", err.message);
      }
    };

    dispatchAlert();
  }, [arb, coin1, exchange1, exchange2, arbAmount, arbLev]);

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
    <div className="app-layout">
      <LeftSidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <div className="main-content-wrapper">
        {/* Mobile Header */}
        <div className="mobile-nav-header">
          <button className="mobile-hamburger" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="mobile-brand-name">ArbScanner</span>
          <div style={{ width: "40px" }} /> {/* Spacer */}
        </div>

        {/* Dynamic Pages */}
        {currentPage === "home" && <Home onNavigate={setCurrentPage} />}

        {currentPage === "arb-scanner" && (
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
                  <rect x="2" y="3" width="14" height="2" rx="1" fill="currentColor" />
                  <rect x="2" y="8" width="10" height="2" rx="1" fill="currentColor" opacity="0.7" />
                  <rect x="2" y="13" width="12" height="2" rx="1" fill="currentColor" opacity="0.5" />
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
                      <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M4 4h5M4 6.5h5M4 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
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
                        <span className="calc-suffix">x</span>
                      </div>
                    </div>
                    <div className="arb-calc-eq">=</div>
                    <div className="arb-calc-field">
                      <label className="calc-label">Notional</label>
                      <div className="arb-calc-notional">
                        ${((parseFloat(arbAmount) || 0) * (parseFloat(arbLev) || 1)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {/* Results */}
                  <div className="arb-calc-results">
                    {(() => {
                      const notional = (parseFloat(arbAmount) || 0) * (parseFloat(arbLev) || 1);
                      const profit8h = arb.spreadAbs * notional;
                      const profitDay = profit8h * 3;
                      const profitMo = profitDay * 30;
                      const profitYr = profitDay * 365;
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
        )}

        {currentPage === "calculate-apy" && <CalculateApy />}
        {currentPage === "telegram-setting" && <TelegramSetting />}
        {currentPage === "execution-engine" && <ExecutionEngine />}
      </div>
    </div>
  );
}

export default App;
