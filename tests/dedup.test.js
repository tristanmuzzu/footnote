'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { canonicalKey, parseTermLine, editDistance, classify, findMatch } = require('../hooks/lib/dedup.js');

test('canonicalKey: drops tag, date, case, punctuation', () => {
  assert.strictEqual(canonicalKey('lockfile (npm)'), 'lockfile');
  assert.strictEqual(canonicalKey('Lockfile (package manager)'), 'lockfile');
  assert.strictEqual(canonicalKey('lockfile (npm) · 2026-06-18'), 'lockfile');
  assert.strictEqual(canonicalKey('ports and adapters (architecture)'), 'ports and adapters');
  assert.strictEqual(canonicalKey('CI/CD (devops)'), 'ci cd');
  assert.strictEqual(canonicalKey('node_modules (npm)'), 'node modules');
});

test('canonicalKey: same term, different tag -> same key', () => {
  assert.strictEqual(
    canonicalKey('ports and adapters (architecture)'),
    canonicalKey('Ports and Adapters (arch)')
  );
});

test('parseTermLine: extracts display, tag, key', () => {
  assert.deepStrictEqual(parseTermLine('- lockfile (npm) · 2026-06-18'), {
    display: 'lockfile (npm)', tag: 'npm', key: 'lockfile',
  });
  assert.deepStrictEqual(parseTermLine('- worktree (git) — learned 2026-06-16'), {
    display: 'worktree (git)', tag: 'git', key: 'worktree',
  });
  assert.strictEqual(parseTermLine('not a list line'), null);
  assert.strictEqual(parseTermLine('## Seen once'), null);
});

test('editDistance', () => {
  assert.strictEqual(editDistance('abc', 'abc'), 0);
  assert.strictEqual(editDistance('lockfile', 'lockfle'), 1);
  assert.strictEqual(editDistance('', 'abc'), 3);
});

test('classify: exact / high / low / null', () => {
  assert.strictEqual(classify('lockfile', 'lockfile'), 'exact');
  assert.strictEqual(classify('lock file', 'lockfile'), 'high');    // spacing
  assert.strictEqual(classify('hook', 'hooks'), 'high');            // plural
  assert.strictEqual(classify('dependency', 'dependancy'), 'high'); // 1-char typo, len>=8
  assert.strictEqual(classify('brand new', 'something'), null);
});

test('classify: never merges genuinely different terms (no silent drops)', () => {
  // short one-char-apart words are DIFFERENT terms, must stay separate
  assert.strictEqual(classify('fork', 'work'), null);
  assert.strictEqual(classify('span', 'spam'), null);
  assert.strictEqual(classify('cap', 'cat'), null);
  // unrelated terms
  assert.strictEqual(classify('embeddings', 'endowment'), null);
  assert.strictEqual(classify('throughput', 'concurrency'), null);
});

test('findMatch: best match wins, exact short-circuits', () => {
  const existing = ['throughput', 'lockfile', 'concurrency'];
  assert.deepStrictEqual(findMatch('lock file', existing), { confidence: 'high', key: 'lockfile' });
  assert.deepStrictEqual(findMatch('lockfile', existing), { confidence: 'exact', key: 'lockfile' });
  assert.deepStrictEqual(findMatch('brand new term', existing), { confidence: null, key: null });
});
