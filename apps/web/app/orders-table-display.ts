import type {
  DashboardItemEvaluationViewModel,
  DashboardRefundEvaluationViewModel,
  RefundDecision,
} from "./mock-orders";
import { getDecisionLabel } from "./dashboard-helpers";

const decisionCountOrder: RefundDecision[] = [
  "eligible",
  "ineligible",
  "manual_review",
];

function formatDecisionCount(
  decision: RefundDecision,
  count: number,
): string {
  const label = getDecisionLabel(decision).toLowerCase();
  const itemLabel = count === 1 ? "item" : "items";

  return `${count} ${label} ${itemLabel}`;
}

function getItemDecisionCounts(
  itemEvaluations: DashboardItemEvaluationViewModel[] | undefined,
): Map<RefundDecision, number> {
  const counts = new Map<RefundDecision, number>();

  for (const itemEvaluation of itemEvaluations ?? []) {
    counts.set(
      itemEvaluation.decision,
      (counts.get(itemEvaluation.decision) ?? 0) + 1,
    );
  }

  return counts;
}

export function hasMixedItemDecisions(
  refundEvaluation: DashboardRefundEvaluationViewModel,
): boolean {
  return getItemDecisionCounts(refundEvaluation.itemEvaluations).size > 1;
}

export function getOrdersTableDecisionLabel(
  refundEvaluation: DashboardRefundEvaluationViewModel,
): string {
  const decisionLabel = getDecisionLabel(refundEvaluation.decision);

  if (!hasMixedItemDecisions(refundEvaluation)) {
    return decisionLabel;
  }

  return `${decisionLabel} · Mixed items`;
}

export function getOrdersTableItemDecisionSummary(
  refundEvaluation: DashboardRefundEvaluationViewModel,
): string | undefined {
  const counts = getItemDecisionCounts(refundEvaluation.itemEvaluations);

  if (counts.size <= 1) {
    return undefined;
  }

  return decisionCountOrder
    .flatMap((decision) => {
      const count = counts.get(decision);

      return count ? [formatDecisionCount(decision, count)] : [];
    })
    .join(", ");
}
