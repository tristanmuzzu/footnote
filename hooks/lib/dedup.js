// footnote: naming-drift dedup (pure, no I/O).
//
// The agent is bad at exact-string consistency; code is good at it. So all term
// matching lives here as pure functions the hooks call. Nothing in this file
// reads or writes a file, so it is trivially unit-testable.
//
// Canonical key  = lowercase, drop the "(tag)", drop a trailing date, turn
//                  punctuation into spaces, collapse whitespace. "lockfile (npm)"
//                  and "Lockfile (package manager)" both key to "lockfile".
// findMatch tiers = exact > high (space/typo/plural) > low (loose edit distance).
//                  high+ are treated as the same term (skip the add); low is a
//                  near-miss the caller ADDS but logs, so a genuinely new term is
//                  never silently dropped.

'use strict';

// Strip a trailing date stamp ("· 2026-06-18", "— learned 2026-06-18", etc.).
const TRAILING_DATE = /\s*(?:[—·-]\s*)?(?:learned\s+)?\d{4}-\d{2}-\d{2}\s*$/i;
// Strip a trailing "(tag)".
const TRAILING_TAG = /\s*\([^)]*\)\s*$/;

function stripDate(s) {
  return String(s == null ? '' : s).replace(TRAILING_DATE, '').trim();
}

// Display form = the human term with its tag, date removed. "- lockfile (npm) · 2026" -> "lockfile (npm)".
function parseTermLine(line) {
  const m = String(line == null ? '' : line).match(/^\s*-\s+(.*\S)\s*$/);
  if (!m) return null;
  const display = stripDate(m[1]);
  if (!display) return null;
  const tagMatch = display.match(/\(([^)]*)\)\s*$/);
  return { display, tag: tagMatch ? tagMatch[1].trim() : null, key: canonicalKey(display) };
}

function canonicalKey(term) {
  let s = stripDate(term);
  s = s.replace(TRAILING_TAG, '');     // drop the (tag)
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9 ]+/g, ' ');  // punctuation -> space
  s = s.replace(/\s+/g, ' ').trim();   // collapse whitespace
  return s;
}

// Bounded Levenshtein. Keys are short, so the full DP is cheap.
function editDistance(a, b) {
  a = String(a); b = String(b);
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    let cur = [i];
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[bl];
}

function compact(key) {
  return key.replace(/ /g, '');
}

function isPlural(a, b) {
  // one is the other plus a trailing s/es (on the space-removed form)
  const x = compact(a), y = compact(b);
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long === short + 's' || long === short + 'es';
}

// Compare a candidate canonical key against one existing canonical key.
// Returns 'exact' | 'high' | 'low' | null (null = different terms).
//
// Conservative by design: short words that differ by a character are usually
// DIFFERENT terms (fork/work, span/spam), and a false merge silently drops a
// real new term, the one outcome we refuse. So the edit-distance tier only
// fires on long terms, where a single-char difference is almost certainly a
// typo of the same word. Case/tag/spacing/plural are the common drift and are
// matched directly regardless of length.
function classify(candKey, existKey) {
  if (!candKey || !existKey) return null;
  if (candKey === existKey) return 'exact';
  const ca = compact(candKey), cb = compact(existKey);
  if (ca === cb) return 'high';                  // spacing: "lock file" vs "lockfile"
  if (isPlural(candKey, existKey)) return 'high';// "hook" vs "hooks"
  const minLen = Math.min(ca.length, cb.length);
  const dist = editDistance(ca, cb);
  if (dist <= 1 && minLen >= 8) return 'high';   // one-char typo on a long word
  if (dist <= 2 && minLen >= 12) return 'low';   // loose near-miss on a very long term
  return null;
}

// Match a candidate canonical key against a list of existing canonical keys.
// Returns { confidence, key } for the best (most confident) match, or
// { confidence: null, key: null } if nothing matches.
function findMatch(candKey, existingKeys) {
  let best = { confidence: null, key: null };
  const rank = { exact: 3, high: 2, low: 1 };
  for (const k of existingKeys) {
    const c = classify(candKey, k);
    if (!c) continue;
    if (best.confidence === null || rank[c] > rank[best.confidence]) {
      best = { confidence: c, key: k };
      if (c === 'exact') break;
    }
  }
  return best;
}

module.exports = { canonicalKey, parseTermLine, editDistance, classify, findMatch, stripDate };
