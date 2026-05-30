import assert from "node:assert/strict";
import test from "node:test";

import { loadShopifyShopIdentity } from "../src/platforms/shopify/load-shop-identity.js";

test("loads Shopify shop identity from Admin GraphQL", async () => {
  const requestedBodies: unknown[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestedBodies.push(JSON.parse(String(init?.body)));

    return new Response(
      JSON.stringify({
        data: {
          shop: {
            id: "gid://shopify/Shop/1",
            myshopifyDomain: "demo-shop.myshopify.com",
            name: "Demo Shop",
          },
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  };

  const identity = await loadShopifyShopIdentity({
    env: {
      SHOPIFY_STORE_DOMAIN: "demo-shop.myshopify.com",
      SHOPIFY_ADMIN_TOKEN: "test-token",
    },
    fetchImpl,
  });

  assert.deepEqual(identity, {
    id: "gid://shopify/Shop/1",
    myshopifyDomain: "demo-shop.myshopify.com",
    name: "Demo Shop",
  });
  assert.equal(requestedBodies.length, 1);
  assert.match(
    (requestedBodies[0] as { query: string }).query,
    /ShopifyShopIdentity/,
  );
});

test("throws when Shopify shop identity is missing its platform id", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          shop: {
            id: null,
            myshopifyDomain: "demo-shop.myshopify.com",
          },
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

  await assert.rejects(
    loadShopifyShopIdentity({
      env: {
        SHOPIFY_STORE_DOMAIN: "demo-shop.myshopify.com",
        SHOPIFY_ADMIN_TOKEN: "test-token",
      },
      fetchImpl,
    }),
    /missing shop\.id/,
  );
});
