import React, { useState, useEffect, useMemo, useCallback } from "react";

// ── SquadFlow ──────────────────────────────────────────────────────────────
// A focused task instrument for a staff engineer managing multiple squads.
// Four buckets, squad tagging, a "waiting on" view, and cross-squad balance.
// Data persists across sessions via window.storage.

const BUCKETS = [
  { id: "today", label: "Today", hint: "Must move today", capped: true },
  { id: "week", label: "This Week", hint: "Committed, scheduled, not today" },
  { id: "waiting", label: "Waiting On", hint: "Handed off · chase before it blocks you" },
  { id: "someday", label: "Someday", hint: "Out of your head, off your plate" },
];

const STORAGE_KEY = "squadflow:state:v1";
const JIRA_KEY = "squadflow:jira:v1";

const DEFAULT_SETTINGS = { todayCap: 3, showBalance: true, darkMode: true };

// Match a JIRA issue key — uppercase letters + numbers, dash, digits.
const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;
// Match a browse URL like https://acme.atlassian.net/browse/PROJ-123
const JIRA_URL_RE = /https?:\/\/[^\s]+\/browse\/([A-Z][A-Z0-9]+-\d+)/;

// Minimal, safe-by-default markdown renderer for task titles. We escape HTML
// first, then apply a small set of inline transformations — bold, italic,
// inline code, [text](url) links, bare URLs, and newlines. Output is fed to
// dangerouslySetInnerHTML, so every replacement must be either applied to
// already-escaped text or produce values that are safe by construction (only
// http/https URLs are linkified; the URL becomes an attribute value of a tag
// whose other attributes are fixed).
const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderTitle(text, highlight) {
  if (!text) return "";
  let s = escapeHtml(text);
  // Mark highlights with safe placeholders so markdown processing below can't
  // mangle the <mark> tags or split them across link boundaries. The actual
  // <mark> insertion happens at the very end.
  if (highlight && highlight.trim()) {
    const h = escapeHtml(highlight.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(h, "gi");
    s = s.replace(re, (m) => `xHLSx${m}xHLEx`);
  }
  // Inline code (run first so other rules don't touch its contents)
  s = s.replace(/`([^`]+)`/g, (_m, body) => `<code>${body}</code>`);
  // Markdown link [text](url) — restrict scheme to http(s) to avoid javascript:
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label, url) => `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`
  );
  // Bare URLs (skip ones already inside an href="…")
  s = s.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    (_m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`
  );
  // Bold then italic (order matters so **x** isn't mangled by the * rule)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  // Resolve highlight placeholders into <mark> tags (done after markdown so
  // matches can survive being wrapped by other inline spans).
  s = s.replace(/xHLSx([\s\S]*?)xHLEx/g, "<mark>$1</mark>");
  // Preserve newlines (CSS also has white-space:pre-wrap, but explicit <br>
  // keeps copy-paste and screen readers happy)
  s = s.replace(/\n/g, "<br>");
  return s;
}

function autoSize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 240) + "px";
}

function detectJira(text) {
  if (!text) return null;
  const urlM = text.match(JIRA_URL_RE);
  if (urlM) return { key: urlM[1], url: urlM[0] };
  const keyM = text.match(JIRA_KEY_RE);
  if (keyM) return { key: keyM[1], url: null };
  return null;
}

const PALETTE = ["#c8853b", "#7c9a6d", "#9a6d8e", "#5d8a9a", "#b5654d", "#8a7c5d"];

const uid = () => Math.random().toString(36).slice(2, 10);

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

.sf-root { --bg:#1c1a17; --panel:#252320; --panel-2:#2c2925; --line:#39352f; --ink:#ece6db; --ink-dim:#a39c8e; --ink-faint:#6f685c; --accent:#d4943f; --danger:#b5654d; --side-bg:#181614; --btn-ink:#1c1a17; --warn-bg:rgba(181,101,77,.14); --warn-border:rgba(181,101,77,.4); --warn-ink:#e0a48f; --squad-hover:rgba(212,148,63,.08); }
.sf-root.light { --bg:#f5f1ea; --panel:#ffffff; --panel-2:#f9f5ec; --line:#e2dac8; --ink:#2a2620; --ink-dim:#6b6356; --ink-faint:#9a9080; --accent:#b87420; --danger:#a64a30; --side-bg:#ece5d3; --btn-ink:#fff8ec; --warn-bg:rgba(166,74,48,.08); --warn-border:rgba(166,74,48,.35); --warn-ink:#8a3d27; --squad-hover:rgba(184,116,32,.08); }
.sf-root *{box-sizing:border-box;}
.sf-root{ background:var(--bg); color:var(--ink); font-family:'IBM Plex Sans',sans-serif; min-height:100vh; display:flex; }
.sf-side{ width:56px; flex:0 0 56px; background:var(--side-bg); border-right:1px solid var(--line); display:flex; flex-direction:column; align-items:center; padding:18px 0; position:sticky; top:0; height:100vh; }
.sf-side-spacer{ flex:1; }
.sf-nav{ width:36px; height:36px; border-radius:9px; background:transparent; border:0; color:var(--ink-faint); cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; margin:4px 0; transition:background .15s ease, color .15s ease; }
.sf-nav:hover{ background:var(--panel); color:var(--ink-dim); }
.sf-nav.active{ background:var(--panel); color:var(--accent); }
.sf-nav svg{ width:18px; height:18px; }
.sf-main{ flex:1; min-width:0; padding:32px 24px 80px; }
.sf-wrap{ max-width:1100px; margin:0 auto; }

.sf-settings-card{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:20px 22px; margin-top:8px; }
.sf-set-row{ display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 0; border-bottom:1px solid var(--line); }
.sf-set-row:last-child{ border-bottom:0; }
.sf-set-label{ font-size:14px; }
.sf-set-desc{ font-size:11.5px; color:var(--ink-faint); margin-top:3px; max-width:480px; line-height:1.45; }
.sf-set-num{ width:72px; background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:8px; padding:8px 10px; font-size:14px; font-family:'IBM Plex Mono',monospace; outline:none; text-align:center; }
.sf-set-num:focus{ border-color:var(--accent); }
.sf-toggle{ position:relative; width:40px; height:22px; background:var(--panel-2); border:1px solid var(--line); border-radius:11px; cursor:pointer; padding:0; transition:background .15s ease; flex:0 0 auto; }
.sf-toggle::after{ content:""; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:var(--ink-faint); transition:left .15s ease, background .15s ease; }
.sf-toggle.on{ background:var(--accent); border-color:var(--accent); }
.sf-toggle.on::after{ left:20px; background:var(--btn-ink); }
.sf-set-btn{ background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:8px; padding:8px 14px; font-size:13px; font-family:inherit; cursor:pointer; transition:border-color .15s ease, color .15s ease; }
.sf-set-btn:hover{ border-color:var(--accent); color:var(--accent); }
.sf-set-btn.danger:hover{ border-color:var(--danger); color:var(--danger); }
.sf-set-btns{ display:flex; gap:8px; flex:0 0 auto; }
.sf-set-status{ font-size:11.5px; margin-top:8px; font-family:'IBM Plex Mono',monospace; }
.sf-set-status.ok{ color:#7c9a6d; }
.sf-set-status.err{ color:var(--danger); }

.sf-archive-empty{ color:var(--ink-faint); font-size:13px; font-style:italic; padding:32px 0; text-align:center; }
.sf-arc-group{ margin-top:20px; }
.sf-arc-date{ font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--ink-faint); text-transform:uppercase; letter-spacing:.08em; margin-bottom:8px; }
.sf-arc-item{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin-bottom:8px; display:flex; gap:10px; align-items:flex-start; }
.sf-arc-body{ flex:1; min-width:0; }
.sf-arc-title{ font-size:14px; line-height:1.5; color:var(--ink-dim); word-break:break-word; overflow-wrap:anywhere; white-space:pre-wrap; }
.sf-arc-title a{ color:var(--accent); text-decoration:none; border-bottom:1px dashed var(--accent); }
.sf-arc-title code{ background:var(--bg); border:1px solid var(--line); border-radius:4px; padding:0 4px; font-family:'IBM Plex Mono',monospace; font-size:12.5px; }
.sf-arc-meta{ display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:6px; }
.sf-arc-actions{ display:flex; gap:4px; flex:0 0 auto; }
.sf-arc-bulk{ display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:8px; font-size:12.5px; color:var(--ink-dim); }

.sf-chip-jira{ display:inline-flex; align-items:center; gap:4px; padding:2px 7px; border-radius:20px; border:1px solid var(--line); background:var(--panel); color:var(--ink-dim); font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.02em; text-decoration:none; cursor:pointer; }
.sf-chip-jira:hover{ border-color:var(--accent); color:var(--ink); }
.sf-chip-jira .sf-jira-key{ font-weight:600; color:var(--ink); }
.sf-chip-jira .sf-jira-status{ color:var(--ink-faint); }
.sf-chip-jira.cat-done .sf-jira-status{ color:#7c9a6d; }
.sf-chip-jira.cat-indeterminate .sf-jira-status{ color:var(--accent); }
.sf-chip-jira .sf-jira-refresh{ background:transparent; border:0; color:var(--ink-faint); cursor:pointer; font-size:11px; padding:0 0 0 4px; line-height:1; font-family:inherit; }
.sf-chip-jira .sf-jira-refresh:hover{ color:var(--accent); }
.sf-chip-jira.loading{ opacity:.6; }

.sf-jira-grid{ display:grid; grid-template-columns:140px 1fr; gap:10px 14px; align-items:center; margin-top:6px; }
.sf-jira-grid label{ font-size:12.5px; color:var(--ink-dim); }
.sf-jira-grid input{ background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit; outline:none; }
.sf-jira-grid input:focus{ border-color:var(--accent); }
.sf-jira-actions{ display:flex; gap:8px; align-items:center; margin-top:14px; }
.sf-mono{ font-family:'IBM Plex Mono',monospace; }
.sf-h1{ font-family:'Fraunces',serif; font-weight:900; font-size:34px; letter-spacing:-0.02em; margin:0; line-height:1; }
.sf-sub{ color:var(--ink-dim); font-size:13.5px; margin-top:8px; max-width:560px; line-height:1.5; }
.sf-rule{ height:1px; background:var(--line); margin:24px 0; border:0; }

.sf-add{ display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:10px; }
.sf-add-hint{ font-size:11px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; margin-top:6px; padding:0 4px; }

.sf-filter{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:14px; padding:8px 10px; background:var(--panel); border:1px solid var(--line); border-radius:10px; }
.sf-filter-search{ flex:1 1 200px; min-width:0; background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:6px; padding:6px 10px; font-size:13px; font-family:inherit; outline:none; }
.sf-filter-search:focus{ border-color:var(--accent); }
.sf-filter-search::placeholder{ color:var(--ink-faint); }
.sf-filter-pills{ display:flex; gap:4px; flex-wrap:wrap; align-items:center; }
.sf-filter-pill{ font-size:11px; padding:3px 9px; border-radius:20px; font-family:'IBM Plex Mono',monospace; letter-spacing:.02em; border:1px solid var(--line); background:transparent; color:var(--ink-dim); cursor:pointer; transition:filter .12s ease; }
.sf-filter-pill:hover{ border-color:var(--ink-dim); }
.sf-filter-pill.active{ color:var(--btn-ink); font-weight:500; border-color:transparent; }
.sf-filter-toggle{ display:flex; align-items:center; gap:6px; font-size:12px; color:var(--ink-dim); cursor:pointer; user-select:none; padding:4px 8px; border-radius:6px; }
.sf-filter-toggle:hover{ color:var(--ink); }
.sf-filter-toggle input{ accent-color:var(--accent); cursor:pointer; }
.sf-filter-clear{ background:transparent; border:0; color:var(--ink-faint); font-size:11.5px; cursor:pointer; font-family:inherit; padding:4px 6px; border-radius:6px; }
.sf-filter-clear:hover{ color:var(--danger); }
.sf-filter-count{ font-size:11px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; margin-left:auto; }
.sf-task mark{ background:var(--accent); color:var(--btn-ink); padding:0 2px; border-radius:2px; }

@keyframes sf-flash { 0%{box-shadow:0 0 0 0 var(--accent);} 50%{box-shadow:0 0 0 3px var(--accent);} 100%{box-shadow:0 0 0 0 transparent;} }
.sf-task.flash{ animation: sf-flash 1.4s ease-out; }

.sf-palette-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:100; display:flex; align-items:flex-start; justify-content:center; padding-top:12vh; }
.sf-palette{ width:min(640px, 92vw); background:var(--panel); border:1px solid var(--line); border-radius:14px; box-shadow:0 24px 64px rgba(0,0,0,.45); overflow:hidden; display:flex; flex-direction:column; max-height:70vh; }
.sf-palette-input{ background:transparent; border:0; border-bottom:1px solid var(--line); color:var(--ink); padding:16px 18px; font-size:15px; font-family:inherit; outline:none; }
.sf-palette-input::placeholder{ color:var(--ink-faint); }
.sf-palette-list{ overflow-y:auto; flex:1; padding:6px; }
.sf-palette-group{ font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:var(--ink-faint); text-transform:uppercase; letter-spacing:.08em; padding:10px 12px 6px; }
.sf-palette-item{ display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; cursor:pointer; color:var(--ink); }
.sf-palette-item.selected{ background:var(--panel-2); }
.sf-palette-item .sf-pal-icon{ width:18px; flex:0 0 auto; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; font-size:11px; text-align:center; }
.sf-palette-item .sf-pal-body{ flex:1; min-width:0; }
.sf-palette-item .sf-pal-label{ font-size:13.5px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.sf-palette-item .sf-pal-hint{ font-size:11px; color:var(--ink-faint); margin-top:2px; font-family:'IBM Plex Mono',monospace; }
.sf-palette-item .sf-pal-meta{ flex:0 0 auto; font-size:11px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; }
.sf-palette-empty{ color:var(--ink-faint); font-size:13px; padding:24px; text-align:center; font-style:italic; }
.sf-palette-foot{ border-top:1px solid var(--line); padding:8px 14px; display:flex; gap:14px; font-size:10.5px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; }
.sf-palette-foot kbd{ background:var(--panel-2); border:1px solid var(--line); border-radius:4px; padding:1px 6px; font-family:inherit; color:var(--ink-dim); }
.sf-add-hint b{ color:var(--ink-dim); font-weight:500; }
.sf-input{ flex:1 1 260px; min-width:0; background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:8px; padding:10px 12px; font-size:14px; font-family:inherit; outline:none; resize:none; line-height:1.5; min-height:42px; max-height:240px; overflow-y:auto; }
.sf-input:focus{ border-color:var(--accent); }
.sf-input::placeholder{ color:var(--ink-faint); }
.sf-sel{ background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:8px; padding:10px; font-size:13px; font-family:inherit; outline:none; cursor:pointer; }
.sf-btn{ background:var(--accent); color:var(--btn-ink); border:0; border-radius:8px; padding:10px 16px; font-weight:600; font-size:14px; cursor:pointer; font-family:inherit; transition:transform .08s ease, filter .15s ease; }
.sf-btn:hover{ filter:brightness(1.08); }
.sf-btn:active{ transform:translateY(1px); }
.sf-btn:disabled{ opacity:.4; cursor:not-allowed; }

.sf-grid{ display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-top:24px; }
@media(max-width:760px){ .sf-grid{ grid-template-columns:1fr; } }

.sf-col{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px; display:flex; flex-direction:column; }
.sf-col-head{ display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:4px; }
.sf-col-title{ font-family:'Fraunces',serif; font-weight:600; font-size:18px; letter-spacing:-0.01em; }
.sf-col-count{ font-size:12px; color:var(--ink-faint); }
.sf-col-count.over{ color:var(--danger); font-weight:500; }
.sf-col-hint{ font-size:11.5px; color:var(--ink-faint); margin-bottom:12px; }

.sf-cap-warn{ background:var(--warn-bg); border:1px solid var(--warn-border); color:var(--warn-ink); font-size:12px; padding:7px 10px; border-radius:8px; margin-bottom:10px; }

.sf-task{ background:var(--panel-2); border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin-bottom:8px; display:flex; gap:10px; align-items:flex-start; transition:border-color .15s ease, opacity .15s ease, transform .15s ease; cursor:grab; }
.sf-task:hover{ border-color:var(--accent); }
.sf-task.done{ opacity:.45; }
.sf-task.done .sf-task-title{ text-decoration:line-through; }
.sf-task.dragging{ opacity:.35; cursor:grabbing; }
.sf-task.drop-before{ box-shadow:0 -2px 0 var(--accent); }
.sf-col.drop-target{ background:var(--squad-hover); border-color:var(--accent); }
.sf-grip{ flex:0 0 auto; color:var(--ink-faint); font-size:12px; padding:2px 0; cursor:grab; user-select:none; line-height:1; letter-spacing:-1px; }
.sf-grip:hover{ color:var(--ink-dim); }
.sf-check{ flex:0 0 auto; width:18px; height:18px; border-radius:5px; border:1.5px solid var(--ink-faint); background:transparent; cursor:pointer; margin-top:2px; display:flex; align-items:center; justify-content:center; padding:0; }
.sf-check.on{ background:var(--accent); border-color:var(--accent); color:var(--btn-ink); font-size:12px; font-weight:700; }
.sf-task-body{ flex:1; min-width:0; }
.sf-task-title{ font-size:14px; line-height:1.5; word-break:break-word; overflow-wrap:anywhere; white-space:pre-wrap; cursor:text; border-radius:4px; padding:1px 3px; margin:-1px -3px; }
.sf-task-title:hover{ background:var(--squad-hover); }
.sf-task-title a{ color:var(--accent); text-decoration:none; border-bottom:1px dashed var(--accent); }
.sf-task-title a:hover{ filter:brightness(1.15); }
.sf-task-title code{ background:var(--panel); border:1px solid var(--line); border-radius:4px; padding:0 4px; font-family:'IBM Plex Mono',monospace; font-size:12.5px; }
.sf-task-title strong{ font-weight:600; color:var(--ink); }
.sf-task-title em{ font-style:italic; color:var(--ink-dim); }
.sf-task-edit{ width:100%; background:var(--panel); border:1px solid var(--accent); color:var(--ink); border-radius:6px; padding:4px 7px; font-size:14px; font-family:inherit; outline:none; line-height:1.5; resize:none; min-height:28px; max-height:240px; overflow-y:auto; white-space:pre-wrap; word-break:break-word; }
.sf-meta{ display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:6px; }
.sf-chip{ font-size:10.5px; padding:2px 7px; border-radius:20px; font-family:'IBM Plex Mono',monospace; letter-spacing:.02em; }
.sf-chip-squad{ color:var(--btn-ink); font-weight:500; cursor:pointer; border:0; padding:2px 7px; font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.02em; }
.sf-chip-squad:hover{ filter:brightness(1.1); }
.sf-chip-squad-add{ background:transparent; border:1px dashed var(--line); color:var(--ink-faint); cursor:pointer; padding:1px 7px; font-size:10.5px; border-radius:20px; font-family:'IBM Plex Mono',monospace; letter-spacing:.02em; }
.sf-chip-squad-add:hover{ border-color:var(--accent); color:var(--accent); }
.sf-chip-edit{ background:var(--panel); border:1px solid var(--accent); color:var(--ink); border-radius:20px; padding:2px 8px; font-size:10.5px; font-family:'IBM Plex Mono',monospace; outline:none; width:110px; letter-spacing:.02em; }
.sf-chip-person{ background:var(--panel); border:1px solid var(--line); color:var(--ink-dim); }
.sf-chip-date{ background:transparent; border:1px solid var(--line); color:var(--ink-faint); }
.sf-chip-date.due{ color:var(--danger); border-color:rgba(181,101,77,.5); }
.sf-actions{ display:flex; gap:2px; flex:0 0 auto; }
.sf-mini{ background:transparent; border:0; color:var(--ink-faint); cursor:pointer; font-size:11px; padding:3px 6px; border-radius:6px; font-family:inherit; }
.sf-mini:hover{ background:var(--panel); color:var(--ink); }
.sf-empty{ color:var(--ink-faint); font-size:12.5px; font-style:italic; padding:8px 2px; }

.sf-move{ position:relative; }
.sf-move-menu{ position:absolute; right:0; top:100%; margin-top:4px; background:var(--panel-2); border:1px solid var(--line); border-radius:8px; padding:4px; z-index:20; box-shadow:0 8px 24px rgba(0,0,0,.4); min-width:130px; }
.sf-move-item{ display:block; width:100%; text-align:left; background:transparent; border:0; color:var(--ink-dim); padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-family:inherit; }
.sf-move-item:hover{ background:var(--accent); color:var(--btn-ink); }

.sf-balance{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px 18px; margin-top:24px; }
.sf-balance-title{ font-family:'Fraunces',serif; font-weight:600; font-size:16px; margin-bottom:3px; }
.sf-balance-sub{ font-size:11.5px; color:var(--ink-faint); margin-bottom:14px; }
.sf-bar-row{ display:flex; align-items:center; gap:12px; margin-bottom:8px; }
.sf-bar-label{ width:110px; flex:0 0 auto; font-size:12.5px; font-family:'IBM Plex Mono',monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sf-bar-track{ flex:1; height:14px; background:var(--panel-2); border-radius:7px; overflow:hidden; }
.sf-bar-fill{ height:100%; border-radius:7px; transition:width .4s ease; }
.sf-bar-num{ width:28px; flex:0 0 auto; text-align:right; font-size:12px; font-family:'IBM Plex Mono',monospace; color:var(--ink-dim); }

.sf-footer{ display:flex; justify-content:space-between; align-items:center; margin-top:28px; flex-wrap:wrap; gap:12px; }
.sf-review{ font-size:12px; color:var(--ink-dim); line-height:1.6; }
.sf-review b{ color:var(--ink); font-weight:600; }
.sf-reset{ background:transparent; border:1px solid var(--line); color:var(--ink-faint); border-radius:8px; padding:7px 12px; font-size:11.5px; cursor:pointer; font-family:inherit; }
.sf-reset:hover{ border-color:var(--danger); color:var(--danger); }
.sf-saving{ font-size:11px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; }
`;

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [view, setView] = useState("board"); // board | archive | settings
  const [ioStatus, setIoStatus] = useState(null); // { kind: "ok"|"err", msg }
  const fileInputRef = React.useRef(null);
  const [jiraCreds, setJiraCreds] = useState({ baseUrl: "", email: "", token: "", cloudId: "" });
  const [jiraTestStatus, setJiraTestStatus] = useState(null); // { kind, msg }
  const [jiraLoadingId, setJiraLoadingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftBucket, setDraftBucket] = useState("today");
  const [draftSquad, setDraftSquad] = useState("");
  const [openMenu, setOpenMenu] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [editingSquadId, setEditingSquadId] = useState(null);
  const [editSquadDraft, setEditSquadDraft] = useState("");

  const startEdit = (t) => { setEditingId(t.id); setEditDraft(t.title); };
  const cancelEdit = () => { setEditingId(null); setEditDraft(""); };
  const commitEdit = () => {
    const title = editDraft.trim();
    const id = editingId;
    if (id && title) {
      const current = tasks.find((t) => t.id === id);
      update(id, { title });
      // If the edited title now references a different Jira key (or the first one), re-enrich.
      const detected = detectJira(title);
      const currentKey = current && current.jira && current.jira.key;
      if (detected && detected.key !== currentKey) {
        enrichWithJira(id, detected.key, detected.url);
      }
    }
    setEditingId(null);
    setEditDraft("");
  };

  const [dragId, setDragId] = useState(null);
  const [dropBeforeId, setDropBeforeId] = useState(null);
  const [dropBucket, setDropBucket] = useState(null);

  // Filter state — search applies to the visible title text; squadFilter is a
  // Set of squad names (empty = include all squads); hideDone collapses done
  // items out of the board entirely.
  const [searchTerm, setSearchTerm] = useState("");
  const [squadFilter, setSquadFilter] = useState(new Set());
  const [hideDone, setHideDone] = useState(false);

  // Command palette state. paletteOpen toggles the overlay; query and
  // selectedIdx drive its list. selectedIdx is reset whenever the list shape
  // changes (query, view, or open/close).
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [flashTaskId, setFlashTaskId] = useState(null);

  const addInputRef = React.useRef(null);
  const searchInputRef = React.useRef(null);
  const paletteInputRef = React.useRef(null);

  const toggleSquadFilter = (name) => {
    setSquadFilter((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };
  const clearFilters = () => { setSearchTerm(""); setSquadFilter(new Set()); setHideDone(false); };

  const trimmedSearch = searchTerm.trim().toLowerCase();
  const filtersActive = !!trimmedSearch || squadFilter.size > 0 || hideDone;

  const matchesFilters = useCallback((t) => {
    if (hideDone && t.done) return false;
    if (squadFilter.size > 0) {
      // Untagged tasks never match a positive squad filter.
      if (!t.squad || !squadFilter.has(t.squad)) return false;
    }
    if (trimmedSearch) {
      const hay = (t.title || "").toLowerCase();
      if (!hay.includes(trimmedSearch)) return false;
    }
    return true;
  }, [hideDone, squadFilter, trimmedSearch]);
  // filteredVisibleCount is defined further down, alongside activeTasks — it
  // depends on it, and JS const declarations don't hoist.

  const moveTask = (id, targetBucket, beforeId) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const moved = { ...prev[idx], bucket: targetBucket };
      const without = prev.filter((t) => t.id !== id);
      if (beforeId && beforeId !== id) {
        const targetIdx = without.findIndex((t) => t.id === beforeId);
        if (targetIdx >= 0) {
          return [...without.slice(0, targetIdx), moved, ...without.slice(targetIdx)];
        }
      }
      // No anchor → append. Since render filters by bucket, this places it at the
      // bottom of the target bucket.
      return [...without, moved];
    });
  };

  const startSquadEdit = (t) => { setEditingSquadId(t.id); setEditSquadDraft(t.squad || ""); };
  const cancelSquadEdit = () => { setEditingSquadId(null); setEditSquadDraft(""); };
  const commitSquadEdit = () => {
    if (editingSquadId) {
      const v = editSquadDraft.trim();
      update(editingSquadId, { squad: v || null });
    }
    setEditingSquadId(null);
    setEditSquadDraft("");
  };

  // Load once
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed.tasks)) setTasks(parsed.tasks);
          if (parsed.settings && typeof parsed.settings === "object") {
            setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
          }
        }
      } catch (e) {
        // No existing key — fresh start. Not an error worth surfacing.
      }
      try {
        const jres = await window.storage.get(JIRA_KEY);
        if (jres && jres.value) {
          const parsed = JSON.parse(jres.value);
          setJiraCreds({
            baseUrl: parsed.baseUrl || "",
            email: parsed.email || "",
            token: parsed.token || "",
            cloudId: parsed.cloudId || "",
          });
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const persistJiraCreds = useCallback(async (next) => {
    setJiraCreds(next);
    try { await window.storage.set(JIRA_KEY, JSON.stringify(next)); } catch {}
  }, []);

  // Two valid shapes:
  //   - classic: baseUrl + email + token (Basic auth against tenant URL)
  //   - scoped:  token + cloudId        (Bearer via api.atlassian.com)
  // baseUrl is still useful in the scoped case for the click-through link.
  const jiraConfigured = !!(
    jiraCreds.token && (
      (jiraCreds.baseUrl && jiraCreds.email) ||
      jiraCreds.cloudId
    )
  );

  // Attach Jira metadata to a task. Resilient: if creds are missing or the
  // fetch fails, we still attach the key + URL so the click-to-open chip works.
  const enrichWithJira = useCallback(async (id, key, fallbackUrl) => {
    if (!key) return;
    setJiraLoadingId(id);
    try {
      if (jiraConfigured) {
        const data = await window.jira.fetch(jiraCreds, key);
        update(id, {
          jira: {
            key: data.key,
            url: data.url,
            summary: data.summary,
            status: data.status,
            statusCategory: data.statusCategory,
            syncedAt: Date.now(),
          },
        });
      } else {
        // No creds: stash whatever we can derive from the text.
        const guessed = fallbackUrl || (jiraCreds.baseUrl
          ? `${jiraCreds.baseUrl.replace(/\/+$/, "")}/browse/${key}`
          : null);
        update(id, { jira: { key, url: guessed, syncedAt: Date.now() } });
      }
    } catch (e) {
      // Keep the key/URL even on failure so the chip still works as a link.
      update(id, {
        jira: {
          key,
          url: fallbackUrl || null,
          error: String(e && e.message || e),
          syncedAt: Date.now(),
        },
      });
    } finally {
      setJiraLoadingId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jiraCreds, jiraConfigured]);

  // Persist on change (after initial load)
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setSaveState("saving");
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify({ tasks, settings }));
        if (!cancelled) {
          setSaveState("saved");
          setTimeout(() => !cancelled && setSaveState("idle"), 1200);
        }
      } catch (e) {
        if (!cancelled) setSaveState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [tasks, settings, loaded]);

  const squads = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => t.squad && set.add(t.squad));
    return Array.from(set).sort();
  }, [tasks]);

  const squadColor = useCallback(
    (name) => {
      if (!name) return "var(--ink-faint)";
      const idx = squads.indexOf(name);
      return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
    },
    [squads]
  );

  const addTask = () => {
    const title = draft.trim();
    if (!title) return;
    const t = {
      id: uid(),
      title,
      bucket: draftBucket,
      squad: draftSquad.trim() || null,
      person: null,
      chaseDate: null,
      done: false,
      createdAt: Date.now(),
    };
    setTasks((prev) => [t, ...prev]);
    setDraft("");
    const detected = detectJira(title);
    if (detected) enrichWithJira(t.id, detected.key, detected.url);
  };

  const update = (id, patch) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const archive = (id) => update(id, { done: true, archivedAt: Date.now() });
  const restore = (id) => update(id, { archivedAt: null, done: false });
  const archiveAllDone = () => {
    const now = Date.now();
    setTasks((prev) => prev.map((t) =>
      t.done && !t.archivedAt ? { ...t, archivedAt: now } : t
    ));
  };

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archivedAt), [tasks]);
  const archivedTasks = useMemo(
    () => tasks.filter((t) => t.archivedAt).sort((a, b) => b.archivedAt - a.archivedAt),
    [tasks]
  );
  const doneNotArchivedCount = activeTasks.filter((t) => t.done).length;
  const filteredVisibleCount = useMemo(
    () => activeTasks.filter(matchesFilters).length,
    [activeTasks, matchesFilters]
  );

  const openPalette = useCallback((preset = "") => {
    setPaletteQuery(preset);
    setPaletteIdx(0);
    setPaletteOpen(true);
  }, []);

  // Briefly highlight a task and scroll it into view — used when the palette
  // jumps to a result so the user's eye can find it.
  const flashTask = useCallback((id) => {
    setFlashTaskId(id);
    // Wait a frame so the row is in the DOM if we just switched views.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-task-id="${id}"]`);
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setTimeout(() => setFlashTaskId(null), 1400);
  }, []);

  // Global shortcuts. Skip most when typing into an input/textarea — except
  // Cmd/Ctrl+K (always available) and Esc (closes things).
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      const inForm =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

      // Cmd/Ctrl+K — open palette from anywhere
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (paletteOpen) setPaletteOpen(false);
        else openPalette("");
        return;
      }

      // Esc — close palette, blur input, or clear filters
      if (e.key === "Escape") {
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (inForm) { t.blur(); return; }
        if (filtersActive) { clearFilters(); return; }
        return;
      }

      if (paletteOpen) return; // palette has its own keydowns

      // The rest only fire when not in a text field
      if (inForm) return;

      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setView("board");
        // Wait a tick if we had to switch view
        setTimeout(() => addInputRef.current?.focus(), 0);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        openPalette("");
        return;
      }
      if (e.key >= "1" && e.key <= "4") {
        const idx = parseInt(e.key, 10) - 1;
        if (BUCKETS[idx]) setDraftBucket(BUCKETS[idx].id);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, filtersActive, openPalette]);

  // Cross-squad balance: open (not done, not archived) items per squad
  const balance = useMemo(() => {
    const counts = {};
    activeTasks.forEach((t) => {
      if (t.done) return;
      const key = t.squad || "— untagged —";
      counts[key] = (counts[key] || 0) + 1;
    });
    const rows = Object.entries(counts).map(([name, n]) => ({ name, n }));
    rows.sort((a, b) => b.n - a.n);
    return rows;
  }, [activeTasks]);
  const maxBalance = Math.max(1, ...balance.map((r) => r.n));

  const today = new Date().toISOString().slice(0, 10);

  // ── Command palette items ────────────────────────────────────────────────
  // Items are a unified list of "things you can do" — built lazily based on
  // the current query. Tasks fuzzy-match against title; actions match against
  // their label and a couple of keywords.
  const paletteItems = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();

    // Actions — verbs the user can run from anywhere
    const actions = [];
    const addAction = (label, hint, run, keywords = "") => {
      actions.push({ kind: "action", label, hint, run, keywords: (keywords + " " + label).toLowerCase() });
    };
    addAction("Go to Board", "·", () => setView("board"), "dashboard home");
    addAction("Go to Archive", "·", () => setView("archive"), "completed done");
    addAction("Go to Settings", "·", () => setView("settings"), "config preferences");
    addAction(
      settings.darkMode ? "Switch to light mode" : "Switch to dark mode",
      "·",
      () => setSettings((s) => ({ ...s, darkMode: !s.darkMode })),
      "theme dark light"
    );
    addAction(
      hideDone ? "Show done tasks" : "Hide done tasks",
      "·",
      () => setHideDone((v) => !v),
      "filter completed"
    );
    if (filtersActive) {
      addAction("Clear all filters", "·", clearFilters, "reset");
    }
    if (doneNotArchivedCount > 0) {
      addAction(`Archive done (${doneNotArchivedCount})`, "·", archiveAllDone, "bulk");
    }
    addAction("Focus new-task input", "n", () => {
      setView("board");
      setTimeout(() => addInputRef.current?.focus(), 0);
    }, "add create");
    addAction("Focus search", "/", () => {
      setView("board");
      setTimeout(() => searchInputRef.current?.focus(), 0);
    });
    squads.forEach((s) => {
      addAction(`Filter by squad: ${s}`, "·", () => {
        setView("board");
        setSquadFilter((prev) => {
          const next = new Set(prev);
          if (next.has(s)) next.delete(s); else next.add(s);
          return next;
        });
      }, "team");
    });

    // Filter actions to the query
    const matchedActions = q
      ? actions.filter((a) => a.keywords.includes(q))
      : actions;

    // Tasks — match against the raw title (case-insensitive). Include archived
    // too so the palette is a real "find anything" tool.
    const allTaskCandidates = [
      ...activeTasks.map((t) => ({ t, archived: false })),
      ...archivedTasks.map((t) => ({ t, archived: true })),
    ];
    const matchedTasks = (q
      ? allTaskCandidates.filter(({ t }) => (t.title || "").toLowerCase().includes(q))
      : allTaskCandidates
    ).slice(0, 30); // cap to keep the list scannable

    const items = [];
    if (matchedActions.length) {
      items.push({ kind: "group", label: "Actions" });
      matchedActions.forEach((a) => items.push(a));
    }
    if (matchedTasks.length) {
      items.push({ kind: "group", label: "Tasks" });
      matchedTasks.forEach(({ t, archived }) => {
        const bucketLabel = archived ? "archive" : (BUCKETS.find((b) => b.id === t.bucket)?.label || t.bucket);
        items.push({
          kind: "task",
          task: t,
          archived,
          label: t.title,
          hint: t.squad ? `${bucketLabel} · ${t.squad}` : bucketLabel,
          run: () => {
            if (archived) {
              setView("archive");
            } else {
              setView("board");
              // Make sure filters don't hide the task we just jumped to.
              if (!matchesFilters(t)) clearFilters();
            }
            setTimeout(() => flashTask(t.id), 30);
          },
        });
      });
    }
    return items;
  }, [
    paletteQuery, activeTasks, archivedTasks, squads, settings.darkMode,
    hideDone, filtersActive, doneNotArchivedCount, matchesFilters, flashTask,
  ]);

  // Indices of *selectable* items (excluding group headers)
  const selectableIdxs = useMemo(
    () => paletteItems.map((it, i) => (it.kind === "group" ? -1 : i)).filter((i) => i >= 0),
    [paletteItems]
  );
  // Clamp the selection whenever the list shape changes
  useEffect(() => {
    if (paletteIdx >= selectableIdxs.length) setPaletteIdx(Math.max(0, selectableIdxs.length - 1));
  }, [selectableIdxs, paletteIdx]);

  const runPaletteItem = (idx) => {
    const realIdx = selectableIdxs[idx];
    const item = paletteItems[realIdx];
    if (!item) return;
    setPaletteOpen(false);
    item.run();
  };

  const exportData = () => {
    try {
      const payload = { version: 1, exportedAt: new Date().toISOString(), tasks, settings };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `squadflow-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setIoStatus({ kind: "ok", msg: `Exported ${tasks.length} task${tasks.length === 1 ? "" : "s"}.` });
    } catch (e) {
      setIoStatus({ kind: "err", msg: "Export failed." });
    }
  };

  const importData = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.tasks)) {
          throw new Error("Missing tasks array.");
        }
        const ok = window.confirm(
          `Replace your current board with ${parsed.tasks.length} task${parsed.tasks.length === 1 ? "" : "s"} from this file? This can't be undone.`
        );
        if (!ok) {
          setIoStatus(null);
          return;
        }
        setTasks(parsed.tasks);
        if (parsed.settings && typeof parsed.settings === "object") {
          setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
        }
        setIoStatus({ kind: "ok", msg: `Imported ${parsed.tasks.length} task${parsed.tasks.length === 1 ? "" : "s"}.` });
      } catch (e) {
        setIoStatus({ kind: "err", msg: "Invalid file — expected SquadFlow JSON export." });
      }
    };
    reader.onerror = () => setIoStatus({ kind: "err", msg: "Couldn't read file." });
    reader.readAsText(file);
  };

  const palette = paletteOpen && (
    <div className="sf-palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPaletteOpen(false); }}>
      <div className="sf-palette">
        <input
          ref={paletteInputRef}
          autoFocus
          className="sf-palette-input"
          type="text"
          placeholder="Find tasks, run actions… (try a squad name, a Jira key, or just type)"
          value={paletteQuery}
          onChange={(e) => { setPaletteQuery(e.target.value); setPaletteIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setPaletteOpen(false); return; }
            if (e.key === "ArrowDown") { e.preventDefault(); setPaletteIdx((i) => Math.min(i + 1, selectableIdxs.length - 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setPaletteIdx((i) => Math.max(i - 1, 0)); return; }
            if (e.key === "Enter") { e.preventDefault(); runPaletteItem(paletteIdx); return; }
          }}
        />
        <div className="sf-palette-list">
          {paletteItems.length === 0 && <div className="sf-palette-empty">No matches.</div>}
          {paletteItems.map((it, i) => {
            if (it.kind === "group") {
              return <div className="sf-palette-group" key={`g-${i}`}>{it.label}</div>;
            }
            const selectableIndex = selectableIdxs.indexOf(i);
            const selected = selectableIndex === paletteIdx;
            const icon = it.kind === "action" ? "▸" : "·";
            return (
              <div
                key={`i-${i}`}
                className={"sf-palette-item" + (selected ? " selected" : "")}
                onMouseEnter={() => setPaletteIdx(selectableIndex)}
                onMouseDown={(e) => { e.preventDefault(); runPaletteItem(selectableIndex); }}
              >
                <span className="sf-pal-icon">{icon}</span>
                <div className="sf-pal-body">
                  <div className="sf-pal-label">{it.label}</div>
                  {it.hint && it.hint !== "·" && <div className="sf-pal-hint">{it.hint}</div>}
                </div>
                {it.kind === "action" && it.hint && it.hint !== "·" && (
                  <span className="sf-pal-meta">{it.hint}</span>
                )}
                {it.kind === "task" && <span className="sf-pal-meta">{it.hint}</span>}
              </div>
            );
          })}
        </div>
        <div className="sf-palette-foot">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
          <span style={{ marginLeft: "auto" }}>
            shortcuts: <kbd>n</kbd> add · <kbd>/</kbd> search · <kbd>1-4</kbd> bucket · <kbd>?</kbd> palette
          </span>
        </div>
      </div>
    </div>
  );

  if (!loaded) {
    return (
      <div className={"sf-root" + (settings.darkMode ? "" : " light")}>
        <style>{styles}</style>
        {palette}
        <Sidebar view={view} setView={setView} />
        <main className="sf-main"><div className="sf-wrap"><p className="sf-empty">Loading your board…</p></div></main>
      </div>
    );
  }

  if (view === "archive") {
    const groups = [];
    let currentKey = null;
    archivedTasks.forEach((t) => {
      const key = new Date(t.archivedAt).toISOString().slice(0, 10);
      if (key !== currentKey) {
        groups.push({ key, items: [] });
        currentKey = key;
      }
      groups[groups.length - 1].items.push(t);
    });

    return (
      <div className={"sf-root" + (settings.darkMode ? "" : " light")}>
        <style>{styles}</style>
        {palette}
        <Sidebar view={view} setView={setView} />
        <main className="sf-main">
          <div className="sf-wrap">
            <header>
              <h1 className="sf-h1">Archive</h1>
              <p className="sf-sub">
                Completed work, out of the way but not gone. Restore anything that
                shouldn't have been archived, or delete it for good.
              </p>
            </header>
            <hr className="sf-rule" />

            {archivedTasks.length === 0 ? (
              <p className="sf-archive-empty">
                Nothing archived yet. Complete a task and hit "archive" on the row, or
                use "Archive done" in the footer to bulk-archive.
              </p>
            ) : (
              <>
                <div className="sf-arc-bulk">
                  <span>{archivedTasks.length} archived task{archivedTasks.length === 1 ? "" : "s"}</span>
                  <button
                    className="sf-reset"
                    onClick={() => {
                      if (window.confirm(`Permanently delete all ${archivedTasks.length} archived tasks? This can't be undone.`)) {
                        setTasks((prev) => prev.filter((t) => !t.archivedAt));
                      }
                    }}
                  >Empty archive</button>
                </div>
                {groups.map((g) => (
                  <div className="sf-arc-group" key={g.key}>
                    <div className="sf-arc-date">{g.key}</div>
                    {g.items.map((t) => (
                      <div
                        className={"sf-arc-item" + (flashTaskId === t.id ? " flash" : "")}
                        key={t.id}
                        data-task-id={t.id}
                      >
                        <div className="sf-arc-body">
                          <div
                            className="sf-arc-title"
                            dangerouslySetInnerHTML={{ __html: renderTitle(t.title) }}
                          />
                          <div className="sf-arc-meta">
                            {t.squad && (
                              <span className="sf-chip sf-chip-squad" style={{ background: squadColor(t.squad) }}>
                                {t.squad}
                              </span>
                            )}
                            <span className="sf-chip sf-chip-date">
                              from {BUCKETS.find((b) => b.id === t.bucket)?.label || t.bucket}
                            </span>
                          </div>
                        </div>
                        <div className="sf-arc-actions">
                          <button className="sf-mini" onClick={() => restore(t.id)} title="Move back to its bucket">restore</button>
                          <button
                            className="sf-mini"
                            onClick={() => {
                              const preview = t.title.length > 60 ? t.title.slice(0, 57) + "…" : t.title;
                              if (window.confirm(`Permanently delete this task?\n\n"${preview}"`)) remove(t.id);
                            }}
                            title="Delete permanently"
                          >✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (view === "settings") {
    return (
      <div className={"sf-root" + (settings.darkMode ? "" : " light")}>
        <style>{styles}</style>
        {palette}
        <Sidebar view={view} setView={setView} />
        <main className="sf-main">
          <div className="sf-wrap">
            <header>
              <h1 className="sf-h1">Settings</h1>
              <p className="sf-sub">Tune SquadFlow to fit how you work. Changes save automatically.</p>
            </header>
            <hr className="sf-rule" />
            <div className="sf-settings-card">
              <div className="sf-set-row">
                <div>
                  <div className="sf-set-label">Dark mode</div>
                  <div className="sf-set-desc">
                    Warm dark by default. Switch to light if you'd rather work on a cream
                    background.
                  </div>
                </div>
                <button
                  className={"sf-toggle" + (settings.darkMode ? " on" : "")}
                  onClick={() => setSettings((s) => ({ ...s, darkMode: !s.darkMode }))}
                  aria-pressed={settings.darkMode}
                  aria-label="Toggle dark mode"
                />
              </div>

              <div className="sf-set-row">
                <div>
                  <div className="sf-set-label">Today cap</div>
                  <div className="sf-set-desc">
                    The maximum number of open items in Today before you get the gentle nudge.
                    Three is the default — a ceiling, not a target.
                  </div>
                </div>
                <input
                  className="sf-set-num"
                  type="number"
                  min={1}
                  max={20}
                  value={settings.todayCap}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (Number.isFinite(n) && n >= 1 && n <= 20) {
                      setSettings((s) => ({ ...s, todayCap: n }));
                    }
                  }}
                />
              </div>

              <div className="sf-set-row">
                <div>
                  <div className="sf-set-label">Show "Where your attention is going"</div>
                  <div className="sf-set-desc">
                    The cross-squad balance bars under the buckets. Turn off if the visual
                    nudge isn't useful for you right now.
                  </div>
                </div>
                <button
                  className={"sf-toggle" + (settings.showBalance ? " on" : "")}
                  onClick={() => setSettings((s) => ({ ...s, showBalance: !s.showBalance }))}
                  aria-pressed={settings.showBalance}
                  aria-label="Toggle balance panel"
                />
              </div>

              <div className="sf-set-row">
                <div>
                  <div className="sf-set-label">Backup & restore</div>
                  <div className="sf-set-desc">
                    Export your tasks and settings to a JSON file, or restore from a previous
                    export. Importing replaces everything on the board.
                  </div>
                  {ioStatus && (
                    <div className={"sf-set-status " + (ioStatus.kind === "ok" ? "ok" : "err")}>
                      {ioStatus.msg}
                    </div>
                  )}
                </div>
                <div className="sf-set-btns">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files && e.target.files[0];
                      importData(f);
                      e.target.value = "";
                    }}
                  />
                  <button className="sf-set-btn" onClick={() => fileInputRef.current?.click()}>
                    Import…
                  </button>
                  <button className="sf-set-btn" onClick={exportData} disabled={tasks.length === 0}>
                    Export
                  </button>
                </div>
              </div>

              <div className="sf-set-row" style={{ display: "block" }}>
                <div>
                  <div className="sf-set-label">Jira integration {jiraConfigured && <span style={{ color: "#7c9a6d", fontSize: 11, marginLeft: 6 }}>● connected</span>}</div>
                  <div className="sf-set-desc">
                    Paste a Jira link or key (like <span className="sf-mono">PROJ-123</span>) into a task title
                    and SquadFlow will pull the summary and current status. Create a token at{" "}
                    <span className="sf-mono">id.atlassian.com/manage-profile/security/api-tokens</span>.
                    SquadFlow only reads — it calls{" "}
                    <span className="sf-mono">GET /rest/api/3/issue/{`{key}`}</span> and nothing else.
                    <br /><br />
                    <b>Two token types are supported.</b> Both share the same{" "}
                    <span className="sf-mono">ATATT…</span> prefix, so check how you created it on the Atlassian token page.
                    <br />
                    • <b>Classic API token</b> (no scopes selected at creation) — simplest path. Fill in your{" "}
                    <b>email</b> and the token; leave Cloud ID blank. Auth uses Basic against your tenant URL.
                    The token inherits your Jira permissions — you need <b>Browse Projects</b> on the projects
                    whose issues you want to enrich.<br />
                    • <b>Scoped API token</b> (scopes picked at creation) — leave email <b>blank</b>, fill in
                    Cloud ID (instructions appear below the form). SquadFlow routes through{" "}
                    <span className="sf-mono">api.atlassian.com/ex/jira/{`{cloudId}`}/…</span>. Required scopes:{" "}
                    <span className="sf-mono">read:jira-work</span> (or the narrower pair{" "}
                    <span className="sf-mono">read:issue:jira</span> + <span className="sf-mono">read:issue-meta:jira</span>).
                  </div>
                </div>
                <div className="sf-jira-grid">
                  <label htmlFor="jira-base">Base URL</label>
                  <input
                    id="jira-base"
                    type="text"
                    placeholder="https://acme.atlassian.net"
                    value={jiraCreds.baseUrl}
                    onChange={(e) => setJiraCreds((c) => ({ ...c, baseUrl: e.target.value }))}
                  />
                  <label htmlFor="jira-email">Email <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>(classic tokens only)</span></label>
                  <input
                    id="jira-email"
                    type="email"
                    placeholder="you@company.com — leave blank for scoped tokens"
                    value={jiraCreds.email}
                    onChange={(e) => setJiraCreds((c) => ({ ...c, email: e.target.value }))}
                  />
                  <label htmlFor="jira-token">API token</label>
                  <input
                    id="jira-token"
                    type="password"
                    placeholder="atatt..."
                    value={jiraCreds.token}
                    onChange={(e) => setJiraCreds((c) => ({ ...c, token: e.target.value }))}
                  />
                  <label htmlFor="jira-cloudid">Cloud ID <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>(scoped tokens only)</span></label>
                  <input
                    id="jira-cloudid"
                    type="text"
                    placeholder="leave blank for classic tokens"
                    value={jiraCreds.cloudId}
                    onChange={(e) => setJiraCreds((c) => ({ ...c, cloudId: e.target.value }))}
                  />
                </div>
                {!jiraCreds.email && (
                  <div className="sf-set-desc" style={{ marginTop: 8 }}>
                    <b>Finding your Cloud ID:</b> open{" "}
                    <span className="sf-mono">{(jiraCreds.baseUrl || "https://YOUR-SITE.atlassian.net").replace(/\/+$/, "")}/_edge/tenant_info</span>{" "}
                    in a browser while signed in — copy the <span className="sf-mono">cloudId</span> value from the JSON response.
                    Required for scoped API tokens because Atlassian's auto-discovery endpoint often refuses them with a bare 401.
                  </div>
                )}
                <div className="sf-jira-actions">
                  <button
                    className="sf-set-btn"
                    onClick={async () => {
                      setJiraTestStatus({ kind: "info", msg: "testing…" });
                      try {
                        const r = await window.jira.test(jiraCreds);
                        setJiraTestStatus({ kind: "ok", msg: `Connected as ${r.displayName}.` });
                        persistJiraCreds(jiraCreds);
                      } catch (e) {
                        setJiraTestStatus({ kind: "err", msg: String(e && e.message || e) });
                      }
                    }}
                    disabled={!jiraCreds.baseUrl || !jiraCreds.token}
                  >Test & save</button>
                  {jiraConfigured && (
                    <button
                      className="sf-set-btn danger"
                      onClick={() => {
                        persistJiraCreds({ baseUrl: "", email: "", token: "" });
                        setJiraTestStatus({ kind: "ok", msg: "Disconnected." });
                      }}
                    >Disconnect</button>
                  )}
                  {jiraTestStatus && (
                    <span className={"sf-set-status " + (jiraTestStatus.kind === "ok" ? "ok" : jiraTestStatus.kind === "err" ? "err" : "")} style={{ marginTop: 0 }}>
                      {jiraTestStatus.msg}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="sf-footer">
              <div className="sf-review" />
              <span className="sf-saving">
                {saveState === "saving" && "saving…"}
                {saveState === "saved" && "saved ✓"}
                {saveState === "error" && "⚠ save failed"}
              </span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={"sf-root" + (settings.darkMode ? "" : " light")} onClick={() => setOpenMenu(null)}>
      <style>{styles}</style>
      {palette}
      <Sidebar view={view} setView={setView} />
      <main className="sf-main">
      <div className="sf-wrap">
        <header>
          <h1 className="sf-h1">SquadFlow</h1>
          <p className="sf-sub">
            Capture everything, separate your action from what you're waiting on, and
            keep one squad from quietly eating all your attention.
          </p>
        </header>

        <hr className="sf-rule" />

        {/* Quick add */}
        <div className="sf-add" onClick={(e) => e.stopPropagation()}>
          <textarea
            className="sf-input"
            rows={1}
            placeholder="What needs doing? (e.g. Review Squad A's API design)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onInput={(e) => autoSize(e.currentTarget)}
            ref={(el) => { addInputRef.current = el; autoSize(el); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                addTask();
              }
              // Cmd/Ctrl+Enter also submits — convenient when multi-line
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                addTask();
              }
            }}
          />
          <input
            className="sf-sel"
            list="sf-squads"
            placeholder="Squad…"
            value={draftSquad}
            onChange={(e) => setDraftSquad(e.target.value)}
            style={{ flex: "0 1 130px" }}
          />
          <datalist id="sf-squads">
            {squads.map((s) => <option key={s} value={s} />)}
          </datalist>
          <select className="sf-sel" value={draftBucket} onChange={(e) => setDraftBucket(e.target.value)}>
            {BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <button className="sf-btn" onClick={addTask} disabled={!draft.trim()}>Add</button>
        </div>
        <div className="sf-add-hint">
          <b>Enter</b> to add · <b>Shift+Enter</b> for a new line · supports{" "}
          <b>**bold**</b>, <b>*italic*</b>, <b>`code`</b>, and links
        </div>

        {/* Filter bar */}
        <div className="sf-filter" onClick={(e) => e.stopPropagation()}>
          <input
            ref={searchInputRef}
            className="sf-filter-search"
            type="search"
            placeholder="Search titles…  ( / )"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setSearchTerm(""); }}
          />
          {squads.length > 0 && (
            <div className="sf-filter-pills">
              {squads.map((s) => {
                const on = squadFilter.has(s);
                return (
                  <button
                    key={s}
                    className={"sf-filter-pill" + (on ? " active" : "")}
                    style={on ? { background: squadColor(s) } : undefined}
                    onClick={() => toggleSquadFilter(s)}
                  >{s}</button>
                );
              })}
            </div>
          )}
          <label className="sf-filter-toggle">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
            />
            hide done
          </label>
          {filtersActive && (
            <>
              <span className="sf-filter-count">
                {filteredVisibleCount}/{activeTasks.length} shown
              </span>
              <button className="sf-filter-clear" onClick={clearFilters}>clear</button>
            </>
          )}
        </div>

        {/* Buckets */}
        <div className="sf-grid">
          {BUCKETS.map((bucket) => {
            const allInBucket = activeTasks.filter((t) => t.bucket === bucket.id);
            const items = allInBucket.filter(matchesFilters);
            const filteredOut = allInBucket.length - items.length;
            const openN = items.filter((t) => !t.done).length;
            const cap = bucket.capped ? settings.todayCap : null;
            const over = cap != null && openN > cap;
            return (
              <section
                className={"sf-col" + (dropBucket === bucket.id && !dropBeforeId ? " drop-target" : "")}
                key={bucket.id}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropBucket(bucket.id);
                  setDropBeforeId(null);
                }}
                onDragLeave={(e) => {
                  // Only clear when leaving the column entirely, not when moving onto a child.
                  if (e.currentTarget.contains(e.relatedTarget)) return;
                  if (dropBucket === bucket.id) setDropBucket(null);
                }}
                onDrop={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  moveTask(dragId, bucket.id, dropBeforeId);
                  setDragId(null); setDropBucket(null); setDropBeforeId(null);
                }}
              >
                <div className="sf-col-head">
                  <span className="sf-col-title">{bucket.label}</span>
                  <span className={"sf-col-count" + (over ? " over" : "")}>
                    {openN}{cap != null ? ` / ${cap}` : ""} open
                  </span>
                </div>
                <div className="sf-col-hint">
                  {bucket.hint}{bucket.capped ? ` · max ${cap}` : ""}
                </div>

                {over && (
                  <div className="sf-cap-warn">
                    You've got {openN} things in Today. Pick the {cap} that truly must move —
                    push the rest to This Week.
                  </div>
                )}

                {items.length === 0 && (
                  <p className="sf-empty">
                    {allInBucket.length === 0
                      ? "Nothing here yet."
                      : `Nothing matches the filter — ${filteredOut} hidden.`}
                  </p>
                )}
                {items.length > 0 && filteredOut > 0 && (
                  <div className="sf-col-hint" style={{ marginTop: -4, marginBottom: 8 }}>
                    {filteredOut} hidden by filter
                  </div>
                )}

                {items.map((t) => {
                  const due = t.chaseDate && t.chaseDate <= today;
                  const isDragging = dragId === t.id;
                  const showDropLine = dropBeforeId === t.id && dragId && dragId !== t.id;
                  return (
                    <div
                      className={
                        "sf-task" + (t.done ? " done" : "") +
                        (isDragging ? " dragging" : "") +
                        (showDropLine ? " drop-before" : "") +
                        (flashTaskId === t.id ? " flash" : "")
                      }
                      key={t.id}
                      data-task-id={t.id}
                      draggable={editingId !== t.id && editingSquadId !== t.id}
                      onDragStart={(e) => {
                        setDragId(t.id);
                        e.dataTransfer.effectAllowed = "move";
                        try { e.dataTransfer.setData("text/plain", t.id); } catch {}
                      }}
                      onDragEnd={() => { setDragId(null); setDropBucket(null); setDropBeforeId(null); }}
                      onDragOver={(e) => {
                        if (!dragId || dragId === t.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                        setDropBucket(bucket.id);
                        setDropBeforeId(t.id);
                      }}
                      onDrop={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        e.stopPropagation();
                        moveTask(dragId, bucket.id, t.id === dragId ? null : t.id);
                        setDragId(null); setDropBucket(null); setDropBeforeId(null);
                      }}
                    >
                      <span className="sf-grip" title="Drag to reorder">⋮⋮</span>
                      <button
                        className={"sf-check" + (t.done ? " on" : "")}
                        onClick={() => update(t.id, { done: !t.done })}
                        title="Mark done"
                      >{t.done ? "✓" : ""}</button>

                      <div className="sf-task-body">
                        {editingId === t.id ? (
                          <textarea
                            autoFocus
                            className="sf-task-edit"
                            rows={1}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onInput={(e) => autoSize(e.currentTarget)}
                            ref={(el) => { if (el && editingId === t.id) autoSize(el); }}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                commitEdit();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div
                            className="sf-task-title"
                            onClick={(e) => {
                              // Don't enter edit mode when the user clicks a link inside.
                              if (e.target.tagName === "A") return;
                              e.stopPropagation();
                              startEdit(t);
                            }}
                            title="Click to edit · Shift+Enter for newline"
                            dangerouslySetInnerHTML={{ __html: renderTitle(t.title, trimmedSearch) }}
                          />
                        )}
                        <div className="sf-meta" onClick={(e) => e.stopPropagation()}>
                          {editingSquadId === t.id ? (
                            <input
                              autoFocus
                              className="sf-chip-edit"
                              list="sf-squads"
                              placeholder="squad"
                              value={editSquadDraft}
                              onChange={(e) => setEditSquadDraft(e.target.value)}
                              onBlur={commitSquadEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); commitSquadEdit(); }
                                else if (e.key === "Escape") { e.preventDefault(); cancelSquadEdit(); }
                              }}
                            />
                          ) : t.squad ? (
                            <button
                              className="sf-chip sf-chip-squad"
                              style={{ background: squadColor(t.squad) }}
                              onClick={() => startSquadEdit(t)}
                              title="Click to edit squad"
                            >{t.squad}</button>
                          ) : (
                            <button
                              className="sf-chip-squad-add"
                              onClick={() => startSquadEdit(t)}
                              title="Tag with a squad"
                            >+ squad</button>
                          )}
                          {t.jira && t.jira.key && (
                            <a
                              className={
                                "sf-chip-jira" +
                                (t.jira.statusCategory ? " cat-" + t.jira.statusCategory : "") +
                                (jiraLoadingId === t.id ? " loading" : "")
                              }
                              href={t.jira.url || "#"}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => { if (!t.jira.url) e.preventDefault(); }}
                              title={
                                t.jira.error
                                  ? `Couldn't sync: ${t.jira.error}`
                                  : t.jira.summary || "Open in Jira"
                              }
                            >
                              <span className="sf-jira-key">{t.jira.key}</span>
                              {t.jira.status && <span className="sf-jira-status">· {t.jira.status}</span>}
                              <button
                                className="sf-jira-refresh"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  enrichWithJira(t.id, t.jira.key, t.jira.url);
                                }}
                                title="Refresh from Jira"
                                disabled={jiraLoadingId === t.id}
                              >↻</button>
                            </a>
                          )}
                          {bucket.id === "waiting" && (
                            <>
                              <input
                                className="sf-chip sf-chip-person"
                                style={{ width: 90 }}
                                placeholder="who?"
                                value={t.person || ""}
                                onChange={(e) => update(t.id, { person: e.target.value })}
                              />
                              <input
                                type="date"
                                className={"sf-chip sf-chip-date" + (due ? " due" : "")}
                                value={t.chaseDate || ""}
                                onChange={(e) => update(t.id, { chaseDate: e.target.value })}
                                title="Chase by"
                              />
                            </>
                          )}
                        </div>
                      </div>

                      <div className="sf-actions">
                        {t.done && (
                          <button
                            className="sf-mini"
                            onClick={() => archive(t.id)}
                            title="Archive"
                          >archive</button>
                        )}
                        <div className="sf-move" onClick={(e) => e.stopPropagation()}>
                          <button className="sf-mini" onClick={() => setOpenMenu(openMenu === t.id ? null : t.id)}>
                            move ▾
                          </button>
                          {openMenu === t.id && (
                            <div className="sf-move-menu">
                              {BUCKETS.filter((b) => b.id !== bucket.id).map((b) => (
                                <button
                                  key={b.id}
                                  className="sf-move-item"
                                  onClick={() => { update(t.id, { bucket: b.id }); setOpenMenu(null); }}
                                >→ {b.label}</button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className="sf-mini"
                          onClick={() => {
                            const preview = t.title.length > 60 ? t.title.slice(0, 57) + "…" : t.title;
                            if (window.confirm(`Delete this task?\n\n"${preview}"`)) remove(t.id);
                          }}
                          title="Delete"
                        >✕</button>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>

        {/* Cross-squad balance */}
        {settings.showBalance && balance.length > 0 && (
          <div className="sf-balance">
            <div className="sf-balance-title">Where your attention is going</div>
            <div className="sf-balance-sub">
              Open items per squad. If one bar dwarfs the others, ask whether that's
              the highest-leverage place for you — or just the loudest.
            </div>
            {balance.map((row) => (
              <div className="sf-bar-row" key={row.name}>
                <div className="sf-bar-label" title={row.name}>{row.name}</div>
                <div className="sf-bar-track">
                  <div
                    className="sf-bar-fill"
                    style={{
                      width: `${(row.n / maxBalance) * 100}%`,
                      background: row.name.startsWith("—") ? "var(--ink-faint)" : squadColor(row.name),
                    }}
                  />
                </div>
                <div className="sf-bar-num">{row.n}</div>
              </div>
            ))}
          </div>
        )}

        {/* Footer: review ritual + reset */}
        <div className="sf-footer">
          <div className="sf-review">
            <b>The ritual that makes it work:</b><br />
            Morning — set your ≤3, scan Waiting On, chase anyone about to block you.<br />
            End of day — clear done, move things, glance at the balance bars.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="sf-saving">
              {saveState === "saving" && "saving…"}
              {saveState === "saved" && "saved ✓"}
              {saveState === "error" && "⚠ save failed"}
            </span>
            {doneNotArchivedCount > 0 && (
              <button
                className="sf-reset"
                onClick={archiveAllDone}
                title="Move all completed tasks to the archive"
              >Archive done ({doneNotArchivedCount})</button>
            )}
            <button
              className="sf-reset"
              onClick={() => { if (window.confirm("Clear all tasks? This can't be undone.")) setTasks([]); }}
            >Reset board</button>
          </div>
        </div>
      </div>
      </main>
    </div>
  );
}

function Sidebar({ view, setView }) {
  return (
    <nav className="sf-side">
      <button
        className={"sf-nav" + (view === "board" ? " active" : "")}
        onClick={() => setView("board")}
        title="Board"
        aria-label="Board"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      </button>
      <button
        className={"sf-nav" + (view === "archive" ? " active" : "")}
        onClick={() => setView("archive")}
        title="Archive"
        aria-label="Archive"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
          <path d="M10 12h4" />
        </svg>
      </button>
      <div className="sf-side-spacer" />
      <button
        className={"sf-nav" + (view === "settings" ? " active" : "")}
        onClick={() => setView("settings")}
        title="Settings"
        aria-label="Settings"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
    </nav>
  );
}
