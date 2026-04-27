import {
  generateRefundAgentResponseWithOpenAI,
  type RefundAgentResponseContext,
} from "./generate-refund-agent-response-with-openai";
import { generateRefundAgentResponseWithOllama } from "./generate-refund-agent-response-with-ollama";

export type RefundAgentResponder = (
  context: RefundAgentResponseContext,
) => Promise<string | undefined>;

export function selectRefundAgentResponder(): RefundAgentResponder | undefined {
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
    return generateRefundAgentResponseWithOllama;
  }

  if (process.env.RESPONSE_MODEL_PROVIDER === "openai") {
    return generateRefundAgentResponseWithOpenAI;
  }

  if (process.env.OLLAMA_MODEL || process.env.OLLAMA_ENDPOINT) {
    return generateRefundAgentResponseWithOllama;
  }

  return generateRefundAgentResponseWithOpenAI;
}
