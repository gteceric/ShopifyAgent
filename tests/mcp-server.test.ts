import {
  FinancialStatus,
  FulfillmentStatus,
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
} from "@shopify-agent/core";
import type {
  RefundContext,
  RefundContextLineItem,
} from "@shopify-agent/core";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createShopifyAgentMcpServer,
  MCP_PROTOCOL_VERSION,
} from "../src/mcp/server.js";
import { JsonRpcRequest } from "../src/mcp/json-rpc.js";
import { InitializeRequest } from "../src/mcp/schemas.js";

type RefundContextOverrides = Partial<
  Omit<RefundContext["order"], "flags">
> & {
  flags?: Partial<RefundContext["order"]["flags"]>;
  lineItems?: RefundContextLineItem[];
  fulfillmentStatus?: FulfillmentStatus;
  hasReturnableFulfillment?: boolean;
  alreadyRefunded?: boolean;
  finalSale?: boolean;
};

function makeContext(overrides: RefundContextOverrides = {}): RefundContext {
  const {
    fulfillmentStatus = FulfillmentStatus.Fulfilled,
    hasReturnableFulfillment = true,
    alreadyRefunded = false,
    finalSale = false,
    lineItems,
    flags = {},
    ...inputOverrides
  } = overrides;
  const order = {
    id: "gid://shopify/Order/900000000200",
    name: "#2001",
    createdAt: "2026-03-01T00:00:00.000Z",
    ageDays: 5,
    totalAmount: 48,
    financialStatus: FinancialStatus.Paid,
    tags: [],
    flags: {
      fraudHold: false,
      manualReview: false,
      vipOverride: false,
      ...flags,
    },
    ...inputOverrides,
  };

  return {
    order,
    lineItems: lineItems ?? [
      {
        lineItemId: `${order.id}/LineItem/1`,
        title: "Default item",
        returnableQuantity: 1,
        fulfillmentStatus,
        hasReturnableFulfillment,
        alreadyRefunded,
        finalSale,
      },
    ],
  };
}

function makeAdapter() {
  return {
    platform: "test",
    loadRefundContext: async (input: { orderId: string }) =>
      makeContext({
        id: input.orderId,
      }),
  };
}

test("initialize advertises tool capabilities", async () => {
  const server = createShopifyAgentMcpServer({
    adapter: makeAdapter(),
  });
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

test("initialize accepts older supported MCP protocol versions", async () => {
  const server = createShopifyAgentMcpServer({
    adapter: makeAdapter(),
  });
  const message: InitializeRequest = {
    jsonrpc: "2.0",
    id: 6,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
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

  if (!response || !("result" in response)) {
    return;
  }

  const result = response.result as Record<string, unknown>;
  assert.equal(result.protocolVersion, "2025-06-18");
});

test("initialize rejects unsupported MCP protocol versions", async () => {
  const server = createShopifyAgentMcpServer({
    adapter: makeAdapter(),
  });
  const message: InitializeRequest = {
    jsonrpc: "2.0",
    id: 7,
    method: "initialize",
    params: {
      protocolVersion: "2099-01-01",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
  };
  const response = await server.handleMessage(message);

  assert.ok(response);
  assert.equal("error" in response, true);

  if (!response || !("error" in response)) {
    return;
  }

  assert.equal(response.error.code, -32602);
});

test("tools/list returns the refund eligibility tool definition", async () => {
  const server = createShopifyAgentMcpServer({
    adapter: makeAdapter(),
  });
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
      alreadyRefundedDecision: RefundDecision.Ineligible,
    },
    adapter: {
      platform: "test",
      loadRefundContext: async (input) =>
        makeContext({
          id: input.orderId,
          totalAmount: 750,
        }),
    },
  });

  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "check_refund_eligibility",
      arguments: {
        orderId: "gid://shopify/Order/900000000201",
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

  assert.equal(structuredContent.orderId, "gid://shopify/Order/900000000201");
  assert.equal(structuredContent.decision, RefundDecision.ManualReview);
  assert.equal(structuredContent.exceptionAvailable, false);
  assert.equal(structuredContent.escalationRequired, true);
  assert.equal(
    structuredContent.recommendedNextAction,
    RecommendedRefundAction.ManualReview,
  );

  const reasons = structuredContent.reasons as Array<Record<string, unknown>>;
  assert.ok(
    reasons.some(
      (reason) => reason.code === RefundReasonCode.HighValueOrderReviewRequired,
    ),
  );
});

test("tools/call returns invalid params for malformed input", async () => {
  const server = createShopifyAgentMcpServer({
    adapter: makeAdapter(),
  });
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

test("tools/call rejects order IDs that are not Shopify order GIDs", async () => {
  const server = createShopifyAgentMcpServer({
    adapter: makeAdapter(),
  });
  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: {
      name: "check_refund_eligibility",
      arguments: {
        orderId: "123",
      },
    },
  });

  assert.ok(response);
  assert.equal("error" in response, true);

  if (!response || !("error" in response)) {
    return;
  }

  assert.equal(response.error.code, -32602);
  assert.equal(
    response.error.message,
    "check_refund_eligibility requires a Shopify order GID like gid://shopify/Order/123.",
  );
});

test("tools/call returns a tool error result when evaluation fails", async () => {
  const server = createShopifyAgentMcpServer({
    adapter: {
      platform: "test",
      loadRefundContext: async () => {
        throw new Error("Shopify lookup failed");
      },
    },
  });

  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "check_refund_eligibility",
      arguments: {
        orderId: "gid://shopify/Order/900000000202",
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
