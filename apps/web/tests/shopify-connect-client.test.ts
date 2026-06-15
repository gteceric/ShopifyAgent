import assert from "node:assert/strict";
import test from "node:test";
import { connectShopifyInstallationFromBrowser } from "../app/shopify-connect-client";

test("connects the Shopify installation through the browser API route", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      init,
    });

    return Response.json({
      connected: true,
      shopDomain: "merchant-shop.myshopify.com",
      status: "active",
    });
  };

  const result = await connectShopifyInstallationFromBrowser(fetchImpl);

  assert.deepEqual(requests, [
    {
      url: "/api/shopify/connect",
      init: {
        method: "POST",
      },
    },
  ]);
  assert.deepEqual(result, {
    connected: true,
    shopDomain: "merchant-shop.myshopify.com",
    status: "active",
  });
});

test("surfaces the Shopify connection API error", async () => {
  const fetchImpl: typeof fetch = async () =>
    Response.json(
      {
        error: "A Shopify session token is required.",
      },
      {
        status: 401,
      },
    );

  await assert.rejects(
    connectShopifyInstallationFromBrowser(fetchImpl),
    /A Shopify session token is required/,
  );
});
