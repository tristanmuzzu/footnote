<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/memo_1f4dd.png" width="96" alt="footnote" />
</p>

<h1 align="center">footnote</h1>

<p align="center">
  <strong>the more you know</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
  <a href="#install"><img src="https://img.shields.io/badge/Claude%20Code-plugin-2d6cdf" alt="Claude Code plugin"></a>
  <a href="#how-it-works"><img src="https://img.shields.io/badge/privacy-local--only-2ea44f" alt="Local only, no telemetry"></a>
</p>

<p align="center">
  <a href="#beforeafter">Before/After</a> &nbsp;•&nbsp;
  <a href="#install">Install</a> &nbsp;•&nbsp;
  <a href="#how-it-works">How it works</a> &nbsp;•&nbsp;
  <a href="#make-it-yours">Make it yours</a>
</p>

---

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin that teaches you while you code.

When Claude answers and reaches for a word a beginner wouldn't know yet (a tool, a command, some bit of jargon), it leaves a small footnote at the bottom pointing you to it. No definitions, just the term and a hint about where it lives, so you can look it up when you feel like it. Do that for a few weeks and the stuff that used to read like magic starts to make sense.

Then it does the part that actually makes things stick: it brings each term back for a quick recall check at growing intervals (spaced repetition), so you meet it a few times over weeks instead of seeing it once and forgetting it. Everything it shows you lives in a local log it only ever adds to.

> "You miss 100% of the words you don't look up."
>
> *Wayne Gretzky*
>
> *Michael Scott*

## Before/After

<table>
<tr>
<th width="50%">Without footnote</th>
<th width="50%">With footnote</th>
</tr>
<tr>
<td>

Done. I added the package and committed the lockfile.

</td>
<td>

Done. I added the package and committed the lockfile.

**Learn next:** `lockfile (npm)`, `transitive dependency (npm)`

</td>
</tr>
<tr>
<td>

Fixed it. The function was changing the array in place, so I made it return a new one instead.

</td>
<td>

Fixed it. The function was changing the array in place, so I made it return a new one instead.

**Learn next:** `mutation (js)`, `pure function (fp)`

</td>
</tr>
</table>

**Same answer. You just walk away knowing a little more than you did.**

## What you get

| | |
| --- | --- |
| **Footnotes that know when to shut up** | A `Learn next` line shows up only when a reply genuinely uses a word you might not know. No spam, no lectures, capped at two. |
| **Spaced repetition** | Terms come back for a quick recall check at growing intervals (a day, a few days, a week, a month) until they stick, then graduate to *Learned*. Seeing a word twice and forgetting it is exactly what this fixes. |
| **Stays out of your way** | New-term hints come at the *end* of a reply; the spaced review is one short check at *session start*, never mid-task. It injects only what's due, so it never bloats your context. |
| **It's yours, and it's private** | Your log lives on your own machine at `~/.claude/footnote/learning-log.md`. No network calls. No analytics. Nothing leaves your computer. |
| **Mute whenever** | Type `footnote off` to pause it, `footnote on` to bring it back. |
| **Runs anywhere** | The hooks are plain Node, so they behave the same on Windows, macOS, and Linux. |

## Install

Inside Claude Code, run two commands:

```text
/plugin marketplace add tristanmuzzu/footnote
/plugin install footnote@footnote
```

Or from your terminal:

```bash
claude plugin marketplace add tristanmuzzu/footnote
claude plugin install footnote@footnote
```

Open a fresh session and it's on. You'll need Node on your `PATH`, which you almost certainly already have if you're running Claude Code.

## How it works

No mystery here. Claude Code lets a plugin run small scripts at certain moments, and those scripts do all the bookkeeping so Claude can stay focused on your actual question. Two of them:

1. **At session start**, a scheduler makes sure your log exists (and keeps rolling backups), works out which terms are *due* for a refresh today, hands Claude a short list (at most three) plus the rules for a good footnote, and quietly moves any term that has stuck into *Learned*.
2. **When a reply finishes**, a harvester reads the "Learn next" line off the end of it and adds any genuinely new terms to your log. It recognizes a term you already have even if it is named a little differently, so your log never fills up with near-duplicates.

That split is the whole point: Claude just leaves hints and runs the recall check, while the scripts handle the dates, the writing, and the deduplication. They only ever feed Claude what is due, never your whole log, so it stays light as your list grows. Everything happens on your machine: zero network calls, nothing collected. The logic lives in a few short, readable files under [`hooks/`](hooks/).

## Your learning log

It's just a Markdown file at `~/.claude/footnote/learning-log.md`:

```markdown
## Seen once
- lockfile (npm) · 2026-06-16
- hoisting (js) · 2026-06-16

## Learned
- worktree (git) · 2026-06-16
```

`## Seen once` is the rotation it's still quizzing you on; `## Learned` is what has stuck. Read it, edit it, back it up, or delete it (footnote rebuilds it next session if it's gone). The spacing schedule lives in a separate hidden file beside it, so this one stays clean and human-readable.

footnote only ever **adds** to this file. It appends new terms and promotes them as you learn, but it never deletes terms you've collected or rewrites the file. Your backlog is safe.

## Make it yours

footnote is MIT licensed and built to be forked. The behavior lives in a handful of small, readable files:

- [`hooks/footnote-activate.js`](hooks/footnote-activate.js) is the session-start scheduler (what's due, the rules, promotions).
- [`hooks/footnote-harvest.js`](hooks/footnote-harvest.js) is the harvester that captures new terms when a reply ends.
- [`hooks/lib/`](hooks/lib) holds the pure, unit-tested pieces (dedup, transcript parsing, log editing).
- [`skills/footnote/SKILL.md`](skills/footnote/SKILL.md) spells the behavior out in plain language.

Want hints tuned for data science instead of web dev? A different log format? A weekly recap? Change those files, run `npm test` to make sure you didn't break anything, push your fork, and point your own `claude plugin marketplace add <you>/footnote` at it. The layout is in [CONTRIBUTING](CONTRIBUTING.md).

## Star it

If footnote teaches you something you're glad to know, a star helps other people find it. ⭐

## License

MIT. Take it, fork it, make it yours.
