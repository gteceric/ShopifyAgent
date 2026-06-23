import assert from "node:assert/strict";
import test from "node:test";

import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  type RefundContext,
  type RefundContextPlatformAdapter,
  type RefundPolicyConfig,
} from "@shopify-agent/core";
import { previewRefund } from "../app/refund-preview.js";
import { createTestShopifyAdminClient } from "../../../packages/core/tests/test-shopify-admin-client.js";

const orderId = "gid://shopify/Order/910000000090";
const eligibleLineItemId = "gid://shopify/LineItem/700000000090";
const ineligibleLineItemId = "gid://shopify/LineItem/700000000091";

const policyConfig: RefundPolicyConfig = {
  refundWindowDays: 30,
  cancelWindowDays: 30,
  alreadyRefundedDecision: RefundDecision.Ineligible,
};

function makeRefundContext(options: { secondItemFinalSale?: boolean } = {}): RefundContext {
  return {
    order: {
      id: orderId,
      name: "#3090",
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

test("previews a selected eligible refund through Shopify", async () => {
  let capturedVariables: unknown;
  const fetchImpl: typeof fetch = async (_url, init) => {
    const requestBody = JSON.parse(String(init?.body)) as {
      variables: unknown;
    };
    capturedVariables = requestBody.variables;

    return new Response(
      JSON.stringify({
        data: {
          order: {
            id: orderId,
            suggestedRefund: {
              amountSet: {
                shopMoney: { amount: "45.00", currencyCode: "USD" },
                presentmentMoney: { amount: "45.00", currencyCode: "USD" },
              },
              maximumRefundableSet: {
                shopMoney: { amount: "45.00", currencyCode: "USD" },
                presentmentMoney: { amount: "45.00", currencyCode: "USD" },
              },
              subtotalSet: {
                shopMoney: { amount: "40.00", currencyCode: "USD" },
                presentmentMoney: { amount: "40.00", currencyCode: "USD" },
              },
              totalTaxSet: {
                shopMoney: { amount: "5.00", currencyCode: "USD" },
                presentmentMoney: { amount: "5.00", currencyCode: "USD" },
              },
              refundLineItems: [
                {
                  lineItem: {
                    id: eligibleLineItemId,
                    title: "Returnable Shirt",
                  },
                  quantity: 1,
                  priceSet: {
                    shopMoney: { amount: "40.00", currencyCode: "USD" },
                    presentmentMoney: { amount: "40.00", currencyCode: "USD" },
                  },
                },
              ],
              suggestedTransactions: [
                {
                  kind: "SUGGESTED_REFUND",
                  gateway: "shopify_payments",
                  amountSet: {
                    shopMoney: { amount: "45.00", currencyCode: "USD" },
                    presentmentMoney: { amount: "45.00", currencyCode: "USD" },
                  },
                  maximumRefundableSet: {
                    shopMoney: { amount: "45.00", currencyCode: "USD" },
                    presentmentMoney: { amount: "45.00", currencyCode: "USD" },
                  },
                  parentTransaction: {
                    id: "gid://shopify/OrderTransaction/790000000090",
                  },
                },
              ],
            },
          },
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  const result = await previewRefund(
    {
      orderId,
      lineItems: [{ lineItemId: eligibleLineItemId, quantity: 1 }],
    },
    {
      adapter: makeAdapter(),
      config: policyConfig,
      shopifyPreviewDependencies: {
        shopifyAdminClient: createTestShopifyAdminClient(fetchImpl),
      },
    },
  );

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.deepEqual(capturedVariables, {
    orderId,
    refundLineItems: [{ lineItemId: eligibleLineItemId, quantity: 1 }],
  });
  assert.equal(result.preview.amount.presentmentMoney.amount, "45.00");
  assert.deepEqual(result.matchedLineItems.map((item) => item.lineItemId), [
    eligibleLineItemId,
  ]);
});

test("stops before Shopify preview when selected item is not eligible", async () => {
  const result = await previewRefund(
    {
      orderId,
      lineItems: [{ lineItemId: ineligibleLineItemId, quantity: 1 }],
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
