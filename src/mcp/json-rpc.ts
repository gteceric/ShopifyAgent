import type {
  JsonRpcErrorResponse,
  JsonRpcId,
  JsonRpcRequest,
} from "./schemas.js";

export type { JsonRpcErrorResponse, JsonRpcId, JsonRpcRequest };

// generic type, not able to move to schemas.ts without circular dependency
export interface JsonRpcSuccessResponse<
  T extends object = Record<string, unknown>,
> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: T;
}

export type JsonRpcResponse<T extends object = Record<string, unknown>> =
  | JsonRpcSuccessResponse<T>
  | JsonRpcErrorResponse;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function makeSuccessResponse<T extends object>(
  id: JsonRpcId,
  result: T,
): JsonRpcSuccessResponse<T> {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

export function makeErrorResponse(
  code: number,
  message: string,
  id?: JsonRpcId,
  data?: unknown,
): JsonRpcErrorResponse {
  return {
    jsonrpc: "2.0",
    ...(id === undefined ? {} : { id }),
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}
