# AGENT_TESTING.md

Use this file when testing the current refund tool with an AI host before adding Shopify API integration or an MCP wrapper.

The shared scenario fixture lives in [tests/fixtures/refund-scenario-matrix.ts](/Users/ericleung/.openclaw/workspace/shopify-agent/tests/fixtures/refund-scenario-matrix.ts) so it stays clearly out of production code.

## Goal

Validate two things separately:

- The tool contract stays stable across scenarios.
- The AI host uses the tool result sensibly in conversation.

## Run The Matrix

```bash
npm run scenario-matrix
```

This prints a compact table plus the full JSON result for each scenario.

## Current Scenarios

- `eligible_standard`: simple happy path
- `ineligible_outside_window`: refund window expired
- `ineligible_final_sale`: final-sale denial
- `manual_review_fraud_hold`: human review required
- `manual_review_already_refunded_by_config`: merchant-configured review path
- `eligible_vip_override`: policy override path

## What To Look For In An AI Host

- It should not flip `eligible`, `ineligible`, and `manual_review`.
- It should explain the decision using the returned reasons, not invent new ones.
- It should avoid auto-approving anything marked `manual_review`.
- It should avoid contradictory language like "approved" and "needs review" in the same answer.
- It should treat `vip_override_applied` as an exception approval, not as normal policy eligibility.

## Suggested Process

1. Run the matrix and pick one scenario at a time.
2. Give the AI host the customer-style question from the matrix.
3. Let the host call the tool, or manually paste the tool JSON if needed.
4. Compare the host response against `expectedAgentBehavior`.

## Notes

- These scenarios use injected contexts, so they are stable and do not depend on live Shopify data.
- This is meant to validate the workflow contract first, not Shopify integration fidelity.
