// ── All-Exchange Bulk Funding Fetcher & Spread Computer ─────────────────────
// Used by the ArbList page to build a complete cross-exchange spread table.

const PROXY = 'http://localhost:3000';

// ── Symbol Normalizers ───────────────────────────────────────────────────────

function coinFromBinanceSymbol(symbol) {
  // "BTCUSDT" → "BTC"
  if (symbol.endsWith('USDT')) return symbol.slice(0, -4);
  if (symbol.endsWith('BUSD')) return symbol.slice(0, -4);
  return null;
}

function coinFromBybitSymbol(symbol) {
  // "BTCUSDT" → "BTC"  (Bybit linear USDT perpetuals)
  if (symbol.endsWith('USDT')) return symbol.slice(0, -4);
  return null;
}

function coinFromBlofinSymbol(instId) {
  // "BTC-USDT" → "BTC"
  if (instId.endsWith('-USDT')) return instId.slice(0, -5);
  return null;
}

// ── Exchange Fetchers ────────────────────────────────────────────────────────

/**
 * Fetches ALL Binance USDT perpetual funding rates in a single call.
 * Endpoint returns an array when no `symbol` param is provided.
 * @returns {Promise<RateData[]>}
 */
export async function fetchBinanceAll() {
  const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
  if (!res.ok) throw new Error(`Binance bulk fetch failed: ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [data];

  return arr.reduce((acc, item) => {
    const coin = coinFromBinanceSymbol(item.symbol);
    if (!coin) return acc;
    acc.push({
      exchange: 'binance',
      coin,
      symbol: item.symbol,
      markPrice: parseFloat(item.markPrice) || null,
      indexPrice: parseFloat(item.indexPrice) || null,
      lastFundingRate: parseFloat(item.lastFundingRate) || 0,
      nextFundingTime: parseInt(item.nextFundingTime) || 0,
    });
    return acc;
  }, []);
}

/**
 * Fetches ALL Bybit USDT linear perpetual tickers.
 * The endpoint returns up to 1000 results without pagination cursor.
 * @returns {Promise<RateData[]>}
 */
export async function fetchBybitAll() {
  const res = await fetch(
    'https://api.bybit.com/v5/market/tickers?category=linear'
  );
  if (!res.ok) throw new Error(`Bybit bulk fetch failed: ${res.status}`);
  const d = await res.json();
  if (d.retCode !== 0) throw new Error(`Bybit: ${d.retMsg}`);
  const list = d.result?.list ?? [];

  return list.reduce((acc, item) => {
    const coin = coinFromBybitSymbol(item.symbol);
    if (!coin) return acc;
    const rate = parseFloat(item.fundingRate);
    if (isNaN(rate)) return acc; // skip non-perpetual instruments
    acc.push({
      exchange: 'bybit',
      coin,
      symbol: item.symbol,
      markPrice: parseFloat(item.markPrice) || null,
      indexPrice: parseFloat(item.indexPrice) || null,
      lastFundingRate: rate,
      nextFundingTime: parseInt(item.nextFundingTime) || 0,
    });
    return acc;
  }, []);
}

/**
 * Fetches ALL BloFin USDT perpetual funding rates via backend proxy.
 * BloFin has CORS restrictions so we must route through our Express server.
 * @returns {Promise<RateData[]>}
 */
export async function fetchBlofinAll() {
  const res = await fetch(`${PROXY}/proxy/blofin/funding-all`);
  if (!res.ok) throw new Error(`BloFin bulk fetch failed: ${res.status}`);
  const d = await res.json();
  const list = d.data ?? [];
  if (!Array.isArray(list) || list.length === 0) return [];

  return list.reduce((acc, item) => {
    const instId = item.instId;
    if (!instId) return acc;
    const coin = coinFromBlofinSymbol(instId);
    if (!coin) return acc;
    const rate = parseFloat(item.fundingRate);
    if (isNaN(rate)) return acc;
    acc.push({
      exchange: 'blofin',
      coin,
      symbol: instId,
      markPrice: null,  // BloFin bulk doesn't include mark price
      indexPrice: null,
      lastFundingRate: rate,
      nextFundingTime: parseInt(item.fundingTime) || 0,
    });
    return acc;
  }, []);
}

// ── Spread Computation Engine ────────────────────────────────────────────────

/**
 * Builds a coin-matrix from multiple exchange rate arrays,
 * computes all pairwise spreads, and returns ranked opportunities.
 *
 * @param {Object} ratesByExchange  { binance: RateData[], bybit: RateData[], blofin: RateData[] }
 * @param {Object} opts
 * @param {number} opts.minSpreadThreshold  minimum spreadAbs to include (default: 0)
 * @returns {Opportunity[]} sorted descending by spreadAbs
 */
export function buildSpreadOpportunities(ratesByExchange, opts = {}) {
  const { minSpreadThreshold = 0 } = opts;

  // Build coin → exchange → RateData map
  const coinMatrix = new Map();

  Object.entries(ratesByExchange).forEach(([, rates]) => {
    rates.forEach((rd) => {
      if (!coinMatrix.has(rd.coin)) coinMatrix.set(rd.coin, new Map());
      coinMatrix.get(rd.coin).set(rd.exchange, rd);
    });
  });

  const opportunities = [];

  coinMatrix.forEach((exchangeMap, coin) => {
    const exchangeIds = Array.from(exchangeMap.keys());
    if (exchangeIds.length < 2) return; // need at least 2 exchanges

    // C(n, 2) pairwise combinations
    for (let i = 0; i < exchangeIds.length; i++) {
      for (let j = i + 1; j < exchangeIds.length; j++) {
        const exA = exchangeIds[i];
        const exB = exchangeIds[j];
        const rdA = exchangeMap.get(exA);
        const rdB = exchangeMap.get(exB);

        const rawDiff = rdA.lastFundingRate - rdB.lastFundingRate;
        const spreadAbs = Math.abs(rawDiff);

        if (spreadAbs < minSpreadThreshold) continue;

        // Direction: short the higher-rate exchange, long the lower-rate
        const shortRD = rawDiff >= 0 ? rdA : rdB;
        const longRD  = rawDiff >= 0 ? rdB : rdA;

        const annualizedApy = parseFloat((spreadAbs * 3 * 365 * 100).toFixed(2));
        const confidence =
          spreadAbs > 0.0003 ? 'HIGH' :
          spreadAbs > 0.0001 ? 'MED'  :
          spreadAbs > 0.00005 ? 'LOW' : 'NONE';

        opportunities.push({
          coin,
          spreadAbs,
          spreadPct: spreadAbs * 100,
          annualizedApy,
          confidence,
          short: {
            exchange: shortRD.exchange,
            rate: shortRD.lastFundingRate,
            markPrice: shortRD.markPrice,
            symbol: shortRD.symbol,
            nextFundingTime: shortRD.nextFundingTime,
          },
          long: {
            exchange: longRD.exchange,
            rate: longRD.lastFundingRate,
            markPrice: longRD.markPrice,
            symbol: longRD.symbol,
            nextFundingTime: longRD.nextFundingTime,
          },
          // Earliest funding event of the pair
          nextFundingTime: Math.min(
            shortRD.nextFundingTime || Infinity,
            longRD.nextFundingTime || Infinity
          ) || 0,
          timestamp: Date.now(),
        });
      }
    }
  });

  // Sort descending by spreadAbs
  return opportunities.sort((a, b) => b.spreadAbs - a.spreadAbs);
}

// ── Master Fetch (called by ArbList page) ────────────────────────────────────

/**
 * Fetches all exchange data concurrently, normalizes, and computes spreads.
 * Gracefully degrades — if one exchange fails, others still contribute.
 *
 * @returns {Promise<{ opportunities: Opportunity[], meta: FetchMeta }>}
 */
export async function fetchAllSpreads() {
  const results = await Promise.allSettled([
    fetchBinanceAll(),
    fetchBybitAll(),
    fetchBlofinAll(),
  ]);

  const [binanceResult, bybitResult, blofinResult] = results;

  const ratesByExchange = {};
  const errors = {};
  const counts = {};

  if (binanceResult.status === 'fulfilled') {
    ratesByExchange.binance = binanceResult.value;
    counts.binance = binanceResult.value.length;
  } else {
    errors.binance = binanceResult.reason?.message ?? 'Unknown error';
    ratesByExchange.binance = [];
    counts.binance = 0;
  }

  if (bybitResult.status === 'fulfilled') {
    ratesByExchange.bybit = bybitResult.value;
    counts.bybit = bybitResult.value.length;
  } else {
    errors.bybit = bybitResult.reason?.message ?? 'Unknown error';
    ratesByExchange.bybit = [];
    counts.bybit = 0;
  }

  if (blofinResult.status === 'fulfilled') {
    ratesByExchange.blofin = blofinResult.value;
    counts.blofin = blofinResult.value.length;
  } else {
    errors.blofin = blofinResult.reason?.message ?? 'Unknown error';
    ratesByExchange.blofin = [];
    counts.blofin = 0;
  }

  const opportunities = buildSpreadOpportunities(ratesByExchange);

  return {
    opportunities,
    meta: {
      fetchedAt: Date.now(),
      counts,
      errors,
      totalCoins: Object.values(ratesByExchange).reduce((s, arr) => s + arr.length, 0),
    },
  };
}
