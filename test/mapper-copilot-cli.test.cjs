'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../bin/mappers/copilot-cli.cjs');
const { driver } = require('./lib/mapper.cjs');

const base = (extra = {}) => ({
  sessionId: 'copilot-1',
  cwd: '/work/repo',
  timestamp: 1735689600000,
  ...extra,
});
const fire = driver(mapper);

test('Copilot CLI lifecycle and tools map to AOP without forwarding metadata text', () => {
  const state = { sessions: {} };
  assert.equal(fire(state, 'sessionStart', base()).at(0).type, 'session.start');
  const turn = fire(state, 'userPromptSubmitted', base({ prompt: 'private task' }), { redaction: 'metadata' });
  assert.equal(turn.at(0).payload.title, 'Working');
  assert.equal(turn.at(0).payload.prompt, undefined);
  const start = fire(state, 'preToolUse', base({
    toolName: 'view',
    toolArgs: { file_path: '/work/repo/private.txt' },
  }), { redaction: 'metadata' });
  assert.equal(start.at(0).payload.tool_class, 'read');
  assert.equal(start.at(0).payload.target, 'private.txt');
  const end = fire(state, 'postToolUse', base({
    toolName: 'view',
    toolArgs: { file_path: '/work/repo/private.txt' },
    toolResult: { resultType: 'success', textResultForLlm: 'private result' },
  }), { redaction: 'metadata' });
  assert.equal(end.at(0).type, 'tool.end');
  assert.equal(end.at(0).payload.status, 'ok');
  assert.equal(end.at(0).payload.result_bytes, Buffer.byteLength(JSON.stringify({
    resultType: 'success', textResultForLlm: 'private result',
  })));
  assert.equal(JSON.stringify(end).includes('private result'), false);
  assert.equal(fire(state, 'agentStop', base()).at(0).type, 'turn.end');
});

test('Copilot CLI failures and compaction expose only bounded event metadata', () => {
  const state = { sessions: {} };
  fire(state, 'userPromptSubmitted', base({ prompt: 'work' }));
  fire(state, 'preToolUse', base({ toolName: 'bash', toolArgs: { command: 'echo secret' } }));
  const failed = fire(state, 'postToolUseFailure', base({
    toolName: 'bash', error: 'secret failure text',
  }), { redaction: 'metadata' });
  assert.equal(failed.at(0).payload.status, 'error');
  assert.equal(failed.at(0).payload.error, undefined);
  assert.equal(JSON.stringify(failed).includes('secret'), false);
  assert.equal(fire(state, 'preCompact', base({ trigger: 'manual' })).at(0).payload.trigger, 'manual');
  const ended = fire(state, 'sessionEnd', base({ reason: 'user_exit' }));
  assert.deepEqual(ended.at(-1).payload, { reason: 'clear' });
});

test('Copilot subagent tool hooks create a child session and stop it without response text', () => {
  const state = { sessions: {} };
  const child = base({ agentId: 'agent-1', agentType: 'research', toolName: 'web_search' });
  const started = fire(state, 'preToolUse', child);
  assert.equal(started[0].session.id, 'agent-1');
  assert.equal(started[0].session.parent_id, 'copilot-1');
  assert.equal(started[0].session.kind, 'subagent');
  assert.equal(started[0].type, 'session.start');
  assert.equal(started.at(-1).payload.tool_class, 'network');
  const stopped = fire(state, 'subagentStop', base({
    agentId: 'agent-1', agentType: 'research', response: 'private subagent result',
  }));
  assert.equal(stopped.at(-1).type, 'session.end');
  assert.equal(JSON.stringify(stopped).includes('private subagent result'), false);
});
