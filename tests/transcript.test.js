'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { lastAssistantText, extractLearnNext } = require('../hooks/lib/transcript.js');

// Mirrors the REAL Claude Code transcript shape verified 2026-06-18: each line a
// JSON object with top-level `type`, assistant entries carrying
// message.content as an array of blocks, one block per line, trailed by meta
// lines (last-prompt / mode / pr-link).
function line(obj) { return JSON.stringify(obj); }
function asst(blocks) { return line({ type: 'assistant', message: { role: 'assistant', content: blocks } }); }
function user(text) { return line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }); }

test('lastAssistantText: pulls the finished reply across split blocks, ignores meta', () => {
  const jsonl = [
    user('do the thing'),
    asst([{ type: 'thinking', thinking: 'planning...' }]),
    asst([{ type: 'tool_use', name: 'Edit', input: {} }]),
    asst([{ type: 'text', text: 'Done.\n\nLearn next: `lockfile (npm)`, `hoisting (js)`' }]),
    line({ type: 'last-prompt', lastPrompt: 'do the thing' }),
    line({ type: 'mode', mode: 'auto' }),
  ].join('\n');
  const txt = lastAssistantText(jsonl);
  assert.match(txt, /Done\./);
  assert.match(txt, /Learn next:/);
});

test('lastAssistantText: stops at the previous user turn', () => {
  const jsonl = [
    asst([{ type: 'text', text: 'OLD reply, should not appear' }]),
    user('new question'),
    asst([{ type: 'text', text: 'NEW reply only' }]),
  ].join('\n');
  assert.strictEqual(lastAssistantText(jsonl), 'NEW reply only');
});

test('lastAssistantText: tolerates blank lines and an empty transcript', () => {
  assert.strictEqual(lastAssistantText(''), '');
  assert.strictEqual(lastAssistantText('\n\n'), '');
});

test('extractLearnNext: backtick items, bold marker, quote marker', () => {
  assert.deepStrictEqual(
    extractLearnNext('Done.\nLearn next: `lockfile (npm)`, `hoisting (js)`'),
    ['lockfile (npm)', 'hoisting (js)']
  );
  assert.deepStrictEqual(
    extractLearnNext('**Learn next:** `mutation (js)`'),
    ['mutation (js)']
  );
  assert.deepStrictEqual(
    extractLearnNext('> Learn next: `worktree (git)`'),
    ['worktree (git)']
  );
});

test('extractLearnNext: nothing when absent', () => {
  assert.deepStrictEqual(extractLearnNext('Just a normal reply with no footnote.'), []);
  assert.deepStrictEqual(extractLearnNext(''), []);
});

test('extractLearnNext: end-to-end from a transcript', () => {
  const jsonl = asst([{ type: 'text', text: 'Fixed it.\n\nLearn next: `pure function (fp)`, `mutation (js)`' }]);
  assert.deepStrictEqual(extractLearnNext(lastAssistantText(jsonl)), ['pure function (fp)', 'mutation (js)']);
});
