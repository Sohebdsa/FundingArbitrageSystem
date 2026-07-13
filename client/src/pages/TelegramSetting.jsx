import React, { useState, useEffect } from "react";
import { BaseURL } from "../utils/baseurl";

export default function TelegramSetting() {
  const [chatId, setChatId] = useState("");
  const [threshold, setThreshold] = useState("0.3");
  const [cooldown, setCooldown] = useState("60");
  const [onlyHighConf, setOnlyHighConf] = useState(false);
  const [silentMode, setSilentMode] = useState(false);
  const [parseMode, setParseMode] = useState("HTML");
  const [customTemplate, setCustomTemplate] = useState(
    "<b>[ArbScanner Alert]</b>\n" +
    "Coin: <code>{coin}</code>\n" +
    "Spread: <b>{spread}%</b>\n" +
    "Buy Side: {buy_exchange} ({buy_rate})\n" +
    "Sell Side: {sell_exchange} ({sell_rate})\n" +
    "Time Left: {time_left}" + "\n" +
    "Yield (APY): <b>~{apy}%</b>"
  );

  const [toastMessage, setToastMessage] = useState("");
  const [alertLogs, setAlertLogs] = useState([]);

  // Load from localStorage on mount
  useEffect(() => {
    const savedChatId = localStorage.getItem("tg_chat_id") || "";
    const savedThreshold = localStorage.getItem("tg_threshold") || "0.0150";
    const savedCooldown = localStorage.getItem("tg_cooldown") || "60";
    const savedOnlyHighConf = localStorage.getItem("tg_only_high_conf") === "true";
    const savedSilentMode = localStorage.getItem("tg_silent_mode") === "true";
    const savedParseMode = localStorage.getItem("tg_parse_mode") || "HTML";
    let savedTemplate = localStorage.getItem("tg_custom_template") || "";
    const savedLogs = JSON.parse(localStorage.getItem("tg_alert_logs") || "[]");

    // Auto-migration to append {time_left} to existing saved template if missing
    if (savedTemplate && !savedTemplate.includes("{time_left}")) {
      savedTemplate = savedTemplate.replace(
        "Yield (APY):",
        "Time Left: {time_left}\nYield (APY):"
      );
      localStorage.setItem("tg_custom_template", savedTemplate);
    }

    setChatId(savedChatId);
    setThreshold(savedThreshold);
    setCooldown(savedCooldown);
    setOnlyHighConf(savedOnlyHighConf);
    setSilentMode(savedSilentMode);
    setParseMode(savedParseMode);
    if (savedTemplate) {
      setCustomTemplate(savedTemplate);
    } else {
      // If no custom template is saved, default to the initial state
      localStorage.setItem("tg_custom_template", customTemplate);
    }
    setAlertLogs(savedLogs);
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 5000);
  };

  const handleSave = (e) => {
    if (e) e.preventDefault();
    localStorage.setItem("tg_chat_id", chatId);
    localStorage.setItem("tg_threshold", threshold);
    localStorage.setItem("tg_cooldown", cooldown);
    localStorage.setItem("tg_only_high_conf", onlyHighConf ? "true" : "false");
    localStorage.setItem("tg_silent_mode", silentMode ? "true" : "false");
    localStorage.setItem("tg_parse_mode", parseMode);
    localStorage.setItem("tg_custom_template", customTemplate);

    showToast("✓ Telegram configurations saved to LocalStorage.");
  };

  const handleTest = async () => {
    if (!chatId) {
      showToast("❌ Set Chat ID to send test message.");
      return;
    }

    // Save configurations first
    handleSave();

    const timestamp = new Date().toLocaleTimeString();

    // Generate a mock message using the template
    let message = customTemplate
      .replace(/{coin}/g, "BTC")
      .replace(/{spread}/g, "0.0385")
      .replace(/{buy_exchange}/g, "🟢 <b>Bybit</b>")
      .replace(/{buy_rate}/g, "-0.0125%")
      .replace(/{sell_exchange}/g, "🔴 <b>Binance</b>")
      .replace(/{sell_rate}/g, "+0.0260%")
      .replace(/{time_left}/g, "07h 45m 12s")
      .replace(/{apy}/g, "42.15");

    message = `🔔 <b>TEST ALERT MESSAGE</b>\n\n${message}`;

    try {
      showToast("⚡ Dispatching Telegram test alert...");

      const response = await fetch(`${BaseURL}api/telegram/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          message,
          parseMode,
          silent: silentMode
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showToast("✓ Telegram message sent successfully!");
        const newLog = {
          time: timestamp,
          status: "SUCCESS",
          details: "Test alert dispatched successfully."
        };
        const updatedLogs = [newLog, ...alertLogs].slice(0, 50);
        setAlertLogs(updatedLogs);
        localStorage.setItem("tg_alert_logs", JSON.stringify(updatedLogs));
      } else {
        showToast(`❌ Error: ${data.detail || data.error || "Upstream Telegram rejected command"}`);
        const newLog = {
          time: timestamp,
          status: "ERROR",
          details: data.detail || data.error || "Failed to deliver. Validate Chat ID."
        };
        const updatedLogs = [newLog, ...alertLogs].slice(0, 50);
        setAlertLogs(updatedLogs);
        localStorage.setItem("tg_alert_logs", JSON.stringify(updatedLogs));
      }
    } catch (err) {
      showToast(`❌ Request Failed: ${err.message}`);
      const newLog = {
        time: timestamp,
        status: "FAILED",
        details: err.message
      };
      const updatedLogs = [newLog, ...alertLogs].slice(0, 50);
      setAlertLogs(updatedLogs);
      localStorage.setItem("tg_alert_logs", JSON.stringify(updatedLogs));
    }
  };

  const clearLogs = () => {
    setAlertLogs([]);
    localStorage.removeItem("tg_alert_logs");
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Telegram Settings</h1>
        <p className="page-description">Configure notification triggers for high-spread funding opportunities</p>
      </div>

      {toastMessage && (
        <div className="toast" style={{ width: "100%" }}>
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="premium-card calc-grid">
        <div className="premium-card-accent" />

        {/* Form panel */}
        <div>
          <h2 className="calc-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            Bot Details & Thresholds
          </h2>

          <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="calc-form">
            <div className="calc-input-group">
              <label className="calc-label">Target Chat / Channel ID</label>
              <div className="calc-input-wrapper">
                <input
                  type="text"
                  placeholder="e.g. -1004928104"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="calc-input-group">
                <label className="calc-label">Trigger Spread %</label>
                <div className="calc-input-wrapper">
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                  />
                  <span className="calc-suffix">%</span>
                </div>
              </div>

              <div className="calc-input-group">
                <label className="calc-label">Cooldown (Minutes)</label>
                <div className="calc-input-wrapper">
                  <input
                    type="number"
                    min="1"
                    value={cooldown}
                    onChange={(e) => setCooldown(e.target.value)}
                  />
                  <span className="calc-suffix">min</span>
                </div>
              </div>
            </div>

            <div className="calc-input-group">
              <label className="calc-label">Message Format Template</label>
              <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px" }}>
                <textarea
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    width: "100%",
                    height: "120px",
                    color: "var(--text-bright)",
                    fontFamily: "var(--mono)",
                    fontSize: "12px",
                    resize: "none"
                  }}
                  value={customTemplate}
                  onChange={(e) => setCustomTemplate(e.target.value)}
                />
              </div>
              <span style={{ fontSize: "9px", color: "var(--text-dim)", fontFamily: "var(--mono)", lineHeight: "1.4" }}>
                Variables: &#123;coin&#125;, &#123;spread&#125;, &#123;buy_exchange&#125;, &#123;buy_rate&#125;, &#123;sell_exchange&#125;, &#123;sell_rate&#125;, &#123;apy&#125;
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "6px 0" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  id="highConfOnly"
                  checked={onlyHighConf}
                  onChange={(e) => setOnlyHighConf(e.target.checked)}
                  style={{ cursor: "pointer", width: "16px", height: "16px" }}
                />
                <label htmlFor="highConfOnly" style={{ fontSize: "13px", color: "var(--text)", cursor: "pointer", userSelect: "none" }}>
                  Only alert on high confidence spreads (&gt; 0.03%)
                </label>
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  id="silentMode"
                  checked={silentMode}
                  onChange={(e) => setSilentMode(e.target.checked)}
                  style={{ cursor: "pointer", width: "16px", height: "16px" }}
                />
                <label htmlFor="silentMode" style={{ fontSize: "13px", color: "var(--text)", cursor: "pointer", userSelect: "none" }}>
                  Enable Silent Notifications (no vibration/sound)
                </label>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button type="submit" className="btn-primary">
                Save credentials
              </button>
              <button type="button" className="btn-primary" style={{ background: "transparent", color: "var(--blue)" }} onClick={handleTest}>
                Send Test Alert
              </button>
            </div>
          </form>
        </div>

        {/* Console / Status Logs panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="calc-section-title" style={{ margin: 0 }}>
              Alert Logs
            </h2>
            {alertLogs.length > 0 && (
              <button className="btn-update btn-update-sm" onClick={clearLogs}>
                Clear
              </button>
            )}
          </div>

          <div className="logs-panel">
            {alertLogs.length === 0 ? (
              <div style={{ color: "var(--text-dim)", fontStyle: "italic", textAlign: "center", marginTop: "40px" }}>
                No notifications logged yet. Run a test.
              </div>
            ) : (
              alertLogs.map((log, i) => (
                <div key={i} className="log-line">
                  <span className="log-time">[{log.time}]</span>
                  <span className={`log-tag ${log.status.toLowerCase()}`}>{log.status}:</span>
                  <span style={{ color: "var(--text-bright)" }}>{log.details}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
