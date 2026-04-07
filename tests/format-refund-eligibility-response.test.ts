import test from "node:test";
import assert from "node:assert/strict";

import {
  formatRefundEligibilityResponse,
  REFUND_RESPONSE_COPY,
} from "../src/tools/format-refund-eligibility-response.js";
import { checkRefundEligibility } from "../src/tools/check-refund-eligibility.js";
import {
  REFUND_SCENARIO_MATRIX,
  RefundScenarioId,
  type RefundScenario,
} from "./fixtures/refund-scenario-matrix.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getScenario(id: RefundScenarioId): RefundScenario {
  const scenario = REFUND_SCENARIO_MATRIX.find(
    (candidate) => candidate.id === id,
  );

  assert.ok(scenario, `Expected refund scenario ${id} to exist.`);
  return scenario;
}

async function getFormattedResponse(id: RefundScenarioId): Promise<string> {
  const scenario = getScenario(id);
  const result = await checkRefundEligibility(scenario.toolInput, {
    config: scenario.config,
    loadContext: async () => scenario.context,
  });

  return formatRefundEligibilityResponse(scenario.agentQuestion, result);
}

test("formats a standard eligible result as an approval response", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.EligibleStandard,
  );

  assert.match(response, /^Yes\./);
  assert.match(
    response,
    new RegExp(escapeRegExp(REFUND_RESPONSE_COPY.eligibleStandard), "i"),
  );
  assert.match(response, /within the 30-day refund window/i);
  assert.match(response, /returnable fulfillments available/i);
  assert.match(
    response,
    new RegExp(escapeRegExp(REFUND_RESPONSE_COPY.followupStandardRefund), "i"),
  );
});

test("formats an unfulfilled eligible result as a cancellation response", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.EligibleUnfulfilledCancelable,
  );

  assert.match(response, /^Yes\./);
  assert.match(
    response,
    new RegExp(
      escapeRegExp(REFUND_RESPONSE_COPY.eligibleCancelableBeforeShipment),
      "i",
    ),
  );
  assert.match(response, /not been fulfilled yet/i);
  assert.match(
    response,
    new RegExp(
      escapeRegExp(REFUND_RESPONSE_COPY.followupPreFulfillmentCancellation),
      "i",
    ),
  );
});

test("formats an eligible unfulfilled final-sale result as a cancellation response", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.EligibleUnfulfilledFinalSaleByConfig,
  );

  assert.match(response, /^Yes\./);
  assert.match(
    response,
    new RegExp(
      escapeRegExp(
        REFUND_RESPONSE_COPY.eligibleFinalSaleCancelableBeforeShipment,
      ),
      "i",
    ),
  );
  assert.match(
    response,
    /merchant policy allows cancellation before shipment/i,
  );
  assert.match(
    response,
    new RegExp(
      escapeRegExp(REFUND_RESPONSE_COPY.followupPreFulfillmentCancellation),
      "i",
    ),
  );
});

test("formats an ineligible result as a denial response", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.IneligibleOutsideWindow,
  );

  assert.match(response, /^No\./);
  assert.match(
    response,
    new RegExp(escapeRegExp(REFUND_RESPONSE_COPY.ineligibleStandard), "i"),
  );
  assert.match(response, /outside the 30-day refund window/i);
});

test("formats a manual review result without auto-approving it", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.ManualReviewFraudHold,
  );

  assert.match(response, /^Not automatically\./);
  assert.match(response, /routed to manual review/i);
  assert.match(response, /flagged for manual review/i);
  assert.match(response, /human reviewer/i);
});

test("formats a partially fulfilled order as a manual-review response", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.ManualReviewPartialFulfillment,
  );

  assert.match(response, /^Not automatically\./);
  assert.match(
    response,
    new RegExp(
      escapeRegExp(REFUND_RESPONSE_COPY.manualReviewPartialFulfillment),
      "i",
    ),
  );
  assert.match(response, /partially fulfilled/i);
  assert.match(
    response,
    new RegExp(escapeRegExp(REFUND_RESPONSE_COPY.followupReviewStandard), "i"),
  );
});

test("formats a high-value order as a manual-review response", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.ManualReviewHighValueOrderByConfig,
  );

  assert.match(response, /^Not automatically\./);
  assert.match(
    response,
    new RegExp(
      escapeRegExp(REFUND_RESPONSE_COPY.manualReviewHighValueOrder),
      "i",
    ),
  );
  assert.match(
    response,
    /meets or exceeds the 500\.00 high-value review threshold/i,
  );
  assert.match(
    response,
    new RegExp(escapeRegExp(REFUND_RESPONSE_COPY.followupReviewStandard), "i"),
  );
});

test("formats a pending-payment order as a manual-review response", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.ManualReviewPendingFinancialStatus,
  );

  assert.match(response, /^Not automatically\./);
  assert.match(
    response,
    new RegExp(
      escapeRegExp(REFUND_RESPONSE_COPY.manualReviewFinancialStatus),
      "i",
    ),
  );
  assert.match(response, /financial status is pending/i);
  assert.match(
    response,
    new RegExp(escapeRegExp(REFUND_RESPONSE_COPY.followupReviewStandard), "i"),
  );
});

test("formats a partially refunded order as a manual-review response", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.ManualReviewPartialRefund,
  );

  assert.match(response, /^Not automatically\./);
  assert.match(
    response,
    new RegExp(
      escapeRegExp(REFUND_RESPONSE_COPY.manualReviewPartialRefund),
      "i",
    ),
  );
  assert.match(response, /already been partially refunded/i);
  assert.match(
    response,
    new RegExp(escapeRegExp(REFUND_RESPONSE_COPY.followupReviewStandard), "i"),
  );
});

test("formats a stale unfulfilled order as a manual-review cancellation response", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.ManualReviewUnfulfilledOutsideWindow,
  );

  assert.match(response, /^Not automatically\./);
  assert.match(
    response,
    new RegExp(
      escapeRegExp(REFUND_RESPONSE_COPY.manualReviewPreFulfillmentCancellation),
      "i",
    ),
  );
  assert.match(response, /older than the 30-day cancellation window/i);
  assert.match(
    response,
    new RegExp(
      escapeRegExp(
        REFUND_RESPONSE_COPY.followupReviewPreFulfillmentCancellation,
      ),
      "i",
    ),
  );
});

test("formats an unfulfilled final-sale manual-review result with specific wording", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.ManualReviewUnfulfilledFinalSaleByConfig,
  );

  assert.match(response, /^Not automatically\./);
  assert.match(
    response,
    new RegExp(
      escapeRegExp(REFUND_RESPONSE_COPY.manualReviewPreFulfillmentFinalSale),
      "i",
    ),
  );
  assert.match(
    response,
    /requires human review before a cancellation refund is approved/i,
  );
  assert.match(
    response,
    new RegExp(
      escapeRegExp(
        REFUND_RESPONSE_COPY.followupReviewPreFulfillmentCancellation,
      ),
      "i",
    ),
  );
});

test("formats a VIP override result as an exception response", async () => {
  const response = await getFormattedResponse(
    RefundScenarioId.EligibleVipOverride,
  );

  assert.match(response, /^Yes, as an exception\./);
  assert.match(
    response,
    new RegExp(escapeRegExp(REFUND_RESPONSE_COPY.eligibleException), "i"),
  );
  assert.match(response, /vip override allows a refund/i);
  assert.match(
    response,
    new RegExp(escapeRegExp(REFUND_RESPONSE_COPY.followupNoteOverride), "i"),
  );
});
