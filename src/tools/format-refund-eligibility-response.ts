import {
  RefundDecision,
  RefundReasonCode,
} from "../policy/refund-policy.types.js";
import type { CheckRefundEligibilityResult } from "./check-refund-eligibility.js";

export const REFUND_RESPONSE_COPY = {
  eligibleException:
    "This order can be refunded as an exception.",
  eligibleCancelableBeforeShipment:
    "This order can be canceled and refunded before shipment.",
  eligibleFinalSaleCancelableBeforeShipment:
    "This final-sale order can still be canceled and refunded before shipment.",
  eligibleStandard:
    "This order looks eligible for a refund.",
  ineligibleAlreadyRefunded:
    "This order should not be refunded again automatically.",
  ineligibleStandard:
    "This order should not be refunded automatically.",
  manualReviewAlreadyRefunded:
    "This order needs manual review before any refund decision is communicated.",
  manualReviewPreFulfillmentCancellation:
    "This unfulfilled order needs human review before a cancellation refund is approved.",
  manualReviewPreFulfillmentFinalSale:
    "This final-sale unfulfilled order needs human review before a cancellation refund is approved.",
  manualReviewPartialFulfillment:
    "This partially fulfilled order needs human review before any refund decision is approved.",
  manualReviewStandard:
    "This order should be routed to manual review.",
  followupNoteOverride:
    "Proceed carefully and note the override in your response.",
  followupPreFulfillmentCancellation:
    "You can proceed with the pre-fulfillment cancellation flow.",
  followupStandardRefund:
    "You can proceed with the standard refund flow.",
  followupAvoidSecondRefund:
    "Do not promise another refund.",
  followupReviewAlreadyRefunded:
    "Route this to a human reviewer instead of approving a second refund.",
  followupReviewPreFulfillmentCancellation:
    "Route this to a human reviewer instead of promising an automatic cancellation.",
  followupReviewStandard:
    "Route this to a human reviewer instead of approving or denying it in chat.",
} as const;

function hasReason(
  result: CheckRefundEligibilityResult,
  code: RefundReasonCode,
): boolean {
  return result.reasons.some((reason) => reason.code === code);
}

function summarizeReasons(result: CheckRefundEligibilityResult): string {
  return result.reasons.map((reason) => reason.message).join(" ");
}

function formatOpening(
  agentQuestion: string,
  result: CheckRefundEligibilityResult,
): string {
  const askedAsQuestion = agentQuestion.trim().endsWith("?");

  if (!askedAsQuestion) {
    return "";
  }

  switch (result.decision) {
    case RefundDecision.Eligible:
      return hasReason(result, RefundReasonCode.VipOverrideApplied)
        ? "Yes, as an exception."
        : "Yes.";
    case RefundDecision.Ineligible:
      return "No.";
    case RefundDecision.ManualReview:
      return "Not automatically.";
  }
}

export function formatRefundEligibilityResponse(
  agentQuestion: string,
  result: CheckRefundEligibilityResult,
): string {
  const opening = formatOpening(agentQuestion, result);
  const reasonSummary = summarizeReasons(result);

  switch (result.decision) {
    case RefundDecision.Eligible:
      if (hasReason(result, RefundReasonCode.VipOverrideApplied)) {
        return `${opening} ${REFUND_RESPONSE_COPY.eligibleException} ${reasonSummary} ${REFUND_RESPONSE_COPY.followupNoteOverride}`
          .trim();
      }

      if (hasReason(result, RefundReasonCode.CancelableBeforeFulfillment)) {
        return `${opening} ${REFUND_RESPONSE_COPY.eligibleCancelableBeforeShipment} ${reasonSummary} ${REFUND_RESPONSE_COPY.followupPreFulfillmentCancellation}`
          .trim();
      }

      if (hasReason(result, RefundReasonCode.FinalSaleUnfulfilledAllowed)) {
        return `${opening} ${REFUND_RESPONSE_COPY.eligibleFinalSaleCancelableBeforeShipment} ${reasonSummary} ${REFUND_RESPONSE_COPY.followupPreFulfillmentCancellation}`
          .trim();
      }

      if (hasReason(result, RefundReasonCode.UnfulfilledOutsideWindowAllowed)) {
        return `${opening} ${REFUND_RESPONSE_COPY.eligibleCancelableBeforeShipment} ${reasonSummary} ${REFUND_RESPONSE_COPY.followupPreFulfillmentCancellation}`
          .trim();
      }

      return `${opening} ${REFUND_RESPONSE_COPY.eligibleStandard} ${reasonSummary} ${REFUND_RESPONSE_COPY.followupStandardRefund}`
        .trim();
    case RefundDecision.Ineligible:
      if (hasReason(result, RefundReasonCode.AlreadyFullyRefunded)) {
        return `${opening} ${REFUND_RESPONSE_COPY.ineligibleAlreadyRefunded} ${reasonSummary} ${REFUND_RESPONSE_COPY.followupAvoidSecondRefund}`
          .trim();
      }

      return `${opening} ${REFUND_RESPONSE_COPY.ineligibleStandard} ${reasonSummary}`
        .trim();
    case RefundDecision.ManualReview:
      if (hasReason(result, RefundReasonCode.AlreadyFullyRefunded)) {
        return `${opening} ${REFUND_RESPONSE_COPY.manualReviewAlreadyRefunded} ${reasonSummary} ${REFUND_RESPONSE_COPY.followupReviewAlreadyRefunded}`
          .trim();
      }

      if (
        hasReason(
          result,
          RefundReasonCode.PreFulfillmentFinalSaleReviewRequired,
        )
      ) {
        return `${opening} ${REFUND_RESPONSE_COPY.manualReviewPreFulfillmentFinalSale} ${reasonSummary} ${REFUND_RESPONSE_COPY.followupReviewPreFulfillmentCancellation}`
          .trim();
      }

      if (
        hasReason(
          result,
          RefundReasonCode.PreFulfillmentCancellationReviewRequired,
        )
      ) {
        return `${opening} ${REFUND_RESPONSE_COPY.manualReviewPreFulfillmentCancellation} ${reasonSummary} ${REFUND_RESPONSE_COPY.followupReviewPreFulfillmentCancellation}`
          .trim();
      }

      if (
        hasReason(result, RefundReasonCode.PartialFulfillmentReviewRequired)
      ) {
        return `${opening} ${REFUND_RESPONSE_COPY.manualReviewPartialFulfillment} ${reasonSummary} ${REFUND_RESPONSE_COPY.followupReviewStandard}`
          .trim();
      }

      return `${opening} ${REFUND_RESPONSE_COPY.manualReviewStandard} ${reasonSummary} ${REFUND_RESPONSE_COPY.followupReviewStandard}`
        .trim();
  }
}
