import test from "node:test";
import assert from "node:assert/strict";

import {
  makeMcpToolErrorResult,
  makeMcpToolResult,
} from "../src/mcp/tool-results.js";

test("makeMcpToolResult preserves generic structured content", () => {
  const result = makeMcpToolResult({
    customerId: "cust_123",
    status: "eligible",
    reasons: ["within_window"],
  });

  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent, {
    customerId: "cust_123",
    status: "eligible",
    reasons: ["within_window"],
  });
  assert.equal(
    result.content[0]?.text,
    JSON.stringify(result.structuredContent),
  );
});

test("makeMcpToolErrorResult returns an MCP error payload", () => {
  const result = makeMcpToolErrorResult("Something went wrong");

  assert.equal(result.isError, true);
  assert.equal(result.content[0]?.text, "Something went wrong");
});
