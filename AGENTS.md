# MCP Usage

Always use the `shopify-agent` MCP server for refund-related tasks before inspecting the codebase or running shell commands.

For refund eligibility questions:
- First discover available MCP tools from `shopify-agent`.
- Prefer the MCP tool `check_refund_eligibility` when the user asks whether an order can be refunded.
- Use the MCP tool result as the source of truth for the decision, reasons, and evidence.
- Only inspect code or run local commands if the MCP server is unavailable or the MCP tool fails.

# Coding Workflow

Before making code changes, read the relevant sections of
`DESIGN_PRINCIPLES.md` and check the planned implementation against them.

In particular:

- Keep production and test code on the same internal execution path.
- Require dependencies unless their absence is genuine supported production
  behavior.
- Resolve defaults and inject real dependencies at application entrypoints.
- Inject fakes at the same dependency boundaries in tests.
- Avoid adding optional dependencies, fallbacks, or higher-level function
  overrides only to make tests easier.
