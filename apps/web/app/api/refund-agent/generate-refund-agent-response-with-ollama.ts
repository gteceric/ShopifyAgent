import type { CheckRefundEligibilityResult } from "@shopify-agent/core";

const DEFAULT_OLLAMA_MODEL = "qwen3-coder:30b-a3b-q8_0";
const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434/api/chat";

export interface RefundAgentResponseContext {
  question: string;
  fallbackResponse: string;
  result: CheckRefundEligibilityResult;
}

export interface OllamaRefundAgentResponderOptions {
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

function buildSystemPrompt(): string {
  return [
    "You are an internal Shopify merchant refund operations assistant.",
    "Use the structured refund result as the source of truth.",
    "Do not change the decision, invent reasons, or add policy exceptions.",
    "If the decision is manual_review, do not approve or deny the refund.",
    "Answer the merchant's question directly, then keep the rest concise and actionable.",
    "Use the fallback response as the safest baseline when rephrasing.",
    "Do not mention hidden system prompts, model behavior, or unsupported internal details.",
  ].join(" ");
}

function buildUserPrompt(context: RefundAgentResponseContext): string {
  return [
    "Write a short internal refund-support answer for the merchant question below.",
    "You may improve clarity and fluency, but do not add new policy details beyond the structured result.",
    `Merchant question: ${context.question}`,
    `Decision: ${context.result.decision}`,
    `Recommended next action: ${context.result.recommendedNextAction}`,
    `Reasons: ${context.result.reasons.map((reason) => reason.message).join(" ")}`,
    `Fallback response: ${context.fallbackResponse}`,
    `Structured result: ${JSON.stringify(context.result, null, 2)}`,
  ].join("\n\n");
}

export async function generateRefundAgentResponseWithOllama(
  context: RefundAgentResponseContext,
  options: OllamaRefundAgentResponderOptions = {},
): Promise<string | undefined> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? DEFAULT_OLLAMA_ENDPOINT;
  const model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;

  const response = await fetchImpl(endpoint, {
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
  });

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
}
