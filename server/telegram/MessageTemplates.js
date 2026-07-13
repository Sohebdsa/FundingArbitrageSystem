// ── Message Templates ────────────────────────────────────────────────────────
// All Telegram message formatting lives here. Uses HTML parse_mode.

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtRate(r) {
  if (r == null || isNaN(r)) return '—';
  const pct = r * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(4) + '%';
}

function fmtSpread(abs) {
  return (abs * 100).toFixed(5) + '%';
}

function fmtApy(v) {
  return v.toFixed(2) + '%';
}

function fmtCountdown(ms) {
  if (!ms || ms <= 0) return '—';
  const diff = ms - Date.now();
  if (diff <= 0) return 'Now ⚡';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function exchangeEmoji(id) {
  const map = { binance: '🟡', bybit: '🟠', blofin: '🔵' };
  return map[id] || '⚪';
}

function exchangeName(id) {
  const map = { binance: 'Binance', bybit: 'Bybit', blofin: 'BloFin' };
  return map[id] || id;
}

// ── Welcome / Help ────────────────────────────────────────────────────────────

export function formatWelcomeMessage() {
  return (
    `🤖 <b>ArbScanner Bot — Active</b>\n\n` +
    `I monitor cross-exchange funding rate spreads and send you adaptive signals.\n\n` +
    `<b>Commands:</b>\n` +
    `/on — Enable signals\n` +
    `/off — Disable all signals\n` +
    `/ArbList — View top spread opportunities\n` +
    `/status — View active subscriptions\n` +
    `/help — Show this message\n\n` +
    `<b>Subscribe to a coin:</b>\n` +
    `Send <code>/BTC</code>, <code>/ETH</code>, <code>/SOL</code>, etc.\n` +
    `to start receiving adaptive funding signals for that coin.\n\n` +
    `<b>Unsubscribe:</b>\n` +
    `Send <code>/stop BTC</code> to stop signals for a specific coin.`
  );
}

export function formatHelpMessage() {
  return formatWelcomeMessage();
}

// ── On / Off ─────────────────────────────────────────────────────────────────

export function formatOnMessage() {
  return (
    `✅ <b>Bot enabled for this chat.</b>\n\n` +
    `Send <code>/ArbList</code> to browse top opportunities,\n` +
    `or <code>/BTC</code> to subscribe to BTC signals.`
  );
}

export function formatOffMessage() {
  return (
    `🔴 <b>Bot disabled for this chat.</b>\n\n` +
    `All active subscriptions have been cancelled.\n` +
    `Send <code>/on</code> to re-enable.`
  );
}

// ── Status ───────────────────────────────────────────────────────────────────

export function formatStatusMessage(subscriptions) {
  if (!subscriptions || subscriptions.size === 0) {
    return (
      `📋 <b>Active Subscriptions: none</b>\n\n` +
      `Send <code>/BTC</code>, <code>/ETH</code>, etc. to subscribe to a coin.`
    );
  }

  let lines = [`📋 <b>Active Subscriptions (${subscriptions.size})</b>\n`];
  subscriptions.forEach(({ coin, longExchange, shortExchange }) => {
    lines.push(
      `• <b>${coin}</b>  ${exchangeEmoji(longExchange)} LONG: ${exchangeName(longExchange)} · ` +
      `${exchangeEmoji(shortExchange)} SHORT: ${exchangeName(shortExchange)}\n` +
      `  Stop: <code>/stop ${coin}</code>`
    );
  });

  return lines.join('\n');
}

// ── Signal Message ────────────────────────────────────────────────────────────

export function formatSignalMessage({ coin, opportunity, nextIntervalMin, isOnDemand = false }) {
  const { spreadAbs, annualizedApy, confidence, long, short } = opportunity;

  const confEmoji = { HIGH: '🟢', MED: '🟡', LOW: '🔵', NONE: '⚪' };
  const longCountdown  = fmtCountdown(long.nextFundingTime);
  const shortCountdown = fmtCountdown(short.nextFundingTime);

  const header = isOnDemand
    ? `📡 <b>On-Demand Signal — ${coin}USDT</b>`
    : `🚨 <b>Funding Signal — ${coin}USDT</b>`;

  const lines = [
    header,
    ``,
    `${confEmoji[confidence] || '⚪'} <b>Confidence:</b> ${confidence}`,
    `📈 <b>Spread:</b>  <code>${fmtSpread(spreadAbs)}</code>`,
    `💰 <b>APY:</b>     <code>${fmtApy(annualizedApy)}</code>`,
    ``,
    `${exchangeEmoji(long.exchange)} <b>LONG  (${exchangeName(long.exchange)}):</b>  rate <code>${fmtRate(long.rate)}</code>  ⏱ ${longCountdown}`,
    `${exchangeEmoji(short.exchange)} <b>SHORT (${exchangeName(short.exchange)}):</b>  rate <code>${fmtRate(short.rate)}</code>  ⏱ ${shortCountdown}`,
  ];

  if (!isOnDemand && nextIntervalMin != null) {
    lines.push(``);
    lines.push(`🔔 <i>Next signal in ${nextIntervalMin} min</i>`);
  }

  return lines.join('\n');
}

// ── ArbList Page ──────────────────────────────────────────────────────────────

const ARB_LIST_PAGE_SIZE = 10;

export function formatArbListPage(spreads, page) {
  const totalPages = Math.ceil(spreads.length / ARB_LIST_PAGE_SIZE);
  const start = (page - 1) * ARB_LIST_PAGE_SIZE;
  const pageItems = spreads.slice(start, start + ARB_LIST_PAGE_SIZE);

  if (pageItems.length === 0) {
    return { text: `❌ No data available for page ${page}.`, totalPages };
  }

  const lines = [
    `📊 <b>Arb List — Page ${page}/${totalPages}</b>  (${spreads.length} pairs total)\n`,
  ];

  pageItems.forEach((opp, i) => {
    const rank = start + i + 1;
    const { coin, spreadAbs, annualizedApy, long, short, confidence } = opp;
    const confEmoji = { HIGH: '🟢', MED: '🟡', LOW: '🔵', NONE: '⚪' };

    lines.push(
      `<b>#${rank} ${coin}USDT</b>  ${confEmoji[confidence] || '⚪'} ${confidence}\n` +
      `  Spread: <code>${fmtSpread(spreadAbs)}</code>  APY: <code>${fmtApy(annualizedApy)}</code>\n` +
      `  ${exchangeEmoji(long.exchange)} LONG: ${exchangeName(long.exchange)}   ` +
      `${exchangeEmoji(short.exchange)} SHORT: ${exchangeName(short.exchange)}\n` +
      `  ⏱ ${fmtCountdown(opp.nextFundingTime)}  →  <code>/${coin}</code> to subscribe`
    );
  });

  return { text: lines.join('\n'), totalPages, pageItems };
}

export { ARB_LIST_PAGE_SIZE };

// ── Subscription confirm ──────────────────────────────────────────────────────

export function formatSubscribeMessage(coin, longExchange, shortExchange, opportunity) {
  const { spreadAbs, annualizedApy, confidence } = opportunity;
  return (
    `✅ <b>Subscribed to ${coin}USDT</b>\n\n` +
    `${exchangeEmoji(longExchange)} LONG:  ${exchangeName(longExchange)}\n` +
    `${exchangeEmoji(shortExchange)} SHORT: ${exchangeName(shortExchange)}\n\n` +
    `Current spread: <code>${fmtSpread(spreadAbs)}</code>  |  APY: <code>${fmtApy(annualizedApy)}</code>  |  ${confidence}\n\n` +
    `📡 You'll receive adaptive signals as funding time approaches.\n` +
    `Use <code>/stop ${coin}</code> to cancel.`
  );
}

export function formatUnsubscribeMessage(coin) {
  return `🔕 <b>Unsubscribed from ${coin}USDT.</b> Signals stopped.`;
}

export function formatNotFoundMessage(coin) {
  return (
    `❌ <b>${coin}USDT</b> not found in the spread data.\n\n` +
    `• The coin may not be traded on 2+ exchanges.\n` +
    `• Try <code>/ArbList</code> to browse available pairs.`
  );
}

export function formatBotDisabledMessage() {
  return `🔴 Bot is disabled for this chat. Send <code>/on</code> to enable.`;
}

export function formatAlreadySubscribedMessage(coin) {
  return `ℹ️ Already subscribed to <b>${coin}USDT</b>. Signal timers are running.`;
}

export function formatErrorMessage(context) {
  return `⚠️ An error occurred${context ? ` (${context})` : ''}. Please try again.`;
}
