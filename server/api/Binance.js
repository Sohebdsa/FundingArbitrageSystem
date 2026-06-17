import dotenv from "dotenv";
dotenv.config();

const binanceApi =
  process.env.BINANCE_API ||
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";

async function getBinanceData() {
  try {
    const result = await fetch(binanceApi);

    if (!result.ok) {
      throw new Error(`HTTP Error ${result.status}`);
    }

    return await result.json();
  } catch (err) {
    console.error("Unable to fetch Binance data:", err.message);
    return null;
  }
}

export default getBinanceData;