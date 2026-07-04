import crypto from 'crypto';
import dotenv from 'dotenv';
import fetch from 'node-fetch'; // If your node environment doesn't have native fetch, this will be used. Node 18+ has native fetch.
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// ── Configuration Constants ──
const BINANCE_BASE = process.env.BINANCE_BASE_URL || 'https://testnet.binancefuture.com';
const BLOFIN_BASE = process.env.BLOFIN_BASE_URL || 'https://demo-trading-openapi.blofin.com';

// ── Signature Helpers ──

// Binance expects HMAC-SHA256 signature as a Hexadecimal string of the query parameters
function signBinance(queryString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}

// BloFin expects HMAC-SHA256 signature as a Base64 string of: timestamp + method + path + body
function signBlofin(timestamp, method, path, body, secret) {
  const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
  const message = `${timestamp}${method.toUpperCase()}${path}${bodyStr}`;
  return crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('base64');
}

// ── Fetch Binance Balance ──
async function checkBinanceBalance() {
  const apiKey = process.env.BINANCE_API_KEY || "9MNzkssekovJebXmFAQ0qsmu91jL4KEgRcvqbZoxQUcI84iquMJOGxlgIfx07LSi";
  const apiSecret = process.env.BINANCE_API_SECRET || 'ZISCdm8GnrIOJd6Y9BK5jCtseUd1kDrtCMtlfVwhUSZGiS0eVe70985YsDYJ4YPt';

  if (!apiKey || !apiSecret) {
    console.log('❌ Binance: Skipping (API keys missing in .env)');
    return;
  }

  try {
    const timestamp = Date.now();
    const query = `timestamp=${timestamp}`;
    const signature = signBinance(query, apiSecret);
    const url = `${BINANCE_BASE}/fapi/v2/balance?${query}&signature=${signature}`;
    console.log(url)
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Binance API returned status ${res.status}: ${JSON.stringify(data)}`);
    }

    console.log('✅ Binance Testnet Connection Successful!');
    console.log('Full Assets List from API:');
    data.forEach(asset => {
      if (Number(asset.balance) > 0 || Number(asset.availableBalance) > 0) {
        console.log(`   - ${asset.asset}: Balance = ${asset.balance}, Available = ${asset.availableBalance}, Cross Wallet = ${asset.crossWalletBalance}`);
      }
    });
  } catch (error) {
    console.error('❌ Binance Balance Fetch Failed:', error.message);
  }
}

// ── Fetch BloFin Balance ──
async function checkBlofinBalance() {
  const apiKey = process.env.BLOFIN_API_KEY;
  const apiSecret = process.env.BLOFIN_API_SECRET;
  const passphrase = process.env.BLOFIN_PASSPHRASE;

  if (!apiKey || !apiSecret || !passphrase) {
    console.log('❌ BloFin: Skipping (API keys or Passphrase missing in .env)');
    return;
  }

  try {
    const timestamp = Date.now();
    const method = 'GET';
    const path = '/api/v1/asset/balances';
    const query = '?accountType=futures'; // Retrieve futures account balances

    const signature = signBlofin(timestamp, method, path + query, null, apiSecret);
    const url = `${BLOFIN_BASE}${path}${query}`;

    const res = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': String(timestamp),
        'ACCESS-PASSPHRASE': passphrase,
      },
    });

    const data = await res.json();
    if (!res.ok || data.code !== '0') {
      throw new Error(`BloFin API returned error: ${JSON.stringify(data)}`);
    }

    console.log('✅ BloFin Demo Trading Connection Successful!');
    const assets = data.data || [];
    if (assets.length > 0) {
      assets.forEach(asset => {
        console.log(`   - ${asset.currency} Balance: ${asset.balance} (Available: ${asset.available})`);
      });
    } else {
      console.log('   - No balances returned.');
    }
  } catch (error) {
    console.error('❌ BloFin Balance Fetch Failed:', error.message);
  }
}

// ── Main Execution Runner ──
async function run() {
  console.log('==================================================');
  console.log('🚀 Running Testnet/Demo Account Connection Check...');
  console.log('==================================================\n');

  await checkBinanceBalance();
  console.log('\n--------------------------------------------------\n');
  await checkBlofinBalance();

  console.log('\n==================================================');
  console.log('🏁 Check Complete!');
  console.log('==================================================');
}

run();
