#!/usr/bin/env node
// footnote: Claude Code SessionStart hook (v2 - ambient spaced repetition)
//
// Runs once per session start. Deterministic; owns ALL scheduling and date math.
//   1. Ensures the learning log exists (creates if missing). NEVER overwrites it.
//   2. Keeps rolling backups of the log (last 5) so an accidental edit is recoverable.
//   3. Reads the log (## Seen once / ## Learned) - READ ONLY. Never writes the log.
//   4. Maintains a hidden schedule sidecar (stage + next-due per term). The sidecar
//      is rebuildable from the log, so it is a cache, not precious data.
//   5. Selects up to 3 DUE terms, advances their schedule, and injects:
//        - the per-reply "Learn next" rules (for NEW terms), and
//        - a short session-start REVIEW of the due terms (a gentle recall check).
//   6. Surfaces any term that has graduated so Claude moves it to "## Learned".
//
// Privacy: everything stays on this machine. No network. No telemetry.
// Reliability: silent-fails on every error; never blocks a session; never writes
// the log file itself (only the hidden sidecar + backups).

const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = path.join(os.homedir(), '.claude', 'footnote');
const logPath = process.env.FOOTNOTE_LOG_PATH || path.join(dir, 'learning-log.md');
const baseDir = path.dirname(logPath);          // state + backups live next to the log
const statePath = path.join(baseDir, 'schedule.json');
const flagPath = path.join(dir, 'active');       // mute flag is global (fixed location)
const backupDir = path.join(baseDir, 'backups');

const REVIEW_CAP = 3;                  // max terms surfaced for review per session
const INTERVALS = [1, 3, 7, 21, 60];   // days; index = stage. past the end => graduate.
const MAX_STAGE = INTERVALS.length - 1;
const KEEP_BACKUPS = 5;

const LOG_TEMPLATE = `<!-- footnote learning log · format v2 · lines: "- term (tag) · YYYY-MM-DD" -->
# Footnote: Your Learning Log

Terms Claude has surfaced to you while you work.
- "Seen once" = in the spaced-review rotation: you'll be re-shown it a few times, at growing gaps, until it sticks.
- "Learned" = it survived the rotation (or you said you know it). Parked; not re-surfaced.

## Seen once

## Learned
`;

function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}
function writeAtomic(p, content) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, p);
    return true;
  } catch (e) { return false; }
}

// Extract term keys ("term (tag)") from a "## <section>" block. Tolerates
// "·", "—", "-" separators and a leading "learned". Internal hyphens are safe
// because the trailing-date match is anchored to the end of the line.
function parseTerms(md, section) {
  const out = [];
  if (!md) return out;
  const after = md.split(new RegExp('^##\\s+' + section + '\\s*$', 'm'))[1];
  if (after === undefined) return out;
  const block = after.split(/^##\s+/m)[0];
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*-\s+(.*\S)\s*$/);
    if (!m) continue;
    const key = m[1].replace(/\s*(?:[—·-]\s*)?(?:learned\s+)?\d{4}-\d{2}-\d{2}\s*$/i, '').trim();
    if (key) out.push(key);
  }
  return out;
}

// --- 1. ensure dir + log exist (never overwrite an existing log) -------------
try {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(logPath)) writeAtomic(logPath, LOG_TEMPLATE);
} catch (e) { /* silent */ }

// --- 2. mute check -----------------------------------------------------------
try {
  const flag = readSafe(flagPath);
  if (flag && flag.trim() === 'off') {
    process.stdout.write(
      "FOOTNOTE is installed but muted. Do not append 'Learn next' hints or run reviews. " +
      "Type 'footnote on' to re-enable."
    );
    process.exit(0);
  }
} catch (e) { /* silent */ }

const md = readSafe(logPath);
const t = today();

// --- 3. rolling backup of the log (recovery net) -----------------------------
try {
  if (md) {
    fs.mkdirSync(backupDir, { recursive: true });
    let files = fs.readdirSync(backupDir).filter((f) => f.startsWith('learning-log.')).sort();
    const last = files.length ? readSafe(path.join(backupDir, files[files.length - 1])) : null;
    if (last !== md) {
      writeAtomic(path.join(backupDir, 'learning-log.' + t + '.' + Date.now() + '.bak'), md);
      files = fs.readdirSync(backupDir).filter((f) => f.startsWith('learning-log.')).sort();
      for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
        try { fs.unlinkSync(path.join(backupDir, f)); } catch (e) { /* ignore */ }
      }
    }
  }
} catch (e) { /* silent */ }

// --- 4. load schedule (rebuildable cache) and reconcile with the log ---------
let state = { version: 1, terms: {} };
try {
  const raw = readSafe(statePath);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.terms) state = parsed;
  }
} catch (e) { state = { version: 1, terms: {} }; }

const seen = parseTerms(md, 'Seen once');
const learned = parseTerms(md, 'Learned');
const inLog = new Set([...seen, ...learned]);

for (const term of seen) {
  if (!state.terms[term]) {
    state.terms[term] = { stage: 0, timesSeen: 0, lastSeen: t, nextDue: addDays(t, 1), section: 'seen' };
  } else if (state.terms[term].section !== 'learned') {
    state.terms[term].section = 'seen';
  }
}
for (const term of learned) {
  if (!state.terms[term]) {
    state.terms[term] = { stage: MAX_STAGE + 1, timesSeen: 0, lastSeen: t, nextDue: null, section: 'learned' };
  } else {
    state.terms[term].section = 'learned';
    state.terms[term].nextDue = null;
  }
}

// safety net: terms the schedule knows but the log no longer shows
const orphans = Object.keys(state.terms).filter((k) => !inLog.has(k));

// --- 5. select due terms, advance them, detect graduations -------------------
const due = seen
  .filter((term) => {
    const s = state.terms[term];
    return s && s.section === 'seen' && s.nextDue && s.nextDue <= t;
  })
  .map((term) => ({ term, stage: state.terms[term].stage }))
  .sort((a, b) => (state.terms[a.term].nextDue < state.terms[b.term].nextDue ? -1 : 1))
  .slice(0, REVIEW_CAP);

const graduated = [];
for (const x of due) {
  const s = state.terms[x.term];
  s.timesSeen = (s.timesSeen || 0) + 1;
  s.lastSeen = t;
  if (x.stage >= MAX_STAGE) {
    s.stage = MAX_STAGE + 1;
    s.nextDue = null;
    s.section = 'learned';
    graduated.push(x.term);
  } else {
    s.stage = x.stage + 1;
    s.nextDue = addDays(t, INTERVALS[s.stage]);
  }
}

try {
  const old = readSafe(statePath);
  if (old) writeAtomic(statePath + '.bak', old);
} catch (e) { /* ignore */ }
writeAtomic(statePath, JSON.stringify(state, null, 2));

// --- 6. inject bounded context (rules + <=3 due terms; never the whole log) --
let out =
  'FOOTNOTE MODE ACTIVE - learning companion. Today is ' + t + '.\n' +
  'NEW TERMS (per reply): when a reply uses a dev term, tool, command, or convention a beginner likely does not know yet, end with:\n' +
  '  Learn next: `term1 (tag)`, `term2 (tag)`\n' +
  'Names + a 1-word tag only (e.g. `lockfile (npm)`); no definitions; max 2; omit when nothing qualifies; skip trivial replies. ' +
  'Append each newly-surfaced term as `- term (tag) · ' + t + '` under "## Seen once" in:\n  ' + logPath + '\n' +
  'To avoid duplicates, glance at the log before adding (it is not injected in full, to keep your context light).\n' +
  'APPEND-ONLY: only ADD a term, or move one from "## Seen once" to "## Learned". NEVER delete, reorder, reformat, or restamp entries. ' +
  'You never compute schedules or dates - the hook owns all of that.\n';

if (due.length) {
  out += '\nREVIEW (once, now, at the start - never mid-task): the user has met ' + due.length + ' term' +
    (due.length > 1 ? 's' : '') + ' before and ' + (due.length > 1 ? "they're" : "it's") +
    ' due for a refresh. In ONE short block, ask the user to recall each before peeking, then let them look it up if fuzzy. No lecture.\n';
  for (const x of due) out += '  - ' + x.term + '\n';
  out += 'If the user clearly knows one well, move it to "## Learned" as `- term (tag) · learned ' + t + '`.\n';
}

if (graduated.length) {
  out += '\nGRADUATED (survived the review ladder): move ' + (graduated.length > 1 ? 'these' : 'this') +
    ' from "## Seen once" to "## Learned" (as `- term (tag) · learned ' + t + '`):\n';
  for (const term of graduated) out += '  - ' + term + '\n';
}

if (orphans.length && orphans.length <= 5) {
  out += '\nNOTE: these terms are in the schedule but missing from the log (possible accidental edit). Offer to restore them under "## Seen once":\n';
  for (const term of orphans) out += '  - ' + term + '\n';
}

out += "\nControls: the user can type 'footnote off' to mute, 'footnote on' to resume.";

process.stdout.write(out);
