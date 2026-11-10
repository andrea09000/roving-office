# GitHub Copilot CLI

*An observer: it shows Copilot CLI work in the office without changing what the agent does.*

## Install it

```bash
npm run connect:copilot
npm run connect:copilot:status
npm run disconnect:copilot
```

The installer adds a personal Copilot hook file alongside your other hooks, backs up
that file before changing it, and removes only its own entries when disconnected. Start a
**new Copilot CLI session** after installing; hooks are loaded at session start.

Point an office at **Copilot CLI** (press `D`) and give an agent something to do.

## What you get

Sessions, turns, tool activity, context compaction and supported subagents appear in the
office. The built-in `general-purpose` agent does not emit subagent lifecycle hooks, so it
will not appear as a separate character.

The adapter is an observer. It emits no hook decision or prompt, and it cannot approve,
deny, block or rewrite the agent's work.

## Privacy

Copilot hooks receive prompts and tool results on your machine. In the default `metadata`
mode, the adapter does not send their text: it sends a generic desk label and, for tool
results, only a byte count. Tool names, classes, bounded targets and durations remain
visible. Redaction happens before events leave the machine; see
[how much of your prompt the office is told](../connect-your-agents.md#how-much-of-your-prompt-the-office-is-told).

## If nothing shows up

| Symptom | Cause |
| --- | --- |
| Nothing at all | Start a new Copilot CLI session and check `npm run connect:copilot:status` |
| Hooks are installed but silent | Check that Copilot hooks are enabled and its sandbox allows the adapter to run and reach the local office |
| Desk labels read "Working" | The default redaction; that is it working as designed |

For Copilot's hook configuration and sandbox behavior, see the
[official hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference).

## Read next

- [Connect your agents](../connect-your-agents.md) — redaction, office routing and when agents leave
- The event mapping is in the [developer docs](../../developer/adapters/copilot-cli.md)
