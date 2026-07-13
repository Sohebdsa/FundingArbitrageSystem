// ── TelegramBot.js ───────────────────────────────────────────────────────────
// Long-polling Telegram bot controller.
// Polls getUpdates every 2 seconds, routes commands and inline button taps.
//
// Command map:
//   /on           → enable bot for this chat
//   /off          → disable + clear all subscriptions
//   /start        → same as /on + welcome message
//   /help         → command reference
//   /status       → list active subscriptions
//   /ArbList      → page 1 of spread list
//   /ArbList-N    → page N of spread list
//   /COIN         → subscribe to adaptive signals for COIN (e.g. /BTC)
//   /stop COIN    → unsubscribe from COIN
//
// Inline buttons (callback_data):
//   signal_now:COIN   → on-demand signal
//   stop:COIN         → unsubscribe
//   arblist:N         → paginate ArbList to page N
//   arblist_refresh:N → re-fetch and edit existing ArbList message

import {
  getUser,
  setEnabled,
  isEnabled,
  subscribe,
  unsubscribe,
  hasSubscription,
  getSubscriptions,
  clearAll,
} from './UserStateStore.js';

import {
  startSignalLoop,
  stopSignalLoop,
  fetchAndSendSignal,
  injectSendMessage,
} from './SignalScheduler.js';

import { fetchAllSpreads, fetchCoinSignal } from './SpreadFetcher.js';

import {
  formatWelcomeMessage,
  formatHelpMessage,
  formatOnMessage,
  formatOffMessage,
  formatStatusMessage,
  formatArbListPage,
  formatSubscribeMessage,
  formatUnsubscribeMessage,
  formatNotFoundMessage,
  formatBotDisabledMessage,
  formatAlreadySubscribedMessage,
  formatErrorMessage,
  ARB_LIST_PAGE_SIZE,
} from './MessageTemplates.js';

// ── Config ────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const TG_API_BASE = `https://api.telegram.org/bot`;

// ── Internal state ────────────────────────────────────────────────────────────

let botToken = null;
let offset = 0;
let pollTimer = null;
let isPolling = false;

// ── Telegram API wrappers ─────────────────────────────────────────────────────

async function tgRequest(method, body = {}) {
  if (!botToken) return null;
  try {
    const res = await fetch(`${TG_API_BASE}${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn(`[Bot] ${method} failed:`, data.description);
    }
    return data;
  } catch (err) {
    console.error(`[Bot] ${method} network error:`, err.message);
    return null;
  }
}

/**
 * Send a new message to a chat.
 * @param {string|number} chatId
 * @param {string}        text
 * @param {object|null}   replyMarkup  Telegram inline keyboard object
 * @returns {Promise<object|null>}  The sent message object
 */
async function sendMessage(chatId, text, replyMarkup = null) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };
  return tgRequest('sendMessage', body);
}

/**
 * Edit an existing message (used for ArbList refresh/pagination).
 */
async function editMessage(chatId, messageId, text, replyMarkup = null) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };
  return tgRequest('editMessageText', body);
}

/**
 * Answer a callback query (removes the loading spinner on inline button).
 */
async function answerCallbackQuery(callbackQueryId, text = '') {
  return tgRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

// ── ArbList inline keyboard builder ──────────────────────────────────────────

function buildArbListKeyboard(page, totalPages) {
  const row = [];
  if (page > 1) {
    row.push({ text: `◀ Page ${page - 1}`, callback_data: `arblist:${page - 1}` });
  }
  row.push({ text: '🔄 Refresh', callback_data: `arblist_refresh:${page}` });
  if (page < totalPages) {
    row.push({ text: `Page ${page + 1} ▶`, callback_data: `arblist:${page + 1}` });
  }
  return { inline_keyboard: [row] };
}

// ── ArbList handler ────────────────────────────────────────────────────────────

async function handleArbListCommand(chatId, page) {
  await sendMessage(chatId, `⏳ <i>Fetching spread data across all exchanges…</i>`);

  try {
    const { opportunities } = await fetchAllSpreads();
    if (!opportunities || opportunities.length === 0) {
      await sendMessage(chatId, `❌ No spread data available right now. Try again shortly.`);
      return;
    }

    const { text, totalPages } = formatArbListPage(opportunities, page);
    const keyboard = buildArbListKeyboard(page, totalPages);
    await sendMessage(chatId, text, keyboard);
  } catch (err) {
    console.error('[Bot] ArbList error:', err.message);
    await sendMessage(chatId, formatErrorMessage('ArbList fetch'));
  }
}

// ── Subscribe handler ─────────────────────────────────────────────────────────

async function handleSubscribe(chatId, coin) {
  if (!isEnabled(chatId)) {
    await sendMessage(chatId, formatBotDisabledMessage());
    return;
  }

  if (hasSubscription(chatId, coin)) {
    await sendMessage(chatId, formatAlreadySubscribedMessage(coin));
    return;
  }

  await sendMessage(chatId, `⏳ <i>Looking up ${coin}USDT across exchanges…</i>`);

  try {
    const { opportunities } = await fetchAllSpreads();
    const matches = opportunities.filter((o) => o.coin === coin.toUpperCase());

    if (!matches || matches.length === 0) {
      await sendMessage(chatId, formatNotFoundMessage(coin));
      return;
    }

    // Pick the best spread match for this coin
    const best = matches[0];
    const { long, short } = best;

    subscribe(chatId, coin, long.exchange, short.exchange);

    await sendMessage(chatId, formatSubscribeMessage(coin, long.exchange, short.exchange, best));

    // Start the adaptive signal loop (sends first signal immediately)
    startSignalLoop(chatId, coin.toUpperCase(), long.exchange, short.exchange);
  } catch (err) {
    console.error(`[Bot] Subscribe error for ${coin}:`, err.message);
    await sendMessage(chatId, formatErrorMessage(`subscribing to ${coin}`));
  }
}

// ── Command dispatcher ────────────────────────────────────────────────────────

// Known non-coin slash commands that should not trigger subscribe
const RESERVED_COMMANDS = new Set([
  'on', 'off', 'start', 'help', 'status',
  'arblist', 'stop', 'list',
]);

async function handleCommand(chatId, rawText) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // ── /start or /on ──────────────────────────────────────────────
  if (lower === '/start' || lower === '/on') {
    setEnabled(chatId, true);
    await sendMessage(chatId, lower === '/start' ? formatWelcomeMessage() : formatOnMessage());
    return;
  }

  // ── /off ────────────────────────────────────────────────────────
  if (lower === '/off') {
    clearAll(chatId);
    setEnabled(chatId, false);
    await sendMessage(chatId, formatOffMessage());
    return;
  }

  // ── /help ───────────────────────────────────────────────────────
  if (lower === '/help') {
    await sendMessage(chatId, formatHelpMessage());
    return;
  }

  // ── /status ─────────────────────────────────────────────────────
  if (lower === '/status') {
    const subs = getSubscriptions(chatId);
    await sendMessage(chatId, formatStatusMessage(subs));
    return;
  }

  // ── /ArbList or /ArbList-N ──────────────────────────────────────
  const arbListMatch = lower.match(/^\/arblist(?:-(\d+))?$/);
  if (arbListMatch) {
    if (!isEnabled(chatId)) {
      await sendMessage(chatId, formatBotDisabledMessage());
      return;
    }
    const page = parseInt(arbListMatch[1] || '1', 10);
    await handleArbListCommand(chatId, Math.max(1, page));
    return;
  }

  // ── /stop COIN ──────────────────────────────────────────────────
  const stopMatch = lower.match(/^\/stop\s+([a-z0-9]+)$/);
  if (stopMatch) {
    const coin = stopMatch[1].toUpperCase();
    stopSignalLoop(chatId, coin);
    const existed = unsubscribe(chatId, coin);
    await sendMessage(
      chatId,
      existed ? formatUnsubscribeMessage(coin) : `ℹ️ You were not subscribed to <b>${coin}USDT</b>.`
    );
    return;
  }

  // ── /COIN (dynamic subscribe) ────────────────────────────────────
  // Matches any command starting with / followed by alphanumeric chars
  const coinMatch = text.match(/^\/([A-Za-z0-9]{2,10})$/);
  if (coinMatch) {
    const cmd = coinMatch[1].toLowerCase();
    // Skip if it's a reserved command word
    if (RESERVED_COMMANDS.has(cmd)) return;
    await handleSubscribe(chatId, coinMatch[1].toUpperCase());
    return;
  }

  // ── Unknown command ──────────────────────────────────────────────
  await sendMessage(
    chatId,
    `❓ Unknown command. Send <code>/help</code> for the command list.`
  );
}

// ── Callback query handler (inline buttons) ───────────────────────────────────

async function handleCallbackQuery(query) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const data = query.data;

  if (!chatId || !data) return;

  // ── 📡 Get Signal Now ────────────────────────────────────────────
  const signalNowMatch = data.match(/^signal_now:([A-Z0-9]+)$/);
  if (signalNowMatch) {
    const coin = signalNowMatch[1];
    await answerCallbackQuery(query.id, `Fetching ${coin} signal…`);

    if (!isEnabled(chatId)) {
      await sendMessage(chatId, formatBotDisabledMessage());
      return;
    }

    const user = getUser(chatId);
    const sub = user.subscriptions.get(coin);
    if (!sub) {
      await sendMessage(chatId, `ℹ️ Not subscribed to <b>${coin}USDT</b>. Send <code>/${coin}</code> to subscribe.`);
      return;
    }

    await fetchAndSendSignal(chatId, coin, sub.longExchange, sub.shortExchange, true);
    return;
  }

  // ── ❌ Stop COIN ─────────────────────────────────────────────────
  const stopMatch = data.match(/^stop:([A-Z0-9]+)$/);
  if (stopMatch) {
    const coin = stopMatch[1];
    await answerCallbackQuery(query.id, `Stopping ${coin} signals…`);
    stopSignalLoop(chatId, coin);
    unsubscribe(chatId, coin);
    await sendMessage(chatId, formatUnsubscribeMessage(coin));
    return;
  }

  // ── ArbList page navigation ──────────────────────────────────────
  const arbListMatch = data.match(/^arblist(?:_refresh)?:(\d+)$/);
  if (arbListMatch) {
    const page = parseInt(arbListMatch[1], 10);
    await answerCallbackQuery(query.id, 'Loading…');

    if (!isEnabled(chatId)) {
      await sendMessage(chatId, formatBotDisabledMessage());
      return;
    }

    try {
      const { opportunities } = await fetchAllSpreads();
      const { text, totalPages } = formatArbListPage(opportunities, page);
      const keyboard = buildArbListKeyboard(page, totalPages);

      if (data.startsWith('arblist_refresh')) {
        // Edit the existing message in place
        await editMessage(chatId, messageId, text, keyboard);
      } else {
        // Send a new message for page navigation
        await sendMessage(chatId, text, keyboard);
      }
    } catch (err) {
      console.error('[Bot] ArbList callback error:', err.message);
      await sendMessage(chatId, formatErrorMessage('ArbList'));
    }
    return;
  }

  // Unknown callback
  await answerCallbackQuery(query.id);
}

// ── Update processor ──────────────────────────────────────────────────────────

async function processUpdate(update) {
  try {
    // ── Regular message / command ──────────────────────────────────
    if (update.message) {
      const chatId = update.message.chat.id;
      const text   = update.message.text;

      if (!text) return; // ignore photos, stickers, etc.

      // Ensure user state exists
      getUser(chatId);

      if (text.startsWith('/')) {
        await handleCommand(chatId, text);
      }
      // Ignore non-command messages (no need to respond to plain text for now)
    }

    // ── Inline button callback ─────────────────────────────────────
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  } catch (err) {
    console.error('[Bot] processUpdate error:', err.message);
  }
}

// ── Long-polling loop ─────────────────────────────────────────────────────────

async function poll() {
  if (isPolling) return; // prevent overlap
  isPolling = true;
  try {
    const data = await tgRequest('getUpdates', {
      offset,
      timeout: 20,       // long-poll timeout (seconds)
      allowed_updates: ['message', 'callback_query'],
    });

    if (data?.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        // Advance offset to acknowledge processed updates
        offset = update.update_id + 1;
        await processUpdate(update);
      }
    }
  } catch (err) {
    console.error('[Bot] Poll error:', err.message);
  } finally {
    isPolling = false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the bot polling loop.
 * Call this once from server.js after dotenv is loaded.
 *
 * @param {string} token  TELEGRAM_BOT_TOKEN from process.env
 */
export function startPolling(token) {
  if (!token) {
    console.warn('[Bot] No TELEGRAM_BOT_TOKEN — bot disabled.');
    return;
  }

  botToken = token;

  // Inject sendMessage into SignalScheduler to avoid circular imports
  injectSendMessage(sendMessage);

  // Wipe any pending updates from before the server started
  tgRequest('getUpdates', { offset: -1 }).then((data) => {
    if (data?.ok && data.result.length > 0) {
      offset = data.result[data.result.length - 1].update_id + 1;
    }
    console.log(`[Bot] Polling started (offset=${offset})`);
  });

  // Start polling loop
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

/**
 * Stop the polling loop (useful for tests / graceful shutdown).
 */
export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[Bot] Polling stopped.');
  }
}
