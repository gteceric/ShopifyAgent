import type {
  CheckRefundEligibilityInput,
  RefundPolicyConfig,
  RefundPolicyEvidence,
  RefundPolicyInput,
} from "@shopify-agent/core";
import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "@shopify-agent/core";

export const RefundScenarioId = {
  EligibleStandard: "eligible_standard",
  EligibleUnfulfilledCancelable: "eligible_unfulfilled_cancelable",
  EligibleUnfulfilledFinalSaleByConfig:
    "eligible_unfulfilled_final_sale_by_config",
  IneligibleOutsideWindow: "ineligible_outside_window",
  IneligibleFinalSale: "ineligible_final_sale",
  ManualReviewFraudHold: "manual_review_fraud_hold",
  ManualReviewHighValueOrderByConfig:
    "manual_review_high_value_order_by_config",
  ManualReviewPendingFinancialStatus:
    "manual_review_pending_financial_status",
  ManualReviewPartialFulfillment: "manual_review_partial_fulfillment",
  ManualReviewPartialRefund: "manual_review_partial_refund",
  ManualReviewUnfulfilledFinalSaleByConfig:
    "manual_review_unfulfilled_final_sale_by_config",
  ManualReviewUnfulfilledOutsideWindow:
    "manual_review_unfulfilled_outside_window",
  IneligibleAlreadyRefunded: "ineligible_already_refunded",
  ManualReviewAlreadyRefundedByConfig:
    "manual_review_already_refunded_by_config",
  IneligibleReturnableFulfillmentsUnavailable:
    "ineligible_returnable_fulfillments_unavailable",
  ManualReviewManualReviewFlag: "manual_review_manual_review_flag",
  IneligibleCategoryWindowOverride:
    "ineligible_category_window_override",
  EligibleVipOverride: "eligible_vip_override",
} as const;

export type RefundScenarioId =
  (typeof RefundScenarioId)[keyof typeof RefundScenarioId];

// Each scenario describes one merchant-facing refund situation. The test runner
// feeds `context` through the refund workflow and compares the result with the
// expected decision, reasons, and selected audit evidence.
export interface RefundScenario {
  id: RefundScenarioId;
  description: string;
  agentQuestion: string;
  toolInput: CheckRefundEligibilityInput;
  context: RefundPolicyInput;
  config?: RefundPolicyConfig;
  expectedDecision: RefundDecision;
  expectedReasonCodes: RefundReasonCode[];
  expectedEvidence?: Partial<RefundPolicyEvidence>;
  expectedAgentBehavior: string;
}

// Start each scenario from a normal refundable order, then override only the
// facts that make that scenario interesting.
function makeContext(
  orderId: string,
  orderName: string,
  overrides: Partial<RefundPolicyInput> = {},
): RefundPolicyInput {
  return {
    orderId,
    orderName,
    orderCreatedAt: "2026-03-01T00:00:00.000Z",
    orderAgeDays: 7,
    orderTotalAmount: 48,
    financialStatus: FinancialStatus.Paid,
    fulfillmentStatus: FulfillmentStatus.Fulfilled,
    hasReturnableFulfillments: true,
    alreadyFullyRefunded: false,
    allItemsFinalSale: false,
    flags: {},
    ...overrides,
  };
}

// Read this matrix as the refund workflow's business coverage map. The
// `expectedAgentBehavior` text documents product intent for humans; the
// executable assertions live in refund-scenario-matrix.test.ts.
export const REFUND_SCENARIO_MATRIX: RefundScenario[] = [
  {
    id: RefundScenarioId.EligibleStandard,
    description: "Straightforward refundable order inside the refund window.",
    agentQuestion: "Can I refund order #3001?",
    toolInput: { orderId: "gid://shopify/Order/910000000001" },
    context: makeContext("gid://shopify/Order/910000000001", "#3001"),
    expectedDecision: RefundDecision.Eligible,
    expectedReasonCodes: [
      RefundReasonCode.WithinRefundWindow,
      RefundReasonCode.ReturnableFulfillmentsAvailable,
    ],
    expectedAgentBehavior:
      "Confirm the order looks refundable and explain the next refund step clearly.",
  },
  {
    id: RefundScenarioId.EligibleUnfulfilledCancelable,
    description:
      "Paid but unfulfilled order can be canceled before shipment instead of requiring a return flow.",
    agentQuestion: "Can we refund order #3001 before it ships?",
    toolInput: { orderId: "gid://shopify/Order/910000000002" },
    context: makeContext(
      "gid://shopify/Order/910000000002",
      "#3007",
      {
        fulfillmentStatus: FulfillmentStatus.Unfulfilled,
        hasReturnableFulfillments: false,
      },
    ),
    expectedDecision: RefundDecision.Eligible,
    expectedReasonCodes: [
      RefundReasonCode.WithinCancelWindow,
      RefundReasonCode.CancelableBeforeFulfillment,
    ],
    expectedAgentBehavior:
      "Approve the pre-shipment cancellation path and avoid talking about returns as if the order was already delivered.",
  },
  {
    id: RefundScenarioId.EligibleUnfulfilledFinalSaleByConfig,
    description:
      "Merchant policy allows a final-sale order to be canceled before shipment.",
    agentQuestion: "This final-sale order has not shipped yet. Can we still cancel and refund it?",
    toolInput: { orderId: "gid://shopify/Order/910000000003" },
    context: makeContext(
      "gid://shopify/Order/910000000003",
      "#3009",
      {
        fulfillmentStatus: FulfillmentStatus.Unfulfilled,
        hasReturnableFulfillments: false,
        allItemsFinalSale: true,
      },
    ),
    config: {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      finalSaleUnfulfilledDecision: RefundDecision.Eligible,
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
    expectedDecision: RefundDecision.Eligible,
    expectedReasonCodes: [RefundReasonCode.FinalSaleUnfulfilledAllowed],
    expectedAgentBehavior:
      "Approve the cancellation because merchant policy allows final-sale items to be canceled before shipment.",
  },
  {
    id: RefundScenarioId.IneligibleOutsideWindow,
    description: "Order is too old for the default refund policy.",
    agentQuestion:
      "A customer wants a refund for order #3002. Can we approve it?",
    toolInput: { orderId: "gid://shopify/Order/910000000004" },
    context: makeContext(
      "gid://shopify/Order/910000000004",
      "#3002",
      {
        orderAgeDays: 45,
      },
    ),
    expectedDecision: RefundDecision.Ineligible,
    expectedReasonCodes: [RefundReasonCode.OutsideRefundWindow],
    expectedAgentBehavior:
      "Decline confidently, cite the refund window, and avoid promising an exception.",
  },
  {
    id: RefundScenarioId.IneligibleFinalSale,
    description: "Final-sale order that should not be refunded automatically.",
    agentQuestion: "Customer says order #3003 did not fit. Can we refund it?",
    toolInput: { orderId: "gid://shopify/Order/910000000005" },
    context: makeContext("gid://shopify/Order/910000000005", "#3003", {
      allItemsFinalSale: true,
    }),
    expectedDecision: RefundDecision.Ineligible,
    expectedReasonCodes: [RefundReasonCode.FinalSaleUnavailableForRefund],
    expectedAgentBehavior:
      "Explain that the order is final sale and stay consistent with policy wording.",
  },
  {
    id: RefundScenarioId.ManualReviewFraudHold,
    description: "Flagged order that should be routed to a human review queue.",
    agentQuestion: "Can the system handle refund order #3004 automatically?",
    toolInput: { orderId: "gid://shopify/Order/910000000006" },
    context: makeContext("gid://shopify/Order/910000000006", "#3004", {
      flags: { fraudHold: true },
    }),
    expectedDecision: RefundDecision.ManualReview,
    expectedReasonCodes: [RefundReasonCode.ManualReviewRequired],
    expectedAgentBehavior:
      "Do not approve or deny the refund; route it to manual review and say why.",
  },
  {
    id: RefundScenarioId.ManualReviewHighValueOrderByConfig,
    description:
      "High-value order should be reviewed by a human when merchant policy sets a threshold.",
    agentQuestion: "This order is expensive. Can we approve the refund automatically?",
    toolInput: { orderId: "gid://shopify/Order/910000000007" },
    context: makeContext(
      "gid://shopify/Order/910000000007",
      "#3014",
      {
        orderTotalAmount: 750,
      },
    ),
    config: {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      highValueOrderThreshold: 500,
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
    expectedDecision: RefundDecision.ManualReview,
    expectedReasonCodes: [
      RefundReasonCode.HighValueOrderReviewRequired,
    ],
    expectedAgentBehavior:
      "Do not auto-approve the refund; expensive orders should be reviewed by a human first.",
  },
  {
    id: RefundScenarioId.ManualReviewPendingFinancialStatus,
    description:
      "Order with a non-final payment state should be reviewed by a human before any refund decision is made.",
    agentQuestion: "This order is still pending payment. Can we approve the refund automatically?",
    toolInput: { orderId: "gid://shopify/Order/910000000008" },
    context: makeContext(
      "gid://shopify/Order/910000000008",
      "#3013",
      {
        financialStatus: FinancialStatus.Pending,
      },
    ),
    expectedDecision: RefundDecision.ManualReview,
    expectedReasonCodes: [
      RefundReasonCode.FinancialStatusReviewRequired,
    ],
    expectedAgentBehavior:
      "Do not auto-approve the refund; unresolved payment state means a human should review the order first.",
  },
  {
    id: RefundScenarioId.ManualReviewPartialFulfillment,
    description:
      "Partially fulfilled order should be reviewed by a human because fulfillment is mixed.",
    agentQuestion: "This order only shipped partially. Can we approve the refund automatically?",
    toolInput: { orderId: "gid://shopify/Order/910000000009" },
    context: makeContext(
      "gid://shopify/Order/910000000009",
      "#3011",
      {
        fulfillmentStatus: FulfillmentStatus.Partial,
      },
    ),
    expectedDecision: RefundDecision.ManualReview,
    expectedReasonCodes: [
      RefundReasonCode.PartialFulfillmentReviewRequired,
    ],
    expectedAgentBehavior:
      "Do not auto-approve the refund; mixed fulfillment means a human should review the order first.",
  },
  {
    id: RefundScenarioId.ManualReviewPartialRefund,
    description:
      "Partially refunded order should be reviewed by a human before any additional refund is approved.",
    agentQuestion: "This order already has a partial refund. Can we approve another refund automatically?",
    toolInput: { orderId: "gid://shopify/Order/910000000010" },
    context: makeContext(
      "gid://shopify/Order/910000000010",
      "#3012",
      {
        financialStatus: FinancialStatus.PartiallyRefunded,
      },
    ),
    expectedDecision: RefundDecision.ManualReview,
    expectedReasonCodes: [
      RefundReasonCode.PartialRefundReviewRequired,
    ],
    expectedAgentBehavior:
      "Do not auto-approve another refund; the order already has refund history and needs human review.",
  },
  {
    id: RefundScenarioId.ManualReviewUnfulfilledFinalSaleByConfig,
    description:
      "Merchant policy requires review for final-sale orders before shipment.",
    agentQuestion: "This final-sale order has not shipped yet. Should we cancel and refund it automatically?",
    toolInput: { orderId: "gid://shopify/Order/910000000011" },
    context: makeContext(
      "gid://shopify/Order/910000000011",
      "#3010",
      {
        fulfillmentStatus: FulfillmentStatus.Unfulfilled,
        hasReturnableFulfillments: false,
        allItemsFinalSale: true,
      },
    ),
    config: {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      finalSaleUnfulfilledDecision: RefundDecision.ManualReview,
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
    expectedDecision: RefundDecision.ManualReview,
    expectedReasonCodes: [
      RefundReasonCode.PreFulfillmentFinalSaleReviewRequired,
    ],
    expectedAgentBehavior:
      "Do not auto-approve the cancellation refund; route the final-sale unfulfilled order to human review.",
  },
  {
    id: RefundScenarioId.ManualReviewUnfulfilledOutsideWindow,
    description:
      "Old unfulfilled order should be reviewed by a human before approving a cancellation refund.",
    agentQuestion: "This order never shipped and is very old. Can we still cancel and refund it?",
    toolInput: { orderId: "gid://shopify/Order/910000000012" },
    context: makeContext(
      "gid://shopify/Order/910000000012",
      "#3008",
      {
        orderAgeDays: 60,
        fulfillmentStatus: FulfillmentStatus.Unfulfilled,
        hasReturnableFulfillments: false,
      },
    ),
    expectedDecision: RefundDecision.ManualReview,
    expectedReasonCodes: [
      RefundReasonCode.PreFulfillmentCancellationReviewRequired,
    ],
    expectedAgentBehavior:
      "Do not auto-approve the cancellation refund; route the stale unfulfilled order to human review.",
  },
  {
    id: RefundScenarioId.IneligibleAlreadyRefunded,
    description:
      "Already fully refunded orders should be denied by default to avoid a duplicate refund.",
    agentQuestion: "Can we refund order #3005 again?",
    toolInput: { orderId: "gid://shopify/Order/910000000018" },
    context: makeContext(
      "gid://shopify/Order/910000000018",
      "#3005",
      {
        alreadyFullyRefunded: true,
        financialStatus: FinancialStatus.Refunded,
      },
    ),
    expectedDecision: RefundDecision.Ineligible,
    expectedReasonCodes: [RefundReasonCode.AlreadyFullyRefunded],
    expectedEvidence: {
      alreadyFullyRefunded: true,
      financialStatus: FinancialStatus.Refunded,
    },
    expectedAgentBehavior:
      "Deny the duplicate refund path and tell the operator not to promise another refund.",
  },
  {
    id: RefundScenarioId.ManualReviewAlreadyRefundedByConfig,
    description:
      "Merchant config prefers manual review instead of hard denial for already refunded orders.",
    agentQuestion: "Order #3005 looks refunded already. What should we do?",
    toolInput: { orderId: "gid://shopify/Order/910000000013" },
    context: makeContext(
      "gid://shopify/Order/910000000013",
      "#3005",
      {
        alreadyFullyRefunded: true,
        financialStatus: FinancialStatus.Refunded,
      },
    ),
    config: {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      alreadyFullyRefundedDecision: RefundDecision.ManualReview,
    },
    expectedDecision: RefundDecision.ManualReview,
    expectedReasonCodes: [RefundReasonCode.AlreadyFullyRefunded],
    expectedAgentBehavior:
      "Treat this as an exception flow and avoid telling the customer a second refund is approved.",
  },
  {
    id: RefundScenarioId.IneligibleReturnableFulfillmentsUnavailable,
    description:
      "Fulfilled order is inside the refund window but has no returnable fulfillments available.",
    agentQuestion: "Can we refund order #3015 through the standard return flow?",
    toolInput: { orderId: "gid://shopify/Order/910000000015" },
    context: makeContext(
      "gid://shopify/Order/910000000015",
      "#3015",
      {
        hasReturnableFulfillments: false,
      },
    ),
    expectedDecision: RefundDecision.Ineligible,
    expectedReasonCodes: [
      RefundReasonCode.ReturnableFulfillmentsUnavailable,
    ],
    expectedEvidence: {
      hasReturnableFulfillments: false,
    },
    expectedAgentBehavior:
      "Deny the standard return-backed refund path because Shopify has no returnable fulfillment available.",
  },
  {
    id: RefundScenarioId.ManualReviewManualReviewFlag,
    description:
      "Explicit manual-review flag should route the order to a human even when the rest of the order looks refundable.",
    agentQuestion: "This order has an operations review flag. Can we refund it automatically?",
    toolInput: { orderId: "gid://shopify/Order/910000000016" },
    context: makeContext(
      "gid://shopify/Order/910000000016",
      "#3016",
      {
        flags: { manualReview: true },
      },
    ),
    expectedDecision: RefundDecision.ManualReview,
    expectedReasonCodes: [RefundReasonCode.ManualReviewRequired],
    expectedEvidence: {
      flags: {
        fraudHold: false,
        manualReview: true,
        vipOverride: false,
      },
    },
    expectedAgentBehavior:
      "Route the order to a human reviewer because an internal review flag is active.",
  },
  {
    id: RefundScenarioId.IneligibleCategoryWindowOverride,
    description:
      "Category-specific policy window can make an otherwise in-window order ineligible.",
    agentQuestion: "Can we refund this apparel order #3017?",
    toolInput: { orderId: "gid://shopify/Order/910000000017" },
    context: makeContext(
      "gid://shopify/Order/910000000017",
      "#3017",
      {
        orderAgeDays: 20,
        itemCategories: ["apparel"],
      },
    ),
    config: {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      categoryWindowOverrides: [
        { category: "apparel", refundWindowDays: 14 },
      ],
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
    expectedDecision: RefundDecision.Ineligible,
    expectedReasonCodes: [RefundReasonCode.OutsideRefundWindow],
    expectedEvidence: {
      effectiveRefundWindowDays: 14,
      itemCategories: ["apparel"],
      matchedCategoryWindowCategories: ["apparel"],
    },
    expectedAgentBehavior:
      "Deny based on the stricter category-specific refund window, not the default policy window.",
  },
  {
    id: RefundScenarioId.EligibleVipOverride,
    description:
      "VIP override allows an otherwise ineligible order to pass automatically.",
    agentQuestion: "Should we make an exception for VIP order #3006?",
    toolInput: { orderId: "gid://shopify/Order/910000000014" },
    context: makeContext("gid://shopify/Order/910000000014", "#3006", {
      orderAgeDays: 60,
      hasReturnableFulfillments: false,
      flags: { vipOverride: true },
    }),
    expectedDecision: RefundDecision.Eligible,
    expectedReasonCodes: [RefundReasonCode.VipOverrideApplied],
    expectedAgentBehavior:
      "Approve confidently and avoid repeating the normal policy blockers that were overridden.",
  },
];
