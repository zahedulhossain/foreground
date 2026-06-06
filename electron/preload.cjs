// Bridges renderer → main IPC for storage and Jira proxy calls. Storage is a
// thin wrapper over a JSON file on disk in the user's app-data folder; Jira
// calls live in main so we sidestep CORS and keep the cred handling outside
// the renderer process.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("storage", {
  get: (key) => ipcRenderer.invoke("storage:get", key),
  set: (key, value) => ipcRenderer.invoke("storage:set", key, value),
  delete: (key) => ipcRenderer.invoke("storage:delete", key),
  list: (prefix) => ipcRenderer.invoke("storage:list", prefix),
});

contextBridge.exposeInMainWorld("jira", {
  fetch: (creds, key) => ipcRenderer.invoke("jira:fetch", creds, key),
  test: (creds) => ipcRenderer.invoke("jira:test", creds),
});
