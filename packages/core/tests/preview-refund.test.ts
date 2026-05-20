import test from "node:test";
import assert from "node:assert/strict";

import {
  previewShopifyRefund,
  type PreviewShopifyRefundDeps,
  type PreviewShopifyRefundInput,
} from "../src/index.js";

test("loads Shopify refund preview for selected line items", async () => {
  let capturedRequestBody: unknown;
  const fetchImpl: typeof fetch = async (_url, init) => {
    capturedRequestBody = JSON.parse(String(init?.body));

    return new Response(
      JSON.stringify({
        data: {
          order: {
            id: "gid://shopify/Order/910000000080",
            suggestedRefund: {
              amountSet: {
                shopMoney: {
                  amount: "79.98",
                  currencyCode: "HKD",
                },
                presentmentMoney: {
                  amount: "79.98",
                  currencyCode: "HKD",
                },
              },
              maximumRefundableSet: {
                shopMoney: {
                  amount: "79.98",
                  currencyCode: "HKD",
                },
                presentmentMoney: {
                  amount: "79.98",
                  currencyCode: "HKD",
                },
              },
              subtotalSet: {
                shopMoney: {
                  amount: "69.55",
                  currencyCode: "HKD",
                },
                presentmentMoney: {
                  amount: "69.55",
                  currencyCode: "HKD",
                },
              },
              totalTaxSet: {
                shopMoney: {
                  amount: "10.43",
                  currencyCode: "HKD",
                },
                presentmentMoney: {
                  amount: "10.43",
                  currencyCode: "HKD",
                },
              },
              refundLineItems: [
                {
                  lineItem: {
                    id: "gid://shopify/LineItem/700000000080",
                    title: "Returnable Shirt",
                  },
                  quantity: 1,
                  priceSet: {
                    shopMoney: {
                      amount: "44.99",
                      currencyCode: "HKD",
                    },
                    presentmentMoney: {
                      amount: "44.99",
                      currencyCode: "HKD",
                    },
                  },
                },
                {
                  lineItem: {
                    id: "gid://shopify/LineItem/700000000081",
                    title: "Returnable Pants",
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
                  kind: "REFUND",
                  gateway: "shopify_payments",
                  amountSet: {
                    shopMoney: {
                      amount: "79.98",
                      currencyCode: "HKD",
                    },
                    presentmentMoney: {
                      amount: "79.98",
                      currencyCode: "HKD",
                    },
                  },
                  maximumRefundableSet: {
                    shopMoney: {
                      amount: "79.98",
                      currencyCode: "HKD",
                    },
                    presentmentMoney: {
                      amount: "79.98",
                      currencyCode: "HKD",
                    },
                  },
                  parentTransaction: {
                    id: "gid://shopify/OrderTransaction/790000000080",
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
  };
  const input: PreviewShopifyRefundInput = {
    orderId: "gid://shopify/Order/910000000080",
    refundLineItems: [
      {
        lineItemId: "gid://shopify/LineItem/700000000080",
        quantity: 1,
      },
      {
        lineItemId: "gid://shopify/LineItem/700000000081",
        quantity: 1,
      },
    ],
  };
  const deps: PreviewShopifyRefundDeps = {
    env: {
      SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
      SHOPIFY_ADMIN_TOKEN: "shpat_test",
    },
    fetchImpl,
  };

  const refundPreview = await previewShopifyRefund(input, deps);

  const requestBody = capturedRequestBody as {
    query: string;
    variables: unknown;
  };
  assert.match(requestBody.query, /suggestedRefund/);
  assert.deepEqual(requestBody.variables, {
    orderId: "gid://shopify/Order/910000000080",
    refundLineItems: [
      {
        lineItemId: "gid://shopify/LineItem/700000000080",
        quantity: 1,
      },
      {
        lineItemId: "gid://shopify/LineItem/700000000081",
        quantity: 1,
      },
    ],
  });
  assert.deepEqual(refundPreview, {
    orderId: "gid://shopify/Order/910000000080",
    amount: {
      shopMoney: {
        amount: "79.98",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "79.98",
        currencyCode: "HKD",
      },
    },
    maximumRefundable: {
      shopMoney: {
        amount: "79.98",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "79.98",
        currencyCode: "HKD",
      },
    },
    subtotal: {
      shopMoney: {
        amount: "69.55",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "69.55",
        currencyCode: "HKD",
      },
    },
    totalTax: {
      shopMoney: {
        amount: "10.43",
        currencyCode: "HKD",
      },
      presentmentMoney: {
        amount: "10.43",
        currencyCode: "HKD",
      },
    },
    refundLineItems: [
      {
        lineItemId: "gid://shopify/LineItem/700000000080",
        title: "Returnable Shirt",
        quantity: 1,
        price: {
          shopMoney: {
            amount: "44.99",
            currencyCode: "HKD",
          },
          presentmentMoney: {
            amount: "44.99",
            currencyCode: "HKD",
          },
        },
      },
      {
        lineItemId: "gid://shopify/LineItem/700000000081",
        title: "Returnable Pants",
        quantity: 1,
        price: {
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
        kind: "REFUND",
        gateway: "shopify_payments",
        amount: {
          shopMoney: {
            amount: "79.98",
            currencyCode: "HKD",
          },
          presentmentMoney: {
            amount: "79.98",
            currencyCode: "HKD",
          },
        },
        parentTransactionId: "gid://shopify/OrderTransaction/790000000080",
        maximumRefundable: {
          shopMoney: {
            amount: "79.98",
            currencyCode: "HKD",
          },
          presentmentMoney: {
            amount: "79.98",
            currencyCode: "HKD",
          },
        },
      },
    ],
  });
});

test("throws when Shopify refund preview response has no order", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          order: null,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  const input: PreviewShopifyRefundInput = {
    orderId: "gid://shopify/Order/910000000081",
    refundLineItems: [
      {
        lineItemId: "gid://shopify/LineItem/700000000081",
        quantity: 1,
      },
    ],
  };
  const deps: PreviewShopifyRefundDeps = {
    env: {
      SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
      SHOPIFY_ADMIN_TOKEN: "shpat_test",
    },
    fetchImpl,
  };

  await assert.rejects(
    () => previewShopifyRefund(input, deps),
    /was not found/,
  );
});

test("throws when Shopify order does not return a refund preview", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          order: {
            id: "gid://shopify/Order/910000000082",
            suggestedRefund: null,
          },
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  const input: PreviewShopifyRefundInput = {
    orderId: "gid://shopify/Order/910000000082",
    refundLineItems: [
      {
        lineItemId: "gid://shopify/LineItem/700000000082",
        quantity: 1,
      },
    ],
  };
  const deps: PreviewShopifyRefundDeps = {
    env: {
      SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
      SHOPIFY_ADMIN_TOKEN: "shpat_test",
    },
    fetchImpl,
  };

  await assert.rejects(
    () => previewShopifyRefund(input, deps),
    /did not return a refund preview/,
  );
});
