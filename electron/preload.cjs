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
  search: (creds, jql, maxResults) => ipcRenderer.invoke("jira:search", creds, jql, maxResults),
  fields: (creds) => ipcRenderer.invoke("jira:fields", creds),
  statuses: (creds) => ipcRenderer.invoke("jira:statuses", creds),
  boards: (creds) => ipcRenderer.invoke("jira:boards", creds),
  activeSprint: (creds, boardId) => ipcRenderer.invoke("jira:activeSprint", creds, boardId),
  boardIssues: (creds, boardId, jql, fields, cap) => ipcRenderer.invoke("jira:boardIssues", creds, boardId, jql, fields, cap),
  sprintIssues: (creds, boardId, sprintId, fields) => ipcRenderer.invoke("jira:sprintIssues", creds, boardId, sprintId, fields),
  teamIssues: (creds, jql, fields, cap) => ipcRenderer.invoke("jira:teamIssues", creds, jql, fields, cap),
});
