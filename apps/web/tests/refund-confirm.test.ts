import assert from "node:assert/strict";
import test from "node:test";

import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  ShopifyRefundActionExecutionStatus,
  type RefundContext,
  type RefundContextPlatformAdapter,
  type RefundPolicyConfig,
} from "@shopify-agent/core";
import { confirmRefund } from "../app/refund-confirm.js";

const orderId = "gid://shopify/Order/910000000091";
const eligibleLineItemId = "gid://shopify/LineItem/700000000092";
const ineligibleLineItemId = "gid://shopify/LineItem/700000000093";

const policyConfig: RefundPolicyConfig = {
  refundWindowDays: 30,
  cancelWindowDays: 30,
  alreadyRefundedDecision: RefundDecision.Ineligible,
};

function makeRefundContext(
  options: { secondItemFinalSale?: boolean } = {},
): RefundContext {
  return {
    order: {
      id: orderId,
      name: "#3091",
      createdAt: "2026-03-01T00:00:00.000Z",
      ageDays: 10,
      totalAmount: 90,
      financialStatus: FinancialStatus.Paid,
      tags: [],
      flags: {
        fraudHold: false,
        manualReview: false,
        vipOverride: false,
      },
    },
    lineItems: [
      {
        lineItemId: eligibleLineItemId,
        title: "Returnable Shirt",
        returnableQuantity: 2,
        category: "apparel",
        fulfillmentStatus: FulfillmentStatus.Fulfilled,
        hasReturnableFulfillment: true,
        alreadyRefunded: false,
        finalSale: false,
      },
      {
        lineItemId: ineligibleLineItemId,
        title: "Final Sale Hat",
        returnableQuantity: 1,
        category: "apparel",
        fulfillmentStatus: FulfillmentStatus.Fulfilled,
        hasReturnableFulfillment: true,
        alreadyRefunded: false,
        finalSale: options.secondItemFinalSale ?? false,
      },
    ],
  };
}

function makeAdapter(
  options: { secondItemFinalSale?: boolean } = {},
): RefundContextPlatformAdapter {
  return {
    platform: "test",
    async loadRefundContext() {
      return makeRefundContext(options);
    },
  };
}

test("confirms a selected eligible refund after revalidation", async () => {
  const result = await confirmRefund(
    {
      orderId,
      lineItems: [{ lineItemId: eligibleLineItemId, quantity: 1 }],
      idempotencyKey: "dashboard-refund-910000000091-test",
    },
    {
      adapter: makeAdapter(),
      config: policyConfig,
      shopifyExecutionDependencies: {
        env: {
          ...process.env,
          USE_REAL_SHOPIFY: "false",
        },
      },
    },
  );

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(
    result.refund.status,
    ShopifyRefundActionExecutionStatus.Succeeded,
  );
  assert.equal(result.refund.source, "mock");
  assert.deepEqual(result.refund.lineItems, [
    {
      lineItemId: eligibleLineItemId,
      quantity: 1,
      title: "Returnable Shirt",
    },
  ]);
});

test("blocks confirmation when revalidation finds an ineligible item", async () => {
  const result = await confirmRefund(
    {
      orderId,
      lineItems: [{ lineItemId: ineligibleLineItemId, quantity: 1 }],
      idempotencyKey: "dashboard-refund-910000000091-blocked",
    },
    {
      adapter: makeAdapter({ secondItemFinalSale: true }),
      config: policyConfig,
    },
  );

  assert.equal(result.ok, false);

  if (result.ok) {
    return;
  }

  assert.equal(result.validationStatus, "blocked");
  assert.deepEqual(
    result.blockers?.map((blocker) => blocker.code),
    ["line_item_not_eligible"],
  );
});
