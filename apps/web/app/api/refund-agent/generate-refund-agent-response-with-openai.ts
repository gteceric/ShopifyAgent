import type { CheckRefundEligibilityResult } from "@shopify-agent/core";

const DEFAULT_OPENAI_MODEL = "gpt-5.2";
const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_TIMEOUT_MS = 8000;

export interface RefundAgentResponseContext {
  question: string;
  fallbackResponse: string;
  result: CheckRefundEligibilityResult;
}

export interface OpenAIRefundAgentResponderOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function buildSystemPrompt(): string {
  return [
    "You are an internal Shopify merchant refund operations assistant.",
    "Use the structured refund result as the source of truth.",
    "Do not change the decision, invent reasons, or add policy exceptions.",
    "If the decision is manual_review, do not approve or deny the refund.",
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
    `Decision: ${context.result.decision}`,
    `Recommended next action: ${context.result.recommendedNextAction}`,
    `Reasons: ${context.result.reasons.map((reason) => reason.message).join(" ")}`,
    `Fallback response: ${context.fallbackResponse}`,
    `Structured result: ${JSON.stringify(context.result, null, 2)}`,
  ].join("\n\n");
}

export async function generateRefundAgentResponseWithOpenAI(
  context: RefundAgentResponseContext,
  options: OpenAIRefundAgentResponderOptions = {},
): Promise<string | undefined> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return undefined;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? DEFAULT_OPENAI_ENDPOINT;
  const model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_output_tokens: 220,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: buildSystemPrompt() }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: buildUserPrompt(context) }],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI responder failed with status ${response.status}: ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as { output_text?: string };
    const outputText = payload.output_text?.trim();

    return outputText && outputText.length > 0 ? outputText : undefined;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenAI responder timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
