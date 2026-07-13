// ── UserStateStore.js ────────────────────────────────────────────────────────
// In-memory per-user state. Each Telegram chat ID gets its own independent
// state object. State resets on server restart (no persistence needed for MVP).

/**
 * @typedef {Object} Subscription
 * @property {string} coin
 * @property {string} longExchange
 * @property {string} shortExchange
 */

/**
 * @typedef {Object} UserState
 * @property {string}                chatId
 * @property {boolean}               enabled
 * @property {Map<string, Subscription>} subscriptions   coin → sub details
 * @property {Map<string, any>}      signalTimers        coin → timer handle
 */

/** @type {Map<string, UserState>} */
const store = new Map();

// ── Internal factory ──────────────────────────────────────────────────────────

function createUser(chatId) {
  return {
    chatId: String(chatId),
    enabled: true,       // users start enabled when they first interact
    subscriptions: new Map(),
    signalTimers: new Map(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the user state for a given chatId, creating it if first visit.
 * @param {string|number} chatId
 * @returns {UserState}
 */
export function getUser(chatId) {
  const id = String(chatId);
  if (!store.has(id)) {
    store.set(id, createUser(id));
  }
  return store.get(id);
}

/**
 * Enable or disable the bot for a specific user.
 */
export function setEnabled(chatId, enabled) {
  const user = getUser(chatId);
  user.enabled = enabled;
}

/**
 * Check if the bot is enabled for a user.
 */
export function isEnabled(chatId) {
  return getUser(chatId).enabled;
}

/**
 * Add a coin subscription. Does NOT start the timer — that's the scheduler's job.
 * @param {string|number} chatId
 * @param {string}        coin           e.g. "BTC"
 * @param {string}        longExchange   e.g. "binance"
 * @param {string}        shortExchange  e.g. "bybit"
 */
export function subscribe(chatId, coin, longExchange, shortExchange) {
  const user = getUser(chatId);
  user.subscriptions.set(coin.toUpperCase(), {
    coin: coin.toUpperCase(),
    longExchange,
    shortExchange,
  });
}

/**
 * Remove a coin subscription and cancel its timer.
 * @param {string|number} chatId
 * @param {string}        coin
 * @returns {boolean} true if the subscription existed
 */
export function unsubscribe(chatId, coin) {
  const user = getUser(chatId);
  const upperCoin = coin.toUpperCase();
  const existed = user.subscriptions.has(upperCoin);

  user.subscriptions.delete(upperCoin);

  // Cancel the timer if running
  if (user.signalTimers.has(upperCoin)) {
    clearTimeout(user.signalTimers.get(upperCoin));
    user.signalTimers.delete(upperCoin);
  }

  return existed;
}

/**
 * Cancel all subscriptions and timers for a user (/off command).
 */
export function clearAll(chatId) {
  const user = getUser(chatId);

  // Cancel every running timer
  user.signalTimers.forEach((timer) => clearTimeout(timer));
  user.signalTimers.clear();
  user.subscriptions.clear();
}

/**
 * Check if a user is already subscribed to a coin.
 */
export function hasSubscription(chatId, coin) {
  return getUser(chatId).subscriptions.has(coin.toUpperCase());
}

/**
 * Get the subscription details for a specific coin.
 * @returns {Subscription|undefined}
 */
export function getSubscription(chatId, coin) {
  return getUser(chatId).subscriptions.get(coin.toUpperCase());
}

/**
 * Get all subscriptions for a user.
 * @returns {Map<string, Subscription>}
 */
export function getSubscriptions(chatId) {
  return getUser(chatId).subscriptions;
}

/**
 * Store a timer handle for a (chatId, coin) pair.
 * Automatically cancels any existing timer before storing the new one.
 */
export function setTimer(chatId, coin, timerHandle) {
  const user = getUser(chatId);
  const upperCoin = coin.toUpperCase();

  // Cancel existing timer if any
  if (user.signalTimers.has(upperCoin)) {
    clearTimeout(user.signalTimers.get(upperCoin));
  }

  user.signalTimers.set(upperCoin, timerHandle);
}

/**
 * Clear the timer for a specific (chatId, coin) pair.
 */
export function clearTimer(chatId, coin) {
  const user = getUser(chatId);
  const upperCoin = coin.toUpperCase();
  if (user.signalTimers.has(upperCoin)) {
    clearTimeout(user.signalTimers.get(upperCoin));
    user.signalTimers.delete(upperCoin);
  }
}

/**
 * Returns a list of all chatIds that have the bot enabled and at least one subscription.
 * Useful for diagnostics.
 */
export function getAllActiveUsers() {
  const result = [];
  store.forEach((user) => {
    if (user.enabled && user.subscriptions.size > 0) {
      result.push(user.chatId);
    }
  });
  return result;
}
