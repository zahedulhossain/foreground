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
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
