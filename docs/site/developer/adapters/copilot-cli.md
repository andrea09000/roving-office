# Copilot CLI adapter

*Installing it is [Copilot CLI](../../user/sources/copilot-cli.md). This is the mapping.*

The adapter uses Copilot CLI's user-level command hooks and the shared AOP sender. It
returns no hook output, so it observes work without making permission or prompt decisions.

## Hook → AOP

| Copilot CLI hook | AOP event |
| --- | --- |
| `sessionStart` / `sessionEnd` | `session.start` / `session.end` |
| `userPromptSubmitted` | `turn.start` |
| `preToolUse` / `postToolUse` / `postToolUseFailure` | `tool.start` / `tool.end` |
| `agentStop` | `turn.end` |
| `subagentStop` | child `session.end` |
| `preCompact` | `context.compact` |
| non-recoverable `errorOccurred` | next `turn.end` has status `error` |

`subagentStart` does not provide a child ID. A child session is introduced when one of its
own hooks first arrives with `agentId`, and is linked to the root `sessionId`; its stop
event closes it. This is an approximate parent link, not a spawning tool-call link.

Copilot does not provide a tool-call ID in its hook payloads. The mapper matches a
completion to the oldest active call with the same tool name. When identical tools run
concurrently, the displayed duration may be approximate. The local state stores only the
generated event ID, tool name, class and start time — never tool arguments or results.

## Redaction

In `metadata` mode, prompts and tool-result text are not sent. Tool-result size is reduced
locally to a byte count; tool targets pass through the shared redaction rules. `summary`
and `full` follow the AOP redaction contract. See
[spec §10](../protocol/aop-spec.md#10-privacy-and-redaction).

## Installation

The installer writes `~/.copilot/hooks/roving-office.json` (or
`$COPILOT_HOME/hooks/roving-office.json`) using the documented version-1 hook format.
It preserves other hook entries, backs up its config before updating it, writes the file
with mode `0600`, and supports dry-run, status and uninstall.

Copilot CLI runs hooks inside its local session sandbox when that sandbox is enabled.
The adapter checkout and the local office endpoint must be accessible there; the hook
does not expand sandbox permissions itself.

## Read next

- [Adapter notes](../protocol/aop-harness-adapters.md) — shared measurements
- [The AOP spec](../protocol/aop-spec.md) — the wire format
- [Extending the office](../extending.md#add-a-harness-adapter) — adding another one
