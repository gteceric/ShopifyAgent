import assert from "node:assert/strict";
import test from "node:test";
import { createShopifyAdminClient } from "../src/platforms/shopify/shopify-admin.js";

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
});

test("rejects blank Shopify Admin client credentials", () => {
  assert.throws(
    () =>
      createShopifyAdminClient({
        shopDomain: " ",
        accessToken: "merchant-access-token",
      }),
    /shopDomain is required\./,
  );
  assert.throws(
    () =>
      createShopifyAdminClient({
        shopDomain: "merchant-shop.myshopify.com",
        accessToken: " ",
      }),
    /accessToken is required\./,
  );
});
