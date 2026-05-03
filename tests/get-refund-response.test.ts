import { RefundDecision } from "@shopify-agent/core";
import test from "node:test";
import assert from "node:assert/strict";
import { getRefundResponse } from "../src/tools/get-refund-response.js";
import {
  REFUND_SCENARIO_MATRIX,
  RefundScenarioId,
  type RefundScenario,
} from "./fixtures/refund-scenario-matrix.js";

function getScenario(id: RefundScenarioId): RefundScenario {
  const scenario = REFUND_SCENARIO_MATRIX.find(
    (candidate) => candidate.id === id,
  );

  assert.ok(scenario, `Expected refund scenario ${id} to exist.`);
  return scenario;
}

test("uses the deterministic fallback when no responder is provided", async () => {
  const scenario = getScenario(RefundScenarioId.EligibleStandard);
  const response = await getRefundResponse(
    scenario.toolInput.orderId,
    scenario.agentQuestion,
    {
      config: scenario.config,
      adapter: {
        platform: "test",
        loadRefundContext: async () => scenario.context,
      },
      responder: undefined,
    },
  );

  assert.equal(response.usedFallback, true);
  assert.equal(response.response, response.fallbackResponse);
  assert.equal(response.result.decision, RefundDecision.Eligible);
  assert.match(response.response, /standard refund flow/i);
});

test("uses the injected responder output when it succeeds", async () => {
  const scenario = getScenario(RefundScenarioId.ManualReviewFraudHold);
  const response = await getRefundResponse(
    scenario.toolInput.orderId,
    scenario.agentQuestion,
    {
      config: scenario.config,
      adapter: {
        platform: "test",
        loadRefundContext: async () => scenario.context,
      },
      responder: {
        generateResponse: async ({ result, fallbackResponse }) =>
          `Model reply: ${result.decision}. ${fallbackResponse}`,
      },
    },
  );

  assert.equal(response.usedFallback, false);
  assert.match(response.response, /^Model reply: manual_review\./);
  assert.equal(response.result.decision, RefundDecision.ManualReview);
});

test("falls back when the injected responder throws", async () => {
  const scenario = getScenario(RefundScenarioId.IneligibleOutsideWindow);
  const response = await getRefundResponse(
    scenario.toolInput.orderId,
    scenario.agentQuestion,
    {
      config: scenario.config,
      adapter: {
        platform: "test",
        loadRefundContext: async () => scenario.context,
      },
      responder: {
        generateResponse: async () => {
          throw new Error("Responder unavailable");
        },
      },
    },
  );

  assert.equal(response.usedFallback, true);
  assert.equal(response.response, response.fallbackResponse);
  assert.match(response.response, /should not be refunded automatically/i);
});

test("falls back when the injected responder returns an empty response", async () => {
  const scenario = getScenario(RefundScenarioId.EligibleVipOverride);
  const response = await getRefundResponse(
    scenario.toolInput.orderId,
    scenario.agentQuestion,
    {
      config: scenario.config,
      adapter: {
        platform: "test",
        loadRefundContext: async () => scenario.context,
      },
      responder: {
        generateResponse: async () => "   ",
      },
    },
  );

  assert.equal(response.usedFallback, true);
  assert.equal(response.response, response.fallbackResponse);
  assert.match(response.response, /as an exception/i);
});
