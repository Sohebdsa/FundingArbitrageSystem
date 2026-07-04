import React, { useState, useEffect } from "react";
import { EXCHANGES } from "../utils/FundingApi/exchanges";
import ExchangeIcon from "./common/ExchangeIcon";
import CoinIcon from "./common/CoinIcon";
import ExchangeSelect from "./common/ExchangeSelect";
import LoadingSkeleton from "./common/LoadingSkeleton";
import SignalPanel from "./SignalPanel";
import { fmtPrice, fmtRate, fmtCountdown, rateClass } from "../utils/helpers";

export default function CryptoCard({
  coin,
  trade,
  funding,
  pairLabel,
  inputValue,
  onInputChange,
  onApply,
  exchange,
  onExchangeChange,
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
