# Foreground

A focused task instrument for people running work across multiple teams.

Four buckets — **Today**, **This Week**, **Waiting On**, **Someday** — with team tagging, a "waiting on" view with who and chase-by date, a cross-team attention balance, due dates on the Week bucket, an archive, and a weekly review that tells you what shipped, what's drifting, and what's about to block you.

Local-only by design. One JSON file, no account, no sync, no telemetry.

## Highlights

- **Four buckets, one ceiling.** Today defaults to a max of 3 — a ceiling, not a target. The cap is configurable.
- **Team tagging with color-coded chips** and a cross-team attention balance so one team can't quietly eat all your time.
- **Waiting On** items track *who* you're waiting on and a chase-by date. Past the date? It goes red.
- **Due dates on the Week bucket.** Overdue Week items show up in the Review view's "About to block you" section.
- **Drag-and-drop** to reorder within a bucket and move between buckets.
- **Inline markdown in titles and notes** — bold, italic, `code`, links, line breaks. Search highlights matches.
- **Command palette (`Cmd/Ctrl+K`)** — find any task across the board or archive, or run an action.
- **Keyboard shortcuts** — `n` to focus the add bar, `/` to focus search, `1–4` to set the draft bucket, `?` to open the palette.
- **Archive** with restore + permanent delete, grouped by archive date.
- **Weekly review** — shipped in the last 7 days, longest-sitting open work, overdue items.
- **Light / dark theme**, configurable.
- **Optional Jira enrichment.** Paste a Jira link or key like `PROJ-123` into a task and Foreground pulls the summary + status. Works with classic and scoped Atlassian API tokens (the latter via manual cloudId).
- **JSON import / export** for backups or migrating between machines.

## Prerequisites

- **Node.js 18+** (`node -v`)
- That's it. No global installs, no extra build tooling.

## Run it in development

```bash
npm install
npm run dev
```

This launches Vite on port 5173 and an Electron window pointed at it with hot reload. Edits to `src/App.jsx` reload live; edits to `electron/main.js` or `electron/preload.cjs` require restarting `npm run dev` (the renderer doesn't reload main-process code).

## Build a native installer

```bash
npm run dist
```

`electron-builder` produces an installer for your current OS in `release/`:

- **macOS** → `.dmg`
- **Windows** → `.exe` (NSIS)
- **Linux** → `.AppImage`

Cross-OS builds generally need to run on the target OS or a CI runner for it. Code-signing is not configured.

## Where your data lives

One JSON file in the OS app-data folder. The app name is pinned via `app.setName("Foreground")` so dev and packaged builds use the same folder:

- **macOS:** `~/Library/Application Support/Foreground/foreground-data.json`
- **Windows:** `%APPDATA%/Foreground/foreground-data.json`
- **Linux:** `~/.config/Foreground/foreground-data.json`

Survives restarts and updates. Drop it in a Dropbox / iCloud / Syncthing folder if you want it synced across machines (symlink the data file).

## Jira integration

Foreground supports two Atlassian token types. Pick whichever your org allows.

| Token type | Email field | Cloud ID field | Notes |
|---|---|---|---|
| Classic API token | ✅ required | — | Simplest. Basic auth against your tenant URL. The token inherits your Jira permissions — you need Browse Projects on the relevant projects. |
| Scoped API token | — leave blank | ✅ required | Routes through `api.atlassian.com/ex/jira/{cloudId}`. Required scopes: `read:jira-work` (or the narrower `read:issue:jira` + `read:issue-meta:jira`). Get your cloudId from `https://<your-tenant>.atlassian.net/_edge/tenant_info`. |

If your org uses corporate SSO for Atlassian, scoped tokens may be rejected by the org's authorization layer even with the right scopes — classic tokens often work where scoped tokens don't. See the in-app Settings screen for the full breakdown.

Foreground only ever reads. The single endpoint it calls is `GET /rest/api/3/issue/{key}` plus a one-shot connection test.

## Keyboard shortcuts

| | |
|---|---|
| `Cmd/Ctrl+K` | Open the command palette |
| `n` | Focus the new-task input |
| `/` | Focus the board search |
| `1`–`4` | Set the draft bucket (Today / Week / Waiting / Someday) |
| `?` | Open the palette |
| `Esc` | Close palette, blur input, or clear filters |
| `Enter` (in add bar) | Add task |
| `Shift+Enter` | New line in titles and notes |
| `Cmd/Ctrl+Enter` (in notes) | Save notes |

## Project structure

```
foreground/
├─ electron/
│  ├─ main.js        # window, JSON-file storage, Jira proxy (over IPC)
│  └─ preload.cjs    # exposes window.storage and window.jira to the renderer
├─ src/
│  ├─ App.jsx        # the entire UI — one file, no framework beyond React
│  ├─ main.jsx       # React entry
│  └─ index.css      # global background / reset
├─ index.html
├─ vite.config.js
└─ package.json
```

## Notes

- Fonts (Fraunces, IBM Plex) load from Google Fonts on first launch, so the first open wants an internet connection. To make it fully offline, vendor those fonts under `src/` and replace the `@import` near the top of `App.jsx` with local `@font-face` rules.

## License

MIT — see [LICENSE](LICENSE).
