import test from "node:test";
import assert from "node:assert/strict";

import {
  FinancialStatus,
  FulfillmentStatus,
} from "../src/domain/refund-policy.types.js";
import {
  createRefundContextAdapter,
  createMockShopifyRefundContextAdapter,
  createShopifyAdminRefundContextAdapter,
  mapAdminOrderToRefundContext,
} from "../src/platforms/shopify/load-refund-context.js";

test("default Shopify adapter uses mock orders when Admin API env vars are missing", async () => {
  const adapter = createRefundContextAdapter({
    now: new Date("2026-03-30T00:00:00.000Z"),
    env: {},
  });
  const result = await adapter.loadRefundContext({
    orderId: "gid://shopify/Order/1001",
  });

  assert.equal(result.order.id, "gid://shopify/Order/1001");
  assert.equal(result.order.name, "#1001");
  assert.equal(result.order.ageDays, 20);
  assert.equal(result.order.financialStatus, FinancialStatus.Paid);
  assert.equal(result.lineItems.length, 1);
  assert.equal(
    result.lineItems[0]?.lineItemId,
    "gid://shopify/Order/1001/LineItem/1",
  );
  assert.equal(
    result.lineItems[0]?.category,
    "Apparel & Accessories > Clothing > Shirts & Tops",
  );
  assert.equal(
    result.lineItems[0]?.fulfillmentStatus,
    FulfillmentStatus.Fulfilled,
  );
  assert.equal(result.lineItems[0]?.hasReturnableFulfillment, true);
  assert.deepEqual(result.order.tags, []);
});

test("default Shopify adapter uses mock orders unless USE_REAL_SHOPIFY=true", async () => {
  const adapter = createRefundContextAdapter({
    now: new Date("2026-03-30T00:00:00.000Z"),
    env: {
      SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
      SHOPIFY_ADMIN_TOKEN: "shpat_test",
    },
  });
  const result = await adapter.loadRefundContext({
    orderId: "gid://shopify/Order/1001",
  });

  assert.equal(result.order.id, "gid://shopify/Order/1001");
  assert.equal(result.order.name, "#1001");
});

test("Shopify Admin adapter maps live Admin responses into RefundContext", async () => {
  const responses = [
    {
      data: {
        order: {
          id: "gid://shopify/Order/900000000301",
          name: "#3001",
          tags: ["vip-exception", "  loyalty_recovery  "],
          createdAt: "2026-03-20T00:00:00.000Z",
          totalPriceSet: {
            shopMoney: {
              amount: "149.50",
            },
          },
          displayFinancialStatus: "PAID",
          displayFulfillmentStatus: "FULFILLED",
          lineItems: {
            nodes: [
              {
                id: "gid://shopify/LineItem/1",
                currentQuantity: 1,
                product: {
                  category: {
                    fullName: "Electronics > Audio > Headphones",
                  },
                },
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
                      lineItem: {
                        id: "gid://shopify/LineItem/1",
                      },
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

  const adapter = createShopifyAdminRefundContextAdapter({
    now: new Date("2026-03-30T00:00:00.000Z"),
    env: {
      USE_REAL_SHOPIFY: "true",
      SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
      SHOPIFY_ADMIN_TOKEN: "shpat_test",
    },
    fetchImpl,
  });
  const result = await adapter.loadRefundContext({
    orderId: "gid://shopify/Order/900000000301",
  });

  assert.equal(result.order.id, "gid://shopify/Order/900000000301");
  assert.equal(result.order.name, "#3001");
  assert.equal(result.order.ageDays, 10);
  assert.equal(result.order.totalAmount, 149.5);
  assert.equal(result.order.financialStatus, FinancialStatus.Paid);
  assert.equal(result.lineItems.length, 1);
  assert.equal(result.lineItems[0]?.lineItemId, "gid://shopify/LineItem/1");
  assert.equal(result.lineItems[0]?.category, "Electronics > Audio > Headphones");
  assert.equal(
    result.lineItems[0]?.fulfillmentStatus,
    FulfillmentStatus.Fulfilled,
  );
  assert.equal(
    result.lineItems[0]?.fulfillmentLineItemId,
    "gid://shopify/FulfillmentLineItem/1",
  );
  assert.equal(result.lineItems[0]?.hasReturnableFulfillment, true);
  assert.deepEqual(result.order.tags, ["vip-exception", "loyalty_recovery"]);
  assert.equal(result.order.flags?.vipOverride, true);
});

test("Shopify Admin adapter throws when Admin env vars are incomplete", async () => {
  assert.throws(
    () =>
      createShopifyAdminRefundContextAdapter({
        env: {
          USE_REAL_SHOPIFY: "true",
        },
      }).loadRefundContext({
        orderId: "gid://shopify/Order/1001",
      }),
    /USE_REAL_SHOPIFY=true requires SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN\./,
  );
});

test("mock Shopify adapter loads mock orders directly", async () => {
  const adapter = createMockShopifyRefundContextAdapter({
    now: new Date("2026-03-30T00:00:00.000Z"),
  });
  const result = await adapter.loadRefundContext({
    orderId: "gid://shopify/Order/1001",
  });

  assert.equal(result.order.id, "gid://shopify/Order/1001");
  assert.equal(result.lineItems.length, 1);
  assert.equal(
    result.lineItems[0]?.category,
    "Apparel & Accessories > Clothing > Shirts & Tops",
  );
  assert.equal(result.lineItems[0]?.finalSale, false);
});

test("maps admin helper fields for final sale, statuses, and flags safely", () => {
  const result = mapAdminOrderToRefundContext(
    {
      id: "gid://shopify/Order/900000000302",
      name: "#3002",
      tags: ["ops_review_hold"],
      createdAt: "2026-03-01T00:00:00.000Z",
      totalPriceSet: {
        shopMoney: {
          amount: "320.00",
        },
      },
      displayFinancialStatus: "REFUNDED",
      displayFulfillmentStatus: "PARTIALLY_FULFILLED",
      lineItems: {
        nodes: [
          {
            id: "gid://shopify/LineItem/2",
            currentQuantity: 1,
            product: {
              category: {
                fullName: "Apparel & Accessories > Shoes",
              },
            },
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

  assert.equal(result.order.financialStatus, FinancialStatus.Refunded);
  assert.equal(result.order.totalAmount, 320);
  assert.equal(result.lineItems.length, 1);
  assert.equal(result.lineItems[0]?.lineItemId, "gid://shopify/LineItem/2");
  assert.equal(result.lineItems[0]?.category, "Apparel & Accessories > Shoes");
  assert.equal(
    result.lineItems[0]?.fulfillmentStatus,
    FulfillmentStatus.Partial,
  );
  assert.equal(result.lineItems[0]?.alreadyRefunded, true);
  assert.equal(result.lineItems[0]?.finalSale, true);
  assert.deepEqual(result.order.tags, ["ops_review_hold"]);
  assert.equal(result.order.flags?.fraudHold, true);
  assert.equal(result.order.flags?.manualReview, true);
  assert.equal(result.order.flags?.vipOverride, false);
});

test("maps multi-item Admin orders with item-level returnable and refund state", () => {
  const result = mapAdminOrderToRefundContext(
    {
      id: "gid://shopify/Order/900000000303",
      name: "#3003",
      tags: [],
      createdAt: "2026-03-25T00:00:00.000Z",
      totalPriceSet: {
        shopMoney: {
          amount: "180.00",
        },
      },
      displayFinancialStatus: "PARTIALLY_REFUNDED",
      displayFulfillmentStatus: "FULFILLED",
      lineItems: {
        nodes: [
          {
            id: "gid://shopify/LineItem/700000000001",
            title: "Returnable Jacket",
            currentQuantity: 2,
            product: {
              category: {
                fullName: "Apparel & Accessories > Clothing > Outerwear",
              },
            },
            customAttributes: [],
          },
          {
            id: "gid://shopify/LineItem/700000000002",
            title: "Refunded Socks",
            currentQuantity: 0,
            product: {
              category: {
                fullName: "Apparel & Accessories > Clothing > Socks",
              },
            },
            customAttributes: [],
          },
          {
            id: "gid://shopify/LineItem/700000000003",
            title: "Non-returnable Bottle",
            currentQuantity: 1,
            product: {
              category: {
                fullName: "Home & Garden > Kitchen & Dining",
              },
            },
            customAttributes: [],
          },
        ],
      },
      fraudHoldFlag: { value: "false" },
      manualReviewFlag: { value: "false" },
      vipOverrideFlag: { value: "false" },
    },
    {
      returnableFulfillments: {
        nodes: [
          {
            id: "gid://shopify/ReturnableFulfillment/1",
            returnableFulfillmentLineItems: {
              nodes: [
                {
                  quantity: 2,
                  fulfillmentLineItem: {
                    id: "gid://shopify/FulfillmentLineItem/800000000001",
                    lineItem: {
                      id: "gid://shopify/LineItem/700000000001",
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    new Date("2026-03-30T00:00:00.000Z"),
  );

  assert.deepEqual(result.lineItems, [
    {
      lineItemId: "gid://shopify/LineItem/700000000001",
      fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/800000000001",
      title: "Returnable Jacket",
      returnableQuantity: 2,
      category: "Apparel & Accessories > Clothing > Outerwear",
      fulfillmentStatus: FulfillmentStatus.Fulfilled,
      hasReturnableFulfillment: true,
      alreadyRefunded: false,
      finalSale: false,
    },
    {
      lineItemId: "gid://shopify/LineItem/700000000002",
      title: "Refunded Socks",
      returnableQuantity: 0,
      category: "Apparel & Accessories > Clothing > Socks",
      fulfillmentStatus: FulfillmentStatus.Fulfilled,
      hasReturnableFulfillment: false,
      alreadyRefunded: true,
      finalSale: false,
    },
    {
      lineItemId: "gid://shopify/LineItem/700000000003",
      title: "Non-returnable Bottle",
      returnableQuantity: 0,
      category: "Home & Garden > Kitchen & Dining",
      fulfillmentStatus: FulfillmentStatus.Fulfilled,
      hasReturnableFulfillment: false,
      alreadyRefunded: false,
      finalSale: false,
    },
  ]);
});

test("maps Admin edge cases for unknown statuses, missing categories, and final-sale attributes", () => {
  const result = mapAdminOrderToRefundContext(
    {
      id: "gid://shopify/Order/900000000304",
      name: "#3004",
      tags: ["  ", "edge-case"],
      createdAt: "2026-03-28T00:00:00.000Z",
      totalPriceSet: {
        shopMoney: {
          amount: undefined,
        },
      },
      displayFinancialStatus: "AUTHORIZED_BUT_NOT_CAPTURED",
      displayFulfillmentStatus: "WAITING_ON_SUPPLIER",
      lineItems: {
        nodes: [
          {
            id: "gid://shopify/LineItem/700000000004",
            title: "Final Sale Gift Card",
            currentQuantity: 1,
            product: null,
            customAttributes: [{ key: " finalsale ", value: " YES " }],
          },
          {
            id: "gid://shopify/LineItem/700000000005",
            title: "Uncategorized Mystery Item",
            currentQuantity: 1,
            product: {
              category: {
                fullName: null,
              },
            },
            customAttributes: [{ key: "final_sale", value: "false" }],
          },
        ],
      },
      fraudHoldFlag: null,
      manualReviewFlag: { value: "no" },
      vipOverrideFlag: { value: "TRUE" },
    },
    {
      returnableFulfillments: {
        nodes: [
          {
            id: "gid://shopify/ReturnableFulfillment/2",
            returnableFulfillmentLineItems: {
              nodes: [
                {
                  quantity: 1,
                  fulfillmentLineItem: {
                    id: "gid://shopify/FulfillmentLineItem/800000000004",
                    lineItem: {
                      id: "gid://shopify/LineItem/700000000004",
                    },
                  },
                },
                {
                  quantity: 0,
                  fulfillmentLineItem: {
                    id: "gid://shopify/FulfillmentLineItem/800000000005",
                    lineItem: {
                      id: "gid://shopify/LineItem/700000000005",
                    },
                  },
                },
                {
                  quantity: 1,
                  fulfillmentLineItem: null,
                },
              ],
            },
          },
        ],
      },
    },
    new Date("2026-03-30T00:00:00.000Z"),
  );

  assert.equal(result.order.financialStatus, FinancialStatus.Unknown);
  assert.equal(result.order.totalAmount, 0);
  assert.deepEqual(result.order.tags, ["edge-case"]);
  assert.equal(result.order.flags?.fraudHold, false);
  assert.equal(result.order.flags?.manualReview, false);
  assert.equal(result.order.flags?.vipOverride, true);
  assert.equal(result.lineItems.length, 2);

  assert.equal(
    result.lineItems[0]?.lineItemId,
    "gid://shopify/LineItem/700000000004",
  );
  assert.equal(
    result.lineItems[0]?.fulfillmentLineItemId,
    "gid://shopify/FulfillmentLineItem/800000000004",
  );
  assert.equal(result.lineItems[0]?.returnableQuantity, 1);
  assert.equal(result.lineItems[0]?.category, undefined);
  assert.equal(result.lineItems[0]?.fulfillmentStatus, FulfillmentStatus.Unknown);
  assert.equal(result.lineItems[0]?.hasReturnableFulfillment, true);
  assert.equal(result.lineItems[0]?.alreadyRefunded, false);
  assert.equal(result.lineItems[0]?.finalSale, true);

  assert.equal(
    result.lineItems[1]?.lineItemId,
    "gid://shopify/LineItem/700000000005",
  );
  assert.equal(result.lineItems[1]?.fulfillmentLineItemId, undefined);
  assert.equal(result.lineItems[1]?.returnableQuantity, 0);
  assert.equal(result.lineItems[1]?.category, undefined);
  assert.equal(result.lineItems[1]?.fulfillmentStatus, FulfillmentStatus.Unknown);
  assert.equal(result.lineItems[1]?.hasReturnableFulfillment, false);
  assert.equal(result.lineItems[1]?.alreadyRefunded, false);
  assert.equal(result.lineItems[1]?.finalSale, false);
});
