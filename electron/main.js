import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

// ── Persistent store ─────────────────────────────────────────────────────────
// All data lives in a single JSON file in the OS app-data folder, e.g.
//   macOS:   ~/Library/Application Support/SquadFlow/squadflow-data.json
//   Windows: %APPDATA%/SquadFlow/squadflow-data.json
//   Linux:   ~/.config/SquadFlow/squadflow-data.json
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
    title: "SquadFlow",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  storePath = path.join(app.getPath("userData"), "squadflow-data.json");
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
