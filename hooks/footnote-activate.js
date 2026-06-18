#!/usr/bin/env node
// footnote: Claude Code SessionStart hook (v2.1 - the scheduler).
//
// Runs once per session start. Deterministic; owns ALL scheduling and date math.
//   1. Ensures the learning log exists (creates if missing). NEVER overwrites it.
//   2. Keeps rolling backups of the log so an accidental edit is recoverable.
//   3. Reads the log (## Seen once / ## Learned) and reconciles a hidden
//      schedule sidecar keyed by CANONICAL term key, so loose naming never forks
//      a term's schedule or blocks its promotion.
//   4. Selects up to 3 DUE terms, advances them, and graduates ones past the
//      last interval - moving them from "## Seen once" to "## Learned" in the
//      markdown itself (atomic, backed up, append-only count guard).
//   5. Injects the terse per-reply rules + a short recall review of the due terms.
//
// In v2.1 the hooks are the sole writers of the log: this hook writes
// graduations, the Stop hook (harvester) writes new terms. Claude only emits
// "Learn next" lines and runs the review - it never reads or writes the log.
//
// Privacy: everything stays on this machine. No network. No telemetry.
// Reliability: silent-fails on every error; never blocks a session.

'use strict';

const store = require('./lib/store.js');
const { canonicalKey } = require('./lib/dedup.js');
const { parseTerms, countTerms, moveToLearned } = require('./lib/logfile.js');

const REVIEW_CAP = 3;                  // max terms surfaced for review per session
const INTERVALS = [1, 3, 7, 21, 60];   // days; index = stage. past the end => graduate.
const MAX_STAGE = INTERVALS.length - 1;

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function run() {
  const P = store.paths();

  // 1. ensure dir + log exist (never overwrite an existing log)
  store.ensureLog(P.logPath);

  // 2. mute check
  if (store.isMuted(P.flagPath)) {
    process.stdout.write(
      "FOOTNOTE is installed but muted. Do not append 'Learn next' hints or run reviews. " +
      "Type 'footnote on' to re-enable."
    );
    return;
  }

  let md = store.readSafe(P.logPath);
  const t = store.today();

  // 3. rolling backup before any change (recovery net)
  store.rollingBackup(P.backupDir, md);

  // 4. load schedule (rebuildable cache) and reconcile by canonical key
  let old = { terms: {} };
  try {
    const raw = store.readSafe(P.statePath);
    if (raw) { const parsed = JSON.parse(raw); if (parsed && parsed.terms) old = parsed; }
  } catch (e) { old = { terms: {} }; }

  // Migrate any prior entry (v2.0 keyed by display string) onto its canonical
  // key, keeping the most-advanced progress if two display variants collapse.
  const migrated = {};
  for (const k of Object.keys(old.terms)) {
    const ck = canonicalKey(k);
    if (!ck) continue;
    const cur = old.terms[k];
    const prev = migrated[ck];
    if (!prev || (cur.stage || 0) > (prev.stage || 0)) migrated[ck] = Object.assign({}, cur);
  }

  const seenDisplays = parseTerms(md, 'Seen once');
  const learnedDisplays = parseTerms(md, 'Learned');
  const seenKeys = seenDisplays.map(canonicalKey).filter(Boolean);
  const learnedKeys = new Set(learnedDisplays.map(canonicalKey).filter(Boolean));
  const inLog = new Set([...seenKeys, ...learnedKeys]);

  const state = { version: 2, terms: {} };
  // Seen-once terms: carry forward progress, else start fresh at stage 0.
  for (const key of seenKeys) {
    if (learnedKeys.has(key)) continue; // a key present in both: treat as learned below
    const prior = migrated[key];
    if (prior && prior.section !== 'learned' && prior.nextDue) {
      state.terms[key] = {
        stage: prior.stage || 0,
        timesSeen: prior.timesSeen || 0,
        lastSeen: prior.lastSeen || t,
        nextDue: prior.nextDue,
        section: 'seen',
      };
    } else {
      state.terms[key] = { stage: 0, timesSeen: 0, lastSeen: t, nextDue: addDays(t, 1), section: 'seen' };
    }
  }
  // Learned terms: parked, never due.
  for (const key of learnedKeys) {
    const prior = migrated[key];
    state.terms[key] = {
      stage: MAX_STAGE + 1,
      timesSeen: prior ? (prior.timesSeen || 0) : 0,
      lastSeen: prior ? (prior.lastSeen || t) : t,
      nextDue: null,
      section: 'learned',
    };
  }

  // Orphans: keys the schedule cache had but the log no longer shows. The cache
  // is rebuildable, so prune them; surface a short note in case it was an
  // accidental edit (the backup is the real recovery net).
  const orphans = Object.keys(migrated).filter((k) => !inLog.has(k));

  // 5. select due terms, advance them, collect graduations
  const due = seenKeys
    .filter((key) => {
      const s = state.terms[key];
      return s && s.section === 'seen' && s.nextDue && s.nextDue <= t;
    })
    .map((key) => ({ key, stage: state.terms[key].stage, nextDue: state.terms[key].nextDue }))
    .sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1))
    .slice(0, REVIEW_CAP);

  const toGraduate = [];
  for (const x of due) {
    const s = state.terms[x.key];
    s.timesSeen = (s.timesSeen || 0) + 1;
    s.lastSeen = t;
    if (x.stage >= MAX_STAGE) {
      toGraduate.push(x.key); // committed to 'learned' only if the markdown move succeeds
    } else {
      s.stage = x.stage + 1;
      s.nextDue = addDays(t, INTERVALS[s.stage]);
    }
  }

  // Write graduations into the markdown (the hook is the writer now).
  let graduated = [];
  if (toGraduate.length && md != null) {
    const before = countTerms(md);
    const res = moveToLearned(md, toGraduate, t);
    const after = countTerms(res.md);
    if (res.moved.length && after >= before) {       // append-only: a move keeps count equal
      if (store.writeAtomic(P.logPath, res.md)) {
        md = res.md;
        graduated = res.moved;
        const movedKeys = new Set(res.moved.map(canonicalKey));
        for (const key of toGraduate) {
          const s = state.terms[key];
          if (movedKeys.has(key)) { s.stage = MAX_STAGE + 1; s.nextDue = null; s.section = 'learned'; }
          else { s.nextDue = addDays(t, INTERVALS[MAX_STAGE]); } // not found in log: retry later
        }
        store.hookLog(P.hookLogPath, 'graduated ' + graduated.length + ': ' + graduated.join(', '));
      } else {
        for (const key of toGraduate) state.terms[key].nextDue = addDays(t, INTERVALS[MAX_STAGE]);
      }
    } else {
      if (after < before) store.hookLog(P.hookLogPath, 'ABORT graduation: count would drop; log unchanged');
      for (const key of toGraduate) state.terms[key].nextDue = addDays(t, INTERVALS[MAX_STAGE]);
    }
  }

  // 6. persist the schedule cache atomically
  try { const prev = store.readSafe(P.statePath); if (prev) store.writeAtomic(P.statePath + '.bak', prev); } catch (e) { /* ignore */ }
  store.writeAtomic(P.statePath, JSON.stringify(state, null, 2));

  // 7. inject bounded context: rules + <=3 due terms; never the whole log
  let out =
    'FOOTNOTE MODE ACTIVE - learning companion. Today is ' + t + '.\n' +
    'NEW TERMS (per reply): when a reply uses a dev term, tool, command, or convention a beginner likely does not know yet, end with:\n' +
    '  Learn next: `term1 (tag)`, `term2 (tag)`\n' +
    'Names + a 1-word tag only (e.g. `lockfile (npm)`); no definitions; max 2; omit when nothing qualifies; skip trivial replies.\n' +
    'You do NOT write, read, or dedupe the log - a background hook records your "Learn next" line automatically and handles wording and duplicates. ' +
    'Name terms naturally; you never compute schedules or dates.\n';

  if (due.length) {
    out += '\nREVIEW (once, now, at the start - never mid-task): the user met ' + due.length + ' term' +
      (due.length > 1 ? 's' : '') + ' before and ' + (due.length > 1 ? "they're" : "it's") +
      ' due for a refresh. In ONE short block, ask the user to recall each before peeking, then let them look it up if fuzzy. ' +
      'No lecture, no logging, no promotion - the hook handles all of that.\n';
    for (const x of due) out += '  - ' + x.key + '\n';
  }

  if (graduated.length) {
    out += '\nFYI: footnote moved ' + graduated.length + ' term' + (graduated.length > 1 ? 's' : '') +
      ' to "## Learned" automatically (survived the review ladder). No action needed.\n';
  }

  if (orphans.length && orphans.length <= 5) {
    out += '\nNOTE: ' + orphans.length + ' term' + (orphans.length > 1 ? 's were' : ' was') +
      ' in the schedule but missing from the log (possible manual edit). Left the log as-is; backups are in ' +
      P.backupDir + ' if this was accidental.\n';
  }

  out += "\nControls: the user can type 'footnote off' to mute, 'footnote on' to resume.";

  process.stdout.write(out);
}

try { run(); } catch (e) { /* never block a session */ }
