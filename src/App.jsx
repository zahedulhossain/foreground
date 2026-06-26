import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  BUCKETS, STORAGE_KEY, JIRA_KEY, PULSE_KEY,
  DEFAULT_SETTINGS, DEFAULT_PULSE, DEFAULT_JQL, PALETTE,
} from "./constants.js";
import { styles } from "./styles.js";
import { uid } from "./lib/ids.js";
import { renderTitle } from "./lib/markdown.js";
import { autoSize } from "./lib/dom.js";
import { detectJira } from "./lib/jiraText.js";
import { Sidebar } from "./components/Sidebar.jsx";

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [view, setView] = useState("board"); // board | archive | review | jira | settings
  const [ioStatus, setIoStatus] = useState(null); // { kind: "ok"|"err", msg }
  const fileInputRef = React.useRef(null);
  const [jiraCreds, setJiraCreds] = useState({ baseUrl: "", email: "", token: "", cloudId: "" });
  const [jiraTestStatus, setJiraTestStatus] = useState(null); // { kind, msg }
  const [jiraLoadingId, setJiraLoadingId] = useState(null);
  // Jira page: import search + bulk refresh state
  const [jiraQuery, setJiraQuery] = useState(DEFAULT_JQL);
  const [jiraResults, setJiraResults] = useState(null); // null = not searched yet; [] = no results
  const [jiraSearchState, setJiraSearchState] = useState("idle"); // idle | loading | error
  const [jiraSearchError, setJiraSearchError] = useState("");
  const [jiraImportSel, setJiraImportSel] = useState(() => new Set());
  const [jiraImportBucket, setJiraImportBucket] = useState("week");
  const [jiraImportTeam, setJiraImportTeam] = useState("");
  const [jiraBulkStatus, setJiraBulkStatus] = useState(null); // { kind, msg }
  // Team Pulse
  const [pulseConfig, setPulseConfig] = useState(DEFAULT_PULSE);
  const [pulseData, setPulseData] = useState({}); // teamId -> aggregated result | { error }
  const [pulseLoading, setPulseLoading] = useState(false);
  const [pulseLastRun, setPulseLastRun] = useState(null);
  const [pulseBoards, setPulseBoards] = useState(null); // cached board list for the config picker
  const [pulseFieldHint, setPulseFieldHint] = useState(null); // status line for field loading
  const [pulseAllFields, setPulseAllFields] = useState(null); // full [{id,name}] list, cached
  const [pulsePointSearch, setPulsePointSearch] = useState(""); // free-text filter over fields
  const [pulseStatuses, setPulseStatuses] = useState(null); // [{name,category}] from the instance
  const [pulseStatusOpen, setPulseStatusOpen] = useState(false); // status-mapping panel open?
  const [pulseDraft, setPulseDraft] = useState({ name: "", source: "board", boardId: "", jql: "" });
  const [pulseDragId, setPulseDragId] = useState(null);
  const [pulseDropBeforeId, setPulseDropBeforeId] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftBucket, setDraftBucket] = useState("today");
  const [draftTeam, setDraftTeam] = useState("");
  const [openMenu, setOpenMenu] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editTeamDraft, setEditTeamDraft] = useState("");
  // Notes: which task ids are currently expanded, which is being edited, and
  // the draft text. Expanded is a Set so several tasks can be open at once.
  const [expandedNotes, setExpandedNotes] = useState(() => new Set());
  const [editingNotesId, setEditingNotesId] = useState(null);
  const [editNotesDraft, setEditNotesDraft] = useState("");

  const startEdit = (t) => { setEditingId(t.id); setEditDraft(t.title); };
  const cancelEdit = () => { setEditingId(null); setEditDraft(""); };
  const commitEdit = () => {
    const title = editDraft.trim();
    const id = editingId;
    if (id && title) {
      const current = tasks.find((t) => t.id === id);
      update(id, { title });
      // If the edited title now references a different Jira key (or the first one), re-enrich.
      const detected = detectJira(title);
      const currentKey = current && current.jira && current.jira.key;
      if (detected && detected.key !== currentKey) {
        enrichWithJira(id, detected.key, detected.url);
      }
    }
    setEditingId(null);
    setEditDraft("");
  };

  const [dragId, setDragId] = useState(null);
  const [dropBeforeId, setDropBeforeId] = useState(null);
  const [dropBucket, setDropBucket] = useState(null);

  // Filter state — search applies to the visible title text; teamFilter is a
  // Set of team names (empty = include all teams); hideDone collapses done
  // items out of the board entirely.
  const [searchTerm, setSearchTerm] = useState("");
  const [teamFilter, setTeamFilter] = useState(new Set());
  const [hideDone, setHideDone] = useState(false);

  // Command palette state. paletteOpen toggles the overlay; query and
  // selectedIdx drive its list. selectedIdx is reset whenever the list shape
  // changes (query, view, or open/close).
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [flashTaskId, setFlashTaskId] = useState(null);

  const addInputRef = React.useRef(null);
  const searchInputRef = React.useRef(null);
  const paletteInputRef = React.useRef(null);

  const toggleTeamFilter = (name) => {
    setTeamFilter((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };
  const clearFilters = () => { setSearchTerm(""); setTeamFilter(new Set()); setHideDone(false); };

  const trimmedSearch = searchTerm.trim().toLowerCase();
  const filtersActive = !!trimmedSearch || teamFilter.size > 0 || hideDone;

  const matchesFilters = useCallback((t) => {
    if (hideDone && t.done) return false;
    if (teamFilter.size > 0) {
      // Untagged tasks never match a positive team filter.
      if (!t.team || !teamFilter.has(t.team)) return false;
    }
    if (trimmedSearch) {
      const hay = ((t.title || "") + "\n" + (t.notes || "")).toLowerCase();
      if (!hay.includes(trimmedSearch)) return false;
    }
    return true;
  }, [hideDone, teamFilter, trimmedSearch]);
  // filteredVisibleCount is defined further down, alongside activeTasks — it
  // depends on it, and JS const declarations don't hoist.

  const moveTask = (id, targetBucket, beforeId) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const current = prev[idx];
      // Only reset the "in this bucket since" timestamp when the bucket
      // actually changes — pure reordering within the same column doesn't
      // count as "moving."
      const moved = {
        ...current,
        bucket: targetBucket,
        bucketChangedAt: current.bucket === targetBucket
          ? (current.bucketChangedAt || current.createdAt || Date.now())
          : Date.now(),
      };
      const without = prev.filter((t) => t.id !== id);
      if (beforeId && beforeId !== id) {
        const targetIdx = without.findIndex((t) => t.id === beforeId);
        if (targetIdx >= 0) {
          return [...without.slice(0, targetIdx), moved, ...without.slice(targetIdx)];
        }
      }
      // No anchor → append. Since render filters by bucket, this places it at the
      // bottom of the target bucket.
      return [...without, moved];
    });
  };

  const startTeamEdit = (t) => { setEditingTeamId(t.id); setEditTeamDraft(t.team || ""); };
  const cancelTeamEdit = () => { setEditingTeamId(null); setEditTeamDraft(""); };
  const commitTeamEdit = () => {
    if (editingTeamId) {
      const v = editTeamDraft.trim();
      update(editingTeamId, { team: v || null });
    }
    setEditingTeamId(null);
    setEditTeamDraft("");
  };

  // ── Notes helpers ────────────────────────────────────────────────────────
  const toggleNotesExpanded = (id) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const startNotesEdit = (t) => {
    setEditingNotesId(t.id);
    setEditNotesDraft(t.notes || "");
    setExpandedNotes((prev) => new Set(prev).add(t.id));
  };
  const cancelNotesEdit = () => { setEditingNotesId(null); setEditNotesDraft(""); };
  const commitNotesEdit = () => {
    if (editingNotesId) {
      // Don't trim — notes may have intentional leading/trailing whitespace
      // (e.g. an indented code block). But empty-after-trim ⇒ null, so we
      // don't bloat the data with hollow notes blocks.
      const v = editNotesDraft;
      update(editingNotesId, { notes: v.trim() ? v : null });
    }
    setEditingNotesId(null);
    setEditNotesDraft("");
  };

  // Load once
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed.tasks)) setTasks(parsed.tasks);
          if (parsed.settings && typeof parsed.settings === "object") {
            setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
          }
        }
      } catch (e) {
        // No existing key — fresh start. Not an error worth surfacing.
      }
      try {
        const jres = await window.storage.get(JIRA_KEY);
        if (jres && jres.value) {
          const parsed = JSON.parse(jres.value);
          setJiraCreds({
            baseUrl: parsed.baseUrl || "",
            email: parsed.email || "",
            token: parsed.token || "",
            cloudId: parsed.cloudId || "",
          });
        }
      } catch {}
      try {
        const pres = await window.storage.get(PULSE_KEY);
        if (pres && pres.value) {
          const parsed = JSON.parse(pres.value);
          setPulseConfig({ ...DEFAULT_PULSE, ...parsed, teams: Array.isArray(parsed.teams) ? parsed.teams : [] });
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const persistJiraCreds = useCallback(async (next) => {
    setJiraCreds(next);
    try { await window.storage.set(JIRA_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const persistPulseConfig = useCallback(async (next) => {
    setPulseConfig(next);
    try { await window.storage.set(PULSE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  // Two valid shapes:
  //   - classic: baseUrl + email + token (Basic auth against tenant URL)
  //   - scoped:  token + cloudId        (Bearer via api.atlassian.com)
  // baseUrl is still useful in the scoped case for the click-through link.
  const jiraConfigured = !!(
    jiraCreds.token && (
      (jiraCreds.baseUrl && jiraCreds.email) ||
      jiraCreds.cloudId
    )
  );

  // Attach Jira metadata to a task. Resilient: if creds are missing or the
  // fetch fails, we still attach the key + URL so the click-to-open chip works.
  const enrichWithJira = useCallback(async (id, key, fallbackUrl) => {
    if (!key) return;
    setJiraLoadingId(id);
    try {
      if (jiraConfigured) {
        const data = await window.jira.fetch(jiraCreds, key);
        update(id, {
          jira: {
            key: data.key,
            url: data.url,
            summary: data.summary,
            status: data.status,
            statusCategory: data.statusCategory,
            syncedAt: Date.now(),
          },
        });
      } else {
        // No creds: stash whatever we can derive from the text.
        const guessed = fallbackUrl || (jiraCreds.baseUrl
          ? `${jiraCreds.baseUrl.replace(/\/+$/, "")}/browse/${key}`
          : null);
        update(id, { jira: { key, url: guessed, syncedAt: Date.now() } });
      }
    } catch (e) {
      // Keep the key/URL even on failure so the chip still works as a link.
      update(id, {
        jira: {
          key,
          url: fallbackUrl || null,
          error: String(e && e.message || e),
          syncedAt: Date.now(),
        },
      });
    } finally {
      setJiraLoadingId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jiraCreds, jiraConfigured]);

  // Run a JQL search for the import picker.
  const runJiraSearch = async (jql) => {
    if (!jiraConfigured) return;
    setJiraSearchState("loading");
    setJiraSearchError("");
    try {
      const results = await window.jira.search(jiraCreds, jql ?? jiraQuery, 50);
      setJiraResults(results);
      setJiraImportSel(new Set());
      setJiraSearchState("idle");
    } catch (e) {
      setJiraSearchError(String((e && e.message) || e));
      setJiraSearchState("error");
    }
  };

  // Turn the checked search results into board tasks. Skips issues already
  // linked to an existing task so re-importing can't create duplicates.
  const importSelectedIssues = () => {
    if (!jiraResults || jiraImportSel.size === 0) return;
    const now = Date.now();
    const linkedKeys = new Set(tasks.map((t) => t.jira && t.jira.key).filter(Boolean));
    const chosen = jiraResults.filter((r) => jiraImportSel.has(r.key) && !linkedKeys.has(r.key));
    const skipped = jiraImportSel.size - chosen.length;
    if (chosen.length === 0) {
      setJiraBulkStatus({ kind: "err", msg: "All selected issues are already on your board." });
      return;
    }
    const newTasks = chosen.map((r, i) => ({
      id: uid(),
      title: `${r.key} ${r.summary || ""}`.trim(),
      bucket: jiraImportBucket,
      team: jiraImportTeam.trim() || null,
      person: null,
      chaseDate: null,
      dueDate: null,
      done: false,
      notes: null,
      createdAt: now + i, // +i keeps a stable order and avoids identical stamps
      bucketChangedAt: now + i,
      jira: {
        key: r.key,
        url: r.url,
        summary: r.summary,
        status: r.status,
        statusCategory: r.statusCategory,
        syncedAt: now,
      },
    }));
    setTasks((prev) => [...newTasks, ...prev]);
    setJiraImportSel(new Set());
    const label = BUCKETS.find((b) => b.id === jiraImportBucket)?.label || jiraImportBucket;
    setJiraBulkStatus({
      kind: "ok",
      msg: `Imported ${newTasks.length} into ${label}${skipped ? ` · ${skipped} already linked, skipped` : ""}.`,
    });
  };

  // Re-pull status for every linked task at once.
  const bulkRefreshLinked = async () => {
    const linked = tasks.filter((t) => t.jira && t.jira.key);
    if (linked.length === 0) return;
    setJiraBulkStatus({ kind: "info", msg: `Refreshing ${linked.length}…` });
    let ok = 0;
    let fail = 0;
    for (const t of linked) {
      try {
        const data = await window.jira.fetch(jiraCreds, t.jira.key);
        update(t.id, {
          jira: {
            key: data.key,
            url: data.url,
            summary: data.summary,
            status: data.status,
            statusCategory: data.statusCategory,
            syncedAt: Date.now(),
          },
        });
        ok++;
      } catch (e) {
        update(t.id, { jira: { ...t.jira, error: String((e && e.message) || e), syncedAt: Date.now() } });
        fail++;
      }
    }
    setJiraBulkStatus({ kind: fail ? "err" : "ok", msg: `Refreshed ${ok}${fail ? ` · ${fail} failed` : ""}.` });
  };

  // ── Team Pulse fetch + aggregation ───────────────────────────────────────
  // The done-side clause: rolling "last N days" or a fixed from–to range.
  // Range falls back to rolling if either date is missing.
  const doneClause = () => {
    const c = pulseConfig;
    if (c.doneWindowMode === "range" && c.doneWindowFrom && c.doneWindowTo) {
      // Quote dates; include the whole end day with an explicit time.
      return `(resolutiondate >= "${c.doneWindowFrom}" AND resolutiondate <= "${c.doneWindowTo} 23:59")`;
    }
    return `resolutiondate >= -${c.doneWindowDays || 14}d`;
  };
  // Open work is always included; only the done side is windowed.
  const windowJql = () => `(statusCategory != Done OR ${doneClause()})`;
  const wrapJql = (raw) => {
    const parts = String(raw || "").split(/order\s+by/i);
    const base = parts[0].trim();
    const order = parts[1] ? ` ORDER BY ${parts[1].trim()}` : "";
    const body = base ? `(${base}) AND ${windowJql()}` : windowJql();
    return body + order;
  };
  // Human label for the done window, shown on each card's footer.
  const windowLabel = () => {
    const c = pulseConfig;
    if (c.doneWindowMode === "range" && c.doneWindowFrom && c.doneWindowTo) {
      return `${c.doneWindowFrom}→${c.doneWindowTo}`;
    }
    return `${c.doneWindowDays || 14}d`;
  };

  const pointsOf = (issue) => {
    const fid = pulseConfig.pointsFieldId;
    if (!fid || !issue.fields) return 0;
    const v = issue.fields[fid];
    return typeof v === "number" ? v : 0;
  };

  // Classify an issue into a Pulse bucket: a per-status-name override if the
  // user set one, otherwise the status's own Jira category.
  const statusBucket = (issue) => {
    const map = pulseConfig.statusMap || {};
    return map[issue.status] || issue.statusCategory || "new";
  };

  // Aggregate a flat issue list into the per-team shape the card renders.
  const aggregateTeam = (issues, usePoints) => {
    const open = issues.filter((it) => statusBucket(it) !== "done");
    const doneRecent = issues.filter((it) => statusBucket(it) === "done");
    const statusCounts = { new: 0, indeterminate: 0, done: 0 };
    issues.forEach((it) => {
      const c = statusBucket(it);
      statusCounts[c] = (statusCounts[c] || 0) + 1;
    });
    const byPerson = new Map();
    open.forEach((it) => {
      const name = it.assignee ? it.assignee.displayName : "Unassigned";
      const cur = byPerson.get(name) || { name, count: 0, points: 0 };
      cur.count += 1;
      cur.points += pointsOf(it);
      byPerson.set(name, cur);
    });
    const assignees = Array.from(byPerson.values()).sort((a, b) =>
      usePoints ? b.points - a.points : b.count - a.count
    );
    return {
      openCount: open.length,
      openPoints: open.reduce((s, it) => s + pointsOf(it), 0),
      doneCount: doneRecent.length,
      donePoints: doneRecent.reduce((s, it) => s + pointsOf(it), 0),
      statusCounts,
      assignees,
    };
  };

  const refreshPulse = async () => {
    if (!jiraConfigured || pulseConfig.teams.length === 0) return;
    setPulseLoading(true);
    const usePoints = pulseConfig.progressUnit === "points";
    const fields = ["status", "assignee", ...(usePoints && pulseConfig.pointsFieldId ? [pulseConfig.pointsFieldId] : [])];
    const next = {};
    for (const team of pulseConfig.teams) {
      try {
        let issues;
        let sprint = null;
        if (team.source === "board" && team.boardId) {
          issues = await window.jira.boardIssues(jiraCreds, team.boardId, windowJql(), fields, 400);
          // Scrum board → try active sprint progress.
          if (team.boardType === "scrum") {
            const s = await window.jira.activeSprint(jiraCreds, team.boardId);
            if (s) {
              const sprintIssues = await window.jira.sprintIssues(jiraCreds, team.boardId, s.id, fields);
              const committed = usePoints
                ? sprintIssues.reduce((sum, it) => sum + pointsOf(it), 0)
                : sprintIssues.length;
              const done = usePoints
                ? sprintIssues.filter((it) => statusBucket(it) === "done").reduce((sum, it) => sum + pointsOf(it), 0)
                : sprintIssues.filter((it) => statusBucket(it) === "done").length;
              sprint = { name: s.name, endDate: s.endDate, committed, done };
            }
          }
        } else if (team.source === "jql" && team.jql) {
          issues = await window.jira.teamIssues(jiraCreds, wrapJql(team.jql), fields, 400);
        } else {
          next[team.id] = { error: "Team has no board or JQL configured." };
          continue;
        }
        next[team.id] = { ...aggregateTeam(issues, usePoints), sprint, boardType: team.boardType };
      } catch (e) {
        next[team.id] = { error: String((e && e.message) || e) };
      }
    }
    setPulseData(next);
    setPulseLoading(false);
    setPulseLastRun(Date.now());
  };

  // Load the instance's statuses for the mapping panel (cached for session).
  const loadPulseStatuses = async () => {
    if (!jiraConfigured) return;
    try {
      const statuses = await window.jira.statuses(jiraCreds);
      setPulseStatuses(statuses);
    } catch (e) {
      setPulseStatuses([]);
    }
  };

  // Load the board list for the config picker (cached for the session).
  const loadPulseBoards = async () => {
    if (!jiraConfigured) return;
    try {
      const boards = await window.jira.boards(jiraCreds);
      setPulseBoards(boards);
    } catch (e) {
      setPulseBoards([]);
    }
  };

  // Detect the story-points field id by name.
  // Load the full field list once, so the user can search all of it by name or
  // id — not just a hard-coded "point" subset.
  const loadPulseFields = async () => {
    if (!jiraConfigured) return;
    setPulseFieldHint("loading fields…");
    try {
      const fields = await window.jira.fields(jiraCreds);
      setPulseAllFields(fields);
      // Pre-seed the search with "point" as a convenience, since that's the
      // common case — the user can clear it to search anything.
      setPulsePointSearch((prev) => prev || "point");
      setPulseFieldHint(`${fields.length} fields loaded — search by name or id.`);
    } catch (e) {
      setPulseFieldHint(String((e && e.message) || e));
    }
  };

  // Persist on change (after initial load)
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setSaveState("saving");
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify({ tasks, settings }));
        if (!cancelled) {
          setSaveState("saved");
          setTimeout(() => !cancelled && setSaveState("idle"), 1200);
        }
      } catch (e) {
        if (!cancelled) setSaveState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [tasks, settings, loaded]);

  const teams = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => t.team && set.add(t.team));
    return Array.from(set).sort();
  }, [tasks]);

  const teamColor = useCallback(
    (name) => {
      if (!name) return "var(--ink-faint)";
      const idx = teams.indexOf(name);
      return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
    },
    [teams]
  );

  const addTask = () => {
    const title = draft.trim();
    if (!title) return;
    const now = Date.now();
    const t = {
      id: uid(),
      title,
      bucket: draftBucket,
      team: draftTeam.trim() || null,
      person: null,
      chaseDate: null,
      dueDate: null,
      done: false,
      notes: null,
      createdAt: now,
      bucketChangedAt: now,
    };
    setTasks((prev) => [t, ...prev]);
    setDraft("");
    const detected = detectJira(title);
    if (detected) enrichWithJira(t.id, detected.key, detected.url);
  };

  const update = (id, patch) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const archive = (id) => update(id, { done: true, archivedAt: Date.now() });
  const restore = (id) => update(id, { archivedAt: null, done: false, bucketChangedAt: Date.now() });
  const archiveAllDone = () => {
    const now = Date.now();
    setTasks((prev) => prev.map((t) =>
      t.done && !t.archivedAt ? { ...t, archivedAt: now } : t
    ));
  };

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archivedAt), [tasks]);
  const archivedTasks = useMemo(
    () => tasks.filter((t) => t.archivedAt).sort((a, b) => b.archivedAt - a.archivedAt),
    [tasks]
  );
  const doneNotArchivedCount = activeTasks.filter((t) => t.done).length;
  const filteredVisibleCount = useMemo(
    () => activeTasks.filter(matchesFilters).length,
    [activeTasks, matchesFilters]
  );

  const openPalette = useCallback((preset = "") => {
    setPaletteQuery(preset);
    setPaletteIdx(0);
    setPaletteOpen(true);
  }, []);

  // Briefly highlight a task and scroll it into view — used when the palette
  // jumps to a result so the user's eye can find it.
  const flashTask = useCallback((id) => {
    setFlashTaskId(id);
    // Wait a frame so the row is in the DOM if we just switched views.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-task-id="${id}"]`);
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setTimeout(() => setFlashTaskId(null), 1400);
  }, []);

  // Global shortcuts. Skip most when typing into an input/textarea — except
  // Cmd/Ctrl+K (always available) and Esc (closes things).
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      const inForm =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

      // Cmd/Ctrl+K — open palette from anywhere
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (paletteOpen) setPaletteOpen(false);
        else openPalette("");
        return;
      }

      // Esc — close palette, blur input, or clear filters
      if (e.key === "Escape") {
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (inForm) { t.blur(); return; }
        if (filtersActive) { clearFilters(); return; }
        return;
      }

      if (paletteOpen) return; // palette has its own keydowns

      // The rest only fire when not in a text field
      if (inForm) return;

      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setView("board");
        // Wait a tick if we had to switch view
        setTimeout(() => addInputRef.current?.focus(), 0);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        openPalette("");
        return;
      }
      if (e.key >= "1" && e.key <= "4") {
        const idx = parseInt(e.key, 10) - 1;
        if (BUCKETS[idx]) setDraftBucket(BUCKETS[idx].id);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, filtersActive, openPalette]);

  // Cross-team balance: open (not done, not archived) items per team
  const balance = useMemo(() => {
    const counts = {};
    activeTasks.forEach((t) => {
      if (t.done) return;
      const key = t.team || "— untagged —";
      counts[key] = (counts[key] || 0) + 1;
    });
    const rows = Object.entries(counts).map(([name, n]) => ({ name, n }));
    rows.sort((a, b) => b.n - a.n);
    return rows;
  }, [activeTasks]);
  const maxBalance = Math.max(1, ...balance.map((r) => r.n));

  const today = new Date().toISOString().slice(0, 10);

  // ── Command palette items ────────────────────────────────────────────────
  // Items are a unified list of "things you can do" — built lazily based on
  // the current query. Tasks fuzzy-match against title; actions match against
  // their label and a couple of keywords.
  const paletteItems = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();

    // Actions — verbs the user can run from anywhere
    const actions = [];
    const addAction = (label, hint, run, keywords = "") => {
      actions.push({ kind: "action", label, hint, run, keywords: (keywords + " " + label).toLowerCase() });
    };
    addAction("Go to Board", "·", () => setView("board"), "dashboard home");
    addAction("Go to Archive", "·", () => setView("archive"), "completed done");
    addAction("Go to Review", "·", () => setView("review"), "weekly summary stats shipped");
    addAction("Go to Jira", "·", () => setView("jira"), "import issues sync linked tickets");
    if (settings.teamPulse) {
      addAction("Go to Team Pulse", "·", () => setView("pulse"), "teams load progress sprint involvement");
    }
    addAction("Go to Settings", "·", () => setView("settings"), "config preferences");
    addAction(
      settings.darkMode ? "Switch to light mode" : "Switch to dark mode",
      "·",
      () => setSettings((s) => ({ ...s, darkMode: !s.darkMode })),
      "theme dark light"
    );
    addAction(
      hideDone ? "Show done tasks" : "Hide done tasks",
      "·",
      () => setHideDone((v) => !v),
      "filter completed"
    );
    if (filtersActive) {
      addAction("Clear all filters", "·", clearFilters, "reset");
    }
    if (doneNotArchivedCount > 0) {
      addAction(`Archive done (${doneNotArchivedCount})`, "·", archiveAllDone, "bulk");
    }
    addAction("Focus new-task input", "n", () => {
      setView("board");
      setTimeout(() => addInputRef.current?.focus(), 0);
    }, "add create");
    addAction("Focus search", "/", () => {
      setView("board");
      setTimeout(() => searchInputRef.current?.focus(), 0);
    });
    teams.forEach((s) => {
      addAction(`Filter by team: ${s}`, "·", () => {
        setView("board");
        setTeamFilter((prev) => {
          const next = new Set(prev);
          if (next.has(s)) next.delete(s); else next.add(s);
          return next;
        });
      }, "team");
    });

    // Filter actions to the query
    const matchedActions = q
      ? actions.filter((a) => a.keywords.includes(q))
      : actions;

    // Tasks — match against the raw title (case-insensitive). Include archived
    // too so the palette is a real "find anything" tool.
    const allTaskCandidates = [
      ...activeTasks.map((t) => ({ t, archived: false })),
      ...archivedTasks.map((t) => ({ t, archived: true })),
    ];
    const matchedTasks = (q
      ? allTaskCandidates.filter(({ t }) =>
          ((t.title || "") + "\n" + (t.notes || "")).toLowerCase().includes(q)
        )
      : allTaskCandidates
    ).slice(0, 30); // cap to keep the list scannable

    const items = [];
    if (matchedActions.length) {
      items.push({ kind: "group", label: "Actions" });
      matchedActions.forEach((a) => items.push(a));
    }
    if (matchedTasks.length) {
      items.push({ kind: "group", label: "Tasks" });
      matchedTasks.forEach(({ t, archived }) => {
        const bucketLabel = archived ? "archive" : (BUCKETS.find((b) => b.id === t.bucket)?.label || t.bucket);
        const parts = [bucketLabel];
        if (t.team) parts.push(t.team);
        if (t.dueDate) parts.push(`due ${t.dueDate}`);
        items.push({
          kind: "task",
          task: t,
          archived,
          label: t.title,
          hint: parts.join(" · "),
          run: () => {
            if (archived) {
              setView("archive");
            } else {
              setView("board");
              // Make sure filters don't hide the task we just jumped to.
              if (!matchesFilters(t)) clearFilters();
            }
            setTimeout(() => flashTask(t.id), 30);
          },
        });
      });
    }
    return items;
  }, [
    paletteQuery, activeTasks, archivedTasks, teams, settings.darkMode, settings.teamPulse,
    hideDone, filtersActive, doneNotArchivedCount, matchesFilters, flashTask,
  ]);

  // When a search hits a task only via its notes, auto-expand the notes block
  // so the user can see why it matched. Compute the set once per render.
  const notesAutoExpanded = useMemo(() => {
    if (!trimmedSearch) return new Set();
    const s = new Set();
    activeTasks.forEach((t) => {
      const titleHit = (t.title || "").toLowerCase().includes(trimmedSearch);
      const notesHit = (t.notes || "").toLowerCase().includes(trimmedSearch);
      if (notesHit && !titleHit) s.add(t.id);
    });
    return s;
  }, [activeTasks, trimmedSearch]);

  // Indices of *selectable* items (excluding group headers)
  const selectableIdxs = useMemo(
    () => paletteItems.map((it, i) => (it.kind === "group" ? -1 : i)).filter((i) => i >= 0),
    [paletteItems]
  );
  // Clamp the selection whenever the list shape changes
  useEffect(() => {
    if (paletteIdx >= selectableIdxs.length) setPaletteIdx(Math.max(0, selectableIdxs.length - 1));
  }, [selectableIdxs, paletteIdx]);

  const runPaletteItem = (idx) => {
    const realIdx = selectableIdxs[idx];
    const item = paletteItems[realIdx];
    if (!item) return;
    setPaletteOpen(false);
    item.run();
  };

  const exportData = () => {
    try {
      const payload = { version: 1, exportedAt: new Date().toISOString(), tasks, settings };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foreground-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setIoStatus({ kind: "ok", msg: `Exported ${tasks.length} task${tasks.length === 1 ? "" : "s"}.` });
    } catch (e) {
      setIoStatus({ kind: "err", msg: "Export failed." });
    }
  };

  const importData = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.tasks)) {
          throw new Error("Missing tasks array.");
        }
        const ok = window.confirm(
          `Replace your current board with ${parsed.tasks.length} task${parsed.tasks.length === 1 ? "" : "s"} from this file? This can't be undone.`
        );
        if (!ok) {
          setIoStatus(null);
          return;
        }
        setTasks(parsed.tasks);
        if (parsed.settings && typeof parsed.settings === "object") {
          setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
        }
        setIoStatus({ kind: "ok", msg: `Imported ${parsed.tasks.length} task${parsed.tasks.length === 1 ? "" : "s"}.` });
      } catch (e) {
        setIoStatus({ kind: "err", msg: "Invalid file — expected Foreground JSON export." });
      }
    };
    reader.onerror = () => setIoStatus({ kind: "err", msg: "Couldn't read file." });
    reader.readAsText(file);
  };

  const palette = paletteOpen && (
    <div className="sf-palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPaletteOpen(false); }}>
      <div className="sf-palette">
        <input
          ref={paletteInputRef}
          autoFocus
          className="sf-palette-input"
          type="text"
          placeholder="Find tasks, run actions… (try a team name, a Jira key, or just type)"
          value={paletteQuery}
          onChange={(e) => { setPaletteQuery(e.target.value); setPaletteIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setPaletteOpen(false); return; }
            if (e.key === "ArrowDown") { e.preventDefault(); setPaletteIdx((i) => Math.min(i + 1, selectableIdxs.length - 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setPaletteIdx((i) => Math.max(i - 1, 0)); return; }
            if (e.key === "Enter") { e.preventDefault(); runPaletteItem(paletteIdx); return; }
          }}
        />
        <div className="sf-palette-list">
          {paletteItems.length === 0 && <div className="sf-palette-empty">No matches.</div>}
          {paletteItems.map((it, i) => {
            if (it.kind === "group") {
              return <div className="sf-palette-group" key={`g-${i}`}>{it.label}</div>;
            }
            const selectableIndex = selectableIdxs.indexOf(i);
            const selected = selectableIndex === paletteIdx;
            const icon = it.kind === "action" ? "▸" : "·";
            return (
              <div
                key={`i-${i}`}
                className={"sf-palette-item" + (selected ? " selected" : "")}
                onMouseEnter={() => setPaletteIdx(selectableIndex)}
                onMouseDown={(e) => { e.preventDefault(); runPaletteItem(selectableIndex); }}
              >
                <span className="sf-pal-icon">{icon}</span>
                <div className="sf-pal-body">
                  <div className="sf-pal-label">{it.label}</div>
                  {it.hint && it.hint !== "·" && <div className="sf-pal-hint">{it.hint}</div>}
                </div>
                {it.kind === "action" && it.hint && it.hint !== "·" && (
                  <span className="sf-pal-meta">{it.hint}</span>
                )}
                {it.kind === "task" && <span className="sf-pal-meta">{it.hint}</span>}
              </div>
            );
          })}
        </div>
        <div className="sf-palette-foot">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
          <span style={{ marginLeft: "auto" }}>
            shortcuts: <kbd>n</kbd> add · <kbd>/</kbd> search · <kbd>1-4</kbd> bucket · <kbd>?</kbd> palette
          </span>
        </div>
      </div>
    </div>
  );

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

  if (view === "review") {
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

  if (view === "archive") {
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

  if (view === "pulse") {
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
                          Story-points field — instances often have several (e.g. “Story Points”
                          vs “Story point estimate”). Load fields, then search by name or id and pick yours.
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

  if (view === "jira") {
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

  if (view === "settings") {
    return (
      <div className={"sf-root" + (settings.darkMode ? "" : " light")}>
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
                    Warm dark by default. Switch to light if you'd rather work on a cream
                    background.
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
                    {jiraConfigured && <span style={{ color: "#7c9a6d", fontSize: 11, marginLeft: 6 }}>● connected</span>}
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

