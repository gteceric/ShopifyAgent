import { z } from "zod";
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

export interface DashboardUrlState {
  search: string;
  decisionFilter: "all" | RefundDecision;
  ageFilter: AgeFilter;
  selectedOrderId: string;
}

type DashboardSearchParams = Record<string, string | string[] | undefined>;
type DashboardRawParam = string | string[] | undefined;

const DashboardDecisionFilterSchema = z.enum([
  "all",
  "eligible",
  "manual_review",
  "ineligible",
]);

const DashboardAgeFilterSchema = z.enum(["all", "recent", "aging", "stale"]);

const DashboardSingleParamSchema = z
  .union([z.string(), z.array(z.string()), z.undefined()])
  .transform((value) => (typeof value === "string" ? value : undefined));

const DashboardParsedSearchParamsSchema = z.object({
  search: DashboardSingleParamSchema.transform((value) => value ?? ""),
  decision: DashboardSingleParamSchema.pipe(DashboardDecisionFilterSchema.optional())
    .transform((value) => value ?? "all")
    .catch("all"),
  age: DashboardSingleParamSchema.pipe(DashboardAgeFilterSchema.optional())
    .transform((value) => value ?? "all")
    .catch("all"),
  orderId: DashboardSingleParamSchema.transform((value) => value ?? ""),
});

export const decisionPillClassName: Record<RefundDecision, string> = {
  eligible:
    "border border-emerald-900/10 bg-emerald-900/10 text-emerald-950",
  ineligible:
    "border border-orange-950/10 bg-orange-700/10 text-orange-950",
  manual_review:
    "border border-amber-950/10 bg-amber-500/15 text-amber-950",
};

export function normalizeDashboardSearchParams(
  searchParams: URLSearchParams,
): DashboardSearchParams {
  function getParam(key: string): DashboardRawParam {
    const values = searchParams.getAll(key);

    if (values.length === 0) {
      return undefined;
    }

    if (values.length === 1) {
      return values[0];
    }

    return values;
  }

  return {
    search: getParam("search"),
    decision: getParam("decision"),
    age: getParam("age"),
    orderId: getParam("orderId"),
  };
}

export function parseDashboardUrlState(
  searchParams: DashboardSearchParams,
  orders: DashboardOrder[],
): DashboardUrlState {
  const parsedSearchParams = DashboardParsedSearchParamsSchema.parse({
    search: searchParams.search,
    decision: searchParams.decision,
    age: searchParams.age,
    orderId: searchParams.orderId,
  });

  return {
    search: parsedSearchParams.search,
    decisionFilter: parsedSearchParams.decision,
    ageFilter: parsedSearchParams.age,
    selectedOrderId: orders.some(
      (order) => order.id === parsedSearchParams.orderId,
    )
      ? parsedSearchParams.orderId
      : orders[0]?.id ?? "",
  };
}

export function buildDashboardSearchParams(
  currentSearchParams: URLSearchParams,
  state: DashboardUrlState,
  defaultOrderId: string,
): string {
  const nextSearchParams = new URLSearchParams(currentSearchParams.toString());

  if (state.search.trim().length > 0) {
    nextSearchParams.set("search", state.search);
  } else {
    nextSearchParams.delete("search");
  }

  if (state.decisionFilter !== "all") {
    nextSearchParams.set("decision", state.decisionFilter);
  } else {
    nextSearchParams.delete("decision");
  }

  if (state.ageFilter !== "all") {
    nextSearchParams.set("age", state.ageFilter);
  } else {
    nextSearchParams.delete("age");
  }

  if (
    state.selectedOrderId.length > 0 &&
    state.selectedOrderId !== defaultOrderId
  ) {
    nextSearchParams.set("orderId", state.selectedOrderId);
  } else {
    nextSearchParams.delete("orderId");
  }

  return nextSearchParams.toString();
}

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

export function selectActiveOrder(
  orders: DashboardOrder[],
  selectedOrderId: string,
): DashboardOrder | null {
  return orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null;
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
