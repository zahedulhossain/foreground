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

export const DEFAULT_SETTINGS = { todayCap: 3, showBalance: true, darkMode: true, teamPulse: false };

// Team Pulse config: tracked teams + how to read progress.
//   team = { id, name, source: "board" | "jql", boardId?, boardType?, jql? }
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
};

// Default JQL for the Jira import picker.
export const DEFAULT_JQL = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";

// Chip colors, cycled per team.
export const PALETTE = ["#c8853b", "#7c9a6d", "#9a6d8e", "#5d8a9a", "#b5654d", "#8a7c5d"];
