import assert from "node:assert/strict";
import test from "node:test";

import * as refundAgentRequestModule from "../app/api/refund-agent/refund-agent-request.js";

const { parseRefundAgentRequest } = refundAgentRequestModule;

test("returns a validation error when orderId is missing", () => {
  const result = parseRefundAgentRequest({
    question: "Can I refund this order?",
  });

  assert.deepEqual(result, {
    ok: false,
    error: { error: "Missing orderId." },
  });
});

test("returns a validation error when question is missing", () => {
  const result = parseRefundAgentRequest({
    orderId: "gid://shopify/Order/123",
  });

  assert.deepEqual(result, {
    ok: false,
    error: { error: "Enter a question for the refund agent." },
  });
});

test("trims validated request fields before returning them", () => {
  const result = parseRefundAgentRequest({
    orderId: "  gid://shopify/Order/123  ",
    question: "  Can I refund this order?  ",
  });

  assert.deepEqual(result, {
    ok: true,
    data: {
      orderId: "gid://shopify/Order/123",
      question: "Can I refund this order?",
    },
  });
});
