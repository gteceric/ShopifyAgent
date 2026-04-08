import { checkRefundEligibility } from "../tools/check-refund-eligibility.js";
import type { CheckRefundEligibilityDeps } from "../tools/check-refund-eligibility.js";
import {
  isRecord,
  makeErrorResponse,
  makeSuccessResponse,
} from "./json-rpc.js";
import { makeMcpToolErrorResult, makeMcpToolResult } from "./tool-results.js";
import type {
  JsonRpcErrorResponse,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./json-rpc.js";
import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "../policy/refund-policy.types.js";

export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const CHECK_REFUND_ELIGIBILITY_TOOL_NAME = "check_refund_eligibility";

const CHECK_REFUND_ELIGIBILITY_TOOL = {
  name: CHECK_REFUND_ELIGIBILITY_TOOL_NAME,
  title: "Check Refund Eligibility",
  description:
    "Load Shopify order context and evaluate the merchant's refund policy for a single order.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      orderId: {
        type: "string",
        description: "The Shopify order GID to evaluate.",
      },
    },
    required: ["orderId"],
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      orderId: {
        type: "string",
      },
      decision: {
        type: "string",
        enum: Object.values(RefundDecision),
      },
      reasons: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            code: {
              type: "string",
              enum: Object.values(RefundReasonCode),
            },
            message: {
              type: "string",
            },
          },
          required: ["code", "message"],
        },
      },
      evidence: {
        type: "object",
        additionalProperties: false,
        properties: {
          orderAgeDays: {
            type: "number",
          },
          refundWindowDays: {
            type: "number",
          },
          cancelWindowDays: {
            type: "number",
          },
          orderTotalAmount: {
            type: "number",
          },
          highValueOrderThreshold: {
            type: "number",
          },
          financialStatus: {
            type: "string",
            enum: Object.values(FinancialStatus),
          },
          fulfillmentStatus: {
            type: "string",
            enum: Object.values(FulfillmentStatus),
          },
          hasReturnableFulfillments: {
            type: "boolean",
          },
          alreadyFullyRefunded: {
            type: "boolean",
          },
          allItemsFinalSale: {
            type: "boolean",
          },
          flags: {
            type: "object",
            additionalProperties: false,
            properties: {
              fraudHold: {
                type: "boolean",
              },
              manualReview: {
                type: "boolean",
              },
              vipOverride: {
                type: "boolean",
              },
            },
            required: ["fraudHold", "manualReview", "vipOverride"],
          },
        },
        required: [
          "orderAgeDays",
          "refundWindowDays",
          "cancelWindowDays",
          "orderTotalAmount",
          "financialStatus",
          "fulfillmentStatus",
          "hasReturnableFulfillments",
          "alreadyFullyRefunded",
          "allItemsFinalSale",
          "flags",
        ],
      },
    },
    required: ["orderId", "decision", "reasons", "evidence"],
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
} as const;

interface CheckRefundEligibilityToolCall {
  name: string;
  arguments: {
    orderId: string;
  };
}

function validateInitializeParams(params: unknown): { protocolVersion: string } {
  if (!isRecord(params) || typeof params.protocolVersion !== "string") {
    throw makeErrorResponse(
      -32602,
      "initialize requires a protocolVersion string.",
    );
  }

  if (params.protocolVersion !== MCP_PROTOCOL_VERSION) {
    throw makeErrorResponse(
      -32602,
      "Unsupported protocol version",
      undefined,
      {
        supported: [MCP_PROTOCOL_VERSION],
        requested: params.protocolVersion,
      },
    );
  }

  return {
    protocolVersion: params.protocolVersion,
  };
}

function validateCallToolParams(
  params: unknown,
): CheckRefundEligibilityToolCall {
  if (!isRecord(params) || typeof params.name !== "string") {
    throw makeErrorResponse(
      -32602,
      "tools/call requires a tool name and arguments object.",
    );
  }

  if (params.name !== CHECK_REFUND_ELIGIBILITY_TOOL_NAME) {
    throw makeErrorResponse(-32601, `Unknown tool: ${params.name}`);
  }

  if (!isRecord(params.arguments) || typeof params.arguments.orderId !== "string") {
    throw makeErrorResponse(
      -32602,
      "check_refund_eligibility requires an orderId string.",
    );
  }

  return {
    name: params.name,
    arguments: {
      orderId: params.arguments.orderId,
    },
  };
}

export class RefundMcpServer {
  private initialized = false;

  constructor(private readonly deps: CheckRefundEligibilityDeps = {}) {}

  async handleMessage(message: unknown): Promise<JsonRpcResponse | null> {
    if (!isRecord(message) || message.jsonrpc !== "2.0") {
      return makeErrorResponse(-32600, "Invalid JSON-RPC message.");
    }

    if (typeof message.method !== "string") {
      return null;
    }

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: message.method,
      ...(typeof message.id === "string" || typeof message.id === "number"
        ? { id: message.id }
        : {}),
      ...("params" in message ? { params: message.params } : {}),
    };

    try {
      switch (request.method) {
        case "initialize": {
          if (request.id === undefined) {
            return makeErrorResponse(-32600, "initialize must be a request.");
          }

          const { protocolVersion } = validateInitializeParams(request.params);

          return makeSuccessResponse(request.id, {
            protocolVersion,
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "shopify-agent-refund-policy",
              version: "0.1.0",
            },
            instructions:
              "Use check_refund_eligibility to retrieve the structured refund-policy decision for a Shopify order.",
          });
        }
        case "notifications/initialized":
          this.initialized = true;
          return null;
        case "ping":
          if (request.id === undefined) {
            return null;
          }

          return makeSuccessResponse(request.id, {});
        case "tools/list":
          if (request.id === undefined) {
            return makeErrorResponse(-32600, "tools/list must be a request.");
          }

          return makeSuccessResponse(request.id, {
            tools: [CHECK_REFUND_ELIGIBILITY_TOOL],
          });
        case "tools/call":
          if (request.id === undefined) {
            return makeErrorResponse(-32600, "tools/call must be a request.");
          }

          return await this.handleToolCall(request.id, request.params);
        default:
          if (request.id === undefined) {
            return null;
          }

          return makeErrorResponse(
            -32601,
            `Method not found: ${request.method}`,
            request.id,
          );
      }
    } catch (error) {
      if (
        isRecord(error) &&
        error.jsonrpc === "2.0" &&
        isRecord(error.error) &&
        typeof error.error.code === "number" &&
        typeof error.error.message === "string"
      ) {
        return {
          ...error,
          ...(request.id === undefined || "id" in error ? {} : { id: request.id }),
        } as JsonRpcErrorResponse;
      }

      return makeErrorResponse(
        -32603,
        "Internal server error.",
        request.id,
        error instanceof Error ? error.message : error,
      );
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private async handleToolCall(
    id: JsonRpcId,
    params: unknown,
  ): Promise<JsonRpcResponse> {
    const toolCall = validateCallToolParams(params);

    try {
      const result = await checkRefundEligibility(toolCall.arguments, this.deps);

      return makeSuccessResponse(id, makeMcpToolResult(result));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Refund eligibility check failed.";

      return makeSuccessResponse(id, makeMcpToolErrorResult(message));
    }
  }
}

export function createRefundMcpServer(
  deps: CheckRefundEligibilityDeps = {},
): RefundMcpServer {
  return new RefundMcpServer(deps);
}
