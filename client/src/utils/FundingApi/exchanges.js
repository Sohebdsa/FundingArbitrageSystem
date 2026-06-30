// ── Exchange configuration & fetchers ────────────────────────────────────────

export const EXCHANGES = {
  binance: {
    id: 'binance',
    name: 'Binance',
    shortName: 'BNCE',
    color: '#f0b90b',
    bgColor: 'rgba(240,185,11,0.12)',
    borderColor: 'rgba(240,185,11,0.3)',
    // SVG path data for the Binance logo mark (diamond/rhombus)
    svgPath: `M12 2L17 7L14 10L12 8L10 10L7 7L12 2Z
              M7 7L2 12L7 17L10 14L7 11L10 8L7 7Z
              M17 7L14 10L17 13L14 16L17 17L22 12L17 7Z
              M10 14L12 16L14 14L12 12L10 14Z
              M12 22L7 17L10 14L12 16L14 14L17 17L12 22Z`,
    label: 'Binance Futures',
  },
  bybit: {
    id: 'bybit',
    name: 'Bybit',
    shortName: 'BYBT',
    color: '#f7a600',
    bgColor: 'rgba(247,166,0,0.12)',
    borderColor: 'rgba(247,166,0,0.3)',
    svgPath: `M4 6h16v2.5H4zM4 10h10v2.5H4zM4 14h13v2.5H4z`,
    label: 'Bybit Perpetuals',
  },
  blofin: {
    id: 'blofin',
    name: 'BloFin',
    shortName: 'BLOF',
    color: '#5b8def',
    bgColor: 'rgba(91,141,239,0.12)',
    borderColor: 'rgba(91,141,239,0.3)',
    svgPath: `M12 3L21 8.5V15.5L12 21L3 15.5V8.5L12 3Z`,
    label: 'BloFin Perpetuals',
  },
};

// ── Symbol normalizers ────────────────────────────────────────────────────────
// Each exchange expects a different symbol format
function toBinanceSymbol(coin) {
  return `${coin.toUpperCase()}USDT`;
}

function toBybitSymbol(coin) {
  return `${coin.toUpperCase()}USDT`;
}

function toBlofinSymbol(coin) {
  // Blofin uses {COIN}-USDT format
  return `${coin.toUpperCase()}-USDT`;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchBinanceFunding(coin) {
  const symbol = toBinanceSymbol(coin);
  const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
  const d = await res.json();
  return {
    exchange: 'binance',
    symbol: d.symbol,
    markPrice: d.markPrice,
    indexPrice: d.indexPrice,
    lastFundingRate: d.lastFundingRate,
    nextFundingTime: d.nextFundingTime,
  };
}

async function fetchBybitFunding(coin) {
  const symbol = toBybitSymbol(coin);
  // Bybit v5 tickers endpoint (no auth needed for public)
  const res = await fetch(
    `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`
  );
  if (!res.ok) throw new Error(`Bybit API error: ${res.status}`);
  const d = await res.json();
  if (d.retCode !== 0) throw new Error(`Bybit: ${d.retMsg}`);
  const t = d.result?.list?.[0];
  if (!t) throw new Error(`Bybit: no data for ${symbol}`);
  return {
    exchange: 'bybit',
    symbol: t.symbol,
    markPrice: t.markPrice,
    indexPrice: t.indexPrice,
    lastFundingRate: t.fundingRate,
    nextFundingTime: Number(t.nextFundingTime),
  };
}

async function fetchBlofinFunding(coin) {
  const instId = toBlofinSymbol(coin);
  // Route through local server proxy to bypass BloFin CORS restrictions
  const PROXY = 'http://localhost:3000';

  // Fetch funding rate via proxy
  const res = await fetch(`${PROXY}/proxy/blofin/funding?instId=${encodeURIComponent(instId)}`);
  if (!res.ok) throw new Error(`BloFin proxy error: ${res.status}`);
  const d = await res.json();
  const record = d.data?.[0];
  if (!record) throw new Error(`BloFin: no data for ${instId}`);

  // Also fetch ticker for mark/index price via proxy
  let markPrice = null;
  let indexPrice = null;
  try {
    const tickerRes = await fetch(`${PROXY}/proxy/blofin/ticker?instId=${encodeURIComponent(instId)}`);
    if (tickerRes.ok) {
      const tickerData = await tickerRes.json();
      const ticker = tickerData.data?.[0];
      if (ticker) {
        markPrice = ticker.markPrice ?? null;
        indexPrice = ticker.indexPrice ?? null;
      }
    }
  } catch { /* mark/index price is optional */ }

  return {
    exchange: 'blofin',
    symbol: record.instId,
    markPrice,
    indexPrice,
    lastFundingRate: record.fundingRate,
    nextFundingTime: Number(record.fundingTime),
  };
}

// ── Unified fetch ─────────────────────────────────────────────────────────────
export async function fetchFundingRate(exchangeId, coin) {
  switch (exchangeId) {
    case 'binance': return fetchBinanceFunding(coin);
    case 'bybit': return fetchBybitFunding(coin);
    case 'blofin': return fetchBlofinFunding(coin);
    //Case to be Added
    //1.okx
    //2.coindcx
    //3.Bitmex
    //4.Kucoin
    default: throw new Error(`Unknown exchange: ${exchangeId}`);
  }
}
