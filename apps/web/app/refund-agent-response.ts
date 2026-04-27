import {
  RecommendedRefundAction,
  RefundDecision,
  type CheckRefundEligibilityResult,
} from "@shopify-agent/core";

function formatOpening(
  question: string,
  result: CheckRefundEligibilityResult,
): string {
  if (!question.trim().endsWith("?")) {
    return "";
  }

  switch (result.decision) {
    case RefundDecision.Eligible:
      return "Yes.";
    case RefundDecision.Ineligible:
      return "No.";
    case RefundDecision.ManualReview:
      return "Not automatically.";
  }
}

function formatNextStep(result: CheckRefundEligibilityResult): string {
  switch (result.recommendedNextAction) {
    case RecommendedRefundAction.Approve:
      return "Next step: approve the refund flow.";
    case RecommendedRefundAction.Deny:
      return "Next step: decline the refund request with policy wording.";
    case RecommendedRefundAction.ManualReview:
      return "Next step: route this case to a human reviewer.";
  }
}

export function formatMerchantRefundAgentResponse(
  question: string,
  result: CheckRefundEligibilityResult,
): string {
  const opening = formatOpening(question, result);
  const reasonSummary = result.reasons
    .map((reason) => reason.message)
    .join(" ");
  const nextStep = formatNextStep(result);

  //filter(Boolean) remove falsy value like "", false, undefined, null, 0
  return [opening, reasonSummary, nextStep].filter(Boolean).join(" ").trim();
}
