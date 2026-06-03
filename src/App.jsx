import React, { useState, useEffect, useMemo, useCallback } from "react";

// ── SquadFlow ──────────────────────────────────────────────────────────────
// A focused task instrument for a staff engineer managing multiple squads.
// Four buckets, squad tagging, a "waiting on" view, and cross-squad balance.
// Data persists across sessions via window.storage.

const BUCKETS = [
  { id: "today", label: "Today", hint: "Must move today · max 3", cap: 3 },
  { id: "week", label: "This Week", hint: "Committed, scheduled, not today" },
  { id: "waiting", label: "Waiting On", hint: "Handed off · chase before it blocks you" },
  { id: "someday", label: "Someday", hint: "Out of your head, off your plate" },
];

const STORAGE_KEY = "squadflow:state:v1";

const PALETTE = ["#c8853b", "#7c9a6d", "#9a6d8e", "#5d8a9a", "#b5654d", "#8a7c5d"];

const uid = () => Math.random().toString(36).slice(2, 10);

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

.sf-root { --bg:#1c1a17; --panel:#252320; --panel-2:#2c2925; --line:#39352f; --ink:#ece6db; --ink-dim:#a39c8e; --ink-faint:#6f685c; --accent:#d4943f; --danger:#b5654d; }
.sf-root *{box-sizing:border-box;}
.sf-root{ background:var(--bg); color:var(--ink); font-family:'IBM Plex Sans',sans-serif; min-height:100vh; padding:32px 24px 80px; }
.sf-wrap{ max-width:1100px; margin:0 auto; }
.sf-mono{ font-family:'IBM Plex Mono',monospace; }
.sf-h1{ font-family:'Fraunces',serif; font-weight:900; font-size:34px; letter-spacing:-0.02em; margin:0; line-height:1; }
.sf-sub{ color:var(--ink-dim); font-size:13.5px; margin-top:8px; max-width:560px; line-height:1.5; }
.sf-rule{ height:1px; background:var(--line); margin:24px 0; border:0; }

.sf-add{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:10px; }
.sf-input{ flex:1 1 260px; min-width:0; background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:8px; padding:10px 12px; font-size:14px; font-family:inherit; outline:none; }
.sf-input:focus{ border-color:var(--accent); }
.sf-input::placeholder{ color:var(--ink-faint); }
.sf-sel{ background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:8px; padding:10px; font-size:13px; font-family:inherit; outline:none; cursor:pointer; }
.sf-btn{ background:var(--accent); color:#1c1a17; border:0; border-radius:8px; padding:10px 16px; font-weight:600; font-size:14px; cursor:pointer; font-family:inherit; transition:transform .08s ease, filter .15s ease; }
.sf-btn:hover{ filter:brightness(1.08); }
.sf-btn:active{ transform:translateY(1px); }
.sf-btn:disabled{ opacity:.4; cursor:not-allowed; }

.sf-grid{ display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-top:24px; }
@media(max-width:760px){ .sf-grid{ grid-template-columns:1fr; } }

.sf-col{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px; display:flex; flex-direction:column; }
.sf-col-head{ display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:4px; }
.sf-col-title{ font-family:'Fraunces',serif; font-weight:600; font-size:18px; letter-spacing:-0.01em; }
.sf-col-count{ font-size:12px; color:var(--ink-faint); }
.sf-col-count.over{ color:var(--danger); font-weight:500; }
.sf-col-hint{ font-size:11.5px; color:var(--ink-faint); margin-bottom:12px; }

.sf-cap-warn{ background:rgba(181,101,77,.14); border:1px solid rgba(181,101,77,.4); color:#e0a48f; font-size:12px; padding:7px 10px; border-radius:8px; margin-bottom:10px; }

.sf-task{ background:var(--panel-2); border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin-bottom:8px; display:flex; gap:10px; align-items:flex-start; transition:border-color .15s ease; }
.sf-task:hover{ border-color:#4a453d; }
.sf-task.done{ opacity:.45; }
.sf-task.done .sf-task-title{ text-decoration:line-through; }
.sf-check{ flex:0 0 auto; width:18px; height:18px; border-radius:5px; border:1.5px solid var(--ink-faint); background:transparent; cursor:pointer; margin-top:2px; display:flex; align-items:center; justify-content:center; padding:0; }
.sf-check.on{ background:var(--accent); border-color:var(--accent); color:#1c1a17; font-size:12px; font-weight:700; }
.sf-task-body{ flex:1; min-width:0; }
.sf-task-title{ font-size:14px; line-height:1.4; word-break:break-word; }
.sf-meta{ display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:6px; }
.sf-chip{ font-size:10.5px; padding:2px 7px; border-radius:20px; font-family:'IBM Plex Mono',monospace; letter-spacing:.02em; }
.sf-chip-squad{ color:#1c1a17; font-weight:500; }
.sf-chip-person{ background:var(--panel); border:1px solid var(--line); color:var(--ink-dim); }
.sf-chip-date{ background:transparent; border:1px solid var(--line); color:var(--ink-faint); }
.sf-chip-date.due{ color:var(--danger); border-color:rgba(181,101,77,.5); }
.sf-actions{ display:flex; gap:2px; flex:0 0 auto; }
.sf-mini{ background:transparent; border:0; color:var(--ink-faint); cursor:pointer; font-size:11px; padding:3px 6px; border-radius:6px; font-family:inherit; }
.sf-mini:hover{ background:var(--panel); color:var(--ink); }
.sf-empty{ color:var(--ink-faint); font-size:12.5px; font-style:italic; padding:8px 2px; }

.sf-move{ position:relative; }
.sf-move-menu{ position:absolute; right:0; top:100%; margin-top:4px; background:var(--panel-2); border:1px solid var(--line); border-radius:8px; padding:4px; z-index:20; box-shadow:0 8px 24px rgba(0,0,0,.4); min-width:130px; }
.sf-move-item{ display:block; width:100%; text-align:left; background:transparent; border:0; color:var(--ink-dim); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-family:inherit; }
.sf-move-item:hover{ background:var(--accent); color:#1c1a17; }

.sf-balance{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px 18px; margin-top:24px; }
.sf-balance-title{ font-family:'Fraunces',serif; font-weight:600; font-size:16px; margin-bottom:3px; }
.sf-balance-sub{ font-size:11.5px; color:var(--ink-faint); margin-bottom:14px; }
.sf-bar-row{ display:flex; align-items:center; gap:12px; margin-bottom:8px; }
.sf-bar-label{ width:110px; flex:0 0 auto; font-size:12.5px; font-family:'IBM Plex Mono',monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sf-bar-track{ flex:1; height:14px; background:var(--panel-2); border-radius:7px; overflow:hidden; }
.sf-bar-fill{ height:100%; border-radius:7px; transition:width .4s ease; }
.sf-bar-num{ width:28px; flex:0 0 auto; text-align:right; font-size:12px; font-family:'IBM Plex Mono',monospace; color:var(--ink-dim); }

.sf-footer{ display:flex; justify-content:space-between; align-items:center; margin-top:28px; flex-wrap:wrap; gap:12px; }
.sf-review{ font-size:12px; color:var(--ink-dim); line-height:1.6; }
.sf-review b{ color:var(--ink); font-weight:600; }
.sf-reset{ background:transparent; border:1px solid var(--line); color:var(--ink-faint); border-radius:8px; padding:7px 12px; font-size:11.5px; cursor:pointer; font-family:inherit; }
.sf-reset:hover{ border-color:var(--danger); color:var(--danger); }
.sf-saving{ font-size:11px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; }
`;

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [draft, setDraft] = useState("");
  const [draftBucket, setDraftBucket] = useState("today");
  const [draftSquad, setDraftSquad] = useState("");
  const [openMenu, setOpenMenu] = useState(null);

  // Load once
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed.tasks)) setTasks(parsed.tasks);
        }
      } catch (e) {
        // No existing key — fresh start. Not an error worth surfacing.
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Persist on change (after initial load)
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setSaveState("saving");
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify({ tasks }));
        if (!cancelled) {
          setSaveState("saved");
          setTimeout(() => !cancelled && setSaveState("idle"), 1200);
        }
      } catch (e) {
        if (!cancelled) setSaveState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [tasks, loaded]);

  const squads = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => t.squad && set.add(t.squad));
    return Array.from(set).sort();
  }, [tasks]);

  const squadColor = useCallback(
    (name) => {
      if (!name) return "var(--ink-faint)";
      const idx = squads.indexOf(name);
      return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
    },
    [squads]
  );

  const addTask = () => {
    const title = draft.trim();
    if (!title) return;
    const t = {
      id: uid(),
      title,
      bucket: draftBucket,
      squad: draftSquad.trim() || null,
      person: null,
      chaseDate: null,
      done: false,
      createdAt: Date.now(),
    };
    setTasks((prev) => [t, ...prev]);
    setDraft("");
  };

  const update = (id, patch) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const todayCount = tasks.filter((t) => t.bucket === "today" && !t.done).length;

  // Cross-squad balance: open (not done) items per squad
  const balance = useMemo(() => {
    const counts = {};
    tasks.forEach((t) => {
      if (t.done) return;
      const key = t.squad || "— untagged —";
      counts[key] = (counts[key] || 0) + 1;
    });
    const rows = Object.entries(counts).map(([name, n]) => ({ name, n }));
    rows.sort((a, b) => b.n - a.n);
    return rows;
  }, [tasks]);
  const maxBalance = Math.max(1, ...balance.map((r) => r.n));

  const today = new Date().toISOString().slice(0, 10);

  if (!loaded) {
    return (
      <div className="sf-root">
        <style>{styles}</style>
        <div className="sf-wrap"><p className="sf-empty">Loading your board…</p></div>
      </div>
    );
  }

  return (
    <div className="sf-root" onClick={() => setOpenMenu(null)}>
      <style>{styles}</style>
      <div className="sf-wrap">
        <header>
          <h1 className="sf-h1">SquadFlow</h1>
          <p className="sf-sub">
            Capture everything, separate your action from what you're waiting on, and
            keep one squad from quietly eating all your attention. Three things in
            Today is a ceiling, not a target.
          </p>
        </header>

        <hr className="sf-rule" />

        {/* Quick add */}
        <div className="sf-add" onClick={(e) => e.stopPropagation()}>
          <input
            className="sf-input"
            placeholder="What needs doing? (e.g. Review Squad A's API design)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
          />
          <input
            className="sf-sel"
            list="sf-squads"
            placeholder="Squad…"
            value={draftSquad}
            onChange={(e) => setDraftSquad(e.target.value)}
            style={{ flex: "0 1 130px" }}
          />
          <datalist id="sf-squads">
            {squads.map((s) => <option key={s} value={s} />)}
          </datalist>
          <select className="sf-sel" value={draftBucket} onChange={(e) => setDraftBucket(e.target.value)}>
            {BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <button className="sf-btn" onClick={addTask} disabled={!draft.trim()}>Add</button>
        </div>

        {/* Buckets */}
        <div className="sf-grid">
          {BUCKETS.map((bucket) => {
            const items = tasks.filter((t) => t.bucket === bucket.id);
            const openN = items.filter((t) => !t.done).length;
            const over = bucket.cap && openN > bucket.cap;
            return (
              <section className="sf-col" key={bucket.id}>
                <div className="sf-col-head">
                  <span className="sf-col-title">{bucket.label}</span>
                  <span className={"sf-col-count" + (over ? " over" : "")}>
                    {openN}{bucket.cap ? ` / ${bucket.cap}` : ""} open
                  </span>
                </div>
                <div className="sf-col-hint">{bucket.hint}</div>

                {over && (
                  <div className="sf-cap-warn">
                    You've got {openN} things in Today. Pick the 3 that truly must move —
                    push the rest to This Week.
                  </div>
                )}

                {items.length === 0 && <p className="sf-empty">Nothing here yet.</p>}

                {items.map((t) => {
                  const due = t.chaseDate && t.chaseDate <= today;
                  return (
                    <div className={"sf-task" + (t.done ? " done" : "")} key={t.id}>
                      <button
                        className={"sf-check" + (t.done ? " on" : "")}
                        onClick={() => update(t.id, { done: !t.done })}
                        title="Mark done"
                      >{t.done ? "✓" : ""}</button>

                      <div className="sf-task-body">
                        <div className="sf-task-title">{t.title}</div>
                        <div className="sf-meta">
                          {t.squad && (
                            <span className="sf-chip sf-chip-squad" style={{ background: squadColor(t.squad) }}>
                              {t.squad}
                            </span>
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
                        </div>
                      </div>

                      <div className="sf-actions">
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
                                  onClick={() => { update(t.id, { bucket: b.id }); setOpenMenu(null); }}
                                >→ {b.label}</button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button className="sf-mini" onClick={() => remove(t.id)} title="Delete">✕</button>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>

        {/* Cross-squad balance */}
        {balance.length > 0 && (
          <div className="sf-balance">
            <div className="sf-balance-title">Where your attention is going</div>
            <div className="sf-balance-sub">
              Open items per squad. If one bar dwarfs the others, ask whether that's
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
                      background: row.name.startsWith("—") ? "var(--ink-faint)" : squadColor(row.name),
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
            <button
              className="sf-reset"
              onClick={() => { if (window.confirm("Clear all tasks? This can't be undone.")) setTasks([]); }}
            >Reset board</button>
          </div>
        </div>
      </div>
    </div>
  );
}
