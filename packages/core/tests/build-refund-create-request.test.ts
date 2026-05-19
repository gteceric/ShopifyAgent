import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRefundTransactionInputs,
  buildShopifyRefundCreateGraphqlRequest,
  RefundActionValidationStatus,
} from "../src/index.js";
import type { RefundPaymentTransaction } from "../src/index.js";
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

test("builds Shopify refundCreate GraphQL request from ready refund action validation", () => {
  const refundTransactionInputs = [
    {
      orderId: "gid://shopify/Order/910000000070",
      parentId: "gid://shopify/OrderTransaction/700000000001",
      gateway: "shopify_payments",
      kind: "REFUND" as const,
      amount: "24.00",
    },
  ];
  const request = buildShopifyRefundCreateGraphqlRequest(readyValidation, {
    idempotencyKey: "refund-action-910000000070-700000000070",
    refundTransactionInputs,
    note: "Customer requested a refund.",
  });

  assert.match(request.query, /refundCreate\(input: \$input\)/);
  assert.match(request.query, /@idempotent\(key: \$idempotencyKey\)/);
  assert.deepEqual(request.variables, {
    idempotencyKey: "refund-action-910000000070-700000000070",
    input: {
      orderId: "gid://shopify/Order/910000000070",
      refundLineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 1,
        },
      ],
      transactions: refundTransactionInputs,
      note: "Customer requested a refund.",
    },
  });
});

test("builds refund transaction inputs from one successful payment transaction", () => {
  const paymentTransactions: RefundPaymentTransaction[] = [
    {
      id: "gid://shopify/OrderTransaction/700000000001",
      kind: "SALE",
      status: "SUCCESS",
      gateway: "shopify_payments",
      test: true,
      shopAmount: {
        amount: "44.99",
        currencyCode: "HKD",
      },
      presentmentAmount: {
        amount: "44.99",
        currencyCode: "HKD",
      },
    },
  ];

  const refundTransactionInputs = buildRefundTransactionInputs({
    orderId: "gid://shopify/Order/910000000070",
    refundAmount: "44.99",
    paymentTransactions,
  });

  assert.deepEqual(refundTransactionInputs, [
    {
      orderId: "gid://shopify/Order/910000000070",
      parentId: "gid://shopify/OrderTransaction/700000000001",
      gateway: "shopify_payments",
      kind: "REFUND",
      amount: "44.99",
    },
  ]);
});

test("does not build refund transaction inputs without successful payment transactions", () => {
  const paymentTransactions: RefundPaymentTransaction[] = [
    {
      id: "gid://shopify/OrderTransaction/700000000002",
      kind: "REFUND",
      status: "SUCCESS",
      gateway: "shopify_payments",
      test: true,
      shopAmount: {
        amount: "12.00",
        currencyCode: "HKD",
      },
      presentmentAmount: {
        amount: "12.00",
        currencyCode: "HKD",
      },
    },
  ];

  assert.throws(
    () =>
      buildRefundTransactionInputs({
        orderId: "gid://shopify/Order/910000000070",
        refundAmount: "12.00",
        paymentTransactions,
      }),
    /no successful payment transaction/,
  );
});

test("does not build refund transaction inputs for multiple successful payment transactions", () => {
  const paymentTransactions: RefundPaymentTransaction[] = [
    {
      id: "gid://shopify/OrderTransaction/700000000001",
      kind: "SALE",
      status: "SUCCESS",
      gateway: "gift_card",
      test: true,
      shopAmount: {
        amount: "20.00",
        currencyCode: "HKD",
      },
      presentmentAmount: {
        amount: "20.00",
        currencyCode: "HKD",
      },
    },
    {
      id: "gid://shopify/OrderTransaction/700000000002",
      kind: "SALE",
      status: "SUCCESS",
      gateway: "shopify_payments",
      test: true,
      shopAmount: {
        amount: "24.99",
        currencyCode: "HKD",
      },
      presentmentAmount: {
        amount: "24.99",
        currencyCode: "HKD",
      },
    },
  ];

  assert.throws(
    () =>
      buildRefundTransactionInputs({
        orderId: "gid://shopify/Order/910000000070",
        refundAmount: "44.99",
        paymentTransactions,
      }),
    /multiple successful payment transactions/,
  );
});

test("does not build Shopify refundCreate request when validation is blocked", () => {
  assert.throws(
    () =>
      buildShopifyRefundCreateGraphqlRequest(
        {
          ...readyValidation,
          status: RefundActionValidationStatus.Blocked,
          blockers: [
            {
              code: "order_ineligible",
              message: "Refund action is blocked because the order is ineligible.",
            },
          ],
        },
        {
          idempotencyKey: "refund-action-blocked",
        },
      ),
    /validation is ready/,
  );
});

test("requires an idempotency key for Shopify refundCreate request", () => {
  assert.throws(
    () =>
      buildShopifyRefundCreateGraphqlRequest(readyValidation, {
        idempotencyKey: " ",
      }),
    /idempotency key/,
  );
});
