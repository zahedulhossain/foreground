import React from "react";

export function Sidebar({ view, setView, pulseEnabled }) {
  return (
    <nav className="sf-side">
      <button
        className={"sf-nav" + (view === "board" ? " active" : "")}
        onClick={() => setView("board")}
        title="Board"
        aria-label="Board"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      </button>
      <button
        className={"sf-nav" + (view === "review" ? " active" : "")}
        onClick={() => setView("review")}
        title="Review"
        aria-label="Review"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 3 3 5-6" />
        </svg>
      </button>
      <button
        className={"sf-nav" + (view === "jira" ? " active" : "")}
        onClick={() => setView("jira")}
        title="Jira"
        aria-label="Jira"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 13a8 8 0 0 1 8-8" />
          <path d="M20 11a8 8 0 0 1-8 8" />
          <path d="M12 5l3 3-3 3" />
          <path d="M12 19l-3-3 3-3" />
        </svg>
      </button>
      {pulseEnabled && (
        <button
          className={"sf-nav" + (view === "pulse" ? " active" : "")}
          onClick={() => setView("pulse")}
          title="Team Pulse"
          aria-label="Team Pulse"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l2 6 4-14 2 8 2-3h4" />
          </svg>
        </button>
      )}
      <div className="sf-side-spacer" />
      <button
        className={"sf-nav" + (view === "archive" ? " active" : "")}
        onClick={() => setView("archive")}
        title="Archive"
        aria-label="Archive"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
          <path d="M10 12h4" />
        </svg>
      </button>
      <button
        className={"sf-nav" + (view === "settings" ? " active" : "")}
        onClick={() => setView("settings")}
        title="Settings"
        aria-label="Settings"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
    </nav>
  );
}
