#!/usr/bin/env node
// footnote: Claude Code Stop hook (v2.1 - the harvester).
//
// Fires when a reply finishes. Reads the finished reply from the session
// transcript, pulls out the "Learn next: `term (tag)`" footnote, and appends any
// genuinely-new terms to "## Seen once" in the learning log. Deterministic dedup
// (canonical key + conservative fuzzy) means Claude can name terms loosely and
// the log never accumulates near-duplicates. The scheduler (SessionStart hook)
// picks the new terms up next session; this hook never touches schedule.json.
//
// Safety: never writes the log if the term count would drop (append-only guard),
// keeps a rolling backup before writing, writes atomically, and silent-fails on
// any error so it can never block a session from ending. Honors the mute flag
// and the stop_hook_active loop guard.

'use strict';

const store = require('./lib/store.js');
const { canonicalKey, findMatch } = require('./lib/dedup.js');
const { lastAssistantText, extractLearnNext } = require('./lib/transcript.js');
const { parseTerms, countTerms, appendSeen } = require('./lib/logfile.js');

function readStdin() {
  try { return require('fs').readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

// Keep only plausible term strings; drop anything that looks like prose or junk.
function sanitize(term) {
  const s = String(term || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.length > 60) return null;          // a footnote term is short
  if (!/[a-z]/i.test(s)) return null;      // must contain a letter
  if (/[\n\r]/.test(s)) return null;
  return s;
}

function main() {
  const raw = readStdin();
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch (e) { input = {}; }

  // Loop guard: if we're already inside a Stop hook pass, do nothing.
  if (input.stop_hook_active === true) return;

  const P = store.paths();
  if (store.isMuted(P.flagPath)) return;

  // Get the finished reply text: transcript first (authoritative), then any
  // assistant_message the harness may also hand us on stdin (belt and braces).
  let replyText = '';
  if (input.transcript_path) {
    const jsonl = store.readSafe(input.transcript_path);
    if (jsonl) replyText = lastAssistantText(jsonl);
  }
  if (!replyText && typeof input.assistant_message === 'string') {
    replyText = input.assistant_message;
  }
  if (!replyText) return;

  const candidates = extractLearnNext(replyText).map(sanitize).filter(Boolean);
  if (!candidates.length) return;

  store.ensureLog(P.logPath);
  const md = store.readSafe(P.logPath);
  if (md == null) return;

  // Existing terms -> canonical keys (both sections; never resurrect a graduated term).
  const existingKeys = [...parseTerms(md, 'Seen once'), ...parseTerms(md, 'Learned')].map(canonicalKey);
  const seenThisRun = new Set();
  const toAdd = [];
  const notes = [];

  for (const display of candidates) {
    const key = canonicalKey(display);
    if (!key || seenThisRun.has(key)) continue;
    const against = existingKeys.concat([...seenThisRun]);
    const match = findMatch(key, against);
    if (match.confidence === 'exact' || match.confidence === 'high') {
      continue; // already have it (case/tag/spacing/plural/typo) - skip silently
    }
    if (match.confidence === 'low') {
      // near-miss: add it anyway (never drop a possibly-new term), but record it
      notes.push('near-miss: "' + display + '" ~ "' + match.key + '" (added, not merged)');
    }
    seenThisRun.add(key);
    toAdd.push({ display, date: store.today() });
  }

  if (!toAdd.length) {
    for (const n of notes) store.hookLog(P.hookLogPath, n);
    return;
  }

  const before = countTerms(md);
  const newMd = appendSeen(md, toAdd);
  const after = countTerms(newMd);

  // Append-only guard: a harvest must only ever grow the log.
  if (after < before) {
    store.hookLog(P.hookLogPath, 'ABORT: append would drop count (' + before + ' -> ' + after + '); log left unchanged');
    return;
  }

  store.rollingBackup(P.backupDir, md);
  if (store.writeAtomic(P.logPath, newMd)) {
    store.hookLog(P.hookLogPath, 'added ' + toAdd.length + ': ' + toAdd.map((t) => t.display).join(', '));
    for (const n of notes) store.hookLog(P.hookLogPath, n);
  }
}

try { main(); } catch (e) { /* never block a session */ }
