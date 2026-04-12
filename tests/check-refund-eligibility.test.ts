import test from "node:test";
import assert from "node:assert/strict";

import { checkRefundEligibility } from "../src/tools/check-refund-eligibility.js";
import { RecommendedRefundAction } from "../src/tools/check-refund-eligibility.js";
import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "../src/policy/refund-policy.types.js";
import type { RefundPolicyInput } from "../src/policy/refund-policy.types.js";

function makeContext(
  overrides: Partial<RefundPolicyInput> = {},
): RefundPolicyInput {
  return {
    orderId: "gid://shopify/Order/test",
    orderName: "#2001",
    orderCreatedAt: "2026-03-01T00:00:00.000Z",
    orderAgeDays: 5,
    orderTotalAmount: 48,
    financialStatus: FinancialStatus.Paid,
    fulfillmentStatus: FulfillmentStatus.Fulfilled,
    hasReturnableFulfillments: true,
    alreadyFullyRefunded: false,
    allItemsFinalSale: false,
    flags: {},
    ...overrides,
  };
}

test("uses injected loadContext and returns structured eligibility result", async () => {
  const result = await checkRefundEligibility(
    { orderId: "gid://shopify/Order/custom" },
    {
      loadContext: async (input) =>
        makeContext({
          orderId: input.orderId,
          orderName: "#2002",
        }),
    },
  );

  assert.equal(result.orderId, "gid://shopify/Order/custom");
  assert.equal(result.decision, RefundDecision.Eligible);
  assert.equal(result.exceptionAvailable, false);
  assert.equal(result.escalationRequired, false);
  assert.equal(result.recommendedNextAction, RecommendedRefundAction.Approve);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.WithinRefundWindow,
    ),
  );
});

test("uses injected merchant config when evaluating refunded orders", async () => {
  const result = await checkRefundEligibility(
    { orderId: "gid://shopify/Order/refunded-review" },
    {
      config: {
        refundWindowDays: 30,
        alreadyFullyRefundedDecision: RefundDecision.ManualReview,
      },
      loadContext: async (input) =>
        makeContext({
          orderId: input.orderId,
          alreadyFullyRefunded: true,
        }),
    },
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.equal(result.exceptionAvailable, false);
  assert.equal(result.escalationRequired, true);
  assert.equal(
    result.recommendedNextAction,
    RecommendedRefundAction.ManualReview,
  );
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.AlreadyFullyRefunded,
    ),
  );
});

test("marks VIP overrides as an active exception without requiring escalation", async () => {
  const result = await checkRefundEligibility(
    { orderId: "gid://shopify/Order/vip-override" },
    {
      config: {
        refundWindowDays: 30,
        alreadyFullyRefundedDecision: RefundDecision.Ineligible,
      },
      loadContext: async (input) =>
        makeContext({
          orderId: input.orderId,
          orderAgeDays: 45,
          flags: {
            vipOverride: true,
          },
        }),
    },
  );

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.equal(result.exceptionAvailable, true);
  assert.equal(result.escalationRequired, false);
  assert.equal(result.recommendedNextAction, RecommendedRefundAction.Approve);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.VipOverrideApplied,
    ),
  );
});
