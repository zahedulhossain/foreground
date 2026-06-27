import React from "react";
import { BUCKETS, DEFAULT_JQL } from "../constants.js";
import { renderTitle } from "../lib/markdown.js";
import { autoSize } from "../lib/dom.js";
import { uid } from "../lib/ids.js";
import { styles } from "../styles.js";
import { rootClass } from "../lib/theme.js";
import { Sidebar } from "../components/Sidebar.jsx";
import { evaluateTeamKpis } from "../features/pulse/aggregate.js";
import { useStore } from "../store/StoreContext.jsx";

// Initials for a person avatar — up to two letters.
function initials(name) {
  if (!name || name === "Unassigned") return "–";
  const parts = name.trim().split(/\s+/);
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function PulseView() {
  const {
    dragId, jiraConfigured, jiraCreds, loadPulseBoards, loadPulseFields, loadPulseStatuses, palette, persistPulseConfig, pulseAllFields, pulseBoards, pulseConfig, pulseData, pulseDraft, pulseDragId, pulseDropBeforeId, pulseFieldHint, pulseLastRun, pulseLoading, pulsePointSearch, pulseStatusOpen, pulseStatuses, refreshPulse, setPulseDraft, setPulseDragId, setPulseDropBeforeId, setPulsePointSearch, setPulseStatusOpen, setView, settings, teams, view, windowLabel,
  } = useStore();
    const usePoints = pulseConfig.progressUnit === "points";
    const [pulseTab, setPulseTab] = React.useState("pulse"); // pulse | kpis
    const [hideInactive, setHideInactive] = React.useState(false);
    const [configOpen, setConfigOpen] = React.useState(false);
    const activeTeams = pulseConfig.teams.filter((t) => t.active !== false);
    // Drill-down drawer selection: { teamId, teamName, bucket } | null.
    const [drawer, setDrawer] = React.useState(null);
    React.useEffect(() => {
      const open = drawer || configOpen;
      if (!open) return;
      const onKey = (e) => { if (e.key === "Escape") { setDrawer(null); setConfigOpen(false); } };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [drawer, configOpen]);

    // Per-row inline editing state.
    const [editingTeamId, setEditingTeamId] = React.useState(null);
    const [editDraft, setEditDraft] = React.useState({ name: "", source: "jql", boardId: "", jql: "" });

    const startEditTeam = (t) => {
      setEditingTeamId(t.id);
      setEditDraft({ name: t.name, source: t.source, boardId: t.boardId ? String(t.boardId) : "", jql: t.jql || "", rawJql: !!t.rawJql });
    };
    const cancelEditTeam = () => { setEditingTeamId(null); };
    const saveEditTeam = (t) => {
      const name = editDraft.name.trim();
      if (!name) return;
      let patch;
      if (editDraft.source === "board") {
        if (!editDraft.boardId) return;
        const b = (pulseBoards || []).find((x) => String(x.id) === String(editDraft.boardId));
        patch = { name, source: "board", boardId: Number(editDraft.boardId), boardType: b ? b.type : t.boardType, jql: undefined };
      } else {
        if (!editDraft.jql.trim()) return;
        patch = { name, source: "jql", jql: editDraft.jql.trim(), rawJql: !!editDraft.rawJql, boardId: undefined, boardType: undefined };
      }
      updatePulseTeam(t.id, patch);
      setEditingTeamId(null);
    };
    const jiraBase = (jiraCreds.baseUrl || "").replace(/\/+$/, "");
    const bucketLabel = { new: "To do", indeterminate: "In progress", done: "Done" };
    const addPulseTeam = () => {
      const name = pulseDraft.name.trim();
      if (!name) return;
      let team;
      if (pulseDraft.source === "board") {
        if (!pulseDraft.boardId) return;
        const b = (pulseBoards || []).find((x) => String(x.id) === String(pulseDraft.boardId));
        team = { id: uid(), name, active: true, source: "board", boardId: Number(pulseDraft.boardId), boardType: b ? b.type : null };
      } else {
        if (!pulseDraft.jql.trim()) return;
        team = { id: uid(), name, active: true, source: "jql", jql: pulseDraft.jql.trim(), rawJql: !!pulseDraft.rawJql };
      }
      persistPulseConfig({ ...pulseConfig, teams: [...pulseConfig.teams, team] });
      setPulseDraft({ name: "", source: pulseDraft.source, boardId: "", jql: "", rawJql: false });
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
      const teamsArr = [...pulseConfig.teams];
      const from = teamsArr.findIndex((t) => t.id === dragId);
      if (from < 0) return;
      const [moved] = teamsArr.splice(from, 1);
      let to = beforeId ? teamsArr.findIndex((t) => t.id === beforeId) : teamsArr.length;
      if (to < 0) to = teamsArr.length;
      teamsArr.splice(to, 0, moved);
      persistPulseConfig({ ...pulseConfig, teams: teamsArr });
    };

    const maxLoad = Math.max(
      1,
      ...Object.values(pulseData).flatMap((d) =>
        d && d.assignees ? d.assignees.map((a) => (usePoints ? a.points : a.count)) : [0]
      )
    );

    // ── KPI targets ─────────────────────────────────────────────────────────
    const kpiTargets = pulseConfig.kpiTargets || {};
    const updateKpiTarget = (key, patch) =>
      persistPulseConfig({
        ...pulseConfig,
        kpiTargets: { ...kpiTargets, [key]: { ...(kpiTargets[key] || {}), ...patch } },
      });
    const KPI_DEFS = [
      { key: "throughput", label: "Throughput", hint: "Done in window/sprint ≥ target", unit: usePoints ? "pts" : "issues" },
      { key: "wip", label: "WIP / person", hint: "In-progress per person ≤ target", unit: usePoints ? "pts" : "issues" },
      { key: "sprintCompletion", label: "Sprint completion", hint: "Done ÷ committed ≥ target", unit: "%" },
      { key: "loadBalance", label: "Load balance", hint: "Top person's share of open load ≤ target", unit: "%" },
    ];
    const anyKpiEnabled = KPI_DEFS.some((k) => kpiTargets[k.key] && kpiTargets[k.key].enabled);

    // ── KPIs tab body ─────────────────────────────────────────────────────────
    const renderKpis = () => (
      <>
        <div className="sf-jp-section" style={{ marginTop: 0 }}>
          <div className="sf-jp-title">KPI targets</div>
          <div className="sf-jp-sub" style={{ marginBottom: 12 }}>
            Point-in-time, from the last refresh. Enable and set a target for each.
          </div>
          <div className="sf-jp-card">
            {KPI_DEFS.map((k) => {
              const t = kpiTargets[k.key] || { enabled: false, value: 0 };
              return (
                <div className={"sf-kpi-cfg-row" + (t.enabled ? "" : " off")} key={k.key}>
                  <label className="sf-tp-asis" style={{ flex: "0 0 auto" }}>
                    <input type="checkbox" checked={!!t.enabled} onChange={(e) => updateKpiTarget(k.key, { enabled: e.target.checked })} />
                  </label>
                  <span className="sf-kpi-cfg-label">{k.label}</span>
                  <span className="sf-kpi-cfg-hint">{k.hint}</span>
                  <input
                    className="sf-tp-status-sel"
                    type="number"
                    style={{ width: 76, flex: "0 0 auto" }}
                    value={t.value}
                    onChange={(e) => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) updateKpiTarget(k.key, { value: n }); }}
                  />
                  <span className="sf-kpi-cfg-unit">{k.unit}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sf-jp-section">
          <div className="sf-jp-title">By team</div>
          {activeTeams.length === 0 ? (
            <div className="sf-tp-blank">No active teams — add or activate a team in Configure.</div>
          ) : !anyKpiEnabled ? (
            <div className="sf-tp-blank">Enable a KPI above to see status.</div>
          ) : (
            <div className="sf-tp-grid">
              {activeTeams.map((team) => {
                const d = pulseData[team.id];
                const evals = d && !d.error ? evaluateTeamKpis(d, kpiTargets, usePoints) : [];
                return (
                  <div className="sf-tp-card" key={team.id}>
                    <div className="sf-tp-card-head"><span className="sf-tp-name">{team.name}</span></div>
                    {!d ? (
                      <div className="sf-tp-blank">Refresh to load.</div>
                    ) : d.error ? (
                      <div className="sf-tp-err">{d.error}</div>
                    ) : evals.length === 0 ? (
                      <div className="sf-tp-blank">No KPIs enabled.</div>
                    ) : (
                      <>
                        {evals.map((ev) => (
                          <div className="sf-kpi-row" key={ev.key}>
                            <span className={"sf-kpi-dot " + ev.status} />
                            <span className="sf-kpi-name">{ev.label}</span>
                            <span className="sf-kpi-val">
                              {ev.scope === "team"
                                ? (ev.status === "na" ? "n/a" : `${ev.actual}${ev.unit} / ${ev.target}${ev.unit}`)
                                : (ev.breaches.length ? `${ev.breaches.length} over ${ev.target}${ev.unit}` : `all ≤ ${ev.target}${ev.unit}`)}
                            </span>
                          </div>
                        ))}
                        {evals.filter((e) => e.scope === "person" && e.breaches.length).map((ev) => (
                          <div className="sf-kpi-breach" key={ev.key + "-b"}>
                            {ev.label}: {ev.breaches.map((b) => `${b.name} (${b.value}${ev.unit})`).join(", ")}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );

    // ── Pulse tab body (the team cards) ────────────────────────────────────────
    const renderPulseGrid = () => {
      if (pulseConfig.teams.length === 0) {
        return (
          <div className="sf-tp-firstrun">
            <div className="sf-tp-firstrun-title">No teams tracked yet</div>
            <div className="sf-tp-firstrun-sub">Add the teams you oversee, then refresh to see their pulse.</div>
            <button className="sf-btn" onClick={() => setConfigOpen(true)}>Configure teams</button>
          </div>
        );
      }
      if (activeTeams.length === 0) {
        return <div className="sf-tp-blank">No active teams — activate one in Configure.</div>;
      }
      return (
        <div className="sf-tp-grid">
          {activeTeams.map((team) => {
            const d = pulseData[team.id];
            return (
              <div className="sf-tp-card" key={team.id}>
                <div className="sf-tp-card-head">
                  <span className="sf-tp-name">{team.name}</span>
                  <span className={"sf-tp-src" + (team.source === "board" ? " board" : " jql")}>
                    {team.source === "board" ? `${team.boardType || "board"}` : "jql"}
                  </span>
                </div>

                {!d ? (
                  <div className="sf-tp-blank">Not refreshed yet.</div>
                ) : d.error ? (
                  <div className="sf-tp-err">{d.error}</div>
                ) : (
                  <>
                    {(() => {
                      const total = d.statusCounts.new + d.statusCounts.indeterminate + d.statusCounts.done || 1;
                      const pct = (n) => `${(n / total) * 100}%`;
                      const open = (bucket) => {
                        if (!d.statusCounts[bucket]) return;
                        setDrawer({ teamId: team.id, teamName: team.name, bucket, raw: !!team.rawJql });
                      };
                      const seg = (bucket) => {
                        const n = d.statusCounts[bucket];
                        return (
                          <div
                            className={"sf-tp-seg " + bucket + (n ? " clickable" : "")}
                            style={{ width: pct(n) }}
                            onClick={() => open(bucket)}
                            title={n ? `${n} — click to list` : ""}
                          />
                        );
                      };
                      const lg = (bucket, label) => {
                        const n = d.statusCounts[bucket];
                        return n ? (
                          <button className={"lg cat-" + bucket} onClick={() => open(bucket)}>
                            <span className="lg-n">{n}</span> {label}
                          </button>
                        ) : (
                          <span className="lg off"><span className="lg-n">0</span> {label}</span>
                        );
                      };
                      return (
                        <>
                          <div className="sf-tp-statusbar">
                            {seg("new")}
                            {seg("indeterminate")}
                            {seg("done")}
                          </div>
                          <div className="sf-tp-legend">
                            {lg("new", "To do")}
                            {lg("indeterminate", "In progress")}
                            {lg("done", "Done")}
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
                          <span className="sf-tp-sprint-name">{d.sprint.name}</span>
                          <span>{d.sprint.done}/{d.sprint.committed} {usePoints ? "pts" : "issues"}</span>
                        </div>
                        <div className="sf-tp-sprint-track">
                          <div className="sf-tp-sprint-fill" style={{ width: `${d.sprint.committed ? (d.sprint.done / d.sprint.committed) * 100 : 0}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="sf-tp-people">
                      {d.assignees.length === 0 ? (
                        <div className="sf-tp-blank">No open work.</div>
                      ) : d.assignees.slice(0, 8).map((a) => {
                        const val = usePoints ? a.points : a.count;
                        const unassigned = a.name === "Unassigned";
                        return (
                          <div className="sf-tp-person" key={a.name}>
                            <span className={"sf-tp-avatar" + (unassigned ? " unassigned" : "")}>{initials(a.name)}</span>
                            <span className={"sf-tp-person-name" + (unassigned ? " unassigned" : "")}>{a.name}</span>
                            <div className="sf-tp-person-track">
                              <div className="sf-tp-person-fill" style={{ width: `${(val / maxLoad) * 100}%` }} />
                            </div>
                            <span className="sf-tp-person-num">{val}</span>
                          </div>
                        );
                      })}
                      {d.assignees.length > 8 && (
                        <div className="sf-tp-more">+{d.assignees.length - 8} more</div>
                      )}
                    </div>

                    <div className="sf-tp-foot">
                      <span>{usePoints ? `${d.openPoints} pts open` : `${d.openCount} open`}</span>
                      <span>{usePoints ? `${d.donePoints} pts` : `${d.doneCount}`} done{team.rawJql ? "" : ` · ${windowLabel()}`}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      );
    };

    // ── Config drawer body (all setup) ──────────────────────────────────────────
    const renderConfig = () => (
      <>
        {/* Global controls */}
        <div className="sf-cfg-block">
          <div className="sf-cfg-block-title">Display</div>
          <div className="sf-tp-controls">
            <label className="sf-cfg-field">
              <span>Progress unit</span>
              <select
                className="sf-sel"
                value={pulseConfig.progressUnit}
                onChange={(e) => persistPulseConfig({ ...pulseConfig, progressUnit: e.target.value })}
              >
                <option value="count">Count issues</option>
                <option value="points">Story points</option>
              </select>
            </label>
            <label className="sf-cfg-field">
              <span>Done window</span>
              <select
                className="sf-sel"
                value={pulseConfig.doneWindowMode}
                onChange={(e) => persistPulseConfig({ ...pulseConfig, doneWindowMode: e.target.value })}
              >
                <option value="rolling">Rolling days</option>
                <option value="range">Date range</option>
              </select>
            </label>
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
                  <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>days</span>
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
              <div style={{ marginTop: 12 }}>
                <div className="sf-set-desc" style={{ marginBottom: 6 }}>
                  Default story-points field — pick the one your boards use. Each team can override it.
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
                        style={{ flex: "1 1 200px" }}
                      />
                      <select
                        className="sf-sel"
                        value={pulseConfig.pointsFieldId || ""}
                        onChange={(e) => persistPulseConfig({ ...pulseConfig, pointsFieldId: e.target.value || null })}
                        style={{ flex: "1 1 240px" }}
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
        </div>

        {/* Status mapping */}
        <div className="sf-cfg-block">
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
                Reclassify any status into To do / In progress / Done. Unset statuses use Jira's own category.
              </div>
              {!pulseStatuses ? (
                <div className="sf-tp-blank">Loading statuses…</div>
              ) : pulseStatuses.length === 0 ? (
                <div className="sf-tp-blank">Couldn't load statuses (check token access).</div>
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

        {/* Tracked teams */}
        <div className="sf-cfg-block">
          <div className="sf-cfg-block-head">
            <div className="sf-cfg-block-title">Tracked teams</div>
            {pulseConfig.teams.some((t) => t.active === false) && (
              <label className="sf-tp-asis" title="Hide inactive teams from this list">
                <input type="checkbox" checked={hideInactive} onChange={(e) => setHideInactive(e.target.checked)} />
                hide inactive
              </label>
            )}
          </div>
          <div className="sf-set-desc" style={{ marginBottom: 8 }}>
            Map each team to a Jira board (gives Scrum/Kanban detection + sprint progress) or a raw JQL query.
            Only active teams are fetched on refresh.
          </div>
          <div
            className="sf-jp-card"
            onDragOver={(e) => { if (pulseDragId) { e.preventDefault(); } }}
            onDrop={(e) => {
              if (!pulseDragId) return;
              e.preventDefault();
              reorderPulseTeams(pulseDragId, null);
              setPulseDragId(null); setPulseDropBeforeId(null);
            }}
          >
            {pulseConfig.teams.length === 0 && (
              <div className="sf-tp-blank">No teams yet — add one below.</div>
            )}
            {pulseConfig.teams.length > 0 && pulseConfig.teams.filter((t) => !hideInactive || t.active !== false).length === 0 && (
              <div className="sf-tp-blank">All teams are inactive — uncheck "hide inactive" to see them.</div>
            )}
            {pulseConfig.teams
              .filter((t) => !hideInactive || t.active !== false)
              .map((t) => (
              <div
                className={
                  "sf-tp-cfg-row" +
                  (t.active === false ? " inactive" : "") +
                  (pulseDragId === t.id ? " dragging" : "") +
                  (pulseDropBeforeId === t.id && pulseDragId && pulseDragId !== t.id ? " drop-before" : "")
                }
                key={t.id}
                draggable={editingTeamId !== t.id}
                onDragStart={(e) => { if (editingTeamId === t.id) { e.preventDefault(); return; } setPulseDragId(t.id); e.dataTransfer.effectAllowed = "move"; }}
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
                {editingTeamId === t.id ? (
                  <>
                    <input
                      style={{ flex: "0 1 140px" }}
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder="Team name"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveEditTeam(t); if (e.key === "Escape") cancelEditTeam(); }}
                    />
                    <select
                      value={editDraft.source}
                      onChange={(e) => setEditDraft((d) => ({ ...d, source: e.target.value }))}
                    >
                      <option value="board">Board</option>
                      <option value="jql">JQL</option>
                    </select>
                    {editDraft.source === "board" ? (
                      pulseBoards ? (
                        <select
                          value={editDraft.boardId}
                          onChange={(e) => setEditDraft((d) => ({ ...d, boardId: e.target.value }))}
                          style={{ flex: "1 1 200px" }}
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
                      <>
                        <input
                          placeholder="JQL — e.g. project = AUTH"
                          value={editDraft.jql}
                          onChange={(e) => setEditDraft((d) => ({ ...d, jql: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEditTeam(t); if (e.key === "Escape") cancelEditTeam(); }}
                          style={{ flex: "1 1 220px", fontFamily: "'IBM Plex Mono',monospace" }}
                        />
                        <label className="sf-tp-asis" title="Run this JQL verbatim — don't append the done-window">
                          <input
                            type="checkbox"
                            checked={!!editDraft.rawJql}
                            onChange={(e) => setEditDraft((d) => ({ ...d, rawJql: e.target.checked }))}
                          />
                          as-is
                        </label>
                      </>
                    )}
                    <button className="sf-mini" onClick={() => saveEditTeam(t)} title="Save">✓</button>
                    <button className="sf-mini" onClick={cancelEditTeam} title="Cancel">✕</button>
                  </>
                ) : (
                  <>
                    <input
                      type="checkbox"
                      className="sf-tp-active-cb"
                      checked={t.active !== false}
                      onChange={(e) => updatePulseTeam(t.id, { active: e.target.checked })}
                      title={t.active !== false ? "Active — fetched on refresh" : "Inactive — skipped on refresh"}
                      aria-label="Active"
                    />
                    <span className="sf-tp-cfg-name">{t.name}</span>
                    <span className="sf-tp-cfg-def">
                      {t.source === "board"
                        ? `board #${t.boardId}${t.boardType ? ` · ${t.boardType}` : ""}`
                        : t.jql}
                      {t.source === "jql" && t.rawJql && (
                        <span className="sf-tp-asis-tag" title="Runs verbatim — done-window not applied"> · as-is</span>
                      )}
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
                    <button className="sf-mini" onClick={() => startEditTeam(t)} title="Edit">✎</button>
                    <button className="sf-mini" onClick={() => removePulseTeam(t.id)} title="Remove">✕</button>
                  </>
                )}
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
                <>
                  <input
                    placeholder="JQL — e.g. project = AUTH"
                    value={pulseDraft.jql}
                    onChange={(e) => setPulseDraft((d) => ({ ...d, jql: e.target.value }))}
                    style={{ flex: "1 1 260px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5 }}
                  />
                  <label className="sf-tp-asis" title="Run this JQL verbatim — don't append the done-window">
                    <input
                      type="checkbox"
                      checked={!!pulseDraft.rawJql}
                      onChange={(e) => setPulseDraft((d) => ({ ...d, rawJql: e.target.checked }))}
                    />
                    as-is
                  </label>
                </>
              )}
              <button className="sf-btn" onClick={addPulseTeam} disabled={!pulseDraft.name.trim()}>Add team</button>
            </div>
          </div>
        </div>
      </>
    );

    return (
      <div className={rootClass(settings)}>
        <style>{styles}</style>
        {palette}

        {/* Drill-down drawer */}
        {drawer && (() => {
          const data = pulseData[drawer.teamId];
          const rows = (data && data.byBucket && data.byBucket[drawer.bucket]) || [];
          const sorted = [...rows].sort((a, b) =>
            usePoints ? (b.points - a.points) : String(a.key).localeCompare(String(b.key))
          );
          const ptsSum = rows.reduce((s, r) => s + (r.points || 0), 0);
          return (
            <div className="sf-dw-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(null); }}>
              <div className="sf-dw">
                <div className="sf-dw-head">
                  <div>
                    <div className="sf-dw-title">{drawer.teamName} · {bucketLabel[drawer.bucket]}</div>
                    <div className="sf-dw-sub">
                      {rows.length} issue{rows.length === 1 ? "" : "s"}{usePoints ? ` · ${ptsSum} pts` : ""}
                      {drawer.bucket === "done" && !drawer.raw ? ` · resolved in ${windowLabel()}` : ""}
                    </div>
                  </div>
                  <button className="sf-dw-close" onClick={() => setDrawer(null)} title="Close (Esc)">✕</button>
                </div>
                <div className="sf-dw-list">
                  {sorted.length === 0 ? (
                    <div className="sf-dw-empty">No issues in this bucket.</div>
                  ) : sorted.map((r) => (
                    <a
                      key={r.key}
                      className="sf-dw-row"
                      href={jiraBase ? `${jiraBase}/browse/${r.key}` : "#"}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => { if (!jiraBase) e.preventDefault(); }}
                    >
                      <span className={"sf-dw-dot cat-" + (r.statusCategory || "new")} />
                      <div className="sf-dw-body">
                        <span className="sf-dw-key">{r.key}</span>
                        <div className="sf-dw-summary">{r.summary || "(no summary)"}</div>
                        <div className="sf-dw-meta">
                          {r.status || "—"}
                          {r.assignee ? ` · ${r.assignee}` : " · Unassigned"}
                          {usePoints && r.points ? ` · ${r.points} pts` : ""}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Config drawer */}
        {configOpen && (
          <div className="sf-dw-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfigOpen(false); }}>
            <div className="sf-dw sf-dw-wide">
              <div className="sf-dw-head">
                <div>
                  <div className="sf-dw-title">Configure Team Pulse</div>
                  <div className="sf-dw-sub">Teams, display units, status mapping — applies to both tabs.</div>
                </div>
                <button className="sf-dw-close" onClick={() => setConfigOpen(false)} title="Close (Esc)">✕</button>
              </div>
              <div className="sf-dw-list sf-cfg-list">{renderConfig()}</div>
            </div>
          </div>
        )}

        <Sidebar view={view} setView={setView} pulseEnabled={settings.teamPulse} />
        <main className="sf-main">
          <div className="sf-wrap">
            <header>
              <h1 className="sf-h1">Team Pulse</h1>
              <p className="sf-sub">
                Where each team's work sits and who's carrying it — a planning aid for
                spreading load and spotting blockers, not a monitoring tool.
              </p>
            </header>
            <hr className="sf-rule" />

            {!jiraConfigured ? (
              <div className="sf-tp-firstrun">
                <div className="sf-tp-firstrun-title">Connect Jira to begin</div>
                <div className="sf-tp-firstrun-sub">
                  Team Pulse reads your teams' issues through Jira. Set up the connection on the Jira page.
                </div>
                <button className="sf-btn" onClick={() => setView("jira")}>Open Jira page →</button>
              </div>
            ) : (
              <>
                {/* Toolbar: tabs + actions */}
                <div className="sf-tp-toolbar">
                  <div className="sf-tp-tabs">
                    <button
                      className={"sf-tp-tab" + (pulseTab === "pulse" ? " active" : "")}
                      onClick={() => setPulseTab("pulse")}
                    >Pulse</button>
                    <button
                      className={"sf-tp-tab" + (pulseTab === "kpis" ? " active" : "")}
                      onClick={() => setPulseTab("kpis")}
                    >KPIs</button>
                  </div>
                  <div className="sf-tp-toolbar-right">
                    <span className="sf-tp-refreshed">
                      {pulseLoading
                        ? "refreshing…"
                        : pulseLastRun
                          ? `updated ${new Date(pulseLastRun).toLocaleTimeString()}`
                          : "not refreshed yet"}
                    </span>
                    <button className="sf-set-btn" onClick={() => setConfigOpen(true)}>⚙ Configure</button>
                    <button
                      className="sf-btn"
                      onClick={refreshPulse}
                      disabled={pulseLoading || activeTeams.length === 0}
                    >{pulseLoading ? "Refreshing…" : "Refresh"}</button>
                  </div>
                </div>

                {pulseTab === "kpis" ? renderKpis() : renderPulseGrid()}
              </>
            )}
          </div>
        </main>
      </div>
    );
}
