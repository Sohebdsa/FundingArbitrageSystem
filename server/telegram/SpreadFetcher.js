// ── SpreadFetcher.js ─────────────────────────────────────────────────────────
// Server-side port of client/src/utils/FundingApi/allExchanges.js
// Runs in Node.js context (native fetch available in Node 18+).
// BloFin is fetched via the local proxy routes (same server, port 3000).

const PROXY_BASE = 'http://localhost:3000';

// ── Symbol normalizers ────────────────────────────────────────────────────────

function coinFromBinanceSymbol(symbol) {
  if (symbol.endsWith('USDT')) return symbol.slice(0, -4);
  return null;
}

function coinFromBybitSymbol(symbol) {
  if (symbol.endsWith('USDT')) return symbol.slice(0, -4);
  return null;
}

function coinFromBlofinSymbol(instId) {
  if (instId.endsWith('-USDT')) return instId.slice(0, -5);
  return null;
}

// ── Individual exchange fetchers ──────────────────────────────────────────────

async function fetchBinanceAll() {
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
      lastFundingRate: parseFloat(item.lastFundingRate) || 0,
      nextFundingTime: parseInt(item.nextFundingTime) || 0,
    });
    return acc;
  }, []);
}

async function fetchBybitAll() {
  const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear');
  if (!res.ok) throw new Error(`Bybit bulk fetch failed: ${res.status}`);
  const d = await res.json();
  if (d.retCode !== 0) throw new Error(`Bybit: ${d.retMsg}`);
  const list = d.result?.list ?? [];

  return list.reduce((acc, item) => {
    const coin = coinFromBybitSymbol(item.symbol);
    if (!coin) return acc;
    const rate = parseFloat(item.fundingRate);
    if (isNaN(rate)) return acc;
    acc.push({
      exchange: 'bybit',
      coin,
      symbol: item.symbol,
      markPrice: parseFloat(item.markPrice) || null,
      lastFundingRate: rate,
      nextFundingTime: parseInt(item.nextFundingTime) || 0,
    });
    return acc;
  }, []);
}

async function fetchBlofinAll() {
  // Routes through the local proxy to avoid BloFin CORS (same server)
  const res = await fetch(`${PROXY_BASE}/proxy/blofin/funding-all`);
  if (!res.ok) throw new Error(`BloFin bulk fetch failed: ${res.status}`);
  const d = await res.json();
  const list = d.data ?? [];
  if (!Array.isArray(list) || list.length === 0) return [];

  return list.reduce((acc, item) => {
    const coin = coinFromBlofinSymbol(item.instId);
    if (!coin) return acc;
    const rate = parseFloat(item.fundingRate);
    if (isNaN(rate)) return acc;
    acc.push({
      exchange: 'blofin',
      coin,
      symbol: item.instId,
      markPrice: null,
      lastFundingRate: rate,
      nextFundingTime: parseInt(item.fundingTime) || 0,
    });
    return acc;
  }, []);
}

// ── Spread computation ────────────────────────────────────────────────────────

function buildSpreadOpportunities(ratesByExchange) {
  const coinMatrix = new Map();

  Object.values(ratesByExchange).forEach((rates) => {
    rates.forEach((rd) => {
      if (!coinMatrix.has(rd.coin)) coinMatrix.set(rd.coin, new Map());
      coinMatrix.get(rd.coin).set(rd.exchange, rd);
    });
  });

  const opportunities = [];

  coinMatrix.forEach((exchangeMap, coin) => {
    const exchangeIds = Array.from(exchangeMap.keys());
    if (exchangeIds.length < 2) return;

    for (let i = 0; i < exchangeIds.length; i++) {
      for (let j = i + 1; j < exchangeIds.length; j++) {
        const rdA = exchangeMap.get(exchangeIds[i]);
        const rdB = exchangeMap.get(exchangeIds[j]);

        const rawDiff = rdA.lastFundingRate - rdB.lastFundingRate;
        const spreadAbs = Math.abs(rawDiff);

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
          nextFundingTime: Math.min(
            shortRD.nextFundingTime || Infinity,
            longRD.nextFundingTime || Infinity
          ) || 0,
        });
      }
    }
  });

  return opportunities.sort((a, b) => b.spreadAbs - a.spreadAbs);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all exchange data and compute spread opportunities.
 * Gracefully degrades — one exchange failure doesn't stop others.
 *
 * @returns {Promise<{ opportunities: Opportunity[], meta: object }>}
 */
export async function fetchAllSpreads() {
  const [binanceResult, bybitResult, blofinResult] = await Promise.allSettled([
    fetchBinanceAll(),
    fetchBybitAll(),
    fetchBlofinAll(),
  ]);

  const ratesByExchange = {};
  const errors = {};
  const counts = {};

  const process = (result, key, fallback = []) => {
    if (result.status === 'fulfilled') {
      ratesByExchange[key] = result.value;
      counts[key] = result.value.length;
    } else {
      console.error(`[SpreadFetcher] ${key} failed:`, result.reason?.message);
      errors[key] = result.reason?.message ?? 'Unknown error';
      ratesByExchange[key] = fallback;
      counts[key] = 0;
    }
  };

  process(binanceResult, 'binance');
  process(bybitResult, 'bybit');
  process(blofinResult, 'blofin');

  const opportunities = buildSpreadOpportunities(ratesByExchange);

  return {
    opportunities,
    meta: { fetchedAt: Date.now(), counts, errors },
  };
}

/**
 * Fetch data for a specific coin pair across two exchanges.
 * Used by SignalScheduler for targeted signal refreshes.
 *
 * @param {string} coin           "BTC"
 * @param {string} longExchange   "binance"
 * @param {string} shortExchange  "bybit"
 * @returns {Promise<Opportunity|null>}
 */
export async function fetchCoinSignal(coin, longExchange, shortExchange) {
  try {
    const { opportunities } = await fetchAllSpreads();
    const match = opportunities.find(
      (o) =>
        o.coin === coin.toUpperCase() &&
        o.long.exchange === longExchange &&
        o.short.exchange === shortExchange
    );
    return match ?? null;
  } catch (err) {
    console.error(`[SpreadFetcher] fetchCoinSignal(${coin}) error:`, err.message);
    return null;
  }
}
