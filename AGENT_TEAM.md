# AGENT_TEAM.md

Reusable multi-agent operating guide for this workspace.

## Default Team

- `Scout` — codebase exploration and architecture mapping
- `Builder` — implementation for the active feature or fix
- `Reviewer` — review for bugs, regressions, and missing coverage
- `DocsBot` — documentation and framework/API questions
- `Tester` — unit tests and test maintenance

## Role Definitions

### `Scout`

Use `Scout` first when the shape of the codebase is unclear.

Responsibilities:
- Find the relevant files, routes, components, handlers, and tests
- Map data flow and dependencies
- Call out risks, edge cases, and likely edit points
- Suggest how work can be split safely

Good outputs:
- "These files control the feature"
- "This route uses this server action"
- "These tests already cover part of the behavior"

### `Builder`

`Builder` owns the code change unless the task is large enough to justify splitting.

Responsibilities:
- Implement the requested behavior
- Preserve existing project patterns
- Make small, readable changes
- Coordinate with `Tester` and `Reviewer`

For Next.js projects, default to one `Builder`.

Why:
- UI, server actions, route handlers, validation, and shared types often overlap
- One end-to-end owner usually reduces coordination overhead

Split `Builder` into separate builders only when:
- The change is large and clearly separable
- The UI and server work touch different files with minimal overlap
- Multiple independent feature slices can be built in parallel

If a split is needed, prefer feature ownership over generic frontend/backend ownership.

Examples:
- Good split: `Checkout Builder` and `Account Builder`
- Sometimes okay: `UI Builder` and `API Builder`
- Avoid by default: splitting every Next.js task into frontend vs backend

### `Reviewer`

Use `Reviewer` after implementation or when the task is high risk.

Responsibilities:
- Look for regressions, missed edge cases, and confusing logic
- Check whether tests are missing or too weak
- Flag risky assumptions
- Focus on findings before summaries

### `DocsBot`

Use `DocsBot` on demand instead of for every task.

Responsibilities:
- Answer framework and API questions
- Check best practices when implementation details are uncertain
- Help compare approaches before we commit to one

Good uses:
- Next.js routing or server action behavior
- Library API usage
- Version-specific implementation questions

### `Tester`

Use `Tester` whenever behavior changes in a meaningful way.

Responsibilities:
- Add or update unit tests
- Strengthen weak assertions
- Cover success paths, failure paths, and edge cases
- Keep tests aligned with actual behavior

## Recommended Workflow

1. `Scout` explores the area and maps the change.
2. `Builder` implements the feature or fix.
3. `DocsBot` is consulted only if we hit uncertainty.
4. `Tester` adds or updates tests around the changed behavior.
5. `Reviewer` performs a final pass for bugs and regressions.

## Coordination Rules

- Give each agent one clear responsibility.
- Prefer file ownership or feature-slice ownership when parallelizing work.
- Avoid overlapping edits unless the task is tiny.
- Keep `DocsBot` advisory; it should not own implementation.
- Let `Reviewer` review after code and tests are in place.

## Next.js Default

For this workspace, prefer:
- one `Builder` by default
- splitting builders only when `Scout` identifies clean boundaries

This keeps full-stack feature work coherent across:
- App Router pages and layouts
- React components
- route handlers
- server actions
- schemas and validation
- shared types

## Example Requests

- "Use `Scout` to map the auth flow."
- "Ask `DocsBot` to confirm the recommended Next.js pattern for this route."
- "Have `Builder` implement the fix and `Tester` add unit coverage."
- "Run `Reviewer` on the final diff."
- "If `Scout` finds clean boundaries, split `Builder` into two feature builders."
