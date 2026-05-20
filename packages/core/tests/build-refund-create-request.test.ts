import test from "node:test";
import assert from "node:assert/strict";

import {
  buildShopifyRefundCreateGraphqlRequest,
  RefundActionValidationStatus,
  resolveRefundTransactionInputs,
} from "../src/index.js";
import type {
  ResolveRefundTransactionInputsInput,
  ShopifySuggestedRefund,
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

test("builds refund transaction inputs from Shopify suggested refund", () => {
  const suggestedRefund: ShopifySuggestedRefund = {
    orderId: "gid://shopify/Order/910000000070",
    amount: {
      shopMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
    },
    maximumRefundable: {
      shopMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
    },
    subtotal: {
      shopMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
    },
    totalTax: {
      shopMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
    },
    refundLineItems: [],
    suggestedTransactions: [
      {
        kind: "SUGGESTED_REFUND",
        gateway: "shopify_payments",
        amount: {
          shopMoney: {
            amount: "54.99",
            currencyCode: "HKD",
          },
          presentmentMoney: {
            amount: "54.99",
            currencyCode: "HKD",
          },
        },
        parentTransactionId: "gid://shopify/OrderTransaction/700000000001",
      },
    ],
  };
  const input: ResolveRefundTransactionInputsInput = {
    orderId: "gid://shopify/Order/910000000070",
    suggestedRefund,
  };

  const refundTransactionInputs = resolveRefundTransactionInputs(input);

  assert.deepEqual(refundTransactionInputs, [
    {
      orderId: "gid://shopify/Order/910000000070",
      parentId: "gid://shopify/OrderTransaction/700000000001",
      gateway: "shopify_payments",
      kind: "REFUND",
      amount: "54.99",
    },
  ]);
});

test("does not build refund transaction inputs without suggested transactions", () => {
  const suggestedRefund: ShopifySuggestedRefund = {
    orderId: "gid://shopify/Order/910000000070",
    amount: {
      shopMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
    },
    maximumRefundable: {
      shopMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
    },
    subtotal: {
      shopMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
    },
    totalTax: {
      shopMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
    },
    refundLineItems: [],
    suggestedTransactions: [],
  };
  const input: ResolveRefundTransactionInputsInput = {
    orderId: "gid://shopify/Order/910000000070",
    suggestedRefund,
  };

  assert.throws(
    () => resolveRefundTransactionInputs(input),
    /did not return suggested transactions/,
  );
});

test("does not build refund transaction inputs without a parent transaction", () => {
  const suggestedRefund: ShopifySuggestedRefund = {
    orderId: "gid://shopify/Order/910000000070",
    amount: {
      shopMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
    },
    maximumRefundable: {
      shopMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
    },
    subtotal: {
      shopMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "54.99",
        currencyCode: "HKD",
      },
    },
    totalTax: {
      shopMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "0.0",
        currencyCode: "HKD",
      },
    },
    refundLineItems: [],
    suggestedTransactions: [
      {
        kind: "SUGGESTED_REFUND",
        gateway: "shopify_payments",
        amount: {
          shopMoney: {
            amount: "54.99",
            currencyCode: "HKD",
          },
          presentmentMoney: {
            amount: "54.99",
            currencyCode: "HKD",
          },
        },
      },
    ],
  };
  const input: ResolveRefundTransactionInputsInput = {
    orderId: "gid://shopify/Order/910000000070",
    suggestedRefund,
  };

  assert.throws(
    () => resolveRefundTransactionInputs(input),
    /parent transaction/,
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
