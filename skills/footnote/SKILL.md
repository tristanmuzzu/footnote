---
name: footnote
description: >
  Learning companion. End a reply with a short "Learn next" line for dev terms a
  beginner doesn't know yet, and run an ambient spaced-repetition review: terms
  are re-surfaced for a quick recall check at growing intervals until they stick.
  Always-on once installed. Two hooks do all the bookkeeping (capture, dedupe,
  schedule, promote); the model only emits hints and runs the review. Use this
  skill to read the full behavior.
---

# Footnote

Footnote turns everyday work with Claude into knowledge that compounds. When a
reply uses jargon a learner wouldn't know yet, Claude leaves a tiny "footnote"
pointing at what to look up. Then footnote brings those terms back for a short
recall check at growing intervals (spaced repetition), so they actually stick
instead of being seen once and forgotten.

Two channels, kept separate so neither interrupts the work:

- **Discovery** (per reply): new jargon becomes a "Learn next" line.
- **Review** (session start only): up to 3 terms that are *due* become a gentle recall check.

## What the model does (the whole job)

1. **Emit "Learn next" lines.** When (and only when) a reply uses a dev term,
   tool, command, library, or convention a non-CS learner likely doesn't know
   yet, end the reply with:

   > Learn next: `term1 (tag)`, `term2 (tag)`

   - **Names plus a 1-word domain tag only** (e.g. `lockfile (npm)`). No
     definitions, the user looks each one up, and that's the point.
   - **Cap of 2**, most useful first. **Omit when nothing qualifies.** Skip
     trivial replies.

2. **Run the session-start review.** The SessionStart hook injects up to 3 *due*
   terms. Present them once, at the start, as a short recall check: ask the user
   to remember each before they peek, then let them look it up if fuzzy. One
   block, no lecture, never woven into a task.

That's it. The model never reads, writes, dedupes, or promotes the log, and
never computes a schedule or a date. Name terms however reads naturally; the
hooks handle exact wording and duplicates.

## What the hooks do (all the bookkeeping)

Two deterministic Node hooks own the data so the model's per-session context
stays tiny and flat no matter how long the log grows.

- **SessionStart (`hooks/footnote-activate.js`)** is the scheduler. It ensures
  the log exists, keeps rolling backups, reconciles a hidden `schedule.json`
  keyed by a *canonical* term key, picks what's due, advances it, and **moves
  graduated terms from "## Seen once" to "## Learned" in the log itself**. It
  injects only the terse rules plus the due terms, never the whole log.
- **Stop (`hooks/footnote-harvest.js`)** is the harvester. When a reply
  finishes it reads the finished reply from the session transcript, pulls the
  "Learn next" items out, and **appends genuinely-new terms to "## Seen once"**.
  Deterministic dedup (canonical key + conservative fuzzy match) means a term
  named loosely is recognized as the one you already have, so the log never
  fills with near-duplicates and drift never blocks promotion.

The shared logic lives in pure, unit-tested modules under `hooks/lib/`
(`dedup.js`, `transcript.js`, `logfile.js`, `store.js`). Keep this spec in sync
with those.

## The log

Human-readable, at `~/.claude/footnote/learning-log.md` (or `FOOTNOTE_LOG_PATH`),
with two sections the user reads as progress: `## Seen once` (in rotation) and
`## Learned` (stuck and parked). The hidden `schedule.json` beside it holds the
spacing state; it is rebuildable from the log, so it is a cache, not precious
data. A small `footnote.log` records what the hooks added or graduated.

## Controls

- `footnote off` (also `/learn off`, `stop footnote`) mutes discovery and review.
- `footnote on` (also `/learn on`, `resume footnote`) resumes.

## Design invariants (don't regress)

- **The hooks own all dates and all log I/O; the model never schedules or writes.**
  This protects the user's task focus and keeps everything deterministic.
- **Append-only, enforced in code.** A hook write may only ADD a term or MOVE one
  from "Seen once" to "Learned". The term count must never decrease; a write that
  would shrink the log is aborted and the backup kept. The log is a permanent
  record.
- **Conservative dedup.** Case, tag, spacing, and plural variants merge to one
  term; a low-confidence near-miss is added anyway (and logged), never silently
  merged, so a genuinely new term is never dropped.
- **Bounded injection.** Inject the terse rules plus at most 3 due terms, never
  the whole log, so per-session context stays flat as the log grows.
- **Privacy:** local only, no network calls, no telemetry.
- **Quiet by default:** a hint is a footnote, not a lecture; omit when in doubt.
