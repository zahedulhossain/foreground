export const styles = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

.sf-root { --bg:#1a1714; --panel:#262019; --panel-2:#322a20; --line:#403828; --ink:#f1ebdf; --ink-dim:#cabfac; --ink-faint:#988c76; --accent:#e3a44b; --danger:#cf6a4e; --success:#8aab6f; --side-bg:#151210; --btn-ink:#1a1714; --warn-bg:rgba(207,106,78,.14); --warn-border:rgba(207,106,78,.4); --warn-ink:#e6a890; --team-hover:rgba(227,164,75,.08); }

/* Theme A — Refined Sepia */
.sf-root.theme-a { --bg:#1a1714; --panel:#262019; --panel-2:#322a20; --line:#403828; --ink:#f1ebdf; --ink-dim:#cabfac; --ink-faint:#988c76; --accent:#e3a44b; --danger:#cf6a4e; --success:#8aab6f; --side-bg:#151210; --btn-ink:#1a1714; --warn-bg:rgba(207,106,78,.14); --warn-border:rgba(207,106,78,.4); --warn-ink:#e6a890; --team-hover:rgba(227,164,75,.08); }
.sf-root.theme-a.light { --bg:#f4eee2; --panel:#fffdf8; --panel-2:#f2e9d8; --line:#ddd2bd; --ink:#2a2419; --ink-dim:#6a6052; --ink-faint:#9a9080; --accent:#bd7a22; --danger:#a64a30; --success:#5a7a42; --side-bg:#e9e0cd; --btn-ink:#fffaf0; --warn-bg:rgba(166,74,48,.08); --warn-border:rgba(166,74,48,.35); --warn-ink:#8a3d27; --team-hover:rgba(189,122,34,.08); }

/* Theme B — Cool Slate */
.sf-root.theme-b { --bg:#13151a; --panel:#1c2029; --panel-2:#262c38; --line:#343c4a; --ink:#e7ebf2; --ink-dim:#b3bccb; --ink-faint:#838e9f; --accent:#5b9ee0; --danger:#e07060; --success:#56b793; --side-bg:#101218; --btn-ink:#0e1014; --warn-bg:rgba(224,112,96,.14); --warn-border:rgba(224,112,96,.4); --warn-ink:#eaa093; --team-hover:rgba(91,158,224,.1); }
.sf-root.theme-b.light { --bg:#f3f5f9; --panel:#ffffff; --panel-2:#eef1f6; --line:#dde2ea; --ink:#1f2733; --ink-dim:#5d6675; --ink-faint:#929aa8; --accent:#2f7fce; --danger:#cf5240; --success:#2f9670; --side-bg:#e7ebf2; --btn-ink:#ffffff; --warn-bg:rgba(207,82,64,.08); --warn-border:rgba(207,82,64,.35); --warn-ink:#9a3d2e; --team-hover:rgba(47,127,206,.08); }

/* Theme C — Charcoal + Teal */
.sf-root.theme-c { --bg:#161617; --panel:#1f1f21; --panel-2:#2a2a2d; --line:#39393d; --ink:#ededee; --ink-dim:#b6b6bc; --ink-faint:#8c8c93; --accent:#3fb8a6; --danger:#e07a5f; --success:#7fb069; --side-bg:#121213; --btn-ink:#0f0f10; --warn-bg:rgba(224,122,95,.14); --warn-border:rgba(224,122,95,.4); --warn-ink:#eaa48f; --team-hover:rgba(63,184,166,.1); }
.sf-root.theme-c.light { --bg:#f4f4f5; --panel:#ffffff; --panel-2:#ececee; --line:#dcdce0; --ink:#1d1d1f; --ink-dim:#5c5c62; --ink-faint:#909096; --accent:#1f9e8c; --danger:#cf5a3f; --success:#558040; --side-bg:#e7e7e9; --btn-ink:#ffffff; --warn-bg:rgba(207,90,63,.08); --warn-border:rgba(207,90,63,.35); --warn-ink:#9a3f2a; --team-hover:rgba(31,158,140,.08); }
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
.sf-set-status.ok{ color:var(--success); }
.sf-set-status.err{ color:var(--danger); }

.sf-archive-empty{ color:var(--ink-faint); font-size:13px; font-style:italic; padding:32px 0; text-align:center; }

.sf-rev-stats{ display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-top:8px; }
@media(max-width:760px){ .sf-rev-stats{ grid-template-columns:repeat(2, 1fr); } }
.sf-rev-stat{ background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
.sf-rev-stat-num{ font-family:'Fraunces',serif; font-weight:600; font-size:28px; letter-spacing:-0.02em; line-height:1; color:var(--ink); }
.sf-rev-stat-num.danger{ color:var(--danger); }
.sf-rev-stat-num.accent{ color:var(--accent); }
.sf-rev-stat-label{ font-size:11.5px; color:var(--ink-faint); margin-top:6px; font-family:'IBM Plex Mono',monospace; letter-spacing:.02em; }
.sf-rev-stat-hint{ font-size:11px; color:var(--ink-faint); margin-top:8px; line-height:1.4; }

.sf-rev-section{ margin-top:28px; }
.sf-rev-title{ font-family:'Fraunces',serif; font-weight:600; font-size:18px; letter-spacing:-0.01em; }
.sf-rev-sub{ font-size:11.5px; color:var(--ink-faint); margin-top:2px; margin-bottom:12px; }
.sf-rev-row{ display:flex; gap:10px; align-items:flex-start; padding:8px 10px; border-radius:8px; cursor:pointer; }
.sf-rev-row:hover{ background:var(--panel); }
.sf-rev-row .sf-rev-body{ flex:1; min-width:0; }
.sf-rev-row .sf-rev-task-title{ font-size:13.5px; line-height:1.4; word-break:break-word; }
.sf-rev-task-title a{ color:var(--accent); text-decoration:none; border-bottom:1px dashed var(--accent); }
.sf-rev-row .sf-rev-meta{ font-size:11px; color:var(--ink-faint); margin-top:4px; font-family:'IBM Plex Mono',monospace; }
.sf-rev-row .sf-rev-age{ flex:0 0 auto; font-size:11px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; padding-top:2px; min-width:64px; text-align:right; }
.sf-rev-row .sf-rev-age.warn{ color:var(--warn-ink); }
.sf-rev-row .sf-rev-age.danger{ color:var(--danger); }
.sf-rev-day{ font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--ink-faint); text-transform:uppercase; letter-spacing:.08em; margin:12px 0 4px; }
.sf-rev-empty{ font-size:12.5px; color:var(--ink-faint); font-style:italic; padding:6px 10px; }
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
.sf-chip-jira.cat-done .sf-jira-status{ color:var(--success); }
.sf-chip-jira.cat-indeterminate .sf-jira-status{ color:var(--accent); }
.sf-chip-jira .sf-jira-refresh{ background:transparent; border:0; color:var(--ink-faint); cursor:pointer; font-size:11px; padding:0 0 0 4px; line-height:1; font-family:inherit; }
.sf-chip-jira .sf-jira-refresh:hover{ color:var(--accent); }
.sf-chip-jira.loading{ opacity:.6; }

.sf-jira-grid{ display:grid; grid-template-columns:140px 1fr; gap:10px 14px; align-items:center; margin-top:6px; }
.sf-jira-grid label{ font-size:12.5px; color:var(--ink-dim); }
.sf-jira-grid input{ background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit; outline:none; }
.sf-jira-grid input:focus{ border-color:var(--accent); }
.sf-jira-actions{ display:flex; gap:8px; align-items:center; margin-top:14px; flex-wrap:wrap; }

.sf-jp-section{ margin-top:24px; }
.sf-jp-head{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.sf-jp-title{ font-family:'Fraunces',serif; font-weight:600; font-size:18px; letter-spacing:-0.01em; }
.sf-jp-sub{ font-size:11.5px; color:var(--ink-faint); margin-top:2px; margin-bottom:12px; line-height:1.45; }
.sf-jp-card{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
.sf-jp-searchbar{ display:flex; gap:8px; align-items:stretch; flex-wrap:wrap; }
.sf-jp-jql{ flex:1 1 360px; min-width:0; background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:8px; padding:9px 11px; font-size:12.5px; font-family:'IBM Plex Mono',monospace; outline:none; }
.sf-jp-jql:focus{ border-color:var(--accent); }
.sf-jp-presets{ display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
.sf-jp-preset{ font-size:11px; padding:4px 10px; border-radius:20px; border:1px solid var(--line); background:transparent; color:var(--ink-dim); cursor:pointer; font-family:inherit; }
.sf-jp-preset:hover{ border-color:var(--accent); color:var(--accent); }
.sf-jp-results{ margin-top:14px; max-height:420px; overflow-y:auto; }
.sf-jp-row{ display:flex; gap:10px; align-items:flex-start; padding:9px 10px; border-radius:8px; cursor:pointer; }
.sf-jp-row:hover{ background:var(--panel-2); }
.sf-jp-row.linked{ opacity:.5; cursor:default; }
.sf-jp-row.linked:hover{ background:transparent; }
.sf-jp-check{ flex:0 0 auto; width:16px; height:16px; border-radius:4px; border:1.5px solid var(--ink-faint); margin-top:2px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; }
.sf-jp-check.on{ background:var(--accent); border-color:var(--accent); color:var(--btn-ink); }
.sf-jp-row-body{ flex:1; min-width:0; }
.sf-jp-row-title{ font-size:13.5px; line-height:1.4; word-break:break-word; }
.sf-jp-row-title a{ color:var(--accent); text-decoration:none; border-bottom:1px dashed var(--accent); }
.sf-jp-row-meta{ font-size:11px; color:var(--ink-faint); margin-top:3px; font-family:'IBM Plex Mono',monospace; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.sf-jp-key{ color:var(--ink-dim); font-weight:600; }
.sf-jp-importbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:14px; padding-top:14px; border-top:1px solid var(--line); }
.sf-jp-importbar .sf-jp-grow{ margin-left:auto; }
.sf-jp-statusdot{ display:inline-block; width:7px; height:7px; border-radius:50%; flex:0 0 auto; background:var(--ink-faint); }
.sf-jp-statusdot.cat-done{ background:var(--success); }
.sf-jp-statusdot.cat-indeterminate{ background:var(--accent); }
.sf-jp-statusdot.cat-new{ background:var(--ink-faint); }
.sf-jp-drift{ background:var(--warn-bg); border:1px solid var(--warn-border); border-radius:10px; padding:10px 12px; margin-bottom:10px; }
.sf-jp-drift-title{ font-size:12.5px; color:var(--warn-ink); font-weight:500; margin-bottom:8px; }
.sf-jp-drift-row{ display:flex; gap:10px; align-items:center; padding:6px 0; }
.sf-jp-drift-row .sf-jp-row-body{ flex:1; }
.sf-jp-empty{ color:var(--ink-faint); font-size:12.5px; font-style:italic; padding:14px 4px; }
.sf-jp-notready{ color:var(--ink-faint); font-size:13px; padding:20px; text-align:center; line-height:1.6; }

.sf-tp-grid{ display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-top:8px; }
@media(max-width:820px){ .sf-tp-grid{ grid-template-columns:1fr; } }
.sf-tp-card{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
.sf-tp-card-head{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.sf-tp-name{ font-family:'Fraunces',serif; font-weight:600; font-size:17px; letter-spacing:-0.01em; }
.sf-tp-src{ font-size:10.5px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; }
.sf-tp-statusbar{ display:flex; height:10px; border-radius:6px; overflow:hidden; margin:12px 0 6px; background:var(--panel-2); }
.sf-tp-seg{ height:100%; }
.sf-tp-seg.new{ background:var(--ink-faint); }
.sf-tp-seg.indeterminate{ background:var(--accent); }
.sf-tp-seg.done{ background:var(--success); }
.sf-tp-legend{ display:flex; gap:12px; font-size:11px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; flex-wrap:wrap; }
.sf-tp-sprint{ margin-top:12px; padding:10px 12px; background:var(--panel-2); border-radius:8px; }
.sf-tp-sprint-head{ display:flex; justify-content:space-between; gap:8px; font-size:12px; color:var(--ink-dim); margin-bottom:6px; }
.sf-tp-sprint-track{ height:8px; background:var(--bg); border-radius:5px; overflow:hidden; }
.sf-tp-sprint-fill{ height:100%; background:var(--success); border-radius:5px; }
.sf-tp-people{ margin-top:12px; }
.sf-tp-person{ display:flex; align-items:center; gap:10px; padding:5px 0; }
.sf-tp-person-name{ font-size:12.5px; width:140px; flex:0 0 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sf-tp-person-name.unassigned{ color:var(--ink-faint); font-style:italic; }
.sf-tp-person-track{ flex:1; height:10px; background:var(--panel-2); border-radius:5px; overflow:hidden; }
.sf-tp-person-fill{ height:100%; background:var(--accent); border-radius:5px; }
.sf-tp-person-num{ width:34px; flex:0 0 auto; text-align:right; font-size:12px; font-family:'IBM Plex Mono',monospace; color:var(--ink-dim); }
.sf-tp-foot{ display:flex; justify-content:space-between; gap:8px; margin-top:12px; font-size:11px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; }
.sf-tp-err{ font-size:12px; color:var(--danger); margin-top:8px; line-height:1.4; }
.sf-tp-degraded{ font-size:11px; color:var(--warn-ink); margin-top:8px; }
.sf-tp-cfg-row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:8px 0; border-bottom:1px solid var(--line); transition:opacity .12s ease; }
.sf-tp-cfg-row:last-child{ border-bottom:0; }
.sf-tp-cfg-row.dragging{ opacity:.4; }
.sf-tp-cfg-row.drop-before{ box-shadow:inset 0 2px 0 var(--accent); }
.sf-tp-cfg-grip{ flex:0 0 auto; color:var(--ink-faint); font-size:12px; cursor:grab; user-select:none; letter-spacing:-1px; line-height:1; }
.sf-tp-cfg-grip:hover{ color:var(--ink-dim); }
.sf-tp-cfg-name{ font-size:13px; font-weight:500; min-width:120px; }
.sf-tp-cfg-def{ font-size:11.5px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sf-tp-addbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px solid var(--line); }
.sf-tp-addbar input, .sf-tp-addbar select,
.sf-tp-cfg-row input, .sf-tp-cfg-row select{ background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit; outline:none; }
.sf-tp-addbar input:focus, .sf-tp-addbar select:focus,
.sf-tp-cfg-row input:focus, .sf-tp-cfg-row select:focus{ border-color:var(--accent); }
.sf-tp-controls{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:4px 0 12px; }
.sf-tp-window{ display:flex; gap:8px; align-items:center; flex-wrap:nowrap; min-height:36px; }
.sf-tp-statusmap{ margin-top:8px; max-height:300px; overflow-y:auto; border:1px solid var(--line); border-radius:10px; padding:6px 10px; }
.sf-tp-status-row{ display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--line); }
.sf-tp-status-row:last-child{ border-bottom:0; }
.sf-tp-status-name{ flex:1; min-width:0; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sf-tp-status-def{ font-size:10.5px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; flex:0 0 auto; }
.sf-tp-status-sel{ flex:0 0 auto; background:var(--panel-2); border:1px solid var(--line); color:var(--ink); border-radius:6px; padding:5px 8px; font-size:12px; font-family:inherit; outline:none; }
.sf-tp-status-sel.overridden{ border-color:var(--accent); }
.sf-tp-asis{ display:inline-flex; align-items:center; gap:5px; font-size:11.5px; color:var(--ink-dim); cursor:pointer; user-select:none; flex:0 0 auto; }
.sf-tp-asis input{ accent-color:var(--accent); cursor:pointer; }
.sf-tp-asis-tag{ color:var(--accent); font-family:'IBM Plex Mono',monospace; }

.sf-tp-tabs{ display:inline-flex; gap:2px; background:var(--panel-2); border:1px solid var(--line); border-radius:9px; padding:3px; margin-top:28px; margin-bottom:4px; }
.sf-tp-tab{ background:transparent; border:0; color:var(--ink-dim); font-size:13px; font-family:inherit; padding:6px 16px; border-radius:7px; cursor:pointer; }
.sf-tp-tab:hover{ color:var(--ink); }
.sf-tp-tab.active{ background:var(--panel); color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,.2); }

.sf-kpi-cfg-row{ display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--line); }
.sf-kpi-cfg-row:last-child{ border-bottom:0; }
.sf-kpi-cfg-label{ font-size:13px; font-weight:500; min-width:130px; flex:0 0 auto; }
.sf-kpi-cfg-hint{ font-size:11.5px; color:var(--ink-faint); flex:1; min-width:0; }
.sf-kpi-cfg-unit{ font-size:11.5px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; flex:0 0 auto; }
.sf-kpi-row{ display:flex; align-items:center; gap:9px; padding:6px 0; }
.sf-kpi-dot{ flex:0 0 auto; width:9px; height:9px; border-radius:50%; background:var(--ink-faint); }
.sf-kpi-dot.met{ background:#7c9a6d; }
.sf-kpi-dot.at-risk{ background:var(--accent); }
.sf-kpi-dot.missed{ background:var(--danger); }
.sf-kpi-dot.na{ background:var(--ink-faint); opacity:.4; }
.sf-kpi-name{ font-size:13px; flex:1; min-width:0; }
.sf-kpi-val{ font-size:12.5px; color:var(--ink-dim); font-family:'IBM Plex Mono',monospace; flex:0 0 auto; }
.sf-kpi-breach{ font-size:11px; color:var(--danger); margin:2px 0 0 18px; line-height:1.4; }

.sf-tp-seg, .sf-tp-legend span{ cursor:default; }
.sf-tp-seg.clickable{ cursor:pointer; }
.sf-tp-seg.clickable:hover{ filter:brightness(1.25); }
.sf-tp-legend .lg{ cursor:pointer; padding:1px 4px; border-radius:4px; }
.sf-tp-legend .lg:hover{ background:var(--panel-2); color:var(--ink); }

.sf-dw-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:90; display:flex; justify-content:flex-end; }
.sf-dw{ width:min(460px, 92vw); background:var(--panel); border-left:1px solid var(--line); height:100vh; display:flex; flex-direction:column; box-shadow:-12px 0 40px rgba(0,0,0,.35); animation:sf-dw-in .16s ease-out; }
@keyframes sf-dw-in { from{ transform:translateX(20px); opacity:.6; } to{ transform:translateX(0); opacity:1; } }
.sf-dw-head{ padding:16px 18px; border-bottom:1px solid var(--line); display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.sf-dw-title{ font-family:'Fraunces',serif; font-weight:600; font-size:17px; letter-spacing:-0.01em; }
.sf-dw-sub{ font-size:11.5px; color:var(--ink-faint); margin-top:4px; font-family:'IBM Plex Mono',monospace; }
.sf-dw-close{ background:transparent; border:0; color:var(--ink-faint); font-size:18px; cursor:pointer; line-height:1; padding:2px 6px; border-radius:6px; }
.sf-dw-close:hover{ background:var(--panel-2); color:var(--ink); }
.sf-dw-list{ overflow-y:auto; flex:1; padding:8px; }
.sf-dw-row{ display:flex; gap:10px; align-items:flex-start; padding:9px 10px; border-radius:8px; text-decoration:none; }
.sf-dw-row:hover{ background:var(--panel-2); }
.sf-dw-dot{ flex:0 0 auto; width:7px; height:7px; border-radius:50%; margin-top:6px; }
.sf-dw-dot.cat-new{ background:var(--ink-faint); }
.sf-dw-dot.cat-indeterminate{ background:var(--accent); }
.sf-dw-dot.cat-done{ background:var(--success); }
.sf-dw-body{ flex:1; min-width:0; }
.sf-dw-key{ font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:var(--accent); }
.sf-dw-summary{ font-size:13px; color:var(--ink); line-height:1.4; margin-top:2px; word-break:break-word; }
.sf-dw-meta{ font-size:11px; color:var(--ink-faint); margin-top:3px; font-family:'IBM Plex Mono',monospace; }
.sf-dw-empty{ color:var(--ink-faint); font-size:12.5px; font-style:italic; padding:20px; text-align:center; }
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

.sf-notes{ margin-top:8px; padding:8px 10px; border-left:2px solid var(--line); background:var(--bg); border-radius:0 6px 6px 0; }
.sf-notes:hover{ border-left-color:var(--accent); }
.sf-notes-rendered{ font-size:12.5px; line-height:1.55; color:var(--ink-dim); white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere; cursor:text; }
.sf-notes-rendered a{ color:var(--accent); text-decoration:none; border-bottom:1px dashed var(--accent); }
.sf-notes-rendered code{ background:var(--panel); border:1px solid var(--line); border-radius:4px; padding:0 4px; font-family:'IBM Plex Mono',monospace; font-size:12px; }
.sf-notes-rendered strong{ font-weight:600; color:var(--ink); }
.sf-notes-rendered em{ font-style:italic; }
.sf-notes-rendered mark{ background:var(--accent); color:var(--btn-ink); padding:0 2px; border-radius:2px; }
.sf-notes-edit{ width:100%; background:var(--panel); border:1px solid var(--accent); color:var(--ink); border-radius:6px; padding:6px 8px; font-size:12.5px; font-family:inherit; outline:none; line-height:1.55; resize:none; min-height:60px; max-height:320px; overflow-y:auto; white-space:pre-wrap; }
.sf-notes-hint{ font-size:10.5px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace; margin-top:4px; }
.sf-notes-empty-hint{ color:var(--ink-faint); font-style:italic; font-size:12.5px; cursor:text; }
.sf-mini.has-notes{ color:var(--accent); }

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
.sf-col.drop-target{ background:var(--team-hover); border-color:var(--accent); }
.sf-grip{ flex:0 0 auto; color:var(--ink-faint); font-size:12px; padding:2px 0; cursor:grab; user-select:none; line-height:1; letter-spacing:-1px; }
.sf-grip:hover{ color:var(--ink-dim); }
.sf-check{ flex:0 0 auto; width:18px; height:18px; border-radius:5px; border:1.5px solid var(--ink-faint); background:transparent; cursor:pointer; margin-top:2px; display:flex; align-items:center; justify-content:center; padding:0; }
.sf-check.on{ background:var(--accent); border-color:var(--accent); color:var(--btn-ink); font-size:12px; font-weight:700; }
.sf-task-body{ flex:1; min-width:0; }
.sf-task-title{ font-size:14px; line-height:1.5; word-break:break-word; overflow-wrap:anywhere; white-space:pre-wrap; cursor:text; border-radius:4px; padding:1px 3px; margin:-1px -3px; }
.sf-task-title:hover{ background:var(--team-hover); }
.sf-task-title a{ color:var(--accent); text-decoration:none; border-bottom:1px dashed var(--accent); }
.sf-task-title a:hover{ filter:brightness(1.15); }
.sf-task-title code{ background:var(--panel); border:1px solid var(--line); border-radius:4px; padding:0 4px; font-family:'IBM Plex Mono',monospace; font-size:12.5px; }
.sf-task-title strong{ font-weight:600; color:var(--ink); }
.sf-task-title em{ font-style:italic; color:var(--ink-dim); }
.sf-task-edit{ width:100%; background:var(--panel); border:1px solid var(--accent); color:var(--ink); border-radius:6px; padding:4px 7px; font-size:14px; font-family:inherit; outline:none; line-height:1.5; resize:none; min-height:28px; max-height:240px; overflow-y:auto; white-space:pre-wrap; word-break:break-word; }
.sf-meta{ display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:6px; }
.sf-chip{ font-size:10.5px; padding:2px 7px; border-radius:20px; font-family:'IBM Plex Mono',monospace; letter-spacing:.02em; }
.sf-chip-team{ color:var(--btn-ink); font-weight:500; cursor:pointer; border:0; padding:2px 7px; font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.02em; }
.sf-chip-team:hover{ filter:brightness(1.1); }
.sf-chip-team-add{ background:transparent; border:1px dashed var(--line); color:var(--ink-faint); cursor:pointer; padding:1px 7px; font-size:10.5px; border-radius:20px; font-family:'IBM Plex Mono',monospace; letter-spacing:.02em; }
.sf-chip-team-add:hover{ border-color:var(--accent); color:var(--accent); }
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

.sf-theme-opts{ display:flex; gap:10px; flex-wrap:wrap; margin-top:4px; }
.sf-theme-opt{ flex:1 1 150px; min-width:140px; text-align:left; background:var(--panel-2); border:1px solid var(--line); border-radius:11px; padding:12px 13px; cursor:pointer; font-family:inherit; color:var(--ink); transition:border-color .15s ease, background .15s ease; }
.sf-theme-opt:hover{ border-color:var(--ink-faint); }
.sf-theme-opt.active{ border-color:var(--accent); background:var(--team-hover); }
.sf-theme-swatch{ display:flex; gap:5px; margin-bottom:9px; }
.sf-theme-swatch span{ width:20px; height:20px; border-radius:5px; border:1px solid rgba(0,0,0,.18); }
.sf-theme-name{ font-size:13px; font-weight:500; display:flex; align-items:center; gap:6px; }
.sf-theme-name .sf-theme-dot{ width:7px; height:7px; border-radius:50%; background:var(--accent); opacity:0; }
.sf-theme-opt.active .sf-theme-dot{ opacity:1; }
.sf-theme-desc{ font-size:11px; color:var(--ink-faint); margin-top:4px; line-height:1.45; }
`;
