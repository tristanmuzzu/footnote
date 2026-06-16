# Contributing to footnote

Thanks for wanting to make footnote better. It's intentionally small, so you
should be able to read the whole thing in a few minutes.

## Project layout

| Path | What it owns |
| --- | --- |
| `hooks/footnote-activate.js` | The SessionStart hook. Sends Claude the rules each session and injects the current log. This is the always-on engine. |
| `hooks/footnote-mode-tracker.js` | The UserPromptSubmit hook. Detects `footnote off` and `footnote on` and flips the mute flag. |
| `skills/footnote/SKILL.md` | The full, human-readable behavior spec. Keep it in sync with the rules text in `footnote-activate.js`. |
| `.claude-plugin/plugin.json` | Plugin manifest that wires the hooks. |
| `.claude-plugin/marketplace.json` | Lets people install via `claude plugin marketplace add`. |
| `README.md` | The product front door. Optimize it for someone non-technical deciding whether to install. |

## The one rule that matters

The behavior is defined in two places and they have to agree: the rules string
in `hooks/footnote-activate.js` and the spec in `skills/footnote/SKILL.md`. If you
change how a footnote should look or how the log is maintained, change both.

## Invariants (please don't regress these)

- **Privacy:** no network calls, no telemetry. The log stays on the user's machine.
- **Non-destructive:** only ever read and write under `~/.claude/footnote/`.
- **Silent-fail hooks:** a hook must never throw in a way that blocks a session.
  Wrap filesystem work in try/catch.
- **Quiet by default:** a footnote is a hint, not a lecture. When in doubt, omit it.

## Testing a change locally

The hooks are plain Node scripts, so you can run them by hand:

```bash
# SessionStart: should print the rules plus your current log to stdout
node hooks/footnote-activate.js

# UserPromptSubmit: pipe in a fake prompt and watch the flag flip
echo '{"prompt":"footnote off"}' | node hooks/footnote-mode-tracker.js
echo '{"prompt":"footnote on"}'  | node hooks/footnote-mode-tracker.js
```

Then install your fork locally with `claude --plugin-dir .` to try it end to end.

## Ideas welcome

Spaced-repetition recaps, per-domain hint tuning (data science, devops, and so
on), weekly summaries, export formats. Open an issue and let's talk.
