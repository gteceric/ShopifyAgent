import test from "node:test";
import assert from "node:assert/strict";

import { checkRefundEligibility } from "../src/tools/check-refund-eligibility.js";
import { REFUND_SCENARIO_MATRIX } from "./fixtures/refund-scenario-matrix.js";

for (const scenario of REFUND_SCENARIO_MATRIX) {
  test(`scenario matrix: ${scenario.id}`, async () => {
    const result = await checkRefundEligibility(scenario.toolInput, {
      config: scenario.config,
      loadContext: async () => scenario.context,
    });

    assert.equal(result.decision, scenario.expectedDecision);

    for (const expectedReasonCode of scenario.expectedReasonCodes) {
      assert.ok(
        result.reasons.some((reason) => reason.code === expectedReasonCode),
        `Expected reason code ${expectedReasonCode} for scenario ${scenario.id}`,
      );
    }
  });
}
