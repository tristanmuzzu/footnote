#!/usr/bin/env node
// footnote — Claude Code SessionStart hook
//
// Runs once at the start of every session:
//   1. Ensures the personal learning log exists (creates it if missing).
//   2. Respects the mute flag ("footnote off").
//   3. Emits the "Learn next" teaching rules + the user's current log as
//      hidden SessionStart context, so Claude can surface and track terms.
//
// Privacy: everything stays on this machine. No network. No telemetry.
// Reliability: silent-fails on every filesystem error — never blocks a session.

const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = path.join(os.homedir(), '.claude', 'footnote');
const logPath = path.join(dir, 'learning-log.md');
const flagPath = path.join(dir, 'active');

const LOG_TEMPLATE = `<!-- footnote learning log — format v1 — lines: "- term (tag) — YYYY-MM-DD" -->
# Footnote — Your Learning Log

Terms Claude has surfaced to you while you work.
- "Seen once" = shown to you a first time.
- "Learned" = it recurred in real work, so you've met it enough — Claude won't surface it again.

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
  // Silent fail — never block session start.
}

// 2. Respect the mute flag.
let muted = false;
try {
  if (fs.existsSync(flagPath) && fs.readFileSync(flagPath, 'utf8').trim() === 'off') {
    muted = true;
  }
} catch (e) {
  // Ignore — treat as active.
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
  // Ignore — inject the rules without log state.
}

// 4. Emit the teaching rules (kept short on purpose) + log state.
const today = todayISO();
let out =
  'FOOTNOTE MODE ACTIVE — learning companion.\n' +
  'When a reply uses a dev term, tool, command, or convention a beginner likely does not know yet, ' +
  'append a final line:\n' +
  '  Learn next: `term1 (tag)`, `term2 (tag)`\n' +
  'Rules: names + a 1-word domain tag only (e.g. `lockfile (npm)`, `hoisting (js)`) — NO definitions, ' +
  'the user looks each up. Max 2, most-useful-first. Omit the line entirely when nothing qualifies — never pad. ' +
  'Only surface terms genuinely new to a learner AND actually used this turn. Skip trivial replies.\n' +
  'Today is ' + today + '.\n' +
  'Maintain the learning log with your file tools at:\n  ' + logPath + '\n' +
  '  - A new term you surfaced -> add `- term (tag) — ' + today + '` under "## Seen once".\n' +
  '  - A "Seen once" term that genuinely recurs in real work -> move it to "## Learned" ' +
  '(the user now knows it; never surface it again).\n' +
  '  - Never surface a term already under "## Learned".\n' +
  "The user can type 'footnote off' to mute, 'footnote on' to resume.";

if (seen.trim()) {
  out += "\n\nAlready in \"## Seen once\" (do not re-introduce as new):\n" + seen;
}
if (learned.trim()) {
  out +=
    "\n\nAlready \"## Learned\" (never surface again)" +
    (learnedExtra ? ' — showing the latest 150; ' + learnedExtra + ' more are in the log file' : '') +
    ':\n' +
    learned;
}

process.stdout.write(out);
