// footnote: learning-log markdown surgery (pure, no I/O).
//
// The log has two sections, "## Seen once" (in the spaced-review rotation) and
// "## Learned" (parked). These helpers read and rewrite that markdown as pure
// string transforms; the hooks do the fs read/write + atomic + count guard
// around them. Keeping this pure means every edit path is unit-testable and the
// append-only invariant can be asserted on plain strings.

'use strict';

const { parseTermLine, canonicalKey } = require('./dedup.js');

// Display strings (tag kept, date stripped) listed under "## <section>".
function parseTerms(md, section) {
  const out = [];
  if (!md) return out;
  const after = md.split(new RegExp('^##\\s+' + section + '\\s*$', 'm'))[1];
  if (after === undefined) return out;
  const block = after.split(/^##\s+/m)[0];
  for (const line of block.split('\n')) {
    const p = parseTermLine(line);
    if (p) out.push(p.display);
  }
  return out;
}

// Total terms across both sections. The append-only guard compares this before
// and after every write; it must never decrease.
function countTerms(md) {
  return parseTerms(md, 'Seen once').length + parseTerms(md, 'Learned').length;
}

// Locate a "## <section>" block: returns the [start,end) line indices of the
// block body (the lines after the header, up to the next "## " or EOF).
function locateBlock(lines, section) {
  const headerRe = new RegExp('^##\\s+' + section + '\\s*$');
  let header = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) { header = i; break; }
  }
  if (header === -1) return null;
  let end = lines.length;
  for (let i = header + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return { header, bodyStart: header + 1, bodyEnd: end };
}

// Append new entries to the END of "## Seen once". `items` = [{display, date}].
// Returns the new markdown. Caller is responsible for not passing duplicates.
function appendSeen(md, items) {
  if (!items || !items.length) return md;
  const lines = md.split('\n');
  const loc = locateBlock(lines, 'Seen once');
  const newLines = items.map((it) => '- ' + it.display + ' · ' + it.date);
  if (!loc) {
    // No section: create one at the end (defensive; template normally provides it).
    const tail = md.endsWith('\n') ? '' : '\n';
    return md + tail + '\n## Seen once\n' + newLines.join('\n') + '\n';
  }
  // Insert after the last list item in the block, else right after the header.
  let insertAt = loc.bodyStart;
  for (let i = loc.bodyStart; i < loc.bodyEnd; i++) {
    if (/^\s*-\s+\S/.test(lines[i])) insertAt = i + 1;
  }
  lines.splice(insertAt, 0, ...newLines);
  return lines.join('\n');
}

// Move terms from "## Seen once" to "## Learned". `keys` = canonical keys.
// Preserves each line's original display text; stamps "· learned <date>".
// Returns { md, moved: [displayStrings] }. A move keeps the total count equal.
function moveToLearned(md, keys, date) {
  const wanted = new Set(keys);
  if (!wanted.size) return { md, moved: [] };
  const lines = md.split('\n');
  const seen = locateBlock(lines, 'Seen once');
  if (!seen) return { md, moved: [] };

  const moved = [];
  const removeIdx = [];
  for (let i = seen.bodyStart; i < seen.bodyEnd; i++) {
    const p = parseTermLine(lines[i]);
    if (p && wanted.has(p.key)) {
      moved.push(p.display);
      removeIdx.push(i);
    }
  }
  if (!moved.length) return { md, moved: [] };

  // Remove from Seen once (back to front so indices stay valid).
  for (let k = removeIdx.length - 1; k >= 0; k--) lines.splice(removeIdx[k], 1);

  // Re-locate Learned after the removals and append the moved lines.
  const learned = locateBlock(lines, 'Learned');
  const newLines = moved.map((d) => '- ' + d + ' · learned ' + date);
  if (!learned) {
    const joined = lines.join('\n');
    const tail = joined.endsWith('\n') ? '' : '\n';
    return { md: joined + tail + '\n## Learned\n' + newLines.join('\n') + '\n', moved };
  }
  let insertAt = learned.bodyStart;
  for (let i = learned.bodyStart; i < learned.bodyEnd; i++) {
    if (/^\s*-\s+\S/.test(lines[i])) insertAt = i + 1;
  }
  lines.splice(insertAt, 0, ...newLines);
  return { md: lines.join('\n'), moved };
}

module.exports = { parseTerms, countTerms, appendSeen, moveToLearned, locateBlock, canonicalKey };
