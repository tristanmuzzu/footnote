'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseTerms, countTerms, appendSeen, moveToLearned } = require('../hooks/lib/logfile.js');

const SAMPLE = [
  '# Footnote: Your Learning Log',
  '',
  '## Seen once',
  '- lockfile (npm) · 2026-06-16',
  '- hoisting (js) · 2026-06-16',
  '',
  '## Learned',
  '- worktree (git) · learned 2026-06-15',
  ''
].join('\n');

test('parseTerms: reads both sections', () => {
  assert.deepStrictEqual(parseTerms(SAMPLE, 'Seen once'), ['lockfile (npm)', 'hoisting (js)']);
  assert.deepStrictEqual(parseTerms(SAMPLE, 'Learned'), ['worktree (git)']);
});

test('countTerms: total across sections', () => {
  assert.strictEqual(countTerms(SAMPLE), 3);
});

test('appendSeen: adds to the end of Seen once, count grows, Learned untouched', () => {
  const out = appendSeen(SAMPLE, [{ display: 'mutation (js)', date: '2026-06-18' }]);
  const seen = parseTerms(out, 'Seen once');
  assert.deepStrictEqual(seen, ['lockfile (npm)', 'hoisting (js)', 'mutation (js)']);
  assert.deepStrictEqual(parseTerms(out, 'Learned'), ['worktree (git)']);
  assert.strictEqual(countTerms(out), 4);
});

test('moveToLearned: promotes by canonical key, count stays equal, naming preserved', () => {
  // ask by canonical key 'lockfile' (no tag) - drift must not block the move
  const { md, moved } = moveToLearned(SAMPLE, ['lockfile'], '2026-06-18');
  assert.deepStrictEqual(moved, ['lockfile (npm)']);
  assert.deepStrictEqual(parseTerms(md, 'Seen once'), ['hoisting (js)']);
  assert.deepStrictEqual(parseTerms(md, 'Learned'), ['worktree (git)', 'lockfile (npm)']);
  assert.strictEqual(countTerms(md), countTerms(SAMPLE)); // move, not add/delete
});

test('moveToLearned: no-op when key absent', () => {
  const { md, moved } = moveToLearned(SAMPLE, ['nonexistent'], '2026-06-18');
  assert.deepStrictEqual(moved, []);
  assert.strictEqual(md, SAMPLE);
});

test('append then count guard: count never decreases', () => {
  let md = SAMPLE;
  const before = countTerms(md);
  md = appendSeen(md, [{ display: 'a (x)', date: '2026-06-18' }, { display: 'b (y)', date: '2026-06-18' }]);
  assert.ok(countTerms(md) >= before);
  const r = moveToLearned(md, ['a'], '2026-06-18');
  assert.ok(countTerms(r.md) >= before);
});
