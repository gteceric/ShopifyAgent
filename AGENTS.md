# MCP Usage

Always use the `shopify-agent` MCP server for refund-related tasks before inspecting the codebase or running shell commands.

For refund eligibility questions:
- First discover available MCP tools from `shopify-agent`.
- Prefer the MCP tool `check_refund_eligibility` when the user asks whether an order can be refunded.
- Use the MCP tool result as the source of truth for the decision, reasons, and evidence.
- Only inspect code or run local commands if the MCP server is unavailable or the MCP tool fails.
