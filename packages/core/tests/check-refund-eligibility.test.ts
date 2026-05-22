import test from "node:test";
import assert from "node:assert/strict";

import { checkRefundEligibility } from "../src/application/check-refund-eligibility.js";
import { RecommendedRefundAction } from "../src/application/check-refund-eligibility.js";
import { createMockShopifyRefundContextAdapter } from "../src/platforms/shopify/load-refund-context.js";
import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "../src/domain/refund-policy.types.js";
import type {
  RefundContext,
  RefundContextLineItem,
} from "../src/domain/refund-policy.types.js";

type RefundContextOverrides = Partial<
  Omit<RefundContext["order"], "flags">
> & {
  flags?: Partial<RefundContext["order"]["flags"]>;
  lineItems?: RefundContextLineItem[];
  fulfillmentStatus?: FulfillmentStatus;
  hasReturnableFulfillment?: boolean;
  alreadyRefunded?: boolean;
  finalSale?: boolean;
  itemCategories?: string[];
};

function makeContext(
  overrides: RefundContextOverrides = {},
): RefundContext {
  const {
    fulfillmentStatus = FulfillmentStatus.Fulfilled,
    hasReturnableFulfillment = true,
    alreadyRefunded = false,
    finalSale = false,
    itemCategories,
    lineItems,
    flags = {},
    ...contextOverrides
  } = overrides;
  const order = {
    id: "gid://shopify/Order/900000000100",
    name: "#2001",
    createdAt: "2026-03-01T00:00:00.000Z",
    ageDays: 5,
    totalAmount: 48,
    financialStatus: FinancialStatus.Paid,
    tags: [],
    flags: {
      fraudHold: false,
      manualReview: false,
      vipOverride: false,
      ...flags,
    },
    ...contextOverrides,
  };

  return {
    order,
    lineItems: lineItems ?? [
      {
        lineItemId: "gid://shopify/LineItem/1",
        title: "Default item",
        returnableQuantity: 1,
        category: itemCategories?.[0],
        fulfillmentStatus,
        hasReturnableFulfillment,
        alreadyRefunded,
        finalSale,
      },
    ],
  };
}

test("uses an injected adapter and returns structured eligibility result", async () => {
  const result = await checkRefundEligibility(
    { orderId: "gid://shopify/Order/900000000101" },
    {
      adapter: {
        platform: "test",
        loadRefundContext: async (input) =>
          makeContext({
            id: input.orderId,
            name: "#2002",
          }),
      },
    },
  );

  assert.equal(result.orderId, "gid://shopify/Order/900000000101");
  assert.equal(result.policyResult.decision, RefundDecision.Eligible);
  assert.equal(result.exceptionAvailable, false);
  assert.equal(result.escalationRequired, false);
  assert.equal(result.recommendedNextAction, RecommendedRefundAction.Approve);
  assert.ok(
    result.policyResult.reasons.some(
      (reason) => reason.code === RefundReasonCode.WithinRefundWindow,
    ),
  );
});

test("uses injected merchant config when evaluating refunded line items", async () => {
  const result = await checkRefundEligibility(
    { orderId: "gid://shopify/Order/900000000102" },
    {
      config: {
        refundWindowDays: 30,
        alreadyRefundedDecision: RefundDecision.ManualReview,
      },
      adapter: {
        platform: "test",
        loadRefundContext: async (input) =>
          makeContext({
            id: input.orderId,
            alreadyRefunded: true,
          }),
      },
    },
  );

  assert.equal(result.policyResult.decision, RefundDecision.ManualReview);
  assert.equal(result.exceptionAvailable, false);
  assert.equal(result.escalationRequired, true);
  assert.equal(
    result.recommendedNextAction,
    RecommendedRefundAction.ManualReview,
  );
  assert.ok(
    result.policyResult.reasons.some(
      (reason) => reason.code === RefundReasonCode.AlreadyFullyRefunded,
    ),
  );
});

test("supports platform adapters as the order-context boundary", async () => {
  const result = await checkRefundEligibility(
    { orderId: "gid://shopify/Order/900000000104" },
    {
      adapter: {
        platform: "shopify",
        loadRefundContext: async (input) =>
          makeContext({
            id: input.orderId,
            ageDays: 45,
          }),
      },
    },
  );

  assert.equal(result.orderId, "gid://shopify/Order/900000000104");
  assert.equal(result.policyResult.decision, RefundDecision.Ineligible);
  assert.equal(result.exceptionAvailable, false);
  assert.equal(result.escalationRequired, false);
  assert.equal(result.recommendedNextAction, RecommendedRefundAction.Deny);
  assert.ok(
    result.policyResult.reasons.some(
      (reason) => reason.code === RefundReasonCode.OutsideRefundWindow,
    ),
  );
});

test("recommends refund_pending for refund-pending orders", async () => {
  const result = await checkRefundEligibility(
    { orderId: "gid://shopify/Order/900000000105" },
    {
      adapter: {
        platform: "test",
        loadRefundContext: async (input) =>
          makeContext({
            id: input.orderId,
            financialStatus: FinancialStatus.RefundPending,
          }),
      },
    },
  );

  assert.equal(result.policyResult.decision, RefundDecision.Ineligible);
  assert.equal(
    result.recommendedNextAction,
    RecommendedRefundAction.RefundPending,
  );
});

test("recommends no_action_needed for already refunded orders", async () => {
  const result = await checkRefundEligibility(
    { orderId: "gid://shopify/Order/900000000106" },
    {
      adapter: {
        platform: "test",
        loadRefundContext: async (input) =>
          makeContext({
            id: input.orderId,
            alreadyRefunded: true,
            financialStatus: FinancialStatus.Refunded,
          }),
      },
    },
  );

  assert.equal(result.policyResult.decision, RefundDecision.Ineligible);
  assert.equal(
    result.recommendedNextAction,
    RecommendedRefundAction.NoActionNeeded,
  );
});

test("marks VIP overrides as an active exception without requiring escalation", async () => {
  const result = await checkRefundEligibility(
    { orderId: "gid://shopify/Order/900000000103" },
    {
      config: {
        refundWindowDays: 30,
        alreadyRefundedDecision: RefundDecision.Ineligible,
      },
      adapter: {
        platform: "test",
        loadRefundContext: async (input) =>
          makeContext({
            id: input.orderId,
            ageDays: 45,
            flags: {
              vipOverride: true,
            },
          }),
      },
    },
  );

  assert.equal(result.policyResult.decision, RefundDecision.Eligible);
  assert.equal(result.exceptionAvailable, true);
  assert.equal(result.escalationRequired, false);
  assert.equal(result.recommendedNextAction, RecommendedRefundAction.Approve);
  assert.ok(
    result.policyResult.reasons.some(
      (reason) => reason.code === RefundReasonCode.VipOverrideApplied,
    ),
  );
});

test("applies merchant exception rules through the Shopify adapter when mock order tags match", async () => {
  const result = await checkRefundEligibility(
    { orderId: "gid://shopify/Order/1127" },
    {
      adapter: createMockShopifyRefundContextAdapter({
        env: {},
        now: new Date("2026-03-30T00:00:00.000Z"),
      }),
      config: {
        refundWindowDays: 30,
        alreadyRefundedDecision: RefundDecision.Ineligible,
        exceptionRules: [
          {
            tag: "loyalty_recovery",
            decision: RefundDecision.Eligible,
            message:
              "Merchant loyalty recovery rule allows a refund outside the standard window.",
          },
        ],
      },
    },
  );

  assert.equal(result.policyResult.decision, RefundDecision.Eligible);
  assert.ok(
    result.policyResult.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.MerchantExceptionRuleApplied,
    ),
  );
  assert.equal(result.policyResult.evidence.policyContext.matchedExceptionRuleTag, "loyalty_recovery");
});
