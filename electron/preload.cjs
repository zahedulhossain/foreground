// Recreates the same `window.storage` API the renderer component expects,
// but backed by the Electron main process (a JSON file on disk) instead of
// the Claude artifact host. Same method shapes => the UI needs no changes.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("storage", {
  get: (key) => ipcRenderer.invoke("storage:get", key),
  set: (key, value) => ipcRenderer.invoke("storage:set", key, value),
  delete: (key) => ipcRenderer.invoke("storage:delete", key),
  list: (prefix) => ipcRenderer.invoke("storage:list", prefix),
});
