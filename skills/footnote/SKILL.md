---
name: footnote
description: >
  Learning companion. Append a short "Learn next" line for dev terms, tools, or
  conventions a beginner likely doesn't know yet, and maintain a personal
  learning log that promotes terms from "Seen once" to "Learned" as they recur.
  Always-on once installed: the SessionStart hook injects the live rules. Use
  this skill to read the full behavior, or when the user runs /footnote:footnote.
---

# Footnote

Footnote turns everyday work with Claude into knowledge that compounds. When a
reply uses jargon a learner wouldn't know yet, Claude leaves a tiny "footnote"
pointing at what to look up next, and remembers what it has already shown you so
the hints get smarter over time.

The SessionStart hook (`hooks/footnote-activate.js`) injects the operative rules
into every session and hands Claude the current learning log. This file is the
canonical, human-readable spec of that behavior, so keep the two in sync.

## The "Learn next" line

When (and only when) a reply uses a dev term, tool, command, library, or
convention a non-CS learner likely doesn't know yet, end the reply with:

> Learn next: `term1 (tag)`, `term2 (tag)`

Rules:

- **Names plus a 1-word domain tag only.** For example `lockfile (npm)`,
  `hoisting (js)`, `worktree (git)`. The tag is a search hint, not a definition.
  Never explain the term. The user looks each one up, and that's the point.
- **Cap of 2**, ranked most useful first.
- **Omit the whole line when nothing qualifies.** Never pad.
- Only surface terms **genuinely new to a learner** AND **actually used this turn.**
  Skip business-domain terms the user already knows, and skip trivial replies.

## The learning log

The log lives at `~/.claude/footnote/learning-log.md` (created by the hook on
first run). It has two sections and a versioned format header.

- **`## Seen once`** holds a term shown to the user a first time. Add a line
  `- term (tag) · YYYY-MM-DD` when you surface a new term.
- **`## Learned`** holds a term that genuinely recurred in real work. Move it here
  from "Seen once" the next time it comes up in actual work (not just because it
  sits in the file). Once a term is "Learned", never surface it again.

Maintain the file with your normal file tools (Read, Edit, Write). Read it once
per session before surfacing the line so dedup and promotion are correct. The
SessionStart hook injects the current lists, so you usually won't need a fresh read.

## Controls

- `footnote off` (also `/learn off`, `stop footnote`) mutes it. Claude stops
  appending hints, and the change persists across sessions.
- `footnote on` (also `/learn on`, `resume footnote`) turns it back on.

## Design invariants (don't regress)

- **Privacy:** the log stays on the user's machine. No network calls, no telemetry.
- **Non-destructive:** footnote writes only under `~/.claude/footnote/`. It must
  never touch a user's other files or other learning notes.
- **Quiet by default:** a hint is a footnote, not a lecture. When in doubt, omit it.
