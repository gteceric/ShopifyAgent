import assert from "node:assert/strict";
import test from "node:test";

import {
  checkRefundEligibility,
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
} from "@shopify-agent/core";
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

async function getMixedItemEligibilityResult() {
  return checkRefundEligibility(
    { orderId: "gid://shopify/Order/910000000050" },
    {
      config: {
        refundWindowDays: 30,
        cancelWindowDays: 30,
        alreadyRefundedDecision: RefundDecision.Ineligible,
        categoryWindowOverrides: [
          { category: "apparel", refundWindowDays: 14 },
        ],
      },
      adapter: {
        platform: "test",
        loadRefundContext: async () => ({
          order: {
            id: "gid://shopify/Order/910000000050",
            name: "#3050",
            createdAt: "2026-03-01T00:00:00.000Z",
            ageDays: 20,
            totalAmount: 72,
            financialStatus: FinancialStatus.Paid,
            tags: [],
            flags: {
              fraudHold: false,
              manualReview: false,
              vipOverride: false,
            },
          },
          lineItems: [
            {
              lineItemId: "gid://shopify/LineItem/1",
              title: "Dress",
              returnableQuantity: 1,
              category: "apparel",
              fulfillmentStatus: FulfillmentStatus.Fulfilled,
              hasReturnableFulfillment: true,
              alreadyRefunded: false,
              finalSale: false,
            },
            {
              lineItemId: "gid://shopify/LineItem/2",
              title: "Phone Case",
              returnableQuantity: 1,
              category: "accessories",
              fulfillmentStatus: FulfillmentStatus.Fulfilled,
              hasReturnableFulfillment: true,
              alreadyRefunded: false,
              finalSale: false,
            },
          ],
        }),
      },
    },
  );
}

test("formats an eligible answer with a direct opening and next step", async () => {
  const result = await getEligibilityResult(RefundScenarioId.EligibleStandard);
  const response = formatMerchantRefundAgentResponse(
    "Can I refund order #3001?",
    result,
  );

  assert.match(response, /^Yes\./);
  assert.match(response, /within the 30-day refund window/i);
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

test("formats mixed item eligibility with item-level decisions", async () => {
  const result = await getMixedItemEligibilityResult();
  const response = formatMerchantRefundAgentResponse(
    "Can we refund the eligible item on order #3050?",
    result,
  );

  assert.match(response, /^Not automatically\./);
  assert.match(response, /mixed item eligibility/i);
  assert.match(response, /Item-level decisions:/i);
  assert.match(response, /Dress is ineligible/i);
  assert.match(response, /outside the 14-day refund window/i);
  assert.match(response, /Phone Case is eligible/i);
  assert.match(response, /within the 30-day refund window/i);
  assert.match(response, /Next step: route this case to a human reviewer\./i);
});
