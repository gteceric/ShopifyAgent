import { normalizePositiveInteger } from "./normalize-value.js";

export const DEFAULT_HTTP_REQUEST_TIMEOUT_MS = 30_000;

export type FetchInput = Parameters<typeof fetch>[0];

export interface FetchWithTimeoutOptions {
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}

export function isRequestTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export function fetchWithTimeout(
  input: FetchInput,
  init: RequestInit = {},
  options: FetchWithTimeoutOptions,
): Promise<Response> {
  const timeoutMs = normalizePositiveInteger(
    options.timeoutMs ?? DEFAULT_HTTP_REQUEST_TIMEOUT_MS,
    "timeoutMs",
  );
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort();
  }, timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;

  return options.fetchImpl(
    input,
    {
      ...init,
      signal,
    },
  ).finally(() => {
    clearTimeout(timeoutId);
  });
}
