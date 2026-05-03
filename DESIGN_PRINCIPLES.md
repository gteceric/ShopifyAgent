# Design Principles

## One Production Path

When a feature has a real production flow, keep that flow singular and obvious.

- Avoid multiple competing ways to do the same production work.
- Prefer one runtime path for loading data and executing business logic.
- Keep mock and real data behind the same boundary instead of exposing separate higher-level code paths.

## Inject at the Boundary

Use dependency injection at the system boundary, not at a higher-level business function unless that is a real production extension point.

Prefer:

- injecting an adapter that loads context
- injecting a provider implementation
- injecting a transport/client boundary

Avoid:

- injecting an entire business function just to make tests easier
- adding override seams that look production-ready but are really test-only

## Compose Defaults at the Edge

Core logic should consume dependencies, not silently create them.

- Callers should choose the adapter or provider instance to use.
- Default wiring belongs at the application edge, such as route entrypoints, CLI entrypoints, or server startup.
- This keeps the core contract honest and easier to follow.

## Tests Should Follow the Real Shape

Tests can still stay isolated while following the same architecture as production.

- Prefer fake adapters over overriding higher-level business functions.
- Prefer fake providers over bypassing the real orchestration flow.
- If a test seam makes the production API look misleading, the seam is probably at the wrong level.

## Current Example

For refund eligibility and the refund-agent flow:

- `checkRefundEligibility(...)` should receive an adapter explicitly.
- route handlers should call `checkRefundEligibility(...)` directly.
- mock and real Shopify data should both flow through the adapter layer.
- avoid route-level overrides like `checkRefundEligibilityFn` when adapter injection is enough.
