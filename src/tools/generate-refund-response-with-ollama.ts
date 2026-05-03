import type {
  RefundAgentResponseContext,
  RefundResponseResponder,
} from "./get-refund-response.js";

const DEFAULT_OLLAMA_MODEL = "qwen3-coder:30b-a3b-q8_0";
const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434/api/chat";

export interface OllamaRefundResponderOptions {
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
    "Do not mention fraud, risk scoring, or internal review triggers unless that exact wording appears in the tool reasons.",
    "For manual_review decisions, say only that the order requires human review before a decision can be made.",
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

export async function generateRefundResponseWithOllama(
  context: RefundAgentResponseContext,
  options: OllamaRefundResponderOptions = {},
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

export function createOllamaRefundResponder(
  options: OllamaRefundResponderOptions = {},
): RefundResponseResponder {
  return {
    async generateResponse(context: RefundAgentResponseContext) {
      return generateRefundResponseWithOllama(context, options);
    },
  };
}
