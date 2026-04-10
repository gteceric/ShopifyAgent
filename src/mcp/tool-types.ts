import type { z } from "zod";

import type { McpToolErrorResult, McpToolSuccessResult } from "./tool-results.js";

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export type McpToolResult<T extends object = object> =
  | McpToolSuccessResult<T>
  | McpToolErrorResult;

export interface McpTool<TArgs extends object = object, TResult extends object = object> {
  name: string;
  definition: McpToolDefinition;
  invalidArgsMessage: string;
  argsSchema: z.ZodType<TArgs>;
  execute(args: TArgs): Promise<McpToolResult<TResult>>;
}
