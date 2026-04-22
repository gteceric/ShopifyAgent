import {
  FinancialStatus,
  FulfillmentStatus,
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
  type ShopifyOrderSummary,
} from "@shopify-agent/core";
import type {
  CheckRefundEligibilityResult,
  RefundPolicyConfig,
} from "@shopify-agent/core";
import type { DashboardOrder } from "./mock-orders";

export interface DashboardOrderErrorState {
  orderId: string;
  message: string;
}

export const DASHBOARD_DEMO_POLICY: RefundPolicyConfig = {
  refundWindowDays: 30,
  cancelWindowDays: 30,
  highValueOrderThreshold: 500,
  alreadyFullyRefundedDecision: RefundDecision.Ineligible,
  finalSaleUnfulfilledDecision: RefundDecision.Ineligible,
  unfulfilledOutsideWindowDecision: RefundDecision.ManualReview,
};

function formatStatusLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatCreatedAtLabel(createdAt: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(createdAt));
}

function calculateOrderAgeDays(createdAt: string, now: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;

  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(createdAt).getTime()) / msPerDay),
  );
}

function getInitialDecision(
  order: ShopifyOrderSummary,
): DashboardOrder["decision"] {
  if (order.financialStatus === FinancialStatus.Refunded) {
    return "ineligible";
  }

  if (
    order.financialStatus === FinancialStatus.Pending ||
    order.financialStatus === FinancialStatus.PartiallyPaid
  ) {
    return "manual_review";
  }

  if (order.fulfillmentStatus === FulfillmentStatus.Unfulfilled) {
    return "eligible";
  }

  return "manual_review";
}

export function mapOrderSummaryToDashboardOrder(
  order: ShopifyOrderSummary,
  now: Date,
): DashboardOrder {
  const orderAgeDays = calculateOrderAgeDays(order.createdAt, now);

  return {
    id: order.id,
    orderName: order.name,
    customerName: order.customerName,
    createdAtLabel: formatCreatedAtLabel(order.createdAt),
    orderAgeDays,
    orderTotalLabel: formatCurrency(order.totalAmount),
    financialStatus: formatStatusLabel(order.financialStatus),
    fulfillmentStatus: formatStatusLabel(order.fulfillmentStatus),
    decision: getInitialDecision(order),
    reasonSummary: "Live refund posture will be loaded from the policy engine.",
    recommendedNextAction:
      "Open the order to inspect the latest refund guidance.",
    lastUpdatedLabel: "Awaiting live refund check",
    policyWindowLabel:
      order.fulfillmentStatus === FulfillmentStatus.Unfulfilled
        ? "Cancellation and refund policy"
        : "Refund policy",
    reasonDetails: [
      "This row is seeded from the order summary feed.",
      "Selecting the order loads the latest refund eligibility details.",
    ],
    evidence: [
      { label: "Order Age", value: `${orderAgeDays} days` },
      { label: "Order Total", value: formatCurrency(order.totalAmount) },
      {
        label: "Financial Status",
        value: formatStatusLabel(order.financialStatus),
      },
      {
        label: "Fulfillment",
        value: formatStatusLabel(order.fulfillmentStatus),
      },
    ],
    timeline: [
      {
        title: "Order summary loaded",
        detail: "This order came from the current Shopify order feed.",
      },
      {
        title: "Refund check pending",
        detail: "Select the order to run the latest refund policy evaluation.",
      },
    ],
  };
}

function hasReason(
  result: CheckRefundEligibilityResult,
  code: RefundReasonCode,
): boolean {
  return result.reasons.some((reason) => reason.code === code);
}

function formatDecisionSummary(result: CheckRefundEligibilityResult): string {
  if (result.decision === RefundDecision.Eligible) {
    if (result.exceptionAvailable) {
      return "Refund allowed through an active exception path.";
    }

    if (result.evidence.fulfillmentStatus === "unfulfilled") {
      return "Unfulfilled order can be canceled and refunded normally.";
    }

    return "Inside the refund window with no policy blockers.";
  }

  if (result.decision === RefundDecision.Ineligible) {
    if (hasReason(result, RefundReasonCode.AlreadyFullyRefunded)) {
      return "Order has already been fully refunded.";
    }

    if (hasReason(result, RefundReasonCode.FinalSaleUnavailableForRefund)) {
      return "Final-sale items block the refund path.";
    }

    if (hasReason(result, RefundReasonCode.OutsideRefundWindow)) {
      return "Outside the standard refund window.";
    }

    return "Merchant policy blocks an automatic refund.";
  }

  if (hasReason(result, RefundReasonCode.HighValueOrderReviewRequired)) {
    return "High-value order crosses the merchant review threshold.";
  }

  if (
    hasReason(result, RefundReasonCode.PreFulfillmentCancellationReviewRequired)
  ) {
    return "Late unfulfilled order needs a human decision.";
  }

  if (hasReason(result, RefundReasonCode.PartialFulfillmentReviewRequired)) {
    return "Partially fulfilled order needs manual review.";
  }

  if (hasReason(result, RefundReasonCode.FinancialStatusReviewRequired)) {
    return "Payment status needs human review before refunding.";
  }

  return "A human reviewer needs to decide this refund.";
}

function formatRecommendedAction(result: CheckRefundEligibilityResult): string {
  switch (result.recommendedNextAction) {
    case RecommendedRefundAction.Approve:
      return result.evidence.fulfillmentStatus === "unfulfilled"
        ? "Approve the cancellation and refund flow."
        : "Approve the standard refund flow.";
    case RecommendedRefundAction.Deny:
      return "Decline the refund request with policy wording.";
    case RecommendedRefundAction.ManualReview:
      return "Escalate to a human reviewer before promising an outcome.";
  }
}

function formatPolicyLens(result: CheckRefundEligibilityResult): string {
  if (hasReason(result, RefundReasonCode.HighValueOrderReviewRequired)) {
    const threshold = result.evidence.highValueOrderThreshold;

    return threshold
      ? `High-value review threshold (${threshold.toFixed(2)})`
      : "High-value review threshold";
  }

  if (result.evidence.fulfillmentStatus === "unfulfilled") {
    return `${result.evidence.cancelWindowDays}-day cancellation and refund window`;
  }

  return `${result.evidence.refundWindowDays}-day refund window`;
}

function buildEvidence(
  result: CheckRefundEligibilityResult,
): DashboardOrder["evidence"] {
  const usesHighValueReview = hasReason(
    result,
    RefundReasonCode.HighValueOrderReviewRequired,
  );
  const items: DashboardOrder["evidence"] = [
    {
      label: "Order Age",
      value: `${result.evidence.orderAgeDays} days`,
    },
    {
      label:
        result.evidence.fulfillmentStatus === "unfulfilled"
          ? "Cancellation Window"
          : "Refund Window",
      value: `${
        result.evidence.fulfillmentStatus === "unfulfilled"
          ? result.evidence.cancelWindowDays
          : result.evidence.refundWindowDays
      } days`,
    },
    {
      label: "Financial Status",
      value: formatStatusLabel(result.evidence.financialStatus),
    },
    {
      label: "Fulfillment",
      value: formatStatusLabel(result.evidence.fulfillmentStatus),
    },
  ];

  if (
    usesHighValueReview &&
    result.evidence.highValueOrderThreshold !== undefined
  ) {
    items[1] = {
      label: "Order Total",
      value: formatCurrency(result.evidence.orderTotalAmount),
    };
    items[2] = {
      label: "Review Threshold",
      value: formatCurrency(result.evidence.highValueOrderThreshold),
    };
  }

  return items;
}

function buildTimeline(
  result: CheckRefundEligibilityResult,
): DashboardOrder["timeline"] {
  return [
    {
      title: "Refund check completed",
      detail: `Decision returned: ${formatStatusLabel(result.decision)}.`,
    },
    {
      title: "Recommended next step",
      detail: formatRecommendedAction(result),
    },
  ];
}

export function applyRefundEvaluationToOrder(
  order: DashboardOrder,
  result: CheckRefundEligibilityResult,
): DashboardOrder {
  return {
    ...order,
    decision: result.decision,
    reasonSummary: formatDecisionSummary(result),
    recommendedNextAction: formatRecommendedAction(result),
    lastUpdatedLabel: "Checked just now",
    policyWindowLabel: formatPolicyLens(result),
    reasonDetails: result.reasons.map((reason) => reason.message),
    evidence: buildEvidence(result),
    timeline: buildTimeline(result),
  };
}
