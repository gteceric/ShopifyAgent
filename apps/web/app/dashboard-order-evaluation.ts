import {
  createPolicyConfig,
  FinancialStatus,
  FulfillmentStatus,
  ManualReviewKind,
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
  type ShopifyOrderSummary,
} from "@shopify-agent/core";
import type {
  CheckRefundEligibilityResult,
  RefundPolicyConfig,
} from "@shopify-agent/core";
import type {
  DashboardItemEvaluationViewModel,
  DashboardOrder,
  DashboardRefundEvaluationViewModel,
  RefundDecision as DashboardRefundDecision,
} from "./mock-orders";

export interface DashboardOrderErrorState {
  orderId: string;
  message: string;
}

// Merchant refund policy should eventually be loaded from merchant-owned
// settings storage. For now, keep the same policy-loading boundary but source
// it from env-backed config so local merchant settings affect the dashboard.
export async function loadMerchantRefundPolicyConfig(): Promise<RefundPolicyConfig> {
  return createPolicyConfig();
}

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

function formatMoney(value?: {
  amount: string;
  currencyCode: string;
}): string | undefined {
  if (!value) {
    return undefined;
  }

  const numericAmount = Number(value.amount);

  if (!Number.isFinite(numericAmount)) {
    return `${value.amount} ${value.currencyCode}`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: value.currencyCode,
  }).format(numericAmount);
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
): DashboardRefundDecision {
  if (
    order.financialStatus === FinancialStatus.Refunded ||
    order.financialStatus === FinancialStatus.RefundPending
  ) {
    return "ineligible";
  }

  if (
    order.financialStatus === FinancialStatus.PaymentPending ||
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
    base: {
      id: order.id,
      orderName: order.name,
      customerName: order.customerName,
      createdAtLabel: formatCreatedAtLabel(order.createdAt),
      orderAgeDays,
      orderTotalLabel: formatCurrency(order.totalAmount),
      financialStatus: formatStatusLabel(order.financialStatus),
      fulfillmentStatus: formatStatusLabel(order.fulfillmentStatus),
    },
    refundEvaluation: {
      decision: getInitialDecision(order),
      reasonSummary:
        "Live refund posture will be loaded from the policy engine.",
      recommendedNextAction:
        "Open the order to inspect the latest refund guidance.",
      lastUpdatedLabel: "Awaiting live refund check",
      policyWindowLabel:
        order.fulfillmentStatus === FulfillmentStatus.Unfulfilled
          ? "Cancellation and refund policy"
          : "Refund policy",
      reasonDetails: [
        "This row was loaded from the current order feed.",
        "The latest refund posture is layered on top of the live order context.",
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
          detail:
            "This order came from the latest order feed available to the workspace.",
        },
        {
          title: "Refund check pending",
          detail:
            "Refund guidance will refresh during the current server evaluation cycle.",
        },
      ],
    },
  };
}

function hasReason(
  result: CheckRefundEligibilityResult,
  code: RefundReasonCode,
): boolean {
  return result.policyResult.reasons.some((reason) => reason.code === code);
}

function formatDecisionSummary(result: CheckRefundEligibilityResult): string {
  const policyResult = result.policyResult;
  const evaluatedOrder = policyResult.evidence.evaluatedOrder;

  if (policyResult.decision === RefundDecision.Eligible) {
    if (result.exceptionAvailable) {
      return "Refund allowed through an active exception path.";
    }

    if (evaluatedOrder.fulfillmentStatus === "unfulfilled") {
      return "Unfulfilled order can be canceled and refunded normally.";
    }

    return "Inside the refund window with no policy blockers.";
  }

  if (policyResult.decision === RefundDecision.Ineligible) {
    if (hasReason(result, RefundReasonCode.RefundPending)) {
      return "Refund is already pending in Shopify.";
    }

    if (hasReason(result, RefundReasonCode.AlreadyFullyRefunded)) {
      return "Order has already been fully refunded.";
    }

    if (hasReason(result, RefundReasonCode.FinalSaleUnavailableForRefund)) {
      return "Final-sale items block the refund path.";
    }

    if (hasReason(result, RefundReasonCode.ReturnableFulfillmentsUnavailable)) {
      return "No returnable fulfillment is available for this order.";
    }

    if (hasReason(result, RefundReasonCode.OutsideRefundWindow)) {
      return "Outside the standard refund window.";
    }

    return "Merchant policy blocks an automatic refund.";
  }

  if (policyResult.manualReviewKind === ManualReviewKind.MixedItem) {
    if (hasReason(result, RefundReasonCode.RefundPending)) {
      return "A refund is processing in Shopify for part of this order.";
    }

    return "Mixed item eligibility requires human review.";
  }

  // Priority list for the one-line manual-review summary shown in the dashboard.
  const manualReviewSummaries = [
    {
      reasonCode: RefundReasonCode.HighValueOrderReviewRequired,
      summary: "High-value order crosses the merchant review threshold.",
    },
    {
      reasonCode: RefundReasonCode.PreFulfillmentCancellationReviewRequired,
      summary: "Late unfulfilled order needs a human decision.",
    },
    {
      reasonCode: RefundReasonCode.PartialFulfillmentReviewRequired,
      summary: "Partially fulfilled order needs manual review.",
    },
    {
      reasonCode: RefundReasonCode.FinancialStatusReviewRequired,
      summary: "Payment status needs human review before refunding.",
    },
  ];
  const matchedSummary = manualReviewSummaries.find((item) =>
    hasReason(result, item.reasonCode),
  );

  if (matchedSummary) {
    return matchedSummary.summary;
  }

  return "A human reviewer needs to decide this refund.";
}

function formatRecommendedAction(result: CheckRefundEligibilityResult): string {
  const policyResult = result.policyResult;
  const evaluatedOrder = policyResult.evidence.evaluatedOrder;

  switch (result.recommendedNextAction) {
    case RecommendedRefundAction.Approve:
      return evaluatedOrder.fulfillmentStatus === "unfulfilled"
        ? "Approve the cancellation and refund flow."
        : "Approve the standard refund flow.";
    case RecommendedRefundAction.RefundPending:
      return "Refund pending in Shopify. Do not create another refund yet.";
    case RecommendedRefundAction.NoActionNeeded:
      return "No further refund action is needed.";
    case RecommendedRefundAction.Deny:
      if (
        hasReason(result, RefundReasonCode.ReturnableFulfillmentsUnavailable)
      ) {
        return "Review the Shopify order timeline before attempting another refund.";
      }

      return "Decline the refund request with policy wording.";
    case RecommendedRefundAction.ManualReview:
      switch (policyResult.manualReviewKind) {
        case ManualReviewKind.MixedItem:
          if (hasReason(result, RefundReasonCode.RefundPending)) {
            return "Review item-level status before creating another refund.";
          }
          return "Review item-level eligibility before promising an outcome.";
        case ManualReviewKind.HardReason:
        default:
          return "Escalate to a human reviewer before promising an outcome.";
      }
  }
}

function formatPolicyLens(result: CheckRefundEligibilityResult): string {
  const policyResult = result.policyResult;
  const policyContext = policyResult.evidence.policyContext;
  const evaluatedOrder = policyResult.evidence.evaluatedOrder;

  if (hasReason(result, RefundReasonCode.HighValueOrderReviewRequired)) {
    const threshold = policyContext.highValueOrderThreshold;

    return threshold
      ? `High-value review threshold (${threshold.toFixed(2)})`
      : "High-value review threshold";
  }

  if (evaluatedOrder.fulfillmentStatus === "unfulfilled") {
    return `${policyContext.effectiveCancelWindowDays}-day cancellation and refund window`;
  }

  return `${policyContext.effectiveRefundWindowDays}-day refund window`;
}

function buildEvidence(
  result: CheckRefundEligibilityResult,
): DashboardRefundEvaluationViewModel["evidence"] {
  const policyResult = result.policyResult;
  const orderEvidence = policyResult.evidence.order;
  const policyContext = policyResult.evidence.policyContext;
  const evaluatedOrder = policyResult.evidence.evaluatedOrder;
  const usesHighValueReview = hasReason(
    result,
    RefundReasonCode.HighValueOrderReviewRequired,
  );
  const items: DashboardRefundEvaluationViewModel["evidence"] = [
    {
      label: "Order Age",
      value: `${orderEvidence.ageDays} days`,
    },
    {
      label:
        evaluatedOrder.fulfillmentStatus === "unfulfilled"
          ? "Cancellation Window"
          : "Refund Window",
      value: `${
        evaluatedOrder.fulfillmentStatus === "unfulfilled"
          ? policyContext.effectiveCancelWindowDays
          : policyContext.effectiveRefundWindowDays
      } days`,
    },
    {
      label: "Financial Status",
      value: formatStatusLabel(evaluatedOrder.effectiveFinancialStatus),
    },
    {
      label: "Fulfillment",
      value: formatStatusLabel(evaluatedOrder.fulfillmentStatus),
    },
  ];

  if (
    usesHighValueReview &&
    policyContext.highValueOrderThreshold !== undefined
  ) {
    items[1] = {
      label: "Order Total",
      value: formatCurrency(orderEvidence.totalAmount),
    };
    items[2] = {
      label: "Review Threshold",
      value: formatCurrency(policyContext.highValueOrderThreshold),
    };
  }

  return items;
}

function formatBooleanLabel(value: boolean): string {
  return value ? "Yes" : "No";
}

function buildItemEvaluationViewModels(
  result: CheckRefundEligibilityResult,
): DashboardItemEvaluationViewModel[] {
  const policyResult = result.policyResult;

  return policyResult.itemEvaluations.map((itemEvaluation, index) => {
    const lineItem = itemEvaluation.evidence.evaluatedLineItem;
    const itemTitle = lineItem.title ?? `Line item ${index + 1}`;
    const reasonSummary = itemEvaluation.reasons
      .map((reason) => reason.message)
      .join(" ");
    const evidence: Array<{ label: string; value: string }> = [
      {
        label: "Fulfillment",
        value: formatStatusLabel(lineItem.fulfillmentStatus),
      },
      {
        label: "Financial Status",
        value: formatStatusLabel(lineItem.effectiveFinancialStatus),
      },
      {
        label: "Returnable Qty",
        value: lineItem.returnableQuantity.toString(),
      },
      ...(lineItem.pendingRefundQuantity !== undefined
        ? [
            {
              label: "Pending Refund Qty",
              value: lineItem.pendingRefundQuantity.toString(),
            },
          ]
        : []),
      {
        label: "Returnable Fulfillment",
        value: formatBooleanLabel(lineItem.hasReturnableFulfillment),
      },
      {
        label: "Already Refunded",
        value: formatBooleanLabel(lineItem.lineItemAlreadyRefunded),
      },
      {
        label: "Final Sale",
        value: formatBooleanLabel(lineItem.finalSale),
      },
      {
        label: "Age",
        value: `${lineItem.ageDays} days`,
      },
    ];

    if (lineItem.category) {
      evidence.push({
        label: "Category",
        value: lineItem.category,
      });
    }

    return {
      lineItemId: lineItem.lineItemId,
      title: itemTitle,
      ...(lineItem.sku ? { sku: lineItem.sku } : {}),
      ...(lineItem.variantTitle ? { variantTitle: lineItem.variantTitle } : {}),
      ...(lineItem.variantOptions
        ? { variantOptions: lineItem.variantOptions }
        : {}),
      ...(lineItem.imageUrl ? { imageUrl: lineItem.imageUrl } : {}),
      ...(lineItem.imageAltText ? { imageAltText: lineItem.imageAltText } : {}),
      ...(formatMoney(lineItem.unitPrice)
        ? { unitPriceLabel: formatMoney(lineItem.unitPrice) }
        : {}),
      decision: itemEvaluation.decision,
      returnableQuantity: lineItem.returnableQuantity,
      ...(lineItem.pendingRefundQuantity !== undefined
        ? { pendingRefundQuantity: lineItem.pendingRefundQuantity }
        : {}),
      reasonSummary,
      evidence,
    };
  });
}

function buildTimeline(
  result: CheckRefundEligibilityResult,
): DashboardRefundEvaluationViewModel["timeline"] {
  const policyResult = result.policyResult;

  return [
    {
      title: "Refund check completed",
      detail: `Decision returned: ${formatStatusLabel(policyResult.decision)}.`,
    },
    {
      title: "Recommended next step",
      detail: formatRecommendedAction(result),
    },
  ];
}

// Convert refund eligibility result to dashboard view model
export function applyRefundEvaluationToOrder(
  order: DashboardOrder,
  result: CheckRefundEligibilityResult,
): DashboardOrder {
  const policyResult = result.policyResult;

  return {
    ...order,
    refundEvaluation: {
      decision: policyResult.decision,
      reasonSummary: formatDecisionSummary(result),
      recommendedNextAction: formatRecommendedAction(result),
      lastUpdatedLabel: "Checked just now",
      policyWindowLabel: formatPolicyLens(result),
      reasonDetails: policyResult.reasons.map((reason) => reason.message),
      evidence: buildEvidence(result),
      itemEvaluations: buildItemEvaluationViewModels(result),
      timeline: buildTimeline(result),
    },
  };
}
