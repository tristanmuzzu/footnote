'use strict';
// End-to-end: run the real hook entrypoints as child processes against an
// isolated temp log (FOOTNOTE_HOME + FOOTNOTE_LOG_PATH sandbox it completely,
// so the user's real log and global mute flag are never touched).
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HARVEST = path.join(__dirname, '..', 'hooks', 'footnote-harvest.js');
const ACTIVATE = path.join(__dirname, '..', 'hooks', 'footnote-activate.js');

function sandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'footnote-'));
  const logPath = path.join(home, 'learning-log.md');
  return { home, logPath, env: Object.assign({}, process.env, { FOOTNOTE_HOME: home, FOOTNOTE_LOG_PATH: logPath }) };
}

function transcriptWith(replyText) {
  const line = JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: replyText }] } });
  return line + '\n' + JSON.stringify({ type: 'last-prompt', lastPrompt: 'x' }) + '\n';
}

function runHarvest(env, transcriptPath, extra) {
  const input = JSON.stringify(Object.assign({ transcript_path: transcriptPath, stop_hook_active: false }, extra || {}));
  return execFileSync(process.execPath, [HARVEST], { input, env, encoding: 'utf8' });
}
function runActivate(env) {
  return execFileSync(process.execPath, [ACTIVATE], { input: '{}', env, encoding: 'utf8' });
}
function seenTerms(logPath) {
  const { parseTerms } = require('../hooks/lib/logfile.js');
  return parseTerms(fs.readFileSync(logPath, 'utf8'), 'Seen once');
}
function learnedTerms(logPath) {
  const { parseTerms } = require('../hooks/lib/logfile.js');
  return parseTerms(fs.readFileSync(logPath, 'utf8'), 'Learned');
}
function countAll(logPath) {
  const { countTerms } = require('../hooks/lib/logfile.js');
  return countTerms(fs.readFileSync(logPath, 'utf8'));
}

test('harvester: appends a new term from the finished reply', () => {
  const s = sandbox();
  const tp = path.join(s.home, 't.jsonl');
  fs.writeFileSync(tp, transcriptWith('Done.\n\nLearn next: `closure (js)`, `event loop (node)`'));
  runHarvest(s.env, tp);
  assert.deepStrictEqual(seenTerms(s.logPath), ['closure (js)', 'event loop (node)']);
});

test('harvester: idempotent and drift-proof (no duplicates)', () => {
  const s = sandbox();
  const tp = path.join(s.home, 't.jsonl');
  fs.writeFileSync(tp, transcriptWith('Learn next: `closure (js)`'));
  runHarvest(s.env, tp);
  // same term again -> no dup
  runHarvest(s.env, tp);
  // different tag + case -> still recognized as the same term
  fs.writeFileSync(tp, transcriptWith('Learn next: `Closure (javascript)`'));
  runHarvest(s.env, tp);
  assert.deepStrictEqual(seenTerms(s.logPath), ['closure (js)']);
  assert.strictEqual(countAll(s.logPath), 1);
});

test('harvester: does not resurrect a graduated (Learned) term', () => {
  const s = sandbox();
  fs.writeFileSync(s.logPath, '# log\n\n## Seen once\n\n## Learned\n- closure (js) · learned 2026-06-01\n');
  const tp = path.join(s.home, 't.jsonl');
  fs.writeFileSync(tp, transcriptWith('Learn next: `closure (js)`'));
  runHarvest(s.env, tp);
  assert.deepStrictEqual(seenTerms(s.logPath), []);
  assert.deepStrictEqual(learnedTerms(s.logPath), ['closure (js)']);
});

test('harvester: respects the mute flag', () => {
  const s = sandbox();
  fs.mkdirSync(s.home, { recursive: true });
  fs.writeFileSync(path.join(s.home, 'active'), 'off');
  const tp = path.join(s.home, 't.jsonl');
  fs.writeFileSync(tp, transcriptWith('Learn next: `muted term (x)`'));
  runHarvest(s.env, tp);
  assert.ok(!fs.existsSync(s.logPath) || countAll(s.logPath) === 0);
});

test('harvester: stop_hook_active=true is a no-op (loop guard)', () => {
  const s = sandbox();
  const tp = path.join(s.home, 't.jsonl');
  fs.writeFileSync(tp, transcriptWith('Learn next: `should not add (x)`'));
  runHarvest(s.env, tp, { stop_hook_active: true });
  assert.ok(!fs.existsSync(s.logPath) || countAll(s.logPath) === 0);
});

test('activate: creates log + schedule, injects rules, seeds new term', () => {
  const s = sandbox();
  const tp = path.join(s.home, 't.jsonl');
  fs.writeFileSync(tp, transcriptWith('Learn next: `closure (js)`'));
  runHarvest(s.env, tp);
  const out = runActivate(s.env);
  assert.match(out, /FOOTNOTE MODE ACTIVE/);
  assert.match(out, /Learn next:/);
  const sched = JSON.parse(fs.readFileSync(path.join(s.home, 'schedule.json'), 'utf8'));
  assert.ok(sched.terms.closure, 'closure should be scheduled');
  assert.strictEqual(sched.terms.closure.stage, 0);
});

test('activate: graduates a term past the last interval (markdown move, count preserved)', () => {
  const s = sandbox();
  fs.writeFileSync(s.logPath, '# log\n\n## Seen once\n- promoteme (test) · 2026-01-01\n- keepme (test) · 2026-01-01\n\n## Learned\n');
  // pre-seed schedule: promoteme is at the last stage and overdue
  fs.writeFileSync(path.join(s.home, 'schedule.json'), JSON.stringify({
    version: 2,
    terms: {
      promoteme: { stage: 4, timesSeen: 4, lastSeen: '2026-01-01', nextDue: '2026-01-02', section: 'seen' },
      keepme: { stage: 0, timesSeen: 0, lastSeen: '2026-01-01', nextDue: '2099-01-01', section: 'seen' },
    },
  }));
  const before = countAll(s.logPath);
  const out = runActivate(s.env);
  assert.deepStrictEqual(learnedTerms(s.logPath), ['promoteme (test)']);
  assert.deepStrictEqual(seenTerms(s.logPath), ['keepme (test)']);
  assert.strictEqual(countAll(s.logPath), before); // a move, not add/delete
  assert.match(out, /moved 1 term/);
});

test('append-only: count never decreases across harvest + activate', () => {
  const s = sandbox();
  const tp = path.join(s.home, 't.jsonl');
  fs.writeFileSync(tp, transcriptWith('Learn next: `alpha (x)`, `beta (y)`'));
  runHarvest(s.env, tp);
  const c1 = countAll(s.logPath);
  runActivate(s.env);
  const c2 = countAll(s.logPath);
  fs.writeFileSync(tp, transcriptWith('Learn next: `gamma (z)`'));
  runHarvest(s.env, tp);
  const c3 = countAll(s.logPath);
  assert.ok(c2 >= c1 && c3 >= c2, `counts must not decrease: ${c1} ${c2} ${c3}`);
  assert.strictEqual(c3, 3);
});
