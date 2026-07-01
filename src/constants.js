// App-wide constants and default config shapes.

export const BUCKETS = [
  { id: "today", label: "Today", hint: "Must move today", capped: true },
  { id: "week", label: "This Week", hint: "Committed, scheduled, not today" },
  { id: "waiting", label: "Waiting On", hint: "Handed off · chase before it blocks you" },
  { id: "someday", label: "Someday", hint: "Out of your head, off your plate" },
];

export const STORAGE_KEY = "foreground:state:v1";
export const JIRA_KEY = "foreground:jira:v1";
export const PULSE_KEY = "foreground:pulse:v1";
// Cached last-fetched Pulse data (separate from config so frequent config
// writes don't rewrite the larger data blob). Persists across restarts.
export const PULSEDATA_KEY = "foreground:pulsedata:v1";

export const DEFAULT_SETTINGS = { todayCap: 3, showBalance: true, darkMode: true, teamPulse: false, theme: "a" };

// Selectable color themes. Each id maps to a `.sf-root.theme-{id}` CSS block in
// styles.js (with a `.light` variant) and a team-chip palette below.
export const THEMES = [
  { id: "a", name: "Refined Sepia", desc: "Warm and familiar — cream on deep brown with an amber accent.", swatch: ["#262019", "#e3a44b", "#8aab6f"] },
  { id: "b", name: "Cool Slate", desc: "Modern and crisp — neutral blue-grey surfaces with a clear blue accent.", swatch: ["#1c2029", "#5b9ee0", "#56b793"] },
  { id: "c", name: "Charcoal + Teal", desc: "Calm and high-contrast — neutral charcoal with one bold teal accent.", swatch: ["#1f1f21", "#3fb8a6", "#7fb069"] },
];

// Team Pulse config: tracked teams + how to read progress.
//   team = { id, name, source: "board" | "jql", boardId?, boardType?, jql?,
//            progressUnit? } — progressUnit "" (or absent) follows the global
//   default; "count" | "points" overrides it for this team.
// statusMap remaps a Jira status NAME → bucket ("new" | "indeterminate" | "done").
// Anything not listed falls back to the status's own Jira category.
export const DEFAULT_PULSE = {
  teams: [],
  // Done window: "rolling" = last N days (auto-advances); "range" = fixed from–to.
  doneWindowMode: "rolling",
  doneWindowDays: 14,
  doneWindowFrom: "",
  doneWindowTo: "",
  progressUnit: "count",
  pointsFieldId: null,
  statusMap: {},
  // KPI targets (point-in-time). Disabled by default; comparator/direction is
  // fixed per KPI. throughput/sprintCompletion are team-level (≥ target);
  // wip/loadBalance are per-person rules (≤ target), loadBalance in percent.
  kpiTargets: {
    throughput: { enabled: false, value: 10 },
    wip: { enabled: false, value: 5 },
    sprintCompletion: { enabled: false, value: 80 },
    loadBalance: { enabled: false, value: 40 },
  },
};

// Default JQL for the Jira import picker.
export const DEFAULT_JQL = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";

// Chip colors, cycled per team — one palette per theme, harmonized with the
// theme accent. PALETTE stays exported (default theme) for backward compat.
export const TEAM_PALETTES = {
  a: ["#d98f3d", "#7f9d6c", "#a06d92", "#5d8a9a", "#b5654d", "#8a7c5d"],
  b: ["#5b9ee0", "#56b793", "#b079d6", "#e0a050", "#e07060", "#7d8694"],
  c: ["#3fb8a6", "#e0a050", "#c07ad6", "#5b9ee0", "#e07a5f", "#8a8f9a"],
};
export const PALETTE = TEAM_PALETTES.a;
