import { createOllamaRefundResponder } from "./generate-refund-response-with-ollama.js";
import { createOpenAIRefundResponder } from "./generate-refund-response-with-openai.js";
import { getRefundResponse } from "./get-refund-response.js";
import { REFUND_SCENARIO_MATRIX } from "../../tests/fixtures/refund-scenario-matrix.js";

function selectResponder() {
  if (process.env.RESPONSE_MODEL_PROVIDER === "none") {
    return undefined;
  }

  if (process.env.RESPONSE_MODEL_PROVIDER === "ollama") {
    return createOllamaRefundResponder();
  }

  if (process.env.RESPONSE_MODEL_PROVIDER === "openai") {
    return createOpenAIRefundResponder();
  }

  return undefined;
}

async function main(): Promise<void> {
  const generateResponse = selectResponder();

  const results = await Promise.all(
    REFUND_SCENARIO_MATRIX.map(async (scenario) => {
      const response = await getRefundResponse(
        scenario.toolInput.orderId,
        scenario.agentQuestion,
        {
          config: scenario.config,
          loadContext: async () => scenario.context,
          generateResponse,
        },
      );

      return {
        id: scenario.id,
        description: scenario.description,
        agentQuestion: scenario.agentQuestion,
        expectedDecision: scenario.expectedDecision,
        actualDecision: response.result.decision,
        matchedDecision: response.result.decision === scenario.expectedDecision,
        expectedReasonCodes: scenario.expectedReasonCodes,
        actualReasonCodes: response.result.reasons.map((reason) => reason.code),
        expectedAgentBehavior: scenario.expectedAgentBehavior,
        response: response.response,
        fallbackResponse: response.fallbackResponse,
        usedFallback: response.usedFallback,
        result: response.result,
      };
    }),
  );

  console.log("Refund scenario matrix");
  console.table(
    results.map((result) => ({
      id: result.id,
      expected: result.expectedDecision,
      actual: result.actualDecision,
      matched: result.matchedDecision ? "yes" : "no",
    })),
  );
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error: unknown) => {
  console.error("Failed to run refund scenario matrix.");
  console.error(error);
  process.exitCode = 1;
});
