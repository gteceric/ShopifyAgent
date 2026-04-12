export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  MCP_PROTOCOL_VERSION,
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const satisfies readonly string[];

export const MCP_SERVER_INFO = {
  name: "shopify-agent-refund-policy",
  version: "0.1.0",
} as const;

export const MCP_SERVER_INSTRUCTIONS =
  "Use check_refund_eligibility to retrieve the structured refund-policy decision for a Shopify order.";
