import assert from "node:assert/strict";
import test from "node:test";

import { checkRefundEligibility } from "@shopify-agent/core";
import * as refundAgentResponseModule from "../app/refund-agent-response.js";
import {
  REFUND_SCENARIO_MATRIX,
  RefundScenarioId,
  type RefundScenario,
} from "../../../tests/fixtures/refund-scenario-matrix.js";

const { formatMerchantRefundAgentResponse } = refundAgentResponseModule;

function getScenario(id: RefundScenarioId): RefundScenario {
  const scenario = REFUND_SCENARIO_MATRIX.find(
    (candidate) => candidate.id === id,
  );

  assert.ok(scenario, `Expected refund scenario ${id} to exist.`);
  return scenario;
}

async function getEligibilityResult(id: RefundScenarioId) {
  const scenario = getScenario(id);

  return checkRefundEligibility(scenario.toolInput, {
    config: scenario.config,
    adapter: {
      platform: "test",
      loadRefundContext: async () => scenario.context,
    },
  });
}

test("formats an eligible answer with a direct opening and next step", async () => {
  const result = await getEligibilityResult(RefundScenarioId.EligibleStandard);
  const response = formatMerchantRefundAgentResponse(
    "Can I refund order #3001?",
    result,
  );

  assert.match(response, /^Yes\./);
  assert.match(response, /within the 30-day refund window/i);
  assert.match(response, /returnable fulfillments available/i);
  assert.match(response, /Next step: approve the refund flow\./i);
});

test("omits the direct opening when the merchant prompt is not phrased as a question", async () => {
  const result = await getEligibilityResult(
    RefundScenarioId.ManualReviewFraudHold,
  );
  const response = formatMerchantRefundAgentResponse(
    "Review this order for refund handling",
    result,
  );

  assert.doesNotMatch(response, /^Not automatically\./);
  assert.match(response, /flagged for manual review/i);
  assert.match(response, /Next step: route this case to a human reviewer\./i);
});
