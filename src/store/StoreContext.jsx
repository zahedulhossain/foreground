import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import {
  BUCKETS, STORAGE_KEY, JIRA_KEY, PULSE_KEY,
  DEFAULT_SETTINGS, DEFAULT_PULSE, DEFAULT_JQL, PALETTE,
} from "../constants.js";
import { uid } from "../lib/ids.js";
import { renderTitle } from "../lib/markdown.js";
import { autoSize } from "../lib/dom.js";
import { detectJira } from "../lib/jiraText.js";
import {
  doneClause as doneClausePure,
  windowJql as windowJqlPure,
  wrapJql as wrapJqlPure,
  windowLabel as windowLabelPure,
  pointsOf as pointsOfPure,
  statusBucket as statusBucketPure,
  aggregateTeam as aggregateTeamPure,
} from "../features/pulse/aggregate.js";

const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

// All app state, persistence, and actions. App is just the provider + shell.
export function StoreProvider({ children }) {
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
  // Pure logic lives in features/pulse/aggregate.js; these are thin adapters
  // that bind it to the current pulseConfig so call sites stay unchanged.
  const doneClause = () => doneClausePure(pulseConfig);
  const windowJql = () => windowJqlPure(pulseConfig);
  const wrapJql = (raw) => wrapJqlPure(raw, pulseConfig);
  const windowLabel = () => windowLabelPure(pulseConfig);
  const pointsOf = (issue) => pointsOfPure(issue, pulseConfig.pointsFieldId);
  const statusBucket = (issue) => statusBucketPure(issue, pulseConfig.statusMap);
  const aggregateTeam = (issues, usePoints) =>
    aggregateTeamPure(issues, {
      usePoints,
      pointsFieldId: pulseConfig.pointsFieldId,
      statusMap: pulseConfig.statusMap,
    });

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


  const value = {
    activeTasks, addInputRef, addTask, aggregateTeam, archive, archiveAllDone, 
    archivedTasks, balance, bulkRefreshLinked, cancelEdit, cancelNotesEdit, cancelTeamEdit, 
    clearFilters, commitEdit, commitNotesEdit, commitTeamEdit, doneClause, doneNotArchivedCount, 
    draft, draftBucket, draftTeam, dragId, dropBeforeId, dropBucket, 
    editDraft, editNotesDraft, editTeamDraft, editingId, editingNotesId, editingTeamId, 
    enrichWithJira, expandedNotes, exportData, fileInputRef, filteredVisibleCount, filtersActive, 
    flashTask, flashTaskId, hideDone, importData, importSelectedIssues, ioStatus, 
    jiraBulkStatus, jiraConfigured, jiraCreds, jiraImportBucket, jiraImportSel, jiraImportTeam, 
    jiraLoadingId, jiraQuery, jiraResults, jiraSearchError, jiraSearchState, jiraTestStatus, 
    loadPulseBoards, loadPulseFields, loadPulseStatuses, loaded, matchesFilters, maxBalance, 
    moveTask, notesAutoExpanded, openMenu, openPalette, palette, paletteIdx, 
    paletteInputRef, paletteItems, paletteOpen, paletteQuery, persistJiraCreds, persistPulseConfig, 
    pointsOf, pulseAllFields, pulseBoards, pulseConfig, pulseData, pulseDraft, 
    pulseDragId, pulseDropBeforeId, pulseFieldHint, pulseLastRun, pulseLoading, pulsePointSearch, 
    pulseStatusOpen, pulseStatuses, refreshPulse, remove, restore, runJiraSearch, 
    runPaletteItem, saveState, searchInputRef, searchTerm, selectableIdxs, setDraft, 
    setDraftBucket, setDraftTeam, setDragId, setDropBeforeId, setDropBucket, setEditDraft, 
    setEditNotesDraft, setEditTeamDraft, setEditingId, setEditingNotesId, setEditingTeamId, setExpandedNotes, 
    setFlashTaskId, setHideDone, setIoStatus, setJiraBulkStatus, setJiraCreds, setJiraImportBucket, 
    setJiraImportSel, setJiraImportTeam, setJiraLoadingId, setJiraQuery, setJiraResults, setJiraSearchError, 
    setJiraSearchState, setJiraTestStatus, setLoaded, setOpenMenu, setPaletteIdx, setPaletteOpen, 
    setPaletteQuery, setPulseAllFields, setPulseBoards, setPulseConfig, setPulseData, setPulseDraft, 
    setPulseDragId, setPulseDropBeforeId, setPulseFieldHint, setPulseLastRun, setPulseLoading, setPulsePointSearch, 
    setPulseStatusOpen, setPulseStatuses, setSaveState, setSearchTerm, setSettings, setTasks, 
    setTeamFilter, setView, settings, startEdit, startNotesEdit, startTeamEdit, 
    statusBucket, tasks, teamColor, teamFilter, teams, today, 
    toggleNotesExpanded, toggleTeamFilter, trimmedSearch, update, view, windowJql, 
    windowLabel, wrapJql
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
