import React from "react";
import { BUCKETS, DEFAULT_JQL } from "../constants.js";
import { renderTitle } from "../lib/markdown.js";
import { autoSize } from "../lib/dom.js";
import { uid } from "../lib/ids.js";
import { styles } from "../styles.js";
import { Sidebar } from "../components/Sidebar.jsx";
import { useStore } from "../store/StoreContext.jsx";

export function ArchiveView() {
  const {
    archive, archivedTasks, flashTaskId, palette, remove, restore, setTasks, setView, settings, tasks, teamColor, view,
  } = useStore();
    const groups = [];
    let currentKey = null;
    archivedTasks.forEach((t) => {
      const key = new Date(t.archivedAt).toISOString().slice(0, 10);
      if (key !== currentKey) {
        groups.push({ key, items: [] });
        currentKey = key;
      }
      groups[groups.length - 1].items.push(t);
    });

    return (
      <div className={"sf-root" + (settings.darkMode ? "" : " light")}>
        <style>{styles}</style>
        {palette}
        <Sidebar view={view} setView={setView} pulseEnabled={settings.teamPulse} />
        <main className="sf-main">
          <div className="sf-wrap">
            <header>
              <h1 className="sf-h1">Archive</h1>
              <p className="sf-sub">
                Completed work, out of the way but not gone. Restore anything that
                shouldn't have been archived, or delete it for good.
              </p>
            </header>
            <hr className="sf-rule" />

            {archivedTasks.length === 0 ? (
              <p className="sf-archive-empty">
                Nothing archived yet. Complete a task and hit "archive" on the row, or
                use "Archive done" in the footer to bulk-archive.
              </p>
            ) : (
              <>
                <div className="sf-arc-bulk">
                  <span>{archivedTasks.length} archived task{archivedTasks.length === 1 ? "" : "s"}</span>
                  <button
                    className="sf-reset"
                    onClick={() => {
                      if (window.confirm(`Permanently delete all ${archivedTasks.length} archived tasks? This can't be undone.`)) {
                        setTasks((prev) => prev.filter((t) => !t.archivedAt));
                      }
                    }}
                  >Empty archive</button>
                </div>
                {groups.map((g) => (
                  <div className="sf-arc-group" key={g.key}>
                    <div className="sf-arc-date">{g.key}</div>
                    {g.items.map((t) => (
                      <div
                        className={"sf-arc-item" + (flashTaskId === t.id ? " flash" : "")}
                        key={t.id}
                        data-task-id={t.id}
                      >
                        <div className="sf-arc-body">
                          <div
                            className="sf-arc-title"
                            dangerouslySetInnerHTML={{ __html: renderTitle(t.title) }}
                          />
                          {t.notes && (
                            <div
                              className="sf-notes-rendered"
                              style={{ marginTop: 6 }}
                              dangerouslySetInnerHTML={{ __html: renderTitle(t.notes) }}
                            />
                          )}
                          <div className="sf-arc-meta">
                            {t.team && (
                              <span className="sf-chip sf-chip-team" style={{ background: teamColor(t.team) }}>
                                {t.team}
                              </span>
                            )}
                            <span className="sf-chip sf-chip-date">
                              from {BUCKETS.find((b) => b.id === t.bucket)?.label || t.bucket}
                            </span>
                          </div>
                        </div>
                        <div className="sf-arc-actions">
                          <button className="sf-mini" onClick={() => restore(t.id)} title="Move back to its bucket">restore</button>
                          <button
                            className="sf-mini"
                            onClick={() => {
                              const preview = t.title.length > 60 ? t.title.slice(0, 57) + "…" : t.title;
                              if (window.confirm(`Permanently delete this task?\n\n"${preview}"`)) remove(t.id);
                            }}
                            title="Delete permanently"
                          >✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </main>
      </div>
    );
}
