import { RestClientV5 } from 'bybit-api';
import { performance } from 'perf_hooks';

export async function GetBlofinFunding(symbol) {
    const startTime = performance.now()
    const data = await fetch(`https://openapi.blofin.com/api/v1/market/funding-rate?instId=${symbol}-USDT`);
    const json = await data.json();
    const endTime = performance.now()
    const record = json.data[0];
    const result = {
        ms: endTime - startTime,
        symbol: record.instId,
        fundingRate: record.fundingRate,
        fundingTime: record.fundingTime
    };

    return result;
}
export async function GetBybitFunding(symbol) {
    const client = new RestClientV5({
        testnet: false, // use mainnet
    });

    try {
        const startTime = performance.now();
        const response = await client.getFundingRateHistory({
            category: 'linear',
            symbol: symbol,
            limit: 1,
        });

        if (response.retCode !== 0) {
            console.error("API Error:", response.retMsg);
            return;
        }

        const record = response.result.list[0];
        const endTime = performance.now()

        const result = {
            ms: endTime - startTime,
            symbol: record.symbol,
            fundingRate: record.fundingRate,
            fundingTime: new Date(Number(record.fundingRateTimestamp)).toISOString(),
            fundingInterval: record.fundingInterval
        };

        return result;

    } catch (err) {
        console.error("Request failed:", err.message);
    }
}

export async function GetBinanceFunding(symbol) {
    const startTime = performance.now();
    const response = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
    const json = await response.json();
    // console.log(json)
    const endTime = performance.now();
    const result = {
        ms: endTime - startTime,
        symbol: json.symbol,
        fundingRate: json.lastFundingRate,
        nextFundingTime: json.nextFundingTime,

    };
    return result
}

const BinanceData = await GetBinanceFunding("BTCUSDT")
const BybitData = await GetBybitFunding("BTCUSDT");
const BlofinData = await GetBlofinFunding("ETH");

console.log(`${BinanceData.ms.toFixed(2)}ms : ${BinanceData.symbol}: ${BinanceData.fundingRate}`)
console.log(`${BybitData.ms.toFixed(2)}ms : ${BybitData.symbol}: ${BybitData.fundingRate}`)
console.log(`${BlofinData.ms.toFixed(2)}ms : ${BlofinData.symbol}: ${BlofinData.fundingRate}`)