# SquadFlow — Desktop

A focused task instrument for staff engineers managing multiple squads.
Four buckets (Today / This Week / Waiting On / Someday), squad tagging,
a "waiting on" view with who + chase-by date, and a cross-squad attention
balance. Built with Electron + Vite + React.

## Prerequisites

- **Node.js 18+** (you can check with `node -v`)
- That's it. No Rust, no global installs.

## Run it in development

```bash
npm install
npm run dev
```

This starts the Vite dev server and launches the Electron window pointed at it,
with hot-reload. Edit `src/App.jsx` and the window updates live.

## Build a native installer

```bash
npm run dist
```

`electron-builder` produces an installer for your current OS in the `release/`
folder:

- **macOS** → `.dmg`
- **Windows** → `.exe` (NSIS installer)
- **Linux** → `.AppImage`

To build for a different OS you generally need to run on that OS (or a CI runner
for it). Code-signing is optional and not configured here.

## Where your data lives

Everything is stored in one JSON file in your OS app-data folder:

- **macOS:** `~/Library/Application Support/SquadFlow/squadflow-data.json`
- **Windows:** `%APPDATA%/SquadFlow/squadflow-data.json`
- **Linux:** `~/.config/SquadFlow/squadflow-data.json`

It survives restarts and updates. Copy that file to back up or sync your board
(e.g. drop it in a Dropbox/iCloud folder and symlink it).

## Project structure

```
squadflow-desktop/
├─ electron/
│  ├─ main.js        # app window + JSON-file storage over IPC
│  └─ preload.cjs    # exposes window.storage to the renderer
├─ src/
│  ├─ App.jsx        # the SquadFlow UI (unchanged from the artifact)
│  ├─ main.jsx       # React entry
│  └─ index.css      # global background / reset
├─ index.html
├─ vite.config.js
└─ package.json
```

## Notes

- The UI loads its fonts (Fraunces, IBM Plex) from Google Fonts, so the first
  launch wants an internet connection. To make it fully offline, download those
  fonts, drop them in `src/`, and replace the `@import` in `App.jsx` with local
  `@font-face` rules.
- The storage layer keeps the exact method shapes (`get`/`set`/`delete`/`list`)
  used by the original artifact, so you can move the component between the two
  environments freely.
