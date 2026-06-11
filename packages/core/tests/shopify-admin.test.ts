import assert from "node:assert/strict";
import test from "node:test";
import { createShopifyAdminClient } from "../src/platforms/shopify/shopify-admin.js";
import { isRequestTimeoutError } from "../src/shared/fetch-with-timeout.js";

test("creates a Shopify Admin client bound to one merchant's credentials", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ input: String(input), init });

    return new Response(
      JSON.stringify({
        data: {
          shop: {
            id: "gid://shopify/Shop/1",
          },
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  };
  const client = createShopifyAdminClient({
    shopDomain: "first-shop.myshopify.com",
    accessToken: "merchant-access-token",
    apiVersion: "2026-01",
    fetchImpl,
  });

  const result = await client.fetch<{ shop: { id: string } }>(
    "query Shop { shop { id } }",
    {},
  );

  assert.deepEqual(result, {
    shop: {
      id: "gid://shopify/Shop/1",
    },
  });
  assert.equal(
    requests[0]?.input,
    "https://first-shop.myshopify.com/admin/api/2026-01/graphql.json",
  );
  assert.deepEqual(requests[0]?.init?.headers, {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": "merchant-access-token",
  });
  assert.ok(requests[0]?.init?.signal);
});

test("rejects blank Shopify Admin client credentials", () => {
  assert.throws(
    () =>
      createShopifyAdminClient({
        shopDomain: " ",
        accessToken: "merchant-access-token",
        fetchImpl: fetch,
      }),
    /shopDomain is required\./,
  );
  assert.throws(
    () =>
      createShopifyAdminClient({
        shopDomain: "merchant-shop.myshopify.com",
        accessToken: " ",
        fetchImpl: fetch,
      }),
    /accessToken is required\./,
  );
});

test("applies a custom timeout to a bound Shopify Admin client", async () => {
  const client = createShopifyAdminClient({
    shopDomain: "first-shop.myshopify.com",
    accessToken: "merchant-access-token",
    timeoutMs: 10,
    fetchImpl: (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Request aborted", "AbortError"));
        });
      }),
  });

  await assert.rejects(
    client.fetch("query Shop { shop { id } }", {}),
    (error: unknown) => isRequestTimeoutError(error),
  );
});
