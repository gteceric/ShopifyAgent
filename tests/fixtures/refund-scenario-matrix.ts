import type {
  RefundPolicyConfig,
  RefundPolicyInput,
} from "../../src/policy/refund-policy.types.js";
import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "../../src/policy/refund-policy.types.js";
import type { CheckRefundEligibilityInput } from "../../src/tools/check-refund-eligibility.js";

export const RefundScenarioId = {
  EligibleStandard: "eligible_standard",
  EligibleUnfulfilledCancelable: "eligible_unfulfilled_cancelable",
  EligibleUnfulfilledFinalSaleByConfig:
    "eligible_unfulfilled_final_sale_by_config",
  IneligibleOutsideWindow: "ineligible_outside_window",
  IneligibleFinalSale: "ineligible_final_sale",
  ManualReviewFraudHold: "manual_review_fraud_hold",
  ManualReviewUnfulfilledFinalSaleByConfig:
    "manual_review_unfulfilled_final_sale_by_config",
  ManualReviewUnfulfilledOutsideWindow:
    "manual_review_unfulfilled_outside_window",
  ManualReviewAlreadyRefundedByConfig:
    "manual_review_already_refunded_by_config",
  EligibleVipOverride: "eligible_vip_override",
} as const;

export type RefundScenarioId =
  (typeof RefundScenarioId)[keyof typeof RefundScenarioId];

export interface RefundScenario {
  id: RefundScenarioId;
  description: string;
  agentQuestion: string;
  toolInput: CheckRefundEligibilityInput;
  context: RefundPolicyInput;
  config?: RefundPolicyConfig;
  expectedDecision: RefundDecision;
  expectedReasonCodes: RefundReasonCode[];
  expectedAgentBehavior: string;
}

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
    financialStatus: FinancialStatus.Paid,
    fulfillmentStatus: FulfillmentStatus.Fulfilled,
    hasReturnableFulfillments: true,
    alreadyFullyRefunded: false,
    allItemsFinalSale: false,
    flags: {},
    ...overrides,
  };
}

export const REFUND_SCENARIO_MATRIX: RefundScenario[] = [
  {
    id: RefundScenarioId.EligibleStandard,
    description: "Straightforward refundable order inside the refund window.",
    agentQuestion: "Can I refund order #3001?",
    toolInput: { orderId: "gid://shopify/Order/eligible-standard" },
    context: makeContext("gid://shopify/Order/eligible-standard", "#3001"),
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
    toolInput: { orderId: "gid://shopify/Order/eligible-unfulfilled-cancelable" },
    context: makeContext(
      "gid://shopify/Order/eligible-unfulfilled-cancelable",
      "#3007",
      {
        fulfillmentStatus: FulfillmentStatus.Unfulfilled,
        hasReturnableFulfillments: false,
      },
    ),
    expectedDecision: RefundDecision.Eligible,
    expectedReasonCodes: [
      RefundReasonCode.WithinRefundWindow,
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
    toolInput: { orderId: "gid://shopify/Order/eligible-unfulfilled-final-sale" },
    context: makeContext(
      "gid://shopify/Order/eligible-unfulfilled-final-sale",
      "#3009",
      {
        fulfillmentStatus: FulfillmentStatus.Unfulfilled,
        hasReturnableFulfillments: false,
        allItemsFinalSale: true,
      },
    ),
    config: {
      refundWindowDays: 30,
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
    toolInput: { orderId: "gid://shopify/Order/ineligible-outside-window" },
    context: makeContext(
      "gid://shopify/Order/ineligible-outside-window",
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
    toolInput: { orderId: "gid://shopify/Order/ineligible-final-sale" },
    context: makeContext("gid://shopify/Order/ineligible-final-sale", "#3003", {
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
    toolInput: { orderId: "gid://shopify/Order/manual-review-fraud" },
    context: makeContext("gid://shopify/Order/manual-review-fraud", "#3004", {
      flags: { fraudHold: true },
    }),
    expectedDecision: RefundDecision.ManualReview,
    expectedReasonCodes: [RefundReasonCode.ManualReviewRequired],
    expectedAgentBehavior:
      "Do not approve or deny the refund; route it to manual review and say why.",
  },
  {
    id: RefundScenarioId.ManualReviewUnfulfilledFinalSaleByConfig,
    description:
      "Merchant policy requires review for final-sale orders before shipment.",
    agentQuestion: "This final-sale order has not shipped yet. Should we cancel and refund it automatically?",
    toolInput: { orderId: "gid://shopify/Order/manual-review-unfulfilled-final-sale" },
    context: makeContext(
      "gid://shopify/Order/manual-review-unfulfilled-final-sale",
      "#3010",
      {
        fulfillmentStatus: FulfillmentStatus.Unfulfilled,
        hasReturnableFulfillments: false,
        allItemsFinalSale: true,
      },
    ),
    config: {
      refundWindowDays: 30,
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
    toolInput: { orderId: "gid://shopify/Order/manual-review-unfulfilled-old" },
    context: makeContext(
      "gid://shopify/Order/manual-review-unfulfilled-old",
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
    id: RefundScenarioId.ManualReviewAlreadyRefundedByConfig,
    description:
      "Merchant config prefers manual review instead of hard denial for already refunded orders.",
    agentQuestion: "Order #3005 looks refunded already. What should we do?",
    toolInput: { orderId: "gid://shopify/Order/manual-review-refunded" },
    context: makeContext(
      "gid://shopify/Order/manual-review-refunded",
      "#3005",
      {
        alreadyFullyRefunded: true,
        financialStatus: FinancialStatus.Refunded,
      },
    ),
    config: {
      refundWindowDays: 30,
      alreadyFullyRefundedDecision: RefundDecision.ManualReview,
    },
    expectedDecision: RefundDecision.ManualReview,
    expectedReasonCodes: [RefundReasonCode.AlreadyFullyRefunded],
    expectedAgentBehavior:
      "Treat this as an exception flow and avoid telling the customer a second refund is approved.",
  },
  {
    id: RefundScenarioId.EligibleVipOverride,
    description:
      "VIP override allows an otherwise ineligible order to pass automatically.",
    agentQuestion: "Should we make an exception for VIP order #3006?",
    toolInput: { orderId: "gid://shopify/Order/eligible-vip-override" },
    context: makeContext("gid://shopify/Order/eligible-vip-override", "#3006", {
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
