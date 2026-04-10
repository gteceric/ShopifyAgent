import type { ZodType } from "zod";

import type { CheckRefundEligibilityDeps } from "../tools/check-refund-eligibility.js";
import {
  makeErrorResponse,
  makeSuccessResponse,
} from "./json-rpc.js";
import type { JsonRpcErrorResponse, JsonRpcResponse } from "./json-rpc.js";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
  MCP_SERVER_INSTRUCTIONS,
} from "./protocol.js";
import {
  InitializeRequestSchema,
  JsonRpcErrorResponseSchema,
  ToolsCallRequestSchema,
} from "./schemas.js";
import type {
  InitializeRequest,
  JsonRpcRequest,
  ToolsCallRequest,
} from "./schemas.js";
import { McpToolRegistry } from "./tool-registry.js";
import {
  CHECK_REFUND_ELIGIBILITY_TOOL_NAME,
  createCheckRefundEligibilityTool,
} from "./tools/check-refund-eligibility-tool.js";
import type { McpTool } from "./tool-types.js";

export { MCP_PROTOCOL_VERSION };
export { CHECK_REFUND_ELIGIBILITY_TOOL_NAME };

function parseRequest<TRequest extends JsonRpcRequest>(
  message: JsonRpcRequest,
  schema: ZodType<TRequest>,
  errorCode: number,
  errorMessage: string,
): TRequest {
  const parsed = schema.safeParse(message);

  if (!parsed.success) {
    throw makeErrorResponse(errorCode, errorMessage);
  }

  return parsed.data;
}

export class McpServer {
  private initialized = false;

  constructor(private readonly registry: McpToolRegistry) {}

  async handleMessage(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    try {
      switch (message.method) {
        case "initialize":
          return this.handleInitialize(message);
        case "notifications/initialized":
          this.initialized = true;
          return null;
        case "ping":
          return this.handlePing(message);
        case "tools/list":
          return this.handleToolsList(message);
        case "tools/call":
          return this.handleToolCall(message);
        default:
          if (message.id === undefined) {
            return null;
          }

          return makeErrorResponse(
            -32601,
            `Method not found: ${message.method}`,
            message.id,
          );
      }
    } catch (error) {
      const parsedError = JsonRpcErrorResponseSchema.safeParse(error);

      if (parsedError.success) {
        return {
          ...(message.id === undefined || parsedError.data.id !== undefined
            ? parsedError.data
            : { ...parsedError.data, id: message.id }),
        } as JsonRpcErrorResponse;
      }

      return makeErrorResponse(
        -32603,
        "Internal server error.",
        message.id,
        error instanceof Error ? error.message : error,
      );
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private handleInitialize(
    message: JsonRpcRequest,
  ): JsonRpcResponse {
    if (message.id === undefined) {
      return makeErrorResponse(-32600, "initialize must be a request.");
    }

    const request = parseRequest<InitializeRequest>(
      message,
      InitializeRequestSchema,
      -32602,
      "initialize requires a protocolVersion string.",
    );

    if (request.params.protocolVersion !== MCP_PROTOCOL_VERSION) {
      return makeErrorResponse(
        -32602,
        "Unsupported protocol version",
        request.id,
        {
          supported: [MCP_PROTOCOL_VERSION],
          requested: request.params.protocolVersion,
        },
      );
    }

    return makeSuccessResponse(request.id, {
      protocolVersion: request.params.protocolVersion,
      capabilities: {
        tools: {},
      },
      serverInfo: MCP_SERVER_INFO,
      instructions: MCP_SERVER_INSTRUCTIONS,
    });
  }

  private handlePing(message: JsonRpcRequest): JsonRpcResponse | null {
    if (message.id === undefined) {
      return null;
    }

    return makeSuccessResponse(message.id, {});
  }

  private async handleToolCall(
    message: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    if (message.id === undefined) {
      return makeErrorResponse(-32600, "tools/call must be a request.");
    }

    const request = parseRequest<ToolsCallRequest>(
      message,
      ToolsCallRequestSchema,
      -32602,
      "tools/call requires a tool name and arguments object.",
    );
    const tool = this.registry.get(request.params.name);

    if (!tool) {
      return makeErrorResponse(-32601, `Unknown tool: ${request.params.name}`, request.id);
    }

    const parsedArgs = tool.argsSchema.safeParse(request.params.arguments);

    if (!parsedArgs.success) {
      return makeErrorResponse(
        -32602,
        tool.invalidArgsMessage,
        request.id,
        parsedArgs.error.flatten(),
      );
    }

    return makeSuccessResponse(request.id, await tool.execute(parsedArgs.data));
  }

  private handleToolsList(message: JsonRpcRequest): JsonRpcResponse {
    if (message.id === undefined) {
      return makeErrorResponse(-32600, "tools/list must be a request.");
    }

    return makeSuccessResponse(message.id, {
      tools: this.registry.list(),
    });
  }
}

export function createMcpServer(tools: McpTool[]): McpServer {
  return new McpServer(new McpToolRegistry(tools));
}

export function createShopifyAgentMcpServer(
  deps: CheckRefundEligibilityDeps = {},
): McpServer {
  return createMcpServer([createCheckRefundEligibilityTool(deps)]);
}
