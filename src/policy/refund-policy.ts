import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "./refund-policy.types.js";
import type {
  RefundPolicyConfig,
  RefundPolicyEvidence,
  RefundPolicyFlags,
  RefundPolicyInput,
  RefundReason,
  RefundPolicyResult,
} from "./refund-policy.types.js";

const DEFAULT_POLICY: Required<RefundPolicyConfig> = {
  refundWindowDays: 30,
  cancelWindowDays: 30,
  finalSaleUnfulfilledDecision: RefundDecision.Ineligible,
  unfulfilledOutsideWindowDecision: RefundDecision.ManualReview,
  alreadyFullyRefundedDecision: RefundDecision.Ineligible,
};

const REFUND_POLICY_REASON_COPY = {
  manualReviewRequired: "Order is flagged for manual review.",
  partialFulfillmentReviewRequired:
    "Order is partially fulfilled, so it requires human review before a refund decision is approved.",
  partialRefundReviewRequired:
    "Order has already been partially refunded, so it requires human review before any additional refund is approved.",
  alreadyFullyRefundedReview:
    "Order has already been fully refunded and requires manual review.",
  alreadyFullyRefunded:
    "Order has already been fully refunded.",
  finalSaleUnavailableForRefund:
    "All items on the order are marked final sale.",
  finalSaleUnfulfilledAllowed:
    "Order is marked final sale, but merchant policy allows cancellation before shipment.",
  preFulfillmentFinalSaleReviewRequired:
    "Order is marked final sale and unfulfilled, so it requires human review before a cancellation refund is approved.",
  vipOverrideFinalSale:
    "VIP override allows a refund even though all items are final sale.",
  returnableFulfillmentsUnavailable:
    "No returnable fulfillments were found for this order.",
  vipOverrideWithoutReturnableFulfillments:
    "VIP override allows a refund without returnable fulfillments.",
  cancelableBeforeFulfillment:
    "Order has not been fulfilled yet, so it can be canceled before shipment.",
  unfulfilledOutsideWindowAllowed:
    "Order has not been fulfilled yet, and merchant policy allows cancellation outside the standard cancellation window.",
  returnableFulfillmentsAvailable:
    "Order has returnable fulfillments available.",
} as const;

function withinRefundWindowMessage(refundWindowDays: number): string {
  return `Order is within the ${refundWindowDays}-day refund window.`;
}

function outsideRefundWindowMessage(refundWindowDays: number): string {
  return `Order is outside the ${refundWindowDays}-day refund window.`;
}

function withinCancelWindowMessage(cancelWindowDays: number): string {
  return `Order is within the ${cancelWindowDays}-day cancellation window.`;
}

function outsideCancelWindowMessage(cancelWindowDays: number): string {
  return `Order is outside the ${cancelWindowDays}-day cancellation window.`;
}

function vipOverrideOutsideRefundWindowMessage(refundWindowDays: number): string {
  return `VIP override allows a refund outside the ${refundWindowDays}-day refund window.`;
}

function preFulfillmentCancellationReviewRequiredMessage(
  cancelWindowDays: number,
): string {
  return `Order is unfulfilled but older than the ${cancelWindowDays}-day cancellation window and requires human review.`;
}

function normalizeFlags(
  flags?: RefundPolicyFlags,
): Required<RefundPolicyFlags> {
  return {
    fraudHold: flags?.fraudHold ?? false,
    manualReview: flags?.manualReview ?? false,
    vipOverride: flags?.vipOverride ?? false,
  };
}

function makeReason(code: RefundReasonCode, message: string): RefundReason {
  return { code, message };
}

export function evaluateRefundPolicy(
  input: RefundPolicyInput,
  config: RefundPolicyConfig = DEFAULT_POLICY,
): RefundPolicyResult {
  const effectiveConfig: Required<RefundPolicyConfig> = {
    ...DEFAULT_POLICY,
    ...config,
  };
  const flags = normalizeFlags(input.flags);
  const isUnfulfilledOrder =
    input.fulfillmentStatus === FulfillmentStatus.Unfulfilled;
  const isPartiallyFulfilledOrder =
    input.fulfillmentStatus === FulfillmentStatus.Partial;
  const isPartiallyRefundedOrder =
    input.financialStatus === FinancialStatus.PartiallyRefunded;
  const isUnfulfilledFinalSaleOrder =
    isUnfulfilledOrder && input.allItemsFinalSale && !flags.vipOverride;
  const evidence: RefundPolicyEvidence = {
    orderAgeDays: input.orderAgeDays,
    refundWindowDays: effectiveConfig.refundWindowDays,
    cancelWindowDays: effectiveConfig.cancelWindowDays,
    financialStatus: input.financialStatus,
    fulfillmentStatus: input.fulfillmentStatus,
    hasReturnableFulfillments: input.hasReturnableFulfillments,
    alreadyFullyRefunded: input.alreadyFullyRefunded,
    allItemsFinalSale: input.allItemsFinalSale,
    flags,
  };
  const reviewReasons: RefundReason[] = [];
  const blockingReasons: RefundReason[] = [];
  const overrideReasons: RefundReason[] = [];

  if (flags.fraudHold || flags.manualReview) {
    reviewReasons.push(
      makeReason(
        RefundReasonCode.ManualReviewRequired,
        REFUND_POLICY_REASON_COPY.manualReviewRequired,
      ),
    );

    return {
      decision: RefundDecision.ManualReview,
      reasons: reviewReasons,
      evidence,
    };
  }

  if (isPartiallyFulfilledOrder) {
    reviewReasons.push(
      makeReason(
        RefundReasonCode.PartialFulfillmentReviewRequired,
        REFUND_POLICY_REASON_COPY.partialFulfillmentReviewRequired,
      ),
    );

    return {
      decision: RefundDecision.ManualReview,
      reasons: reviewReasons,
      evidence,
    };
  }

  if (isPartiallyRefundedOrder) {
    reviewReasons.push(
      makeReason(
        RefundReasonCode.PartialRefundReviewRequired,
        REFUND_POLICY_REASON_COPY.partialRefundReviewRequired,
      ),
    );

    return {
      decision: RefundDecision.ManualReview,
      reasons: reviewReasons,
      evidence,
    };
  }

  if (input.alreadyFullyRefunded) {
    if (
      effectiveConfig.alreadyFullyRefundedDecision ===
      RefundDecision.ManualReview
    ) {
      reviewReasons.push(
        makeReason(
          RefundReasonCode.AlreadyFullyRefunded,
          REFUND_POLICY_REASON_COPY.alreadyFullyRefundedReview,
        ),
      );

      return {
        decision: RefundDecision.ManualReview,
        reasons: reviewReasons,
        evidence,
      };
    }

    blockingReasons.push(
      makeReason(
        RefundReasonCode.AlreadyFullyRefunded,
        REFUND_POLICY_REASON_COPY.alreadyFullyRefunded,
      ),
    );
  }

  if (isUnfulfilledFinalSaleOrder) {
    switch (effectiveConfig.finalSaleUnfulfilledDecision) {
      case RefundDecision.Eligible:
        overrideReasons.push(
          makeReason(
            RefundReasonCode.FinalSaleUnfulfilledAllowed,
            REFUND_POLICY_REASON_COPY.finalSaleUnfulfilledAllowed,
          ),
        );
        break;
      case RefundDecision.ManualReview:
        reviewReasons.push(
          makeReason(
            RefundReasonCode.PreFulfillmentFinalSaleReviewRequired,
            REFUND_POLICY_REASON_COPY.preFulfillmentFinalSaleReviewRequired,
          ),
        );

        return {
          decision: RefundDecision.ManualReview,
          reasons: reviewReasons,
          evidence,
        };
      case RefundDecision.Ineligible:
        blockingReasons.push(
          makeReason(
            RefundReasonCode.FinalSaleUnavailableForRefund,
            REFUND_POLICY_REASON_COPY.finalSaleUnavailableForRefund,
          ),
        );
        break;
    }
  } else if (input.allItemsFinalSale && !flags.vipOverride) {
    blockingReasons.push(
      makeReason(
        RefundReasonCode.FinalSaleUnavailableForRefund,
        REFUND_POLICY_REASON_COPY.finalSaleUnavailableForRefund,
      ),
    );
  } else if (input.allItemsFinalSale && flags.vipOverride) {
    overrideReasons.push(
      makeReason(
        RefundReasonCode.VipOverrideApplied,
        REFUND_POLICY_REASON_COPY.vipOverrideFinalSale,
      ),
    );
  }

  if (
    isUnfulfilledOrder &&
    input.orderAgeDays > effectiveConfig.cancelWindowDays &&
    !flags.vipOverride
  ) {
    switch (effectiveConfig.unfulfilledOutsideWindowDecision) {
      case RefundDecision.Eligible:
        return {
          decision: RefundDecision.Eligible,
          reasons: [
            makeReason(
              RefundReasonCode.UnfulfilledOutsideWindowAllowed,
              REFUND_POLICY_REASON_COPY.unfulfilledOutsideWindowAllowed,
            ),
            makeReason(
              RefundReasonCode.OutsideCancelWindow,
              outsideCancelWindowMessage(effectiveConfig.cancelWindowDays),
            ),
          ],
          evidence,
        };
      case RefundDecision.Ineligible:
        blockingReasons.push(
          makeReason(
            RefundReasonCode.OutsideCancelWindow,
            outsideCancelWindowMessage(effectiveConfig.cancelWindowDays),
          ),
        );
        break;
      case RefundDecision.ManualReview:
        reviewReasons.push(
          makeReason(
            RefundReasonCode.PreFulfillmentCancellationReviewRequired,
            preFulfillmentCancellationReviewRequiredMessage(
              effectiveConfig.cancelWindowDays,
            ),
          ),
        );

        return {
          decision: RefundDecision.ManualReview,
          reasons: reviewReasons,
          evidence,
        };
    }
  }

  if (
    input.orderAgeDays > effectiveConfig.refundWindowDays &&
    !flags.vipOverride
  ) {
    blockingReasons.push(
      makeReason(
        RefundReasonCode.OutsideRefundWindow,
        outsideRefundWindowMessage(effectiveConfig.refundWindowDays),
      ),
    );
  } else if (
    input.orderAgeDays > effectiveConfig.refundWindowDays &&
    flags.vipOverride
  ) {
    overrideReasons.push(
      makeReason(
        RefundReasonCode.VipOverrideApplied,
        vipOverrideOutsideRefundWindowMessage(effectiveConfig.refundWindowDays),
      ),
    );
  }

  if (
    !isUnfulfilledOrder &&
    !input.hasReturnableFulfillments &&
    !flags.vipOverride
  ) {
    blockingReasons.push(
      makeReason(
        RefundReasonCode.ReturnableFulfillmentsUnavailable,
        REFUND_POLICY_REASON_COPY.returnableFulfillmentsUnavailable,
      ),
    );
  } else if (
    !isUnfulfilledOrder &&
    !input.hasReturnableFulfillments &&
    flags.vipOverride
  ) {
    overrideReasons.push(
      makeReason(
        RefundReasonCode.VipOverrideApplied,
        REFUND_POLICY_REASON_COPY.vipOverrideWithoutReturnableFulfillments,
      ),
    );
  }

  if (blockingReasons.length > 0) {
    return {
      decision: RefundDecision.Ineligible,
      reasons: blockingReasons,
      evidence,
    };
  }

  return {
    decision: RefundDecision.Eligible,
    reasons:
      overrideReasons.length > 0
        ? overrideReasons.slice(0, 1)
        : isUnfulfilledOrder
          ? [
            makeReason(
              RefundReasonCode.WithinCancelWindow,
              withinCancelWindowMessage(effectiveConfig.cancelWindowDays),
            ),
            makeReason(
              RefundReasonCode.CancelableBeforeFulfillment,
              REFUND_POLICY_REASON_COPY.cancelableBeforeFulfillment,
            ),
          ]
        : [
            makeReason(
              RefundReasonCode.WithinRefundWindow,
              withinRefundWindowMessage(effectiveConfig.refundWindowDays),
            ),
            makeReason(
              RefundReasonCode.ReturnableFulfillmentsAvailable,
              REFUND_POLICY_REASON_COPY.returnableFulfillmentsAvailable,
            ),
          ],
    evidence,
  };
}

export { DEFAULT_POLICY };
