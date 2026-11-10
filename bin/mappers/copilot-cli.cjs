'use strict';

const { randomBytes } = require('crypto');
const { makeClassifier, argsOf, targetOf } = require('./lib/tool-classes.cjs');
const { stateFor, defined, resultBytes } = require('./lib/event-shape.cjs');

const CAPABILITIES = [
  'session.start', 'session.end', 'turn.start', 'turn.end',
  'tool.start', 'tool.end', 'context.compact',
];

const TOOL_CLASSES = {
  bash: 'execute', powershell: 'execute', view: 'read',
  create: 'edit', edit: 'edit', apply_patch: 'edit',
  grep: 'search', rg: 'search', glob: 'search',
  web_search: 'network', web_fetch: 'network',
  task: 'agent', update_todo: 'other',
};
const classify = makeClassifier(TOOL_CLASSES);

const END_REASONS = {
  complete: 'exit', error: 'error', abort: 'killed',
  timeout: 'timeout', user_exit: 'clear',
};

function sessionFrom(payload, helpers) {
  const rootId = helpers.firstString(payload.sessionId, payload.session_id, payload.session);
  if (!rootId) return null;
  const agentId = helpers.firstString(payload.agentId, payload.agent_id);
  const subagent = Boolean(agentId && agentId !== rootId);
  const id = subagent ? agentId : rootId;
  const cwd = helpers.firstString(payload.cwd, payload.workingDirectory, payload.working_directory);
  const agentType = subagent
    ? helpers.clamp(helpers.firstString(payload.agentType, payload.agent_type), helpers.CAPS.label)
    : undefined;
  return {
    id,
    ...(cwd ? { cwd } : {}),
    ...(subagent ? { kind: 'subagent', parent_id: rootId } : { kind: 'main' }),
    ...(agentType ? { agent_type: agentType, label: agentType } : {}),
  };
}

function toolArgs(payload) {
  const args = payload.toolArgs ?? payload.tool_args ?? payload.tool_input;
  return args && typeof args === 'object' && !Array.isArray(args) ? args : argsOf(payload);
}

function toolFailed(event, payload) {
  return event === 'postToolUseFailure'
    || payload.success === false
    || Boolean(payload.error && event === 'postToolUse');
}

function map({ event, payload = {}, state, redaction, helpers }) {
  if (event === 'subagentStart') return [];
  const session = sessionFrom(payload, helpers);
  if (!session) return [];

  const sessionState = stateFor(state, session.id);
  if (event === 'subagentStop' && !sessionState.started) return [];
  if (sessionState.ended && event !== 'sessionStart') return [];

  const ts = helpers.toIso(payload.timestamp);
  const out = [];
  const ensureSession = () => {
    if (sessionState.started) return;
    sessionState.started = true;
    sessionState.session = session;
    sessionState.parentId = session.parent_id;
    out.push({
      type: 'session.start',
      ts,
      session,
      payload: {
        source: session.kind === 'subagent'
          ? 'spawn'
          : event === 'sessionStart'
            ? (payload.source === 'resume' ? 'resume' : 'startup')
            : 'attach',
        capabilities: CAPABILITIES,
        redaction,
        transcript: Boolean(payload.transcriptPath ?? payload.transcript_path),
      },
    });
  };
  const closeTurn = (status = 'completed') => {
    if (!sessionState.turnOpen) return;
    sessionState.turnOpen = false;
    out.push({
      type: 'turn.end',
      ts,
      session,
      payload: defined({
        turn_id: sessionState.turnId,
        status,
        duration_ms: sessionState.turnAt ? Date.now() - sessionState.turnAt : undefined,
      }),
    });
    sessionState.turnId = undefined;
    sessionState.errorOccurred = false;
  };
  const openTurn = (prompt, trigger) => {
    if (sessionState.turnOpen) closeTurn();
    sessionState.turnOpen = true;
    sessionState.turnAt = Date.now();
    sessionState.turnId = helpers.firstString(payload.turnId, payload.promptId);
    out.push({
      type: 'turn.start',
      ts,
      session,
      payload: defined({
        turn_id: sessionState.turnId,
        title: redaction === 'metadata'
          ? 'Working'
          : helpers.clamp(String(prompt ?? 'Working').split('\n')[0], helpers.CAPS.title) ?? 'Working',
        trigger,
        prompt: redaction === 'full' ? helpers.clamp(prompt, helpers.CAPS.prompt) : undefined,
        prompt_chars: typeof prompt === 'string' ? prompt.length : undefined,
      }),
    });
  };
  const closeTools = (status) => {
    for (const [id, tool] of Object.entries(sessionState.tools ?? {})) {
      out.push({
        type: 'tool.end',
        ts,
        session,
        payload: {
          tool_call_id: id,
          tool_name: tool.toolName,
          tool_class: tool.toolClass,
          status,
        },
      });
    }
    sessionState.tools = {};
  };

  ensureSession();

  switch (event) {
    case 'sessionStart':
      break;
    case 'userPromptSubmitted':
      openTurn(helpers.firstString(payload.prompt), 'user');
      break;
    case 'preToolUse': {
      const toolName = helpers.clamp(
        helpers.firstString(payload.toolName, payload.tool_name) ?? 'tool',
        helpers.CAPS.label,
      );
      const args = toolArgs(payload);
      const command = helpers.firstString(args.command, args.cmd);
      const id = helpers.firstString(payload.toolCallId, payload.tool_call_id)
        ?? `${session.id}:copilot:${Date.now()}:${process.pid}:${randomBytes(4).toString('hex')}`;
      if (!sessionState.turnOpen) openTurn(undefined, session.kind === 'subagent' ? 'parent' : undefined);
      const toolClass = classify(toolName, command);
      sessionState.tools[id] = { toolName, toolClass, at: Date.now() };
      out.push({
        type: 'tool.start',
        ts,
        session,
        payload: {
          tool_call_id: id,
          tool_name: toolName,
          tool_class: toolClass,
          target: targetOf(args, command, session.cwd, helpers, redaction),
        },
      });
      break;
    }
    case 'postToolUse':
    case 'postToolUseFailure': {
      const toolName = helpers.clamp(
        helpers.firstString(payload.toolName, payload.tool_name) ?? 'tool',
        helpers.CAPS.label,
      );
      const knownId = helpers.firstString(payload.toolCallId, payload.tool_call_id);
      const id = knownId && sessionState.tools?.[knownId]
        ? knownId
        : Object.keys(sessionState.tools ?? {}).find((key) => sessionState.tools[key]?.toolName === toolName);
      const known = id ? sessionState.tools[id] : null;
      const failed = toolFailed(event, payload);
      out.push({
        type: 'tool.end',
        ts,
        session,
        payload: defined({
          tool_call_id: id ?? `${session.id}:copilot:unknown`,
          tool_name: toolName,
          tool_class: known?.toolClass ?? classify(toolName),
          status: failed ? 'error' : 'ok',
          duration_ms: known?.at ? Date.now() - known.at : undefined,
          error: failed && redaction !== 'metadata'
            ? helpers.clamp(helpers.firstString(payload.error), helpers.CAPS.message)
            : undefined,
          result_bytes: resultBytes(payload.toolResult ?? payload.tool_result),
        }),
      });
      if (id) delete sessionState.tools[id];
      break;
    }
    case 'agentStop':
      closeTurn(sessionState.errorOccurred ? 'error' : 'completed');
      break;
    case 'subagentStop':
      closeTurn('completed');
      closeTools('cancelled');
      sessionState.ended = true;
      out.push({ type: 'session.end', ts, session, payload: { reason: 'exit' } });
      break;
    case 'sessionEnd': {
      const reason = END_REASONS[String(payload.reason ?? '').toLowerCase()] ?? 'other';
      closeTurn(reason === 'error' ? 'error' : (reason === 'killed' || reason === 'clear' ? 'cancelled' : 'completed'));
      closeTools('cancelled');
      sessionState.ended = true;
      out.push({ type: 'session.end', ts, session, payload: { reason } });
      break;
    }
    case 'preCompact': {
      const trigger = payload.trigger === 'manual' || payload.trigger === 'auto' ? payload.trigger : undefined;
      out.push({ type: 'context.compact', ts, session, payload: defined({ trigger }) });
      break;
    }
    case 'errorOccurred':
      if (payload.recoverable === false) sessionState.errorOccurred = true;
      break;
    default:
      break;
  }
  return out;
}

module.exports = { map, CAPABILITIES, TOOL_CLASSES, classify };
