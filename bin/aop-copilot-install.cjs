#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { scaffoldAll, statusLines, checkAdapter } = require('./lib/local-config.cjs');
const { flags } = require('./lib/cli-flags.cjs');

const HARNESS = 'copilot-cli';
const COPILOT_HOME = path.resolve(process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot'));
const CONFIG = path.join(COPILOT_HOME, 'hooks', 'roving-office.json');
const ADAPTER = path.join(__dirname, 'aop-send.cjs');
const LAUNCHER = path.join(__dirname, 'aop-node.sh');
const HOOKS = [
  'sessionStart', 'sessionEnd', 'userPromptSubmitted', 'preToolUse', 'postToolUse',
  'postToolUseFailure', 'agentStop', 'subagentStart', 'subagentStop', 'preCompact',
  'errorOccurred',
];

function command(hook, { adapter = ADAPTER, launcher = LAUNCHER } = {}) {
  return {
    type: 'command',
    exec: launcher,
    args: [adapter, HARNESS, hook],
    timeoutSec: 5,
  };
}

function ours(entry) {
  return entry?.type === 'command'
    && typeof entry.exec === 'string'
    && path.basename(entry.exec) === path.basename(LAUNCHER)
    && Array.isArray(entry.args)
    && typeof entry.args[0] === 'string'
    && path.basename(entry.args[0]) === path.basename(ADAPTER)
    && entry.args[1] === HARNESS;
}

function readConfig(file) {
  if (!fs.existsSync(file)) return {};
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid Copilot hooks config: ${file} must contain a JSON object.`);
  }
  return parsed;
}

function plan(doc, uninstall = false, options = {}) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('Invalid Copilot hooks config: expected a JSON object.');
  }
  const next = structuredClone(doc ?? {});
  if (next.version !== undefined && next.version !== 1) {
    throw new Error(`Unsupported Copilot hooks config version: ${next.version}`);
  }
  next.version = 1;
  if (next.hooks !== undefined && (!next.hooks || typeof next.hooks !== 'object' || Array.isArray(next.hooks))) {
    throw new Error('Invalid Copilot hooks config: "hooks" must be an object.');
  }
  next.hooks ??= {};
  const actions = [];
  for (const hook of HOOKS) {
    const entries = next.hooks[hook] === undefined ? [] : next.hooks[hook];
    if (!Array.isArray(entries)) throw new Error(`Invalid Copilot hooks config: "${hook}" must be an array.`);
    const index = entries.findIndex(ours);
    if (uninstall) {
      if (index >= 0) {
        entries.splice(index, 1);
        actions.push(`${hook}: removed`);
      }
    } else if (index < 0) {
      entries.push(command(hook, options));
      actions.push(`${hook}: added`);
    } else {
      const replacement = command(hook, options);
      if (JSON.stringify(entries[index]) !== JSON.stringify(replacement)) {
        entries[index] = replacement;
        actions.push(`${hook}: updated`);
      }
    }
    if (entries.length) next.hooks[hook] = entries;
    else delete next.hooks[hook];
  }
  if (!Object.keys(next.hooks).length) delete next.hooks;
  return { next, actions };
}

function writeConfig(file, current, next) {
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.existsSync(file)) {
    const backup = `${file}.bak.roving-office`;
    fs.copyFileSync(file, backup);
    fs.chmodSync(backup, 0o600);
  }
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function main() {
  const { flag, value, help } = flags(process.argv.slice(2));
  if (help) {
    console.log('usage: aop-copilot-install.cjs [--dry-run|--status|--uninstall] [--config <path>] [--adapter <path>] [--launcher <path>]');
    return 0;
  }

  const adapter = value('--adapter') ? path.resolve(value('--adapter')) : ADAPTER;
  const launcher = value('--launcher') ? path.resolve(value('--launcher')) : LAUNCHER;
  const file = value('--config') ? path.resolve(value('--config')) : CONFIG;

  let current;
  try {
    current = readConfig(file);
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  if (flag('--status')) {
    console.log(`Hooks file: ${file}`);
    for (const hook of HOOKS) {
      const installed = Array.isArray(current.hooks?.[hook]) && current.hooks[hook].some(ours);
      console.log(`  ${hook.padEnd(22)} ${installed ? 'office hook installed' : 'not installed'}`);
    }
    statusLines(adapter).forEach((line) => console.log(line));
    return 0;
  }

  if (!flag('--uninstall')) {
    const checked = checkAdapter(adapter);
    if (!checked.ok) {
      checked.notes.forEach((note) => console.error(note));
      return 1;
    }
  }

  let next;
  let actions;
  try {
    ({ next, actions } = plan(current, flag('--uninstall'), { adapter, launcher }));
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  console.log(`${flag('--uninstall') ? 'Uninstall' : 'Install'} plan for ${file}`);
  console.log(actions.length ? actions.map((action) => `  ${action}`).join('\n') : '  nothing to do');
  if (flag('--dry-run')) {
    console.log(JSON.stringify(next, null, 2));
    return 0;
  }
  if (flag('--uninstall') && actions.length === 0) return 0;

  try {
    writeConfig(file, current, next);
  } catch (error) {
    console.error(`Could not update Copilot hooks config ${file}: ${error.message}`);
    return 1;
  }

  if (!flag('--uninstall')) {
    scaffoldAll(adapter).lines.forEach((line) => console.log(line));
    console.log('Start a new Copilot CLI session to load the hooks.');
  }
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { command, ours, plan, readConfig, main };
