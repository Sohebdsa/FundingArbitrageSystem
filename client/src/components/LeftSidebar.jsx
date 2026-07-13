import React from "react";

export default function LeftSidebar({ currentPage, setCurrentPage, mobileOpen, setMobileOpen }) {
  const menuItems = [
    {
      id: "home",
      name: "Home",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      )
    },
    {
      id: "arb-scanner",
      name: "Arb Scanner",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          <path d="M2 12h20" />
        </svg>
      )
    },
    {
      id: "arb-list",
      name: "Arb List",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      )
    },
    {
      id: "calculate-apy",
      name: "Calculate APY",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
          <line x1="9" y1="22" x2="9" y2="16" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <line x1="16" y1="16" x2="16" y2="22" />
          <line x1="12" y1="16" x2="12" y2="22" />
          <line x1="8" y1="16" x2="8" y2="22" />
          <circle cx="9" cy="11" r="1" />
          <circle cx="15" cy="11" r="1" />
          <circle cx="12" cy="11" r="1" />
        </svg>
      )
    },
    {
      id: "telegram-setting",
      name: "Telegram Setting",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2L11 13" />
          <path d="M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      )
    },
    {
      id: "execution-engine",
      name: "Execution Engine",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" />
          <line x1="20" y1="15" x2="23" y2="15" />
          <line x1="1" y1="9" x2="4" y2="9" />
          <line x1="1" y1="15" x2="4" y2="15" />
        </svg>
      )
    }
  ];

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-backdrop-mobile" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`left-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-dot" />
          <span className="brand-name">ArbScanner</span>
        </div>

        <nav className="left-sidebar-nav">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`nav-link ${currentPage === item.id ? "active" : ""}`}
              onClick={() => {
                setCurrentPage(item.id);
                setMobileOpen(false);
              }}
            >
              <span className="nav-link-icon">{item.icon}</span>
              <span>{item.name}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-status-footer">
          <div className="status-indicator">
            <span className="status-dot" />
            <span>Vite Dev Server</span>
          </div>
          <div>Delta-Neutral Engine</div>
        </div>
      </aside>
    </>
  );
}
