---
name: footnote
description: >
  Learning companion. Append a short "Learn next" line for dev terms a beginner
  doesn't know yet, and run an ambient spaced-repetition rotation: terms are
  re-surfaced for a quick recall check at growing intervals until they stick.
  Always-on once installed: the SessionStart hook injects the live rules and
  picks what's due. Use this skill to read the full behavior.
---

# Footnote

Footnote turns everyday work with Claude into knowledge that compounds. When a
reply uses jargon a learner wouldn't know yet, Claude leaves a tiny "footnote"
pointing at what to look up. Then footnote brings those terms back for a short
recall check at growing intervals (spaced repetition), so they actually stick
instead of being seen once and forgotten.

Two channels, kept separate so neither interrupts the work:

- **Discovery** (per reply): new jargon becomes a "Learn next" line.
- **Review** (session start only): 2-3 terms that are *due* become a gentle recall check.

The SessionStart hook (`hooks/footnote-activate.js`) is the deterministic brain.
It owns ALL scheduling and dates, picks what's due, and injects only the rules
plus the due terms (never the whole log). Claude's job stays small: surface
terms, run the review, move graduated terms. This file is the canonical spec, so
keep it in sync with the hook.

## Discovery: the "Learn next" line

When (and only when) a reply uses a dev term, tool, command, library, or
convention a non-CS learner likely doesn't know yet, end the reply with:

> Learn next: `term1 (tag)`, `term2 (tag)`

- **Names plus a 1-word domain tag only** (e.g. `lockfile (npm)`). No definitions,
  the user looks each one up, and that's the point.
- **Cap of 2**, most useful first. **Omit when nothing qualifies.** Skip trivial replies.
- Append each newly-surfaced term as `- term (tag) · YYYY-MM-DD` under "## Seen once".
  Glance at the log first to avoid duplicates (it isn't injected in full).

## Review: spaced recall (session start only)

The hook selects up to 3 *due* terms and injects them. Present them once, at the
start, as a short recall check: ask the user to remember each before they peek,
then let them look it up if fuzzy. One block, no lecture, never woven into a task.

You do NOT schedule anything. The hook advances each surfaced term to its next
interval automatically. When a term has survived the ladder, the hook tells you
it "graduated", so move it from "## Seen once" to "## Learned". If the user clearly
already knows a term, move it to "## Learned" too.

## The log

Human-readable, at `~/.claude/footnote/learning-log.md` (or `FOOTNOTE_LOG_PATH`),
with two sections the user reads as progress: `## Seen once` (in rotation) and
`## Learned` (stuck and parked). The hook keeps a hidden `schedule.json` beside it
for the spacing state; that file is rebuildable from the log, so it is a cache,
not precious data.

## Controls

- `footnote off` (also `/learn off`, `stop footnote`) mutes discovery and review.
- `footnote on` (also `/learn on`, `resume footnote`) resumes.

## Design invariants (don't regress)

- **The hook owns all dates; the LLM never computes a schedule.** This protects the
  user's task focus and keeps scheduling deterministic.
- **Append-only.** Only ADD a term, or move one from "Seen once" to "Learned". NEVER
  delete, prune, reorder, reformat, or restamp entries. The log is a permanent record.
- **The hook never writes the log.** It writes only the hidden `schedule.json` plus
  rolling backups. The log is written only by the teach-me flow (append / promote).
- **Bounded injection.** Inject the terse rules plus at most 3 due terms, never the
  whole log, so per-session context stays flat as the log grows.
- **Privacy:** local only, no network calls, no telemetry.
- **Quiet by default:** a hint is a footnote, not a lecture; omit when in doubt.
