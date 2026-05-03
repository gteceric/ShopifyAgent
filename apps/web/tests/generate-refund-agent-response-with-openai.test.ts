import assert from "node:assert/strict";
import test from "node:test";

import { generateRefundAgentResponseWithOpenAI } from "../app/api/refund-agent/generate-refund-agent-response-with-openai.js";
import { makeEligibleRefundAgentResponseContext } from "./refund-agent-response-context-fixture.js";

test("returns undefined when no OpenAI API key is configured", async () => {
  const response = await generateRefundAgentResponseWithOpenAI(
    makeEligibleRefundAgentResponseContext(),
    {
      apiKey: "",
    },
  );

  assert.equal(response, undefined);
});

test("returns output_text from the OpenAI Responses API payload", async () => {
  const response = await generateRefundAgentResponseWithOpenAI(
    makeEligibleRefundAgentResponseContext(),
    {
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ output_text: "AI-assisted refund answer." }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    },
  );

  assert.equal(response, "AI-assisted refund answer.");
});

test("throws a timeout error when the OpenAI request is aborted", async () => {
  await assert.rejects(
    () =>
      generateRefundAgentResponseWithOpenAI(
        makeEligibleRefundAgentResponseContext(),
        {
          apiKey: "test-key",
          timeoutMs: 10,
          fetchImpl: (_input, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(new DOMException("Request aborted", "AbortError"));
              });
            }),
        },
      ),
    /OpenAI responder timed out after 10ms/,
  );
});
