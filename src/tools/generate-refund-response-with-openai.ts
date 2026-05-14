import type {
  RefundAgentResponseContext,
  RefundResponseResponder,
} from "./get-refund-response.js";

const DEFAULT_OPENAI_MODEL = "gpt-5.2";
const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

export interface OpenAIRefundResponderOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

function buildSystemPrompt(): string {
  return [
    "You are a Shopify refund support assistant.",
    "Use the structured refund tool result as the source of truth.",
    "Do not change the decision, invent reasons, or make policy exceptions.",
    "If the decision is manual_review, do not approve or deny the refund.",
    "If itemEvaluations contain different decisions, explain the item-level split instead of summarizing only the order-level manual review.",
    "Do not mention fraud, risk scoring, or internal review triggers unless that exact wording appears in the tool reasons.",
    "For manual_review decisions, say that human review is required; when mixed item decisions are present, include the item-level split.",
    "For override or exception cases, stay close to the fallback response and avoid adding stronger promises or internal-only policy details.",
    "Keep the reply concise, clear, and customer-safe.",
  ].join(" ");
}

function buildUserPrompt(context: RefundAgentResponseContext): string {
  return [
    "Write a short support reply for the following refund question.",
    "Use the fallback response as the safest baseline. You may improve fluency, but do not add new policy details.",
    `Question: ${context.agentQuestion}`,
    `Tool decision: ${context.result.decision}`,
    `Tool reasons: ${context.result.reasons.map((reason) => reason.message).join(" ")}`,
    `Fallback response: ${context.fallbackResponse}`,
    `Structured tool result: ${JSON.stringify(context.result, null, 2)}`,
  ].join("\n\n");
}

export async function generateRefundResponseWithOpenAI(
  context: RefundAgentResponseContext,
  options: OpenAIRefundResponderOptions = {},
): Promise<string | undefined> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return undefined;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? DEFAULT_OPENAI_ENDPOINT;
  const model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_output_tokens: 200,
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
}

export function createOpenAIRefundResponder(
  options: OpenAIRefundResponderOptions = {},
): RefundResponseResponder {
  return {
    async generateResponse(context: RefundAgentResponseContext) {
      return generateRefundResponseWithOpenAI(context, options);
    },
  };
}
