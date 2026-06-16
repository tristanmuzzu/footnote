#!/usr/bin/env node
// footnote: Claude Code UserPromptSubmit hook
//
// Watches each prompt for mute and unmute commands and flips the flag file the
// SessionStart hook reads. Stays silent on every other prompt.
//
// Reliability: silent-fails on every error, so it never blocks a prompt.

const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = path.join(os.homedir(), '.claude', 'footnote');
const flagPath = path.join(dir, 'active');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

let prompt = '';
try {
  const data = JSON.parse(readStdin() || '{}');
  prompt = (data.prompt || data.userPrompt || '').toString().toLowerCase().trim();
} catch (e) {
  // Ignore: nothing to do without a prompt.
}

const MUTE = ['footnote off', '/learn off', 'stop footnote', 'mute footnote', 'disable footnote'];
const UNMUTE = ['footnote on', '/learn on', 'resume footnote', 'start footnote', 'enable footnote'];

try {
  fs.mkdirSync(dir, { recursive: true });
  if (MUTE.some((p) => prompt.includes(p))) {
    fs.writeFileSync(flagPath, 'off');
    process.stdout.write(
      "FOOTNOTE muted. Stop appending 'Learn next' hints from now on. Type 'footnote on' to resume."
    );
  } else if (UNMUTE.some((p) => prompt.includes(p))) {
    fs.writeFileSync(flagPath, 'on');
    process.stdout.write(
      "FOOTNOTE re-enabled. Resume appending 'Learn next' hints when unfamiliar dev terms appear."
    );
  }
} catch (e) {
  // Silent fail.
}
