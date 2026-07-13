// ── Message Templates ────────────────────────────────────────────────────────
// All Telegram message formatting. Uses HTML parse_mode.
// Design rules:
//   • ▲ = LONG (buy)   ▼ = SHORT (sell)
//   • ─────── dividers to separate sections clearly
//   • monospace <code> for all numeric values
//   • Confidence: HIGH ★★★ / MED ★★☆ / LOW ★☆☆ / NONE ☆☆☆

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRate(r) {
  if (r == null || isNaN(r)) return '—';
  const pct = r * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(4) + '%';
}

function fmtSpread(abs) {
  return (abs * 100).toFixed(5) + '%';
}

function fmtApy(v) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(2) + '%';
}

function fmtCountdown(ms) {
  if (!ms || ms <= 0) return '—';
  const diff = ms - Date.now();
  if (diff <= 0) return '⚡ Now';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function exchangeName(id) {
  const map = { binance: 'Binance', bybit: 'Bybit', blofin: 'BloFin' };
  return map[id] || (id ?? '—');
}

function confStars(level) {
  const map = { HIGH: '★★★', MED: '★★☆', LOW: '★☆☆', NONE: '☆☆☆' };
  return map[level] ?? '☆☆☆';
}

function confLabel(level) {
  const map = { HIGH: 'HIGH', MED: 'MED', LOW: 'LOW', NONE: 'NONE' };
  return map[level] ?? level;
}

// Horizontal rule (Telegram renders these as plain text separators)
const HR = '────────────────────';
const HR_THIN = '· · · · · · · · · · ·';

// ── Welcome / Help ────────────────────────────────────────────────────────────

export function formatWelcomeMessage() {
  return [
    `🤖 <b>ArbScanner Bot</b>`,
    `<i>Cross-exchange funding rate monitor</i>`,
    ``,
    HR,
    ``,
    `<b>📌 Commands</b>`,
    ``,
    `/on          Enable signals`,
    `/off         Disable + clear all`,
    `/ArbList     Top spread opportunities`,
    `/status      Your active subscriptions`,
    `/help        Show this message`,
    ``,
    HR_THIN,
    ``,
    `<b>📈 Subscribe to a coin</b>`,
    `Send <code>/BTC</code>, <code>/ETH</code>, <code>/SOL</code> …`,
    `to get adaptive funding signals.`,
    ``,
    `<b>📉 Unsubscribe</b>`,
    `Send <code>/stop BTC</code> to stop a specific coin.`,
    ``,
    HR,
    `<i>Signals escalate as funding time approaches</i>`,
  ].join('\n');
}

export function formatHelpMessage() {
  return formatWelcomeMessage();
}

// ── On / Off ──────────────────────────────────────────────────────────────────

export function formatOnMessage() {
  return [
    `✅ <b>Bot enabled</b>`,
    ``,
    `Use <code>/ArbList</code> to browse opportunities`,
    `or <code>/BTC</code> to subscribe to BTC signals.`,
  ].join('\n');
}

export function formatOffMessage() {
  return [
    `⛔ <b>Bot disabled</b>`,
    ``,
    `All subscriptions cancelled.`,
    `Send <code>/on</code> to re-enable.`,
  ].join('\n');
}

// ── Status ────────────────────────────────────────────────────────────────────

export function formatStatusMessage(subscriptions) {
  if (!subscriptions || subscriptions.size === 0) {
    return [
      `📋 <b>Active Subscriptions</b>`,
      ``,
      `None. Send <code>/BTC</code>, <code>/ETH</code>, etc. to subscribe.`,
    ].join('\n');
  }

  const lines = [
    `📋 <b>Active Subscriptions  (${subscriptions.size})</b>`,
    ``,
    HR,
  ];

  let i = 1;
  subscriptions.forEach(({ coin, longExchange, shortExchange }) => {
    lines.push(
      ``,
      `<b>${i}. ${coin}USDT</b>`,
      `   ▲ LONG   ${exchangeName(longExchange)}`,
      `   ▼ SHORT  ${exchangeName(shortExchange)}`,
      `   Stop: <code>/stop ${coin}</code>`,
    );
    i++;
  });

  lines.push(``, HR);
  return lines.join('\n');
}

// ── Signal Message ────────────────────────────────────────────────────────────

export function formatSignalMessage({ coin, opportunity, nextIntervalMin, isOnDemand = false }) {
  const { spreadAbs, annualizedApy, confidence, long, short } = opportunity;

  const longCountdown  = fmtCountdown(long.nextFundingTime);
  const shortCountdown = fmtCountdown(short.nextFundingTime);

  const title = isOnDemand
    ? `📡 <b>On-Demand Signal</b>`
    : `🔔 <b>Funding Signal</b>`;

  const lines = [
    title,
    `<code>${coin}USDT</code>   ${confStars(confidence)} ${confLabel(confidence)}`,
    ``,
    HR,
    ``,
    `<b>Spread</b>   <code>${fmtSpread(spreadAbs)}</code>`,
    `<b>APY</b>      <code>${fmtApy(annualizedApy)}</code> annualized`,
    ``,
    HR_THIN,
    ``,
    `▲ <b>LONG   ${exchangeName(long.exchange)}</b>`,
    `  Rate      <code>${fmtRate(long.rate)}</code>`,
    `  Funding   ${longCountdown}`,
    ``,
    `▼ <b>SHORT  ${exchangeName(short.exchange)}</b>`,
    `  Rate      <code>${fmtRate(short.rate)}</code>`,
    `  Funding   ${shortCountdown}`,
    ``,
    HR,
  ];

  if (!isOnDemand && nextIntervalMin != null) {
    lines.push(`<i>Next signal in ${nextIntervalMin} min</i>`);
  } else if (isOnDemand) {
    lines.push(`<i>Use buttons below for more options</i>`);
  }

  return lines.join('\n');
}

// ── ArbList Page ──────────────────────────────────────────────────────────────

const ARB_LIST_PAGE_SIZE = 10;

export function formatArbListPage(spreads, page) {
  const totalPages = Math.max(1, Math.ceil(spreads.length / ARB_LIST_PAGE_SIZE));
  const start = (page - 1) * ARB_LIST_PAGE_SIZE;
  const pageItems = spreads.slice(start, start + ARB_LIST_PAGE_SIZE);

  if (pageItems.length === 0) {
    return {
      text: `❌ No data for page ${page}. Total pages: ${totalPages}`,
      totalPages,
      pageItems: [],
    };
  }

  const lines = [
    `📊 <b>Arb List</b>   Page ${page} / ${totalPages}`,
    `<i>${spreads.length} pairs · sorted by spread</i>`,
    ``,
    HR,
  ];

  pageItems.forEach((opp, i) => {
    const rank = start + i + 1;
    const { coin, spreadAbs, annualizedApy, long, short, confidence } = opp;

    lines.push(
      ``,
      // Rank + coin + confidence stars on one line
      `<b>#${rank}  ${coin}USDT</b>   ${confStars(confidence)} ${confLabel(confidence)}`,
      // Spread and APY on one line, both monospace
      `  <code>${fmtSpread(spreadAbs)}</code>  ·  APY <code>${fmtApy(annualizedApy)}</code>  ·  ⏱ ${fmtCountdown(opp.nextFundingTime)}`,
      // Long / Short on separate lines with triangles
      `  ▲ ${exchangeName(long.exchange).padEnd(8)}  ▼ ${exchangeName(short.exchange)}`,
      // Subscribe hint
      `  → <code>/${coin}</code>`,
      // Thin divider after each item except the last
      i < pageItems.length - 1 ? HR_THIN : HR,
    );
  });

  // Ensure HR is at end if last item already added it
  if (pageItems.length > 0) {
    // Already pushed HR above
  }

  lines.push(`<i>Use buttons below to navigate</i>`);

  return { text: lines.join('\n'), totalPages, pageItems };
}

export { ARB_LIST_PAGE_SIZE };

// ── Subscription confirm ──────────────────────────────────────────────────────

export function formatSubscribeMessage(coin, longExchange, shortExchange, opportunity) {
  const { spreadAbs, annualizedApy, confidence } = opportunity;
  return [
    `✅ <b>Subscribed to ${coin}USDT</b>`,
    ``,
    HR,
    ``,
    `▲ LONG   <b>${exchangeName(longExchange)}</b>`,
    `▼ SHORT  <b>${exchangeName(shortExchange)}</b>`,
    ``,
    `Spread   <code>${fmtSpread(spreadAbs)}</code>`,
    `APY      <code>${fmtApy(annualizedApy)}</code>`,
    `Signal   ${confStars(confidence)} ${confLabel(confidence)}`,
    ``,
    HR,
    ``,
    `Adaptive signals will escalate as funding approaches.`,
    `<code>/stop ${coin}</code> to cancel anytime.`,
  ].join('\n');
}

export function formatUnsubscribeMessage(coin) {
  return [
    `🔕 <b>Unsubscribed from ${coin}USDT</b>`,
    ``,
    `Signals stopped.`,
  ].join('\n');
}

export function formatNotFoundMessage(coin) {
  return [
    `❌ <b>${coin}USDT not found</b>`,
    ``,
    `The coin may not be traded on 2+ exchanges.`,
    `Try <code>/ArbList</code> to browse available pairs.`,
  ].join('\n');
}

export function formatBotDisabledMessage() {
  return `⛔ Bot is disabled.  Send <code>/on</code> to enable.`;
}

export function formatAlreadySubscribedMessage(coin) {
  return [
    `ℹ️ Already subscribed to <b>${coin}USDT</b>`,
    ``,
    `Signal timers are running. Use <code>/status</code> to check.`,
  ].join('\n');
}

export function formatErrorMessage(context) {
  return `⚠️ Error${context ? `: ${context}` : ''}. Please try again.`;
}
