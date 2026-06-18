# Contributing to footnote

Thanks for wanting to make footnote better. It's intentionally small, so you
should be able to read the whole thing in a few minutes.

## Project layout

| Path | What it owns |
| --- | --- |
| `hooks/footnote-activate.js` | The SessionStart hook (scheduler). Picks what's due, injects the rules, and moves graduated terms to "## Learned". |
| `hooks/footnote-harvest.js` | The Stop hook (harvester). Reads the finished reply, pulls the "Learn next" items, and appends new terms to "## Seen once". |
| `hooks/footnote-mode-tracker.js` | The UserPromptSubmit hook. Detects `footnote off` and `footnote on` and flips the mute flag. |
| `hooks/lib/` | Pure, unit-tested logic shared by the hooks: `dedup.js` (canonical key + fuzzy match), `transcript.js` (reply parsing + "Learn next" extraction), `logfile.js` (markdown surgery), `store.js` (paths, atomic writes, backups). |
| `tests/` | `node --test` suite over `hooks/lib` plus an end-to-end run of both hooks. |
| `skills/footnote/SKILL.md` | The full, human-readable behavior spec. Keep it in sync with the rules text in `footnote-activate.js`. |
| `.claude-plugin/plugin.json` | Plugin manifest that wires the hooks. |
| `.claude-plugin/marketplace.json` | Lets people install via `claude plugin marketplace add`. |
| `README.md` | The product front door. Optimize it for someone non-technical deciding whether to install. |

## The one rule that matters

The behavior is defined in two places and they have to agree: the rules string
injected by `hooks/footnote-activate.js` and the spec in `skills/footnote/SKILL.md`.
If you change how a footnote should look or how the log is maintained, change both.

## Invariants (please don't regress these)

- **Privacy:** no network calls, no telemetry. The log stays on the user's machine.
- **Non-destructive:** only ever read and write under `~/.claude/footnote/`.
- **Silent-fail hooks:** a hook must never throw in a way that blocks a session.
  Wrap filesystem work in try/catch.
- **Quiet by default:** a footnote is a hint, not a lecture. When in doubt, omit it.

## Testing a change

There is a test suite (plain `node --test`, no dependencies). Run it before and
after any change:

```bash
npm test
```

It covers the pure logic in `hooks/lib/` and runs both hooks end to end against
an isolated temp log (your real log is never touched). When you change behavior,
add or update a test.

The hooks are also just plain Node scripts, so you can run them by hand. Point
them at a throwaway log first so you don't write to your real one:

```bash
# isolate everything to a temp folder
export FOOTNOTE_HOME=/tmp/fn FOOTNOTE_LOG_PATH=/tmp/fn/learning-log.md

# SessionStart: should print the rules plus what's due to stdout
node hooks/footnote-activate.js

# Stop (harvester): feed it a transcript path and watch the log grow
echo '{"transcript_path":"/path/to/session.jsonl"}' | node hooks/footnote-harvest.js

# UserPromptSubmit: pipe in a fake prompt and watch the flag flip
echo '{"prompt":"footnote off"}' | node hooks/footnote-mode-tracker.js
echo '{"prompt":"footnote on"}'  | node hooks/footnote-mode-tracker.js
```

Then install your fork locally with `claude --plugin-dir .` to try it end to end.

## Ideas welcome

Spaced-repetition recaps, per-domain hint tuning (data science, devops, and so
on), weekly summaries, export formats. Open an issue and let's talk.
