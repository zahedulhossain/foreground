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

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Tokenize a JQL string into colored spans (a lightweight Jira-like highlighter).
// Order matters: strings, then keywords, function names, operators, numbers,
// punctuation, and finally bare identifiers (fields / values).
const JQL_RE = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(ORDER\s+BY|NOT\s+IN|AND|OR|NOT|IN|IS|WAS|EMPTY|NULL|ASC|DESC|CHANGED|DURING|BEFORE|AFTER|ON|FROM|TO|BY)\b|([A-Za-z_][\w]*)(?=\s*\()|(!=|!~|>=|<=|=|~|<|>)|(\d+(?:\.\d+)?)|([(),])|([A-Za-z_][\w.]*)/gi;

function highlightJql(src) {
  if (!src) return "";
  let out = "";
  let last = 0;
  let m;
  JQL_RE.lastIndex = 0;
  while ((m = JQL_RE.exec(src)) !== null) {
    if (m.index > last) out += escapeHtml(src.slice(last, m.index));
    const text = escapeHtml(m[0]);
    if (m[1]) out += `<span class="jql-str">${text}</span>`;
    else if (m[2]) out += `<span class="jql-kw">${text}</span>`;
    else if (m[3]) out += `<span class="jql-fn">${text}</span>`;
    else if (m[4]) out += `<span class="jql-op">${text}</span>`;
    else if (m[5]) out += `<span class="jql-num">${text}</span>`;
    else if (m[6]) out += `<span class="jql-paren">${text}</span>`;
    else out += `<span class="jql-field">${text}</span>`;
    last = m.index + m[0].length;
  }
  if (last < src.length) out += escapeHtml(src.slice(last));
  return out;
}

// A Jira-like JQL editor: syntax-highlighted, selectable, and expandable from a
// single line to a multi-row textarea. The highlight layer sits behind a
// transparent textarea so the native caret and text selection still work.
function JqlEditor({ value, onChange, onSubmit, onCancel, placeholder }) {
  const [expanded, setExpanded] = React.useState(false);
  const taRef = React.useRef(null);
  const hlRef = React.useRef(null);
  const syncScroll = () => {
    if (taRef.current && hlRef.current) {
      hlRef.current.scrollTop = taRef.current.scrollTop;
      hlRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };
  // A trailing newline needs a placeholder char so the last line has height.
  const html = highlightJql(value) + (value.endsWith("\n") ? "​" : "");
  return (
    <div className={"sf-jql-editor" + (expanded ? " expanded" : "")}>
      <div className="sf-jql-hl" ref={hlRef} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
      <textarea
        ref={taRef}
        className="sf-jql-ta"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        wrap={expanded ? "soft" : "off"}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onKeyDown={(e) => {
          if (e.key === "Escape") { onCancel && onCancel(); }
          else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit && onSubmit(); }
          else if (e.key === "Enter" && !expanded) { e.preventDefault(); onSubmit && onSubmit(); }
        }}
      />
      <button
        type="button"
        className="sf-jql-expand"
        title={expanded ? "Collapse" : "Expand"}
        aria-label={expanded ? "Collapse editor" : "Expand editor"}
        onClick={() => { setExpanded((v) => !v); if (taRef.current) taRef.current.focus(); }}
      >
        {expanded ? (
          <svg viewBox="0 0 16 16" width="13" height="13"><path d="M2 6h4V2M14 6h-4V2M2 10h4v4M14 10h-4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          <svg viewBox="0 0 16 16" width="13" height="13"><path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </button>
    </div>
  );
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

    // Team edit modal state (opened from a team card).
    const [editingTeamId, setEditingTeamId] = React.useState(null);
    const [editDraft, setEditDraft] = React.useState({ name: "", source: "jql", boardId: "", jql: "", rawJql: false, pointsFieldId: "", progressUnit: "" });

    // Team removal confirmation.
    const [removeConfirmId, setRemoveConfirmId] = React.useState(null);

    // Create-team modal (opened from the Pulse toolbar).
    const [addTeamOpen, setAddTeamOpen] = React.useState(false);

    React.useEffect(() => {
      const open = drawer || configOpen || editingTeamId || removeConfirmId || addTeamOpen;
      if (!open) return;
      const onKey = (e) => { if (e.key === "Escape") { setDrawer(null); setConfigOpen(false); setEditingTeamId(null); setRemoveConfirmId(null); setAddTeamOpen(false); } };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [drawer, configOpen, editingTeamId, removeConfirmId, addTeamOpen]);

    const startEditTeam = (t) => {
      setEditingTeamId(t.id);
      setEditDraft({ name: t.name, source: t.source, boardId: t.boardId ? String(t.boardId) : "", jql: t.jql || "", rawJql: !!t.rawJql, pointsFieldId: t.pointsFieldId || "", progressUnit: t.progressUnit || "" });
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
      patch.pointsFieldId = editDraft.pointsFieldId.trim() || null;
      patch.progressUnit = editDraft.progressUnit || undefined;
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
      if (pulseDraft.progressUnit) team.progressUnit = pulseDraft.progressUnit;
      if (pulseDraft.pointsFieldId && pulseDraft.pointsFieldId.trim()) team.pointsFieldId = pulseDraft.pointsFieldId.trim();
      persistPulseConfig({ ...pulseConfig, teams: [...pulseConfig.teams, team] });
      setPulseDraft({ name: "", source: pulseDraft.source, boardId: "", jql: "", rawJql: false, progressUnit: "", pointsFieldId: "" });
      setAddTeamOpen(false);
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

    // Effective progress unit for a team: its own override, else the global default.
    const teamUsePoints = (team) => (team.progressUnit ? team.progressUnit === "points" : usePoints);
    // Person bars are normalized within each team (units may differ across teams).
    const teamMaxLoad = (d, tup) =>
      Math.max(1, ...((d && d.assignees ? d.assignees : []).map((a) => (tup ? a.points : a.count))));

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
                const evals = d && !d.error ? evaluateTeamKpis(d, kpiTargets, teamUsePoints(team)) : [];
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
            <button className="sf-btn" onClick={() => setAddTeamOpen(true)}>Add team</button>
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
            const tup = teamUsePoints(team);
            const cardMaxLoad = teamMaxLoad(d, tup);
            return (
              <div className="sf-tp-card" key={team.id}>
                <div className="sf-tp-card-head">
                  <span className="sf-tp-name">{team.name}</span>
                  <span className="sf-tp-card-head-right">
                    <span className={"sf-tp-src" + (team.source === "board" ? " board" : " jql")}>
                      {team.source === "board" ? `${team.boardType || "board"}` : "jql"}
                    </span>
                    <button className="sf-mini" onClick={() => startEditTeam(team)} title="Edit team">✎</button>
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
                          <span>{d.sprint.done}/{d.sprint.committed} {tup ? "pts" : "issues"}</span>
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
                        const val = tup ? a.points : a.count;
                        const unassigned = a.name === "Unassigned";
                        return (
                          <div className="sf-tp-person" key={a.name}>
                            <span className={"sf-tp-avatar" + (unassigned ? " unassigned" : "")}>{initials(a.name)}</span>
                            <span className={"sf-tp-person-name" + (unassigned ? " unassigned" : "")}>{a.name}</span>
                            <div className="sf-tp-person-track">
                              <div className="sf-tp-person-fill" style={{ width: `${(val / cardMaxLoad) * 100}%` }} />
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
                      <span>{tup ? `${d.openPoints} pts open` : `${d.openCount} open`}</span>
                      <span>{tup ? `${d.donePoints} pts` : `${d.doneCount}`} done{team.rawJql ? "" : ` · ${windowLabel()}`}</span>
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

          {(usePoints || pulseConfig.teams.some((t) => t.progressUnit === "points")) && (() => {
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
              <div className="sf-tp-blank">No teams yet — add one from the Pulse toolbar.</div>
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
                <input
                  type="checkbox"
                  className="sf-tp-active-cb"
                  checked={t.active !== false}
                  onChange={(e) => updatePulseTeam(t.id, { active: e.target.checked })}
                  title={t.active !== false ? "Active — fetched on refresh" : "Inactive — skipped on refresh"}
                  aria-label="Active"
                />
                <span className="sf-tp-cfg-name">{t.name}</span>
                <button className="sf-mini" onClick={() => setRemoveConfirmId(t.id)} title="Remove">✕</button>
              </div>
            ))}
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
          const drawerTeam = pulseConfig.teams.find((t) => t.id === drawer.teamId);
          const drawerUsePoints = drawerTeam ? teamUsePoints(drawerTeam) : usePoints;
          const rows = (data && data.byBucket && data.byBucket[drawer.bucket]) || [];
          const sorted = [...rows].sort((a, b) =>
            drawerUsePoints ? (b.points - a.points) : String(a.key).localeCompare(String(b.key))
          );
          const ptsSum = rows.reduce((s, r) => s + (r.points || 0), 0);
          return (
            <div className="sf-dw-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(null); }}>
              <div className="sf-dw">
                <div className="sf-dw-head">
                  <div>
                    <div className="sf-dw-title">{drawer.teamName} · {bucketLabel[drawer.bucket]}</div>
                    <div className="sf-dw-sub">
                      {rows.length} issue{rows.length === 1 ? "" : "s"}{drawerUsePoints ? ` · ${ptsSum} pts` : ""}
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
                          {drawerUsePoints && r.points ? ` · ${r.points} pts` : ""}
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

        {/* Team edit modal */}
        {editingTeamId && (() => {
          const t = pulseConfig.teams.find((x) => x.id === editingTeamId);
          if (!t) return null;
          return (
            <div className="sf-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) cancelEditTeam(); }}>
              <div className="sf-modal">
                <div className="sf-dw-head">
                  <div>
                    <div className="sf-dw-title">Edit team</div>
                    <div className="sf-dw-sub">{t.name}</div>
                  </div>
                  <button className="sf-dw-close" onClick={cancelEditTeam} title="Close (Esc)">✕</button>
                </div>
                <div className="sf-modal-body">
                  <label className="sf-modal-row">
                    <span>Team name</span>
                    <input
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder="Team name"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveEditTeam(t); if (e.key === "Escape") cancelEditTeam(); }}
                    />
                  </label>
                  <label className="sf-modal-row">
                    <span>Source</span>
                    <select
                      value={editDraft.source}
                      onChange={(e) => setEditDraft((d) => ({ ...d, source: e.target.value }))}
                    >
                      <option value="board">Board</option>
                      <option value="jql">JQL</option>
                    </select>
                  </label>
                  {editDraft.source === "board" ? (
                    <label className="sf-modal-row">
                      <span>Board</span>
                      {pulseBoards ? (
                        <select
                          value={editDraft.boardId}
                          onChange={(e) => setEditDraft((d) => ({ ...d, boardId: e.target.value }))}
                        >
                          <option value="">Select a board…</option>
                          {pulseBoards.map((b) => (
                            <option key={b.id} value={b.id}>{b.name} ({b.type})</option>
                          ))}
                        </select>
                      ) : (
                        <button className="sf-set-btn" onClick={loadPulseBoards}>Load boards</button>
                      )}
                    </label>
                  ) : (
                    <>
                      <label className="sf-modal-row">
                        <span>JQL</span>
                        <JqlEditor
                          value={editDraft.jql}
                          onChange={(v) => setEditDraft((d) => ({ ...d, jql: v }))}
                          onSubmit={() => saveEditTeam(t)}
                          onCancel={cancelEditTeam}
                          placeholder="JQL — e.g. project = AUTH"
                        />
                      </label>
                      <label className="sf-tp-asis" style={{ marginLeft: "auto" }}>
                        <input
                          type="checkbox"
                          checked={!!editDraft.rawJql}
                          onChange={(e) => setEditDraft((d) => ({ ...d, rawJql: e.target.checked }))}
                        />
                        as-is
                        <span className="sf-info-icon" title="Run this JQL verbatim — don't append the done-window">ⓘ</span>
                      </label>
                    </>
                  )}
                  <label className="sf-modal-row">
                    <span>Progress unit</span>
                    <select
                      value={editDraft.progressUnit}
                      onChange={(e) => setEditDraft((d) => ({ ...d, progressUnit: e.target.value }))}
                    >
                      <option value="">Default ({usePoints ? "points" : "count"})</option>
                      <option value="count">Count issues</option>
                      <option value="points">Story points</option>
                    </select>
                  </label>
                  {(editDraft.progressUnit ? editDraft.progressUnit === "points" : usePoints) && (
                    <label className="sf-modal-row">
                      <span>Story-points field</span>
                      {pulseAllFields ? (
                        <select
                          value={editDraft.pointsFieldId}
                          onChange={(e) => setEditDraft((d) => ({ ...d, pointsFieldId: e.target.value }))}
                        >
                          <option value="">
                            Default{pulseConfig.pointsFieldId ? ` (${pulseConfig.pointsFieldId})` : ""}
                          </option>
                          {pulseAllFields.map((f) => (
                            <option key={f.id} value={f.id}>{f.name} ({f.id})</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          placeholder={pulseConfig.pointsFieldId ? `pts: ${pulseConfig.pointsFieldId}` : "pts field id"}
                          value={editDraft.pointsFieldId}
                          onChange={(e) => setEditDraft((d) => ({ ...d, pointsFieldId: e.target.value }))}
                        />
                      )}
                    </label>
                  )}
                </div>
                <div className="sf-modal-foot">
                  <button className="sf-set-btn" onClick={cancelEditTeam}>Cancel</button>
                  <button className="sf-btn" onClick={() => saveEditTeam(t)}>Save</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Create-team modal */}
        {addTeamOpen && (
          <div className="sf-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setAddTeamOpen(false); }}>
            <div className="sf-modal">
              <div className="sf-dw-head">
                <div>
                  <div className="sf-dw-title">Add team</div>
                </div>
                <button className="sf-dw-close" onClick={() => setAddTeamOpen(false)} title="Close (Esc)">✕</button>
              </div>
              <div className="sf-modal-body">
                <label className="sf-modal-row">
                  <span>Team name</span>
                  <input
                    value={pulseDraft.name}
                    onChange={(e) => setPulseDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="Team name"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") addPulseTeam(); if (e.key === "Escape") setAddTeamOpen(false); }}
                  />
                </label>
                <label className="sf-modal-row">
                  <span>Source</span>
                  <select
                    value={pulseDraft.source}
                    onChange={(e) => setPulseDraft((d) => ({ ...d, source: e.target.value }))}
                  >
                    <option value="board">Board</option>
                    <option value="jql">JQL</option>
                  </select>
                </label>
                {pulseDraft.source === "board" ? (
                  <label className="sf-modal-row">
                    <span>Board</span>
                    {pulseBoards ? (
                      <select
                        value={pulseDraft.boardId}
                        onChange={(e) => setPulseDraft((d) => ({ ...d, boardId: e.target.value }))}
                      >
                        <option value="">Select a board…</option>
                        {pulseBoards.map((b) => (
                          <option key={b.id} value={b.id}>{b.name} ({b.type})</option>
                        ))}
                      </select>
                    ) : (
                      <button className="sf-set-btn" onClick={loadPulseBoards}>Load boards</button>
                    )}
                  </label>
                ) : (
                  <>
                    <label className="sf-modal-row">
                      <span>JQL</span>
                      <JqlEditor
                        value={pulseDraft.jql}
                        onChange={(v) => setPulseDraft((d) => ({ ...d, jql: v }))}
                        onSubmit={addPulseTeam}
                        onCancel={() => setAddTeamOpen(false)}
                        placeholder="JQL — e.g. project = AUTH"
                      />
                    </label>
                    <label className="sf-tp-asis" style={{ marginLeft: "auto" }}>
                      <input
                        type="checkbox"
                        checked={!!pulseDraft.rawJql}
                        onChange={(e) => setPulseDraft((d) => ({ ...d, rawJql: e.target.checked }))}
                      />
                      as-is
                      <span className="sf-info-icon" title="Run this JQL verbatim — don't append the done-window">ⓘ</span>
                    </label>
                  </>
                )}
                <label className="sf-modal-row">
                  <span>Progress unit</span>
                  <select
                    value={pulseDraft.progressUnit}
                    onChange={(e) => setPulseDraft((d) => ({ ...d, progressUnit: e.target.value }))}
                  >
                    <option value="">Default ({usePoints ? "points" : "count"})</option>
                    <option value="count">Count issues</option>
                    <option value="points">Story points</option>
                  </select>
                </label>
                {(pulseDraft.progressUnit ? pulseDraft.progressUnit === "points" : usePoints) && (
                  <label className="sf-modal-row">
                    <span>Story-points field</span>
                    {pulseAllFields ? (
                      <select
                        value={pulseDraft.pointsFieldId}
                        onChange={(e) => setPulseDraft((d) => ({ ...d, pointsFieldId: e.target.value }))}
                      >
                        <option value="">
                          Default{pulseConfig.pointsFieldId ? ` (${pulseConfig.pointsFieldId})` : ""}
                        </option>
                        {pulseAllFields.map((f) => (
                          <option key={f.id} value={f.id}>{f.name} ({f.id})</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        placeholder={pulseConfig.pointsFieldId ? `pts: ${pulseConfig.pointsFieldId}` : "pts field id"}
                        value={pulseDraft.pointsFieldId}
                        onChange={(e) => setPulseDraft((d) => ({ ...d, pointsFieldId: e.target.value }))}
                      />
                    )}
                  </label>
                )}
              </div>
              <div className="sf-modal-foot">
                <button className="sf-set-btn" onClick={() => setAddTeamOpen(false)}>Cancel</button>
                <button className="sf-btn" onClick={addPulseTeam} disabled={!pulseDraft.name.trim()}>Add team</button>
              </div>
            </div>
          </div>
        )}

        {/* Remove team confirmation */}
        {removeConfirmId && (() => {
          const t = pulseConfig.teams.find((x) => x.id === removeConfirmId);
          if (!t) return null;
          return (
            <div className="sf-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setRemoveConfirmId(null); }}>
              <div className="sf-modal sf-modal-narrow">
                <div className="sf-dw-head">
                  <div>
                    <div className="sf-dw-title">Remove team?</div>
                  </div>
                  <button className="sf-dw-close" onClick={() => setRemoveConfirmId(null)} title="Close (Esc)">✕</button>
                </div>
                <div className="sf-modal-body">
                  <div className="sf-modal-confirm-text">
                    Remove <strong>{t.name}</strong> from tracked teams? This can't be undone.
                  </div>
                </div>
                <div className="sf-modal-foot">
                  <button className="sf-set-btn" onClick={() => setRemoveConfirmId(null)}>Cancel</button>
                  <button className="sf-btn danger" onClick={() => { removePulseTeam(t.id); setRemoveConfirmId(null); }}>Remove</button>
                </div>
              </div>
            </div>
          );
        })()}

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
                    <button className="sf-set-btn" onClick={() => setAddTeamOpen(true)}>+ Add team</button>
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
