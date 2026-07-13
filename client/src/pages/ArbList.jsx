import { useState, useEffect, useRef, useCallback } from "react";
import { fetchAllSpreads } from "../utils/FundingApi/allExchanges";
import { EXCHANGES } from "../utils/FundingApi/exchanges";
import ExchangeIcon from "../components/common/ExchangeIcon";

const PAGE_SIZE = 30;
const REFRESH_INTERVAL = 30_000;

const CONFIDENCE_ORDER = { HIGH: 3, MED: 2, LOW: 1, NONE: 0 };
const CONFIDENCE_COLORS = {
  HIGH: { color: "#00e5a0", bg: "rgba(0,229,160,0.12)", border: "rgba(0,229,160,0.3)" },
  MED:  { color: "#f5a623", bg: "rgba(245,166,35,0.12)", border: "rgba(245,166,35,0.3)" },
  LOW:  { color: "#3d8bff", bg: "rgba(61,139,255,0.12)", border: "rgba(61,139,255,0.3)" },
  NONE: { color: "#556070", bg: "rgba(85,96,112,0.10)", border: "rgba(85,96,112,0.2)" },
};

function fmtRate(r) {
  if (r == null) return "—";
  const pct = r * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(4) + "%";
}

function fmtSpread(abs) {
  return (abs * 100).toFixed(5) + "%";
}

function fmtApy(v) {
  return v.toFixed(2) + "%";
}

function timeSince(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

// ── Funding countdown formatter ───────────────────────────────────────────────
function fmtCountdown(ms) {
  if (!ms || ms <= 0) return "—";
  const diff = ms - Date.now();
  if (diff <= 0) return "Now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

// ── Urgency class for funding time ───────────────────────────────────────────
function fundingUrgency(ms) {
  if (!ms) return "";
  const diff = ms - Date.now();
  if (diff <= 0) return "arbl-fund-now";
  if (diff < 15 * 60_000) return "arbl-fund-urgent";  // < 15 min
  if (diff < 60 * 60_000) return "arbl-fund-soon";    // < 1 h
  return "";
}

// ── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="arbl-skeleton-row">
      {Array.from({ length: 11 }).map((_, i) => (
        <td key={i}><span className="arbl-skeleton-cell" /></td>
      ))}
    </tr>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ active, dir }) {
  return (
    <span className="arbl-sort-icon">
      <span style={{ opacity: active && dir === "asc" ? 1 : 0.25 }}>▲</span>
      <span style={{ opacity: active && dir === "desc" ? 1 : 0.25 }}>▼</span>
    </span>
  );
}

// ── Exchange badge ────────────────────────────────────────────────────────────
function ExBadge({ exchangeId }) {
  const ex = EXCHANGES[exchangeId];
  if (!ex) return <span>{exchangeId}</span>;
  return (
    <span
      className="arbl-ex-badge"
      style={{ color: ex.color, background: ex.bgColor, borderColor: ex.borderColor }}
    >
      <ExchangeIcon exchangeId={exchangeId} size={12} />
      {ex.name}
    </span>
  );
}

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfBadge({ level }) {
  const c = CONFIDENCE_COLORS[level] ?? CONFIDENCE_COLORS.NONE;
  return (
    <span
      className="arbl-conf-badge"
      style={{ color: c.color, background: c.bg, borderColor: c.border }}
    >
      {level}
    </span>
  );
}

// ── Funding time cell ─────────────────────────────────────────────────────────
function FundingTimeCell({ longNext, shortNext, tick }) {
  void tick; // forces re-render every second via parent tick
  const earliest = Math.min(longNext || Infinity, shortNext || Infinity);
  const hasData  = earliest !== Infinity && earliest > 0;

  if (!hasData) {
    return <span className="arbl-fund-time arbl-fund-na">—</span>;
  }

  const urgClass = fundingUrgency(earliest);

  return (
    <div className="arbl-fund-wrap">
      {/* Long side */}
      <div className={`arbl-fund-time ${fundingUrgency(longNext)}`}>
        <span className="arbl-fund-side-label">L</span>
        <span>{fmtCountdown(longNext)}</span>
      </div>
      {/* Short side */}
      <div className={`arbl-fund-time ${fundingUrgency(shortNext)}`}>
        <span className="arbl-fund-side-label">S</span>
        <span>{fmtCountdown(shortNext)}</span>
      </div>
    </div>
  );
}

// ── Exchange options ──────────────────────────────────────────────────────────
const EXCHANGE_OPTIONS = [
  { value: "all",     label: "All Exchanges" },
  { value: "binance", label: "Binance" },
  { value: "bybit",   label: "Bybit" },
  { value: "blofin",  label: "BloFin" },
];

// ── Pagination component ──────────────────────────────────────────────────────
function Pagination({ page, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const pages = [];
  const delta = 2;
  let left = Math.max(1, page - delta);
  let right = Math.min(totalPages, page + delta);
  if (right - left < delta * 2) {
    if (left === 1) right = Math.min(totalPages, 1 + delta * 2);
    else left = Math.max(1, totalPages - delta * 2);
  }

  if (left > 1) { pages.push(1); if (left > 2) pages.push("…"); }
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages) { if (right < totalPages - 1) pages.push("…"); pages.push(totalPages); }

  return (
    <div className="arbl-pagination">
      <button className="arbl-page-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>← Prev</button>
      {pages.map((p, i) =>
        p === "…"
          ? <span key={`ell-${i}`} className="arbl-page-ellipsis">…</span>
          : <button
              key={p}
              className={`arbl-page-btn ${page === p ? "arbl-page-active" : ""}`}
              onClick={() => onChange(p)}
            >{p}</button>
      )}
      <button className="arbl-page-btn" disabled={page === totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}

// ── Main ArbList component ────────────────────────────────────────────────────
// onOpenInScanner({ coin, longExchange, shortExchange }) — called when user
// clicks "Open in Scanner"; App.jsx handles pre-filling state + navigation.
export default function ArbList({ onOpenInScanner }) {
  const [opportunities, setOpportunities] = useState([]);
  const [meta, setMeta]                   = useState(null);
  const [loading, setLoading]             = useState(true);
  const [fetchError, setFetchError]       = useState(null);
  const [lastUpdated, setLastUpdated]     = useState(null);
  const [tick, setTick]                   = useState(0);

  // Flash state for "Open in Scanner" button feedback
  const [flashRow, setFlashRow] = useState(null);

  // Filters
  const [search,    setSearch]    = useState("");
  const [exFilter1, setExFilter1] = useState("all");
  const [exFilter2, setExFilter2] = useState("all");
  const [minSpread, setMinSpread] = useState("");
  const [minApy,    setMinApy]    = useState("");
  const [confFilter,setConfFilter]= useState("all");

  // Sort
  const [sortKey, setSortKey] = useState("spreadAbs");
  const [sortDir, setSortDir] = useState("desc");

  // Pagination
  const [page, setPage] = useState(1);

  const timerRef = useRef(null);

  // Live second ticker — drives countdown + "Xs ago"
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const { opportunities: opps, meta: m } = await fetchAllSpreads();
      setOpportunities(opps);
      setMeta(m);
      setLastUpdated(Date.now());
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-polling
  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // Reset to page 1 whenever filters/sort change
  useEffect(() => { setPage(1); }, [search, exFilter1, exFilter2, minSpread, minApy, confFilter, sortKey, sortDir]);

  // ── Open-in-scanner handler ────────────────────────────────────────────────
  const handleOpenInScanner = useCallback((opp) => {
    setFlashRow(`${opp.coin}-${opp.long.exchange}-${opp.short.exchange}`);
    setTimeout(() => setFlashRow(null), 800);
    if (onOpenInScanner) {
      onOpenInScanner({
        coin: opp.coin.toLowerCase(),
        longExchange: opp.long.exchange,
        shortExchange: opp.short.exchange,
      });
    }
  }, [onOpenInScanner]);

  // ── Derived: filtered + sorted ─────────────────────────────────────────────
  const filtered = opportunities.filter(opp => {
    if (search && !opp.coin.toLowerCase().includes(search.toLowerCase())) return false;

    const exA = opp.short.exchange;
    const exB = opp.long.exchange;

    if (exFilter1 !== "all") {
      if (exA !== exFilter1 && exB !== exFilter1) return false;
    }
    if (exFilter2 !== "all") {
      if (exA !== exFilter2 && exB !== exFilter2) return false;
      if (exFilter1 !== "all" && exFilter2 === exFilter1) return false;
    }

    if (minSpread !== "" && parseFloat(minSpread) > 0) {
      if (opp.spreadPct < parseFloat(minSpread)) return false;
    }
    if (minApy !== "" && parseFloat(minApy) > 0) {
      if (opp.annualizedApy < parseFloat(minApy)) return false;
    }
    if (confFilter !== "all" && opp.confidence !== confFilter) return false;

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va = a[sortKey];
    let vb = b[sortKey];

    if (sortKey === "confidence") {
      va = CONFIDENCE_ORDER[a.confidence] ?? 0;
      vb = CONFIDENCE_ORDER[b.confidence] ?? 0;
    } else if (sortKey === "coin") {
      return sortDir === "asc"
        ? a.coin.localeCompare(b.coin)
        : b.coin.localeCompare(a.coin);
    } else if (sortKey === "longEx") {
      return sortDir === "asc"
        ? a.long.exchange.localeCompare(b.long.exchange)
        : b.long.exchange.localeCompare(a.long.exchange);
    } else if (sortKey === "shortEx") {
      return sortDir === "asc"
        ? a.short.exchange.localeCompare(b.short.exchange)
        : b.short.exchange.localeCompare(a.short.exchange);
    } else if (sortKey === "longRate") {
      va = a.long.rate;  vb = b.long.rate;
    } else if (sortKey === "shortRate") {
      va = a.short.rate; vb = b.short.rate;
    } else if (sortKey === "nextFundingTime") {
      // Sort by nearest funding (ascending = soonest first)
      va = a.nextFundingTime || Infinity;
      vb = b.nextFundingTime || Infinity;
    }

    return sortDir === "asc" ? va - vb : vb - va;
  });

  const totalItems = sorted.length;
  const pageData   = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Stats bar ─────────────────────────────────────────────────────────────
  const viableCount = opportunities.filter(o => o.confidence !== "NONE").length;
  const bestSpread  = opportunities[0]?.spreadPct ?? 0;
  const topApy      = opportunities[0]?.annualizedApy ?? 0;

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "nextFundingTime" ? "asc" : "desc"); }
  };

  const resetFilters = () => {
    setSearch(""); setExFilter1("all"); setExFilter2("all");
    setMinSpread(""); setMinApy(""); setConfFilter("all");
    setSortKey("spreadAbs"); setSortDir("desc");
  };

  return (
    <div className="arbl-page">
      {/* ── Page header ── */}
      <div className="arbl-header">
        <div className="arbl-header-left">
          <div className="arbl-title-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <div>
            <h1 className="arbl-title">Arb List</h1>
            <div className="arbl-subtitle">Cross-exchange funding rate spread scanner</div>
          </div>
        </div>
        <div className="arbl-header-right">
          {lastUpdated && (
            <span className="arbl-last-updated">
              <span className={`arbl-live-dot ${loading ? "arbl-live-dot--pulse" : ""}`} />
              {loading ? "Refreshing…" : `Updated ${timeSince(lastUpdated)}`}
            </span>
          )}
          <button className="arbl-refresh-btn" onClick={load} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={loading ? "arbl-spin" : ""}>
              <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {loading ? "Loading…" : "Refresh Now"}
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {fetchError && (
        <div className="arbl-error-banner">
          ⚠ Partial fetch error: {fetchError}. Showing available data.
        </div>
      )}

      {/* ── Exchange status pills ── */}
      {meta && (
        <div className="arbl-exchange-status">
          {Object.entries(meta.counts).map(([ex, count]) => {
            const hasErr = !!meta.errors[ex];
            const exInfo = EXCHANGES[ex];
            return (
              <span
                key={ex}
                className={`arbl-ex-status-pill ${hasErr ? "arbl-ex-status-err" : ""}`}
                style={!hasErr ? { borderColor: exInfo?.borderColor, color: exInfo?.color } : {}}
              >
                <ExchangeIcon exchangeId={ex} size={12} />
                {exInfo?.name ?? ex}
                <span className="arbl-ex-status-count">{hasErr ? "Error" : `${count} pairs`}</span>
              </span>
            );
          })}
          <span className="arbl-ex-status-pill arbl-ex-status-total">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            {opportunities.length} spreads computed
          </span>
        </div>
      )}

      {/* ── Stats bar ── */}
      <div className="arbl-stats">
        <div className="arbl-stat">
          <div className="arbl-stat-value">{meta?.totalCoins ?? "—"}</div>
          <div className="arbl-stat-label">Symbols Scanned</div>
        </div>
        <div className="arbl-stat-div" />
        <div className="arbl-stat">
          <div className="arbl-stat-value arbl-stat-green">{viableCount}</div>
          <div className="arbl-stat-label">Viable Pairs</div>
        </div>
        <div className="arbl-stat-div" />
        <div className="arbl-stat">
          <div className="arbl-stat-value arbl-stat-green">{bestSpread.toFixed(4)}%</div>
          <div className="arbl-stat-label">Best Spread</div>
        </div>
        <div className="arbl-stat-div" />
        <div className="arbl-stat">
          <div className="arbl-stat-value arbl-stat-gold">{topApy.toFixed(1)}%</div>
          <div className="arbl-stat-label">Top APY</div>
        </div>
        <div className="arbl-stat-div" />
        <div className="arbl-stat">
          <div className="arbl-stat-value">{totalItems}</div>
          <div className="arbl-stat-label">Showing (filtered)</div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="arbl-filters">
        {/* Coin search */}
        <div className="arbl-filter-group">
          <label className="arbl-filter-label">Search Coin</label>
          <div className="arbl-filter-input-wrap">
            <svg className="arbl-filter-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              className="arbl-filter-input"
              type="text"
              placeholder="BTC, ETH, SOL…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="arbl-filter-clear-x" onClick={() => setSearch("")}>✕</button>
            )}
          </div>
        </div>

        {/* Exchange A */}
        <div className="arbl-filter-group">
          <label className="arbl-filter-label">Exchange A</label>
          <select className="arbl-filter-select" value={exFilter1} onChange={e => setExFilter1(e.target.value)}>
            {EXCHANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Exchange B */}
        <div className="arbl-filter-group">
          <label className="arbl-filter-label">Exchange B</label>
          <select className="arbl-filter-select" value={exFilter2} onChange={e => setExFilter2(e.target.value)}>
            {EXCHANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Min Spread */}
        <div className="arbl-filter-group">
          <label className="arbl-filter-label">Min Spread %</label>
          <input
            className="arbl-filter-input arbl-filter-num"
            type="number"
            min="0"
            step="0.001"
            placeholder="0.000"
            value={minSpread}
            onChange={e => setMinSpread(e.target.value)}
          />
        </div>

        {/* Min APY */}
        <div className="arbl-filter-group">
          <label className="arbl-filter-label">Min APY %</label>
          <input
            className="arbl-filter-input arbl-filter-num"
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={minApy}
            onChange={e => setMinApy(e.target.value)}
          />
        </div>

        {/* Confidence */}
        <div className="arbl-filter-group">
          <label className="arbl-filter-label">Confidence</label>
          <select className="arbl-filter-select" value={confFilter} onChange={e => setConfFilter(e.target.value)}>
            <option value="all">All Levels</option>
            <option value="HIGH">HIGH</option>
            <option value="MED">MED</option>
            <option value="LOW">LOW</option>
            <option value="NONE">NONE</option>
          </select>
        </div>

        {/* Reset */}
        <div className="arbl-filter-group arbl-filter-reset-wrap">
          <label className="arbl-filter-label">&nbsp;</label>
          <button className="arbl-reset-btn" onClick={resetFilters}>
            ↺ Reset Filters
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="arbl-table-wrap">
        <table className="arbl-table">
          <thead>
            <tr>
              <th className="arbl-th arbl-th-rank">#</th>
              <th className="arbl-th arbl-th-sortable" onClick={() => handleSort("coin")}>
                Coin <SortIcon active={sortKey === "coin"} dir={sortDir} />
              </th>
              <th className="arbl-th arbl-th-sortable" onClick={() => handleSort("longEx")}>
                Long Exchange <SortIcon active={sortKey === "longEx"} dir={sortDir} />
              </th>
              <th className="arbl-th arbl-th-sortable" onClick={() => handleSort("shortEx")}>
                Short Exchange <SortIcon active={sortKey === "shortEx"} dir={sortDir} />
              </th>
              <th className="arbl-th arbl-th-sortable" onClick={() => handleSort("longRate")}>
                Long Rate <SortIcon active={sortKey === "longRate"} dir={sortDir} />
              </th>
              <th className="arbl-th arbl-th-sortable" onClick={() => handleSort("shortRate")}>
                Short Rate <SortIcon active={sortKey === "shortRate"} dir={sortDir} />
              </th>
              <th className="arbl-th arbl-th-sortable arbl-th-spread" onClick={() => handleSort("spreadAbs")}>
                Spread <SortIcon active={sortKey === "spreadAbs"} dir={sortDir} />
              </th>
              <th className="arbl-th arbl-th-sortable" onClick={() => handleSort("annualizedApy")}>
                APY <SortIcon active={sortKey === "annualizedApy"} dir={sortDir} />
              </th>
              <th className="arbl-th arbl-th-sortable" onClick={() => handleSort("confidence")}>
                Confidence <SortIcon active={sortKey === "confidence"} dir={sortDir} />
              </th>
              <th className="arbl-th arbl-th-sortable arbl-th-funding" onClick={() => handleSort("nextFundingTime")}>
                Next Funding <SortIcon active={sortKey === "nextFundingTime"} dir={sortDir} />
              </th>
              <th className="arbl-th arbl-th-action">Open</th>
            </tr>
          </thead>

          <tbody>
            {loading && opportunities.length === 0
              ? Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonRow key={i} />)
              : pageData.length === 0
                ? (
                  <tr>
                    <td colSpan={11} className="arbl-empty">
                      <div className="arbl-empty-inner">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.35"><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>
                        <span>No matching opportunities</span>
                        <button className="arbl-reset-btn" style={{ marginTop: "8px" }} onClick={resetFilters}>Clear Filters</button>
                      </div>
                    </td>
                  </tr>
                )
                : pageData.map((opp, idx) => {
                  const globalRank = (page - 1) * PAGE_SIZE + idx + 1;
                  const longRate   = opp.long.rate;
                  const shortRate  = opp.short.rate;
                  const isHigh     = opp.confidence === "HIGH";
                  const isMed      = opp.confidence === "MED";
                  const rowKey     = `${opp.coin}-${opp.long.exchange}-${opp.short.exchange}`;
                  const isFlashing = flashRow === rowKey;

                  return (
                    <tr
                      key={rowKey}
                      className={`arbl-row ${isHigh ? "arbl-row--high" : isMed ? "arbl-row--med" : ""} ${isFlashing ? "arbl-row--flash" : ""}`}
                    >
                      <td className="arbl-td arbl-td-rank">
                        <span className="arbl-rank-num">{globalRank}</span>
                      </td>

                      <td className="arbl-td arbl-td-coin">
                        <span className="arbl-coin-name">{opp.coin}</span>
                        <span className="arbl-coin-usdt">USDT</span>
                      </td>

                      <td className="arbl-td">
                        <ExBadge exchangeId={opp.long.exchange} />
                      </td>

                      <td className="arbl-td">
                        <ExBadge exchangeId={opp.short.exchange} />
                      </td>

                      <td className="arbl-td arbl-td-rate">
                        <span className={longRate >= 0 ? "arbl-rate-pos" : "arbl-rate-neg"}>
                          {fmtRate(longRate)}
                        </span>
                      </td>

                      <td className="arbl-td arbl-td-rate">
                        <span className={shortRate >= 0 ? "arbl-rate-pos" : "arbl-rate-neg"}>
                          {fmtRate(shortRate)}
                        </span>
                      </td>

                      <td className="arbl-td arbl-td-spread">
                        <span className="arbl-spread-val">{fmtSpread(opp.spreadAbs)}</span>
                      </td>

                      <td className="arbl-td arbl-td-apy">
                        <span className="arbl-apy-val" style={{ color: isHigh ? "#00e5a0" : isMed ? "#f5a623" : "var(--text-muted)" }}>
                          {fmtApy(opp.annualizedApy)}
                        </span>
                      </td>

                      <td className="arbl-td">
                        <ConfBadge level={opp.confidence} />
                      </td>

                      {/* ── Next Funding Time ── */}
                      <td className="arbl-td arbl-td-funding">
                        <FundingTimeCell
                          longNext={opp.long.nextFundingTime}
                          shortNext={opp.short.nextFundingTime}
                          tick={tick}
                        />
                      </td>

                      {/* ── Open in Scanner ── */}
                      <td className="arbl-td arbl-td-action">
                        <button
                          className="arbl-open-btn"
                          onClick={() => handleOpenInScanner(opp)}
                          title={`Open ${opp.coin} (${opp.long.exchange} ↔ ${opp.short.exchange}) in Arb Scanner`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 3 21 3 21 9" />
                            <path d="M10 14L21 3" />
                            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                          </svg>
                          <span>Scan</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="arbl-pagination-wrap">
        <span className="arbl-pagination-info">
          {totalItems > 0
            ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalItems)} of ${totalItems}`
            : "No results"}
        </span>
        <Pagination page={page} total={totalItems} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  );
}
