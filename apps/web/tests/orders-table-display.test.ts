import assert from "node:assert/strict";
import test from "node:test";

import { RefundDecision } from "@shopify-agent/core";
import type { DashboardRefundEvaluationViewModel } from "../app/mock-orders.js";
import {
  getOrdersTableDecisionLabel,
  getOrdersTableItemDecisionSummary,
  hasMixedItemDecisions,
} from "../app/orders-table-display.js";

function makeRefundEvaluation(
  itemDecisions: RefundDecision[],
): DashboardRefundEvaluationViewModel {
  return {
    decision: RefundDecision.ManualReview,
    reasonSummary: "A human reviewer needs to decide this refund.",
    recommendedNextAction:
      "Escalate to a human reviewer before promising an outcome.",
    lastUpdatedLabel: "Checked just now",
    policyWindowLabel: "Refund policy",
    reasonDetails: [],
    evidence: [],
    itemEvaluations: itemDecisions.map((decision, index) => ({
      lineItemId: `gid://shopify/LineItem/${700000000100 + index}`,
      title: `Line item ${index + 1}`,
      decision,
      returnableQuantity: 1,
      reasonSummary: "Item-level reason.",
      evidence: [],
    })),
    timeline: [],
  };
}

test("adds mixed item context to orders table decision labels", () => {
  const refundEvaluation = makeRefundEvaluation([
    RefundDecision.Ineligible,
    RefundDecision.Eligible,
  ]);

  assert.equal(hasMixedItemDecisions(refundEvaluation), true);
  assert.equal(
    getOrdersTableDecisionLabel(refundEvaluation),
    "Manual Review · Mixed items",
  );
  assert.equal(
    getOrdersTableItemDecisionSummary(refundEvaluation),
    "1 eligible item, 1 ineligible item",
  );
});

test("keeps orders table decision labels simple for non-mixed items", () => {
  const refundEvaluation = makeRefundEvaluation([
    RefundDecision.Ineligible,
    RefundDecision.Ineligible,
  ]);

  assert.equal(hasMixedItemDecisions(refundEvaluation), false);
  assert.equal(getOrdersTableDecisionLabel(refundEvaluation), "Manual Review");
  assert.equal(getOrdersTableItemDecisionSummary(refundEvaluation), undefined);
});
