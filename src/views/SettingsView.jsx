import React from "react";
import { BUCKETS, DEFAULT_JQL, THEMES } from "../constants.js";
import { renderTitle } from "../lib/markdown.js";
import { autoSize } from "../lib/dom.js";
import { uid } from "../lib/ids.js";
import { styles } from "../styles.js";
import { rootClass } from "../lib/theme.js";
import { Sidebar } from "../components/Sidebar.jsx";
import { useStore } from "../store/StoreContext.jsx";

export function SettingsView() {
  const {
    balance, exportData, fileInputRef, importData, ioStatus, jiraConfigured, palette, restore, saveState, setSettings, setView, settings, tasks, teams, view,
  } = useStore();
    return (
      <div className={rootClass(settings)}>
        <style>{styles}</style>
        {palette}
        <Sidebar view={view} setView={setView} pulseEnabled={settings.teamPulse} />
        <main className="sf-main">
          <div className="sf-wrap">
            <header>
              <h1 className="sf-h1">Settings</h1>
              <p className="sf-sub">Tune Foreground to fit how you work. Changes save automatically.</p>
            </header>
            <hr className="sf-rule" />
            <div className="sf-settings-card">
              <div className="sf-set-row">
                <div>
                  <div className="sf-set-label">Dark mode</div>
                  <div className="sf-set-desc">
                    Dark by default. Switch to light if you'd rather work on a bright
                    background — your chosen color theme applies to both.
                  </div>
                </div>
                <button
                  className={"sf-toggle" + (settings.darkMode ? " on" : "")}
                  onClick={() => setSettings((s) => ({ ...s, darkMode: !s.darkMode }))}
                  aria-pressed={settings.darkMode}
                  aria-label="Toggle dark mode"
                />
              </div>

              <div className="sf-set-row">
                <div style={{ flex: 1 }}>
                  <div className="sf-set-label">Color theme</div>
                  <div className="sf-set-desc">
                    Pick the palette that suits you. Each theme has its own light
                    variant — toggle dark mode above to switch.
                  </div>
                  <div className="sf-theme-opts">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={"sf-theme-opt" + (settings.theme === t.id ? " active" : "")}
                        onClick={() => setSettings((s) => ({ ...s, theme: t.id }))}
                        aria-pressed={settings.theme === t.id}
                      >
                        <div className="sf-theme-swatch">
                          {t.swatch.map((c, i) => (
                            <span key={i} style={{ background: c }} />
                          ))}
                        </div>
                        <div className="sf-theme-name">
                          {t.name}
                          <span className="sf-theme-dot" />
                        </div>
                        <div className="sf-theme-desc">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="sf-set-row">
                <div>
                  <div className="sf-set-label">Today cap</div>
                  <div className="sf-set-desc">
                    The maximum number of open items in Today before you get the gentle nudge.
                    Three is the default — a ceiling, not a target.
                  </div>
                </div>
                <input
                  className="sf-set-num"
                  type="number"
                  min={1}
                  max={20}
                  value={settings.todayCap}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (Number.isFinite(n) && n >= 1 && n <= 20) {
                      setSettings((s) => ({ ...s, todayCap: n }));
                    }
                  }}
                />
              </div>

              <div className="sf-set-row">
                <div>
                  <div className="sf-set-label">Show "Where your attention is going"</div>
                  <div className="sf-set-desc">
                    The cross-team balance bars under the buckets. Turn off if the visual
                    nudge isn't useful for you right now.
                  </div>
                </div>
                <button
                  className={"sf-toggle" + (settings.showBalance ? " on" : "")}
                  onClick={() => setSettings((s) => ({ ...s, showBalance: !s.showBalance }))}
                  aria-pressed={settings.showBalance}
                  aria-label="Toggle balance panel"
                />
              </div>

              <div className="sf-set-row">
                <div>
                  <div className="sf-set-label">Team Pulse <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>(beta)</span></div>
                  <div className="sf-set-desc">
                    Adds a Jira-backed page tracking your teams' load, progress, and who's
                    carrying what. Requires Jira to be connected. Shows a new sidebar icon
                    when on.
                  </div>
                </div>
                <button
                  className={"sf-toggle" + (settings.teamPulse ? " on" : "")}
                  onClick={() => setSettings((s) => ({ ...s, teamPulse: !s.teamPulse }))}
                  aria-pressed={settings.teamPulse}
                  aria-label="Toggle Team Pulse"
                />
              </div>

              <div className="sf-set-row">
                <div>
                  <div className="sf-set-label">Backup & restore</div>
                  <div className="sf-set-desc">
                    Export your tasks and settings to a JSON file, or restore from a previous
                    export. Importing replaces everything on the board.
                  </div>
                  {ioStatus && (
                    <div className={"sf-set-status " + (ioStatus.kind === "ok" ? "ok" : "err")}>
                      {ioStatus.msg}
                    </div>
                  )}
                </div>
                <div className="sf-set-btns">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files && e.target.files[0];
                      importData(f);
                      e.target.value = "";
                    }}
                  />
                  <button className="sf-set-btn" onClick={() => fileInputRef.current?.click()}>
                    Import…
                  </button>
                  <button className="sf-set-btn" onClick={exportData} disabled={tasks.length === 0}>
                    Export
                  </button>
                </div>
              </div>

              <div className="sf-set-row">
                <div>
                  <div className="sf-set-label">
                    Jira integration{" "}
                    {jiraConfigured && <span style={{ color: "var(--success)", fontSize: 11, marginLeft: 6 }}>● connected</span>}
                  </div>
                  <div className="sf-set-desc">
                    Connect Jira to enrich pasted issue keys, import your open issues, and
                    keep linked tasks in sync. Credentials and import tools now live on the
                    dedicated Jira page.
                  </div>
                </div>
                <button className="sf-set-btn" onClick={() => setView("jira")}>
                  Open Jira page →
                </button>
              </div>
            </div>

            <div className="sf-footer">
              <div className="sf-review" />
              <span className="sf-saving">
                {saveState === "saving" && "saving…"}
                {saveState === "saved" && "saved ✓"}
                {saveState === "error" && "⚠ save failed"}
              </span>
            </div>
          </div>
        </main>
      </div>
    );
}
