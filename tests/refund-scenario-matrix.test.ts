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

function assertPartialObject(
  actual: object | undefined,
  expected: Record<string, unknown> | undefined,
  label: string,
): void {
  if (!expected) {
    return;
  }

  assert.ok(actual, `Expected ${label} to be present`);

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual as Record<string, unknown>;

    assert.deepEqual(
      actualValue[key],
      expectedValue,
      `Expected ${label}.${key}`,
    );
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
    assert.equal(result.policyResult.decision, scenario.expectedDecision);
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
      result.policyResult.reasons.some(
        (reason) => reason.code === RefundReasonCode.VipOverrideApplied,
      ),
    );

    // Reasons are the human-readable policy explanation behind the outcome.
    for (const expectedReasonCode of scenario.expectedReasonCodes) {
      assert.ok(
        result.policyResult.reasons.some((reason) => reason.code === expectedReasonCode),
        `Expected reason code ${expectedReasonCode} for scenario ${scenario.id}`,
      );
    }

    // Evidence is the structured audit payload. Scenarios assert only the
    // evidence fields that are important to that case.
    assertPartialObject(
      result.policyResult.evidence.order,
      scenario.expectedEvidence?.order,
      `evidence.order for scenario ${scenario.id}`,
    );
    assertPartialObject(
      result.policyResult.evidence.policyContext,
      scenario.expectedEvidence?.policyContext,
      `evidence.policyContext for scenario ${scenario.id}`,
    );
    assertPartialObject(
      result.policyResult.evidence.evaluatedOrder,
      scenario.expectedEvidence?.evaluatedOrder,
      `evidence.evaluatedOrder for scenario ${scenario.id}`,
    );
  });
}
