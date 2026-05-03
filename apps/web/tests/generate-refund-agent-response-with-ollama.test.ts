import assert from "node:assert/strict";
import test from "node:test";

import { generateRefundAgentResponseWithOllama } from "../app/api/refund-agent/generate-refund-agent-response-with-ollama.js";
import { makeEligibleRefundAgentResponseContext } from "./refund-agent-response-context-fixture.js";

test("returns message content from the Ollama chat payload", async () => {
  const response = await generateRefundAgentResponseWithOllama(
    makeEligibleRefundAgentResponseContext(),
    {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            message: { content: "Ollama-assisted refund answer." },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    },
  );

  assert.equal(response, "Ollama-assisted refund answer.");
});

test("throws a timeout error when the Ollama request is aborted", async () => {
  await assert.rejects(
    () =>
      generateRefundAgentResponseWithOllama(
        makeEligibleRefundAgentResponseContext(),
        {
          timeoutMs: 10,
          fetchImpl: (_input, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(new DOMException("Request aborted", "AbortError"));
              });
            }),
        },
      ),
    /Ollama responder timed out after 10ms/,
  );
});
