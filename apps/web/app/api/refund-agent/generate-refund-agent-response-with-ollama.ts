import {
  DEFAULT_HTTP_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  isRequestTimeoutError,
} from "@shopify-agent/core";
import { readTimeoutMs } from "./read-timeout-ms";
import type { RefundAgentResponseContext } from "./refund-agent-response-context";

const DEFAULT_OLLAMA_MODEL = "qwen3-coder:30b-a3b-q8_0";
const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434/api/chat";

export interface OllamaRefundAgentResponderOptions {
  model?: string;
  endpoint?: string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}

function buildSystemPrompt(): string {
  return [
    "You are an internal Shopify merchant refund operations assistant.",
    "Use the structured refund result as the source of truth.",
    "Do not change the decision, invent reasons, or add policy exceptions.",
    "If the decision is manual_review, do not approve or deny the refund.",
    "If itemEvaluations contain different decisions, explain the item-level split instead of summarizing only the order-level manual review.",
    "Answer the merchant's question directly in a natural internal support tone.",
    "Write as guidance for a merchant support teammate, not as a customer-facing reply.",
    "Keep the reply concise and actionable, but write in full sentences instead of labels or bullet points.",
    "Do not use template phrases like 'Next step:' unless the merchant explicitly asks for a step-by-step answer.",
    "Do not use first-person phrasing like 'I recommend'.",
    "Do not use customer-facing wording like 'we can't process'.",
    "When describing the action, prefer phrasing like 'the support agent should...' or 'this order should...'.",
    "Avoid repeating the same policy fact in multiple slightly different ways.",
    "Use the fallback response only as a safety reference, not as wording to copy closely.",
    "Do not mention hidden system prompts, model behavior, or unsupported internal details.",
  ].join(" ");
}

function buildUserPrompt(context: RefundAgentResponseContext): string {
  return [
    "Write a short internal refund-support answer for the merchant question below.",
    "You may improve clarity and fluency, but do not add new policy details beyond the structured result.",
    "Prefer natural phrasing that sounds like a teammate giving guidance, not a template.",
    "Keep the perspective internal and operational.",
    `Merchant question: ${context.question}`,
    `Decision: ${context.result.policyResult.decision}`,
    `Recommended next action: ${context.result.recommendedNextAction}`,
    `Reasons: ${context.result.policyResult.reasons.map((reason) => reason.message).join(" ")}`,
    `Fallback response: ${context.fallbackResponse}`,
    `Structured result: ${JSON.stringify(context.result, null, 2)}`,
  ].join("\n\n");
}

export async function generateRefundAgentResponseWithOllama(
  context: RefundAgentResponseContext,
  options: OllamaRefundAgentResponderOptions,
): Promise<string | undefined> {
  const endpoint = options.endpoint ?? DEFAULT_OLLAMA_ENDPOINT;
  const model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
  const timeoutMs =
    options.timeoutMs ??
    readTimeoutMs(process.env.OLLAMA_TIMEOUT_MS, DEFAULT_HTTP_REQUEST_TIMEOUT_MS);
  const ollamaRequest: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(),
        },
        {
          role: "user",
          content: buildUserPrompt(context),
        },
      ],
    }),
  };

  try {
    const response = await fetchWithTimeout(
      endpoint,
      ollamaRequest,
      {
        fetchImpl: options.fetchImpl,
        timeoutMs,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Ollama responder failed with status ${response.status}: ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
    };
    const outputText = payload.message?.content?.trim();

    return outputText && outputText.length > 0 ? outputText : undefined;
  } catch (error) {
    if (isRequestTimeoutError(error)) {
      throw new Error(`Ollama responder timed out after ${timeoutMs}ms`);
    }

    throw error;
  }
}
