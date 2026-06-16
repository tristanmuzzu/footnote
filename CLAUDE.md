# CLAUDE.md — footnote

Guidance for AI agents (and humans) working on this repo.

## What this is

footnote is a Claude Code plugin that makes Claude teach the user as they work:
it appends a short `Learn next:` hint when a reply uses beginner-unfamiliar dev
jargon, and maintains a personal learning log that promotes terms from "Seen
once" to "Learned" over time. Modeled on the architecture of the `caveman` plugin
(a SessionStart hook that injects rules as context).

## Single source of truth — edit these

| File | Controls |
| --- | --- |
| `hooks/footnote-activate.js` | The always-on rules injected every session + how the log is read/injected. |
| `hooks/footnote-mode-tracker.js` | Mute/unmute command detection. |
| `skills/footnote/SKILL.md` | The canonical human-readable behavior spec. |

**The rules text in `footnote-activate.js` and `skills/footnote/SKILL.md` must
stay in sync** — they describe the same behavior in two forms.

## README is a product artifact

The README is the front door. A non-technical learner reads it to decide whether
to install. Keep the Before/After example first, keep the install commands exact
(one broken command costs a real user), and keep the "What you get" table honest —
if a feature ships or is removed, update the table.

## Hard invariants (don't regress)

- **Privacy:** no network, no telemetry. The learning log never leaves the machine.
- **Non-destructive:** only read/write under `~/.claude/footnote/`. Never touch the
  user's other files (this is why footnote does NOT use `~/.claude/learning-log.md`,
  which a user may already maintain by hand).
- **Silent-fail hooks:** every filesystem operation is wrapped so a failure can
  never block session start or a prompt.
- **Token discipline:** the injected context is kept lean; the `Learned` list is
  capped (currently 150 lines) with an explicit "+N more" — never silently truncate.
- **Quiet by default:** cap of 2 hints, omit entirely when nothing qualifies.

## Cross-platform

Hooks are plain Node.js using `os.homedir()` + `path.join`, so they run on
Windows, macOS, and Linux without a shell dependency. Keep it that way — don't
introduce bash-only or PowerShell-only hook scripts.
