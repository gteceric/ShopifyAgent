import assert from "node:assert/strict";
import test from "node:test";
import {
  FinancialStatus,
  FulfillmentStatus,
  type RefundContext,
  type ShopifyRefundSyncRecord,
} from "@shopify-agent/core";
import {
  buildShopifyOrderSnapshotInput,
  type BuildShopifyOrderSnapshotInput,
} from "../src/platforms/shopify/sync-order-snapshot.js";

test("maps normalized Shopify refund context into a persistable order snapshot", () => {
  const context: RefundContext = {
    order: {
      id: "gid://shopify/Order/6609533698161",
      name: "#1001",
      createdAt: "2026-05-27T07:00:00.000Z",
      ageDays: 1,
      totalAmount: 150.97,
      financialStatus: FinancialStatus.PartiallyRefunded,
      tags: [],
      flags: {
        fraudHold: false,
        manualReview: false,
        vipOverride: false,
      },
    },
    lineItems: [
      {
        lineItemId: "gid://shopify/LineItem/15870468554865",
        title: "Maui Jim MJ2113 Peahi 58mm Wide",
        sku: "MJ2113-58",
        variantTitle: "Lens Type / Lens Color",
        variantOptions: [
          {
            name: "Lens Type",
            value: "Polarized",
          },
        ],
        imageUrl: "https://example.test/image.jpg",
        imageAltText: "Maui Jim sunglasses",
        unitPrice: {
          amount: "56.99",
          currencyCode: "HKD",
        },
        returnableQuantity: 2,
        pendingRefundQuantity: 1,
        category: "Apparel & Accessories > Sunglasses",
        fulfillmentStatus: FulfillmentStatus.Fulfilled,
        hasReturnableFulfillment: true,
        alreadyRefunded: false,
        finalSale: false,
      },
    ],
  };
  const syncedAt = new Date("2026-05-28T01:00:00.000Z");
  const refunds: ShopifyRefundSyncRecord[] = [
    {
      refundId: "gid://shopify/Refund/983552032881",
      status: "pending",
      totalRefunded: {
        amount: "56.99",
        currencyCode: "HKD",
      },
      lineItems: [
        {
          platformRefundLineItemId: "gid://shopify/RefundLineItem/983552032881-1",
          lineItemId: "gid://shopify/LineItem/15870468554865",
          quantity: 1,
          subtotal: {
            amount: "56.99",
            currencyCode: "HKD",
          },
        },
      ],
      transactions: [
        {
          transactionId: "gid://shopify/OrderTransaction/8429734035569",
          kind: "REFUND",
          gateway: "shopify_payments",
          status: "PENDING",
          amount: {
            amount: "56.99",
            currencyCode: "HKD",
          },
        },
      ],
    },
  ];
  const buildSnapshotInput: BuildShopifyOrderSnapshotInput = {
    context,
    refunds,
    shopDomain: "demo-shop.myshopify.com",
    syncedAt,
  };
  const snapshotInput = buildShopifyOrderSnapshotInput(buildSnapshotInput);

  assert.deepEqual(snapshotInput.platformAccount, {
    platform: "shopify",
    platformAccountId: "demo-shop.myshopify.com",
    shopDomain: "demo-shop.myshopify.com",
  });
  assert.deepEqual(snapshotInput.order, {
    platformOrderId: "gid://shopify/Order/6609533698161",
    orderName: "#1001",
    createdAtPlatform: "2026-05-27T07:00:00.000Z",
    financialStatus: "partially_refunded",
    totalAmount: "150.97",
    syncedAt,
  });
  assert.deepEqual(snapshotInput.lineItems, [
    {
      platformLineItemId: "gid://shopify/LineItem/15870468554865",
      title: "Maui Jim MJ2113 Peahi 58mm Wide",
      sku: "MJ2113-58",
      variantTitle: "Lens Type / Lens Color",
      variantOptions: [
        {
          name: "Lens Type",
          value: "Polarized",
        },
      ],
      imageUrl: "https://example.test/image.jpg",
      imageAltText: "Maui Jim sunglasses",
      category: "Apparel & Accessories > Sunglasses",
      fulfillmentStatus: "fulfilled",
      hasReturnableFulfillment: true,
      finalSale: false,
      unitPrice: "56.99",
      currencyCode: "HKD",
      returnableQuantity: 2,
      pendingRefundQuantity: 1,
    },
  ]);
  assert.deepEqual(snapshotInput.refunds, [
    {
      platformRefundId: "gid://shopify/Refund/983552032881",
      status: "pending",
      totalAmount: "56.99",
      currencyCode: "HKD",
      lineItems: [
        {
          platformRefundLineItemId: "gid://shopify/RefundLineItem/983552032881-1",
          platformLineItemId: "gid://shopify/LineItem/15870468554865",
          quantity: 1,
          subtotalAmount: "56.99",
          currencyCode: "HKD",
        },
      ],
      transactions: [
        {
          platformRefundTransactionId:
            "gid://shopify/OrderTransaction/8429734035569",
          kind: "REFUND",
          gateway: "shopify_payments",
          status: "PENDING",
          amount: "56.99",
          currencyCode: "HKD",
        },
      ],
    },
  ]);
});
