import { app, BrowserWindow, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

// Pin the app name explicitly. Without this, Electron uses package.json's
// `name` field in dev mode (lowercased, "foreground") but the packaged build
// uses electron-builder's `productName` ("Foreground") — landing data in
// *two different folders* depending on how you launched the app. Setting it
// early makes both paths the same: ~/Library/Application Support/Foreground/
app.setName("Foreground");

// ── Persistent store ─────────────────────────────────────────────────────────
// All data lives in a single JSON file in the OS app-data folder, e.g.
//   macOS:   ~/Library/Application Support/Foreground/foreground-data.json
//   Windows: %APPDATA%/Foreground/foreground-data.json
//   Linux:   ~/.config/Foreground/foreground-data.json
// It survives restarts and is easy to back up or sync.
let storePath;
let cache = null;
let writeChain = Promise.resolve();

async function loadStore() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(storePath, "utf-8");
    cache = JSON.parse(raw);
  } catch {
    cache = {}; // no file yet
  }
  return cache;
}

// Serialize writes so concurrent set/delete calls can't corrupt the file.
function persist() {
  writeChain = writeChain.then(() =>
    fs.writeFile(storePath, JSON.stringify(cache, null, 2), "utf-8")
  );
  return writeChain;
}

// ── Jira proxy ───────────────────────────────────────────────────────────────
// Calls live in main rather than the renderer so we (a) sidestep CORS on the
// Atlassian Cloud REST endpoint and (b) keep the URL construction here, never
// letting the renderer ask main to hit an arbitrary host. Creds are still
// passed in per-call from the renderer's settings store — they live in the
// same on-disk JSON either way, so isolating further would be ceremony.

function normalizeBaseUrl(raw) {
  if (typeof raw !== "string") return null;
  let url = raw.trim().replace(/\/+$/, "");
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

function authHeader(email, token) {
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

// Cache cloudId lookups per (token, baseUrl). Atlassian's accessible-resources
// endpoint is rate-limited and the answer doesn't change for a given token.
const cloudIdCache = new Map();

async function lookupCloudId(token, base) {
  const key = `${token}::${base}`;
  if (cloudIdCache.has(key)) return cloudIdCache.get(key);
  const res = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Atlassian ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }
  const resources = await res.json();
  if (!Array.isArray(resources) || resources.length === 0) {
    throw new Error("Token has no accessible Atlassian sites. Check the token's scopes.");
  }
  const match = resources.find((r) => normalizeBaseUrl(r.url) === base);
  if (!match) {
    const list = resources.map((r) => r.url).join(", ");
    throw new Error(`Token doesn't grant access to ${base}. Accessible: ${list}`);
  }
  cloudIdCache.set(key, match);
  return match;
}

async function jiraRequest(creds, pathAndQuery) {
  const base = normalizeBaseUrl(creds && creds.baseUrl);
  if (!base) throw new Error("Missing or invalid Jira base URL.");
  // Trim — copy-paste from Atlassian's token modal often picks up trailing
  // whitespace, which Basic auth then encodes into a silently-broken header.
  const email = (creds.email || "").trim();
  const token = (creds.token || "").trim();
  if (!token) throw new Error("Missing Jira API token.");

  // Classic API token (ATATT…): Basic auth against the tenant URL.
  if (email) {
    const res = await fetch(base + pathAndQuery, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${email}:${token}`).toString("base64"),
        Accept: "application/json",
      },
    });
    if (res.ok) return res.json();
    const text = await res.text().catch(() => "");
    throw new Error(`Jira ${res.status} (Basic): ${text.slice(0, 200) || res.statusText}`);
  }

  // No email → scoped API token or OAuth 2.0 access token.
  // These MUST go through api.atlassian.com/ex/jira/{cloudId}/... — the
  // tenant URL rejects them as malformed Connect session JWTs.
  //
  // Two ways to get the cloudId:
  //   1. accessible-resources endpoint (the documented path) — but this
  //      requires the token grant to include site discovery, which scoped
  //      personal API tokens often DON'T have, returning a bare 401.
  //   2. Manually entered by the user (from /_edge/tenant_info on their site).
  // If they've provided cloudId, trust it and skip the lookup entirely.
  const manualCloudId = (creds.cloudId || "").trim();
  const cloudId = manualCloudId || (await lookupCloudId(token, base)).id;
  const res = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}${pathAndQuery}`,
    { headers: { Authorization: "Bearer " + token, Accept: "application/json" } }
  );
  if (res.ok) return res.json();
  const text = await res.text().catch(() => "");
  if (res.status === 404) {
    // 404 here can mean: (a) cloudId belongs to a different site than baseUrl,
    // (b) the scoped token isn't authorized for the project containing this
    // issue, or (c) the issue genuinely doesn't exist. The Jira body alone
    // doesn't distinguish — surface a hint.
    throw new Error(
      `Jira 404 (Bearer): not found via cloudId ${cloudId.slice(0, 8)}…. ` +
      `Either the cloudId points to a different Atlassian site than ${base}, ` +
      `or your scoped token isn't authorized for this issue's project. ` +
      `Original: ${text.slice(0, 200)}`
    );
  }
  throw new Error(`Jira ${res.status} (Bearer): ${text.slice(0, 200) || res.statusText}`);
}

function registerJiraHandlers() {
  ipcMain.handle("jira:fetch", async (_e, creds, key) => {
    if (!/^[A-Z][A-Z0-9]+-\d+$/.test(String(key || ""))) {
      throw new Error("Invalid issue key.");
    }
    const data = await jiraRequest(
      creds,
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status`
    );
    const status = data.fields && data.fields.status;
    return {
      key: data.key,
      summary: data.fields && data.fields.summary,
      status: status && status.name,
      statusCategory: status && status.statusCategory && status.statusCategory.key, // "new" | "indeterminate" | "done"
      url: `${normalizeBaseUrl(creds.baseUrl)}/browse/${data.key}`,
    };
  });

  ipcMain.handle("jira:search", async (_e, creds, jql, maxResults) => {
    // Uses the current /search/jql endpoint (the legacy /search was deprecated
    // by Atlassian). Read-only. We only ask for the two fields the UI shows.
    const q = String(jql || "").trim();
    if (!q) throw new Error("Empty JQL query.");
    const cap = Math.min(Math.max(parseInt(maxResults, 10) || 50, 1), 100);
    const data = await jiraRequest(
      creds,
      `/rest/api/3/search/jql?jql=${encodeURIComponent(q)}&fields=summary,status&maxResults=${cap}`
    );
    const base = normalizeBaseUrl(creds.baseUrl);
    const issues = Array.isArray(data.issues) ? data.issues : [];
    return issues.map((it) => {
      const status = it.fields && it.fields.status;
      return {
        key: it.key,
        summary: it.fields && it.fields.summary,
        status: status && status.name,
        statusCategory: status && status.statusCategory && status.statusCategory.key,
        url: `${base}/browse/${it.key}`,
      };
    });
  });

  // ── Team Pulse data access ─────────────────────────────────────────────
  // All read-only. Aggregation happens in the renderer; these just fetch.

  // Map a raw Jira issue to the slim shape the Pulse UI needs. `fields` is the
  // raw fields object so the renderer can read a custom story-points field by
  // id without us hard-coding which one it is.
  const slimIssue = (it) => {
    const f = it.fields || {};
    const status = f.status || {};
    const assignee = f.assignee || null;
    return {
      key: it.key,
      status: status.name || null,
      statusCategory: (status.statusCategory && status.statusCategory.key) || null,
      assignee: assignee
        ? { accountId: assignee.accountId, displayName: assignee.displayName }
        : null,
      fields: f,
    };
  };

  const DEFAULT_FIELDS = ["status", "assignee"];

  // List of fields available in the instance — used to detect the story-points
  // custom field (its id varies per site).
  ipcMain.handle("jira:fields", async (_e, creds) => {
    const data = await jiraRequest(creds, "/rest/api/3/field");
    return (Array.isArray(data) ? data : []).map((f) => ({ id: f.id, name: f.name }));
  });

  // All statuses defined in the instance, with their default category. Used
  // to let the user remap status names into the three Pulse buckets.
  ipcMain.handle("jira:statuses", async (_e, creds) => {
    const data = await jiraRequest(creds, "/rest/api/3/status");
    const seen = new Set();
    const out = [];
    (Array.isArray(data) ? data : []).forEach((s) => {
      if (!s || !s.name || seen.has(s.name)) return;
      seen.add(s.name);
      out.push({
        name: s.name,
        category: (s.statusCategory && s.statusCategory.key) || "new",
      });
    });
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  });

  // All boards the token can see, with their type (scrum | kanban | simple).
  ipcMain.handle("jira:boards", async (_e, creds) => {
    const out = [];
    let startAt = 0;
    for (let i = 0; i < 20; i++) {
      const data = await jiraRequest(creds, `/rest/agile/1.0/board?startAt=${startAt}&maxResults=50`);
      const vals = Array.isArray(data.values) ? data.values : [];
      vals.forEach((b) => out.push({ id: b.id, name: b.name, type: b.type }));
      if (data.isLast || vals.length === 0) break;
      startAt += vals.length;
    }
    return out;
  });

  // Active sprint for a board, or null. Kanban boards (and tokens without the
  // jira-software scopes) throw here — we swallow it and return null so the
  // page degrades to status-flow rather than failing.
  ipcMain.handle("jira:activeSprint", async (_e, creds, boardId) => {
    try {
      const data = await jiraRequest(
        creds,
        `/rest/agile/1.0/board/${encodeURIComponent(boardId)}/sprint?state=active`
      );
      const vals = Array.isArray(data.values) ? data.values : [];
      if (vals.length === 0) return null;
      const s = vals[0];
      return { id: s.id, name: s.name, startDate: s.startDate, endDate: s.endDate, goal: s.goal };
    } catch {
      return null;
    }
  });

  // Issues in a board (optionally narrowed by an extra JQL clause). Used for
  // board-defined teams — the board's own filter scopes the rest.
  ipcMain.handle("jira:boardIssues", async (_e, creds, boardId, jql, fields, cap) => {
    const fieldList = Array.isArray(fields) && fields.length ? fields : DEFAULT_FIELDS;
    const fieldsParam = encodeURIComponent(fieldList.join(","));
    const jqlParam = jql ? `&jql=${encodeURIComponent(jql)}` : "";
    const limit = Math.min(cap || 300, 500);
    const out = [];
    let startAt = 0;
    for (let i = 0; i < 10 && out.length < limit; i++) {
      const data = await jiraRequest(
        creds,
        `/rest/agile/1.0/board/${encodeURIComponent(boardId)}/issue?startAt=${startAt}&maxResults=100&fields=${fieldsParam}${jqlParam}`
      );
      const issues = Array.isArray(data.issues) ? data.issues : [];
      out.push(...issues);
      if (issues.length === 0 || startAt + issues.length >= (data.total || 0)) break;
      startAt += issues.length;
    }
    return out.slice(0, limit).map(slimIssue);
  });

  // Issues in a sprint — for Scrum sprint-progress.
  ipcMain.handle("jira:sprintIssues", async (_e, creds, boardId, sprintId, fields) => {
    const fieldList = Array.isArray(fields) && fields.length ? fields : DEFAULT_FIELDS;
    const fieldsParam = encodeURIComponent(fieldList.join(","));
    const out = [];
    let startAt = 0;
    for (let i = 0; i < 10 && out.length < 500; i++) {
      const data = await jiraRequest(
        creds,
        `/rest/agile/1.0/board/${encodeURIComponent(boardId)}/sprint/${encodeURIComponent(sprintId)}/issue?startAt=${startAt}&maxResults=100&fields=${fieldsParam}`
      );
      const issues = Array.isArray(data.issues) ? data.issues : [];
      out.push(...issues);
      if (issues.length === 0 || startAt + issues.length >= (data.total || 0)) break;
      startAt += issues.length;
    }
    return out.map(slimIssue);
  });

  // Issues matching an arbitrary JQL — for JQL-defined teams. Paginates via
  // the /search/jql nextPageToken.
  ipcMain.handle("jira:teamIssues", async (_e, creds, jql, fields, cap) => {
    const q = String(jql || "").trim();
    if (!q) throw new Error("Empty JQL query.");
    const fieldList = Array.isArray(fields) && fields.length ? fields : DEFAULT_FIELDS;
    const fieldsParam = encodeURIComponent(fieldList.join(","));
    const limit = Math.min(cap || 300, 500);
    const out = [];
    let token = null;
    for (let i = 0; i < 10 && out.length < limit; i++) {
      const tok = token ? `&nextPageToken=${encodeURIComponent(token)}` : "";
      const data = await jiraRequest(
        creds,
        `/rest/api/3/search/jql?jql=${encodeURIComponent(q)}&fields=${fieldsParam}&maxResults=100${tok}`
      );
      const issues = Array.isArray(data.issues) ? data.issues : [];
      out.push(...issues);
      token = data.nextPageToken;
      if (data.isLast || !token || issues.length === 0) break;
    }
    return out.slice(0, limit).map(slimIssue);
  });

  ipcMain.handle("jira:test", async (_e, creds) => {
    const base = normalizeBaseUrl(creds && creds.baseUrl);
    if (!base) throw new Error("Missing or invalid Jira base URL.");
    const email = (creds.email || "").trim();
    const token = (creds.token || "").trim();
    if (!token) throw new Error("Missing API token.");

    if (email) {
      // Classic token path — /myself proves Basic creds work and the user
      // has at least a Jira identity.
      const me = await jiraRequest(creds, "/rest/api/3/myself");
      return { ok: true, displayName: me.displayName, email: me.emailAddress, scheme: "Basic" };
    }
    const manualCloudId = (creds.cloudId || "").trim();
    if (manualCloudId) {
      // Manual cloudId path: probe a real Jira endpoint to confirm the token
      // can actually read issues. issue/picker is the lightest read that
      // works with read:issue:jira / read:jira-work, so it matches the
      // scopes we actually need for enrichment.
      const res = await fetch(
        `https://api.atlassian.com/ex/jira/${manualCloudId}/rest/api/3/issue/picker?query=`,
        { headers: { Authorization: "Bearer " + token, Accept: "application/json" } }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Jira ${res.status} (manual cloudId): ${text.slice(0, 200) || res.statusText}`);
      }
      return { ok: true, displayName: `Site ${manualCloudId.slice(0, 8)}…`, cloudId: manualCloudId, scheme: "Bearer (manual cloudId)" };
    }
    // Auto-discover path — works for OAuth 3LO and some scoped tokens; many
    // user-level scoped API tokens return 401 here even when they're valid
    // for issue reads. If this fails, the user should provide cloudId manually.
    const resource = await lookupCloudId(token, base);
    return { ok: true, displayName: resource.name || resource.url, cloudId: resource.id, scheme: "Bearer" };
  });
}

function registerStorageHandlers() {
  ipcMain.handle("storage:get", async (_e, key) => {
    const store = await loadStore();
    if (!(key in store)) return null;
    return { key, value: store[key], shared: false };
  });

  ipcMain.handle("storage:set", async (_e, key, value) => {
    const store = await loadStore();
    store[key] = value;
    await persist();
    return { key, value, shared: false };
  });

  ipcMain.handle("storage:delete", async (_e, key) => {
    const store = await loadStore();
    const existed = key in store;
    delete store[key];
    await persist();
    return { key, deleted: existed, shared: false };
  });

  ipcMain.handle("storage:list", async (_e, prefix) => {
    const store = await loadStore();
    let keys = Object.keys(store);
    if (prefix) keys = keys.filter((k) => k.startsWith(prefix));
    return { keys, prefix: prefix || null, shared: false };
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 640,
    minHeight: 520,
    backgroundColor: "#1c1a17",
    title: "Foreground",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links (target=_blank / window.open) in the OS browser
  // rather than spawning an in-app BrowserWindow.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // Guard against same-window navigation away from the app (e.g. a link with
  // no target): keep the app put, send the URL to the browser instead.
  win.webContents.on("will-navigate", (e, url) => {
    const devUrl = "http://localhost:5173";
    if (isDev && url.startsWith(devUrl)) return; // allow HMR/in-app nav in dev
    if (!isDev && url.startsWith("file://")) return; // allow in-app nav in prod
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  storePath = path.join(app.getPath("userData"), "foreground-data.json");
  registerStorageHandlers();
  registerJiraHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
