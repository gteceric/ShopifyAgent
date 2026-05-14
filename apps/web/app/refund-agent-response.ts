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

function hasMixedItemDecisions(result: CheckRefundEligibilityResult): boolean {
  const itemDecisions = result.itemEvaluations.map(
    (itemEvaluation) => itemEvaluation.decision,
  );

  return new Set(itemDecisions).size > 1;
}

function formatDecisionLabel(decision: RefundDecision): string {
  return decision.replace("_", " ");
}

function formatItemTitle(
  itemEvaluation: CheckRefundEligibilityResult["itemEvaluations"][number],
  index: number,
): string {
  return itemEvaluation.evidence.evaluatedLineItem.title ?? `Item ${index + 1}`;
}

function summarizeItemDecision(
  itemEvaluation: CheckRefundEligibilityResult["itemEvaluations"][number],
  index: number,
): string {
  const title = formatItemTitle(itemEvaluation, index);
  const decision = formatDecisionLabel(itemEvaluation.decision);
  const reasonSummary = itemEvaluation.reasons
    .map((reason) => reason.message)
    .join(" ");

  return `${title} is ${decision}: ${reasonSummary}`;
}

function summarizeMixedItemDecisions(
  result: CheckRefundEligibilityResult,
): string | undefined {
  if (!hasMixedItemDecisions(result)) {
    return undefined;
  }

  return `Item-level decisions: ${result.itemEvaluations
    .map((itemEvaluation, index) =>
      summarizeItemDecision(itemEvaluation, index),
    )
    .join(" ")}`;
}

export function formatMerchantRefundAgentResponse(
  question: string,
  result: CheckRefundEligibilityResult,
): string {
  const opening = formatOpening(question, result);
  const reasonSummary = result.reasons
    .map((reason) => reason.message)
    .join(" ");
  const itemDecisionSummary = summarizeMixedItemDecisions(result);
  const nextStep = formatNextStep(result);

  //filter(Boolean) remove falsy value like "", false, undefined, null, 0
  return [opening, reasonSummary, itemDecisionSummary, nextStep]
    .filter(Boolean)
    .join(" ")
    .trim();
}
