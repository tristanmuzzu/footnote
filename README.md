# footnote

**Your AI coding assistant should teach you, not just do your homework.**

footnote is a tiny Claude Code plugin. While you work, Claude quietly leaves a
**footnote** — a short *"Learn next"* line — whenever it uses a term, tool, or
convention a beginner wouldn't know yet. It also keeps a private **learning log**
that remembers what it has shown you, so the hints get smarter over time and stop
repeating things you already know.

No course. No flashcards to maintain. You just keep coding, and you keep learning.

---

## Before / after

**Without footnote:**

> Done — I added the dependency and committed the lockfile.

**With footnote:**

> Done — I added the dependency and committed the lockfile.
>
> Learn next: `lockfile (npm)`, `transitive dependency (npm)`

That's it. Two words and a hint about where they live. You look them up when you
feel like it. Over weeks, the things that used to look like magic become things
you understand.

---

## What you get

| Feature | What it does |
| --- | --- |
| **Always-on hints** | A short `Learn next:` line appears only when a reply actually uses unfamiliar jargon. Never padded, never a lecture. |
| **A learning log** | Terms move from **Seen once** → **Learned** as they come up again in real work. Learned terms stop being surfaced. |
| **Yours, and private** | The log lives on your machine at `~/.claude/footnote/learning-log.md`. No network. No telemetry. Nothing leaves your computer. |
| **Easy mute** | Type `footnote off` to pause it, `footnote on` to bring it back. |
| **Cross-platform** | The hooks are plain Node.js — they run the same on Windows, macOS, and Linux. |

---

## Install

In Claude Code, run these two commands:

```text
/plugin marketplace add ResolveZeticle/footnote
/plugin install footnote@footnote
```

That's it. Open a new session and footnote is on. (It needs Node.js available on
your `PATH` — if you use Claude Code you almost certainly already have it.)

---

## How it works (plain English)

Claude Code lets a plugin run a small script when a session starts. footnote's
script does three quiet things:

1. **Makes sure your learning log exists** (creating it the first time).
2. **Tells Claude the rules** for leaving a good footnote — names + a search hint,
   max two, and *only* when something is genuinely new.
3. **Hands Claude your current log** so it knows what you've already seen and what
   you've already learned.

Everything happens on your machine. The script makes **no network calls** and
collects **no analytics** — you can read all ~120 lines of it in
[`hooks/footnote-activate.js`](hooks/footnote-activate.js).

---

## Controls

| Type this | Effect |
| --- | --- |
| `footnote off` | Mute the hints (persists across sessions) |
| `footnote on` | Turn them back on |

(`/learn off` and `/learn on` work too.)

---

## Your learning log

Stored at `~/.claude/footnote/learning-log.md`:

```markdown
## Seen once
- lockfile (npm) — 2026-06-16
- hoisting (js) — 2026-06-16

## Learned
- worktree (git) — 2026-06-16
```

It's just a Markdown file. Read it, edit it, back it up, or delete it whenever you
like — footnote will rebuild it next session.

---

## Make it your own

footnote is MIT-licensed and meant to be forked. The behavior lives in two small,
readable places:

- [`hooks/footnote-activate.js`](hooks/footnote-activate.js) — the rules Claude
  receives each session.
- [`skills/footnote/SKILL.md`](skills/footnote/SKILL.md) — the full, human-readable
  spec of the behavior.

Want hints tuned for data science instead of web dev? A different log format? A
weekly recap? Fork it, change those files, point your own
`/plugin marketplace add <you>/footnote` at it. See
[CONTRIBUTING](CONTRIBUTING.md) for the layout.

---

## License

[MIT](LICENSE) — do whatever you want with it.
