import { generateRefundAgentResponseWithOpenAI } from "./generate-refund-agent-response-with-openai";
import { generateRefundAgentResponseWithOllama } from "./generate-refund-agent-response-with-ollama";
import type { RefundAgentResponseContext } from "./refund-agent-response-context";
import type { RefundAgentProvider } from "../../refund-agent-contract";

export type RefundAgentResponseGenerator = (
  context: RefundAgentResponseContext,
) => Promise<string | undefined>;

export interface RefundAgentResponder {
  provider: Exclude<RefundAgentProvider, "fallback">;
  generateResponse: RefundAgentResponseGenerator;
}

export function createRefundAgentResponder(
  fetchImpl: typeof fetch,
):
  | RefundAgentResponder
  | undefined {
  // Precedence:
  // 1. RESPONSE_MODEL_PROVIDER=none -> deterministic fallback only
  // 2. RESPONSE_MODEL_PROVIDER=ollama -> force Ollama
  // 3. RESPONSE_MODEL_PROVIDER=openai -> force OpenAI
  // 4. implicit Ollama when OLLAMA_MODEL or OLLAMA_ENDPOINT is set
  // 5. otherwise default to OpenAI
  if (process.env.RESPONSE_MODEL_PROVIDER === "none") {
    return undefined;
  }

  if (process.env.RESPONSE_MODEL_PROVIDER === "ollama") {
    return {
      provider: "ollama",
      generateResponse: (context) =>
        generateRefundAgentResponseWithOllama(context, { fetchImpl }),
    };
  }

  if (process.env.RESPONSE_MODEL_PROVIDER === "openai") {
    return {
      provider: "openai",
      generateResponse: (context) =>
        generateRefundAgentResponseWithOpenAI(context, { fetchImpl }),
    };
  }

  if (process.env.OLLAMA_MODEL || process.env.OLLAMA_ENDPOINT) {
    return {
      provider: "ollama",
      generateResponse: (context) =>
        generateRefundAgentResponseWithOllama(context, { fetchImpl }),
    };
  }

  return {
    provider: "openai",
    generateResponse: (context) =>
      generateRefundAgentResponseWithOpenAI(context, { fetchImpl }),
  };
}
