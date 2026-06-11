import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HTTP_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  isRequestTimeoutError,
} from "../src/shared/fetch-with-timeout.js";

test("uses a 30-second default HTTP request timeout", () => {
  assert.equal(DEFAULT_HTTP_REQUEST_TIMEOUT_MS, 30_000);
});

test("adds a timeout signal to an HTTP request", async () => {
  let capturedSignal: AbortSignal | null | undefined;

  const response = await fetchWithTimeout(
    "https://example.com",
    {},
    {
      timeoutMs: 100,
      fetchImpl: async (_input, init) => {
        capturedSignal = init?.signal;
        return new Response("ok");
      },
    },
  );

  assert.equal(await response.text(), "ok");
  assert.ok(capturedSignal);
});

test("aborts an HTTP request after its timeout", async () => {
  await assert.rejects(
    fetchWithTimeout(
      "https://example.com",
      {},
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
    (error: unknown) => isRequestTimeoutError(error),
  );
});

test("rejects invalid HTTP request timeout values", () => {
  assert.throws(
    () =>
      fetchWithTimeout("https://example.com", {}, {
        fetchImpl: fetch,
        timeoutMs: 0,
      }),
    /timeoutMs must be a positive integer\./,
  );
});
