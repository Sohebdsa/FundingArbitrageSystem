import React from "react";
import { EXCHANGES } from "../../utils/FundingApi/exchanges";

export default function ExchangeIcon({ exchangeId, size = 28 }) {
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
      // BloFin: crystal/gem shape
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
