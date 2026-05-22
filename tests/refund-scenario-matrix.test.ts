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
  reasonCodes: RefundReasonCode[],
): RecommendedRefundAction {
  switch (decision) {
    case RefundDecision.Eligible:
      return RecommendedRefundAction.Approve;
    case RefundDecision.Ineligible:
      if (reasonCodes.includes(RefundReasonCode.RefundPending)) {
        return RecommendedRefundAction.RefundPending;
      }

      if (reasonCodes.includes(RefundReasonCode.AlreadyFullyRefunded)) {
        return RecommendedRefundAction.NoActionNeeded;
      }

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

function assertReasonCodes(
  actualReasons: { code: RefundReasonCode }[],
  expectedReasonCodes: RefundReasonCode[],
  label: string,
): void {
  for (const expectedReasonCode of expectedReasonCodes) {
    assert.ok(
      actualReasons.some((reason) => reason.code === expectedReasonCode),
      `Expected reason code ${expectedReasonCode} for ${label}`,
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
      getExpectedNextAction(
        scenario.expectedDecision,
        scenario.expectedReasonCodes,
      ),
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
    assertReasonCodes(
      result.policyResult.reasons,
      scenario.expectedReasonCodes,
      `scenario ${scenario.id}`,
    );

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

    for (const expectedItemEvaluation of
      scenario.expectedItemEvaluations ?? []) {
      const actualItemEvaluation = result.policyResult.itemEvaluations.find(
        (itemEvaluation) =>
          itemEvaluation.evidence.evaluatedLineItem.lineItemId ===
          expectedItemEvaluation.lineItemId,
      );

      assert.ok(
        actualItemEvaluation,
        `Expected item evaluation ${expectedItemEvaluation.lineItemId} for scenario ${scenario.id}`,
      );
      assert.equal(
        actualItemEvaluation.decision,
        expectedItemEvaluation.decision,
        `Expected item decision for ${expectedItemEvaluation.lineItemId}`,
      );

      assertReasonCodes(
        actualItemEvaluation.reasons,
        expectedItemEvaluation.reasonCodes ?? [],
        `item ${expectedItemEvaluation.lineItemId} in scenario ${scenario.id}`,
      );
      assertPartialObject(
        actualItemEvaluation.evidence.policyContext,
        expectedItemEvaluation.policyContext,
        `item policyContext for ${expectedItemEvaluation.lineItemId}`,
      );
    }
  });
}
