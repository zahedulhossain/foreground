import React from "react";
import { BUCKETS, DEFAULT_JQL } from "../constants.js";
import { renderTitle } from "../lib/markdown.js";
import { autoSize } from "../lib/dom.js";
import { uid } from "../lib/ids.js";
import { styles } from "../styles.js";
import { Sidebar } from "../components/Sidebar.jsx";
import { useStore } from "../store/StoreContext.jsx";

export function PulseView() {
  const {
    dragId, jiraConfigured, loadPulseBoards, loadPulseFields, loadPulseStatuses, palette, persistPulseConfig, pulseAllFields, pulseBoards, pulseConfig, pulseData, pulseDraft, pulseDragId, pulseDropBeforeId, pulseFieldHint, pulseLastRun, pulseLoading, pulsePointSearch, pulseStatusOpen, pulseStatuses, refreshPulse, setPulseDraft, setPulseDragId, setPulseDropBeforeId, setPulsePointSearch, setPulseStatusOpen, setView, settings, teams, view, windowLabel,
  } = useStore();
    const usePoints = pulseConfig.progressUnit === "points";
    const addPulseTeam = () => {
      const name = pulseDraft.name.trim();
      if (!name) return;
      let team;
      if (pulseDraft.source === "board") {
        if (!pulseDraft.boardId) return;
        const b = (pulseBoards || []).find((x) => String(x.id) === String(pulseDraft.boardId));
        team = { id: uid(), name, source: "board", boardId: Number(pulseDraft.boardId), boardType: b ? b.type : null };
      } else {
        if (!pulseDraft.jql.trim()) return;
        team = { id: uid(), name, source: "jql", jql: pulseDraft.jql.trim() };
      }
      persistPulseConfig({ ...pulseConfig, teams: [...pulseConfig.teams, team] });
      setPulseDraft({ name: "", source: pulseDraft.source, boardId: "", jql: "" });
    };
    const removePulseTeam = (id) =>
      persistPulseConfig({ ...pulseConfig, teams: pulseConfig.teams.filter((t) => t.id !== id) });

    const updatePulseTeam = (id, patch) =>
      persistPulseConfig({
        ...pulseConfig,
        teams: pulseConfig.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      });

    // Reorder teams. beforeId === null appends to the end. The Pulse cards
    // iterate the same array, so they re-sort to match automatically.
    const reorderPulseTeams = (dragId, beforeId) => {
      if (!dragId || dragId === beforeId) return;
      const teams = [...pulseConfig.teams];
      const from = teams.findIndex((t) => t.id === dragId);
      if (from < 0) return;
      const [moved] = teams.splice(from, 1);
      let to = beforeId ? teams.findIndex((t) => t.id === beforeId) : teams.length;
      if (to < 0) to = teams.length;
      teams.splice(to, 0, moved);
      persistPulseConfig({ ...pulseConfig, teams });
    };

    const maxLoad = Math.max(
      1,
      ...Object.values(pulseData).flatMap((d) =>
        d && d.assignees ? d.assignees.map((a) => (usePoints ? a.points : a.count)) : [0]
      )
    );

    return (
      <div className={"sf-root" + (settings.darkMode ? "" : " light")}>
        <style>{styles}</style>
        {palette}
        <Sidebar view={view} setView={setView} pulseEnabled={settings.teamPulse} />
        <main className="sf-main">
          <div className="sf-wrap">
            <header>
              <h1 className="sf-h1">Team Pulse</h1>
              <p className="sf-sub">
                Where each team's work sits and who's carrying it — pulled live from Jira.
                A planning aid for spreading load and spotting blockers, not a monitoring tool.
              </p>
            </header>
            <hr className="sf-rule" />

            {!jiraConfigured ? (
              <div className="sf-jp-notready">
                Connect Jira first — Team Pulse reads your teams' issues through it.
                <br />
                <button className="sf-set-btn" style={{ marginTop: 12 }} onClick={() => setView("jira")}>
                  Open Jira page →
                </button>
              </div>
            ) : (
              <>
                {/* Config */}
                <div className="sf-jp-section">
                  <div className="sf-jp-head">
                    <div>
                      <div className="sf-jp-title">Tracked teams</div>
                      <div className="sf-jp-sub">
                        Map each team to a Jira board (gives Scrum/Kanban detection + sprint
                        progress) or a raw JQL query.
                      </div>
                    </div>
                  </div>
                  <div className="sf-tp-controls">
                    <select
                      className="sf-sel"
                      value={pulseConfig.progressUnit}
                      onChange={(e) => persistPulseConfig({ ...pulseConfig, progressUnit: e.target.value })}
                      title="Progress unit"
                    >
                      <option value="count">Count issues</option>
                      <option value="points">Story points</option>
                    </select>
                    <select
                      className="sf-sel"
                      value={pulseConfig.doneWindowMode}
                      onChange={(e) => persistPulseConfig({ ...pulseConfig, doneWindowMode: e.target.value })}
                      title="Done window mode"
                    >
                      <option value="rolling">Rolling days</option>
                      <option value="range">Date range</option>
                    </select>
                    <div className="sf-tp-window">
                      {pulseConfig.doneWindowMode === "range" ? (
                        <>
                          <input
                            className="sf-sel"
                            type="date"
                            value={pulseConfig.doneWindowFrom}
                            onChange={(e) => persistPulseConfig({ ...pulseConfig, doneWindowFrom: e.target.value })}
                            title="Done from"
                          />
                          <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>→</span>
                          <input
                            className="sf-sel"
                            type="date"
                            value={pulseConfig.doneWindowTo}
                            onChange={(e) => persistPulseConfig({ ...pulseConfig, doneWindowTo: e.target.value })}
                            title="Done to"
                          />
                        </>
                      ) : (
                        <>
                          <input
                            className="sf-sel"
                            type="number"
                            min={1}
                            max={365}
                            value={pulseConfig.doneWindowDays}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10);
                              if (Number.isFinite(n) && n >= 1 && n <= 365) {
                                persistPulseConfig({ ...pulseConfig, doneWindowDays: n });
                              }
                            }}
                            style={{ width: 70 }}
                            title="Done window (days)"
                          />
                          <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>days done-window</span>
                        </>
                      )}
                    </div>
                  </div>

                  {usePoints && (() => {
                    const fq = pulsePointSearch.trim().toLowerCase();
                    const matches = pulseAllFields
                      ? pulseAllFields
                          .filter((f) => {
                            if (!fq) return true;
                            return (f.name || "").toLowerCase().includes(fq)
                              || String(f.id).toLowerCase().includes(fq);
                          })
                          .slice(0, 100)
                      : [];
                    return (
                      <div style={{ marginBottom: 12 }}>
                        <div className="sf-set-desc" style={{ marginBottom: 6 }}>
                          Default story-points field — instances often have several (e.g. “Story Points”
                          vs “Story point estimate”). Load fields, then search by name or id and pick yours.
                          Each team can override this in its row below.
                        </div>
                        <div className="sf-tp-addbar" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                          {!pulseAllFields ? (
                            <button className="sf-set-btn" onClick={loadPulseFields}>Load fields</button>
                          ) : (
                            <>
                              <input
                                className="sf-sel"
                                placeholder="Search fields by name or id…"
                                value={pulsePointSearch}
                                onChange={(e) => setPulsePointSearch(e.target.value)}
                                style={{ flex: "1 1 220px" }}
                              />
                              <select
                                className="sf-sel"
                                value={pulseConfig.pointsFieldId || ""}
                                onChange={(e) => persistPulseConfig({ ...pulseConfig, pointsFieldId: e.target.value || null })}
                                style={{ flex: "1 1 260px" }}
                              >
                                <option value="">
                                  {matches.length ? `Select field… (${matches.length} match${matches.length === 1 ? "" : "es"})` : "No matches"}
                                </option>
                                {matches.map((f) => (
                                  <option key={f.id} value={f.id}>{f.name} ({f.id})</option>
                                ))}
                              </select>
                              <button className="sf-set-btn" onClick={loadPulseFields} title="Reload field list">↻</button>
                            </>
                          )}
                          {pulseConfig.pointsFieldId && (
                            <button
                              className="sf-set-btn danger"
                              onClick={() => { persistPulseConfig({ ...pulseConfig, pointsFieldId: null }); }}
                            >Clear</button>
                          )}
                        </div>
                        <div className="sf-set-desc" style={{ marginTop: 6 }}>
                          Current: <span className="sf-mono">{pulseConfig.pointsFieldId || "not set"}</span>
                          {pulseFieldHint && <span style={{ marginLeft: 10, color: "var(--ink-faint)" }}>{pulseFieldHint}</span>}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Status mapping */}
                  <div style={{ marginBottom: 12 }}>
                    <div className="sf-tp-addbar" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                      <button
                        className="sf-set-btn"
                        onClick={() => {
                          const opening = !pulseStatusOpen;
                          setPulseStatusOpen(opening);
                          if (opening && !pulseStatuses) loadPulseStatuses();
                        }}
                      >
                        {pulseStatusOpen ? "Hide status mapping ▾" : "Status mapping ▸"}
                      </button>
                      {Object.keys(pulseConfig.statusMap || {}).length > 0 && (
                        <>
                          <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
                            {Object.keys(pulseConfig.statusMap).length} overridden
                          </span>
                          <button
                            className="sf-set-btn danger"
                            onClick={() => persistPulseConfig({ ...pulseConfig, statusMap: {} })}
                          >Reset to Jira defaults</button>
                        </>
                      )}
                    </div>
                    {pulseStatusOpen && (
                      <>
                        <div className="sf-set-desc" style={{ marginTop: 8 }}>
                          Reclassify any status into To do / In progress / Done. Unset statuses
                          use Jira's own category. Applies across every team's counts and sprint progress.
                        </div>
                        {!pulseStatuses ? (
                          <div className="sf-jp-empty">Loading statuses…</div>
                        ) : pulseStatuses.length === 0 ? (
                          <div className="sf-jp-empty">Couldn't load statuses (check token access).</div>
                        ) : (
                          <div className="sf-tp-statusmap">
                            {pulseStatuses.map((s) => {
                              const override = (pulseConfig.statusMap || {})[s.name];
                              return (
                                <div className="sf-tp-status-row" key={s.name}>
                                  <span className="sf-tp-status-name" title={s.name}>{s.name}</span>
                                  <span className="sf-tp-status-def">jira: {s.category}</span>
                                  <select
                                    className={"sf-tp-status-sel" + (override ? " overridden" : "")}
                                    value={override || "__default"}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      const map = { ...(pulseConfig.statusMap || {}) };
                                      // Storing the choice == default keeps the row visibly set;
                                      // an explicit "default" option removes the override.
                                      if (v === "__default") delete map[s.name];
                                      else map[s.name] = v;
                                      persistPulseConfig({ ...pulseConfig, statusMap: map });
                                    }}
                                  >
                                    <option value="__default">Default ({s.category})</option>
                                    <option value="new">To do</option>
                                    <option value="indeterminate">In progress</option>
                                    <option value="done">Done</option>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div
                    className="sf-jp-card"
                    onDragOver={(e) => { if (pulseDragId) { e.preventDefault(); } }}
                    onDrop={(e) => {
                      // Drop on the card (below the rows) → move to end.
                      if (!pulseDragId) return;
                      e.preventDefault();
                      reorderPulseTeams(pulseDragId, null);
                      setPulseDragId(null); setPulseDropBeforeId(null);
                    }}
                  >
                    {pulseConfig.teams.length === 0 && (
                      <div className="sf-jp-empty">No teams yet — add one below.</div>
                    )}
                    {pulseConfig.teams.map((t) => (
                      <div
                        className={
                          "sf-tp-cfg-row" +
                          (pulseDragId === t.id ? " dragging" : "") +
                          (pulseDropBeforeId === t.id && pulseDragId && pulseDragId !== t.id ? " drop-before" : "")
                        }
                        key={t.id}
                        draggable
                        onDragStart={(e) => { setPulseDragId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => { setPulseDragId(null); setPulseDropBeforeId(null); }}
                        onDragOver={(e) => {
                          if (!pulseDragId || pulseDragId === t.id) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setPulseDropBeforeId(t.id);
                        }}
                        onDrop={(e) => {
                          if (!pulseDragId) return;
                          e.preventDefault();
                          e.stopPropagation();
                          reorderPulseTeams(pulseDragId, t.id);
                          setPulseDragId(null); setPulseDropBeforeId(null);
                        }}
                      >
                        <span className="sf-tp-cfg-grip" title="Drag to reorder">⋮⋮</span>
                        <span className="sf-tp-cfg-name">{t.name}</span>
                        <span className="sf-tp-cfg-def">
                          {t.source === "board"
                            ? `board #${t.boardId}${t.boardType ? ` · ${t.boardType}` : ""}`
                            : t.jql}
                        </span>
                        {usePoints && (
                          pulseAllFields ? (
                            <select
                              className="sf-tp-status-sel"
                              style={{ flex: "0 0 auto", maxWidth: 200 }}
                              value={t.pointsFieldId || ""}
                              onChange={(e) => updatePulseTeam(t.id, { pointsFieldId: e.target.value || null })}
                              title="Story-points field for this team"
                            >
                              <option value="">
                                Points: default{pulseConfig.pointsFieldId ? ` (${pulseConfig.pointsFieldId})` : ""}
                              </option>
                              {pulseAllFields.map((f) => (
                                <option key={f.id} value={f.id}>{f.name} ({f.id})</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="sf-tp-status-sel"
                              style={{ flex: "0 0 auto", width: 160 }}
                              placeholder={pulseConfig.pointsFieldId ? `pts: ${pulseConfig.pointsFieldId}` : "pts field id"}
                              value={t.pointsFieldId || ""}
                              onChange={(e) => updatePulseTeam(t.id, { pointsFieldId: e.target.value.trim() || null })}
                              title="Story-points field for this team (or load fields above to pick by name)"
                            />
                          )
                        )}
                        <button className="sf-mini" onClick={() => removePulseTeam(t.id)} title="Remove">✕</button>
                      </div>
                    ))}

                    <div className="sf-tp-addbar">
                      <input
                        placeholder="Team name"
                        value={pulseDraft.name}
                        onChange={(e) => setPulseDraft((d) => ({ ...d, name: e.target.value }))}
                        style={{ flex: "0 1 160px" }}
                      />
                      <select
                        value={pulseDraft.source}
                        onChange={(e) => setPulseDraft((d) => ({ ...d, source: e.target.value }))}
                      >
                        <option value="board">Board</option>
                        <option value="jql">JQL</option>
                      </select>
                      {pulseDraft.source === "board" ? (
                        pulseBoards ? (
                          <select
                            value={pulseDraft.boardId}
                            onChange={(e) => setPulseDraft((d) => ({ ...d, boardId: e.target.value }))}
                            style={{ flex: "1 1 220px" }}
                          >
                            <option value="">Select a board…</option>
                            {pulseBoards.map((b) => (
                              <option key={b.id} value={b.id}>{b.name} ({b.type})</option>
                            ))}
                          </select>
                        ) : (
                          <button className="sf-set-btn" onClick={loadPulseBoards}>Load boards</button>
                        )
                      ) : (
                        <input
                          placeholder="JQL — e.g. project = AUTH"
                          value={pulseDraft.jql}
                          onChange={(e) => setPulseDraft((d) => ({ ...d, jql: e.target.value }))}
                          style={{ flex: "1 1 260px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5 }}
                        />
                      )}
                      <button className="sf-btn" onClick={addPulseTeam} disabled={!pulseDraft.name.trim()}>Add team</button>
                    </div>
                  </div>
                </div>

                {/* Pulse */}
                <div className="sf-jp-section">
                  <div className="sf-jp-head">
                    <div>
                      <div className="sf-jp-title">Pulse</div>
                      <div className="sf-jp-sub">
                        {pulseLastRun ? `Last refreshed ${new Date(pulseLastRun).toLocaleTimeString()}` : "Not refreshed yet."}
                      </div>
                    </div>
                    <button
                      className="sf-set-btn"
                      onClick={refreshPulse}
                      disabled={pulseLoading || pulseConfig.teams.length === 0}
                    >{pulseLoading ? "Refreshing…" : "Refresh"}</button>
                  </div>

                  {pulseConfig.teams.length === 0 ? (
                    <div className="sf-jp-empty">Add a team above, then refresh.</div>
                  ) : (
                    <div className="sf-tp-grid">
                      {pulseConfig.teams.map((team) => {
                        const d = pulseData[team.id];
                        return (
                          <div className="sf-tp-card" key={team.id}>
                            <div className="sf-tp-card-head">
                              <span className="sf-tp-name">{team.name}</span>
                              <span className="sf-tp-src">
                                {team.source === "board" ? `${team.boardType || "board"}` : "jql"}
                              </span>
                            </div>

                            {!d ? (
                              <div className="sf-jp-empty">Refresh to load.</div>
                            ) : d.error ? (
                              <div className="sf-tp-err">{d.error}</div>
                            ) : (
                              <>
                                {(() => {
                                  const total = d.statusCounts.new + d.statusCounts.indeterminate + d.statusCounts.done || 1;
                                  const pct = (n) => `${(n / total) * 100}%`;
                                  return (
                                    <>
                                      <div className="sf-tp-statusbar">
                                        <div className="sf-tp-seg new" style={{ width: pct(d.statusCounts.new) }} />
                                        <div className="sf-tp-seg indeterminate" style={{ width: pct(d.statusCounts.indeterminate) }} />
                                        <div className="sf-tp-seg done" style={{ width: pct(d.statusCounts.done) }} />
                                      </div>
                                      <div className="sf-tp-legend">
                                        <span>To do {d.statusCounts.new}</span>
                                        <span>In progress {d.statusCounts.indeterminate}</span>
                                        <span>Done {d.statusCounts.done}</span>
                                      </div>
                                    </>
                                  );
                                })()}

                                {team.source === "board" && team.boardType === "scrum" && !d.sprint && (
                                  <div className="sf-tp-degraded">No active sprint, or sprint access needs jira-software scopes.</div>
                                )}

                                {d.sprint && (
                                  <div className="sf-tp-sprint">
                                    <div className="sf-tp-sprint-head">
                                      <span>{d.sprint.name}</span>
                                      <span>{d.sprint.done}/{d.sprint.committed} {usePoints ? "pts" : "issues"} done</span>
                                    </div>
                                    <div className="sf-tp-sprint-track">
                                      <div className="sf-tp-sprint-fill" style={{ width: `${d.sprint.committed ? (d.sprint.done / d.sprint.committed) * 100 : 0}%` }} />
                                    </div>
                                  </div>
                                )}

                                <div className="sf-tp-people">
                                  {d.assignees.length === 0 ? (
                                    <div className="sf-jp-empty">No open work.</div>
                                  ) : d.assignees.slice(0, 8).map((a) => {
                                    const val = usePoints ? a.points : a.count;
                                    return (
                                      <div className="sf-tp-person" key={a.name}>
                                        <span className={"sf-tp-person-name" + (a.name === "Unassigned" ? " unassigned" : "")}>{a.name}</span>
                                        <div className="sf-tp-person-track">
                                          <div className="sf-tp-person-fill" style={{ width: `${(val / maxLoad) * 100}%` }} />
                                        </div>
                                        <span className="sf-tp-person-num">{val}</span>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className="sf-tp-foot">
                                  <span>{usePoints ? `${d.openPoints} pts open` : `${d.openCount} open`}</span>
                                  <span>{usePoints ? `${d.donePoints} pts` : `${d.doneCount}`} done · {windowLabel()}</span>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    );
}
