'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plan } = require('../bin/aop-copilot-install.cjs');

test('Copilot installer adds observer hooks without changing other events', () => {
  const { next } = plan({ version: 1, hooks: { notification: [{ type: 'http', url: 'https://example.test' }] } });
  assert.equal(next.hooks.sessionStart.length, 1);
  assert.equal(next.hooks.preToolUse.length, 1);
  assert.equal(next.hooks.notification[0].url, 'https://example.test');
  assert.deepEqual(next.hooks.preToolUse[0].args.slice(1), ['copilot-cli', 'preToolUse']);
  assert.equal(next.hooks.preToolUse[0].timeoutSec, 5);
});

test('Copilot uninstall removes only its own hook entries', () => {
  const installed = plan({ version: 1, hooks: { sessionStart: [{ type: 'command', exec: 'keep-me' }] } }).next;
  const { next } = plan(installed, true);
  assert.deepEqual(next.hooks.sessionStart, [{ type: 'command', exec: 'keep-me' }]);
  assert.equal(next.hooks.preToolUse, undefined);
});

test('Copilot installer refuses malformed configs instead of replacing them', () => {
  assert.throws(() => plan({ version: 2 }), /Unsupported Copilot hooks config version/);
  assert.throws(() => plan({ version: 1, hooks: { preToolUse: {} } }), /must be an array/);
});
