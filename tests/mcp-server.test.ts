import test from "node:test";
import assert from "node:assert/strict";

import {
  RefundDecision,
  RefundReasonCode,
} from "../src/policy/refund-policy.types.js";
import {
  createShopifyAgentMcpServer,
  MCP_PROTOCOL_VERSION,
} from "../src/mcp/server.js";
import type { RefundPolicyInput } from "../src/policy/refund-policy.types.js";
import { JsonRpcRequest } from "../src/mcp/json-rpc.js";
import { InitializeRequest } from "../src/mcp/schemas.js";

function makeContext(
  overrides: Partial<RefundPolicyInput> = {},
): RefundPolicyInput {
  return {
    orderId: "gid://shopify/Order/test",
    orderName: "#2001",
    orderCreatedAt: "2026-03-01T00:00:00.000Z",
    orderAgeDays: 5,
    orderTotalAmount: 48,
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    hasReturnableFulfillments: true,
    alreadyFullyRefunded: false,
    allItemsFinalSale: false,
    flags: {},
    ...overrides,
  };
}

test("initialize advertises tool capabilities", async () => {
  const server = createShopifyAgentMcpServer();
  const message: InitializeRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
  };
  const response = await server.handleMessage(message);

  assert.ok(response);
  assert.equal("result" in response, true);
  assert.equal(response.id, 1);

  if (!("result" in response)) {
    return;
  }

  const result = response.result as Record<string, unknown>;
  assert.deepEqual(result.serverInfo, {
    name: "shopify-agent-refund-policy",
    version: "0.1.0",
  });

  assert.equal(result.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.deepEqual(result.capabilities, { tools: {} });
});

test("tools/list returns the refund eligibility tool definition", async () => {
  const server = createShopifyAgentMcpServer();
  const message: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  };
  const response = await server.handleMessage(message);

  assert.ok(response);
  assert.equal("result" in response, true);

  if (!response || !("result" in response)) {
    return;
  }

  assert.equal(Array.isArray(response.result.tools), true);

  const tools = response.result.tools as Array<Record<string, unknown>>;
  assert.equal(tools[0]?.name, "check_refund_eligibility");
});

test("tools/call returns structured refund eligibility output", async () => {
  const server = createShopifyAgentMcpServer({
    config: {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      highValueOrderThreshold: 500,
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
    loadContext: async (input) =>
      makeContext({
        orderId: input.orderId,
        orderTotalAmount: 750,
      }),
  });

  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "check_refund_eligibility",
      arguments: {
        orderId: "gid://shopify/Order/high-value",
      },
    },
  });

  assert.ok(response);
  assert.equal("result" in response, true);

  if (!response || !("result" in response)) {
    return;
  }

  assert.equal(response.result.isError, false);

  const structuredContent = response.result.structuredContent as Record<
    string,
    unknown
  >;

  assert.equal(structuredContent.orderId, "gid://shopify/Order/high-value");
  assert.equal(structuredContent.decision, RefundDecision.ManualReview);

  const reasons = structuredContent.reasons as Array<Record<string, unknown>>;
  assert.ok(
    reasons.some(
      (reason) => reason.code === RefundReasonCode.HighValueOrderReviewRequired,
    ),
  );
});

test("tools/call returns invalid params for malformed input", async () => {
  const server = createShopifyAgentMcpServer();
  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "check_refund_eligibility",
      arguments: {},
    },
  });

  assert.ok(response);
  assert.equal("error" in response, true);

  if (!response || !("error" in response)) {
    return;
  }

  assert.equal(response.error.code, -32602);
});

test("tools/call returns a tool error result when evaluation fails", async () => {
  const server = createShopifyAgentMcpServer({
    loadContext: async () => {
      throw new Error("Shopify lookup failed");
    },
  });

  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "check_refund_eligibility",
      arguments: {
        orderId: "gid://shopify/Order/missing",
      },
    },
  });

  assert.ok(response);
  assert.equal("result" in response, true);

  if (!response || !("result" in response)) {
    return;
  }

  assert.equal(response.result.isError, true);
});
