// footnote: transcript reading + "Learn next" extraction (pure, no I/O).
//
// Claude Code writes each session to a JSONL transcript. Verified shape
// (2026-06-18): one JSON object per line with a top-level `type`
// ("assistant" | "user" | meta types like "last-prompt"/"mode"/"pr-link").
// An assistant entry carries `message.role === "assistant"` and
// `message.content` as an ARRAY of blocks ({ type: "text" | "thinking" |
// "tool_use", ... }). A single assistant turn is split across lines, one
// content block per line, and the final prose (where a "Learn next" footnote
// lives) is in the trailing `text` block(s).
//
// lastAssistantText(jsonl) returns the text of the finished reply: it walks
// from the end, skips meta lines, and concatenates the contiguous run of
// assistant `text` blocks that ends the conversation (stopping at the first
// real user message or tool result). Both functions are pure: the Stop hook
// does the fs read and hands the string in here, so this is unit-testable
// against the real transcript format.

'use strict';

function textOfAssistantLine(obj) {
  const msg = obj && obj.message ? obj.message : obj;
  if (!msg || msg.role !== 'assistant') return null;
  const content = msg.content;
  if (typeof content === 'string') return content;       // tolerate a flat shape too
  if (!Array.isArray(content)) return null;
  const parts = content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text);
  return parts.length ? parts.join('\n') : null;
}

// Is this entry a real conversational user turn (a prompt or a tool result),
// i.e. a boundary that ends the assistant's final turn when scanning backwards?
function isUserBoundary(obj) {
  if (!obj) return false;
  if (obj.type === 'user') return true;
  const msg = obj.message;
  return !!(msg && msg.role === 'user');
}

function lastAssistantText(jsonl) {
  if (!jsonl) return '';
  const lines = String(jsonl).split('\n');
  const collected = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i].trim();
    if (!ln) continue;
    let obj;
    try { obj = JSON.parse(ln); } catch (e) { continue; }
    const t = textOfAssistantLine(obj);
    if (t !== null) {
      collected.push(t);
      continue;
    }
    // Non-text assistant blocks (thinking/tool_use) are skipped without ending
    // the run; a real user prompt or tool result ends it.
    if (isUserBoundary(obj)) {
      if (collected.length) break;   // we've passed the final assistant turn
    }
  }
  return collected.reverse().join('\n').trim();
}

// Pull the "Learn next" footnote items out of a reply. Matches the documented
// format: a line like  Learn next: `term1 (tag)`, `term2 (tag)`
// (optionally **bold** "Learn next", any leading "> " quote marker). Returns the
// raw backtick-wrapped items as display strings, e.g. ["lockfile (npm)", ...].
function extractLearnNext(text) {
  const out = [];
  if (!text) return out;
  const re = /^[>\s]*\**\s*learn\s+next\s*:?\**\s*(.+)$/gim;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tail = m[1];
    const items = tail.match(/`([^`]+)`/g);
    if (items) {
      for (const it of items) {
        const term = it.replace(/`/g, '').trim();
        if (term) out.push(term);
      }
    } else {
      // no backticks: fall back to comma-splitting the tail, stripping bold/markup
      for (const piece of tail.split(',')) {
        const term = piece.replace(/[*_`]/g, '').trim();
        if (term) out.push(term);
      }
    }
  }
  return out;
}

module.exports = { lastAssistantText, extractLearnNext, textOfAssistantLine };
