import test from "node:test";
import assert from "node:assert/strict";

import {
  executeShopifyRefundAction,
  RefundActionValidationStatus,
  ShopifyRefundActionExecutionStatus,
  type ExecuteShopifyRefundActionDependencies,
  type ExecuteShopifyRefundActionInput,
} from "../src/index.js";
import { RefundDecision } from "../src/domain/refund-policy.types.js";
import { createTestShopifyAdminClient } from "./test-shopify-admin-client.js";

const readyValidation = {
  orderId: "gid://shopify/Order/910000000070",
  status: RefundActionValidationStatus.Ready,
  blockers: [],
  matchedLineItems: [
    {
      lineItemId: "gid://shopify/LineItem/700000000070",
      title: "Returnable Shirt",
      requestedQuantity: 1,
      returnableQuantity: 2,
      decision: RefundDecision.Eligible,
    },
  ],
};

const multiItemReadyValidation = {
  ...readyValidation,
  matchedLineItems: [
    ...readyValidation.matchedLineItems,
    {
      lineItemId: "gid://shopify/LineItem/700000000071",
      title: "Returnable Pants",
      requestedQuantity: 2,
      returnableQuantity: 3,
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
  const dependencies: ExecuteShopifyRefundActionDependencies = {
    env: {},
    shopifyAdminClient: createTestShopifyAdminClient(fetchImpl),
  };

  const result = await executeShopifyRefundAction(input, dependencies);

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

test("uses mock Shopify refund execution for multiple line items", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("Mock refund execution should not call fetch.");
  };
  const input: ExecuteShopifyRefundActionInput = {
    validation: multiItemReadyValidation,
    idempotencyKey: "refund-action-910000000070-multi-item",
  };
  const dependencies: ExecuteShopifyRefundActionDependencies = {
    env: {},
    shopifyAdminClient: createTestShopifyAdminClient(fetchImpl),
  };

  const result = await executeShopifyRefundAction(input, dependencies);

  assert.equal(result.status, ShopifyRefundActionExecutionStatus.Succeeded);
  assert.deepEqual(result.lineItems, [
    {
      lineItemId: "gid://shopify/LineItem/700000000070",
      quantity: 1,
      title: "Returnable Shirt",
    },
    {
      lineItemId: "gid://shopify/LineItem/700000000071",
      quantity: 2,
      title: "Returnable Pants",
    },
  ]);
});

test("executes Shopify refundCreate from Shopify refund preview", async () => {
  const capturedRequestBodies: Array<{
    query: string;
    variables: unknown;
  }> = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const requestBody = JSON.parse(String(init?.body)) as {
      query: string;
      variables: unknown;
    };
    capturedRequestBodies.push(requestBody);

    if (requestBody.query.includes("ShopifyRefundPreview")) {
      return new Response(
        JSON.stringify({
          data: {
            order: {
              id: "gid://shopify/Order/910000000070",
              suggestedRefund: {
                amountSet: {
                  shopMoney: {
                    amount: "54.99",
                    currencyCode: "HKD",
                  },
                  presentmentMoney: {
                    amount: "54.99",
                    currencyCode: "HKD",
                  },
                },
                maximumRefundableSet: {
                  shopMoney: {
                    amount: "54.99",
                    currencyCode: "HKD",
                  },
                  presentmentMoney: {
                    amount: "54.99",
                    currencyCode: "HKD",
                  },
                },
                subtotalSet: {
                  shopMoney: {
                    amount: "54.99",
                    currencyCode: "HKD",
                  },
                  presentmentMoney: {
                    amount: "54.99",
                    currencyCode: "HKD",
                  },
                },
                totalTaxSet: {
                  shopMoney: {
                    amount: "0.0",
                    currencyCode: "HKD",
                  },
                  presentmentMoney: {
                    amount: "0.0",
                    currencyCode: "HKD",
                  },
                },
                refundLineItems: [
                  {
                    lineItem: {
                      id: "gid://shopify/LineItem/700000000070",
                      title: "Returnable Shirt",
                    },
                    quantity: 1,
                    priceSet: {
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
                suggestedTransactions: [
                  {
                    kind: "SUGGESTED_REFUND",
                    gateway: "shopify_payments",
                    amountSet: {
                      shopMoney: {
                        amount: "54.99",
                        currencyCode: "HKD",
                      },
                      presentmentMoney: {
                        amount: "54.99",
                        currencyCode: "HKD",
                      },
                    },
                    maximumRefundableSet: {
                      shopMoney: {
                        amount: "54.99",
                        currencyCode: "HKD",
                      },
                      presentmentMoney: {
                        amount: "54.99",
                        currencyCode: "HKD",
                      },
                    },
                    parentTransaction: {
                      id: "gid://shopify/OrderTransaction/790000000070",
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
    }

    return new Response(
      JSON.stringify({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/990000000070",
              totalRefundedSet: {
                presentmentMoney: {
                  amount: "54.99",
                  currencyCode: "HKD",
                },
              },
              transactions: {
                edges: [
                  {
                    node: {
                      id: "gid://shopify/OrderTransaction/790000000071",
                      kind: "REFUND",
                      gateway: "shopify_payments",
                      status: "SUCCESS",
                      amountSet: {
                        presentmentMoney: {
                          amount: "54.99",
                          currencyCode: "HKD",
                        },
                      },
                    },
                  },
                ],
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
  const dependencies: ExecuteShopifyRefundActionDependencies = {
    env: {
      USE_REAL_SHOPIFY: "true",
      ENABLE_REAL_REFUND_EXECUTION: "true",
    },
    shopifyAdminClient: createTestShopifyAdminClient(fetchImpl),
  };

  const result = await executeShopifyRefundAction(input, dependencies);

  assert.equal(result.status, ShopifyRefundActionExecutionStatus.Succeeded);
  assert.equal(result.source, "shopify");
  assert.equal(result.refundId, "gid://shopify/Refund/990000000070");
  assert.deepEqual(result.totalRefunded, {
    amount: "54.99",
    currencyCode: "HKD",
  });
  assert.deepEqual(result.refundTransactions, [
    {
      id: "gid://shopify/OrderTransaction/790000000071",
      kind: "REFUND",
      gateway: "shopify_payments",
      status: "SUCCESS",
      amount: {
        amount: "54.99",
        currencyCode: "HKD",
      },
    },
  ]);
  assert.equal(capturedRequestBodies.length, 2);
  assert.match(capturedRequestBodies[0]!.query, /suggestedRefund/);
  assert.deepEqual(capturedRequestBodies[0]!.variables, {
    orderId: "gid://shopify/Order/910000000070",
    refundLineItems: [
      {
        lineItemId: "gid://shopify/LineItem/700000000070",
        quantity: 1,
      },
    ],
  });
  assert.match(capturedRequestBodies[1]!.query, /refundCreate\(input: \$input\)/);
  assert.deepEqual(capturedRequestBodies[1]!.variables, {
    idempotencyKey: "refund-action-910000000070-700000000070",
    input: {
      orderId: "gid://shopify/Order/910000000070",
      refundLineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 1,
        },
      ],
      transactions: [
        {
          orderId: "gid://shopify/Order/910000000070",
          parentId: "gid://shopify/OrderTransaction/790000000070",
          gateway: "shopify_payments",
          kind: "REFUND",
          amount: "54.99",
        },
      ],
      note: "Customer requested a refund.",
    },
  });
});

test("returns pending when Shopify refund transaction is pending", async () => {
  const fetchImpl: typeof fetch = async (_url, init) => {
    const requestBody = JSON.parse(String(init?.body)) as {
      query: string;
    };

    if (requestBody.query.includes("ShopifyRefundPreview")) {
      return new Response(
        JSON.stringify({
          data: {
            order: {
              id: "gid://shopify/Order/910000000070",
              suggestedRefund: {
                amountSet: {
                  shopMoney: {
                    amount: "34.99",
                    currencyCode: "HKD",
                  },
                  presentmentMoney: {
                    amount: "34.99",
                    currencyCode: "HKD",
                  },
                },
                maximumRefundableSet: {
                  shopMoney: {
                    amount: "34.99",
                    currencyCode: "HKD",
                  },
                  presentmentMoney: {
                    amount: "34.99",
                    currencyCode: "HKD",
                  },
                },
                subtotalSet: {
                  shopMoney: {
                    amount: "34.99",
                    currencyCode: "HKD",
                  },
                  presentmentMoney: {
                    amount: "34.99",
                    currencyCode: "HKD",
                  },
                },
                totalTaxSet: {
                  shopMoney: {
                    amount: "0.0",
                    currencyCode: "HKD",
                  },
                  presentmentMoney: {
                    amount: "0.0",
                    currencyCode: "HKD",
                  },
                },
                refundLineItems: [
                  {
                    lineItem: {
                      id: "gid://shopify/LineItem/700000000070",
                      title: "Returnable Shirt",
                    },
                    quantity: 1,
                    priceSet: {
                      shopMoney: {
                        amount: "34.99",
                        currencyCode: "HKD",
                      },
                      presentmentMoney: {
                        amount: "34.99",
                        currencyCode: "HKD",
                      },
                    },
                  },
                ],
                suggestedTransactions: [
                  {
                    kind: "SUGGESTED_REFUND",
                    gateway: "shopify_payments",
                    amountSet: {
                      shopMoney: {
                        amount: "34.99",
                        currencyCode: "HKD",
                      },
                      presentmentMoney: {
                        amount: "34.99",
                        currencyCode: "HKD",
                      },
                    },
                    maximumRefundableSet: {
                      shopMoney: {
                        amount: "34.99",
                        currencyCode: "HKD",
                      },
                      presentmentMoney: {
                        amount: "34.99",
                        currencyCode: "HKD",
                      },
                    },
                    parentTransaction: {
                      id: "gid://shopify/OrderTransaction/790000000070",
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
    }

    return new Response(
      JSON.stringify({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/990000000070",
              totalRefundedSet: {
                presentmentMoney: {
                  amount: "0.0",
                  currencyCode: "HKD",
                },
              },
              transactions: {
                edges: [
                  {
                    node: {
                      id: "gid://shopify/OrderTransaction/790000000071",
                      kind: "REFUND",
                      gateway: "shopify_payments",
                      status: "PENDING",
                      amountSet: {
                        presentmentMoney: {
                          amount: "34.99",
                          currencyCode: "HKD",
                        },
                      },
                    },
                  },
                ],
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
  };
  const dependencies: ExecuteShopifyRefundActionDependencies = {
    env: {
      USE_REAL_SHOPIFY: "true",
      ENABLE_REAL_REFUND_EXECUTION: "true",
    },
    shopifyAdminClient: createTestShopifyAdminClient(fetchImpl),
  };

  const result = await executeShopifyRefundAction(input, dependencies);

  assert.equal(result.status, ShopifyRefundActionExecutionStatus.Pending);
  assert.deepEqual(result.refundTransactions, [
    {
      id: "gid://shopify/OrderTransaction/790000000071",
      kind: "REFUND",
      gateway: "shopify_payments",
      status: "PENDING",
      amount: {
        amount: "34.99",
        currencyCode: "HKD",
      },
    },
  ]);
});

test("throws when real Shopify refund execution is requested without an Admin client", async () => {
  const input: ExecuteShopifyRefundActionInput = {
    validation: readyValidation,
    idempotencyKey: "refund-action-910000000070-700000000070",
  };
  const dependencies: ExecuteShopifyRefundActionDependencies = {
    env: {
      USE_REAL_SHOPIFY: "true",
    },
  };

  await assert.rejects(
    () => executeShopifyRefundAction(input, dependencies),
    /requires ShopifyAdminClient\./,
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
  const dependencies: ExecuteShopifyRefundActionDependencies = {
    env: {
      USE_REAL_SHOPIFY: "true",
    },
    shopifyAdminClient: createTestShopifyAdminClient(fetchImpl),
  };

  await assert.rejects(
    () => executeShopifyRefundAction(input, dependencies),
    /ENABLE_REAL_REFUND_EXECUTION=true/,
  );
});
