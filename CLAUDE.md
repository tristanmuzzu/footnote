# CLAUDE.md for footnote

Guidance for AI agents (and humans) working on this repo.

## What this is

footnote is a Claude Code plugin that makes Claude teach the user as they work.
It appends a short `Learn next` hint when a reply uses beginner-unfamiliar dev
jargon, and maintains a personal learning log that promotes terms from "Seen
once" to "Learned" over time. It is modeled on the `caveman` plugin: a
SessionStart hook that injects rules as context.

## Single source of truth (edit these)

| File | Controls |
| --- | --- |
| `hooks/footnote-activate.js` | The always-on rules injected every session, and how the log is read and injected. |
| `hooks/footnote-mode-tracker.js` | Mute and unmute command detection. |
| `skills/footnote/SKILL.md` | The canonical human-readable behavior spec. |

The rules text in `footnote-activate.js` and `skills/footnote/SKILL.md` must stay
in sync. They describe the same behavior in two forms.

## README is a product artifact

The README is the front door. A non-technical learner reads it to decide whether
to install. Keep the Before/After example near the top, keep the install commands
exact (one broken command costs a real user), and keep the "What you get" table
honest. If a feature ships or is removed, update the table.

## Hard invariants (don't regress)

- **Privacy:** no network, no telemetry. The learning log never leaves the machine.
- **Non-destructive:** only read and write under `~/.claude/footnote/`. Never touch
  the user's other files. This is why footnote does NOT use
  `~/.claude/learning-log.md`, which a user may already maintain by hand.
- **Append-only log:** never delete, prune, reorder, reformat, or restamp entries in
  the learning log; only add a term or promote one from Seen once to Learned. The
  user's term history must never shrink. The hook's injected rules and SKILL.md both
  state this, so keep all three in sync. This is the guarantee that protects a user's
  backlog from being silently erased by a future session or an unrelated
  memory-consolidation skill.
- **Silent-fail hooks:** every filesystem operation is wrapped so a failure can
  never block session start or a prompt.
- **Token discipline:** the injected context is kept lean, and the `Learned` list
  is capped (currently 150 lines) with an explicit "more in the log file" note.
  Never silently truncate.
- **Quiet by default:** cap of 2 hints, and omit entirely when nothing qualifies.

## Cross-platform

Hooks are plain Node.js using `os.homedir()` and `path.join`, so they run on
Windows, macOS, and Linux without a shell dependency. Keep it that way. Don't
introduce bash-only or PowerShell-only hook scripts.
