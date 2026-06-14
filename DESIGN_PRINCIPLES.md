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

## Keep Shared Orchestration Platform-Generic

Shared orchestration functions must support multiple commerce platforms.

- Keep generic modules free of Shopify-specific names, assumptions, GraphQL
  loaders, and identifiers.
- Pass platform-specific behavior as dependencies, such as
  `loadOrderCandidatesFn` and `syncOrderSnapshotFn`.
- Use generic names in shared code, such as `platform`, `platformAccountId`,
  `platformContext`, and `platformAccountData`.
- Put Shopify-specific fields like `shopDomain`, Shopify GIDs, Admin GraphQL
  calls, and Shopify environment checks in Shopify adapters, CLI wiring, or
  Shopify-specific modules.
- Avoid hidden Shopify defaults inside generic functions. If the generic
  function needs platform behavior, require the caller to provide it.

## Put Shared Platform-Independent Helpers In Core

When a function is platform-independent, dependency-light, and genuinely
reusable across application or platform modules, put it in
`packages/core/src/shared/` and export it through `@shopify-agent/core`.

- Prefer core shared helpers for stable concepts such as value normalization
  and validation of untrusted external values.
- Keep platform-specific errors, payload mapping, and orchestration at the
  platform integration call site.
- Do not move infrastructure, persistence, security, or transport code into
  core merely because it does not contain a platform name.
- Extract shared code when callers share the same meaning and behavior, not
  only because their implementations look similar.

## Name Function Dependencies With Fn

When a dependency object accepts an injected function, suffix the field name with
`Fn`.

- Prefer `loadOrdersFn`, `syncOrderSnapshotFn`, or `generateResponseFn` for
  injected function dependencies.
- Do not add `Fn` to objects, clients, adapters, or providers. Names like
  `prisma`, `adapter`, `responder`, and `fetchImpl` should stay noun-like.
- Use the suffix only on the dependency field, not necessarily on local
  variables derived from it when a domain name is clearer.
- Prefer injecting an adapter or provider object over a function when the
  dependency is a real production extension point with multiple methods.

## Tests Should Follow the Real Shape

Tests can still stay isolated while following the same architecture as production.

- Keep the code path inside the function under test the same in production and
  tests. Production should inject the real dependency at the application edge;
  tests should inject a fake implementing the same required contract.
- Do not make a dependency optional only to make unit tests convenient. An
  optional dependency creates a hidden fallback branch, so production and tests
  can accidentally exercise different paths.
- Resolve defaults explicitly at the application edge instead of inside shared
  or core functions. For example, production can pass native `fetch`, while a
  test passes a fake `fetchImpl`; the function under test should always call the
  required `fetchImpl`.
- Prefer fake adapters over overriding higher-level business functions.
- Prefer fake providers over bypassing the real orchestration flow.
- Use production-shaped values in mocks and fixtures, especially external IDs,
  enum strings, and payload structure. Mock data should be fake in content, not
  fake in format.
- If a test seam makes the production API look misleading, the seam is probably at the wrong level.

Make a dependency optional only when absence is a genuine supported production
behavior, not merely a testing technique.

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

## Name Variables After Their Types

When a variable has an explicit type, keep its name close to the type's domain
meaning.

- Prefer a specific name such as `orderSnapshotInput` over a broader name such
  as `syncInput`.
- Preserve meaningful scope differences when adapting between layers, such as
  `requestInput` and `providerRequestInput`.
- Prefix local database identifiers with `local` in application-level names
  when platform identifiers also exist. Keep ORM field names aligned with the
  schema, such as `orderId` for a foreign-key column.
- Omit type prefixes or suffixes that add no useful distinction.

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

## Credential Refresh Failure Classification

Credential maintenance must distinguish failures that require merchant action
from failures that should be retried automatically.

- Mark an installation as `requires_reauthorization` when its refresh token is
  locally expired or the platform rejects it with a permanent OAuth error such
  as `invalid_grant`.
- Do not require reauthorization for timeouts, network failures, platform 5xx
  responses, malformed responses, or application configuration errors.
- Exclude installations requiring reauthorization from automatic refresh
  retries and surface them for merchant notification.
- Show merchants whose installation requires reauthorization a clear UI warning
  and reconnect action. Backend errors and maintenance logs are operator
  signals, not substitutes for the merchant-facing prompt.
- Restore `active` status only after valid new credentials are persisted.

## Shopify Managed Installation

Use Shopify-managed installation and token exchange for both first-time
installation and reconnection. The backend must verify the short-lived Shopify
session token before exchanging it for an expiring offline access token.

Treat connection as one idempotent flow:

- exchange the verified session token for expiring offline credentials
- use the new access token to load the real Shopify shop identity
- reject the connection if the authenticated domain and shop identity differ
- transactionally upsert the platform account and encrypted installation
- restore `active` only after valid credentials and identity are confirmed

The merchant-facing reconnect action should invoke the same connection flow as
the initial installation. It should send Shopify's session token as a bearer
token to `POST /api/shopify/connect`. Do not build a separate reauthorization
mechanism.

Add database changes as small migrations. Prefer additive schema changes while
the refund and return domain is still evolving.
