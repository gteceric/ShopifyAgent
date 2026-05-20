import test from "node:test";
import assert from "node:assert/strict";

import {
  RefundActionBlockerCode,
  RefundActionValidationStatus,
  validateRefundAction,
} from "../src/application/validate-refund-action.js";
import {
  RecommendedRefundAction,
  type CheckRefundEligibilityResult,
} from "../src/application/check-refund-eligibility.js";
import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "../src/domain/refund-policy.types.js";

const order = {
  id: "gid://shopify/Order/910000000070",
  name: "#3070",
  createdAt: "2026-03-01T00:00:00.000Z",
  ageDays: 10,
  totalAmount: 80,
  financialStatus: FinancialStatus.Paid,
  tags: [],
  flags: {
    fraudHold: false,
    manualReview: false,
    vipOverride: false,
  },
};

function makeEligibilityResult(
  overrides: Partial<CheckRefundEligibilityResult> = {},
): CheckRefundEligibilityResult {
  return {
    orderId: order.id,
    exceptionAvailable: false,
    escalationRequired: false,
    recommendedNextAction: RecommendedRefundAction.Approve,
    policyResult: {
      decision: RefundDecision.Eligible,
      reasons: [
        {
          code: RefundReasonCode.WithinRefundWindow,
          message: "Refund subject is within the 30-day refund window.",
        },
      ],
      evidence: {
        order,
        policyContext: {
          refundWindowDays: 30,
          effectiveRefundWindowDays: 30,
          cancelWindowDays: 30,
          effectiveCancelWindowDays: 30,
          matchedCategoryWindowCategories: [],
        },
        evaluatedOrder: {
          effectiveFinancialStatus: FinancialStatus.Paid,
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasAnyReturnableFulfillment: true,
          allLineItemsRefunded: false,
          allLineItemsFinalSale: false,
          itemCategories: ["apparel"],
        },
      },
      itemEvaluations: [
        {
          decision: RefundDecision.Eligible,
          reasons: [
            {
              code: RefundReasonCode.WithinRefundWindow,
              message: "Refund subject is within the 30-day refund window.",
            },
          ],
          evidence: {
            order,
            policyContext: {
              refundWindowDays: 30,
              effectiveRefundWindowDays: 30,
              cancelWindowDays: 30,
              effectiveCancelWindowDays: 30,
              matchedCategoryWindowCategories: [],
            },
            evaluatedLineItem: {
              lineItemId: "gid://shopify/LineItem/700000000070",
              fulfillmentLineItemId:
                "gid://shopify/FulfillmentLineItem/800000000070",
              title: "Returnable Shirt",
              returnableQuantity: 2,
              ageDays: 10,
              effectiveFinancialStatus: FinancialStatus.Paid,
              fulfillmentStatus: FulfillmentStatus.Fulfilled,
              hasReturnableFulfillment: true,
              lineItemAlreadyRefunded: false,
              finalSale: false,
              category: "apparel",
            },
          },
        },
      ],
    },
    ...overrides,
  };
}

test("validates eligible returnable line items as ready for refund execution", () => {
  const validation = validateRefundAction(
    {
      orderId: order.id,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 1,
        },
      ],
    },
    makeEligibilityResult(),
  );

  assert.equal(validation.status, RefundActionValidationStatus.Ready);
  assert.deepEqual(validation.blockers, []);
  assert.deepEqual(validation.matchedLineItems, [
    {
      lineItemId: "gid://shopify/LineItem/700000000070",
      fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/800000000070",
      title: "Returnable Shirt",
      requestedQuantity: 1,
      returnableQuantity: 2,
      decision: RefundDecision.Eligible,
    },
  ]);
});

test("validates multiple eligible returnable line items as ready for refund execution", () => {
  const eligibilityResult = makeEligibilityResult();
  const firstItemEvaluation = eligibilityResult.policyResult.itemEvaluations[0]!;
  const validation = validateRefundAction(
    {
      orderId: order.id,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 1,
        },
        {
          lineItemId: "gid://shopify/LineItem/700000000071",
          quantity: 2,
        },
      ],
    },
    {
      ...eligibilityResult,
      policyResult: {
        ...eligibilityResult.policyResult,
        itemEvaluations: [
          firstItemEvaluation,
          {
            ...firstItemEvaluation,
            evidence: {
              ...firstItemEvaluation.evidence,
              evaluatedLineItem: {
                ...firstItemEvaluation.evidence.evaluatedLineItem,
                lineItemId: "gid://shopify/LineItem/700000000071",
                fulfillmentLineItemId:
                  "gid://shopify/FulfillmentLineItem/800000000071",
                title: "Returnable Pants",
                returnableQuantity: 3,
              },
            },
          },
        ],
      },
    },
  );

  assert.equal(validation.status, RefundActionValidationStatus.Ready);
  assert.deepEqual(validation.blockers, []);
  assert.deepEqual(validation.matchedLineItems, [
    {
      lineItemId: "gid://shopify/LineItem/700000000070",
      fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/800000000070",
      title: "Returnable Shirt",
      requestedQuantity: 1,
      returnableQuantity: 2,
      decision: RefundDecision.Eligible,
    },
    {
      lineItemId: "gid://shopify/LineItem/700000000071",
      fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/800000000071",
      title: "Returnable Pants",
      requestedQuantity: 2,
      returnableQuantity: 3,
      decision: RefundDecision.Eligible,
    },
  ]);
});

test("requires review before refund execution for manual-review eligibility results", () => {
  const validation = validateRefundAction(
    {
      orderId: order.id,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 1,
        },
      ],
    },
    makeEligibilityResult({
      escalationRequired: true,
      recommendedNextAction: RecommendedRefundAction.ManualReview,
      policyResult: {
        ...makeEligibilityResult().policyResult,
        decision: RefundDecision.ManualReview,
      },
    }),
  );

  assert.equal(validation.status, RefundActionValidationStatus.RequiresReview);
  assert.equal(
    validation.blockers[0]?.code,
    RefundActionBlockerCode.ManualReviewRequired,
  );
});

test("blocks refund execution for order-level ineligible eligibility results", () => {
  const validation = validateRefundAction(
    {
      orderId: order.id,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 1,
        },
      ],
    },
    makeEligibilityResult({
      recommendedNextAction: RecommendedRefundAction.Deny,
      policyResult: {
        ...makeEligibilityResult().policyResult,
        decision: RefundDecision.Ineligible,
      },
    }),
  );

  assert.equal(validation.status, RefundActionValidationStatus.Blocked);
  assert.equal(
    validation.blockers[0]?.code,
    RefundActionBlockerCode.OrderIneligible,
  );
});

test("blocks refund execution when manual review also has invalid quantities", () => {
  const validation = validateRefundAction(
    {
      orderId: order.id,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 0,
        },
      ],
    },
    makeEligibilityResult({
      escalationRequired: true,
      recommendedNextAction: RecommendedRefundAction.ManualReview,
      policyResult: {
        ...makeEligibilityResult().policyResult,
        decision: RefundDecision.ManualReview,
      },
    }),
  );

  assert.equal(validation.status, RefundActionValidationStatus.Blocked);
  assert.deepEqual(
    validation.blockers.map((blocker) => blocker.code),
    [
      RefundActionBlockerCode.ManualReviewRequired,
      RefundActionBlockerCode.QuantityMustBePositiveInteger,
    ],
  );
});

test("blocks refund execution for ineligible line items and invalid quantities", () => {
  const eligibilityResult = makeEligibilityResult();
  const itemEvaluation = eligibilityResult.policyResult.itemEvaluations[0]!;
  const validation = validateRefundAction(
    {
      orderId: order.id,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 3,
        },
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 0,
        },
      ],
    },
    {
      ...eligibilityResult,
      policyResult: {
        ...eligibilityResult.policyResult,
        itemEvaluations: [
          {
            ...itemEvaluation,
            decision: RefundDecision.Ineligible,
          },
        ],
      },
    },
  );

  assert.equal(validation.status, RefundActionValidationStatus.Blocked);
  assert.deepEqual(
    validation.blockers.map((blocker) => blocker.code),
    [
      RefundActionBlockerCode.LineItemNotEligible,
      RefundActionBlockerCode.QuantityExceedsReturnableQuantity,
      RefundActionBlockerCode.DuplicateLineItemRequest,
      RefundActionBlockerCode.QuantityMustBePositiveInteger,
      RefundActionBlockerCode.LineItemNotEligible,
    ],
  );
});

test("blocks refund execution for fractional and negative quantities", () => {
  const validation = validateRefundAction(
    {
      orderId: order.id,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 1.5,
        },
        {
          lineItemId: "gid://shopify/LineItem/700000000071",
          quantity: -1,
        },
      ],
    },
    makeEligibilityResult(),
  );

  assert.equal(validation.status, RefundActionValidationStatus.Blocked);
  assert.deepEqual(
    validation.blockers.map((blocker) => blocker.code),
    [
      RefundActionBlockerCode.QuantityMustBePositiveInteger,
      RefundActionBlockerCode.QuantityMustBePositiveInteger,
      RefundActionBlockerCode.LineItemNotFound,
    ],
  );
  assert.deepEqual(
    validation.blockers.map((blocker) => blocker.requestedQuantity),
    [1.5, -1, undefined],
  );
});

test("blocks refund execution when requested line item is not in the eligibility result", () => {
  const validation = validateRefundAction(
    {
      orderId: order.id,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000999", // request one is not found in makeEligibilityResult
          quantity: 1,
        },
      ],
    },
    makeEligibilityResult(),
  );

  assert.equal(validation.status, RefundActionValidationStatus.Blocked);
  assert.deepEqual(validation.matchedLineItems, []);
  assert.deepEqual(validation.blockers, [
    {
      code: RefundActionBlockerCode.LineItemNotFound,
      message: "Requested line item was not found in the eligibility result.",
      lineItemId: "gid://shopify/LineItem/700000000999",
    },
  ]);
});

test("blocks refund execution when returnable fulfillment is unavailable", () => {
  const eligibilityResult = makeEligibilityResult();
  const itemEvaluation = eligibilityResult.policyResult.itemEvaluations[0]!;
  const validation = validateRefundAction(
    {
      orderId: order.id,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/700000000070",
          quantity: 1,
        },
      ],
    },
    {
      ...eligibilityResult,
      policyResult: {
        ...eligibilityResult.policyResult,
        itemEvaluations: [
          {
            ...itemEvaluation,
            evidence: {
              ...itemEvaluation.evidence,
              evaluatedLineItem: {
                ...itemEvaluation.evidence.evaluatedLineItem,
                fulfillmentLineItemId: undefined,
                hasReturnableFulfillment: false,
              },
            },
          },
        ],
      },
    },
  );

  assert.equal(validation.status, RefundActionValidationStatus.Blocked);
  assert.equal(
    validation.blockers[0]?.code,
    RefundActionBlockerCode.ReturnableFulfillmentUnavailable,
  );
});

test("blocks refund execution when request does not match eligibility result", () => {
  const validation = validateRefundAction(
    {
      orderId: "gid://shopify/Order/910000000071",
      lineItems: [],
    },
    makeEligibilityResult(),
  );

  assert.equal(validation.status, RefundActionValidationStatus.Blocked);
  assert.deepEqual(
    validation.blockers.map((blocker) => blocker.code),
    [
      RefundActionBlockerCode.OrderIdMismatch,
      RefundActionBlockerCode.EmptyLineItemRequest,
    ],
  );
});
