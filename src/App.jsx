import React from "react";
import { StoreProvider, useStore } from "./store/StoreContext.jsx";
import { styles } from "./styles.js";
import { Sidebar } from "./components/Sidebar.jsx";
import { ReviewView } from "./views/ReviewView.jsx";
import { ArchiveView } from "./views/ArchiveView.jsx";
import { PulseView } from "./views/PulseView.jsx";
import { JiraView } from "./views/JiraView.jsx";
import { SettingsView } from "./views/SettingsView.jsx";
import { BoardView } from "./views/BoardView.jsx";

// Thin view router. All state/actions live in the store; each view pulls what
// it needs via useStore(). This shell only decides which view to show.
function AppShell() {
  const { loaded, view, setView, settings, palette } = useStore();

  if (!loaded) {
    return (
      <div className={"sf-root" + (settings.darkMode ? "" : " light")}>
        <style>{styles}</style>
        {palette}
        <Sidebar view={view} setView={setView} pulseEnabled={settings.teamPulse} />
        <main className="sf-main"><div className="sf-wrap"><p className="sf-empty">Loading your board…</p></div></main>
      </div>
    );
  }

  if (view === "review") return <ReviewView />;
  if (view === "archive") return <ArchiveView />;
  if (view === "pulse") return <PulseView />;
  if (view === "jira") return <JiraView />;
  if (view === "settings") return <SettingsView />;
  return <BoardView />;
}

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}
