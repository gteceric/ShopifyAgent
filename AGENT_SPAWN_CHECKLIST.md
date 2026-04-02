# AGENT_SPAWN_CHECKLIST.md

Use this checklist before spawning an agent.

## Required

- Agent role: which role is this agent using?
- Current task: what exactly should it do?
- Scope: which feature, files, or folders are relevant?
- Boundaries: can it edit files or is it read-only?
- Output: what should it return?

## Coordination

- Ownership: which files or feature slice does it own?
- Overlap: are other agents touching the same area?
- Handoff: who will use the result next?

## Helpful Extras

- Constraints: speed, caution, style, or implementation limits
- Validation: tests, lint, or checks it should run
- References: docs, files, or prior findings to read first

## Quick Template

```text
You are [AgentName]. Use /Users/ericleung/.openclaw/workspace/shopify-agent/AGENT_TEAM.md as your role guide.

Task: [exact task]
Scope: [files, folders, or feature area]
Boundaries: [edit allowed / read-only]
Output: [summary, findings, patch, tests, plan]
Constraints: [optional]
Handoff: [who uses this next]
```

