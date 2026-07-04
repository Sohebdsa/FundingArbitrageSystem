import React, { useState, useEffect, useRef } from "react";
import { EXCHANGES } from "../../utils/FundingApi/exchanges";
import ExchangeIcon from "./ExchangeIcon";

export default function ExchangeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = EXCHANGES[value];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="exchange-select-wrap" ref={ref}>
      <button
        type="button"
        className="exchange-select-trigger"
        style={{ "--ex-color": current.color, "--ex-bg": current.bgColor, "--ex-border": current.borderColor }}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ExchangeIcon exchangeId={value} size={20} />
        <span className="exchange-select-name">{current.name}</span>
        <svg className={`exchange-caret ${open ? "open" : ""}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul className="exchange-dropdown" role="listbox">
          {Object.values(EXCHANGES).map((ex) => (
            <li
              key={ex.id}
              role="option"
              aria-selected={ex.id === value}
              className={`exchange-option ${ex.id === value ? "selected" : ""}`}
              style={{ "--ex-color": ex.color, "--ex-bg": ex.bgColor }}
              onClick={() => { onChange(ex.id); setOpen(false); }}
            >
              <ExchangeIcon exchangeId={ex.id} size={22} />
              <div className="exchange-option-info">
                <span className="exchange-option-name">{ex.name}</span>
                <span className="exchange-option-label">{ex.label}</span>
              </div>
              {ex.id === value && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7l4 4 6-6" stroke={ex.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
