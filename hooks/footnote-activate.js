#!/usr/bin/env node
// footnote: Claude Code SessionStart hook
//
// Runs once at the start of every session:
//   1. Ensures the personal learning log exists (creates it if missing).
//   2. Respects the mute flag ("footnote off").
//   3. Emits the "Learn next" teaching rules plus the user's current log as
//      hidden SessionStart context, so Claude can surface and track terms.
//
// Privacy: everything stays on this machine. No network. No telemetry.
// Reliability: silent-fails on every filesystem error, so it never blocks a session.

const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = path.join(os.homedir(), '.claude', 'footnote');
const logPath = path.join(dir, 'learning-log.md');
const flagPath = path.join(dir, 'active');

const LOG_TEMPLATE = `<!-- footnote learning log · format v1 · lines: "- term (tag) · YYYY-MM-DD" -->
# Footnote: Your Learning Log

Terms Claude has surfaced to you while you work.
- "Seen once" means it was shown to you a first time.
- "Learned" means it recurred in real work, so you've met it enough and Claude won't surface it again.

## Seen once

## Learned
`;

function todayISO() {
  // Hooks run in real Node, so Date is available here.
  return new Date().toISOString().slice(0, 10);
}

// 1. Ensure the log file exists (best-effort).
try {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, LOG_TEMPLATE);
} catch (e) {
  // Silent fail, so we never block session start.
}

// 2. Respect the mute flag.
let muted = false;
try {
  if (fs.existsSync(flagPath) && fs.readFileSync(flagPath, 'utf8').trim() === 'off') {
    muted = true;
  }
} catch (e) {
  // Ignore and treat as active.
}

if (muted) {
  process.stdout.write(
    "FOOTNOTE is installed but muted. Do not append 'Learn next' hints. " +
    "The user can type 'footnote on' to re-enable."
  );
  process.exit(0);
}

// 3. Read the current log and extract the two lists (capped to stay token-lean).
let seen = '';
let learned = '';
let learnedExtra = 0;
try {
  const raw = fs.readFileSync(logPath, 'utf8');
  const seenBlock = (raw.split(/^##\s+Seen once\s*$/m)[1] || '').split(/^##\s+/m)[0];
  const learnedBlock = raw.split(/^##\s+Learned\s*$/m)[1] || '';
  const seenLines = seenBlock.split('\n').filter((l) => l.trim().startsWith('-'));
  let learnedLines = learnedBlock.split('\n').filter((l) => l.trim().startsWith('-'));
  const CAP = 150;
  if (learnedLines.length > CAP) {
    learnedExtra = learnedLines.length - CAP;
    learnedLines = learnedLines.slice(-CAP);
  }
  seen = seenLines.join('\n');
  learned = learnedLines.join('\n');
} catch (e) {
  // Ignore and inject the rules without log state.
}

// 4. Emit the teaching rules (kept short on purpose) plus log state.
const today = todayISO();
let out =
  'FOOTNOTE MODE ACTIVE. You are a learning companion.\n' +
  'When a reply uses a dev term, tool, command, or convention a beginner likely does not know yet, ' +
  'append a final line:\n' +
  '  Learn next: `term1 (tag)`, `term2 (tag)`\n' +
  'Rules: names plus a 1-word domain tag only (for example `lockfile (npm)`, `hoisting (js)`). ' +
  'No definitions, the user looks each up. Max 2, most useful first. ' +
  'Omit the line entirely when nothing qualifies, and never pad. ' +
  'Only surface terms genuinely new to a learner AND actually used this turn. Skip trivial replies.\n' +
  'Today is ' + today + '.\n' +
  'Maintain the learning log with your file tools at:\n  ' + logPath + '\n' +
  '  1. A new term you surfaced: add `- term (tag) · ' + today + '` under "## Seen once".\n' +
  '  2. A "Seen once" term that genuinely recurs in real work: move it to "## Learned" ' +
  '(the user now knows it, so never surface it again).\n' +
  '  3. Never surface a term already under "## Learned".\n' +
  '  4. APPEND-ONLY: this file is a permanent record. Only ADD a new term, or move one from "## Seen once" to "## Learned". NEVER delete existing terms, reorder, reformat, restamp dates, or rewrite the header, and do not consolidate or prune it. If a structural change seems needed, ask the user first.\n' +
  "The user can type 'footnote off' to mute, 'footnote on' to resume.";

if (seen.trim()) {
  out += "\n\nAlready in \"## Seen once\" (do not re-introduce as new):\n" + seen;
}
if (learned.trim()) {
  out +=
    "\n\nAlready \"## Learned\" (never surface again)" +
    (learnedExtra ? ', showing the latest 150 with ' + learnedExtra + ' more in the log file' : '') +
    ':\n' +
    learned;
}

process.stdout.write(out);
