import {
  createRefundContextAdapter,
  createPolicyConfig,
} from "@shopify-agent/core";
import { createOllamaRefundResponder } from "./tools/generate-refund-response-with-ollama.js";
import { createOpenAIRefundResponder } from "./tools/generate-refund-response-with-openai.js";
import { getRefundResponse } from "./tools/get-refund-response.js";

const DEFAULT_DEMO_ORDER_ID = "gid://shopify/Order/1001";

function createResponder() {
  if (process.env.RESPONSE_MODEL_PROVIDER === "none") {
    return undefined;
  }

  if (process.env.RESPONSE_MODEL_PROVIDER === "ollama") {
    return createOllamaRefundResponder();
  }

  if (process.env.RESPONSE_MODEL_PROVIDER === "openai") {
    return createOpenAIRefundResponder();
  }

  if (process.env.OLLAMA_MODEL || process.env.OLLAMA_ENDPOINT) {
    return createOllamaRefundResponder();
  }

  return createOpenAIRefundResponder();
}

function getOrderId(): string {
  if (process.env.USE_REAL_SHOPIFY === "true") {
    const realOrderId = process.env.REFUND_DEMO_ORDER_ID?.trim();

    if (!realOrderId) {
      throw new Error(
        "USE_REAL_SHOPIFY=true requires REFUND_DEMO_ORDER_ID to be set to a real Shopify order GID.",
      );
    }

    return realOrderId;
  }

  return process.env.REFUND_DEMO_ORDER_ID?.trim() || DEFAULT_DEMO_ORDER_ID;
}

async function main(): Promise<void> {
  const response = await getRefundResponse(
    getOrderId(),
    "Can I refund this order?",
    {
      adapter: createRefundContextAdapter(),
      config: createPolicyConfig(),
      responder: createResponder(),
    },
  );

  console.log("Node.js refund-policy scaffold is ready.");
  console.log(JSON.stringify(response.result, null, 2));
  console.log(
    response.usedFallback
      ? "Using deterministic fallback response."
      : "Using model-backed response.",
  );
  console.log(response.response);
}

main().catch((error: unknown) => {
  console.error("Failed to run refund eligibility demo.");
  console.error(error);
  process.exitCode = 1;
});
