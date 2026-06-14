import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/shopify/connect/route";

test("rejects Shopify connection requests without a bearer session token", async () => {
  const response = await POST(
    new NextRequest("https://refund-agent.example.com/api/shopify/connect", {
      method: "POST",
    }),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "A Shopify session token is required.",
  });
});
