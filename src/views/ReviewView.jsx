import React from "react";
import { BUCKETS, DEFAULT_JQL } from "../constants.js";
import { renderTitle } from "../lib/markdown.js";
import { autoSize } from "../lib/dom.js";
import { uid } from "../lib/ids.js";
import { styles } from "../styles.js";
import { Sidebar } from "../components/Sidebar.jsx";
import { useStore } from "../store/StoreContext.jsx";

export function ReviewView() {
  const {
    activeTasks, archive, archivedTasks, flashTask, palette, setView, settings, tasks, today, view,
  } = useStore();
    // Build the data the review needs. All computations are local to this
    // view — none of it persists.
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const startOf7d = nowMs - 7 * dayMs;
    const ageInDays = (t) => Math.floor((nowMs - (t.bucketChangedAt || t.createdAt || nowMs)) / dayMs);

    // Shipped this past 7 days = archived in the last 7 days. Grouped by day.
    const shipped = archivedTasks.filter((t) => t.archivedAt && t.archivedAt >= startOf7d);
    const shippedByDay = [];
    {
      let lastKey = null;
      shipped.forEach((t) => {
        const k = new Date(t.archivedAt).toISOString().slice(0, 10);
        if (k !== lastKey) { shippedByDay.push({ day: k, items: [] }); lastKey = k; }
        shippedByDay[shippedByDay.length - 1].items.push(t);
      });
    }

    // Open work = active and not done. Stuck longest = sorted by bucketChangedAt asc.
    const openTasks = activeTasks.filter((t) => !t.done);
    const stuckLongest = [...openTasks]
      .sort((a, b) =>
        (a.bucketChangedAt || a.createdAt || 0) - (b.bucketChangedAt || b.createdAt || 0)
      )
      .slice(0, 6);

    // Waiting On chase-due + Week overdue.
    const todayIso = new Date().toISOString().slice(0, 10);
    const chaseDue = openTasks.filter(
      (t) => t.bucket === "waiting" && t.chaseDate && t.chaseDate <= todayIso
    );
    const weekOverdue = openTasks.filter(
      (t) => t.bucket === "week" && t.dueDate && t.dueDate <= todayIso
    );

    // Hero stats
    const todayCount = openTasks.filter((t) => t.bucket === "today").length;
    const todayOverCap = Math.max(0, todayCount - settings.todayCap);
    const shippedTeams = new Set(shipped.map((t) => t.team).filter(Boolean));

    const ageClass = (days, soft, hard) =>
      days >= hard ? "danger" : days >= soft ? "warn" : "";
    const bucketLabel = (id) => BUCKETS.find((b) => b.id === id)?.label || id;

    const jumpTo = (t, archived) => {
      if (archived) setView("archive");
      else setView("board");
      setTimeout(() => flashTask(t.id), 30);
    };

    return (
      <div className={"sf-root" + (settings.darkMode ? "" : " light")}>
        <style>{styles}</style>
        {palette}
        <Sidebar view={view} setView={setView} pulseEnabled={settings.teamPulse} />
        <main className="sf-main">
          <div className="sf-wrap">
            <header>
              <h1 className="sf-h1">Review</h1>
              <p className="sf-sub">
                What you shipped, what's drifting, what's about to block you.
                Click any row to jump to it.
              </p>
            </header>
            <hr className="sf-rule" />

            <div className="sf-rev-stats">
              <div className="sf-rev-stat">
                <div className="sf-rev-stat-num accent">{shipped.length}</div>
                <div className="sf-rev-stat-label">shipped · last 7 days</div>
                <div className="sf-rev-stat-hint">
                  {shippedTeams.size > 0
                    ? `across ${shippedTeams.size} team${shippedTeams.size === 1 ? "" : "s"}`
                    : shipped.length === 0
                      ? "nothing archived this week"
                      : "untagged"}
                </div>
              </div>
              <div className="sf-rev-stat">
                <div className={"sf-rev-stat-num" + (todayOverCap > 0 ? " danger" : "")}>
                  {todayCount}
                </div>
                <div className="sf-rev-stat-label">open in Today</div>
                <div className="sf-rev-stat-hint">
                  {todayOverCap > 0
                    ? `${todayOverCap} over your cap of ${settings.todayCap}`
                    : `cap ${settings.todayCap} — you're on it`}
                </div>
              </div>
              <div className="sf-rev-stat">
                <div className={"sf-rev-stat-num" + (chaseDue.length > 0 ? " danger" : "")}>
                  {chaseDue.length}
                </div>
                <div className="sf-rev-stat-label">waiting · chase due</div>
                <div className="sf-rev-stat-hint">
                  {chaseDue.length === 0 ? "nothing past its chase date" : "ping them today"}
                </div>
              </div>
              <div className="sf-rev-stat">
                <div className={"sf-rev-stat-num" + (weekOverdue.length > 0 ? " danger" : "")}>
                  {weekOverdue.length}
                </div>
                <div className="sf-rev-stat-label">week · overdue</div>
                <div className="sf-rev-stat-hint">
                  {weekOverdue.length === 0 ? "all Week dates are future" : "consider pulling into Today"}
                </div>
              </div>
            </div>

            <div className="sf-rev-section">
              <div className="sf-rev-title">What you shipped this week</div>
              <div className="sf-rev-sub">Archived in the last 7 days, newest first.</div>
              {shipped.length === 0 ? (
                <div className="sf-rev-empty">
                  Nothing archived this past week — either it was a quiet week,
                  or you've got done items waiting in the footer's "Archive done" button.
                </div>
              ) : (
                shippedByDay.map((g) => (
                  <div key={g.day}>
                    <div className="sf-rev-day">{g.day}</div>
                    {g.items.map((t) => (
                      <div className="sf-rev-row" key={t.id} onClick={() => jumpTo(t, true)}>
                        <div className="sf-rev-body">
                          <div
                            className="sf-rev-task-title"
                            dangerouslySetInnerHTML={{ __html: renderTitle(t.title) }}
                          />
                          <div className="sf-rev-meta">
                            from {bucketLabel(t.bucket)}{t.team ? ` · ${t.team}` : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            <div className="sf-rev-section">
              <div className="sf-rev-title">Sitting the longest</div>
              <div className="sf-rev-sub">
                Open tasks that haven't moved buckets recently — review and either commit, reschedule, or let go.
              </div>
              {stuckLongest.length === 0 ? (
                <div className="sf-rev-empty">No open work — clean board.</div>
              ) : stuckLongest.map((t) => {
                const days = ageInDays(t);
                const soft = t.bucket === "today" ? 3 : t.bucket === "waiting" ? 7 : 14;
                const hard = t.bucket === "today" ? 7 : t.bucket === "waiting" ? 14 : 30;
                return (
                  <div className="sf-rev-row" key={t.id} onClick={() => jumpTo(t, false)}>
                    <div className="sf-rev-body">
                      <div
                        className="sf-rev-task-title"
                        dangerouslySetInnerHTML={{ __html: renderTitle(t.title) }}
                      />
                      <div className="sf-rev-meta">
                        {bucketLabel(t.bucket)}{t.team ? ` · ${t.team}` : ""}
                      </div>
                    </div>
                    <div className={"sf-rev-age " + ageClass(days, soft, hard)}>
                      {days === 0 ? "today" : `${days}d`}
                    </div>
                  </div>
                );
              })}
            </div>

            {(chaseDue.length > 0 || weekOverdue.length > 0) && (
              <div className="sf-rev-section">
                <div className="sf-rev-title">About to block you</div>
                <div className="sf-rev-sub">
                  Waiting On items past their chase date, and Week items past their due date.
                </div>
                {chaseDue.map((t) => (
                  <div className="sf-rev-row" key={`c-${t.id}`} onClick={() => jumpTo(t, false)}>
                    <div className="sf-rev-body">
                      <div
                        className="sf-rev-task-title"
                        dangerouslySetInnerHTML={{ __html: renderTitle(t.title) }}
                      />
                      <div className="sf-rev-meta">
                        Waiting On {t.person || "(someone)"}{t.team ? ` · ${t.team}` : ""}
                      </div>
                    </div>
                    <div className="sf-rev-age danger">chase {t.chaseDate}</div>
                  </div>
                ))}
                {weekOverdue.map((t) => (
                  <div className="sf-rev-row" key={`w-${t.id}`} onClick={() => jumpTo(t, false)}>
                    <div className="sf-rev-body">
                      <div
                        className="sf-rev-task-title"
                        dangerouslySetInnerHTML={{ __html: renderTitle(t.title) }}
                      />
                      <div className="sf-rev-meta">
                        Week{t.team ? ` · ${t.team}` : ""}
                      </div>
                    </div>
                    <div className="sf-rev-age danger">due {t.dueDate}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
}
