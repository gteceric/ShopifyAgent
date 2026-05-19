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

test("stops real Shopify refund execution until suggestedRefund is wired", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("Real refund execution should not call fetch yet.");
  };
  const input: ExecuteShopifyRefundActionInput = {
    validation: readyValidation,
    idempotencyKey: "refund-action-910000000070-700000000070",
    note: "Customer requested a refund.",
  };
  const deps: ExecuteShopifyRefundActionDeps = {
    env: {
      USE_REAL_SHOPIFY: "true",
      ENABLE_REAL_REFUND_EXECUTION: "true",
      SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
      SHOPIFY_ADMIN_TOKEN: "shpat_test",
    },
    fetchImpl,
  };

  await assert.rejects(
    () => executeShopifyRefundAction(input, deps),
    /suggestedRefund wiring/,
  );
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

test("throws when real Shopify refund execution is not explicitly enabled", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("Disabled real refund execution should not call fetch.");
  };
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

  await assert.rejects(
    () => executeShopifyRefundAction(input, deps),
    /ENABLE_REAL_REFUND_EXECUTION=true/,
  );
});
