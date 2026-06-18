// footnote: filesystem + path helpers shared by both hooks.
//
// All disk access lives here so the SessionStart and Stop hooks stay thin and
// behave identically (same log path, same atomic writes, same backups). Plain
// Node only (fs/path/os) so it runs the same on Windows, macOS, and Linux.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const KEEP_BACKUPS = 5;
const HOOKLOG_MAX_LINES = 300;

const LOG_TEMPLATE = `<!-- footnote learning log · format v2 · lines: "- term (tag) · YYYY-MM-DD" -->
# Footnote: Your Learning Log

Terms Claude has surfaced to you while you work.
- "Seen once" = in the spaced-review rotation: you'll be re-shown it a few times, at growing gaps, until it sticks.
- "Learned" = it survived the rotation. Parked; not re-surfaced.

## Seen once

## Learned
`;

// Resolve every path footnote uses from a single source: FOOTNOTE_LOG_PATH (so
// a local install can point at a hand-maintained log) or the per-user default.
// State + backups live next to the log; the mute flag is global.
function paths(env) {
  env = env || process.env;
  // FOOTNOTE_HOME relocates the global dir (mute flag); FOOTNOTE_LOG_PATH points
  // at a specific log (a local install's hand-maintained one). Both default to
  // the per-user ~/.claude/footnote. Overridable so forks and tests can sandbox.
  const dir = env.FOOTNOTE_HOME || path.join(os.homedir(), '.claude', 'footnote');
  const logPath = env.FOOTNOTE_LOG_PATH || path.join(dir, 'learning-log.md');
  const baseDir = path.dirname(logPath);
  return {
    dir,
    logPath,
    baseDir,
    statePath: path.join(baseDir, 'schedule.json'),
    flagPath: path.join(dir, 'active'),
    backupDir: path.join(baseDir, 'backups'),
    hookLogPath: path.join(baseDir, 'footnote.log'),
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
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

// Create the log (and its dir) on first run. NEVER overwrites an existing log.
function ensureLog(p) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!fs.existsSync(p)) writeAtomic(p, LOG_TEMPLATE);
  } catch (e) { /* silent */ }
}

// Keep the last KEEP_BACKUPS snapshots of the log; only snapshot on change.
function rollingBackup(backupDir, md) {
  try {
    if (!md) return;
    fs.mkdirSync(backupDir, { recursive: true });
    let files = fs.readdirSync(backupDir).filter((f) => f.startsWith('learning-log.')).sort();
    const last = files.length ? readSafe(path.join(backupDir, files[files.length - 1])) : null;
    if (last === md) return;
    writeAtomic(path.join(backupDir, 'learning-log.' + today() + '.' + Date.now() + '.bak'), md);
    files = fs.readdirSync(backupDir).filter((f) => f.startsWith('learning-log.')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
      try { fs.unlinkSync(path.join(backupDir, f)); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* silent */ }
}

function isMuted(flagPath) {
  const flag = readSafe(flagPath);
  return !!(flag && flag.trim() === 'off');
}

// Append a transparency line to footnote.log (term adds, near-miss skips),
// self-trimming so it can never grow unbounded.
function hookLog(hookLogPath, msg) {
  try {
    const stamp = new Date().toISOString();
    let body = readSafe(hookLogPath) || '';
    body += stamp + '  ' + msg + '\n';
    const lines = body.split('\n');
    if (lines.length > HOOKLOG_MAX_LINES) {
      body = lines.slice(lines.length - HOOKLOG_MAX_LINES).join('\n');
    }
    writeAtomic(hookLogPath, body);
  } catch (e) { /* silent */ }
}

module.exports = {
  KEEP_BACKUPS, LOG_TEMPLATE,
  paths, today, readSafe, writeAtomic, ensureLog, rollingBackup, isMuted, hookLog,
};
