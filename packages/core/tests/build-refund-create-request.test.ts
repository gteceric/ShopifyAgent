import test from "node:test";
import assert from "node:assert/strict";

import {
  buildShopifyRefundCreateGraphqlRequest,
  RefundActionValidationStatus,
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
  const request = buildShopifyRefundCreateGraphqlRequest(readyValidation, {
    idempotencyKey: "refund-action-910000000070-700000000070",
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
      transactions: [],
      note: "Customer requested a refund.",
    },
  });
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
