import React from "react";
import { BUCKETS, DEFAULT_JQL } from "../constants.js";
import { renderTitle } from "../lib/markdown.js";
import { autoSize } from "../lib/dom.js";
import { uid } from "../lib/ids.js";
import { styles } from "../styles.js";
import { Sidebar } from "../components/Sidebar.jsx";
import { useStore } from "../store/StoreContext.jsx";

export function BoardView() {
  const {
    activeTasks, addInputRef, addTask, archive, archiveAllDone, balance, cancelEdit, cancelNotesEdit, cancelTeamEdit, clearFilters, commitEdit, commitNotesEdit, commitTeamEdit, doneNotArchivedCount, draft, draftBucket, draftTeam, dragId, dropBeforeId, dropBucket, editDraft, editNotesDraft, editTeamDraft, editingId, editingNotesId, editingTeamId, enrichWithJira, expandedNotes, filteredVisibleCount, filtersActive, flashTaskId, hideDone, jiraLoadingId, matchesFilters, maxBalance, moveTask, notesAutoExpanded, openMenu, palette, remove, saveState, searchInputRef, searchTerm, setDraft, setDraftBucket, setDraftTeam, setDragId, setDropBeforeId, setDropBucket, setEditDraft, setEditNotesDraft, setEditTeamDraft, setHideDone, setOpenMenu, setSearchTerm, setTasks, setView, settings, startEdit, startNotesEdit, startTeamEdit, tasks, teamColor, teamFilter, teams, today, toggleNotesExpanded, toggleTeamFilter, trimmedSearch, update, view,
  } = useStore();
  return (
    <div className={"sf-root" + (settings.darkMode ? "" : " light")} onClick={() => setOpenMenu(null)}>
      <style>{styles}</style>
      {palette}
      <Sidebar view={view} setView={setView} pulseEnabled={settings.teamPulse} />
      <main className="sf-main">
      <div className="sf-wrap">
        <header>
          <h1 className="sf-h1">Foreground</h1>
          <p className="sf-sub">
            Capture everything, separate your action from what you're waiting on, and
            keep one team from quietly eating all your attention.
          </p>
        </header>

        <hr className="sf-rule" />

        {/* Quick add */}
        <div className="sf-add" onClick={(e) => e.stopPropagation()}>
          <textarea
            className="sf-input"
            rows={1}
            placeholder="What needs doing? (e.g. review the API design draft)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onInput={(e) => autoSize(e.currentTarget)}
            ref={(el) => { addInputRef.current = el; autoSize(el); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                addTask();
              }
              // Cmd/Ctrl+Enter also submits — convenient when multi-line
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                addTask();
              }
            }}
          />
          <input
            className="sf-sel"
            list="sf-teams"
            placeholder="Team…"
            value={draftTeam}
            onChange={(e) => setDraftTeam(e.target.value)}
            style={{ flex: "0 1 130px" }}
          />
          <datalist id="sf-teams">
            {teams.map((s) => <option key={s} value={s} />)}
          </datalist>
          <select className="sf-sel" value={draftBucket} onChange={(e) => setDraftBucket(e.target.value)}>
            {BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <button className="sf-btn" onClick={addTask} disabled={!draft.trim()}>Add</button>
        </div>
        <div className="sf-add-hint">
          <b>Enter</b> to add · <b>Shift+Enter</b> for a new line · supports{" "}
          <b>**bold**</b>, <b>*italic*</b>, <b>`code`</b>, and links
        </div>

        {/* Filter bar */}
        <div className="sf-filter" onClick={(e) => e.stopPropagation()}>
          <input
            ref={searchInputRef}
            className="sf-filter-search"
            type="search"
            placeholder="Search titles…  ( / )"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setSearchTerm(""); }}
          />
          {teams.length > 0 && (
            <div className="sf-filter-pills">
              {teams.map((s) => {
                const on = teamFilter.has(s);
                return (
                  <button
                    key={s}
                    className={"sf-filter-pill" + (on ? " active" : "")}
                    style={on ? { background: teamColor(s) } : undefined}
                    onClick={() => toggleTeamFilter(s)}
                  >{s}</button>
                );
              })}
            </div>
          )}
          <label className="sf-filter-toggle">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
            />
            hide done
          </label>
          {filtersActive && (
            <>
              <span className="sf-filter-count">
                {filteredVisibleCount}/{activeTasks.length} shown
              </span>
              <button className="sf-filter-clear" onClick={clearFilters}>clear</button>
            </>
          )}
        </div>

        {/* Buckets */}
        <div className="sf-grid">
          {BUCKETS.map((bucket) => {
            const allInBucket = activeTasks.filter((t) => t.bucket === bucket.id);
            const items = allInBucket.filter(matchesFilters);
            const filteredOut = allInBucket.length - items.length;
            const openN = items.filter((t) => !t.done).length;
            const cap = bucket.capped ? settings.todayCap : null;
            const over = cap != null && openN > cap;
            return (
              <section
                className={"sf-col" + (dropBucket === bucket.id && !dropBeforeId ? " drop-target" : "")}
                key={bucket.id}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropBucket(bucket.id);
                  setDropBeforeId(null);
                }}
                onDragLeave={(e) => {
                  // Only clear when leaving the column entirely, not when moving onto a child.
                  if (e.currentTarget.contains(e.relatedTarget)) return;
                  if (dropBucket === bucket.id) setDropBucket(null);
                }}
                onDrop={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  moveTask(dragId, bucket.id, dropBeforeId);
                  setDragId(null); setDropBucket(null); setDropBeforeId(null);
                }}
              >
                <div className="sf-col-head">
                  <span className="sf-col-title">{bucket.label}</span>
                  <span className={"sf-col-count" + (over ? " over" : "")}>
                    {openN}{cap != null ? ` / ${cap}` : ""} open
                  </span>
                </div>
                <div className="sf-col-hint">
                  {bucket.hint}{bucket.capped ? ` · max ${cap}` : ""}
                </div>

                {over && (
                  <div className="sf-cap-warn">
                    You've got {openN} things in Today. Pick the {cap} that truly must move —
                    push the rest to This Week.
                  </div>
                )}

                {items.length === 0 && (
                  <p className="sf-empty">
                    {allInBucket.length === 0
                      ? "Nothing here yet."
                      : `Nothing matches the filter — ${filteredOut} hidden.`}
                  </p>
                )}
                {items.length > 0 && filteredOut > 0 && (
                  <div className="sf-col-hint" style={{ marginTop: -4, marginBottom: 8 }}>
                    {filteredOut} hidden by filter
                  </div>
                )}

                {items.map((t) => {
                  const due = t.chaseDate && t.chaseDate <= today;
                  const overdue = t.dueDate && t.dueDate <= today && !t.done;
                  const isDragging = dragId === t.id;
                  const showDropLine = dropBeforeId === t.id && dragId && dragId !== t.id;
                  return (
                    <div
                      className={
                        "sf-task" + (t.done ? " done" : "") +
                        (isDragging ? " dragging" : "") +
                        (showDropLine ? " drop-before" : "") +
                        (flashTaskId === t.id ? " flash" : "")
                      }
                      key={t.id}
                      data-task-id={t.id}
                      draggable={editingId !== t.id && editingTeamId !== t.id && editingNotesId !== t.id}
                      onDragStart={(e) => {
                        setDragId(t.id);
                        e.dataTransfer.effectAllowed = "move";
                        try { e.dataTransfer.setData("text/plain", t.id); } catch {}
                      }}
                      onDragEnd={() => { setDragId(null); setDropBucket(null); setDropBeforeId(null); }}
                      onDragOver={(e) => {
                        if (!dragId || dragId === t.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                        setDropBucket(bucket.id);
                        setDropBeforeId(t.id);
                      }}
                      onDrop={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        e.stopPropagation();
                        moveTask(dragId, bucket.id, t.id === dragId ? null : t.id);
                        setDragId(null); setDropBucket(null); setDropBeforeId(null);
                      }}
                    >
                      <span className="sf-grip" title="Drag to reorder">⋮⋮</span>
                      <button
                        className={"sf-check" + (t.done ? " on" : "")}
                        onClick={() => update(t.id, { done: !t.done })}
                        title="Mark done"
                      >{t.done ? "✓" : ""}</button>

                      <div className="sf-task-body">
                        {editingId === t.id ? (
                          <textarea
                            autoFocus
                            className="sf-task-edit"
                            rows={1}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onInput={(e) => autoSize(e.currentTarget)}
                            ref={(el) => { if (el && editingId === t.id) autoSize(el); }}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                commitEdit();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div
                            className="sf-task-title"
                            onClick={(e) => {
                              // Don't enter edit mode when the user clicks a link inside.
                              if (e.target.tagName === "A") return;
                              e.stopPropagation();
                              startEdit(t);
                            }}
                            title="Click to edit · Shift+Enter for newline"
                            dangerouslySetInnerHTML={{ __html: renderTitle(t.title, trimmedSearch) }}
                          />
                        )}
                        <div className="sf-meta" onClick={(e) => e.stopPropagation()}>
                          {editingTeamId === t.id ? (
                            <input
                              autoFocus
                              className="sf-chip-edit"
                              list="sf-teams"
                              placeholder="team"
                              value={editTeamDraft}
                              onChange={(e) => setEditTeamDraft(e.target.value)}
                              onBlur={commitTeamEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); commitTeamEdit(); }
                                else if (e.key === "Escape") { e.preventDefault(); cancelTeamEdit(); }
                              }}
                            />
                          ) : t.team ? (
                            <button
                              className="sf-chip sf-chip-team"
                              style={{ background: teamColor(t.team) }}
                              onClick={() => startTeamEdit(t)}
                              title="Click to edit team"
                            >{t.team}</button>
                          ) : (
                            <button
                              className="sf-chip-team-add"
                              onClick={() => startTeamEdit(t)}
                              title="Tag with a team"
                            >+ team</button>
                          )}
                          {t.jira && t.jira.key && (
                            <a
                              className={
                                "sf-chip-jira" +
                                (t.jira.statusCategory ? " cat-" + t.jira.statusCategory : "") +
                                (jiraLoadingId === t.id ? " loading" : "")
                              }
                              href={t.jira.url || "#"}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => { if (!t.jira.url) e.preventDefault(); }}
                              title={
                                t.jira.error
                                  ? `Couldn't sync: ${t.jira.error}`
                                  : t.jira.summary || "Open in Jira"
                              }
                            >
                              <span className="sf-jira-key">{t.jira.key}</span>
                              {t.jira.status && <span className="sf-jira-status">· {t.jira.status}</span>}
                              <button
                                className="sf-jira-refresh"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  enrichWithJira(t.id, t.jira.key, t.jira.url);
                                }}
                                title="Refresh from Jira"
                                disabled={jiraLoadingId === t.id}
                              >↻</button>
                            </a>
                          )}
                          {bucket.id === "waiting" && (
                            <>
                              <input
                                className="sf-chip sf-chip-person"
                                style={{ width: 90 }}
                                placeholder="who?"
                                value={t.person || ""}
                                onChange={(e) => update(t.id, { person: e.target.value })}
                              />
                              <input
                                type="date"
                                className={"sf-chip sf-chip-date" + (due ? " due" : "")}
                                value={t.chaseDate || ""}
                                onChange={(e) => update(t.id, { chaseDate: e.target.value })}
                                title="Chase by"
                              />
                            </>
                          )}
                          {bucket.id === "week" && (
                            <input
                              type="date"
                              className={"sf-chip sf-chip-date" + (overdue ? " due" : "")}
                              value={t.dueDate || ""}
                              onChange={(e) =>
                                update(t.id, { dueDate: e.target.value || null })
                              }
                              title={t.dueDate ? `Due ${t.dueDate}` : "Set a due date"}
                            />
                          )}
                        </div>

                        {(editingNotesId === t.id ||
                          (t.notes && (expandedNotes.has(t.id) || notesAutoExpanded.has(t.id)))) && (
                          <div className="sf-notes" onClick={(e) => e.stopPropagation()}>
                            {editingNotesId === t.id ? (
                              <>
                                <textarea
                                  autoFocus
                                  className="sf-notes-edit"
                                  value={editNotesDraft}
                                  onChange={(e) => setEditNotesDraft(e.target.value)}
                                  onInput={(e) => autoSize(e.currentTarget)}
                                  ref={(el) => { if (el && editingNotesId === t.id) autoSize(el); }}
                                  onBlur={commitNotesEdit}
                                  onKeyDown={(e) => {
                                    // Notes are multi-line by design — plain Enter inserts a
                                    // newline; Cmd/Ctrl+Enter saves; Esc cancels.
                                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                      e.preventDefault();
                                      commitNotesEdit();
                                    } else if (e.key === "Escape") {
                                      e.preventDefault();
                                      cancelNotesEdit();
                                    }
                                  }}
                                  placeholder="Notes — markdown supported"
                                />
                                <div className="sf-notes-hint">
                                  <b>Cmd/Ctrl+Enter</b> to save · <b>Esc</b> to cancel
                                </div>
                              </>
                            ) : (
                              <div
                                className="sf-notes-rendered"
                                onClick={(e) => {
                                  if (e.target.tagName === "A") return;
                                  startNotesEdit(t);
                                }}
                                title="Click to edit"
                                dangerouslySetInnerHTML={{ __html: renderTitle(t.notes || "", trimmedSearch) }}
                              />
                            )}
                          </div>
                        )}
                      </div>

                      <div className="sf-actions">
                        <button
                          className={"sf-mini" + (t.notes ? " has-notes" : "")}
                          onClick={() => {
                            if (t.notes) toggleNotesExpanded(t.id);
                            else startNotesEdit(t);
                          }}
                          title={t.notes ? "Toggle notes" : "Add notes"}
                        >
                          {t.notes
                            ? (expandedNotes.has(t.id) || notesAutoExpanded.has(t.id) ? "notes ▾" : "notes ▸")
                            : "+ notes"}
                        </button>
                        {t.done && (
                          <button
                            className="sf-mini"
                            onClick={() => archive(t.id)}
                            title="Archive"
                          >archive</button>
                        )}
                        <div className="sf-move" onClick={(e) => e.stopPropagation()}>
                          <button className="sf-mini" onClick={() => setOpenMenu(openMenu === t.id ? null : t.id)}>
                            move ▾
                          </button>
                          {openMenu === t.id && (
                            <div className="sf-move-menu">
                              {BUCKETS.filter((b) => b.id !== bucket.id).map((b) => (
                                <button
                                  key={b.id}
                                  className="sf-move-item"
                                  onClick={() => { update(t.id, { bucket: b.id, bucketChangedAt: Date.now() }); setOpenMenu(null); }}
                                >→ {b.label}</button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className="sf-mini"
                          onClick={() => {
                            const preview = t.title.length > 60 ? t.title.slice(0, 57) + "…" : t.title;
                            if (window.confirm(`Delete this task?\n\n"${preview}"`)) remove(t.id);
                          }}
                          title="Delete"
                        >✕</button>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>

        {/* Cross-team balance */}
        {settings.showBalance && balance.length > 0 && (
          <div className="sf-balance">
            <div className="sf-balance-title">Where your attention is going</div>
            <div className="sf-balance-sub">
              Open items per team. If one bar dwarfs the others, ask whether that's
              the highest-leverage place for you — or just the loudest.
            </div>
            {balance.map((row) => (
              <div className="sf-bar-row" key={row.name}>
                <div className="sf-bar-label" title={row.name}>{row.name}</div>
                <div className="sf-bar-track">
                  <div
                    className="sf-bar-fill"
                    style={{
                      width: `${(row.n / maxBalance) * 100}%`,
                      background: row.name.startsWith("—") ? "var(--ink-faint)" : teamColor(row.name),
                    }}
                  />
                </div>
                <div className="sf-bar-num">{row.n}</div>
              </div>
            ))}
          </div>
        )}

        {/* Footer: review ritual + reset */}
        <div className="sf-footer">
          <div className="sf-review">
            <b>The ritual that makes it work:</b><br />
            Morning — set your ≤3, scan Waiting On, chase anyone about to block you.<br />
            End of day — clear done, move things, glance at the balance bars.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="sf-saving">
              {saveState === "saving" && "saving…"}
              {saveState === "saved" && "saved ✓"}
              {saveState === "error" && "⚠ save failed"}
            </span>
            {doneNotArchivedCount > 0 && (
              <button
                className="sf-reset"
                onClick={archiveAllDone}
                title="Move all completed tasks to the archive"
              >Archive done ({doneNotArchivedCount})</button>
            )}
            <button
              className="sf-reset"
              onClick={() => { if (window.confirm("Clear all tasks? This can't be undone.")) setTasks([]); }}
            >Reset board</button>
          </div>
        </div>
      </div>
      </main>
    </div>
  );
}
