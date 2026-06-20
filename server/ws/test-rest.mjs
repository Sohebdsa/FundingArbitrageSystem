const endpoints = [
  "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
];

for (const url of endpoints) {
  try {
    console.log(`Testing: ${url}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();
    console.log("✅ SUCCESS:", JSON.stringify(data).slice(0, 200));
  } catch (err) {
    console.log("❌ FAILED:", err.message);
  }
}
