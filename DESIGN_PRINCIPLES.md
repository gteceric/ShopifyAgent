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
- Use production-shaped values in mocks and fixtures, especially external IDs,
  enum strings, and payload structure. Mock data should be fake in content, not
  fake in format.
- If a test seam makes the production API look misleading, the seam is probably at the wrong level.

## Preserve Intentional Comments

Comments in code and types are part of the design record.

- Keep existing comments when editing nearby code if the comment still matches the behavior.
- If a code change makes a comment inaccurate, update the comment to match the new behavior instead of silently deleting it.
- Remove a comment only when it is no longer meaningful, actively misleading, or replaced by clearer nearby documentation.

## Prefer Named Domain Objects

When an object literal represents meaningful domain data, assign it to a named variable before passing it into another helper.

- Name data by what it means in the domain, not by the helper or function that consumes it.
- Prefer names like `RefundPolicyItemContext` over names like `RefundPolicyRuleEngineInput` when the object represents domain context.
- Do not reuse a type just because another concept has the same fields. Same shape does not mean same domain meaning.
- If a type name implies a specific scope, use it only for that scope. Create or reuse a broader domain name only when the concept is genuinely broader.
- Compose nested objects by ownership, such as `itemContext.orderContext.tags`, when it makes the source of a field clearer.
- Normalize optional boundary data once before core policy evaluation, then let internal context types use required fields.
- Remove wrapper types when they only duplicate values already available through the composed domain object.
- Use the type annotation when it helps explain the role of the object.
- Inline tiny objects only when the meaning is obvious and there is no domain concept worth naming.

## Type Meaningful Objects Explicitly

Use TypeScript inference for simple local values, but add explicit types for
meaningful object shapes.

- Let simple scalar or obvious derived values infer their type.
- Add type annotations for request inputs, dependency objects, configs,
  fixtures, view models, and domain objects.
- Prefer explicit object types when building the object benefits from
  autocomplete or when several objects have similar fields.
- Avoid noisy annotations for values where the type is already obvious, such as
  `const quantity = 1` or `const hasErrors = result.userErrors.length > 0`.

## Prefer Switches for Enum-Like States

When branching on enum-like domain states, use `switch` instead of a chain of
`if` statements.

- Prefer `switch` for values such as `FinancialStatus`, `RefundDecision`,
  `ManualReviewKind`, and `RecommendedRefundAction`.
- Use `if` for boolean guards, validation checks, early returns, and compound
  predicates.
- Keep guard checks before the `switch` when they override the enum-like fallback,
  such as line-item pending/refunded facts before order financial status.

## Refund Decisions Are Item-Level

Refund eligibility must be decided from line items, not only from an order-level summary.

- Treat `lineItems` as required refund-policy input.
- Evaluate each line item independently because category windows, final-sale status, returnable fulfillment availability, and prior refund state can differ by item.
- Roll item decisions up into one response for the caller, but keep per-item `itemEvaluations` as the evidence for the decision.
- If item decisions are mixed, return `manual_review` instead of approving or denying the whole order automatically.
- Do not fall back to order-level eligibility when line items are missing or empty. Missing line items are incomplete refund context, not a valid production path.

Order-level fields can still exist as summary evidence, but they should not replace item-level evaluation. Using only the strictest order-level summary can hide refundable items, and using broad order-level booleans can hide blocked items such as final-sale or already-refunded items.

## Refund Decisioning Before Execution

The current product scope is refund decisioning and support guidance. It checks
whether an order or item appears eligible, explains the decision, and recommends
the next action. It does not create Shopify refunds or move money.

Refund execution should be a separate milestone after item-level decisioning is
trusted, merchant policy ownership is clear, and the UI shows item-level
outcomes without ambiguity.

When refund execution is added, it must be designed explicitly instead of being
treated as a small extension of eligibility checks. It needs:

- item and quantity selection
- refund amount, tax, and shipping handling
- approval and manual-review gates
- confirmation before calling Shopify
- Shopify refund mutation handling
- audit logging
- idempotency to prevent duplicate refunds
- clear success and failure states

The first execution milestone should be conservative: only allow execution for
clearly eligible refunds, require merchant confirmation, and avoid automatic
execution for manual-review or mixed-decision cases.

## Current Example

For refund eligibility and the refund-agent flow:

- `checkRefundEligibility(...)` should receive an adapter explicitly.
- route handlers should call `checkRefundEligibility(...)` directly.
- mock and real Shopify data should both flow through the adapter layer.
- avoid route-level overrides like `checkRefundEligibilityFn` when adapter injection is enough.
- Shopify and future commerce adapters should normalize platform-specific order facts into `RefundContext.order` and item facts into `RefundContext.lineItems`.
- Shopify Admin data that affects refund correctness should be cursor-paginated in concept-specific adapter loaders, not exposed as UI pagination.
- Shopify array-style fields that cannot be cursor-paginated in the same way should use the largest safe page size and be revisited when persistence/backfill sync is added.

## Persistence, Webhooks, And Reconciliation

Use Postgres as the durable operational store and Prisma as the schema,
migration, and typed database client layer.

Persistence should support more than one commerce platform. Keep local tables
platform-neutral and store platform-specific identifiers in explicit fields such
as `platform`, `platformOrderId`, `platformLineItemId`, and `platformRefundId`.
Keep the raw platform payload alongside normalized columns so we can add fields
later without losing evidence from earlier syncs.

The database is not allowed to replace live platform validation for money
movement. Refund preview and confirm flows should still re-check the commerce
platform before showing or creating a refund. The database is for fast dashboard
loading, webhook-backed state, auditing, reconciliation, and future return/RMA
workflows.

Webhooks should write idempotent `PlatformEvent` records first, then update the
normalized order, line item, refund, and transaction tables. Background
reconciliation jobs should periodically re-fetch recent or open orders from the
platform, compare them with local state, and repair drift.

Add database changes as small migrations. Prefer additive schema changes while
the refund and return domain is still evolving.
