// Pure Team Pulse logic — JQL building, issue classification, and aggregation.
// Everything here takes config (or the specific fields it needs) as arguments
// so it has no dependency on React or the store, and can be unit-tested in
// isolation.

// The done-side JQL clause: rolling "last N days" or a fixed from–to range.
// Range falls back to rolling if either date is missing.
export function doneClause(cfg) {
  if (cfg.doneWindowMode === "range" && cfg.doneWindowFrom && cfg.doneWindowTo) {
    // Quote dates; include the whole end day with an explicit time.
    return `(resolutiondate >= "${cfg.doneWindowFrom}" AND resolutiondate <= "${cfg.doneWindowTo} 23:59")`;
  }
  return `resolutiondate >= -${cfg.doneWindowDays || 14}d`;
}

// Open work is always included; only the done side is windowed.
export function windowJql(cfg) {
  return `(statusCategory != Done OR ${doneClause(cfg)})`;
}

// Wrap a team's raw JQL with the window clause, preserving a trailing ORDER BY.
export function wrapJql(raw, cfg) {
  const parts = String(raw || "").split(/order\s+by/i);
  const base = parts[0].trim();
  const order = parts[1] ? ` ORDER BY ${parts[1].trim()}` : "";
  const body = base ? `(${base}) AND ${windowJql(cfg)}` : windowJql(cfg);
  return body + order;
}

// Human label for the done window, shown on each card's footer.
export function windowLabel(cfg) {
  if (cfg.doneWindowMode === "range" && cfg.doneWindowFrom && cfg.doneWindowTo) {
    return `${cfg.doneWindowFrom}→${cfg.doneWindowTo}`;
  }
  return `${cfg.doneWindowDays || 14}d`;
}

// Story points on an issue, read from the configured custom field. 0 if unset.
export function pointsOf(issue, pointsFieldId) {
  if (!pointsFieldId || !issue.fields) return 0;
  const v = issue.fields[pointsFieldId];
  return typeof v === "number" ? v : 0;
}

// Classify an issue into a Pulse bucket: a per-status-name override if the user
// set one, otherwise the status's own Jira category.
export function statusBucket(issue, statusMap) {
  const map = statusMap || {};
  return map[issue.status] || issue.statusCategory || "new";
}

// Aggregate a flat issue list into the per-team shape the card renders.
//   opts = { usePoints, pointsFieldId, statusMap }
// ── KPI evaluation (point-in-time) ─────────────────────────────────────────
// Higher-is-better status with a 10% at-risk band.
function geStatus(actual, target) {
  if (actual >= target) return "met";
  if (actual >= target * 0.9) return "at-risk";
  return "missed";
}

// In-progress load per person, from the indeterminate bucket.
export function perPersonWip(d, usePoints) {
  const map = new Map();
  ((d.byBucket && d.byBucket.indeterminate) || []).forEach((it) => {
    const name = it.assignee || "Unassigned";
    const cur = map.get(name) || { name, value: 0 };
    cur.value += usePoints ? (it.points || 0) : 1;
    map.set(name, cur);
  });
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

// Evaluate the enabled KPIs for one team's aggregated data. Pure.
export function evaluateTeamKpis(d, targets, usePoints) {
  const out = [];
  if (!d || d.error) return out;
  const t = targets || {};

  if (t.throughput && t.throughput.enabled) {
    const actual = usePoints ? d.donePoints : d.doneCount;
    out.push({ key: "throughput", label: "Throughput", scope: "team",
      actual, target: t.throughput.value, unit: usePoints ? " pts" : "",
      status: geStatus(actual, t.throughput.value) });
  }

  if (t.sprintCompletion && t.sprintCompletion.enabled) {
    if (d.sprint && d.sprint.committed) {
      const pct = Math.round((d.sprint.done / d.sprint.committed) * 100);
      out.push({ key: "sprintCompletion", label: "Sprint completion", scope: "team",
        actual: pct, target: t.sprintCompletion.value, unit: "%",
        status: geStatus(pct, t.sprintCompletion.value) });
    } else {
      out.push({ key: "sprintCompletion", label: "Sprint completion", scope: "team",
        actual: null, target: t.sprintCompletion.value, unit: "%", status: "na" });
    }
  }

  if (t.wip && t.wip.enabled) {
    const lim = t.wip.value;
    const people = perPersonWip(d, usePoints);
    const breaches = people.filter((p) => p.value > lim);
    const near = people.filter((p) => p.value <= lim && p.value > lim * 0.9);
    out.push({ key: "wip", label: "WIP / person", scope: "person",
      target: lim, unit: usePoints ? " pts" : "",
      status: breaches.length ? "missed" : near.length ? "at-risk" : "met",
      breaches });
  }

  if (t.loadBalance && t.loadBalance.enabled) {
    const lim = t.loadBalance.value;
    const loads = (d.assignees || []).map((a) => ({ name: a.name, load: usePoints ? a.points : a.count }));
    const total = loads.reduce((s, x) => s + x.load, 0) || 1;
    const shares = loads.map((x) => ({ name: x.name, pct: Math.round((x.load / total) * 100) }));
    const breaches = shares.filter((s) => s.pct > lim);
    const near = shares.filter((s) => s.pct <= lim && s.pct > lim * 0.9);
    out.push({ key: "loadBalance", label: "Load balance", scope: "person",
      target: lim, unit: "%",
      status: breaches.length ? "missed" : near.length ? "at-risk" : "met",
      breaches: breaches.map((b) => ({ name: b.name, value: b.pct })) });
  }

  return out;
}

export function aggregateTeam(issues, opts) {
  const { usePoints, pointsFieldId, statusMap } = opts;
  const bucket = (it) => statusBucket(it, statusMap);
  const pts = (it) => pointsOf(it, pointsFieldId);

  const open = issues.filter((it) => bucket(it) !== "done");
  const doneRecent = issues.filter((it) => bucket(it) === "done");
  const statusCounts = { new: 0, indeterminate: 0, done: 0 };
  // Slim per-bucket issue lists for the drill-down drawer.
  const byBucket = { new: [], indeterminate: [], done: [] };
  issues.forEach((it) => {
    const c = bucket(it);
    statusCounts[c] = (statusCounts[c] || 0) + 1;
    (byBucket[c] || (byBucket[c] = [])).push({
      key: it.key,
      summary: it.fields ? it.fields.summary : null,
      status: it.status,
      statusCategory: it.statusCategory,
      assignee: it.assignee ? it.assignee.displayName : null,
      points: pts(it),
    });
  });
  const byPerson = new Map();
  open.forEach((it) => {
    const name = it.assignee ? it.assignee.displayName : "Unassigned";
    const cur = byPerson.get(name) || { name, count: 0, points: 0 };
    cur.count += 1;
    cur.points += pts(it);
    byPerson.set(name, cur);
  });
  const assignees = Array.from(byPerson.values()).sort((a, b) =>
    usePoints ? b.points - a.points : b.count - a.count
  );
  return {
    openCount: open.length,
    openPoints: open.reduce((s, it) => s + pts(it), 0),
    doneCount: doneRecent.length,
    donePoints: doneRecent.reduce((s, it) => s + pts(it), 0),
    statusCounts,
    assignees,
    byBucket,
  };
}
