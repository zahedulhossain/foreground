import React from "react";
import { BUCKETS, DEFAULT_JQL } from "../constants.js";
import { renderTitle } from "../lib/markdown.js";
import { autoSize } from "../lib/dom.js";
import { uid } from "../lib/ids.js";
import { styles } from "../styles.js";
import { Sidebar } from "../components/Sidebar.jsx";
import { useStore } from "../store/StoreContext.jsx";

export function JiraView() {
  const {
    activeTasks, archive, archivedTasks, bulkRefreshLinked, flashTask, importSelectedIssues, jiraBulkStatus, jiraConfigured, jiraCreds, jiraImportBucket, jiraImportSel, jiraImportTeam, jiraQuery, jiraResults, jiraSearchError, jiraSearchState, jiraTestStatus, palette, persistJiraCreds, restore, runJiraSearch, setJiraCreds, setJiraImportBucket, setJiraImportSel, setJiraImportTeam, setJiraQuery, setJiraTestStatus, setView, settings, tasks, teams, view,
  } = useStore();
    const linkedActive = activeTasks.filter((t) => t.jira && t.jira.key);
    const linkedArchived = archivedTasks.filter((t) => t.jira && t.jira.key);
    const allLinked = [...linkedActive, ...linkedArchived];
    const linkedKeys = new Set(allLinked.map((t) => t.jira.key));
    // Drift: ticket Done in Jira but task still open here, and vice versa.
    const driftDone = linkedActive.filter((t) => t.jira.statusCategory === "done");
    const driftOpen = linkedArchived.filter(
      (t) => t.jira.statusCategory && t.jira.statusCategory !== "done"
    );

    const presets = [
      { label: "My open issues", jql: DEFAULT_JQL },
      { label: "Updated this week", jql: "assignee = currentUser() AND updated >= -7d ORDER BY updated DESC" },
      { label: "Reported by me, open", jql: "reporter = currentUser() AND statusCategory != Done ORDER BY updated DESC" },
    ];
    const toggleSel = (key) =>
      setJiraImportSel((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
    const dotClass = (cat) => "sf-jp-statusdot cat-" + (cat || "new");

    return (
      <div className={"sf-root" + (settings.darkMode ? "" : " light")}>
        <style>{styles}</style>
        {palette}
        <Sidebar view={view} setView={setView} pulseEnabled={settings.teamPulse} />
        <main className="sf-main">
          <div className="sf-wrap">
            <header>
              <h1 className="sf-h1">Jira</h1>
              <p className="sf-sub">
                Pull issues onto your board and keep linked tasks in sync. Foreground
                only reads — nothing here ever writes back to Jira.
              </p>
            </header>
            <hr className="sf-rule" />

            {/* Connection */}
            <div className="sf-jp-section">
              <div className="sf-jp-title">
                Connection{" "}
                {jiraConfigured && (
                  <span style={{ color: "#7c9a6d", fontSize: 12, marginLeft: 6 }}>● connected</span>
                )}
              </div>
              <div className="sf-jp-sub">
                Create a token at{" "}
                <span className="sf-mono">id.atlassian.com/manage-profile/security/api-tokens</span>.
                Two types work, both with an <span className="sf-mono">ATATT…</span> prefix —{" "}
                <b>classic</b> (fill email, leave Cloud ID blank) or <b>scoped</b> (leave email blank,
                fill Cloud ID; scopes <span className="sf-mono">read:jira-work</span> or{" "}
                <span className="sf-mono">read:issue:jira</span> + <span className="sf-mono">read:issue-meta:jira</span>).
              </div>
              <div className="sf-jp-card">
                <div className="sf-jira-grid">
                  <label htmlFor="jira-base">Base URL</label>
                  <input
                    id="jira-base"
                    type="text"
                    placeholder="https://acme.atlassian.net"
                    value={jiraCreds.baseUrl}
                    onChange={(e) => setJiraCreds((c) => ({ ...c, baseUrl: e.target.value }))}
                  />
                  <label htmlFor="jira-email">Email <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>(classic only)</span></label>
                  <input
                    id="jira-email"
                    type="email"
                    placeholder="you@company.com — leave blank for scoped tokens"
                    value={jiraCreds.email}
                    onChange={(e) => setJiraCreds((c) => ({ ...c, email: e.target.value }))}
                  />
                  <label htmlFor="jira-token">API token</label>
                  <input
                    id="jira-token"
                    type="password"
                    placeholder="atatt..."
                    value={jiraCreds.token}
                    onChange={(e) => setJiraCreds((c) => ({ ...c, token: e.target.value }))}
                  />
                  <label htmlFor="jira-cloudid">Cloud ID <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>(scoped only)</span></label>
                  <input
                    id="jira-cloudid"
                    type="text"
                    placeholder="leave blank for classic tokens"
                    value={jiraCreds.cloudId}
                    onChange={(e) => setJiraCreds((c) => ({ ...c, cloudId: e.target.value }))}
                  />
                </div>
                {!jiraCreds.email && (
                  <div className="sf-set-desc" style={{ marginTop: 8 }}>
                    <b>Finding your Cloud ID:</b> open{" "}
                    <span className="sf-mono">{(jiraCreds.baseUrl || "https://YOUR-SITE.atlassian.net").replace(/\/+$/, "")}/_edge/tenant_info</span>{" "}
                    in a browser while signed in — copy the <span className="sf-mono">cloudId</span> from the JSON.
                  </div>
                )}
                <div className="sf-jira-actions">
                  <button
                    className="sf-set-btn"
                    onClick={async () => {
                      setJiraTestStatus({ kind: "info", msg: "testing…" });
                      try {
                        const r = await window.jira.test(jiraCreds);
                        setJiraTestStatus({ kind: "ok", msg: `Connected as ${r.displayName}.` });
                        persistJiraCreds(jiraCreds);
                      } catch (e) {
                        setJiraTestStatus({ kind: "err", msg: String((e && e.message) || e) });
                      }
                    }}
                    disabled={!jiraCreds.baseUrl || !jiraCreds.token}
                  >Test &amp; save</button>
                  {jiraConfigured && (
                    <button
                      className="sf-set-btn danger"
                      onClick={() => {
                        persistJiraCreds({ baseUrl: "", email: "", token: "", cloudId: "" });
                        setJiraTestStatus({ kind: "ok", msg: "Disconnected." });
                      }}
                    >Disconnect</button>
                  )}
                  {jiraTestStatus && (
                    <span className={"sf-set-status " + (jiraTestStatus.kind === "ok" ? "ok" : jiraTestStatus.kind === "err" ? "err" : "")} style={{ marginTop: 0 }}>
                      {jiraTestStatus.msg}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Import */}
            <div className="sf-jp-section">
              <div className="sf-jp-title">Import issues</div>
              <div className="sf-jp-sub">
                Search Jira, then pull selected issues onto the board — titled
                “KEY summary”, with the link attached so the status chip stays live.
              </div>
              <div className="sf-jp-card">
                {!jiraConfigured ? (
                  <div className="sf-jp-notready">Connect Jira above to import issues.</div>
                ) : (
                  <>
                    <div className="sf-jp-searchbar">
                      <input
                        className="sf-jp-jql"
                        value={jiraQuery}
                        onChange={(e) => setJiraQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runJiraSearch(); } }}
                        placeholder="JQL — e.g. assignee = currentUser() AND statusCategory != Done"
                      />
                      <button
                        className="sf-set-btn"
                        onClick={() => runJiraSearch()}
                        disabled={jiraSearchState === "loading"}
                      >{jiraSearchState === "loading" ? "Searching…" : "Search"}</button>
                    </div>
                    <div className="sf-jp-presets">
                      {presets.map((p) => (
                        <button
                          key={p.label}
                          className="sf-jp-preset"
                          onClick={() => { setJiraQuery(p.jql); runJiraSearch(p.jql); }}
                        >{p.label}</button>
                      ))}
                    </div>

                    {jiraSearchState === "error" && (
                      <div className="sf-set-status err" style={{ marginTop: 10 }}>{jiraSearchError}</div>
                    )}

                    {jiraResults && (
                      <div className="sf-jp-results">
                        {jiraResults.length === 0 ? (
                          <div className="sf-jp-empty">No issues match this query.</div>
                        ) : jiraResults.map((r) => {
                          const already = linkedKeys.has(r.key);
                          const sel = jiraImportSel.has(r.key);
                          return (
                            <div
                              key={r.key}
                              className={"sf-jp-row" + (already ? " linked" : "")}
                              onClick={() => { if (!already) toggleSel(r.key); }}
                            >
                              <div className={"sf-jp-check" + ((sel || already) ? " on" : "")}>
                                {(sel || already) ? "✓" : ""}
                              </div>
                              <div className="sf-jp-row-body">
                                <div className="sf-jp-row-title">{r.summary || "(no summary)"}</div>
                                <div className="sf-jp-row-meta">
                                  <span className="sf-jp-key">{r.key}</span>
                                  <span className={dotClass(r.statusCategory)} />
                                  {r.status || "—"}
                                  {already && <span>· already on board</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {jiraResults && jiraResults.length > 0 && (
                      <div className="sf-jp-importbar">
                        <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                          {jiraImportSel.size} selected
                        </span>
                        <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>into</span>
                        <select className="sf-sel" value={jiraImportBucket} onChange={(e) => setJiraImportBucket(e.target.value)}>
                          {BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                        </select>
                        <input
                          className="sf-sel"
                          list="sf-teams-import"
                          placeholder="Team…"
                          value={jiraImportTeam}
                          onChange={(e) => setJiraImportTeam(e.target.value)}
                          style={{ flex: "0 1 130px" }}
                        />
                        <datalist id="sf-teams-import">
                          {teams.map((s) => <option key={s} value={s} />)}
                        </datalist>
                        <button
                          className="sf-btn"
                          onClick={importSelectedIssues}
                          disabled={jiraImportSel.size === 0}
                        >Import</button>
                        {jiraBulkStatus && (
                          <span className={"sf-set-status " + (jiraBulkStatus.kind === "ok" ? "ok" : jiraBulkStatus.kind === "err" ? "err" : "")} style={{ marginTop: 0 }}>
                            {jiraBulkStatus.msg}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Linked dashboard */}
            {jiraConfigured && allLinked.length > 0 && (
              <div className="sf-jp-section">
                <div className="sf-jp-head">
                  <div>
                    <div className="sf-jp-title">Linked tasks ({allLinked.length})</div>
                    <div className="sf-jp-sub">Every task with a Jira link and its current status.</div>
                  </div>
                  <button className="sf-set-btn" onClick={bulkRefreshLinked}>Refresh all</button>
                </div>

                {(driftDone.length > 0 || driftOpen.length > 0) && (
                  <div className="sf-jp-drift">
                    <div className="sf-jp-drift-title">
                      Out of sync ({driftDone.length + driftOpen.length})
                    </div>
                    {driftDone.map((t) => (
                      <div key={t.id} className="sf-jp-drift-row">
                        <span className="sf-jp-statusdot cat-done" />
                        <div className="sf-jp-row-body">
                          <div className="sf-jp-row-title" dangerouslySetInnerHTML={{ __html: renderTitle(t.title) }} />
                          <div className="sf-jp-row-meta">
                            <span className="sf-jp-key">{t.jira.key}</span> Done in Jira · still open here
                          </div>
                        </div>
                        <button className="sf-mini" onClick={() => archive(t.id)} title="Archive this task">archive</button>
                      </div>
                    ))}
                    {driftOpen.map((t) => (
                      <div key={t.id} className="sf-jp-drift-row">
                        <span className={dotClass(t.jira.statusCategory)} />
                        <div className="sf-jp-row-body">
                          <div className="sf-jp-row-title" dangerouslySetInnerHTML={{ __html: renderTitle(t.title) }} />
                          <div className="sf-jp-row-meta">
                            <span className="sf-jp-key">{t.jira.key}</span> {t.jira.status || "open"} in Jira · archived here
                          </div>
                        </div>
                        <button className="sf-mini" onClick={() => restore(t.id)} title="Restore from archive">restore</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="sf-jp-results">
                  {allLinked.map((t) => {
                    const archived = !!t.archivedAt;
                    return (
                      <div
                        key={t.id}
                        className="sf-jp-row"
                        onClick={() => { setView(archived ? "archive" : "board"); setTimeout(() => flashTask(t.id), 30); }}
                      >
                        <span className={dotClass(t.jira.statusCategory)} style={{ marginTop: 6 }} />
                        <div className="sf-jp-row-body">
                          <div className="sf-jp-row-title" dangerouslySetInnerHTML={{ __html: renderTitle(t.title) }} />
                          <div className="sf-jp-row-meta">
                            <span className="sf-jp-key">{t.jira.key}</span>
                            {t.jira.status || (t.jira.error ? "sync failed" : "not synced")}
                            <span>· {archived ? "archive" : (BUCKETS.find((b) => b.id === t.bucket)?.label || t.bucket)}</span>
                          </div>
                        </div>
                        <a
                          href={t.jira.url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="sf-mini"
                          onClick={(e) => { e.stopPropagation(); if (!t.jira.url) e.preventDefault(); }}
                        >open ↗</a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
}
