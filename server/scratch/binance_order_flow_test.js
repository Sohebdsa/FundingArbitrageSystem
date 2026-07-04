import crypto from 'crypto';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// ── Configuration ──
const BINANCE_BASE = process.env.BINANCE_BASE_URL || 'https://testnet.binancefuture.com';

// Fallback to the working keys you hardcoded
const API_KEY = process.env.BINANCE_API_KEY || "9MNzkssekovJebXmFAQ0qsmu91jL4KEgRcvqbZoxQUcI84iquMJOGxlgIfx07LSi";
const API_SECRET = process.env.BINANCE_API_SECRET || "ZISCdm8GnrIOJd6Y9BK5jCtseUd1kDrtCMtlfVwhUSZGiS0eVe70985YsDYJ4YPt";

const COIN = 'BTC';
const SIZE = '0.002'; // Minimum order size for BTCUSDT on testnet is typically 0.001 or 0.002

// ── Signature Helper ──
function signBinance(queryString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}

// ── Fetch Current USDT Balance ──
async function getUSDTBalance() {
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}`;
  const signature = signBinance(query, API_SECRET);
  const url = `${BINANCE_BASE}/fapi/v2/balance?${query}&signature=${signature}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': API_KEY,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to fetch balance: ${JSON.stringify(data)}`);
  }

  const usdtAsset = data.find(asset => asset.asset === 'USDT');
  return usdtAsset ? parseFloat(usdtAsset.balance) : 0;
}

// ── Place Order ──
async function placeOrder(symbol, side, type, quantity, price = null) {
  const timestamp = Date.now();
  
  const params = {
    symbol,
    side,
    type,
    quantity,
    timestamp,
    newOrderRespType: 'RESULT', // Force Binance to return fill details like avgPrice
  };

  // If it's a LIMIT order, we must add price and timeInForce
  if (type === 'LIMIT') {
    if (!price) throw new Error("Price is required for LIMIT orders");
    params.price = price;
    params.timeInForce = 'GTC'; // Good Til Cancelled
  }

  const queryParams = new URLSearchParams(params);
  const queryString = queryParams.toString();
  const signature = signBinance(queryString, API_SECRET);
  const url = `${BINANCE_BASE}/fapi/v1/order?${queryString}&signature=${signature}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': API_KEY,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Order placement failed (${side} ${type}): ${JSON.stringify(data)}`);
  }

  return data;
}

// ── Query Order Details ──
async function getOrderDetails(symbol, orderId) {
  const timestamp = Date.now();
  const query = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
  const signature = signBinance(query, API_SECRET);
  const url = `${BINANCE_BASE}/fapi/v1/order?${query}&signature=${signature}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': API_KEY,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to query order details: ${JSON.stringify(data)}`);
  }

  return data;
}

// ── Helper to wait ──
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Main Execution Flow ──
async function runOrderFlowTest() {
  console.log('==================================================');
  console.log('🎬 Starting Binance Futures Order Flow Test...');
  console.log(`   Coin: ${COIN} | Quantity: ${SIZE}`);
  console.log('==================================================\n');

  try {
    const symbol = `${COIN.toUpperCase()}USDT`;

    // 1. Fetch initial balance
    console.log('1️⃣ Fetching starting balance...');
    const startingBalance = await getUSDTBalance();
    console.log(`   - Starting USDT Balance: ${startingBalance.toFixed(4)} USDT\n`);

    // 2. Place opening Market Buy order (Long position)
    console.log('2️⃣ Placing MARKET BUY order to open position...');
    const buyOrderRaw = await placeOrder(symbol, 'BUY', 'MARKET', SIZE);
    const buyOrder = await getOrderDetails(symbol, buyOrderRaw.orderId);
    const buyPrice = parseFloat(buyOrder.avgPrice || buyOrder.price || 0);
    console.log(`   ✅ Order Filled! ID: ${buyOrder.orderId}`);
    console.log(`   - Avg Fill Price: ${buyPrice.toFixed(2)} USDT\n`);

    // 3. Wait for 10 seconds
    console.log('3️⃣ Sleeping for 10 seconds to let the market tick...');
    for (let i = 10; i > 0; i--) {
      process.stdout.write(`   - ${i} seconds remaining...\r`);
      await sleep(1000);
    }
    console.log('\n   - Wait complete.\n');

    // 4. Place closing Market Sell order (Close position)
    console.log('4️⃣ Placing MARKET SELL order to close position...');
    const sellOrderRaw = await placeOrder(symbol, 'SELL', 'MARKET', SIZE);
    const sellOrder = await getOrderDetails(symbol, sellOrderRaw.orderId);
    const sellPrice = parseFloat(sellOrder.avgPrice || sellOrder.price || 0);
    console.log(`   ✅ Order Filled! ID: ${sellOrder.orderId}`);
    console.log(`   - Avg Fill Price: ${sellPrice.toFixed(2)} USDT\n`);

    // 5. Fetch final balance
    console.log('5️⃣ Fetching ending balance...');
    const endingBalance = await getUSDTBalance();
    console.log(`   - Ending USDT Balance: ${endingBalance.toFixed(4)} USDT\n`);

    // 6. Calculate PnL
    const grossPnlFromTrade = (sellPrice - buyPrice) * parseFloat(SIZE);
    const netPnlFromBalance = endingBalance - startingBalance;
    const feesIncurred = grossPnlFromTrade - netPnlFromBalance;

    console.log('==================================================');
    console.log('📊 Trade Execution Report');
    console.log('==================================================');
    console.log(`- Start Balance:   ${startingBalance.toFixed(4)} USDT`);
    console.log(`- End Balance:     ${endingBalance.toFixed(4)} USDT`);
    console.log(`- Buy Fill Price:  ${buyPrice.toFixed(2)} USDT`);
    console.log(`- Sell Fill Price: ${sellPrice.toFixed(2)} USDT`);
    console.log(`--------------------------------------------------`);
    console.log(`- Gross Trade PnL: ${grossPnlFromTrade >= 0 ? '+' : ''}${grossPnlFromTrade.toFixed(6)} USDT`);
    console.log(`- Net Account PnL: ${netPnlFromBalance >= 0 ? '+' : ''}${netPnlFromBalance.toFixed(6)} USDT (Includes fees)`);
    console.log(`- Est. Fees Paid:  ${feesIncurred.toFixed(6)} USDT`);
    console.log('==================================================');

  } catch (error) {
    console.error('\n❌ Execution Error:', error.message);
  }
}

runOrderFlowTest();
