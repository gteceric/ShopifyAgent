import type { DashboardOrder, RefundDecision } from "./mock-orders";

export const DECISION_OPTIONS: Array<{
  value: "all" | RefundDecision;
  label: string;
}> = [
  { value: "all", label: "All decisions" },
  { value: "eligible", label: "Eligible" },
  { value: "manual_review", label: "Manual review" },
  { value: "ineligible", label: "Ineligible" },
];

export const AGE_OPTIONS = [
  { value: "all", label: "Any age" },
  { value: "recent", label: "0-30 days" },
  { value: "aging", label: "31-90 days" },
  { value: "stale", label: "91+ days" },
] as const;

export type AgeFilter = (typeof AGE_OPTIONS)[number]["value"];

export const decisionPillClassName: Record<RefundDecision, string> = {
  eligible:
    "border border-emerald-900/10 bg-emerald-900/10 text-emerald-950",
  ineligible:
    "border border-orange-950/10 bg-orange-700/10 text-orange-950",
  manual_review:
    "border border-amber-950/10 bg-amber-500/15 text-amber-950",
};

export function getDecisionLabel(decision: RefundDecision): string {
  switch (decision) {
    case "eligible":
      return "Eligible";
    case "ineligible":
      return "Ineligible";
    case "manual_review":
      return "Manual Review";
  }
}

export function matchesAgeFilter(
  order: DashboardOrder,
  ageFilter: AgeFilter,
): boolean {
  if (ageFilter === "all") {
    return true;
  }

  if (ageFilter === "recent") {
    return order.orderAgeDays <= 30;
  }

  if (ageFilter === "aging") {
    return order.orderAgeDays > 30 && order.orderAgeDays <= 90;
  }

  return order.orderAgeDays > 90;
}

export function filterOrders(
  orders: DashboardOrder[],
  search: string,
  decisionFilter: "all" | RefundDecision,
  ageFilter: AgeFilter,
): DashboardOrder[] {
  const normalizedSearch = search.trim().toLowerCase();

  return orders.filter((order) => {
    const matchesSearch =
      normalizedSearch.length === 0 ||
      order.orderName.toLowerCase().includes(normalizedSearch) ||
      order.customerName.toLowerCase().includes(normalizedSearch) ||
      order.id.toLowerCase().includes(normalizedSearch);

    const matchesDecision =
      decisionFilter === "all" || order.decision === decisionFilter;

    return matchesSearch && matchesDecision && matchesAgeFilter(order, ageFilter);
  });
}

export function getSummary(orders: DashboardOrder[]) {
  return {
    total: orders.length,
    eligibleCount: orders.filter((order) => order.decision === "eligible")
      .length,
    manualReviewCount: orders.filter(
      (order) => order.decision === "manual_review",
    ).length,
    blockedCount: orders.filter((order) => order.decision === "ineligible")
      .length,
  };
}
