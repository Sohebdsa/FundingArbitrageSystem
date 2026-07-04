import React from "react";

export default function LoadingSkeleton({ coin }) {
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
