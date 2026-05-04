import { checkRefundEligibility } from "@shopify-agent/core";
import {
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
} from "@shopify-agent/core";
import test from "node:test";
import assert from "node:assert/strict";
import { REFUND_SCENARIO_MATRIX } from "./fixtures/refund-scenario-matrix.js";

function getExpectedNextAction(
  decision: RefundDecision,
): RecommendedRefundAction {
  switch (decision) {
    case RefundDecision.Eligible:
      return RecommendedRefundAction.Approve;
    case RefundDecision.Ineligible:
      return RecommendedRefundAction.Deny;
    case RefundDecision.ManualReview:
      return RecommendedRefundAction.ManualReview;
  }
}

for (const scenario of REFUND_SCENARIO_MATRIX) {
  test(`scenario matrix: ${scenario.id}`, async () => {
    // Use the same application boundary as MCP/web callers, but inject a mock
    // platform adapter so each scenario stays deterministic.
    const result = await checkRefundEligibility(scenario.toolInput, {
      config: scenario.config,
      adapter: {
        platform: "test",
        loadRefundContext: async () => scenario.context,
      },
    });

    // Outcome fields drive the operator's next step.
    assert.equal(result.decision, scenario.expectedDecision);
    assert.equal(
      result.recommendedNextAction,
      getExpectedNextAction(scenario.expectedDecision),
    );
    assert.equal(
      result.escalationRequired,
      scenario.expectedDecision === RefundDecision.ManualReview,
    );
    assert.equal(
      result.exceptionAvailable,
      result.reasons.some(
        (reason) => reason.code === RefundReasonCode.VipOverrideApplied,
      ),
    );

    // Reasons are the human-readable policy explanation behind the outcome.
    for (const expectedReasonCode of scenario.expectedReasonCodes) {
      assert.ok(
        result.reasons.some((reason) => reason.code === expectedReasonCode),
        `Expected reason code ${expectedReasonCode} for scenario ${scenario.id}`,
      );
    }

    // Evidence is the structured audit payload. Scenarios assert only the
    // evidence fields that are important to that case.
    for (const [evidenceKey, expectedValue] of Object.entries(
      scenario.expectedEvidence ?? {},
    )) {
      assert.deepEqual(
        result.evidence[evidenceKey as keyof typeof result.evidence],
        expectedValue,
        `Expected evidence.${evidenceKey} for scenario ${scenario.id}`,
      );
    }
  });
}
