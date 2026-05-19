import test from "node:test";
import assert from "node:assert/strict";

import {
  loadShopifyOrderTransactions,
  type LoadShopifyOrderTransactionsDeps,
  type LoadShopifyOrderTransactionsInput,
} from "../src/index.js";

test("loads Shopify order transactions through Admin GraphQL", async () => {
  let capturedRequestBody: unknown;
  const fetchImpl: typeof fetch = async (_url, init) => {
    capturedRequestBody = JSON.parse(String(init?.body));

    return new Response(
      JSON.stringify({
        data: {
          order: {
            id: "gid://shopify/Order/6261109358705",
            transactions: [
              {
                id: "gid://shopify/OrderTransaction/700000000001",
                kind: "SALE",
                status: "SUCCESS",
                gateway: "shopify_payments",
                test: true,
                parentTransaction: null,
                amountSet: {
                  shopMoney: {
                    amount: "120.00",
                    currencyCode: "HKD",
                  },
                  presentmentMoney: {
                    amount: "120.00",
                    currencyCode: "HKD",
                  },
                },
                maximumRefundableV2: {
                  amount: "120.00",
                  currencyCode: "HKD",
                },
              },
              {
                id: "gid://shopify/OrderTransaction/700000000002",
                kind: "REFUND",
                status: "SUCCESS",
                gateway: "shopify_payments",
                test: true,
                parentTransaction: {
                  id: "gid://shopify/OrderTransaction/700000000001",
                },
                amountSet: {
                  shopMoney: {
                    amount: "24.00",
                    currencyCode: "HKD",
                  },
                  presentmentMoney: {
                    amount: "24.00",
                    currencyCode: "HKD",
                  },
                },
                maximumRefundableV2: null,
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
  };
  const input: LoadShopifyOrderTransactionsInput = {
    orderId: "gid://shopify/Order/6261109358705",
    first: 10,
  };
  const deps: LoadShopifyOrderTransactionsDeps = {
    env: {
      SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
      SHOPIFY_ADMIN_TOKEN: "shpat_test",
    },
    fetchImpl,
  };

  const transactions = await loadShopifyOrderTransactions(input, deps);

  const requestBody = capturedRequestBody as {
    query: string;
    variables: unknown;
  };

  assert.match(requestBody.query, /ShopifyOrderTransactions/);
  assert.deepEqual(requestBody.variables, {
    orderId: "gid://shopify/Order/6261109358705",
    first: 10,
  });
  assert.deepEqual(transactions, [
    {
      id: "gid://shopify/OrderTransaction/700000000001",
      kind: "SALE",
      status: "SUCCESS",
      gateway: "shopify_payments",
      test: true,
      shopAmount: {
        amount: "120.00",
        currencyCode: "HKD",
      },
      presentmentAmount: {
        amount: "120.00",
        currencyCode: "HKD",
      },
      maximumRefundable: {
        amount: "120.00",
        currencyCode: "HKD",
      },
    },
    {
      id: "gid://shopify/OrderTransaction/700000000002",
      kind: "REFUND",
      status: "SUCCESS",
      gateway: "shopify_payments",
      test: true,
      shopAmount: {
        amount: "24.00",
        currencyCode: "HKD",
      },
      presentmentAmount: {
        amount: "24.00",
        currencyCode: "HKD",
      },
      parentTransactionId: "gid://shopify/OrderTransaction/700000000001",
    },
  ]);
});

test("throws when Shopify order transactions response has no order", async () => {
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
  const input: LoadShopifyOrderTransactionsInput = {
    orderId: "gid://shopify/Order/9999999999999",
  };
  const deps: LoadShopifyOrderTransactionsDeps = {
    env: {
      SHOPIFY_STORE_DOMAIN: "example.myshopify.com",
      SHOPIFY_ADMIN_TOKEN: "shpat_test",
    },
    fetchImpl,
  };

  await assert.rejects(
    () => loadShopifyOrderTransactions(input, deps),
    /No Shopify order exists for gid:\/\/shopify\/Order\/9999999999999\./,
  );
});
