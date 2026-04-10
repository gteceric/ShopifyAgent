import { z } from "zod";

export const JsonRpcIdSchema = z.union([z.string(), z.number()]);

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcIdSchema.optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

export const JsonRpcErrorResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcIdSchema.optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
});

export const InitializeRequestSchema = JsonRpcRequestSchema.extend({
  id: JsonRpcIdSchema,
  method: z.literal("initialize"),
  params: z.object({
    protocolVersion: z.string(),
    capabilities: z.unknown().optional(),
    clientInfo: z
      .looseObject({
        name: z.string(),
        version: z.string(),
      })
      .optional(),
  }),
});

export const ToolsCallRequestSchema = JsonRpcRequestSchema.extend({
  id: JsonRpcIdSchema,
  method: z.literal("tools/call"),
  params: z.object({
    name: z.string(),
    arguments: z.unknown(),
  }),
});

export type ToolsCallRequest = z.infer<typeof ToolsCallRequestSchema>;
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcErrorResponse = z.infer<typeof JsonRpcErrorResponseSchema>;
export type InitializeRequest = z.infer<typeof InitializeRequestSchema>;
