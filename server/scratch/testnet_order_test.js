import crypto from 'crypto';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// ── Configuration Constants ──
const BINANCE_BASE = process.env.BINANCE_BASE_URL || 'https://testnet.binancefuture.com';
const BLOFIN_BASE = process.env.BLOFIN_BASE_URL || 'https://demo-trading-openapi.blofin.com';

// ── Signature Helpers ──
function signBinance(queryString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}

function signBlofin(timestamp, method, path, body, secret) {
  const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
  const message = `${timestamp}${method.toUpperCase()}${path}${bodyStr}`;
  return crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('base64');
}

// ── Simultaneous Order Executor ──
async function executeArbitrageTest(coin, size, direction) {
  const binanceApiKey = process.env.BINANCE_API_KEY || "9MNzkssekovJebXmFAQ0qsmu91jL4KEgRcvqbZoxQUcI84iquMJOGxlgIfx07LSi";
  const binanceApiSecret = process.env.BINANCE_API_SECRET || "ZISCdm8GnrIOJd6Y9BK5jCtseUd1kDrtCMtlfVwhUSZGiS0eVe70985YsDYJ4YPt";
  const blofinApiKey = process.env.BLOFIN_API_KEY || '2b1f7b69-3b4f-4602-b391-6b0de5499317';
  const blofinApiSecret = process.env.BLOFIN_API_SECRET || '';
  const blofinPassphrase = process.env.BLOFIN_PASSPHRASE || '';

  if (!binanceApiKey || !binanceApiSecret || !blofinApiKey || !blofinApiSecret || !blofinPassphrase) {
    console.error('❌ Error: Missing API keys in your server/.env file. Please check credentials.');
    return;
  }

  // 1. Resolve trading sides based on direction
  // Arbitrage: Buy on one exchange and sell on the other
  const binanceSide = direction === 'BINANCE_SHORT_BLOFIN_LONG' ? 'SELL' : 'BUY';
  const blofinSide = direction === 'BINANCE_SHORT_BLOFIN_LONG' ? 'buy' : 'sell';

  console.log(`\n==================================================`);
  console.log(`⚡ Initiating Simultaneous Test Order Execution`);
  console.log(`   Coin: ${coin.toUpperCase()}`);
  console.log(`   Size: ${size}`);
  console.log(`   Direction: ${direction}`);
  console.log(`   Binance: ${binanceSide} | BloFin: ${blofinSide}`);
  console.log(`==================================================\n`);

  // 2. Prepare Binance Order
  const binanceSymbol = `${coin.toUpperCase()}USDT`;
  const binanceParams = new URLSearchParams({
    symbol: binanceSymbol,
    side: binanceSide,
    type: 'MARKET',
    quantity: size,
    timestamp: Date.now(),
  });
  const binanceQueryString = binanceParams.toString();
  const binanceSignature = signBinance(binanceQueryString, binanceApiSecret);
  const binanceUrl = `${BINANCE_BASE}/fapi/v1/order?${binanceQueryString}&signature=${binanceSignature}`;

  const binancePromise = fetch(binanceUrl, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': binanceApiKey,
      'Content-Type': 'application/json',
    },
  }).then(async (res) => {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Binance Order Refused: ${JSON.stringify(data)}`);
    }
    return { exchange: 'Binance', data };
  });

  // 3. Prepare BloFin Order
  const blofinSymbol = `${coin.toUpperCase()}-USDT`;
  const blofinPath = '/api/v1/trade/order';
  const blofinTimestamp = Date.now();
  const blofinBody = {
    instId: blofinSymbol,
    side: blofinSide,
    orderType: 'market',
    marginMode: 'isolated',
    size: size,
  };
  const blofinSignature = signBlofin(blofinTimestamp, 'POST', blofinPath, blofinBody, blofinApiSecret);

  const blofinPromise = fetch(`${BLOFIN_BASE}${blofinPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ACCESS-KEY': blofinApiKey,
      'ACCESS-SIGN': blofinSignature,
      'ACCESS-TIMESTAMP': String(blofinTimestamp),
      'ACCESS-PASSPHRASE': blofinPassphrase,
    },
    body: JSON.stringify(blofinBody),
  }).then(async (res) => {
    const data = await res.json();
    if (!res.ok || data.code !== '0') {
      throw new Error(`BloFin Order Refused: ${JSON.stringify(data)}`);
    }
    return { exchange: 'BloFin', data };
  });

  // 4. Fire Parallel Requests
  const startTime = Date.now();
  const results = await Promise.allSettled([binancePromise, blofinPromise]);
  const duration = Date.now() - startTime;

  console.log(`⏱️ Round-Trip Network Execution Time: ${duration}ms\n`);

  const binanceResult = results[0];
  const blofinResult = results[1];

  const binanceSuccess = binanceResult.status === 'fulfilled';
  const blofinSuccess = blofinResult.status === 'fulfilled';

  // 5. Audit Results
  if (binanceSuccess && blofinSuccess) {
    console.log('🎉 SUCCESS: Both orders executed successfully!');
    console.log('   - Binance Order ID:', binanceResult.value.data.orderId);
    console.log('   - BloFin Order ID:', blofinResult.value.data.data?.[0]?.orderId || 'N/A');
  } else if (!binanceSuccess && !blofinSuccess) {
    console.log('❌ FAILURE: Both orders failed to execute.');
    console.error('   - Binance Error:', binanceResult.reason?.message);
    console.error('   - BloFin Error:', blofinResult.reason?.message);
  } else {
    // 6. Handle Partial Execution Leg Mismatch (Rollback)
    console.warn('⚠️ WARNING: Single-leg execution failure detected!');

    if (binanceSuccess) {
      console.log('   - Binance order succeeded. BloFin order failed.');
      console.log('   - Initiating automated rollback on Binance...');

      const rollbackSide = binanceSide === 'SELL' ? 'BUY' : 'SELL';
      const rollbackParams = new URLSearchParams({
        symbol: binanceSymbol,
        side: rollbackSide,
        type: 'MARKET',
        quantity: size,
        timestamp: Date.now(),
      });
      const rollbackQuery = rollbackParams.toString();
      const rollbackSig = signBinance(rollbackQuery, binanceApiSecret);

      try {
        const rollbackRes = await fetch(`${BINANCE_BASE}/fapi/v1/order?${rollbackQuery}&signature=${rollbackSig}`, {
          method: 'POST',
          headers: { 'X-MBX-APIKEY': binanceApiKey },
        });
        const rollbackData = await rollbackRes.json();
        if (rollbackRes.ok) {
          console.log('   ✅ Rollback successful. Binance position closed.');
        } else {
          console.error('   ❌ Rollback failed:', rollbackData);
        }
      } catch (err) {
        console.error('   ❌ Rollback network request failed:', err.message);
      }
    } else {
      console.log('   - BloFin order succeeded. Binance order failed.');
      console.log('   - Initiating automated rollback on BloFin...');

      const rollbackSide = blofinSide === 'buy' ? 'sell' : 'buy';
      const rollbackBody = {
        instId: blofinSymbol,
        side: rollbackSide,
        orderType: 'market',
        marginMode: 'isolated',
        size: size,
      };
      const rollbackTimestamp = Date.now();
      const rollbackSig = signBlofin(rollbackTimestamp, 'POST', blofinPath, rollbackBody, blofinApiSecret);

      try {
        const rollbackRes = await fetch(`${BLOFIN_BASE}${blofinPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ACCESS-KEY': blofinApiKey,
            'ACCESS-SIGN': rollbackSig,
            'ACCESS-TIMESTAMP': String(rollbackTimestamp),
            'ACCESS-PASSPHRASE': blofinPassphrase,
          },
          body: JSON.stringify(rollbackBody),
        });
        const rollbackData = await rollbackRes.json();
        if (rollbackRes.ok && rollbackData.code === '0') {
          console.log('   ✅ Rollback successful. BloFin position closed.');
        } else {
          console.error('   ❌ Rollback failed:', rollbackData);
        }
      } catch (err) {
        console.error('   ❌ Rollback network request failed:', err.message);
      }
    }
  }
}

// Run order test with minimal parameters
// Coin: BTC, Size: 0.001 (Minimum contract sizes vary, verify exchange parameters if order gets rejected)
// Direction: Short Binance, Long BloFin
executeArbitrageTest('BTC', '0.001', 'BINANCE_SHORT_BLOFIN_LONG');
