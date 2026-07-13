// ── SignalScheduler.js ───────────────────────────────────────────────────────
// Adaptive one-shot timer engine.
// Each (chatId, coin) pair runs its own independent cycle.
//
// Timer tiers based on countdown to next funding event:
//   > 30 min  → fire every 30 min
//   > 10 min  → fire every 10 min
//   >  3 min  → fire every  3 min
//   >  0 min  → fire every  1 min
//   ≤  0      → funding fired, reset cycle (wait for next funding window)

import { fetchCoinSignal } from './SpreadFetcher.js';
import { setTimer, clearTimer, hasSubscription, isEnabled } from './UserStateStore.js';
import {
  formatSignalMessage,
  formatErrorMessage,
  formatUnsubscribeMessage,
} from './MessageTemplates.js';

// sendMessage is injected at startup to avoid circular imports
let _sendMessage = null;

export function injectSendMessage(fn) {
  _sendMessage = fn;
}

// ── Interval calculator ───────────────────────────────────────────────────────

/**
 * Returns the next interval in ms and the human-readable label.
 * @param {number} nextFundingTime  Unix ms timestamp of next funding event
 * @returns {{ intervalMs: number, labelMin: number }}
 */
export function getNextInterval(nextFundingTime) {
  if (!nextFundingTime || nextFundingTime <= 0) {
    // No funding time available — default to 30 min poll
    return { intervalMs: 30 * 60_000, labelMin: 30 };
  }

  const diffMs = nextFundingTime - Date.now();

  if (diffMs <= 0) {
    // Funding event has fired — wait 2 min for data to refresh then restart
    return { intervalMs: 2 * 60_000, labelMin: 2, isFired: true };
  }
  if (diffMs <= 3 * 60_000)  return { intervalMs: 1  * 60_000, labelMin: 1  };
  if (diffMs <= 10 * 60_000) return { intervalMs: 3  * 60_000, labelMin: 3  };
  if (diffMs <= 30 * 60_000) return { intervalMs: 10 * 60_000, labelMin: 10 };
  return                            { intervalMs: 30 * 60_000, labelMin: 30 };
}

// ── Core: fetch → format → send → reschedule ─────────────────────────────────

/**
 * Fetch fresh data for one (chatId, coin) pair, send the signal,
 * then schedule the next fire.
 *
 * @param {string}  chatId
 * @param {string}  coin
 * @param {string}  longExchange
 * @param {string}  shortExchange
 * @param {boolean} isOnDemand  true = called from "Get Signal Now" button
 */
export async function fetchAndSendSignal(chatId, coin, longExchange, shortExchange, isOnDemand = false) {
  // Guard: user may have turned off the bot or unsubscribed while timer was pending
  if (!isEnabled(chatId) || !hasSubscription(chatId, coin)) {
    return;
  }

  if (!_sendMessage) {
    console.error('[SignalScheduler] sendMessage not injected!');
    return;
  }

  try {
    const opportunity = await fetchCoinSignal(coin, longExchange, shortExchange);

    if (!opportunity) {
      // Pair no longer exists (maybe BloFin went down)
      if (!isOnDemand) {
        // Still reschedule — data may recover
        scheduleNext(chatId, coin, longExchange, shortExchange, 0);
      } else {
        await _sendMessage(chatId, formatErrorMessage(`no data for ${coin}USDT`));
      }
      return;
    }

    const { intervalMs, labelMin, isFired } = getNextInterval(opportunity.nextFundingTime);

    const message = formatSignalMessage({
      coin,
      opportunity,
      nextIntervalMin: isOnDemand ? null : labelMin,
      isOnDemand,
    });

    // Inline keyboard for on-demand button + stop
    const replyMarkup = buildSignalKeyboard(coin);

    await _sendMessage(chatId, message, replyMarkup);

    // Only reschedule automatic timers (not on-demand calls)
    if (!isOnDemand) {
      if (isFired) {
        // Funding just fired — wait for data cycle to refresh, then restart
        console.log(`[Scheduler] ${coin} funding fired for ${chatId}, waiting 2min for reset`);
        scheduleNext(chatId, coin, longExchange, shortExchange, intervalMs);
      } else {
        scheduleNext(chatId, coin, longExchange, shortExchange, intervalMs);
      }
    }
  } catch (err) {
    console.error(`[SignalScheduler] Error for ${chatId}/${coin}:`, err.message);
    if (!isOnDemand) {
      // Retry in 5 min on transient errors
      scheduleNext(chatId, coin, longExchange, shortExchange, 5 * 60_000);
    }
  }
}

// ── Inline keyboard builder ───────────────────────────────────────────────────

function buildSignalKeyboard(coin) {
  return {
    inline_keyboard: [
      [
        { text: '📡 Get Signal Now', callback_data: `signal_now:${coin}` },
        { text: `❌ Stop ${coin}`,   callback_data: `stop:${coin}` },
      ],
    ],
  };
}

// ── Timer management ──────────────────────────────────────────────────────────

/**
 * Schedule the next signal for a (chatId, coin) pair.
 * Stores the timer handle in UserStateStore (which cancels any previous one).
 */
function scheduleNext(chatId, coin, longExchange, shortExchange, intervalMs) {
  const handle = setTimeout(
    () => fetchAndSendSignal(chatId, coin, longExchange, shortExchange, false),
    intervalMs
  );
  setTimer(chatId, coin, handle);
  console.log(`[Scheduler] ${chatId}/${coin} next signal in ${Math.round(intervalMs / 60_000)}min`);
}

/**
 * Start the adaptive signal loop for a new subscription.
 * Sends the first signal immediately, then schedules adaptive follow-ups.
 *
 * @param {string} chatId
 * @param {string} coin
 * @param {string} longExchange
 * @param {string} shortExchange
 */
export async function startSignalLoop(chatId, coin, longExchange, shortExchange) {
  // Cancel any pre-existing timer for this (chatId, coin)
  clearTimer(chatId, coin);

  // Send first signal immediately (so user gets confirmation right away)
  await fetchAndSendSignal(chatId, coin, longExchange, shortExchange, false);
}

/**
 * Stop the signal loop for a specific (chatId, coin).
 */
export function stopSignalLoop(chatId, coin) {
  clearTimer(chatId, coin);
}
