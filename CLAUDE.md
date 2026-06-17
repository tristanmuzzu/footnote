# CLAUDE.md for footnote

Guidance for AI agents (and humans) working on this repo.

## What this is

footnote is a Claude Code plugin that makes Claude teach the user as they work,
using spaced repetition. Two channels: per-reply "Learn next" hints for new dev
jargon (discovery), and a session-start recall check of terms that are due
(retention). The SessionStart hook is a deterministic scheduler: it owns all
dates, picks what is due, and injects only the rules plus the due terms. It is
modeled on the `caveman` plugin (a SessionStart hook that injects context).

## Single source of truth (edit these)

| File | Controls |
| --- | --- |
| `hooks/footnote-activate.js` | The deterministic scheduler: reads the log, owns all dates/stages (stored in a `schedule.json` sidecar), selects the due terms, and injects the rules plus those terms. Never writes the log itself. |
| `hooks/footnote-mode-tracker.js` | Mute and unmute command detection. |
| `skills/footnote/SKILL.md` | The canonical human-readable behavior spec. |

The rules text in `footnote-activate.js` and `skills/footnote/SKILL.md` must stay
in sync. They describe the same behavior in two forms.

Runtime data files (created on the user's machine, not in the repo): `learning-log.md`
(human-readable, append-only, written only by the teach-me flow), `schedule.json`
(hook-owned spacing state: stage + next-due per term, rebuildable from the log so
it is a cache not precious data), and `backups/` (rolling log backups). The hook
writes only the sidecar and backups, never the log.

## README is a product artifact

The README is the front door. A non-technical learner reads it to decide whether
to install. Keep the Before/After example near the top, keep the install commands
exact (one broken command costs a real user), and keep the "What you get" table
honest. If a feature ships or is removed, update the table.

## Hard invariants (don't regress)

- **Privacy:** no network, no telemetry. The learning log never leaves the machine.
- **The hook never writes the log.** It writes only the `schedule.json` sidecar and
  rolling `backups/` (atomic writes). The log is written only by the teach-me flow
  (append a term, or promote one from Seen once to Learned). The log path defaults to
  `~/.claude/footnote/learning-log.md` and honors `FOOTNOTE_LOG_PATH`.
- **The hook owns all scheduling and dates.** The LLM never computes a due date or a
  stage; it only surfaces terms and moves graduated ones. This keeps scheduling
  deterministic and keeps bookkeeping out of the model's reasoning (and off the task).
- **Append-only log:** never delete, prune, reorder, reformat, or restamp entries in
  the learning log; only add a term or promote one from Seen once to Learned. The
  user's term history must never shrink. The hook's injected rules and SKILL.md both
  state this, so keep all three in sync. This is the guarantee that protects a user's
  backlog from being silently erased by a future session or an unrelated
  memory-consolidation skill.
- **Silent-fail hooks:** every filesystem operation is wrapped so a failure can
  never block session start or a prompt.
- **Bounded injection:** inject only the terse rules plus at most 3 due terms, never
  the whole log, so per-session context stays flat as the log grows.
- **Quiet by default:** cap of 2 hints, and omit entirely when nothing qualifies.

## Cross-platform

Hooks are plain Node.js using `os.homedir()` and `path.join`, so they run on
Windows, macOS, and Linux without a shell dependency. Keep it that way. Don't
introduce bash-only or PowerShell-only hook scripts.
