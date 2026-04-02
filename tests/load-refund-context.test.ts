import test from "node:test";
import assert from "node:assert/strict";

import { FinancialStatus, FulfillmentStatus } from "../src/policy/refund-policy.types.js";
import {
  loadRefundContext,
  mapAdminOrderToRefundPolicyInput,
} from "../src/shopify/load-refund-context.js";

test("uses mock Shopify orders when Admin API env vars are missing", async () => {
  const result = await loadRefundContext(
    { orderId: "gid://shopify/Order/demo" },
    {
      now: new Date("2026-03-30T00:00:00.000Z"),
      env: {},
    },
  );

  assert.equal(result.orderId, "gid://shopify/Order/demo");
  assert.equal(result.orderName, "#1001");
  assert.equal(result.orderAgeDays, 20);
  assert.equal(result.financialStatus, FinancialStatus.Paid);
  assert.equal(result.fulfillmentStatus, FulfillmentStatus.Fulfilled);
  assert.equal(result.hasReturnableFulfillments, true);
});

test("uses mock Shopify orders unless USE_REAL_SHOPIFY=true", async () => {
  const result = await loadRefundContext(
    { orderId: "gid://shopify/Order/demo" },
    {
      now: new Date("2026-03-30T00:00:00.000Z"),
      env: {
        SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
        SHOPIFY_ADMIN_TOKEN: "shpat_test",
      },
    },
  );

  assert.equal(result.orderId, "gid://shopify/Order/demo");
  assert.equal(result.orderName, "#1001");
});

test("maps live Shopify Admin responses into RefundPolicyInput", async () => {
  const responses = [
    {
      data: {
        order: {
          id: "gid://shopify/Order/live-1",
          name: "#3001",
          createdAt: "2026-03-20T00:00:00.000Z",
          displayFinancialStatus: "PAID",
          displayFulfillmentStatus: "FULFILLED",
          lineItems: {
            nodes: [
              {
                id: "gid://shopify/LineItem/1",
                currentQuantity: 1,
                customAttributes: [{ key: "final_sale", value: "false" }],
              },
            ],
          },
          fraudHoldFlag: { value: "false" },
          manualReviewFlag: { value: "false" },
          vipOverrideFlag: { value: "true" },
        },
      },
    },
    {
      data: {
        returnableFulfillments: {
          nodes: [
            {
              id: "gid://shopify/ReturnableFulfillment/1",
              returnableFulfillmentLineItems: {
                nodes: [
                  {
                    quantity: 1,
                    fulfillmentLineItem: {
                      id: "gid://shopify/FulfillmentLineItem/1",
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    },
  ];

  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const result = await loadRefundContext(
    { orderId: "gid://shopify/Order/live-1" },
    {
      now: new Date("2026-03-30T00:00:00.000Z"),
      env: {
        USE_REAL_SHOPIFY: "true",
        SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
        SHOPIFY_ADMIN_TOKEN: "shpat_test",
      },
      fetchImpl,
    },
  );

  assert.equal(result.orderId, "gid://shopify/Order/live-1");
  assert.equal(result.orderName, "#3001");
  assert.equal(result.orderAgeDays, 10);
  assert.equal(result.financialStatus, FinancialStatus.Paid);
  assert.equal(result.fulfillmentStatus, FulfillmentStatus.Fulfilled);
  assert.equal(result.hasReturnableFulfillments, true);
  assert.equal(result.alreadyFullyRefunded, false);
  assert.equal(result.allItemsFinalSale, false);
  assert.equal(result.flags?.vipOverride, true);
});

test("throws when USE_REAL_SHOPIFY=true but Shopify Admin env vars are incomplete", async () => {
  await assert.rejects(
    () =>
      loadRefundContext(
        { orderId: "gid://shopify/Order/demo" },
        {
          env: {
            USE_REAL_SHOPIFY: "true",
          },
        },
      ),
    /USE_REAL_SHOPIFY=true requires SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN\./,
  );
});

test("maps admin helper fields for final sale, statuses, and flags safely", () => {
  const result = mapAdminOrderToRefundPolicyInput(
    {
      id: "gid://shopify/Order/live-2",
      name: "#3002",
      createdAt: "2026-03-01T00:00:00.000Z",
      displayFinancialStatus: "REFUNDED",
      displayFulfillmentStatus: "PARTIALLY_FULFILLED",
      lineItems: {
        nodes: [
          {
            id: "gid://shopify/LineItem/2",
            currentQuantity: 1,
            customAttributes: [{ key: "is_final_sale", value: "true" }],
          },
        ],
      },
      fraudHoldFlag: { value: "1" },
      manualReviewFlag: { value: "yes" },
      vipOverrideFlag: { value: "false" },
    },
    {
      returnableFulfillments: {
        nodes: [],
      },
    },
    new Date("2026-03-30T00:00:00.000Z"),
  );

  assert.equal(result.financialStatus, FinancialStatus.Refunded);
  assert.equal(result.fulfillmentStatus, FulfillmentStatus.Partial);
  assert.equal(result.alreadyFullyRefunded, true);
  assert.equal(result.hasReturnableFulfillments, false);
  assert.equal(result.allItemsFinalSale, true);
  assert.equal(result.flags?.fraudHold, true);
  assert.equal(result.flags?.manualReview, true);
  assert.equal(result.flags?.vipOverride, false);
});
