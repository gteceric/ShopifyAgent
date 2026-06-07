import test from "node:test";
import assert from "node:assert/strict";

import {
  FinancialStatus,
  FulfillmentStatus,
} from "../src/domain/refund-policy.types.js";
import {
  loadOrders,
  mapAdminOrderToShopifyOrderSummary,
} from "../src/platforms/shopify/load-orders.js";
import { createTestShopifyAdminClient } from "./test-shopify-admin-client.js";

test("uses mock Shopify orders for order listing when real Shopify is disabled", async () => {
  const result = await loadOrders(
    { limit: 3 },
    {
      env: {},
    },
  );

  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((order) => order.id),
    [
      "gid://shopify/Order/1279",
      "gid://shopify/Order/1089",
      "gid://shopify/Order/1044",
    ],
  );
  assert.equal(result[0]?.customerName, "Grace Kim");
});

test("loads a recent order page from Shopify Admin when USE_REAL_SHOPIFY=true", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          orders: {
            nodes: [
              {
                id: "gid://shopify/Order/900000000401",
                name: "#4001",
                createdAt: "2026-04-10T00:00:00.000Z",
                totalPriceSet: {
                  shopMoney: {
                    amount: "249.00",
                  },
                },
                displayFinancialStatus: "PAID",
                displayFulfillmentStatus: "UNFULFILLED",
                customer: {
                  displayName: "Taylor Morgan",
                },
              },
              {
                id: "gid://shopify/Order/900000000402",
                name: "#4002",
                createdAt: "2026-04-09T00:00:00.000Z",
                totalPriceSet: {
                  shopMoney: {
                    amount: "99.50",
                  },
                },
                displayFinancialStatus: "REFUNDED",
                displayFulfillmentStatus: "FULFILLED",
                customer: null,
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

  const result = await loadOrders(
    { limit: 2 },
    {
      env: {
        USE_REAL_SHOPIFY: "true",
      },
      shopifyAdminClient: createTestShopifyAdminClient(fetchImpl),
    },
  );

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    id: "gid://shopify/Order/900000000401",
    name: "#4001",
    customerName: "Taylor Morgan",
    createdAt: "2026-04-10T00:00:00.000Z",
    totalAmount: 249,
    financialStatus: FinancialStatus.Paid,
    fulfillmentStatus: FulfillmentStatus.Unfulfilled,
  });
  assert.equal(result[1]?.customerName, "Unknown customer");
  assert.equal(result[1]?.financialStatus, FinancialStatus.Refunded);
  assert.equal(result[1]?.fulfillmentStatus, FulfillmentStatus.Fulfilled);
});

test("throws when real Shopify order listing is requested without an Admin client", async () => {
  await assert.rejects(
    () =>
      loadOrders(
        { limit: 5 },
        {
          env: {
            USE_REAL_SHOPIFY: "true",
          },
        },
      ),
    /requires ShopifyAdminClient\./,
  );
});

test("maps a Shopify Admin order node into a summary safely", () => {
  const result = mapAdminOrderToShopifyOrderSummary({
    id: "gid://shopify/Order/900000000403",
    name: "#4003",
    createdAt: "2026-04-08T00:00:00.000Z",
    totalPriceSet: {
      shopMoney: {
        amount: "0",
      },
    },
    displayFinancialStatus: "VOIDED",
    displayFulfillmentStatus: "PARTIALLY_FULFILLED",
    customer: {
      displayName: "  Casey Bloom  ",
    },
  });

  assert.deepEqual(result, {
    id: "gid://shopify/Order/900000000403",
    name: "#4003",
    customerName: "Casey Bloom",
    createdAt: "2026-04-08T00:00:00.000Z",
    totalAmount: 0,
    financialStatus: FinancialStatus.Voided,
    fulfillmentStatus: FulfillmentStatus.Partial,
  });
});

test("maps Shopify pending refund transactions as refund pending in summaries", () => {
  const result = mapAdminOrderToShopifyOrderSummary({
    id: "gid://shopify/Order/900000000404",
    name: "#4004",
    createdAt: "2026-04-08T00:00:00.000Z",
    totalPriceSet: {
      shopMoney: {
        amount: "42.00",
      },
    },
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    transactions: [
      {
        kind: "REFUND",
        status: "PENDING",
      },
    ],
    customer: {
      displayName: "Robin Vale",
    },
  });

  assert.equal(result.financialStatus, FinancialStatus.RefundPending);
});
