const BASE = "https://fapi.binance.com/fapi/v1/premiumIndex";

export async function getFundingData(symbol) {
  try {
    const res = await fetch(`${BASE}?symbol=${symbol.toUpperCase()}USDT`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    return {
      coin: symbol.toLowerCase(),
      symbol: data.symbol,
      markPrice: data.markPrice,
      indexPrice: data.indexPrice,
      lastFundingRate: data.lastFundingRate,
      nextFundingTime: data.nextFundingTime,
    };
  } catch (err) {
    console.error(`[Funding REST] Failed for ${symbol}:`, err.message);
    return null;
  }
}
