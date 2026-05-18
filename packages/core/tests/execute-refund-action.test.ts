import test from "node:test";
import assert from "node:assert/strict";

import {
  executeShopifyRefundAction,
  RefundActionValidationStatus,
  ShopifyRefundActionExecutionStatus,
  type ExecuteShopifyRefundActionDeps,
  type ExecuteShopifyRefundActionInput,
} from "../src/index.js";
import { RefundDecision } from "../src/domain/refund-policy.types.js";

const readyValidation = {
  orderId: "gid://shopify/Order/910000000070",
  status: RefundActionValidationStatus.Ready,
  blockers: [],
  matchedLineItems: [
    {
      lineItemId: "gid://shopify/LineItem/700000000070",
      fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/800000000070",
      title: "Returnable Shirt",
      requestedQuantity: 1,
      returnableQuantity: 2,
      decision: RefundDecision.Eligible,
    },
  ],
};

test("uses mock Shopify refund execution when real Shopify is disabled", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("Mock refund execution should not call fetch.");
  };
  const input: ExecuteShopifyRefundActionInput = {
    validation: readyValidation,
    idempotencyKey: "refund-action-910000000070-700000000070",
    note: "Customer requested a refund.",
  };
  const deps: ExecuteShopifyRefundActionDeps = {
    env: {},
    fetchImpl,
  };

  const result = await executeShopifyRefundAction(input, deps);

  assert.equal(result.status, ShopifyRefundActionExecutionStatus.Succeeded);
  assert.equal(result.source, "mock");
  assert.equal(result.orderId, "gid://shopify/Order/910000000070");
  assert.equal(
    result.refundId,
    "mock://shopify/Refund/refund-action-910000000070-700000000070",
  );
  assert.deepEqual(result.lineItems, [
    {
      lineItemId: "gid://shopify/LineItem/700000000070",
      quantity: 1,
      title: "Returnable Shirt",
    },
  ]);
  assert.deepEqual(result.userErrors, []);
});

test("executes Shopify refundCreate through Admin GraphQL when real Shopify is enabled", async () => {
  let capturedRequestBody: unknown;
  const fetchImpl: typeof fetch = async (_url, init) => {
    capturedRequestBody = JSON.parse(String(init?.body));

    return new Response(
      JSON.stringify({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/990000000070",
              totalRefundedSet: {
                presentmentMoney: {
                  amount: "24.00",
                  currencyCode: "USD",
                },
              },
            },
            order: {
              id: "gid://shopify/Order/910000000070",
            },
            userErrors: [],
          },
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  const input: ExecuteShopifyRefundActionInput = {
    validation: readyValidation,
    idempotencyKey: "refund-action-910000000070-700000000070",
    note: "Customer requested a refund.",
  };
  const deps: ExecuteShopifyRefundActionDeps = {
    env: {
      USE_REAL_SHOPIFY: "true",
      SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
      SHOPIFY_ADMIN_TOKEN: "shpat_test",
    },
    fetchImpl,
  };

  const result = await executeShopifyRefundAction(input, deps);

  assert.equal(result.status, ShopifyRefundActionExecutionStatus.Succeeded);
  assert.equal(result.source, "shopify");
  assert.equal(result.refundId, "gid://shopify/Refund/990000000070");
  assert.deepEqual(result.totalRefunded, {
    amount: "24.00",
    currencyCode: "USD",
  });
  const requestBody = capturedRequestBody as {
    query: string;
    variables: unknown;
  };

  assert.match(requestBody.query, /refundCreate\(input: \$input\)/);
  assert.deepEqual(requestBody.variables, {
    idempotencyKey: "refund-action-910000000070-700000000070",
    input: {
      orderId: "gid://shopify/Order/910000000070",
      refundLineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 1,
        },
      ],
      transactions: [],
      note: "Customer requested a refund.",
    },
  });
});

test("returns failed result when Shopify refundCreate returns user errors", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          refundCreate: {
            refund: null,
            order: {
              id: "gid://shopify/Order/910000000070",
            },
            userErrors: [
              {
                field: ["input", "refundLineItems"],
                message: "Line item is not refundable.",
              },
            ],
          },
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  const input: ExecuteShopifyRefundActionInput = {
    validation: readyValidation,
    idempotencyKey: "refund-action-910000000070-700000000070",
  };
  const deps: ExecuteShopifyRefundActionDeps = {
    env: {
      USE_REAL_SHOPIFY: "true",
      SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
      SHOPIFY_ADMIN_TOKEN: "shpat_test",
    },
    fetchImpl,
  };

  const result = await executeShopifyRefundAction(input, deps);

  assert.equal(result.status, ShopifyRefundActionExecutionStatus.Failed);
  assert.equal(result.source, "shopify");
  assert.deepEqual(result.userErrors, [
    {
      field: ["input", "refundLineItems"],
      message: "Line item is not refundable.",
    },
  ]);
});

test("throws when real Shopify refund execution is requested without admin config", async () => {
  const input: ExecuteShopifyRefundActionInput = {
    validation: readyValidation,
    idempotencyKey: "refund-action-910000000070-700000000070",
  };
  const deps: ExecuteShopifyRefundActionDeps = {
    env: {
      USE_REAL_SHOPIFY: "true",
    },
  };

  await assert.rejects(
    () => executeShopifyRefundAction(input, deps),
    /USE_REAL_SHOPIFY=true requires SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN\./,
  );
});
